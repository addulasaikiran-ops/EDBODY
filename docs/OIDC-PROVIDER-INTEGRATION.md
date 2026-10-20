# OIDC provider integration checklist

**Status:** Preflight tooling and setup guidance only. No provider tenant has been registered or configured for EDBODY, and live login has not been verified.

## 1. Register the desktop client

In the chosen identity provider, create a **native/public desktop client**. Configure:

- Authorization Code flow with PKCE using **S256**.
- No client secret. EDBODY is a public client; a secret embedded in Electron would not be secret.
- OpenID Connect scopes: `openid profile`.
- Loopback callback support for `http://127.0.0.1:<ephemeral-port>/oauth2/callback`. The exact port is selected at runtime, so follow the provider's native-app loopback redirect rules rather than registering a guessed fixed port.
- An API/resource audience exactly matching the EDBODY backend's `EDBODY_OIDC_AUDIENCE`.
- An RS256-signed ID token.
- An API **access token** compatible with EDBODY's current verifier: RFC 9068 style `typ=at+jwt` or `application/at+jwt`, with `iss`, `sub`, `aud`, `exp`, `iat`, `jti`, and `client_id` claims.
- A top-level role claim containing an array of strings. EDBODY recognizes `clinician`, `researcher`, and `data_steward`; only grant roles that are appropriate for the test identities.

**Compatibility warning:** many providers can issue OIDC tokens but do not necessarily issue API access tokens in the exact RFC 9068 profile EDBODY currently requires. Do not assume compatibility from a successful browser login or from the ID token alone. If the provider cannot satisfy the access-token type/claim requirements, stop and review a deliberate backend profile change rather than weakening token verification.

## 2. Configure the desktop and backend

Set these values in the desktop launch environment:

- `EDBODY_OIDC_ISSUER`: exact HTTPS issuer from the provider's discovery document.
- `EDBODY_OIDC_CLIENT_ID`: public/native client ID.
- `EDBODY_OIDC_AUDIENCE`: exact API resource identifier/audience.
- `EDBODY_API_BASE_URL`: API origin; loopback HTTP is permitted only for local development, such as `http://127.0.0.1:8765`.

Configure the backend process separately:

- `EDBODY_OIDC_ISSUER`: the same exact issuer.
- `EDBODY_OIDC_AUDIENCE`: the audience actually present in the API access token.
- `EDBODY_OIDC_JWKS_URL`: trusted HTTPS JWKS URL from discovery.
- `EDBODY_OIDC_ROLE_CLAIM`: optional top-level role claim name; defaults to `roles`.

Never commit real tenant identifiers if your organization treats them as sensitive, access tokens, signing keys, client secrets, or user credentials. Do not add a client secret to the desktop configuration.

## 3. Run the metadata preflight

With Node dependencies installed, set the issuer, client ID, and audience, then run:

```bash
npm run check:oidc-provider
```

PowerShell example:

```powershell
$env:EDBODY_OIDC_ISSUER = "https://your-issuer.example"
$env:EDBODY_OIDC_CLIENT_ID = "your-public-client-id"
$env:EDBODY_OIDC_AUDIENCE = "https://your-api-resource.example"
npm run check:oidc-provider
```

The preflight reads the HTTPS discovery document and JWKS. It checks issuer consistency, authorization-code and PKCE S256 support, public-client token endpoint authentication, RS256 ID-token metadata, HTTPS endpoints, and a compatible RSA verification key. It does not log in, exchange a code, or inspect an issued access token.

## 4. Complete live integration checks

Use only synthetic test identities and no patient data.

1. Start the backend with its OIDC settings and start EDBODY with the desktop settings.
2. Sign in through the system browser. Confirm the provider accepts the runtime loopback callback.
3. Confirm a valid login reaches `GET /v1/security/session` and displays only the recognized roles.
4. Test a user with no EDBODY roles and a user with an unrecognized role; they must not gain protected permissions.
5. Confirm wrong issuer, wrong audience, expired token, wrong `typ`, malformed role claim, and missing bearer token are rejected.
6. Verify the API receives an access token—not the ID token—and that no token is exposed to renderer JavaScript or persisted to disk.
7. Record provider, issuer, client ID, audience, role-claim name, date, software commit, and pass/fail results in the deployment's secure test record. Do not record raw tokens.

## Acceptance gate

Step 4 is complete only after a specific provider has been configured and the **live** login, access-token profile, role mapping, and backend session endpoint have passed. The metadata preflight is necessary but not sufficient. Until then, use synthetic fixtures only; consent persistence, durable audit logging, storage access controls, and institutional review remain separate gates before real patient data.
