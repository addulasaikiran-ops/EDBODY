'use strict';

const crypto = require('node:crypto');
const http = require('node:http');

const DEFAULT_SCOPE = 'openid profile';
const CALLBACK_PATH = '/oauth2/callback';
const CLOCK_SKEW_SECONDS = 60;
const MAX_ID_TOKEN_BYTES = 64 * 1024;

class OidcConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OidcConfigurationError';
  }
}

class OidcFlowError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OidcFlowError';
  }
}

function parseUrl(value, label, { httpsOnly = true, allowQuery = false, allowFragment = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new OidcConfigurationError(label + ' is required.');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new OidcConfigurationError(label + ' must be a valid absolute URL.');
  }
  if (
    (httpsOnly && parsed.protocol !== 'https:') ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    (!allowQuery && parsed.search) ||
    (!allowFragment && parsed.hash)
  ) {
    throw new OidcConfigurationError(label + ' must be a safe HTTPS URL without embedded credentials or disallowed query/fragment.');
  }
  return parsed;
}

function readDesktopConfig(environ = process.env) {
  const required = [
    ['EDBODY_OIDC_ISSUER', environ.EDBODY_OIDC_ISSUER],
    ['EDBODY_OIDC_CLIENT_ID', environ.EDBODY_OIDC_CLIENT_ID],
    ['EDBODY_OIDC_AUDIENCE', environ.EDBODY_OIDC_AUDIENCE],
    ['EDBODY_API_BASE_URL', environ.EDBODY_API_BASE_URL],
  ];
  const missing = required.filter(([, value]) => typeof value !== 'string' || !value.trim()).map(([name]) => name);
  if (missing.length) {
    throw new OidcConfigurationError('Configure ' + missing.join(', ') + ' in the environment before launching EDBODY.');
  }

  const issuerUrl = parseUrl(environ.EDBODY_OIDC_ISSUER.trim(), 'EDBODY_OIDC_ISSUER');
  const audienceUrl = parseUrl(environ.EDBODY_OIDC_AUDIENCE.trim(), 'EDBODY_OIDC_AUDIENCE');
  const apiUrl = parseUrl(environ.EDBODY_API_BASE_URL.trim(), 'EDBODY_API_BASE_URL', {
    httpsOnly: false,
  });
  const isLoopbackHttp = apiUrl.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(apiUrl.hostname);
  if (apiUrl.protocol !== 'https:' && !isLoopbackHttp) {
    throw new OidcConfigurationError('EDBODY_API_BASE_URL must use HTTPS; HTTP is allowed only for a loopback development API.');
  }
  if (apiUrl.search || apiUrl.hash || (apiUrl.pathname !== '/' && apiUrl.pathname !== '')) {
    throw new OidcConfigurationError('EDBODY_API_BASE_URL must be an origin URL without a path, query, or fragment.');
  }

  const clientId = environ.EDBODY_OIDC_CLIENT_ID.trim();
  if (clientId.length > 255 || /[\r\n]/.test(clientId)) {
    throw new OidcConfigurationError('EDBODY_OIDC_CLIENT_ID is invalid.');
  }

  const rawScope = (environ.EDBODY_OIDC_SCOPE || DEFAULT_SCOPE).trim();
  const scopes = Array.from(new Set(rawScope.split(/\s+/).filter(Boolean)));
  if (!scopes.includes('openid')) scopes.unshift('openid');
  if (!scopes.length || scopes.some((scope) => !/^[A-Za-z0-9:._/-]{1,128}$/.test(scope))) {
    throw new OidcConfigurationError('EDBODY_OIDC_SCOPE contains an invalid scope token.');
  }

  return Object.freeze({
    issuer: issuerUrl.toString(),
    clientId,
    audience: audienceUrl.toString(),
    apiBaseUrl: apiUrl.origin,
    scope: scopes.join(' '),
  });
}

function discoveryUrl(issuer) {
  return issuer.replace(/\/+$/, '') + '/.well-known/openid-configuration';
}

