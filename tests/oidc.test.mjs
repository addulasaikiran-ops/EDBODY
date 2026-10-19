import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import test from 'node:test';

import oidc from '../electron/oidc.cjs';

const validEnv = {
  EDBODY_OIDC_ISSUER: 'https://identity.example.test',
  EDBODY_OIDC_CLIENT_ID: 'edbody-public-desktop',
  EDBODY_OIDC_AUDIENCE: 'https://edbody-api.example.test',
  EDBODY_API_BASE_URL: 'http://127.0.0.1:8765',
};

function responseJson(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() { return body; },
  };
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signedIdToken(privateKey, publicJwk, claims, headerExtra = {}) {
  const header = { alg: 'RS256', typ: 'JWT', kid: publicJwk.kid, ...headerExtra };
  const signingInput = encodeJson(header) + '.' + encodeJson(claims);
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return signingInput + '.' + signature;
}

test('desktop OIDC config requires explicit trusted provider and API values', () => {
  assert.throws(
    () => oidc.readDesktopConfig({}),
    (error) => error.name === 'OidcConfigurationError' && /EDBODY_OIDC_ISSUER/.test(error.message),
  );

  const config = oidc.readDesktopConfig(validEnv);
  assert.equal(config.issuer, 'https://identity.example.test/');
  assert.equal(config.clientId, 'edbody-public-desktop');
  assert.equal(config.audience, 'https://edbody-api.example.test/');
  assert.equal(config.apiBaseUrl, 'http://127.0.0.1:8765');
  assert.equal(config.scope, 'openid profile');
});

test('HTTP is rejected for external API hosts and identity issuer must use HTTPS', () => {
  assert.throws(
    () => oidc.readDesktopConfig({ ...validEnv, EDBODY_OIDC_ISSUER: 'http://identity.example.test' }),
    /safe HTTPS URL/,
  );
  assert.throws(
    () => oidc.readDesktopConfig({ ...validEnv, EDBODY_API_BASE_URL: 'http://api.example.test' }),
    /HTTPS; HTTP is allowed only for a loopback/,
  );
});

test('API base URL cannot point at a path, query, or fragment', () => {
  assert.throws(
    () => oidc.readDesktopConfig({ ...validEnv, EDBODY_API_BASE_URL: 'https://api.example.test/v1' }),
    /origin URL/,
  );
});

test('PKCE verifier is high entropy and S256 challenge is deterministic', () => {
  const pair = oidc.createPkcePair();
  assert.match(pair.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(
    pair.challenge,
    crypto.createHash('sha256').update(pair.verifier).digest('base64url'),
  );
});

test('OIDC discovery rejects an issuer mismatch and records HTTPS endpoints', async () => {
  const config = oidc.readDesktopConfig(validEnv);
  const metadata = {
    issuer: config.issuer,
    authorization_endpoint: 'https://identity.example.test/authorize',
    token_endpoint: 'https://identity.example.test/token',
    jwks_uri: 'https://identity.example.test/jwks',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
  };
  const provider = await oidc.discoverProvider(config, async (url) => {
    assert.equal(url, 'https://identity.example.test/.well-known/openid-configuration');
    return responseJson(metadata);
  });
  assert.equal(provider.token_endpoint, metadata.token_endpoint);

  await assert.rejects(
    oidc.discoverProvider(config, async () => responseJson({ ...metadata, issuer: 'https://attacker.example.test' })),
    /issuer does not exactly match/,
  );
});

test('OIDC discovery rejects a provider that explicitly excludes S256 PKCE', async () => {
  const config = oidc.readDesktopConfig(validEnv);
  await assert.rejects(
    oidc.discoverProvider(config, async () => responseJson({
      issuer: config.issuer,
      authorization_endpoint: 'https://identity.example.test/authorize',
      token_endpoint: 'https://identity.example.test/token',
      jwks_uri: 'https://identity.example.test/jwks',
      code_challenge_methods_supported: ['plain'],
    })),
    /does not support PKCE S256/,
  );
});

test('authorization request contains state, nonce, resource indicator, and PKCE', () => {
  const config = oidc.readDesktopConfig(validEnv);
  const authorizationUrl = oidc.buildAuthorizationUrl(
    { authorization_endpoint: 'https://identity.example.test/authorize' },
    config,
    {
      redirectUri: 'http://127.0.0.1:49152/oauth2/callback',
      state: 'one-time-state',
      nonce: 'one-time-nonce',
      challenge: 'pkce-challenge',
    },
  );
  const url = new URL(authorizationUrl);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), config.clientId);
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:49152/oauth2/callback');
  assert.equal(url.searchParams.get('state'), 'one-time-state');
  assert.equal(url.searchParams.get('nonce'), 'one-time-nonce');
  assert.equal(url.searchParams.get('code_challenge'), 'pkce-challenge');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('resource'), config.audience);
  assert.equal(url.searchParams.has('client_secret'), false);
});

