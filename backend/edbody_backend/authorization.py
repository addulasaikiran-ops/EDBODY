"""FastAPI dependency for enforcing access, consent, and required auditing.

Configured encrypted persistent storage is used for consent lookup and audit
append. Missing/unavailable storage fails closed; no patient-data route exists.
"""
from __future__ import annotations

from datetime import datetime, timezone
import sqlite3
from typing import Protocol
from uuid import UUID, uuid4

from fastapi import Depends, HTTPException, status

from .audit import AccessAuditEvent, AppendOnlyAuditSink
from .auth import get_current_principal
from .storage import SQLiteGovernanceStore, StorageConfigurationError
from .governance import (
    AccessDecision,
    AccessPrincipal,
    ConsentGrant,
    DataPurpose,
    ProtectedAction,
    evaluate_access,
)


class ConsentGrantRepository(Protocol):
    """Trusted, server-side source of effective consent grants."""

    def get_effective_grant(
        self, *, subject_reference: UUID, now: datetime
    ) -> ConsentGrant | None:
        """Load the authoritative grant for this subject and current instant."""
        ...


def get_consent_grant_repository() -> ConsentGrantRepository:
    """Return the configured persistent store; fail closed when absent."""
    try:
        return SQLiteGovernanceStore.from_environment()
    except (StorageConfigurationError, OSError, sqlite3.Error) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "consent_store_unavailable"},
        ) from exc


def get_audit_sink() -> AppendOnlyAuditSink:
    """Return the configured durable audit sink; fail closed when absent."""
    try:
        return SQLiteGovernanceStore.from_environment()
    except (StorageConfigurationError, OSError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "audit_sink_unavailable"},
        ) from exc


def require_authorized_action(
    *,
    action: ProtectedAction,
    purpose: DataPurpose,
):
    """Create a dependency that denies unless identity, consent, and audit pass.

    A protected route should declare this dependency for its fixed action and
    purpose. The requested subject is a route parameter; role and consent are
    never accepted as caller-authored claims. An audit event must be appended
    before an allowed handler can run.
    """

    def _enforce(
        subject_reference: UUID,
        principal: AccessPrincipal = Depends(get_current_principal),
        repository: ConsentGrantRepository = Depends(get_consent_grant_repository),
        audit_sink: AppendOnlyAuditSink = Depends(get_audit_sink),
    ) -> AccessDecision:
        now = datetime.now(timezone.utc)
        try:
            grant = repository.get_effective_grant(
                subject_reference=subject_reference,
                now=now,
            )
        except Exception as exc:
            # Fail closed for a missing/unavailable/invalid consent store.
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "consent_store_unavailable"},
            ) from exc

        decision = evaluate_access(
            principal=principal,
            grant=grant,
            action=action,
            purpose=purpose,
            subject_reference=subject_reference,
            now=now,
        )

        event = AccessAuditEvent(
            event_reference=uuid4(),
            occurred_at=now.isoformat().replace("+00:00", "Z"),
            request_reference=uuid4(),
            actor_reference=principal.principal_reference,
            subject_reference=subject_reference,
            action=action,
            purpose=purpose,
            decision="allow" if decision.allowed else "deny",
            reason=decision.reason,
            consent_reference=grant.consent_reference if grant is not None else None,
            policy_version=decision.policy_version,
        )
        try:
            audit_sink.append(event)
        except Exception as exc:
            # Never run the protected handler if an allow/deny decision was
            # not durably written by the configured audit implementation.
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "audit_sink_unavailable"},
            ) from exc

        if not decision.allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": decision.reason,
                    "policy_version": decision.policy_version,
                },
            )
        return decision

    return _enforce
