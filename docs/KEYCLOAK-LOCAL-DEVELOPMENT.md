# Local Keycloak development

**Scope:** local development and synthetic identity tests only. This is not a production identity deployment and does not enable patient-data workflows.

## 1. Start Keycloak

Requirements: Docker Compose v2.

From the repository root:

```bash
cp keycloak/env.local.example keycloak/env.local
```

Edit `keycloak/env.local` and set a unique, long local admin password. Then start the service:

```bash
docker compose --env-file keycloak/env.local -f keycloak/compose.yaml up -d
```

Keycloak is published only on `127.0.0.1:8080`. The realm import creates `edbody-local`, a public desktop client named `edbody-desktop`, an EDBODY API audience, a top-level `roles` claim, and one synthetic researcher identity. The realm file includes a deliberately weak demo user password for local tests; never reuse it or use this realm outside a developer machine. The bootstrap admin password comes from the untracked local env file.

Open the admin console at <http://127.0.0.1:8080/admin/>. Sign in using the local admin credentials. The synthetic test user is:

- Username: `researcher`
- Password: `local-researcher-only`
- Realm: `edbody-local`

Keycloak may skip importing a realm that already exists. To reset the disposable local realm, stop the service and remove its container; this compose file intentionally does not persist Keycloak data in a named volume, so realm state is ephemeral.

## 2. Configure the EDBODY backend

Create a separate terminal for the backend and set:

```bash
export EDBODY_OIDC_ISSUER="http://127.0.0.1:8080/realms/edbody-local"
export EDBODY_OIDC_AUDIENCE="https://edbody-api.local"
export EDBODY_OIDC_JWKS_URL="http://127.0.0.1:8080/realms/edbody-local/protocol/openid-connect/certs"
export EDBODY_OIDC_ROLE_CLAIM="roles"
export EDBODY_OIDC_ALLOW_INSECURE_LOOPBACK="true"
```

PowerShell:

```powershell
$env:EDBODY_OIDC_ISSUER = "http://127.0.0.1:8080/realms/edbody-local"
$env:EDBODY_OIDC_AUDIENCE = "https://edbody-api.local"
$env:EDBODY_OIDC_JWKS_URL = "http://127.0.0.1:8080/realms/edbody-local/protocol/openid-connect/certs"
$env:EDBODY_OIDC_ROLE_CLAIM = "roles"
$env:EDBODY_OIDC_ALLOW_INSECURE_LOOPBACK = "true"
```

Run the API using the instructions in [backend README](../backend/README.md). Keep it bound to `127.0.0.1:8765`.

## 3. Configure the desktop

Set the following variables in the terminal that launches EDBODY:

```bash
export EDBODY_OIDC_ISSUER="http://127.0.0.1:8080/realms/edbody-local"
export EDBODY_OIDC_CLIENT_ID="edbody-desktop"
export EDBODY_OIDC_AUDIENCE="https://edbody-api.local"
export EDBODY_API_BASE_URL="http://127.0.0.1:8765"
export EDBODY_OIDC_ALLOW_INSECURE_LOOPBACK="true"
npm run dev
```

PowerShell uses the same variable names via `$env:NAME = "value"`. Restart the desktop after changing environment variables.

Keycloak's discovery metadata may list only confidential-client token authentication methods even though the configured public client accepts a PKCE code exchange without a secret. EDBODY allows that metadata mismatch only in the explicit loopback-only mode; all HTTPS provider configurations still require the advertised public-client method. See [Keycloak's native-app redirect URI guidance](https://www.keycloak.org/securing-apps/oidc-layers).

The insecure-loopback switch is an explicit development escape hatch. Code permits HTTP only when both the switch is set and the issuer/JWKS/metadata endpoints resolve to loopback addresses. The backend's default remains HTTPS-only and RFC 9068 `at+jwt` only. When this switch is enabled, the backend accepts Keycloak's local `typ=JWT` access-token header only for the configured loopback HTTP issuer; issuer, audience, signature, expiry, required claims and roles are still validated. Do not enable this flag in any shared, deployed, or production environment.

## 4. Validate the flow

1. Confirm Keycloak discovery responds at <http://127.0.0.1:8080/realms/edbody-local/.well-known/openid-configuration>.
2. Start the backend and confirm <http://127.0.0.1:8765/health> returns its health response.
3. Start EDBODY and choose sign-in. The system browser should open Keycloak; authenticate as the synthetic researcher.
4. Confirm EDBODY displays the recognized `researcher` role only after the backend's `/v1/security/session` accepts the access token.
5. Test a token with a wrong issuer, wrong audience, invalid signature, expiry, missing `client_id`, or malformed `roles`; each must fail closed.
6. Confirm sign-out clears the desktop's in-memory token. This does not revoke an already issued token at the identity provider.

The `check:oidc-provider` preflight intentionally requires HTTPS and is not for this local-only HTTP realm. Use it for HTTPS staging/production provider metadata instead.

## Limitations and safety

- The local realm is intentionally configured with `sslRequired: none` because the service is bound to loopback for developer-only testing. Do not expose port 8080 to a LAN or the internet.
- The import is a development fixture, not an institution-ready realm policy. Review session lifetimes, MFA, account lifecycle, role assignment, backup/recovery, TLS and monitoring before any shared environment.
- No patient-data route, database, authoritative consent store, or durable audit sink is created by this setup. Do not enter real patient data.
- A successful login demonstrates local plumbing only; it does not establish clinical validity, security certification, or readiness for hospital deployment.
