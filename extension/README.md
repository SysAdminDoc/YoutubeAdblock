# YoutubeAdblock — extension build

This is the Chrome / Firefox MV3 build of YoutubeAdblock. The core ad-blocking
engine is **generated** from [../YoutubeAdblock.user.js](../YoutubeAdblock.user.js)
by [../Build-Extension.ps1](../Build-Extension.ps1). Do not edit `main.js`
directly — your changes will be overwritten on the next build.

## Layout

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest, Chrome 111+ and Firefox 128+ compatible |
| `main.js` *(generated)* | Page-world (MAIN) content script — the ad-blocking engine |
| `bridge.js` | Isolated-world content script, relays `chrome.*` events/messages into the page-world via DOM `CustomEvent` |
| `background.js` | Service worker: toolbar action, keyboard commands, right-click context menu, tab-messaging relay |
| `rules/network-blocks.json` | declarativeNetRequest rules — network-layer blocks |
| `icons/` | 16 / 32 / 48 / 128 PNG icons |

## Architecture

Three cooperating layers:

1. **Network layer** — declarativeNetRequest blocks `/pagead/`,
   `/api/stats/ads`, `/youtubei/v1/player/ad_break`, googlevideo
   `ctier=SA` segments, `doubleclick.net` + `googlesyndication.com`
   (YouTube initiators only), `googleadservices.com`, and `/api/stats/atr`
   ad telemetry before a single byte reaches the page.
2. **Page layer** — MAIN-world content script installs proxies on
   `JSON.parse`, `fetch`, `XMLHttpRequest`, `Node.prototype.appendChild`,
   `Node.prototype.insertBefore`, `Node.prototype.replaceChild`,
   `HTMLIFrameElement.prototype.contentWindow`, `Promise.prototype.then`,
   and `window.setTimeout`. Prunes ad payloads, defends against
   iframe-fetch-lift bypass, neutralizes anti-adblock timers.
3. **Render layer** — cosmetic CSS hides any ad containers that slip
   through, plus the enforcement-message modal; a polling fallback
   mutes and 16x-fast-forwards any ad that still starts playing.

The bridge is a one-way relay: `chrome.action.onClicked`,
`chrome.commands.onCommand`, and `chrome.contextMenus.onClicked`
(all handled by `background.js`) send a `chrome.tabs.sendMessage` to
the active tab, `bridge.js` receives it and dispatches a `CustomEvent`
on `document`, and `main.js` listens for that event to invoke the
in-page control-center function (`toggleSettings`, `setScriptEnabled`,
or `fetchFilters`).

Settings persistence is two-tier:
- `localStorage[__ytab_ext_settings__]` is the sync read path used by
  the engine at document-start.
- `chrome.storage.local` mirrors the same key for cross-subdomain
  propagation. Changes on `www.youtube.com` sync to `m.youtube.com`
  and `music.youtube.com` on the next load.

## Install — Chrome / Edge / Brave

1. Clone the repo locally.
2. From the repo root, run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Extension.ps1
   ```

3. Visit `chrome://extensions`, enable **Developer mode**, click
   **Load unpacked**, and select the `extension/` folder.
4. Click the toolbar icon (or press `Ctrl+Shift+Y`) to open the control
   center.

## Install — Firefox

1. Build as above.
2. Visit `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select `extension/manifest.json`.
4. The add-on is unloaded when Firefox closes; re-load per session, or
   sign the extension through `web-ext sign` for a persistent install.

## Keyboard commands

| Command | Default shortcut | Effect |
|---------|------------------|--------|
| Open control center | `Ctrl+Shift+Y` (Win/Linux), `Cmd+Shift+Y` (Mac) | Opens the in-page settings panel |
| Pause / resume protection | *(unbound)* | Toggles the master switch |
| Refresh rules | *(unbound)* | Forces a rule-list re-fetch |

Re-bind from `chrome://extensions/shortcuts` or
`about:addons` → gear → *Manage Extension Shortcuts*.

## Release workflow

`.github/workflows/build.yml` regenerates `main.js`, zips the
`extension/` folder, and uploads the zip + userscript to the matching
GitHub release on `v*` tag push. Run it manually via the **Actions**
tab for pre-release packages.
