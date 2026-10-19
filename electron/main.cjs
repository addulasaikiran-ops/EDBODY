const { app, BrowserWindow, dialog, ipcMain, protocol } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { Readable } = require('node:stream');
const { isTrustedRendererUrl, isTrustedIpcSender } = require('./security.cjs');
const anatomyAtlas = require('../tools/anatomy-atlas/integration.cjs');
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

protocol.registerSchemesAsPrivileged([{ scheme: 'edbody-atlas', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

let selectedScanPath = null;
let selectedOutputDirectory = null;
let activeSegmentationChild = null;
let segmentationJobStarting = false;
let segmentationCancelRequested = false;
let atlasBuildPromise = null;

function anatomyAtlasDataDir() {
  return path.join(app.getPath('userData'), 'anatomy-atlas');
}

function rendererSecurityOptions() {
  return {
    isDev,
    devServerUrl: process.env.VITE_DEV_SERVER_URL,
    rendererFilePath: path.join(__dirname, '..', 'dist', 'index.html'),
  };
}

function registerTrustedIpcHandler(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedIpcSender(event, rendererSecurityOptions())) {
      throw new Error('Blocked IPC request from an untrusted renderer.');
    }
    return handler(event, ...args);
  });
}

function broadcastAnatomyAtlasProgress(progress) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('anatomy-atlas:progress', progress);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1480, height: 940, minWidth: 1050, minHeight: 700,
    backgroundColor: '#0a1018', title: 'EDBODY — Human Digital Twin', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  const trustedRendererOptions = rendererSecurityOptions();
  const preventUntrustedNavigation = (event, navigationUrl) => {
    if (!isTrustedRendererUrl(navigationUrl, trustedRendererOptions)) event.preventDefault();
  };
  win.webContents.on('will-navigate', preventUntrustedNavigation);
  win.webContents.on('will-redirect', preventUntrustedNavigation);
  // The application currently has no renderer-triggered external-link workflow.
  // Deny popups instead of forwarding arbitrary renderer-controlled URLs to the OS.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // CI-only smoke mode verifies the packaged renderer can load and React mounts.
  // It does not exercise native dialogs or clinical functionality.
  if (process.env.EDBODY_SMOKE_TEST === '1') {
    win.webContents.on('console-message', (_event, details) => {
      console.log('EDBODY_RENDERER_CONSOLE', JSON.stringify(details));
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('EDBODY_RENDER_PROCESS_GONE', JSON.stringify(details));
      app.exit(1);
    });
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame) {
        console.error('EDBODY_SMOKE_TEST_FAIL: main frame failed to load', {
          errorCode, errorDescription, validatedURL,
        });
        app.exit(1);
      }
    });
    win.webContents.once('did-finish-load', async () => {
      try {
        const smokeScript = [
          "new Promise((resolve) => {",
          "const deadline = Date.now() + 15000;",
          "const poll = () => {",
          "const root = document.getElementById('root');",
          "if (root && root.childElementCount > 0) return resolve({ok: true, title: document.title, rootChildren: root.childElementCount, href: location.href});",
          "if (Date.now() >= deadline) return resolve({ok: false, title: document.title, rootChildren: root ? root.childElementCount : 0, href: location.href, readyState: document.readyState, scripts: Array.from(document.scripts).map((script) => script.src), rootHtml: root ? root.innerHTML.slice(0, 500) : null});",
          "setTimeout(poll, 100);",
          "}; poll();",
          "})",
        ].join('');
        const result = await win.webContents.executeJavaScript(smokeScript);
        if (!result.ok || result.title !== 'EDBODY — Human Digital Twin') {
          console.error('EDBODY_SMOKE_TEST_FAIL: renderer did not mount as expected', result);
          app.exit(1);
          return;
        }
        console.log('EDBODY_SMOKE_TEST_PASS', JSON.stringify(result));
        app.exit(0);
      } catch (error) {
        console.error('EDBODY_SMOKE_TEST_FAIL:', error);
        app.exit(1);
      }
    });
  }

  if (isDev) win.loadURL(process.env.VITE_DEV_SERVER_URL); else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function totalSegmentatorCommand() {
  return process.env.EDBODY_TOTALSEGMENTATOR_CMD || (process.platform === 'win32' ? 'TotalSegmentator.exe' : 'TotalSegmentator');
}

