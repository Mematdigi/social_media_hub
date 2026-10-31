# SocialHub Desktop (Electron)

The SocialHub website packaged as a desktop app for **Windows, macOS and Linux**.
It is built from this repository's own `frontend/` folder, so every page, feature and future change
of the website is in the app — Dashboard, Posts, Composer + AI suggestions, AI Agent, Scheduler, Inbox,
Analytics and Accounts.

## Quick start

Requirements: Node.js 20+.

```bash
cd desktop
npm install
npm run build:web     # builds ../frontend and copies it into desktop/web-build
npm start             # opens the app
```

## Build installers

```bash
npm run dist:win      # Windows  → dist/SocialHub Setup 1.0.0.exe
npm run dist:mac      # macOS    → dist/SocialHub-1.0.0.dmg      (run on a Mac)
npm run dist:linux    # Linux    → dist/SocialHub-1.0.0.AppImage and .deb
```

Each `dist` command rebuilds the website first, so installers always contain the latest frontend.
Building a macOS installer must be done on a Mac; Windows installers are easiest to build on Windows.
For public distribution, sign the installers (Windows code-signing certificate / Apple Developer ID).

## Modes

| Mode | How | What it loads |
|---|---|---|
| `bundled` (default) | `npm start` | The website built from `../frontend`, served from a private `app://socialhub` origin. Fast start, no web server needed. |
| `remote` | `npm run start:remote` | The hosted website (`webUrl` in `config.json`). Always the live version, nothing to rebuild. |
| `dev` | `npm run dev` | The React dev server (`npm start` in `../frontend`, port 3000) for live development. |

If `web-build/` is missing, the app falls back to `remote` mode automatically.

## Configuration — `config.json`

```json
{
  "mode": "bundled",
  "apiUrl": "https://media.mematdigi.com",
  "webUrl": "https://media.mematdigi.com",
  "devUrl": "http://localhost:3000"
}
```

- `apiUrl` is baked into the website build (`REACT_APP_BACKEND_URL`) and used for CORS handling.
- `webUrl` must match the backend's `FRONTEND_URL`, so OAuth redirects come back into the app.
- Installed apps can be re-configured without rebuilding: put a `config.json` in the settings folder
  (menu **File → Open Settings Folder**). Environment variables `SOCIALHUB_API_URL` / `SOCIALHUB_WEB_URL` also work.

## How it works with your backend (no backend changes needed)

- **CORS:** the backend only allows the website's domain, and helmet sends
  `Cross-Origin-Resource-Policy: same-origin`. In bundled mode the app adds the correct CORS/CORP headers
  to responses from `apiUrl`, so API calls and uploaded images work from `app://socialhub`.
  If you prefer to do it on the server, add `app://socialhub` to `CORS_ORIGINS`.
- **Connecting accounts (OAuth):** the website sends you to the platform's sign-in page; when the backend
  redirects to `FRONTEND_URL/accounts?connected=…` the app catches that and shows it inside the app.
  Threads-style popups open as a child window so `postMessage` still reaches the app.
- **Sign-in** is stored in the app's own local storage (`socialhub_token`), separate from your browser.

## Desktop extras

- Menu shortcuts: **Ctrl/Cmd+N** new post, **Ctrl/Cmd+1…7** Dashboard, Posts, AI Agent, Scheduler, Inbox, Analytics, Accounts.
- Remembers window size and position, single instance, spell-check with suggestions, right-click copy/paste.
- External links open in your normal browser; an offline page with “Try again” appears if the network drops.
- The website can detect the app via `window.socialhubDesktop.isDesktop`.

## Security

`contextIsolation`, `sandbox` and no Node.js in the page; only a tiny read-only bridge (`preload.js`) is exposed.
