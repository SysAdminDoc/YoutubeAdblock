# YoutubeAdblock — extension build

This is the Chrome / Firefox MV3 build of YoutubeAdblock. The core ad-blocking
engine is **generated** from [../YoutubeAdblock.user.js](../YoutubeAdblock.user.js)
by [../Build-Extension.ps1](../Build-Extension.ps1). Do not edit `main.js`
directly — your changes will be overwritten on the next build.

## Layout

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest for Chromium 121+ and Firefox 128+ |
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
in-page Control Center actions (`toggleSettings`, `setScriptEnabled`,
and `fetchFilters`).

Settings persistence is two-tier:
- `localStorage[__ytab_ext_settings__]` is the sync read path used by
  the engine at document-start.
- `chrome.storage.local` mirrors the same key for cross-subdomain
  propagation. The bridge pushes an early snapshot into each fresh load,
  so changes on `www.youtube.com` rehydrate on `m.youtube.com`,
  `music.youtube.com`, and `www.youtubekids.com` as soon as extension
  storage answers.

Custom Rule Library URLs still use page-world fetches in this build, so
the safest sources are hosts that allow direct browser fetches from
YouTube pages. The recommended GitHub-hosted list is the default because
it works cleanly without adding broader extension fetch permissions.

## Install — Chrome / Edge / Brave (Chromium 121+)

1. Clone the repo locally.
2. From the repo root, run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Extension.ps1
   ```

3. Visit `chrome://extensions`, enable **Developer mode**, click
   **Load unpacked**, and select the `extension/` folder.
4. Click the toolbar icon (or press `Ctrl+Shift+Y`) to open the Control
   Center.

If you trigger the extension while you are not already on YouTube,
YoutubeAdblock opens a YouTube tab and carries the action there automatically.

The Chromium floor matters because this manifest intentionally includes both
`background.service_worker` and `background.scripts` so one build can support
Chromium and Firefox. Chrome ignored the extra `scripts` key starting in
Chrome 121; earlier MV3 builds reject it.

## Package A CRX

Run the repo-root packer when you need a signed Chromium release artifact:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-CRX.ps1
```

That writes `YoutubeAdblock-extension-v<version>.crx` plus a reusable private
key to `dist/`. Keep the generated `.pem` private and reuse it for future
builds so the packaged extension keeps the same Chromium extension ID. For
most desktop Chrome/Edge users, the unpacked install path is still the
friendliest option because local `.crx` installs are typically restricted
outside developer-mode or managed-policy flows.

## Install — Firefox

1. Build as above.
2. Visit `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select `extension/manifest.json`.
4. The add-on is unloaded when Firefox closes; re-load per session, or
   sign the extension through `web-ext sign` for a persistent install.

## Keyboard commands

| Command | Default shortcut | Effect |
|---------|------------------|--------|
| Open Control Center | `Ctrl+Shift+Y` (Win/Linux), `Cmd+Shift+Y` (Mac) | Opens the in-page protection workspace |
| Pause or Resume Protection | *(unbound)* | Toggles the master switch |
| Refresh Rules | *(unbound)* | Forces a rule-list refresh |

Re-bind from `chrome://extensions/shortcuts` or
`about:addons` → gear → *Manage Extension Shortcuts*.

## Release workflow

`.github/workflows/build.yml` regenerates `main.js`, zips the
`extension/` folder, and uploads the zip + userscript to the matching
GitHub release on `v*` tag push. Run it manually via the **Actions**
tab for pre-release packages. When `CHROMIUM_EXTENSION_KEY_B64` is configured
as a GitHub Actions secret, the workflow also packages and uploads a `.crx`
asset. Without that secret, maintainers can run `Build-CRX.ps1` locally and
attach the signed `.crx` manually.
