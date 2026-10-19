# EDBODY desktop sign-in (OIDC + PKCE)

**Status:** Desktop authorization-code sign-in flow is implemented. It is provider-configurable but not yet connected to a real identity provider. No client secret is embedded in the desktop app.

## Provider requirements

Register EDBODY as a **public/native desktop OAuth client** with:

- Authorization Code grant and PKCE using **S256**.
- OpenID Connect scopes (the default request is `openid profile`).
- Support for a loopback redirect with a dynamic port and path `/oauth2/callback` on `127.0.0.1`, using the provider's native-app configuration. The callback URI is selected at runtime as `http://127.0.0.1:<ephemeral-port>/oauth2/callback`; it must be accepted under the provider's loopback-redirect rules.
- A token response containing a Bearer access token, an ID token, and `expires_in`.
- An RS256-signed ID token discoverable via the issuer's JWKS endpoint.
- An API access token accepted by EDBODY's backend token verifier: RS256, explicit RFC 9068 `typ=at+jwt` (or `application/at+jwt`), exact expected issuer and API audience, and the required `exp`, `iss`, `sub`, `aud`, `iat`, `jti`, and `client_id` claims.

The provider's access token must also contain the configured backend role claim as a **list of strings**. EDBODY recognizes only `clinician`, `researcher` and `data_steward`. Align the provider's role-claim mapping with the backend's `EDBODY_OIDC_ROLE_CLAIM` environment variable. This is a compatibility requirement, not an assertion that any provider has already been configured.

Native apps are public clients: do not create or put a client secret in Electron code. The sign-in uses the system browser, Authorization Code + PKCE, random state and nonce, and a loopback callback. This follows [RFC 8252 — OAuth 2.0 for Native Apps](https://www.rfc-editor.org/rfc/rfc8252.html) and uses the [RFC 8707 resource indicator](https://www.rfc-editor.org/rfc/rfc8707.html) to request a token for the EDBODY API.

## Environment configuration

The main Electron process reads configuration from its launch environment. Values are not editable in the renderer, so a compromised renderer cannot redirect the login exchange or send the access token to an API URL of its choice.

| Variable | Required | Purpose |
|---|---|---|
| `EDBODY_OIDC_ISSUER` | Yes | Exact HTTPS OIDC issuer value, including any meaningful path/trailing slash, as returned in discovery metadata |
| `EDBODY_OIDC_CLIENT_ID` | Yes | Public desktop client ID registered with the provider |
| `EDBODY_OIDC_AUDIENCE` | Yes | HTTPS resource identifier sent in the OAuth `resource` parameter; must match the backend's expected JWT audience exactly |
| `EDBODY_API_BASE_URL` | Yes | API origin only, without path/query/fragment; HTTPS in deployed environments |
| `EDBODY_OIDC_SCOPE` | No | Space-delimited scopes; defaults to `openid profile` |

For **local development only**, the API base URL may use loopback HTTP, such as `http://127.0.0.1:8765`. HTTP is rejected for non-loopback API hosts. The identity issuer, audience/resource identifier, and discovery/JWKS/token/authorization endpoints must use HTTPS.

PowerShell example (replace placeholders with the values from your trusted provider and API deployment):

```powershell
$env:EDBODY_OIDC_ISSUER = "https://identity.example.test"
$env:EDBODY_OIDC_CLIENT_ID = "your-public-desktop-client-id"
$env:EDBODY_OIDC_AUDIENCE = "https://edbody-api.example.test"
$env:EDBODY_API_BASE_URL = "http://127.0.0.1:8765"
npm run dev
```

Bash example:

```bash
export EDBODY_OIDC_ISSUER="https://identity.example.test"
export EDBODY_OIDC_CLIENT_ID="your-public-desktop-client-id"
export EDBODY_OIDC_AUDIENCE="https://edbody-api.example.test"
export EDBODY_API_BASE_URL="http://127.0.0.1:8765"
npm run dev
```

The values above are examples, not a live provider configuration. The backend process must be configured separately with:

- `EDBODY_OIDC_ISSUER`: exactly the same issuer as the desktop.
- `EDBODY_OIDC_AUDIENCE`: exactly the same audience/resource identifier the provider puts in the access token.
- `EDBODY_OIDC_JWKS_URL`: the trusted JWKS URL from that issuer's discovery metadata.
- `EDBODY_OIDC_ROLE_CLAIM`: optional provider-specific top-level role-claim name; defaults to `roles`.

## What happens during sign-in

1. The main process validates the launch configuration and fetches the issuer's HTTPS discovery document, checking the issuer matches exactly and checking the advertised authorization-code/PKCE capabilities.
2. EDBODY binds an ephemeral HTTP listener to `127.0.0.1`, generates a random state, nonce and PKCE verifier/challenge, and opens the authorization URL in the system browser.
3. The loopback receiver accepts only the callback path on its own host/port and requires the expected one-time state. It times out after three minutes.
4. The main process exchanges the authorization code and PKCE verifier at the discovered token endpoint without a client secret. It verifies the ID-token RS256 signature using the discovered JWKS, plus issuer, audience, time, subject and nonce.
5. It sends the access token only to the configured EDBODY API's `/v1/security/session` route. The backend validates the token independently and returns recognized role names.
6. The renderer receives only authenticated status, roles and token expiry—**never the access token, ID token or refresh token**.

## Token lifetime and limitations

- Access tokens are kept in Electron main-process memory only; this flow does not persist tokens to disk or request `offline_access`.
- Local sign-out clears the in-memory access token. It does not guarantee that the identity provider or API immediately revokes a token already issued; the token may remain valid until expiry.
- There is no refresh-token flow. After expiry, the user must sign in again.
- The sign-in configuration is read at application launch. Restart EDBODY after changing environment variables.
- The new route is an authenticated self-session endpoint only. There are still no patient-data endpoints, database, authoritative consent repository, or durable audit sink.
- Do not use real patient data. Passing software tests is not a security certification or a clinical validation.
