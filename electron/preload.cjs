const { contextBridge } = require('electron');
// Deliberately minimal: no filesystem or patient-data access is exposed to the renderer.
contextBridge.exposeInMainWorld('edbodyDesktop', { platform: process.platform, version: '0.1.0', shell: 'electron' });