function publishSegmentationProgress(event, message) {
  if (!event.sender.isDestroyed()) event.sender.send('totalsegmentator:progress', String(message).slice(0, 2000));
}

async function validateScanInput(candidate) {
  const info = await fs.stat(candidate);
  if (info.isDirectory()) {
    const entries = await fs.readdir(candidate);
    if (!entries.length) throw new Error('The selected DICOM folder is empty.');
    return { kind: 'directory', path: candidate };
  }
  const lower = candidate.toLowerCase();
  if (!lower.endsWith('.nii') && !lower.endsWith('.nii.gz') && !lower.endsWith('.zip')) {
    throw new Error('Choose a NIfTI image (.nii/.nii.gz), a ZIP of DICOM slices, or a folder containing one scan’s DICOM slices.');
  }
  return { kind: 'file', path: candidate };
}

async function checkTotalSegmentator() {
  const command = totalSegmentatorCommand();
  return await new Promise((resolve) => {
    let settled = false;
    let output = '';
    let child;
    let timer;
    const finish = (available, message) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ available, command, message });
    };
    try {
      child = spawn(command, ['--help'], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      finish(false, String(error));
      return;
    }
    const collect = (chunk) => { if (output.length < 8000) output += chunk.toString().slice(0, 8000 - output.length); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => finish(false, 'Could not start TotalSegmentator. Install it in a Python environment available on PATH, or set EDBODY_TOTALSEGMENTATOR_CMD. ' + error.message));
    child.on('close', (code) => {
      const looksInstalled = /totalsegmentator|usage:|--task|--fast/i.test(output);
      finish(code === 0 || looksInstalled, code === 0 || looksInstalled
        ? 'TotalSegmentator command responded to --help.'
        : 'TotalSegmentator did not respond successfully. Check the Python environment and command path.');
    });
    timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish(false, 'Timed out checking TotalSegmentator. Check the installation and command path.');
    }, 15000);
  });
}

registerTrustedIpcHandler('totalsegmentator:check', async () => checkTotalSegmentator());

