"""Fail-closed authorization and consent policy primitives for EDBODY.

These policies are not yet wired to HTTP routes or an identity provider.
They establish testable decision rules before governed storage is introduced.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, Field, field_validator, model_validator

from .schemas import ContractModel, require_explicit_iso_timestamp

Role = Literal["clinician", "researcher", "data_steward"]
ProtectedAction = Literal[
    "read_observation",
    "read_imaging",
    "write_observation",
    "export_data",
    "run_experiment",
]
DataPurpose = Literal["treatment", "research", "quality_improvement"]
ConsentStatus = Literal["pending", "active", "revoked"]

DecisionReason = Literal[
    "authorized",
    "role_not_permitted",
    "missing_consent",
    "subject_mismatch",
    "consent_not_active",
    "consent_not_yet_effective",
    "consent_expired",
    "action_not_granted",
    "purpose_not_granted",
]

# Proposed default roles for the prototype. An institution must review and
# configure its own roles and policies before any real patient data is used.
_ROLE_ACTIONS: dict[Role, frozenset[ProtectedAction]] = {
    "clinician": frozenset(
        {"read_observation", "read_imaging", "write_observation", "run_experiment"}
    ),
    "researcher": frozenset(
        {"read_observation", "read_imaging", "run_experiment"}
    ),
    "data_steward": frozenset(
        {"read_observation", "read_imaging", "write_observation", "export_data"}
    ),
}


class AccessPrincipal(ContractModel):
    """An authenticated identity placeholder with explicit assigned roles.

    This object does not authenticate the caller. It must only be constructed
    by a future trusted identity adapter, never directly from request JSON.
    """

    principal_reference: str = Field(min_length=1, max_length=512)
    roles: tuple[Role, ...] = Field(min_length=0, max_length=3)

    @field_validator("roles")
    @classmethod
    def roles_must_be_unique(cls, value: tuple[Role, ...]) -> tuple[Role, ...]:
        if len(set(value)) != len(value):
            raise ValueError("roles must not contain duplicates")
        return value


class ConsentGrant(ContractModel):
    """A versioned, scoped consent grant used by the policy evaluator."""

    schema_version: Literal["v1"] = "v1"
    consent_reference: UUID
    subject_reference: UUID
    status: ConsentStatus
    permitted_actions: tuple[ProtectedAction, ...] = Field(min_length=1, max_length=5)
    permitted_purposes: tuple[DataPurpose, ...] = Field(min_length=1, max_length=3)
    effective_at: AwareDatetime
    expires_at: AwareDatetime | None = None
    revoked_at: AwareDatetime | None = None
    recorded_at: AwareDatetime
    recorded_by_reference: UUID
    policy_version: Literal["v1"] = "v1"

    @field_validator("effective_at", "expires_at", "revoked_at", "recorded_at", mode="before")
    @classmethod
    def timestamp_requires_explicit_iso_offset(cls, value: object) -> object:
        return require_explicit_iso_timestamp(value)

    @model_validator(mode="after")
    def validate_grant_lifecycle(self) -> "ConsentGrant":
        if len(set(self.permitted_actions)) != len(self.permitted_actions):
            raise ValueError("permitted_actions must not contain duplicates")
        if len(set(self.permitted_purposes)) != len(self.permitted_purposes):
            raise ValueError("permitted_purposes must not contain duplicates")
        if self.expires_at is not None and self.expires_at <= self.effective_at:
            raise ValueError("expires_at must be later than effective_at")
        if self.status == "revoked" and self.revoked_at is None:
            raise ValueError("revoked_at is required when consent status is 'revoked'")
        if self.status != "revoked" and self.revoked_at is not None:
            raise ValueError("revoked_at must be null unless consent status is 'revoked'")
        if self.revoked_at is not None and self.revoked_at < self.effective_at:
            raise ValueError("revoked_at must not precede effective_at")
        return self


class AccessDecision(ContractModel):
    """A deterministic policy result, suitable for later audit event linkage."""

    allowed: bool
    reason: DecisionReason
    policy_version: Literal["v1"] = "v1"


def evaluate_access(
    *,
    principal: AccessPrincipal,
    grant: ConsentGrant | None,
    action: ProtectedAction,
    purpose: DataPurpose,
    subject_reference: UUID,
    now: datetime,
) -> AccessDecision:
    """Evaluate a request without side effects; any uncertainty denies access.

    Authentication, source of roles, grant retrieval, and audit persistence are
    deliberately separate and must be supplied by future trusted adapters.
    """
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be timezone-aware; implicit time zones are not allowed")

    if not any(action in _ROLE_ACTIONS[role] for role in principal.roles):
        return AccessDecision(allowed=False, reason="role_not_permitted")

    if grant is None:
        return AccessDecision(allowed=False, reason="missing_consent")

    if grant.subject_reference != subject_reference:
        return AccessDecision(allowed=False, reason="subject_mismatch")

    if grant.status != "active":
        return AccessDecision(allowed=False, reason="consent_not_active")

    if now < grant.effective_at:
        return AccessDecision(allowed=False, reason="consent_not_yet_effective")

    if grant.expires_at is not None and now >= grant.expires_at:
        return AccessDecision(allowed=False, reason="consent_expired")

    if action not in grant.permitted_actions:
        return AccessDecision(allowed=False, reason="action_not_granted")

    if purpose not in grant.permitted_purposes:
        return AccessDecision(allowed=False, reason="purpose_not_granted")

    return AccessDecision(allowed=True, reason="authorized")