async function fetchJson(fetchImpl, url, { timeoutMs = 10000, headers = {} } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json', ...headers },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new OidcFlowError('Could not securely contact the configured identity provider.');
  }
  if (!response || !response.ok) {
    throw new OidcFlowError('The identity provider returned an unsuccessful discovery or key response.');
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new OidcFlowError('The identity provider returned invalid JSON metadata.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new OidcFlowError('The identity provider returned invalid metadata.');
  }
  return data;
}

function requireHttpsEndpoint(value, name, { allowQuery = true } = {}) {
  let url;
  try {
    url = parseUrl(value, name, { allowQuery });
  } catch {
    throw new OidcFlowError('Identity-provider metadata contains an invalid ' + name + '.');
  }
  return url.toString();
}

async function discoverProvider(config, fetchImpl = fetch) {
  const metadata = await fetchJson(fetchImpl, discoveryUrl(config.issuer));
  if (metadata.issuer !== config.issuer) {
    throw new OidcFlowError('The identity-provider issuer does not exactly match EDBODY_OIDC_ISSUER.');
  }
  const authorizationEndpoint = requireHttpsEndpoint(metadata.authorization_endpoint, 'authorization endpoint');
  const tokenEndpoint = requireHttpsEndpoint(metadata.token_endpoint, 'token endpoint');
  const jwksUri = requireHttpsEndpoint(metadata.jwks_uri, 'JWKS URI', { allowQuery: false });
  if (Array.isArray(metadata.response_types_supported) && !metadata.response_types_supported.includes('code')) {
    throw new OidcFlowError('The identity provider does not advertise authorization-code support.');
  }
  if (Array.isArray(metadata.grant_types_supported) && !metadata.grant_types_supported.includes('authorization_code')) {
    throw new OidcFlowError('The identity provider does not advertise the authorization-code grant.');
  }
  if (Array.isArray(metadata.code_challenge_methods_supported) &&
      !metadata.code_challenge_methods_supported.includes('S256')) {
    throw new OidcFlowError('The identity provider does not support PKCE S256.');
  }
  return Object.freeze({
    ...metadata,
    authorization_endpoint: authorizationEndpoint,
    token_endpoint: tokenEndpoint,
    jwks_uri: jwksUri,
  });
}

