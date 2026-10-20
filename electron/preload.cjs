const { contextBridge, ipcRenderer } = require('electron');

// Patient scan paths are chosen by native dialogs in the main process. The renderer
// never receives direct filesystem access and cannot supply arbitrary paths to jobs.
contextBridge.exposeInMainWorld('edbodyDesktop', {
  platform: process.platform,
  version: '0.1.0',
  shell: 'electron',
  // Authentication responses are sanitized status only; bearer tokens remain in main-process memory.
  getAuthStatus: () => ipcRenderer.invoke('auth:status'),
  signIn: () => ipcRenderer.invoke('auth:sign-in'),
  signOut: () => ipcRenderer.invoke('auth:sign-out'),
  anatomyAtlasStatus: () => ipcRenderer.invoke('anatomy-atlas:status'),
  prepareAnatomyAtlas: () => ipcRenderer.invoke('anatomy-atlas:prepare'),
  onAnatomyAtlasProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('anatomy-atlas:progress', listener);
    return () => ipcRenderer.removeListener('anatomy-atlas:progress', listener);
  },
  checkTotalSegmentator: () => ipcRenderer.invoke('totalsegmentator:check'),
  chooseScanInput: () => ipcRenderer.invoke('totalsegmentator:choose-input'),
  chooseOutputDirectory: () => ipcRenderer.invoke('totalsegmentator:choose-output'),
  runTotalSegmentator: (options) => ipcRenderer.invoke('totalsegmentator:run', options),
  cancelTotalSegmentator: () => ipcRenderer.invoke('totalsegmentator:cancel'),
  onTotalSegmentatorProgress: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('totalsegmentator:progress', listener);
    return () => ipcRenderer.removeListener('totalsegmentator:progress', listener);
  }
});
