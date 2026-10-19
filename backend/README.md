# EDBODY research backend (scaffold)

This is the initial Python API foundation for EDBODY. It exposes only a health endpoint. It is **not connected to Electron**, has no patient-record endpoints or persistence, and contains no physiological or clinical model.

## Run locally

Requirements: Python 3.11 or newer. Python 3.12 is used in CI.

From this directory:

```sh
python -m venv .venv
```

Activate the environment:

- Windows PowerShell: `.venv\\Scripts\\Activate.ps1`
- macOS/Linux: `source .venv/bin/activate`

Then run:

```sh
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
python -m pytest -q
python -m uvicorn edbody_backend.main:app --host 127.0.0.1 --port 8765
```

Open `http://127.0.0.1:8765/health` to see the service status. Interactive API documentation is available at `http://127.0.0.1:8765/docs` while the local server is running.

The server binds to loopback in these instructions; do not change it to a network interface or expose it to a hospital network until authentication, authorization, request limits, auditability, deployment controls and a security review are in place.

## Current routes

- `GET /health`: process health and explicit capability flags only.

No patient data is accepted or stored. A healthy API process does **not** imply that any scientific model is available or validated.

## Typed scientific-data contract (M2)

`edbody_backend.schemas.ObservationV1` defines a strict, versioned schema for **numeric observations only**. It captures coded concepts, explicit units, timezone-aware timestamps, provenance, missingness, quality state, and opaque consent/authorization reference IDs. Synthetic contract fixtures and positive/negative tests live in `tests/fixtures/` and `tests/test_observation_contract.py`.

The contract is deliberately **not an HTTP route**, does not persist data or verify permissions, and must not be used with real patient data. It does not convert units or fully validate UCUM unit semantics. Read [the contract specification](../docs/SCIENTIFIC-DATA-CONTRACTS.md) for its exact guarantees and limits.