test('ID token signature, issuer, audience, expiry and nonce are verified', async () => {
  const config = oidc.readDesktopConfig(validEnv);
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const exported = publicKey.export({ format: 'jwk' });
  const jwk = { ...exported, kid: 'test-id-token-key', use: 'sig', alg: 'RS256' };
  const now = 2_000_000_000;
  const claims = {
    iss: config.issuer,
    sub: 'synthetic-subject',
    aud: config.clientId,
    exp: now + 120,
    iat: now - 10,
    nonce: 'expected-once',
  };
  const metadata = { jwks_uri: 'https://identity.example.test/jwks' };
  const fetchImpl = async (url) => {
    assert.equal(url, metadata.jwks_uri);
    return responseJson({ keys: [jwk] });
  };
  const token = signedIdToken(privateKey, jwk, claims);

  const result = await oidc.verifyIdToken(token, {
    config, metadata, expectedNonce: 'expected-once', fetchImpl, nowSeconds: now,
  });
  assert.deepEqual(result, { subject: 'synthetic-subject' });

  await assert.rejects(
    oidc.verifyIdToken(token, {
      config, metadata, expectedNonce: 'wrong-nonce', fetchImpl, nowSeconds: now,
    }),
    /nonce validation/,
  );
  await assert.rejects(
    oidc.verifyIdToken(signedIdToken(privateKey, jwk, { ...claims, aud: 'different-client' }), {
      config, metadata, expectedNonce: 'expected-once', fetchImpl, nowSeconds: now,
    }),
    /audience/,
  );
  await assert.rejects(
    oidc.verifyIdToken(signedIdToken(privateKey, jwk, { ...claims, exp: now - 100 }), {
      config, metadata, expectedNonce: 'expected-once', fetchImpl, nowSeconds: now,
    }),
    /time/,
  );
});

test('ID token with tampered signature or unsupported algorithm is rejected', async () => {
  const config = oidc.readDesktopConfig(validEnv);
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'expected-kid', use: 'sig', alg: 'RS256' };
  const now = 2_000_000_000;
  const claims = { iss: config.issuer, sub: 'synthetic', aud: config.clientId, exp: now + 60, iat: now - 5, nonce: 'n' };
  const metadata = { jwks_uri: 'https://identity.example.test/jwks' };
  const fetchImpl = async () => responseJson({ keys: [jwk] });
  const good = signedIdToken(privateKey, jwk, claims);
  const pieces = good.split('.');
  pieces[2] = Buffer.alloc(256, 7).toString('base64url');
  await assert.rejects(
    oidc.verifyIdToken(pieces.join('.'), { config, metadata, expectedNonce: 'n', fetchImpl, nowSeconds: now }),
    /signature is invalid/,
  );
  const badAlg = signedIdToken(privateKey, jwk, claims, { alg: 'HS256' });
  await assert.rejects(
    oidc.verifyIdToken(badAlg, { config, metadata, expectedNonce: 'n', fetchImpl, nowSeconds: now }),
    /unsupported signing algorithm/,
  );
});

test('loopback receiver ignores bad state and accepts only the matching callback state', async () => {
  const expectedState = 'test-state-123';
  const receiver = oidc.startLoopbackReceiver({ expectedState, timeoutMs: 5000 });
  try {
    await receiver.ready;
    const uri = new URL(receiver.redirectUri);
    const requestCallback = (state, code) => new Promise((resolve, reject) => {
      const path = uri.pathname + '?state=' + encodeURIComponent(state) + '&code=' + encodeURIComponent(code);
      const req = http.get({
        hostname: '127.0.0.1',
        port: Number(uri.port),
        path,
        headers: { host: '127.0.0.1:' + uri.port },
      }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
    });

    const rejected = await requestCallback('attacker-state', 'intercepted');
    assert.equal(rejected.status, 400);
    const accepted = requestCallback(expectedState, 'test-code');
    const callback = await receiver.response;
    assert.equal(callback.code, 'test-code');
    assert.equal(callback.redirectUri, receiver.redirectUri);
    assert.equal((await accepted).status, 200);
  } finally {
    receiver.close();
  }
});
