#!/usr/bin/env node
/**
 * Read-only preflight for an EDBODY OIDC provider.
 * This checks discovery/JWKS metadata only; it does not sign in or prove that
 * issued access tokens satisfy EDBODY's RFC 9068 token-profile requirements.
 */

const requiredHttpsUrl = (value, label) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${label} must be an HTTPS URL without credentials, query, or fragment`);
  }
  return parsed.toString();
};

async function readJson(fetchImpl, url, label) {
  const response = await fetchImpl(url, { headers: { accept: "application/json" }, redirect: "error" });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  const value = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} did not return a JSON object`);
  }
  return value;
}

export async function inspectOidcProvider({ issuer, clientId, audience, fetchImpl = fetch }) {
  const configuredIssuer = issuer?.trim() ?? "";
  requiredHttpsUrl(configuredIssuer, "EDBODY_OIDC_ISSUER");
  if (!clientId?.trim()) throw new Error("EDBODY_OIDC_CLIENT_ID is required");
  requiredHttpsUrl(audience, "EDBODY_OIDC_AUDIENCE");

  const discoveryUrl = `${configuredIssuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;
  const metadata = await readJson(fetchImpl, discoveryUrl, "OIDC discovery");
  if (metadata.issuer !== configuredIssuer) {
    throw new Error("Discovery issuer does not exactly match EDBODY_OIDC_ISSUER");
  }

  for (const field of ["authorization_endpoint", "token_endpoint", "jwks_uri"]) {
    if (typeof metadata[field] !== "string") throw new Error(`Discovery metadata is missing ${field}`);
    requiredHttpsUrl(metadata[field], `Discovery ${field}`);
  }
  if (!Array.isArray(metadata.response_types_supported) || !metadata.response_types_supported.includes("code")) {
    throw new Error("Provider does not advertise the authorization-code response type");
  }
  if (Array.isArray(metadata.grant_types_supported) && !metadata.grant_types_supported.includes("authorization_code")) {
    throw new Error("Provider does not advertise the authorization_code grant");
  }
  if (!Array.isArray(metadata.code_challenge_methods_supported) || !metadata.code_challenge_methods_supported.includes("S256")) {
    throw new Error("Provider does not advertise PKCE S256");
  }
  if (!Array.isArray(metadata.token_endpoint_auth_methods_supported) || !metadata.token_endpoint_auth_methods_supported.includes("none")) {
    throw new Error("Provider does not advertise the public-client token endpoint method 'none'");
  }
  if (!Array.isArray(metadata.id_token_signing_alg_values_supported) || !metadata.id_token_signing_alg_values_supported.includes("RS256")) {
    throw new Error("Provider does not advertise RS256 ID-token signing");
  }

  const jwks = await readJson(fetchImpl, metadata.jwks_uri, "JWKS endpoint");
  if (!Array.isArray(jwks.keys)) throw new Error("JWKS response is missing a keys array");
  const hasRsaVerificationKey = jwks.keys.some((key) =>
    key && key.kty === "RSA" &&
    (key.use === undefined || key.use === "sig") &&
    (key.alg === undefined || key.alg === "RS256") &&
    (key.key_ops === undefined || key.key_ops.includes("verify"))
  );
  if (!hasRsaVerificationKey) throw new Error("JWKS does not publish a compatible RSA verification key");

  return {
    issuer: metadata.issuer,
    clientId,
    audience,
    checks: [
      "HTTPS issuer and trusted discovery metadata",
      "Authorization Code response and authorization_code grant",
      "PKCE S256",
      "Public client token endpoint authentication (none)",
      "RS256 ID-token signing metadata",
      "HTTPS authorization/token/JWKS endpoints",
      "At least one compatible RSA signing verification key in JWKS",
    ],
    liveLoginStillRequired: [
      "Confirm the provider accepts the exact runtime loopback redirect URI on 127.0.0.1 with an ephemeral port and /oauth2/callback.",
      "Complete a real interactive login and verify the ID token signature, issuer, audience, expiry and nonce.",
      "Confirm the API access token has typ at+jwt or application/at+jwt and claims iss, sub, aud, exp, iat, jti and client_id.",
      "Confirm the access token audience exactly matches EDBODY_OIDC_AUDIENCE and its configured role claim is a list of strings containing only intended EDBODY roles.",
      "Verify the backend /v1/security/session accepts the access token; do not send the ID token as the API bearer token.",
    ],
  };
}

async function main() {
  try {
    const result = await inspectOidcProvider({
      issuer: process.env.EDBODY_OIDC_ISSUER ?? "",
      clientId: process.env.EDBODY_OIDC_CLIENT_ID ?? "",
      audience: process.env.EDBODY_OIDC_AUDIENCE ?? "",
    });
    console.log(JSON.stringify(result, null, 2));
    console.log("\nMetadata preflight passed. This is not a live-login or token-compatibility test.");
  } catch (error) {
    console.error(`OIDC provider preflight failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
