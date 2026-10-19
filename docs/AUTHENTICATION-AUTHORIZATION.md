# Backend authentication and authorization (M3 foundation)

**Status:** OIDC JWT access-token verification and a reusable authorization dependency are implemented and tested. EDBODY does not yet have an interactive login flow, a configured identity provider, a consent database, a durable audit sink, or a protected patient-data route.

## Configuration

Set these environment variables in the backend process environment after selecting and registering a trusted institutional identity provider:

| Variable | Meaning |
|---|---|
| `EDBODY_OIDC_ISSUER` | Exact HTTPS issuer value expected in the token's `iss` claim |
| `EDBODY_OIDC_AUDIENCE` | Audience/resource identifier for the EDBODY API, which must be present in the token's `aud` claim |
| `EDBODY_OIDC_JWKS_URL` | Trusted HTTPS endpoint publishing the issuer's JSON Web Keys |
| `EDBODY_OIDC_ROLE_CLAIM` | Optional top-level claim name containing an array of role strings; defaults to `roles` |

The issuer and JWKS URL are trusted deployment configuration, not values supplied by the caller. Do not copy unverified token claims into configuration. Do not place signing private keys, client secrets, access tokens or refresh tokens in source control.

The current verifier supports **RS256-signed JWT access tokens using the RFC 9068 profile**: `typ` must be `at+jwt` or `application/at+jwt`; the token must contain `iss`, `sub`, `aud`, `exp`, `iat`, `jti`, and `client_id`. It verifies the signature using the issuer's JWKS and checks the expected issuer, audience, expiration and required claims. The algorithm is fixed to RS256, not selected from untrusted token input. The role claim must be a list of strings; only EDBODY roles `clinician`, `researcher` and `data_steward` are mapped into permissions. Unrecognized roles are ignored, leaving the caller with no EDBODY role if no recognized role is present.

This is a **resource-server verifier**, not an interactive OpenID Connect login implementation. The identity provider must issue an access token intended for EDBODY's API audience. Do not send an OIDC ID token as the API bearer token. RFC 9068 requires the explicit `at+jwt` token type partly to help prevent ID tokens from being accepted as access tokens. See the [IETF RFC 9068 specification](https://www.rfc-editor.org/rfc/rfc9068.html) and [PyJWT validation API](https://pyjwt.readthedocs.io/en/stable/api.html).

## Current HTTP routes

- `GET /health`: public process health/capability status; it reports no patient-data functionality or validated clinical models.
- `GET /v1/security/session`: requires an Authorization bearer token, verifies the token against configured issuer keys, and returns only the caller's recognized EDBODY roles.

Failure behavior is intentional:

| Condition | Response |
|---|---|
| Missing bearer token | `401` |
| Invalid, expired, wrong-issuer, wrong-audience, or wrong token type | `401` |
| OIDC configuration absent or the JWKS endpoint unavailable | `503` |
| A future protected route fails role/consent authorization | `403` |
| Consent store or durable audit sink not configured/unavailable | `503` (fail closed) |

## Wiring authorization into future protected routes

Use the reusable dependency in `edbody_backend.authorization` with the route's required action and purpose, for example:

```python
from uuid import UUID
from fastapi import Depends
from edbody_backend.authorization import require_authorized_action
from edbody_backend.governance import AccessDecision

@app.get("/v1/subjects/{subject_reference}/observations")
def read_observations(
    subject_reference: UUID,
    decision: AccessDecision = Depends(
        require_authorized_action(
            action="read_observation",
            purpose="research",
        )
    ),
):
    # Fetch and return data only after the dependency succeeds.
    ...
```

The dependency gets the principal from `get_current_principal`, loads an authoritative effective grant from the repository dependency, evaluates the role/subject/action/purpose/time policy, and appends an allow/deny event before allowing the handler to run. Caller-supplied role or consent data is not accepted as proof.

However, the default consent-repository and audit-sink dependencies deliberately return `503`. No concrete implementations exist yet. A future endpoint must not override those with caller-supplied data or an in-memory production fallback. Implement and review the authoritative consent/grant repository and durable audit sink before adding a route that reads/writes health information.

## What is still required

1. Choose the target institution's supported identity provider and configure how its trusted access tokens represent roles. The current role mapping and role policy are prototype defaults.
2. Decide how the Electron desktop obtains an access token safely. If it is a public desktop client, use an approved authorization-code flow with PKCE via the system browser; never embed a client secret in the desktop app. The interactive flow is not implemented here.
3. Implement trusted consent/grant storage, including revocation and subject binding.
4. Implement a durable append-only/tamper-evident audit sink. Protected operations fail closed if audit append fails.
5. Wire storage-level authorization as well as route-level authorization; a route check alone is not enough if background workers or direct storage paths bypass it.
6. Add rate limiting, request/body size limits, CORS policy if browser clients are later introduced, operational logs that avoid sensitive payloads, dependency/security review, and institutional security acceptance.
7. Add integration tests against the selected provider and real consent/audit adapters using synthetic identities and data.

No database, patient-data route, imaging route, or clinical model is introduced by this milestone. **Do not submit real patient data.**
