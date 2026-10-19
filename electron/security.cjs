const path = require('node:path');
const { fileURLToPath } = require('node:url');

/**
 * Determines whether a URL points to EDBODY's own renderer document.
 * In development, only the configured loopback Vite origin is trusted.
 * In packaged mode, only the built index.html file is trusted.
 */
function isTrustedRendererUrl(candidate, options = {}) {
  if (typeof candidate !== 'string' || !candidate) return false;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }

  if (options.isDev) {
    let configured;
    try {
      configured = new URL(options.devServerUrl);
    } catch {
      return false;
    }

    const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
    if (
      configured.protocol !== 'http:' ||
      !loopbackHosts.has(configured.hostname) ||
      configured.username ||
      configured.password
    ) {
      return false;
    }

    return (
      parsed.origin === configured.origin &&
      parsed.protocol === 'http:' &&
      loopbackHosts.has(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  }

  if (parsed.protocol !== 'file:' || parsed.host !== '' || !options.rendererFilePath) {
    return false;
  }

  try {
    return path.resolve(fileURLToPath(parsed)) === path.resolve(options.rendererFilePath);
  } catch {
    return false;
  }
}

/** Only IPC messages from the trusted top-level EDBODY frame may use privileged APIs. */
function isTrustedIpcSender(event, options = {}) {
  if (!event || !event.sender || !event.senderFrame) return false;
  if (event.senderFrame !== event.sender.mainFrame) return false;
  return isTrustedRendererUrl(event.senderFrame.url, options);
}

module.exports = { isTrustedRendererUrl, isTrustedIpcSender };
