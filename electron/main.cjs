const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
function createWindow() {
  const win = new BrowserWindow({
    width: 1480, height: 940, minWidth: 1050, minHeight: 700,
    backgroundColor: '#0a1018', title: 'EDBODY — Human Digital Twin', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
  if (isDev) win.loadURL(process.env.VITE_DEV_SERVER_URL); else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}
app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });