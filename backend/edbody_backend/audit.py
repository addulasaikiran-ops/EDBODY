"""Audit-event contract for governed EDBODY access decisions.

This module defines immutable events and the future sink interface only. It
does not yet write to durable storage, provide tamper evidence, or claim that
an append-only audit trail is operational.
"""
from __future__ import annotations

from typing import Literal, Protocol
from uuid import UUID

from pydantic import AwareDatetime, Field, field_validator, model_validator

from .governance import DataPurpose, DecisionReason, ProtectedAction
from .schemas import ContractModel, require_explicit_iso_timestamp


class AccessAuditEvent(ContractModel):
    """Minimal event for an access allow/deny decision; never include health values."""

    schema_version: Literal["v1"] = "v1"
    event_reference: UUID
    occurred_at: AwareDatetime
    request_reference: UUID
    actor_reference: str = Field(min_length=1, max_length=512)
    subject_reference: UUID
    action: ProtectedAction
    purpose: DataPurpose
    decision: Literal["allow", "deny"]
    reason: DecisionReason
    consent_reference: UUID | None = None
    resource_reference: UUID | None = None
    policy_version: Literal["v1"] = "v1"

    @field_validator("occurred_at", mode="before")
    @classmethod
    def event_time_requires_explicit_iso_offset(cls, value: object) -> object:
        return require_explicit_iso_timestamp(value)

    @model_validator(mode="after")
    def decision_reason_and_consent_must_match(self) -> "AccessAuditEvent":
        if self.decision == "allow":
            if self.reason != "authorized":
                raise ValueError("allowed event reason must be 'authorized'")
            if self.consent_reference is None:
                raise ValueError("allowed access events must reference the consent grant")
        else:
            if self.reason == "authorized":
                raise ValueError("denied event reason must not be 'authorized'")
        return self


class AppendOnlyAuditSink(Protocol):
    """Required interface for a future durable, tamper-evident audit sink.

    An implementation must guarantee durable append, preserve event ordering,
    prevent caller-controlled update/delete, and define behavior when auditing
    fails. No concrete sink is provided in this milestone.
    """

    def append(self, event: AccessAuditEvent) -> None:
        """Persist one immutable access decision event or raise on failure."""
        ...
