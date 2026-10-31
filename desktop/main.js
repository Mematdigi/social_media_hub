// SocialHub desktop app (Electron)
//
// Modes (config.json "mode", or command-line flags):
//   bundled (default) — serves the website built from ../frontend (web-build/) from a private app:// origin.
//                       Starts instantly, works with the live backend, no web server needed.
//   remote  (--remote) — loads the hosted website (config.webUrl) directly.
//   dev     (--dev)    — loads the CRA dev server (config.devUrl, `npm start` in ../frontend).
const {
  app, BrowserWindow, Menu, net, protocol, session, shell, ipcMain, dialog, nativeImage,
} = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SCHEME = 'app';
const HOST = 'socialhub';
const APP_ORIGIN = `${SCHEME}://${HOST}`;
const WEB_ROOT = path.join(__dirname, 'web-build');
const ICON = path.join(__dirname, 'assets', 'icon.png');

// ── Configuration ─────────────────────────────────────────────────────────────
function loadConfig() {
  const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } };
  const base = read(path.join(__dirname, 'config.json'));
  // Users can override settings without rebuilding: <userData>/config.json
  const user = read(path.join(app.getPath('userData'), 'config.json'));
  const cfg = { mode: 'bundled', apiUrl: 'https://media.mematdigi.com', webUrl: 'https://media.mematdigi.com', devUrl: 'http://localhost:3000', ...base, ...user };
  if (process.env.SOCIALHUB_API_URL) cfg.apiUrl = process.env.SOCIALHUB_API_URL;
  if (process.env.SOCIALHUB_WEB_URL) cfg.webUrl = process.env.SOCIALHUB_WEB_URL;
  if (process.argv.includes('--remote')) cfg.mode = 'remote';
  if (process.argv.includes('--dev')) cfg.mode = 'dev';
  if (cfg.mode === 'bundled' && !fs.existsSync(path.join(WEB_ROOT, 'index.html'))) {
    console.warn('[SocialHub] web-build/ not found — run `npm run build:web`. Falling back to remote mode.');
    cfg.mode = 'remote';
  }
  cfg.apiUrl = cfg.apiUrl.replace(/\/+$/, '');
  cfg.webUrl = cfg.webUrl.replace(/\/+$/, '');
  return cfg;
}

let config;
let mainWindow = null;

// app:// must be registered before the app is ready so it behaves like https (localStorage, fetch, etc.)
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const safeOrigin = (url) => { try { return new URL(url).origin; } catch { return ''; } };
const startOrigin = () => (config.mode === 'bundled' ? APP_ORIGIN : safeOrigin(config.mode === 'dev' ? config.devUrl : config.webUrl));
const startUrl = (route = '/dashboard') =>
  config.mode === 'bundled' ? `${APP_ORIGIN}${route}` : `${config.mode === 'dev' ? config.devUrl : config.webUrl}${route}`;