function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function constantTimeEquals(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function buildAuthorizationUrl(metadata, config, params) {
  const url = new URL(metadata.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', config.scope);
  url.searchParams.set('state', params.state);
  url.searchParams.set('nonce', params.nonce);
  url.searchParams.set('code_challenge', params.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // RFC 8707 resource indicator: the API must issue an access token whose
  // audience matches EDBODY_OIDC_AUDIENCE. No provider-specific audience hint.
  url.searchParams.set('resource', config.audience);
  return url.toString();
}

function startLoopbackReceiver({ expectedState, timeoutMs = 180000, httpModule = http } = {}) {
  const callbackPath = CALLBACK_PATH;
  let resolveResponse;
  let rejectResponse;
  let resolveReady;
  let rejectReady;
  let settled = false;
  let readySettled = false;
  let timer;
  const responsePromise = new Promise((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // Attach observers immediately; caller still receives rejection when awaiting either original promise.
  responsePromise.catch(() => {});
  readyPromise.catch(() => {});

  const server = httpModule.createServer((request, response) => {
    const remote = request.socket.remoteAddress || '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' });
      response.end('This callback is available only on this computer.');
      return;
    }
    let url;
    try {
      url = new URL(request.url || '/', 'http://127.0.0.1');
    } catch {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' });
      response.end('Invalid sign-in callback.');
      return;
    }
    const expectedHost = '127.0.0.1:' + addressPort;
    if (request.method !== 'GET' || url.pathname !== callbackPath || request.headers.host !== expectedHost) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' });
      response.end('Callback not found.');
      return;
    }
    const receivedState = url.searchParams.get('state');
    if (!constantTimeEquals(receivedState, expectedState)) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' });
      response.end('Sign-in state validation failed. Return to EDBODY and try again.');
      return;
    }
    const oauthError = url.searchParams.get('error');
    if (oauthError) {
      response.writeHead(400, { 'content-type': 'text/html; charset=utf-8', connection: 'close', 'cache-control': 'no-store' });
      response.end('<!doctype html><title>EDBODY sign-in</title><p>Sign-in was not completed. Return to EDBODY.</p>');
      finish(rejectResponse, new OidcFlowError('The identity provider did not complete sign-in (' + oauthError.slice(0, 80) + ').'));
      return;
    }
    const code = url.searchParams.get('code');
    if (!code || code.length > 8192) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' });
      response.end('The identity provider did not return an authorization code.');
      finish(rejectResponse, new OidcFlowError('The identity provider did not return a valid authorization code.'));
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'pragma': 'no-cache',
      'referrer-policy': 'no-referrer',
      'connection': 'close',
    });
    response.end('<!doctype html><html><head><meta charset="utf-8"><title>EDBODY sign-in</title></head><body><p>Sign-in response received. You may return to EDBODY.</p></body></html>');
    finish(resolveResponse, { code, redirectUri });
  });

  let addressPort = 0;
  let redirectUri = '';
  function finish(settle, value) {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    try { server.close(); } catch {}
    settle(value);
  }
  server.on('error', (error) => {
    const wrapped = new OidcFlowError('Could not start the local sign-in callback listener: ' + error.message);
    if (!readySettled) {
      readySettled = true;
      rejectReady(wrapped);
    }
    finish(rejectResponse, wrapped);
  });
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      const error = new OidcFlowError('Could not allocate a local callback port.');
      if (!readySettled) {
        readySettled = true;
        rejectReady(error);
      }
      finish(rejectResponse, error);
      return;
    }
    addressPort = address.port;
    redirectUri = 'http://127.0.0.1:' + addressPort + callbackPath;
    timer = setTimeout(() => finish(rejectResponse, new OidcFlowError('Sign-in timed out. Return to EDBODY and try again.')), timeoutMs);
    readySettled = true;
    resolveReady();
  });

  return {
    ready: readyPromise,
    response: responsePromise,
    close() {
      if (!settled) finish(rejectResponse, new OidcFlowError('Sign-in was cancelled.'));
      try { server.close(); } catch {}
    },
    get redirectUri() { return redirectUri; },
  };
}

function decodeJwtPart(part) {
  if (typeof part !== 'string' || !part || !/^[A-Za-z0-9_-]+$/.test(part)) {
    throw new OidcFlowError('The identity provider returned a malformed ID token.');
  }
  const text = Buffer.from(part, 'base64url').toString('utf8');
  if (text.length > MAX_ID_TOKEN_BYTES) throw new OidcFlowError('The identity provider returned an oversized ID token.');
  try {
    return JSON.parse(text);
  } catch {
    throw new OidcFlowError('The identity provider returned an invalid ID token.');
  }
}

async function verifyIdToken(idToken, { config, metadata, expectedNonce, fetchImpl = fetch, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (typeof idToken !== 'string' || idToken.length > MAX_ID_TOKEN_BYTES * 3) {
    throw new OidcFlowError('The identity provider did not return a valid ID token.');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new OidcFlowError('The identity provider returned a malformed ID token.');
  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || header.crit) {
    throw new OidcFlowError('The ID token uses an unsupported signing algorithm or header.');
  }

  const jwks = await fetchJson(fetchImpl, metadata.jwks_uri);
  if (!Array.isArray(jwks.keys)) throw new OidcFlowError('The identity provider returned an invalid signing-key set.');
  const key = jwks.keys.find((candidate) =>
    candidate && candidate.kid === header.kid && candidate.kty === 'RSA' &&
    (!candidate.use || candidate.use === 'sig') && (!candidate.alg || candidate.alg === 'RS256') &&
    typeof candidate.n === 'string' && typeof candidate.e === 'string'
  );
  if (!key) throw new OidcFlowError('The ID token signing key was not found in the configured provider JWKS.');

  let publicKey;
  let validSignature = false;
  try {
    publicKey = crypto.createPublicKey({ key, format: 'jwk' });
    validSignature = crypto.verify(
      'RSA-SHA256',
      Buffer.from(parts[0] + '.' + parts[1]),
      publicKey,
      Buffer.from(parts[2], 'base64url'),
    );
  } catch {
    throw new OidcFlowError('The ID token signature could not be verified.');
  }
  if (!validSignature) throw new OidcFlowError('The ID token signature is invalid.');

  const aud = claims.aud;
  const audienceMatches = aud === config.clientId || (Array.isArray(aud) && aud.includes(config.clientId));
  if (
    claims.iss !== config.issuer ||
    !audienceMatches ||
    (Array.isArray(aud) && aud.length > 1 && claims.azp !== config.clientId) ||
    (claims.azp !== undefined && claims.azp !== config.clientId) ||
    typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 ||
    typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= nowSeconds - CLOCK_SKEW_SECONDS ||
    typeof claims.iat !== 'number' || !Number.isFinite(claims.iat) || claims.iat > nowSeconds + CLOCK_SKEW_SECONDS ||
    !constantTimeEquals(claims.nonce, expectedNonce) ||
    (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || !Number.isFinite(claims.nbf) || claims.nbf > nowSeconds + CLOCK_SKEW_SECONDS))
  ) {
    throw new OidcFlowError('The ID token failed issuer, audience, time, subject, or nonce validation.');
  }
  return { subject: claims.sub };
}

