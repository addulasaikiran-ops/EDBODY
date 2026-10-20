import test from "node:test";
import assert from "node:assert/strict";
import { inspectOidcProvider } from "../tools/check-oidc-provider.mjs";

const issuer = "https://identity.example.test";
const audience = "https://edbody-api.example.test";
const metadata = {
  issuer,
  authorization_endpoint: `${issuer}/authorize`,
  token_endpoint: `${issuer}/token`,
  jwks_uri: `${issuer}/jwks`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  id_token_signing_alg_values_supported: ["RS256"],
};
const jwks = { keys: [{ kty: "RSA", use: "sig", alg: "RS256", key_ops: ["verify"], n: "synthetic", e: "AQAB" }] };

function mockFetch(overrides = {}) {
  return async (url, options) => {
    assert.equal(options.redirect, "error");
    if (url === `${issuer}/.well-known/openid-configuration`) {
      return { ok: true, status: 200, json: async () => ({ ...metadata, ...overrides.metadata }) };
    }
    if (url === metadata.jwks_uri) {
      return { ok: true, status: 200, json: async () => overrides.jwks ?? jwks };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
}

test("OIDC provider preflight accepts compatible discovery and JWKS metadata", async () => {
  const result = await inspectOidcProvider({
    issuer, clientId: "synthetic-client", audience, fetchImpl: mockFetch(),
  });
  assert.equal(result.issuer, issuer);
  assert.equal(result.liveLoginStillRequired.length, 5);
  assert.ok(result.checks.includes("PKCE S256"));
});

test("OIDC provider preflight rejects an issuer mismatch", async () => {
  await assert.rejects(
    inspectOidcProvider({
      issuer, clientId: "synthetic-client", audience,
      fetchImpl: mockFetch({ metadata: { issuer: "https://attacker.example.test" } }),
    }),
    /does not exactly match/,
  );
});

test("OIDC provider preflight rejects missing PKCE S256 support", async () => {
  await assert.rejects(
    inspectOidcProvider({
      issuer, clientId: "synthetic-client", audience,
      fetchImpl: mockFetch({ metadata: { code_challenge_methods_supported: ["plain"] } }),
    }),
    /does not advertise PKCE S256/,
  );
});

test("OIDC provider preflight rejects a non-HTTPS token endpoint", async () => {
  await assert.rejects(
    inspectOidcProvider({
      issuer, clientId: "synthetic-client", audience,
      fetchImpl: mockFetch({ metadata: { token_endpoint: "http://identity.example.test/token" } }),
    }),
    /must be an HTTPS URL/,
  );
});

test("OIDC provider preflight rejects JWKS without a compatible RSA verification key", async () => {
  await assert.rejects(
    inspectOidcProvider({
      issuer, clientId: "synthetic-client", audience,
      fetchImpl: mockFetch({ jwks: { keys: [{ kty: "EC", use: "sig", alg: "ES256" }] } }),
    }),
    /compatible RSA verification key/,
  );
});
