import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from edbody_backend.schemas import ObservationV1, Provenance

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def test_valid_synthetic_observation_preserves_value_unit_and_time() -> None:
    observation = ObservationV1.model_validate(
        load_fixture("observation_v1_valid.json")
    )

    assert observation.schema_version == "v1"
    assert observation.value == 92.0
    assert observation.unit is not None
    assert observation.unit.code == "mg/dL"
    assert observation.observed_at.utcoffset() is not None
    assert observation.quality_status == "accepted"


def test_missing_measurement_fixture_requires_explicit_missingness() -> None:
    observation = ObservationV1.model_validate(
        load_fixture("observation_v1_missing_value.json")
    )

    assert observation.value is None
    assert observation.unit is None
    assert observation.missingness is not None
    assert observation.missingness.reason == "not_collected"
    assert observation.quality_status == "flagged"


def test_naive_observation_timestamp_is_rejected() -> None:
    payload = load_fixture("observation_v1_valid.json")
    payload["observed_at"] = "2026-01-15T09:30:00"

    with pytest.raises(ValidationError, match="timezone|offset|aware"):
        ObservationV1.model_validate(payload)


def test_missing_numeric_unit_is_rejected_instead_of_guessed() -> None:
    payload = load_fixture("observation_v1_valid.json")
    payload["unit"] = None

    with pytest.raises(ValidationError, match="unit is required"):
        ObservationV1.model_validate(payload)


def test_missing_value_requires_explicit_reason_and_null_unit() -> None:
    payload = load_fixture("observation_v1_valid.json")
    payload["value"] = None
    payload["unit"] = None
    payload["missingness"] = None

    with pytest.raises(ValidationError, match="missingness is required"):
        ObservationV1.model_validate(payload)


def test_missing_value_must_not_retain_a_unit() -> None:
    payload = load_fixture("observation_v1_valid.json")
    payload["value"] = None
    payload["missingness"] = {"reason": "not_collected"}

    with pytest.raises(ValidationError, match="unit must be null"):
        ObservationV1.model_validate(payload)


def test_unit_system_must_be_explicit_ucum() -> None:
    payload = load_fixture("observation_v1_valid.json")
    payload["unit"]["system"] = "http://example.org/units"

    with pytest.raises(ValidationError, match="unitsofmeasure.org"):
        ObservationV1.model_validate(payload)


def test_whitespace_in_a_coded_value_is_rejected_as_ambiguous() -> None:
    payload = load_fixture("observation_v1_valid.json")
    payload["unit"]["code"] = "mg per dL"

    with pytest.raises(ValidationError, match="string_pattern_mismatch|pattern"):
        ObservationV1.model_validate(payload)


@pytest.mark.parametrize(
    "value",
    [float("nan"), float("inf"), float("-inf"), 1_000_000_000_001.0],
)
def test_nonfinite_or_out_of_protocol_range_value_is_rejected(value: float) -> None:
    payload = load_fixture("observation_v1_valid.json")
    payload["value"] = value

    with pytest.raises(ValidationError):
        ObservationV1.model_validate(payload)


def test_flagged_or_rejected_observation_requires_quality_note() -> None:
    payload = load_fixture("observation_v1_valid.json")
    payload["quality_status"] = "flagged"
    payload["quality_note"] = None

    with pytest.raises(ValidationError, match="quality_note is required"):
        ObservationV1.model_validate(payload)


def test_unrecognized_schema_version_is_rejected() -> None:
    payload = load_fixture("observation_v1_valid.json")
    payload["schema_version"] = "v9"

    with pytest.raises(ValidationError):
        ObservationV1.model_validate(payload)


def test_unexpected_fields_are_rejected() -> None:
    payload = load_fixture("observation_v1_valid.json")
    payload["patient_name"] = "must-not-be-added"

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        ObservationV1.model_validate(payload)


def test_derived_provenance_requires_lineage() -> None:
    payload = load_fixture("observation_v1_valid.json")["provenance"]
    payload["source_type"] = "derived"
    payload["derived_from"] = []

    with pytest.raises(ValidationError, match="derived_from must contain"):
        Provenance.model_validate(payload)



def test_derived_provenance_requires_method_description() -> None:
    payload = load_fixture("observation_v1_valid.json")["provenance"]
    payload["source_type"] = "derived"
    payload["derived_from"] = ["11111111-1111-4111-8111-111111111111"]
    payload["derivation_description"] = None

    with pytest.raises(ValidationError, match="derivation_description is required"):
        Provenance.model_validate(payload)


def test_numeric_string_is_rejected_instead_of_coerced() -> None:
    payload = load_fixture("observation_v1_valid.json")
    payload["value"] = "92.0"

    with pytest.raises(ValidationError):
        ObservationV1.model_validate(payload)
