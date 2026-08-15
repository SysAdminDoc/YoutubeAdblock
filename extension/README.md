# YoutubeAdblock — extension build

This is the Chrome / Firefox MV3 build of YoutubeAdblock. The core ad-blocking
engine is **generated** from [../YoutubeAdblock.user.js](../YoutubeAdblock.user.js)
by [../Build-Extension.ps1](../Build-Extension.ps1). Do not edit `main.js`
directly — your changes will be overwritten on the next build.

## Layout

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest for Chromium 121+ and Firefox 128+ |
| `main.js` *(generated)* | Page-world (MAIN) content script - the ad-blocking engine |
| `bridge.js` | Isolated-world content script, relays bounded `chrome.*` capabilities into the page world and re-sanitizes DNR evidence |
| `background.js` | Service worker: toolbar action, keyboard commands, right-click context menu, tab messaging, and current-tab DNR match aggregation |
| `rules/network-rules-source.json` | typed source for intercept-pattern metadata and DNR generation |
| `rules/network-blocks.json` | generated declarativeNetRequest rules - network-layer blocks |

The manifest intentionally omits extension icons until replacement branding is
available, so browsers show their default toolbar icon.

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

For control-plane actions, `chrome.action.onClicked`,
`chrome.commands.onCommand`, and `chrome.contextMenus.onClicked`
(all handled by `background.js`) send a `chrome.tabs.sendMessage` to
the active tab, `bridge.js` receives it and dispatches a `CustomEvent`
on `document`, and `main.js` invokes the matching in-page action. The bounded
reverse path handles settings and diagnostics: page events can access only the
allowlisted settings object or request a sanitized current-tab DNR summary.

Settings persistence lives entirely in the service worker. `bridge.js` owns no
storage code; it validates the page request (single allowlisted key, size cap,
rate limit, debounce) and relays `ytab:settings-read` / `ytab:settings-write`
over `chrome.runtime`. `background.js` re-validates the sender (this extension,
a real tab, a YouTube URL) plus the payload before writing, then mirrors
eligible settings to `chrome.storage.sync` in 7 KB chunks with the metadata
write as the commit marker.

Matched-rule evidence needs the `declarativeNetRequestFeedback` permission,
which Chrome documents for unpacked-extension debugging. It therefore lives in
`manifest.dev.json` — a development-only profile — and is absent from the
production `manifest.json` and from every release artifact. To use the Browser
Network Layer card during QA, copy `manifest.dev.json` over `manifest.json` in a
scratch copy of `extension/` and load that unpacked. In production builds
blocking is unchanged and the card reports that the evidence is unavailable
rather than implying a blocking failure.

That permission powers only that summary. `background.js` uses `getMatchedRules()` with a five-minute window,
keeps only `ytab-network-blocks` rule IDs/counts/timestamps, and applies a
30-second global cooldown. `bridge.js` validates the result again before the
page can see it. No request URL, raw browser error, or unrelated-tab data is
relayed or persisted. If feedback is unavailable, browser-level blocking still
runs and Diagnostics reports only the evidence limitation. Firefox development
builds may also require `extensions.dnr.feedback` in `about:config` for this
diagnostic API; that preference is not required for the packaged rules to block.

Settings persistence is three-tier:
- `localStorage[__ytab_ext_settings__]` is the sync read path used by
  the engine at document-start.
- `chrome.storage.local` mirrors the same key for cross-subdomain
  propagation. The bridge pushes an early snapshot into each fresh load,
  so changes on `www.youtube.com` rehydrate on `m.youtube.com`,
  `music.youtube.com`, and `www.youtubekids.com` as soon as extension
  storage answers.
- `chrome.storage.sync` mirrors eligible settings across signed-in browser
  profiles. The bridge stores the serialized settings object as 7 KB chunks
  under the 8 KB/item and 100 KB total sync quotas, resolves conflicts by
  newest write timestamp, and leaves oversized blocklists local-only instead
  of rejecting the save.

Custom Rule Library URLs still use page-world fetches in this build, so
the safest sources are hosts that allow direct browser fetches from
YouTube pages. The recommended GitHub-hosted list is the default because
it works cleanly without adding broader extension fetch permissions.

DeArrow remains userscript-only until its extension API permission is resolved,
so the extension manifest does not request DeArrow thumbnail host access.

## Install — Chrome / Edge / Brave (Chromium 121+)

1. Clone the repo locally.
2. From the repo root, run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Extension.ps1
   ```

3. Visit `chrome://extensions`, enable **Developer mode**, click
   **Load unpacked**, and select the `extension/` folder.
4. Click the toolbar icon to open the Control Center.

If you trigger the extension while you are not already on YouTube,
YoutubeAdblock opens a YouTube tab and carries the action there automatically.

The Chromium floor matters because this manifest intentionally includes both
`background.service_worker` and `background.scripts` so one build can support
Chromium and Firefox. Chrome ignored the extra `scripts` key starting in
Chrome 121; earlier MV3 builds reject it.

## Package A CRX

Run the repo-root packer when you need a signed Chromium release artifact:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-CRX.ps1 -KeyPath <private-key.pem>
```

The key must match the pinned extension ID in `extension/extension-id.txt`. The packer
refuses to generate a replacement key because rotating that identity would
break update continuity and extension storage. Keep the matching PEM private;
it is deliberately ignored rather than committed. For most desktop
Chrome/Edge users, the unpacked install path is still the friendliest option
because local CRX installs are typically restricted outside managed or
supported self-hosted flows.

## Install — Firefox

1. Build as above.
2. Visit `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select `extension/manifest.json`.
4. The add-on is unloaded when Firefox closes; re-load per session.

Persistent Firefox installs require Mozilla signing through AMO or
`web-ext sign`. The local release gate can produce an unsigned development XPI
only when `-Artifacts Xpi` is explicitly requested; do not publish that file as
a signed install asset.

## Keyboard commands

| Command | Default shortcut | Effect |
|---------|------------------|--------|
| Open Control Center | *(unbound)* | Opens the in-page protection workspace |
| Pause or Resume Protection | *(unbound)* | Toggles the master switch |
| Refresh Rules | *(unbound)* | Forces a rule-list refresh |

Bind optional shortcuts from `chrome://extensions/shortcuts` or
`about:addons` → gear → *Manage Extension Shortcuts*.

## Local release workflow

This repo uses local builds only. For the full release gate from the repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Release.ps1
```

Run `npm ci` once before the full gate so browser-smoke dependencies are
present. The default command regenerates generated files, runs syntax checks
and tests, validates DNR freshness, signs or verifies the filter manifest,
runs the browser smoke matrix, verifies the userscript/ZIP artifacts, writes
SHA-256 checksums, cleans stale artifacts, and writes current artifacts to
`dist/`. Add CRX only when the stable signing key is available:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Release.ps1 -Artifacts Userscript,Zip,Crx -CrxKeyPath <private-key.pem>
```

For manual steps:

1. Regenerate the extension engine:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Extension.ps1
   ```

2. Run the local contract tests:

   ```powershell
   node --test tests/*.mjs
   ```

3. Package a signed Chromium CRX when a CRX artifact is needed:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-CRX.ps1 -KeyPath <private-key.pem>
   ```

4. Attach only the generated and verified userscript, unpacked-extension ZIP,
   optional stable-ID CRX, and checksum artifacts to GitHub Releases manually.
   If `-Artifacts Xpi` was requested, treat the generated `.unsigned.xpi` as a
   development artifact only.
