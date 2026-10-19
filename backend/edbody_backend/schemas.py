"""Versioned input contracts for synthetic scientific observations.

These models define a future data boundary only. They are not exposed by the
HTTP API, do not store data, and do not prove consent or validate a clinical
measurement.
"""
from __future__ import annotations

import re
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    AnyUrl,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    FiniteFloat,
    field_validator,
    model_validator,
)

# A serialization guard against obviously malformed magnitudes, not a
# physiological range or a clinical decision threshold.
MAX_ABS_NUMERIC_VALUE = 1_000_000_000_000.0


def require_explicit_iso_timestamp(value: object) -> object:
    """Reject epoch numbers and timestamp strings without an explicit offset."""
    if value is None:
        return value
    if (
        not isinstance(value, str)
        or "T" not in value
        or re.search(r"(?:Z|[+-][0-9]{2}:[0-9]{2})$", value) is None
    ):
        raise ValueError(
            "timestamp must be an ISO 8601 string with an explicit UTC offset "
            "(for example, '2026-01-15T09:30:00+05:30' or a trailing 'Z')"
        )
    return value


NumericValue = Annotated[
    FiniteFloat,
    Field(ge=-MAX_ABS_NUMERIC_VALUE, le=MAX_ABS_NUMERIC_VALUE, strict=True),
]


class ContractModel(BaseModel):
    """Base class for strict, immutable data contracts."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        str_strip_whitespace=True,
    )


class ObservationCode(ContractModel):
    """A coded observation concept; coding systems are preserved as supplied."""

    system: AnyUrl
    code: str = Field(min_length=1, max_length=128, pattern=r"^\S+$")
    display: str | None = Field(default=None, min_length=1, max_length=256)


class UnitCode(ContractModel):
    """Explicit UCUM unit identity; this contract does not convert units."""

    system: Literal["http://unitsofmeasure.org"]
    code: str = Field(min_length=1, max_length=32, pattern=r"^\S+$")
    display: str | None = Field(default=None, min_length=1, max_length=64)


class Missingness(ContractModel):
    """An explicit reason a numeric measurement is unavailable."""

    reason: Literal[
        "not_collected",
        "below_detection_limit",
        "not_applicable",
        "withheld",
        "source_error",
        "unknown",
    ]
    note: str | None = Field(default=None, min_length=1, max_length=500)


class Provenance(ContractModel):
    """Where the observation came from and optional source/derivation links."""

    source_type: Literal[
        "laboratory",
        "clinical_record",
        "device",
        "manual_entry",
        "research_dataset",
        "derived",
    ]
    source_system: str = Field(min_length=1, max_length=128)
    source_record_reference: UUID | None = None
    source_recorded_at: AwareDatetime | None = None
    derived_from: tuple[UUID, ...] = Field(default_factory=tuple, max_length=100)
    derivation_description: str | None = Field(default=None, min_length=1, max_length=500)

    @field_validator("source_recorded_at", mode="before")
    @classmethod
    def source_timestamp_requires_explicit_offset(cls, value: object) -> object:
        return require_explicit_iso_timestamp(value)

    @model_validator(mode="after")
    def derived_observation_has_lineage(self) -> "Provenance":
        if self.source_type == "derived":
            if not self.derived_from:
                raise ValueError(
                    "derived_from must contain at least one observation reference "
                    "when source_type is 'derived'"
                )
            if not self.derivation_description:
                raise ValueError(
                    "derivation_description is required when source_type is 'derived'"
                )
        return self


class GovernanceReferences(ContractModel):
    """Opaque IDs to future consent and authorization records, not proof of them."""

    consent_reference: UUID
    authorization_reference: UUID


class ObservationV1(ContractModel):
    """Version 1 numeric observation contract.

    Every timestamp must include a UTC offset. Unknown values must be encoded
    explicitly with value=null, unit=null, and a missingness reason. This model
    accepts numeric observations only; categorical values require a future,
    separately versioned contract.
    """

    schema_version: Literal["v1"]
    observation_reference: UUID
    subject_reference: UUID
    code: ObservationCode
    value: NumericValue | None
    unit: UnitCode | None
    missingness: Missingness | None = None
    observed_at: AwareDatetime
    provenance: Provenance
    quality_status: Literal["accepted", "flagged", "rejected"]
    quality_note: str | None = Field(default=None, min_length=1, max_length=500)
    governance: GovernanceReferences

    @field_validator("observed_at", mode="before")
    @classmethod
    def observation_timestamp_requires_explicit_offset(cls, value: object) -> object:
        return require_explicit_iso_timestamp(value)

    @model_validator(mode="after")
    def value_unit_and_missingness_are_consistent(self) -> "ObservationV1":
        if self.value is None:
            if self.unit is not None:
                raise ValueError(
                    "unit must be null when value is null; do not infer a unit "
                    "for a missing measurement"
                )
            if self.missingness is None:
                raise ValueError(
                    "missingness is required when value is null; explain why the "
                    "measurement is unavailable"
                )
        else:
            if self.unit is None:
                raise ValueError(
                    "unit is required for a numeric value; EDBODY will not guess "
                    "or convert units"
                )
            if self.missingness is not None:
                raise ValueError(
                    "missingness must be null when a numeric value is present"
                )

        if self.quality_status in {"flagged", "rejected"} and not self.quality_note:
            raise ValueError(
                "quality_note is required when quality_status is 'flagged' or 'rejected'"
            )
        return self
