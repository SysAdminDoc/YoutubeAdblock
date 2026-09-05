# YoutubeAdblock extension build

This folder is a loadable MV3 extension for Chromium 121+ and Firefox 128+. Its page-world engine is generated from [YoutubeAdblock.user.js](../YoutubeAdblock.user.js) by [Build-Extension.ps1](../Build-Extension.ps1). Edit the userscript source, then rebuild. Changes made directly to `main.js` will be overwritten.

## Install in Chromium

1. Run the extension build from the repository root.
2. Open `chrome://extensions` in Chrome, `edge://extensions` in Edge, or `brave://extensions` in Brave.
3. Enable Developer mode and choose **Load unpacked**.
4. Select this `extension` folder, then click the shield icon to open the Control Center.

If the action is used on another site, YoutubeAdblock opens a YouTube tab and carries the action there.

## Files

| Path | Purpose |
|---|---|
| `manifest.json` | Least-privilege production manifest. |
| `manifest.dev.json` | Unpacked QA profile with bounded DNR feedback permission. Never included in release archives. |
| `main.js` | Generated MAIN-world blocking engine and Control Center. |
| `bridge.js` | Validating relay between the page world and extension APIs. |
| `background.js` | Settings broker, toolbar and context-menu actions, tab messaging, plus bounded rule-match aggregation. |
| `icons/` | Shipped 16, 32, 48, and 128 pixel extension marks. |
| `rules/network-rules-source.json` | Typed source for network rule generation and userscript intercept metadata. |
| `rules/network-blocks.json` | Generated packaged DNR rules. |

Run `npm run assets:marketing` from the repository root to regenerate the icon set from the approved transparent source mark.

## Architecture

The browser gets four defensive layers.

1. Packaged DNR rules block tightly scoped ad endpoints before page code receives a response.
2. The MAIN-world engine handles JSON, fetch, XHR, request bodies, selected DOM insertions, and known playback fallbacks.
3. Cosmetic rules clean up containers that no longer have useful content.
4. The isolated bridge and service worker own extension APIs, validate settings, and keep privileged data away from page code.

The service worker is the only component that reads or writes `chrome.storage` for settings. It validates each known key, rejects oversized or malformed values, keeps anti-rollback floors monotonic, and mirrors only user-authored preferences to sync storage. Counters, integrity caches, consent, and signed-update floors stay local.

`bridge.js` accepts one allowlisted settings container. It applies a size cap, write debounce, request coalescing, and rate limit before forwarding anything. Incoming settings are validated again by the worker.

## Production and development profiles

`manifest.json` omits `declarativeNetRequestFeedback`. Blocking works normally, but the Browser Network Layer card explains that match evidence isn't available.

`manifest.dev.json` adds only that diagnostic permission. Copy it over `manifest.json` in a disposable extension folder when you need a current-tab match summary during QA. The summary contains packaged rule IDs, counts, and timestamps. It excludes request URLs, raw browser errors, unrelated tabs, and saved history.

Firefox may also require `extensions.dnr.feedback` in `about:config` for the development summary. The packaged rules don't depend on that preference.

The extension does not request DeArrow thumbnail host access. DeArrow stays userscript-only until the extension has a narrow permission path.

## Rebuild

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Extension.ps1
```

The builder strips the userscript header, adds the extension storage and network shims, regenerates DNR output, then verifies required markers before writing `main.js`.

## Test and package

```powershell
npm ci
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Release.ps1
```

The default release produces a versioned userscript and unpacked-extension ZIP. It also writes checksums and provenance data after validating the archive contents.

CRX packaging requires the private key that matches `extension-id.txt`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Release.ps1 -Artifacts Userscript,Zip,Crx -CrxKeyPath <private-key.pem>
```

The tools refuse to generate a replacement key. A new key would rotate the extension ID and break update continuity.

`Build-CRX.ps1` is the direct packer when only a CRX is needed. It enforces the same pinned extension ID and matching private key.

Firefox persistent installs require AMO or `web-ext sign`. The release gate can create an unsigned development XPI when explicitly requested; do not publish that file as a signed install asset.