registerTrustedIpcHandler('totalsegmentator:choose-input', async () => {
  const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    title: 'Select one CT or MRI scan',
    properties: ['openFile', 'openDirectory'],
    filters: [{ name: 'NIfTI or DICOM archive', extensions: ['nii', 'gz', 'zip'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { cancelled: true };
  try {
    const selection = await validateScanInput(result.filePaths[0]);
    selectedScanPath = selection.path;
    return { cancelled: false, path: selection.path, kind: selection.kind };
  } catch (error) {
    selectedScanPath = null;
    return { cancelled: false, error: error.message || String(error) };
  }
});

registerTrustedIpcHandler('totalsegmentator:choose-output', async () => {
  const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    title: 'Choose a parent folder for segmentation results',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return { cancelled: true };
  selectedOutputDirectory = result.filePaths[0];
  return { cancelled: false, path: selectedOutputDirectory };
});

registerTrustedIpcHandler('totalsegmentator:cancel', async () => {
  if (!activeSegmentationChild) return { cancelled: false };
  segmentationCancelRequested = true;
  try { activeSegmentationChild.kill(); } catch {}
  return { cancelled: true };
});

registerTrustedIpcHandler('totalsegmentator:run', async (event, options) => {
  if (segmentationJobStarting || activeSegmentationChild) return { ok: false, error: 'A segmentation job is already running.' };
  if (!selectedScanPath || !selectedOutputDirectory) return { ok: false, error: 'Select a scan and output folder first.' };
  segmentationJobStarting = true;
  const modality = options && options.modality === 'mr' ? 'mr' : 'ct';
  const fast = !options || options.fast !== false;
  try {
    const selection = await validateScanInput(selectedScanPath);
    const outBase = await fs.stat(selectedOutputDirectory);
    if (!outBase.isDirectory()) return { ok: false, error: 'The output location is not a folder.' };
    if (selection.kind === 'directory') {
      const relative = path.relative(path.resolve(selection.path), path.resolve(selectedOutputDirectory));
      if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
        return { ok: false, error: 'Choose an output folder outside the selected DICOM input folder.' };
      }
    }
    const ready = await checkTotalSegmentator();
    if (!ready.available) return { ok: false, error: ready.message };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(selectedOutputDirectory, 'EDBODY_Segmentation_' + stamp);
    await fs.mkdir(outputPath, { recursive: false });
    const args = ['-i', selectedScanPath, '-o', outputPath];
    if (modality === 'mr') args.push('--task', 'total_mr');
    if (fast) args.push('--fast');

    publishSegmentationProgress(event, 'Starting TotalSegmentator (' + modality.toUpperCase() + (fast ? ', fast mode).' : ', full mode).'));
    publishSegmentationProgress(event, 'Input is processed locally. The first run may need to download model weights.');
    segmentationCancelRequested = false;

    const result = await new Promise((resolve) => {
      let settled = false;
      let combinedOutput = '';
      let pending = '';
      let child;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        activeSegmentationChild = null;
        resolve(value);
      };
      const handleChunk = (chunk) => {
        const text = chunk.toString();
        combinedOutput = (combinedOutput + text).slice(-12000);
        pending += text;
        const lines = pending.split(/[\r\n]+/);
        pending = lines.pop() || '';
        lines.filter(Boolean).forEach((line) => publishSegmentationProgress(event, line));
      };
      try {
        child = spawn(ready.command, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error) {
        finish({ ok: false, error: 'Unable to launch TotalSegmentator: ' + error.message });
        return;
      }
      activeSegmentationChild = child;
      child.stdout.on('data', handleChunk);
      child.stderr.on('data', handleChunk);
      child.on('error', (error) => finish({ ok: false, error: 'Unable to launch TotalSegmentator: ' + error.message }));
      child.on('close', async (code) => {
        if (pending.trim()) publishSegmentationProgress(event, pending.trim());
        if (segmentationCancelRequested) {
          finish({ ok: false, cancelled: true, error: 'Segmentation was cancelled. Any partial output remains in the selected local output folder.', outputPath });
          return;
        }
        if (code !== 0) {
          finish({ ok: false, error: 'TotalSegmentator exited with code ' + code + '. Review the log for details.', outputPath, details: combinedOutput.slice(-3500) });
          return;
        }
        try {
          const files = await fs.readdir(outputPath);
          publishSegmentationProgress(event, 'Finished. Created ' + files.length + ' output file(s).');
          finish({ ok: true, outputPath, outputCount: files.length, modality, fast });
        } catch (error) {
          finish({ ok: false, error: 'Segmentation finished but outputs could not be listed: ' + error.message, outputPath });
        }
      });
    });
    return result;
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  } finally {
    segmentationJobStarting = false;
  }
});


registerTrustedIpcHandler('anatomy-atlas:status', async () => anatomyAtlas.status(anatomyAtlasDataDir()));

registerTrustedIpcHandler('anatomy-atlas:prepare', async () => {
  if (!atlasBuildPromise) {
    atlasBuildPromise = anatomyAtlas.prepareAtlas({
      dataDir: anatomyAtlasDataDir(),
      onProgress: broadcastAnatomyAtlasProgress,
    }).catch((error) => {
      broadcastAnatomyAtlasProgress({ phase: 'error', message: error.message || String(error) });
      throw error;
    });
  }
  const job = atlasBuildPromise;
  try {
    return await job;
  } finally {
    if (atlasBuildPromise === job) atlasBuildPromise = null;
  }
});

app.whenReady().then(() => {
  protocol.handle('edbody-atlas', async (request) => {
    const url = new URL(request.url);
    const filename = decodeURIComponent(url.pathname).split('/').filter(Boolean).join('/');
    if (url.hostname !== 'local' || !['index.json', 'meshes.bin'].includes(filename)) {
      return new Response('Not found', { status: 404 });
    }
    const file = path.join(anatomyAtlasDataDir(), 'build', filename);
    try {
      const stat = fsSync.statSync(file);
      if (!stat.isFile()) return new Response('Not found', { status: 404 });
      const mime = filename.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream';
      return new Response(Readable.toWeb(fsSync.createReadStream(file)), {
        headers: { 'content-type': mime, 'content-length': String(stat.size), 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
      });
    } catch {
      return new Response('Atlas not installed', { status: 404 });
    }
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
