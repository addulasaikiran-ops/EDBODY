'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readDesktopConfig, discoverProvider, OidcConfigurationError, OidcFlowError } = require('../electron/oidc.cjs');

const localEnv = {
  EDBODY_OIDC_ISSUER: 'http://127.0.0.1:8080/realms/edbody-local',
  EDBODY_OIDC_CLIENT_ID: 'edbody-desktop',
  EDBODY_OIDC_AUDIENCE: 'https://edbody-api.local',
  EDBODY_API_BASE_URL: 'http://127.0.0.1:8765',
  EDBODY_OIDC_ALLOW_INSECURE_LOOPBACK: 'true',
};

test('local Keycloak HTTP issuer requires explicit loopback opt-in', () => {
  const { EDBODY_OIDC_ALLOW_INSECURE_LOOPBACK, ...withoutFlag } = localEnv;
  assert.throws(() => readDesktopConfig(withoutFlag), OidcConfigurationError);
  const config = readDesktopConfig(localEnv);
  assert.equal(config.issuer, localEnv.EDBODY_OIDC_ISSUER);
  assert.equal(config.allowInsecureLoopback, true);
});

test('local Keycloak discovery permits HTTP endpoints only on loopback', async () => {
  const config = readDesktopConfig(localEnv);
  const metadata = {
    issuer: config.issuer,
    authorization_endpoint: 'http://127.0.0.1:8080/realms/edbody-local/protocol/openid-connect/auth',
    token_endpoint: 'http://127.0.0.1:8080/realms/edbody-local/protocol/openid-connect/token',
    jwks_uri: 'http://127.0.0.1:8080/realms/edbody-local/protocol/openid-connect/certs',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    id_token_signing_alg_values_supported: ['RS256'],
  };
  const fetchImpl = async () => ({ ok: true, json: async () => metadata });
  const discovered = await discoverProvider(config, fetchImpl);
  assert.equal(discovered.issuer, config.issuer);
  assert.equal(discovered.token_endpoint, metadata.token_endpoint);

  const secureConfig = readDesktopConfig({
    ...localEnv,
    EDBODY_OIDC_ISSUER: 'https://identity.example.test/realms/edbody-local',
    EDBODY_OIDC_ALLOW_INSECURE_LOOPBACK: 'false',
  });
  const secureMetadata = {
    ...metadata,
    issuer: secureConfig.issuer,
    authorization_endpoint: 'https://identity.example.test/auth',
    token_endpoint: 'https://identity.example.test/token',
    jwks_uri: 'https://identity.example.test/certs',
  };
  await assert.rejects(
    discoverProvider(secureConfig, async () => ({ ok: true, json: async () => secureMetadata })),
    OidcFlowError,
  );

  const unsafeMetadata = { ...metadata, token_endpoint: 'http://identity.example.test/token' };
  await assert.rejects(
    discoverProvider(config, async () => ({ ok: true, json: async () => unsafeMetadata })),
    OidcFlowError,
  );
});

test('Keycloak loopback opt-in does not permit non-loopback HTTP issuer', () => {
  assert.throws(() => readDesktopConfig({
    ...localEnv,
    EDBODY_OIDC_ISSUER: 'http://identity.example.test/realms/edbody-local',
  }), OidcConfigurationError);
});
