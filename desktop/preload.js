// Runs before the web app loads. Exposes a tiny, read-only API so the website can
// tell it is running inside the desktop app (optional for the web code to use).
const { contextBridge, ipcRenderer } = require('electron');

let version = '';
try {
  const arg = (process.argv || []).find((a) => a.startsWith('--socialhub-version='));
  if (arg) version = arg.split('=')[1];
} catch {
  // sandboxed preload: argv may be unavailable
}

contextBridge.exposeInMainWorld('socialhubDesktop', {
  isDesktop: true,
  platform: process.platform,
  version,
  openExternal: (url) => ipcRenderer.send('open-external', String(url || '')),
});
