# EDBODY research backend (scaffold)

This is the initial Python API foundation for EDBODY. It exposes a health endpoint and a protected OIDC session-introspection route. It is **not connected to Electron**, has no patient-record endpoints or persistence, and contains no physiological or clinical model.

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

- `GET /health`: public process health and capability flags only.
- `GET /v1/security/session`: requires a valid, configured JWT access token and returns the caller's recognized EDBODY role names only.

No patient data is accepted or stored. A healthy API process does **not** imply that any scientific model is available or validated.

## Typed scientific-data contract (M2)

`edbody_backend.schemas.ObservationV1` defines a strict, versioned schema for **numeric observations only**. It captures coded concepts, explicit units, timezone-aware timestamps, provenance, missingness, quality state, and opaque consent/authorization reference IDs. Synthetic contract fixtures and positive/negative tests live in `tests/fixtures/` and `tests/test_observation_contract.py`.

The contract is deliberately **not an HTTP route**, does not persist data or verify permissions, and must not be used with real patient data. It does not convert units or fully validate UCUM unit semantics. Read [the contract specification](../docs/SCIENTIFIC-DATA-CONTRACTS.md) for its exact guarantees and limits.


## Security and governance foundation (M3, partial)

- `edbody_backend.governance` contains a pure authorization decision function and a versioned consent-grant contract. It denies access when roles, subject, consent state, action, purpose or timing do not match.
- `edbody_backend.audit` defines an immutable audit-event contract and an interface for a future append-only sink.
- Tests use only fabricated UUIDs and synthetic values.

The OIDC verifier and `/v1/security/session` route are active only when configured with a trusted provider. There are **no protected patient-data routes**, no configured identity provider, no authoritative consent store, and no durable audit sink. The reusable authorization dependency is tested with synthetic adapters but is not attached to a production data route. `AccessPrincipal` must only be constructed from the verified identity dependency or another trusted internal adapter, never from untrusted request content. See [authentication/authorization](../docs/AUTHENTICATION-AUTHORIZATION.md) and the [security/privacy/governance baseline](../docs/SECURITY-PRIVACY-GOVERNANCE.md).

Do not submit real patient data. Do not bind the service to a network interface or expose it beyond a developer's loopback environment.


## OIDC authentication (M3, partial)

Configure the backend process environment with `EDBODY_OIDC_ISSUER`, `EDBODY_OIDC_AUDIENCE`, and `EDBODY_OIDC_JWKS_URL`. Optionally set `EDBODY_OIDC_ROLE_CLAIM` if the trusted provider uses a different top-level claim than `roles`. Issuer and JWKS URLs must be HTTPS; the verifier accepts RS256 JWT access tokens with `typ=at+jwt` or `application/at+jwt`, and validates signature, issuer, audience, expiry and required RFC 9068 claims.

The backend does not perform interactive sign-in or configure an institutional provider for you. The Electron application implements a provider-configurable system-browser Authorization Code + PKCE flow; see [Desktop Authentication](../docs/DESKTOP-AUTHENTICATION.md) for its environment variables and provider requirements. See [Authentication and Authorization](../docs/AUTHENTICATION-AUTHORIZATION.md) for API verifier behavior and failure semantics. Without OIDC configuration, requests to the session endpoint fail closed with HTTP 503. Missing/invalid bearer tokens return HTTP 401.

## FastAPI authorization dependency

`edbody_backend.authorization.require_authorized_action(...)` is a reusable dependency for future protected routes. It obtains identity from the verified token, loads consent through a server-side repository interface, evaluates role/subject/action/purpose and writes an allow/deny event to an audit sink before an allowed handler runs.

The default consent-repository and audit-sink providers deliberately return HTTP 503. There is no concrete consent store or durable audit sink yet. Unit tests override these dependencies using synthetic data; this is not a production storage implementation. Until trusted repository and audit implementations are reviewed and wired in, do not add a route that returns real health information and do not submit real patient data.
