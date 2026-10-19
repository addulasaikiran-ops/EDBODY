from datetime import datetime, timezone
from uuid import UUID

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from edbody_backend.audit import AccessAuditEvent
from edbody_backend.authorization import (
    get_audit_sink,
    get_consent_grant_repository,
    require_authorized_action,
)
from edbody_backend.auth import get_current_principal
from edbody_backend.governance import AccessDecision, AccessPrincipal, ConsentGrant

ACTOR = "https://identity.example.test|researcher-123"
SUBJECT = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
OTHER_SUBJECT = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
CONSENT = UUID("dddddddd-dddd-4ddd-8ddd-dddddddddddd")


def active_grant(**overrides: object) -> ConsentGrant:
    values: dict[str, object] = {
        "consent_reference": str(CONSENT),
        "subject_reference": str(SUBJECT),
        "status": "active",
        "permitted_actions": ["read_observation", "read_imaging", "run_experiment"],
        "permitted_purposes": ["research"],
        "effective_at": "2026-01-01T00:00:00Z",
        "expires_at": "2027-01-01T00:00:00Z",
        "recorded_at": "2025-12-15T10:00:00Z",
        "recorded_by_reference": str(UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")),
    }
    values.update(overrides)
    return ConsentGrant.model_validate(values)


class FakeConsentRepository:
    def __init__(self, grant: ConsentGrant | None) -> None:
        self.grant = grant

    def get_effective_grant(
        self, *, subject_reference: UUID, now: datetime
    ) -> ConsentGrant | None:
        return self.grant


class MemoryAuditSink:
    def __init__(self) -> None:
        self.events: list[AccessAuditEvent] = []

    def append(self, event: AccessAuditEvent) -> None:
        self.events.append(event)


class FailingAuditSink:
    def append(self, event: AccessAuditEvent) -> None:
        raise OSError("synthetic audit storage failure")


def build_client(
    *,
    grant: ConsentGrant | None,
    roles: tuple[str, ...] = ("researcher",),
    sink: object | None = None,
    action: str = "read_observation",
    override_repository: bool = True,
    handler_calls: list[bool] | None = None,
) -> tuple[TestClient, MemoryAuditSink | FailingAuditSink]:
    app = FastAPI()
    app.dependency_overrides[get_current_principal] = lambda: AccessPrincipal(
        principal_reference=ACTOR,
        roles=roles,
    )

    repository = FakeConsentRepository(grant)
    if override_repository:
        app.dependency_overrides[get_consent_grant_repository] = lambda: repository

    audit_sink = sink or MemoryAuditSink()
    app.dependency_overrides[get_audit_sink] = lambda: audit_sink

    @app.get("/protected")
    def protected(
        _decision: AccessDecision = Depends(
            require_authorized_action(
                action=action,  # type: ignore[arg-type]
                purpose="research",
            )
        ),
    ) -> dict[str, bool]:
        if handler_calls is not None:
            handler_calls.append(True)
        return {"access_granted": True}

    return TestClient(app), audit_sink  # type: ignore[return-value]


def test_authorized_route_audits_allow_before_handler() -> None:
    client, sink = build_client(grant=active_grant())

    response = client.get("/protected", params={"subject_reference": str(SUBJECT)})

    assert response.status_code == 200
    assert response.json() == {"access_granted": True}
    assert len(sink.events) == 1
    assert sink.events[0].decision == "allow"
    assert sink.events[0].reason == "authorized"
    assert sink.events[0].actor_reference == ACTOR


def test_missing_consent_is_denied_and_audited() -> None:
    client, sink = build_client(grant=None)

    response = client.get("/protected", params={"subject_reference": str(SUBJECT)})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "missing_consent"
    assert len(sink.events) == 1
    assert sink.events[0].decision == "deny"


def test_wrong_subject_is_denied_and_audited() -> None:
    client, sink = build_client(grant=active_grant())

    response = client.get(
        "/protected", params={"subject_reference": str(OTHER_SUBJECT)}
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "subject_mismatch"
    assert sink.events[0].reason == "subject_mismatch"


def test_request_cannot_upgrade_its_role_using_a_query_parameter() -> None:
    client, sink = build_client(
        grant=active_grant(permitted_actions=["write_observation"]),
        action="write_observation",
    )

    response = client.get(
        "/protected",
        params={"subject_reference": str(SUBJECT), "roles": "clinician"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "role_not_permitted"
    assert sink.events[0].decision == "deny"


def test_audit_failure_prevents_protected_handler_from_running() -> None:
    handler_calls: list[bool] = []
    client, sink = build_client(
        grant=active_grant(),
        sink=FailingAuditSink(),
        handler_calls=handler_calls,
    )

    response = client.get("/protected", params={"subject_reference": str(SUBJECT)})

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "audit_sink_unavailable"
    assert handler_calls == []


def test_missing_consent_store_fails_closed() -> None:
    client, _sink = build_client(
        grant=active_grant(),
        override_repository=False,
    )

    response = client.get("/protected", params={"subject_reference": str(SUBJECT)})

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "consent_store_unavailable"