// ── Serve the bundled website from app://socialhub ───────────────────────────
function registerAppProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    let rel = decodeURIComponent(pathname);
    let filePath = path.normalize(path.join(WEB_ROOT, rel));
    if (!filePath.startsWith(WEB_ROOT)) return new Response('Forbidden', { status: 403 });

    const exists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    if (!exists) {
      // Missing asset → 404; any other path is a React route → index.html (SPA fallback)
      if (path.extname(rel)) return new Response('Not found', { status: 404 });
      filePath = path.join(WEB_ROOT, 'index.html');
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

// ── Let the bundled app call the API from its app:// origin ───────────────────
// The backend's CORS list and helmet's Cross-Origin-Resource-Policy only allow the
// website's own domain; inside the app we add the right headers for API responses.
function allowApiFromAppOrigin() {
  const apiOrigin = safeOrigin(config.apiUrl);
  if (!apiOrigin) return;
  session.defaultSession.webRequest.onHeadersReceived({ urls: [`${apiOrigin}/*`] }, (details, callback) => {
    const headers = { ...(details.responseHeaders || {}) };
    // Every request to the API in this app comes from our own windows; page navigations are left alone
    if (details.resourceType !== 'mainFrame') {
      for (const key of Object.keys(headers)) {
        if (/^access-control-allow-(origin|credentials|headers|methods)$/i.test(key) || /^cross-origin-resource-policy$/i.test(key)) {
          delete headers[key];
        }
      }
      headers['Access-Control-Allow-Origin'] = [APP_ORIGIN];
      headers['Access-Control-Allow-Credentials'] = ['true'];
      headers['Access-Control-Allow-Headers'] = ['Authorization, Content-Type, X-Requested-With, Accept'];
      headers['Access-Control-Allow-Methods'] = ['GET, POST, PUT, PATCH, DELETE, OPTIONS'];
      headers['Cross-Origin-Resource-Policy'] = ['cross-origin'];
    }
    // Some servers answer CORS preflights with an error status when the origin isn't listed
    if (details.method === 'OPTIONS' && details.statusCode >= 400) {
      callback({ responseHeaders: headers, statusLine: 'HTTP/1.1 204 No Content' });
      return;
    }
    callback({ responseHeaders: headers });
  });
}

// After OAuth the backend redirects to FRONTEND_URL/accounts?connected=… — bring that back into the app
function mapWebUrlToApp(url) {
  if (config.mode !== 'bundled') return null;
  try {
    const u = new URL(url);
    const webOrigin = safeOrigin(config.webUrl);
    if (u.origin === webOrigin && !u.pathname.startsWith('/api/') && !u.pathname.startsWith('/uploads/')) {
      return `${APP_ORIGIN}${u.pathname}${u.search}${u.hash}`;
    }
  } catch { /* ignore */ }
  return null;
}

const isOAuthPopup = (url, frameName = '') => {
  if (!url || url === 'about:blank') return true;
  if (/oauth/i.test(frameName)) return true; // e.g. window.open(url, 'threads_oauth', …) in the website
  try {
    const u = new URL(url);
    return u.origin === safeOrigin(config.apiUrl) && /\/api\/accounts\/oauth\//.test(u.pathname);
  } catch { return false; }
};

const openExternal = (url) => {
  if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url);
};

// ── Window ────────────────────────────────────────────────────────────────────
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return { width: 1360, height: 860 }; }
}
function saveWindowState(win) {
  try {
    const bounds = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }));
  } catch { /* ignore */ }
}

function wireWebContents(contents) {
  const redirectIntoApp = (event, url) => {
    const mapped = mapWebUrlToApp(url);
    if (mapped) { event.preventDefault(); contents.loadURL(mapped); }
  };
  contents.on('will-navigate', redirectIntoApp);
  contents.on('will-redirect', redirectIntoApp);

  contents.setWindowOpenHandler(({ url, frameName }) => {
    if (isOAuthPopup(url, frameName)) {
      // Threads-style OAuth popup: keep window.opener so postMessage reaches the app
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 600, height: 720, parent: mainWindow, autoHideMenuBar: true, title: 'Connect account',
          webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
        },
      };
    }
    const mapped = url.startsWith(APP_ORIGIN) ? url : mapWebUrlToApp(url);
    if (mapped) { contents.loadURL(mapped); return { action: 'deny' }; }
    openExternal(url);
    return { action: 'deny' };
  });

  // Right-click menu: copy/paste and spelling suggestions
  contents.on('context-menu', (_e, params) => {
    const items = [];
    for (const s of params.dictionarySuggestions || []) items.push({ label: s, click: () => contents.replaceMisspelling(s) });
    if (params.misspelledWord) items.push({ label: 'Add to dictionary', click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord) }, { type: 'separator' });
    if (params.linkURL) items.push({ label: 'Open link in browser', click: () => openExternal(params.linkURL) }, { label: 'Copy link', click: () => require('electron').clipboard.writeText(params.linkURL) }, { type: 'separator' });
    if (params.mediaType === 'image' && params.srcURL) items.push({ label: 'Open image in browser', click: () => openExternal(params.srcURL) }, { type: 'separator' });
    if (params.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    else if (params.selectionText) items.push({ role: 'copy' });
    if (items.length) Menu.buildFromTemplate(items).popup();
  });

  contents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = aborted (normal during redirects)
    const offline = pathToFileURL(path.join(__dirname, 'offline.html')).toString();
    contents.loadURL(`${offline}?error=${encodeURIComponent(desc)}&retry=${encodeURIComponent(url || startUrl())}`);
  });
}

