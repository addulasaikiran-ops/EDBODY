from datetime import datetime, timezone
from uuid import UUID

import pytest
from pydantic import ValidationError

from edbody_backend.audit import AccessAuditEvent
from edbody_backend.governance import (
    AccessDecision,
    AccessPrincipal,
    ConsentGrant,
    evaluate_access,
)

ACTOR = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
SUBJECT = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
OTHER_SUBJECT = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
CONSENT = UUID("dddddddd-dddd-4ddd-8ddd-dddddddddddd")
REQUEST = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")
EVENT = UUID("ffffffff-ffff-4fff-8fff-ffffffffffff")
RESOURCE = UUID("12121212-1212-4212-8212-121212121212")
NOW = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)


def principal(*roles: str) -> AccessPrincipal:
    return AccessPrincipal(
        principal_reference=str(ACTOR),
        roles=list(roles),
    )


def grant(**overrides: object) -> ConsentGrant:
    payload: dict[str, object] = {
        "consent_reference": str(CONSENT),
        "subject_reference": str(SUBJECT),
        "status": "active",
        "permitted_actions": ["read_observation", "read_imaging", "run_experiment"],
        "permitted_purposes": ["research"],
        "effective_at": "2026-01-01T00:00:00Z",
        "expires_at": "2027-01-01T00:00:00Z",
        "revoked_at": None,
        "recorded_at": "2025-12-15T10:00:00Z",
        "recorded_by_reference": str(ACTOR),
        "policy_version": "v1",
    }
    payload.update(overrides)
    return ConsentGrant.model_validate(payload)


def decide(
    *,
    who: AccessPrincipal | None = None,
    consent: ConsentGrant | None = None,
    action: str = "read_observation",
    purpose: str = "research",
    subject: UUID = SUBJECT,
    at: datetime = NOW,
) -> AccessDecision:
    return evaluate_access(
        principal=who or principal("researcher"),
        grant=consent if consent is not None else grant(),
        action=action,  # type: ignore[arg-type]
        purpose=purpose,  # type: ignore[arg-type]
        subject_reference=subject,
        now=at,
    )


def test_active_in_scope_consent_allows_matching_role() -> None:
    result = decide()

    assert result.allowed is True
    assert result.reason == "authorized"
    assert result.policy_version == "v1"


def test_missing_consent_fails_closed() -> None:
    result = evaluate_access(
        principal=principal("researcher"),
        grant=None,
        action="read_observation",
        purpose="research",
        subject_reference=SUBJECT,
        now=NOW,
    )

    assert result.allowed is False
    assert result.reason == "missing_consent"


def test_role_not_permitted_is_denied_even_with_consent() -> None:
    result = decide(who=principal("data_steward"), action="run_experiment")

    assert result.allowed is False
    assert result.reason == "role_not_permitted"


def test_subject_mismatch_is_denied() -> None:
    result = decide(subject=OTHER_SUBJECT)

    assert result.allowed is False
    assert result.reason == "subject_mismatch"


@pytest.mark.parametrize(
    ("status", "revoked_at", "expected_reason"),
    [
        ("pending", None, "consent_not_active"),
        ("revoked", "2026-10-01T00:00:00Z", "consent_not_active"),
    ],
)
def test_pending_and_revoked_consent_are_denied(
    status: str, revoked_at: str | None, expected_reason: str
) -> None:
    result = decide(consent=grant(status=status, revoked_at=revoked_at))

    assert result.allowed is False
    assert result.reason == expected_reason


def test_consent_not_yet_effective_is_denied() -> None:
    future_grant = grant(effective_at="2026-11-01T00:00:00Z")
    result = decide(consent=future_grant)

    assert result.allowed is False
    assert result.reason == "consent_not_yet_effective"


def test_expired_consent_is_denied_at_expiry_boundary() -> None:
    expired_grant = grant(expires_at="2026-10-20T12:00:00Z")
    result = decide(consent=expired_grant)

    assert result.allowed is False
    assert result.reason == "consent_expired"


def test_action_outside_consent_scope_is_denied() -> None:
    result = decide(who=principal("clinician"), action="write_observation")

    assert result.allowed is False
    assert result.reason == "action_not_granted"


def test_purpose_outside_consent_scope_is_denied() -> None:
    result = decide(purpose="treatment")

    assert result.allowed is False
    assert result.reason == "purpose_not_granted"


def test_unauthorized_export_is_denied_for_researcher() -> None:
    export_grant = grant(permitted_actions=["export_data"])
    result = decide(who=principal("researcher"), consent=export_grant, action="export_data")

    assert result.allowed is False
    assert result.reason == "role_not_permitted"


def test_unaware_evaluation_clock_is_rejected() -> None:
    with pytest.raises(ValueError, match="now must be timezone-aware"):
        decide(at=datetime(2026, 10, 20, 12, 0))


def test_duplicate_roles_are_rejected() -> None:
    with pytest.raises(ValidationError, match="roles must not contain duplicates"):
        principal("researcher", "researcher")


def test_revoked_grant_requires_revocation_timestamp() -> None:
    with pytest.raises(ValidationError, match="revoked_at is required"):
        grant(status="revoked", revoked_at=None)


def test_revocation_timestamp_is_only_allowed_for_revoked_status() -> None:
    with pytest.raises(ValidationError, match="revoked_at must be null"):
        grant(status="active", revoked_at="2026-10-01T00:00:00Z")


def test_grant_rejects_epoch_timestamp_and_reversed_expiry() -> None:
    with pytest.raises(ValidationError, match="ISO 8601 string with an explicit UTC offset"):
        grant(effective_at=1_767_225_600)

    with pytest.raises(ValidationError, match="expires_at must be later"):
        grant(expires_at="2025-01-01T00:00:00Z")


def audit_event(**overrides: object) -> AccessAuditEvent:
    payload: dict[str, object] = {
        "event_reference": str(EVENT),
        "occurred_at": "2026-10-20T12:00:00Z",
        "request_reference": str(REQUEST),
        "actor_reference": str(ACTOR),
        "subject_reference": str(SUBJECT),
        "action": "read_observation",
        "purpose": "research",
        "decision": "allow",
        "reason": "authorized",
        "consent_reference": str(CONSENT),
        "resource_reference": str(RESOURCE),
        "policy_version": "v1",
    }
    payload.update(overrides)
    return AccessAuditEvent.model_validate(payload)


def test_audit_event_accepts_minimal_allowed_decision() -> None:
    event = audit_event()

    assert event.decision == "allow"
    assert event.reason == "authorized"
    assert event.consent_reference == CONSENT


def test_allowed_audit_event_requires_consent_reference() -> None:
    with pytest.raises(ValidationError, match="must reference the consent grant"):
        audit_event(consent_reference=None)


def test_allowed_audit_event_requires_authorized_reason() -> None:
    with pytest.raises(ValidationError, match="reason must be 'authorized'"):
        audit_event(reason="missing_consent")


def test_denied_audit_event_cannot_claim_authorized_reason() -> None:
    with pytest.raises(ValidationError, match="must not be 'authorized'"):
        audit_event(decision="deny", consent_reference=None)


def test_audit_contract_rejects_extra_fields_and_is_immutable() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        audit_event(raw_health_values={"glucose": 92})

    event = audit_event()
    with pytest.raises(ValidationError):
        event.decision = "deny"  # type: ignore[misc]


def test_audit_timestamp_rejects_naive_value() -> None:
    with pytest.raises(ValidationError, match="explicit UTC offset"):
        audit_event(occurred_at="2026-10-20T12:00:00")
