# Scientific observation contract (M2)

**Status:** Implemented as a tested schema contract; not exposed through the HTTP API and not connected to Electron.

## Contract

```python
from edbody_backend.schemas import ObservationV1
```

`ObservationV1` represents one numeric observation and includes:

- `schema_version` set explicitly to `v1`, observation and opaque subject references, and a coded concept.
- A numeric value and an explicit UCUM unit identity, or `value: null`, `unit: null`, and a structured missingness reason.
- An observation timestamp with a UTC offset. Optional source-record timestamps must also include an offset. The schema never supplies the current time or guesses a time zone.
- Provenance: source type/system, optional opaque source reference, and parent observation references plus a derivation description for derived data.
- A quality state. `flagged` and `rejected` records require a quality note.
- Opaque consent and authorization reference UUIDs for future linkage.

Contracts reject unknown fields and require the caller to choose the schema version. Coded concepts require an absolute URL and a non-empty, whitespace-free code. Unit identity must use the UCUM system URL and a non-empty, whitespace-free unit token. The current implementation does **not** perform full UCUM validation or convert values between units; values and units are preserved as submitted.

A broad absolute numeric limit of 1e12 is only a serialization/malformed-input guard. It is **not** a physiological range, reference interval, outlier detector, or clinical decision threshold. Clinical plausibility checks must be defined for a particular measurement, population, method, and unit before a later model uses them.

## Synthetic fixtures and tests

`backend/tests/fixtures/observation_v1_valid.json` and `observation_v1_missing_value.json` contain synthetic, fabricated identifiers and a sample measurement. They are software-contract examples, not patient data and not evidence of scientific validity.

Run them with the rest of the backend tests:

```sh
cd backend
python -m pip install -e ".[dev]"
python -m pytest -q
```

Tests cover valid and explicitly missing measurements, timestamp offsets, required units, ambiguous unit strings, numeric bounds, quality notes, schema versioning, unknown fields, and provenance lineage.

## Explicit non-capabilities

- No observation or patient-data HTTP endpoint is added in M2.
- These schemas do not store records, authenticate callers, authorize access, verify consent, or create audit trails.
- UUID references are placeholders for future governed records; they do not establish that consent or access permission exists.
- The contract is numeric-only. Categorical observations, device-specific payloads, reference-range semantics, unit conversion, source-specific parsers, and clinical plausibility rules require separately designed contracts and tests.
- Do not submit real patient data to the current prototype.