function createWindow() {
  const state = loadWindowState();
  mainWindow = new BrowserWindow({
    width: state.width || 1360,
    height: state.height || 860,
    x: state.x,
    y: state.y,
    minWidth: 380,
    minHeight: 560,
    title: 'SocialHub',
    icon: nativeImage.createFromPath(ICON),
    backgroundColor: '#F8FAFC',
    show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      additionalArguments: [`--socialhub-version=${app.getVersion()}`],
    },
  });
  if (state.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', () => saveWindowState(mainWindow));
  mainWindow.on('closed', () => { mainWindow = null; });

  wireWebContents(mainWindow.webContents);
  mainWindow.loadURL(startUrl('/dashboard'));
}

// Popups (OAuth) get the same navigation rules
app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() === 'window' && mainWindow && contents !== mainWindow.webContents) {
    contents.on('will-redirect', (event, url) => {
      const mapped = mapWebUrlToApp(url);
      if (mapped && mainWindow) {
        // OAuth finished inside a popup: close it and show the result in the main window
        event.preventDefault();
        mainWindow.loadURL(mapped);
        const win = BrowserWindow.fromWebContents(contents);
        if (win) win.close();
      }
    });
  }
});

// Navigate inside the React app without a full reload (React Router listens to popstate)
function goTo(route) {
  if (!mainWindow) return;
  const wc = mainWindow.webContents;
  const current = wc.getURL();
  if (current.startsWith(startOrigin())) {
    wc.executeJavaScript(`history.pushState({}, '', ${JSON.stringify(route)}); dispatchEvent(new PopStateEvent('popstate'));`).catch(() => wc.loadURL(startUrl(route)));
  } else {
    wc.loadURL(startUrl(route));
  }
  mainWindow.show();
  mainWindow.focus();
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const nav = (label, route, accelerator) => ({ label, accelerator, click: () => goTo(route) });
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        nav('New Post', '/posts/new', 'CmdOrCtrl+N'),
        { type: 'separator' },
        { label: 'Open in Browser', click: () => openExternal(`${config.webUrl}${mainWindow ? new URL(mainWindow.webContents.getURL()).pathname : '/dashboard'}`) },
        { label: 'Open Settings Folder', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Go',
      submenu: [
        nav('Dashboard', '/dashboard', 'CmdOrCtrl+1'),
        nav('Posts', '/posts', 'CmdOrCtrl+2'),
        nav('AI Agent', '/agent', 'CmdOrCtrl+3'),
        nav('Scheduler', '/scheduler', 'CmdOrCtrl+4'),
        nav('Inbox', '/inbox', 'CmdOrCtrl+5'),
        nav('Analytics', '/analytics', 'CmdOrCtrl+6'),
        nav('Accounts', '/accounts', 'CmdOrCtrl+7'),
        { type: 'separator' },
        { label: 'Back', accelerator: isMac ? 'Cmd+[' : 'Alt+Left', click: () => mainWindow && mainWindow.webContents.navigationHistory.goBack() },
        { label: 'Forward', accelerator: isMac ? 'Cmd+]' : 'Alt+Right', click: () => mainWindow && mainWindow.webContents.navigationHistory.goForward() },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Privacy Policy', click: () => goTo('/privacy-policy') },
        { label: 'Terms & Conditions', click: () => goTo('/terms-condition') },
        { type: 'separator' },
        {
          label: 'About SocialHub',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info', title: 'About SocialHub', icon: nativeImage.createFromPath(ICON),
            message: `SocialHub ${app.getVersion()}`,
            detail: `Mode: ${config.mode}\nServer: ${config.apiUrl}\nElectron ${process.versions.electron}`,
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });

  app.setAppUserModelId('com.mematdigi.socialhub');

  app.whenReady().then(() => {
    config = loadConfig();
    if (config.mode === 'bundled') {
      registerAppProtocol();
      allowApiFromAppOrigin();
    }
    ipcMain.on('open-external', (_e, url) => openExternal(url));
    buildMenu();
    createWindow();

    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
