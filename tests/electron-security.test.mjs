import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import security from '../electron/security.cjs';

const rendererPath = path.resolve('/app/dist/index.html');
const productionOptions = { rendererFilePath: rendererPath };
const developmentOptions = {
  isDev: true,
  devServerUrl: 'http://127.0.0.1:5173/',
};

test('production trusts only the built renderer document', () => {
  assert.equal(
    security.isTrustedRendererUrl(pathToFileURL(rendererPath).href, productionOptions),
    true,
  );
  assert.equal(
    security.isTrustedRendererUrl(pathToFileURL('/app/other.html').href, productionOptions),
    false,
  );
  assert.equal(
    security.isTrustedRendererUrl('https://example.com/', productionOptions),
    false,
  );
  assert.equal(
    security.isTrustedRendererUrl('file://evil.example/app/dist/index.html', productionOptions),
    false,
  );
});

test('development trusts only the configured loopback origin', () => {
  assert.equal(
    security.isTrustedRendererUrl('http://127.0.0.1:5173/src/main.tsx', developmentOptions),
    true,
  );
  assert.equal(
    security.isTrustedRendererUrl('http://127.0.0.1:5174/', developmentOptions),
    false,
  );
  assert.equal(
    security.isTrustedRendererUrl('https://127.0.0.1:5173/', developmentOptions),
    false,
  );
  assert.equal(
    security.isTrustedRendererUrl('https://example.com/', developmentOptions),
    false,
  );
  assert.equal(
    security.isTrustedRendererUrl('http://user@127.0.0.1:5173/', developmentOptions),
    false,
  );
});

test('IPC trust requires the trusted top-level frame', () => {
  const mainFrame = { url: pathToFileURL(rendererPath).href };
  const event = { sender: { mainFrame }, senderFrame: mainFrame };
  assert.equal(security.isTrustedIpcSender(event, productionOptions), true);

  const subframe = { url: pathToFileURL(rendererPath).href };
  assert.equal(
    security.isTrustedIpcSender({ sender: { mainFrame }, senderFrame: subframe }, productionOptions),
    false,
  );
  assert.equal(
    security.isTrustedIpcSender(
      { sender: { mainFrame }, senderFrame: { url: 'https://example.com/' } },
      productionOptions,
    ),
    false,
  );
  assert.equal(security.isTrustedIpcSender({}, productionOptions), false);
});

test('Electron window keeps its required security settings and renderer CSP', async () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const mainSource = await readFile(path.join(repositoryRoot, 'electron/main.cjs'), 'utf8');
  const htmlSource = await readFile(path.join(repositoryRoot, 'index.html'), 'utf8');

  assert.match(mainSource, /contextIsolation:\s*true/);
  assert.match(mainSource, /nodeIntegration:\s*false/);
  assert.match(mainSource, /sandbox:\s*true/);
  assert.match(htmlSource, /Content-Security-Policy/);
  assert.match(htmlSource, /default-src 'self'/);
  assert.match(htmlSource, /object-src 'none'/);
});