async function exchangeAuthorizationCode({ fetchImpl = fetch, metadata, config, code, redirectUri, verifier }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  let response;
  try {
    response = await fetchImpl(metadata.token_endpoint, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new OidcFlowError('Could not securely exchange the sign-in code with the identity provider.');
  }
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || !payload || typeof payload !== 'object') {
    throw new OidcFlowError('The identity provider rejected the authorization-code exchange.');
  }
  if (
    typeof payload.access_token !== 'string' || !payload.access_token ||
    typeof payload.id_token !== 'string' ||
    typeof payload.token_type !== 'string' || payload.token_type.toLowerCase() !== 'bearer' ||
    typeof payload.expires_in !== 'number' || !Number.isFinite(payload.expires_in) ||
    payload.expires_in <= 0 || payload.expires_in > 86400
  ) {
    throw new OidcFlowError('The identity provider returned an unsupported token response.');
  }
  return { accessToken: payload.access_token, idToken: payload.id_token, expiresIn: payload.expires_in };
}

async function authorizeWithOidc({
  config,
  openExternal,
  fetchImpl = fetch,
  timeoutMs = 180000,
  httpModule = http,
  randomBytes = crypto.randomBytes,
  nowSeconds,
}) {
  if (typeof openExternal !== 'function') throw new TypeError('openExternal callback is required.');
  const metadata = await discoverProvider(config, fetchImpl);
  const pkce = createPkcePair();
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const receiver = startLoopbackReceiver({ expectedState: state, timeoutMs, httpModule });

  try {
    // Wait for listener to bind before building the exact dynamic redirect URI.
    await receiver.ready;
    const authorizationUrl = buildAuthorizationUrl(metadata, config, {
      redirectUri: receiver.redirectUri, state, nonce, challenge: pkce.challenge,
    });
    try {
      await openExternal(authorizationUrl);
    } catch {
      throw new OidcFlowError('Could not open the system browser for sign-in.');
    }
    const callback = await receiver.response;
    const tokens = await exchangeAuthorizationCode({
      fetchImpl, metadata, config, code: callback.code, redirectUri: callback.redirectUri, verifier: pkce.verifier,
    });
    const identity = await verifyIdToken(tokens.idToken, {
      config, metadata, expectedNonce: nonce, fetchImpl,
      ...(Number.isFinite(nowSeconds) ? { nowSeconds } : {}),
    });
    return {
      accessToken: tokens.accessToken,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
      subject: identity.subject,
    };
  } finally {
    receiver.close();
  }
}

module.exports = {
  OidcConfigurationError,
  OidcFlowError,
  readDesktopConfig,
  discoveryUrl,
  discoverProvider,
  createPkcePair,
  buildAuthorizationUrl,
  startLoopbackReceiver,
  verifyIdToken,
  exchangeAuthorizationCode,
  authorizeWithOidc,
};
