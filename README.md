# YoutubeAdblock

![Version](https://img.shields.io/badge/version-0.5.19-58A6FF)
![License](https://img.shields.io/badge/license-MIT-green)

> A document-start YouTube ad blocker with a split-context proxy engine, remote rule support, and a premium Control Center for tuning protection.

## Quick Start

### Userscript (Tampermonkey / Violentmonkey)

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
2. [Click here to install YoutubeAdblock](https://github.com/SysAdminDoc/YoutubeAdblock/raw/refs/heads/main/YoutubeAdblock.user.js)
3. Confirm installation when prompted, then reload YouTube
4. Open your userscript menu and use the built-in commands to open the Control Center, pause or resume protection, or refresh rules on demand

### Chrome / Edge / Brave (Chromium 121+, MV3 extension, unpacked)

1. Clone or download the repo, then run `powershell -ExecutionPolicy Bypass -File .\Build-Extension.ps1` to regenerate [extension/main.js](extension/main.js) from the userscript
2. Visit `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**
3. Select the [extension/](extension/) folder
4. Click the YoutubeAdblock toolbar button to open the Control Center

Optional browser shortcuts can be bound from `chrome://extensions/shortcuts`; no global shortcut is assigned by default.

Because the MV3 manifest intentionally includes both `background.service_worker` and `background.scripts` for Chrome + Firefox compatibility, the unpacked extension target is Chromium 121 or newer.

For a full local release gate, run `npm ci` once, then run `powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Release.ps1`. It regenerates the extension, runs syntax checks and tests, validates generated DNR output, signs or verifies the filter manifest, runs the browser smoke matrix, verifies ZIP/CRX artifact integrity, writes SHA-256 checksums, cleans stale artifacts, and writes current `.user.js`, `.zip`, and signed `.crx` artifacts into `dist/`. If you only need a packaged Chromium artifact, run `powershell -ExecutionPolicy Bypass -File .\Build-CRX.ps1`. Keep in mind that Chrome generally does **not** allow normal local-file `.crx` installs outside developer-mode, Linux self-hosting, or managed-policy flows, so the unpacked install path remains the best default for most users.

### Firefox (MV3 extension)

**Persistent install:** This repo does not publish a signed XPI yet. Firefox requires AMO or `web-ext sign` signing for persistent extension installs, so the persistent Firefox path today is the userscript install with Tampermonkey or Violentmonkey.

**Temporary install (development):**

1. Build the extension as above
2. Visit `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** and pick [extension/manifest.json](extension/manifest.json)
4. Click the YoutubeAdblock toolbar button to open the Control Center

### Safari (iOS / macOS, via Userscripts app)

1. Install [Userscripts](https://github.com/quoid/userscripts) from the App Store (free, open-source)
2. Enable the Userscripts Safari extension in Settings → Safari → Extensions
3. Open the Userscripts editor, tap **+**, and paste the raw URL: `https://github.com/SysAdminDoc/YoutubeAdblock/raw/refs/heads/main/YoutubeAdblock.user.js`
4. Reload YouTube — the script runs the same engine as Tampermonkey/Violentmonkey

> **Note:** Safari support is community-tested, not officially validated. DeArrow, volume boost, and other features relying on Web Audio or advanced GM_* APIs may behave differently. Report issues with your Safari version.

### Firefox for Android

1. Install [Firefox for Android](https://play.google.com/store/apps/details?id=org.mozilla.firefox) (supports extensions since Dec 2023)
2. Install [Tampermonkey](https://addons.mozilla.org/en-US/android/addon/tampermonkey/) or [Violentmonkey](https://addons.mozilla.org/en-US/android/addon/violentmonkey/) from AMO
3. Navigate to the [raw userscript](https://github.com/SysAdminDoc/YoutubeAdblock/raw/refs/heads/main/YoutubeAdblock.user.js) and confirm the install
4. Open YouTube — this is currently the only mainstream mobile path for full YouTube ad blocking in a browser

The extension ships the same blocking engine as the userscript plus **declarativeNetRequest rules** that block ad-serving endpoints (`/pagead/`, `/api/stats/ads`, `/youtubei/v1/player/ad_break`, googlevideo `ctier=SA` segments, doubleclick.net and googlesyndication.com from YouTube origins) at the browser network layer — outside the reach of any page-level anti-adblock countermeasure. When browser DNR is unavailable, the userscript fetch/XHR engine also scrubs text DASH/HLS manifests that reference googlevideo `ctier=SA` or `ctier=SR` ad segments.
If you trigger the extension while you are not already on YouTube, YoutubeAdblock opens a YouTube tab and carries the action forward there automatically.

## Highlights

- Blocks ads before they render by pruning payloads in `JSON.parse`, `fetch()`, and `XMLHttpRequest`
- Handles anti-detection paths like abnormality callbacks, clean iframe bypasses, and playback timers
- Keeps cosmetic cleanup separate from payload blocking so the interface stays tidy after the heavy lifting is done
- Ships with a local fallback rule set, cached remote rules, and a diagnostics-friendly Control Center

## Features

| Feature | Description | Default |
|---------|-------------|---------|
| JSON.parse Proxy | Strips ad payloads from YouTube API responses at the data level | Enabled |
| Fetch Proxy | Intercepts `/youtubei/v1/player`, `/browse`, `/search`, `/next` and prunes ad fields | Enabled |
| XHR Proxy | Catches XMLHttpRequest-based ad delivery channels | Enabled |
| appendChild Proxy | Blocks ad-related script and iframe injection into the DOM | Enabled |
| setTimeout Proxy | Neutralizes timed ad triggers and delayed ad insertion | Enabled |
| Promise.then Proxy | Intercepts promise-chained ad delivery pipelines | Enabled |
| Property Traps | Prevents YouTube from reading/writing ad-related player properties | Enabled |
| CSS Cosmetic Filters | 150+ selectors hiding ad containers, banners, and promotions | Enabled |
| SSAP Auto-Skip | Automatically clicks the skip button on skippable video ads | Enabled |
| Anti-Detect Bypass | Defeats YouTube's abnormality/adblock detection system | Enabled |
| Iframe Fetch-Lift Defense | Rebridges `contentWindow.fetch`, `XMLHttpRequest`, and `JSON.parse` in same-origin iframes so YouTube can't lift pristine globals | Enabled |
| Aggressive Anti-Stall | Fast-forwards 17-second bound timers YouTube uses to stall playback when a blocker is suspected | Enabled |
| Video Ad Fast-Forward | Mutes and accelerates any ad that slips past pruning (last-resort safety net) | Enabled |
| SponsorBlock Auto-Skip | Silently skips sponsor, self-promo, intro, outro, interaction, preview, music-off-topic, and filler segments using the privacy-preserving SponsorBlock hash-prefix API | Enabled |
| toString Proxy Mask | Patches `Function.prototype.toString` so every hooked native still reports `[native code]` to YouTube's detection paths | Enabled |
| ServiceWorker Block | Proxies `navigator.serviceWorker.register` / `getRegistration{s}` so YouTube can't install a worker that bypasses the request proxies | Enabled |
| Webpack Chunk Prune | Rewrites ad-rendering factory modules inside `self.webpackChunk_youtube_player.push` before they execute, using a built-in signature set that refreshes from [`webpack-ad-signatures.json`](webpack-ad-signatures.json) | Enabled |
| DASH/HLS Manifest Scrub | Removes googlevideo `ctier=SA`/`ctier=SR` ad segment references from text DASH/HLS manifests as a playback-layer fallback when browser DNR is unavailable | Enabled |
| No-Ad Request Signal | Injects `isInlinePlaybackNoAd` into outbound `/player` request bodies via fetch, XHR, and an `Object.assign` hook that survives YouTube's locker script — defeats SABR fake-buffering on both cold loads and SPA navigation | Enabled |
| Engine Health Monitor | Tracks per-engine install success and surfaces degraded-protection warnings in the Control Center when YouTube's locker script or a competing blocker locks a native | Enabled |
| DeArrow Titles & Thumbnails | Replaces clickbait titles and thumbnails with crowd-submitted alternatives via the privacy-preserving DeArrow hash-prefix API *(userscript only — extension build pending API permission)* | Optional |
| Return YouTube Dislike | Restores the public dislike count under the like button | Optional |
| Force Original Audio | Switches back to the original-language audio track when YouTube defaults to an auto-dubbed or translated track | Optional |
| Volume Boost | Web Audio gain stage up to 5x with an inline slider in the player controls | Optional |
| Clutter-Free Mode | Eight Unhook-style toggles: home feed, Shorts shelves, Shorts tab, related videos, comments, end-screen cards, live chat, merch shelves | Optional |
| Channel + Keyword Blocklist | Strips videos whose channel or title matches local blocklists. Channel entries support names, `UC...` IDs, `@handles`, channel URLs, regex, JSON/plain-text import-export, and BlockTube/FilterTube-style migration import | Optional |
| Shorts → /watch Redirect | Rewrites `/shorts/VIDEO_ID` to the full watch player | Optional |
| DNR Network Blocking *(extension only)* | Blocks `/pagead/*`, `/pagead/adview`, `/pagead/interaction`, `/api/stats/ads`, `/api/stats/atr`, `/pcs/activeview`, `/youtubei/v1/player/ad_break`, `/youtubei/v1/log_event` (POST), `/youtubei/v1/att/log` (POST), googlevideo `ctier=SA`, `ctier=SR`, `initplayback?...adformat=`, `generate_204`, doubleclick.net, googlesyndication.com, googleadservices.com. DNR output is generated from the same typed source that validates userscript intercept metadata | Enabled |
| Remote Filter List | Fetches and applies uBO-compatible filter lists from a configurable URL | Enabled |
| Control Center | Protection overview, quick actions, module toggles, rule refresh, blocklist editors, diagnostics, and recovery tools | Enabled |
| Extension Settings Sync | MV3 builds mirror toggles, blocklists, allowlists, and thresholds through `chrome.storage.sync`; oversized blocklists stay local instead of failing saves | Enabled |
| Live Stats | Real-time counters for blocked, pruned, SSAP skipped, sponsor skipped, DeArrow replaced, and feed filtered | Enabled |
| TrustedHTML Safe | Full CSP/TrustedTypes compliance — no `innerHTML` violations | Always |

## How It Works

```
┌──────────────────────────────────────────────────────────────────────┐
│                        document-start                                │
│                                                                      │
│  ┌─────────────────────┐    ┌──────────────────────────────────┐    │
│  │  PHASE 1: Page Ctx  │    │  PHASE 2: Sandbox                │    │
│  │  (injected <script>)│    │  (Tampermonkey GM_* APIs)        │    │
│  │                     │    │                                  │    │
│  │  • JSON.parse proxy │    │  • 150+ CSS cosmetic selectors   │    │
│  │  • fetch() proxy    │    │  • DOM MutationObserver cleanup  │    │
│  │  • XHR proxy        │    │  • SSAP auto-skip delegation     │    │
│  │  • appendChild proxy│    │  • GM_getValue/setValue storage   │    │
│  │  • setTimeout proxy │    │  • Remote filter list fetching   │    │
│  │  • Promise.then     │    │  • CSS re-injection protection   │    │
│  │  • Property traps   │    │  • Control Center UI             │    │
│  │  • Video ad skipper │    │                                  │    │
│  └─────────────────────┘    └──────────────────────────────────┘    │
│              │                            │                          │
│              ▼                            ▼                          │
│     Real window object            Shared DOM access                  │
│     (YouTube sees proxies)        (CSS/elements work from sandbox)   │
└──────────────────────────────────────────────────────────────────────┘
```

Tampermonkey's `@grant GM_*` directives wrap userscripts in a sandbox where `window` is a proxy — YouTube's scripts never see modifications made in the sandbox. YoutubeAdblock solves this by injecting the proxy engine into the **real page context** via a `<script>` element at `document-start`, before any YouTube scripts execute. CSS injection, DOM observers, and settings management stay in the sandbox since they operate on the shared DOM.

Each proxy installation is individually try/catch wrapped using a `safeOverride()` helper (direct assign → `Object.defineProperty` → delete+redefine fallback), so one engine failure never prevents the others from loading.

## Configuration

All settings persist via `GM_setValue`. Open the userscript menu and choose `YoutubeAdblock: Open Control Center` to adjust protection without leaving YouTube.

### Control Center

| Setting | Description | Default |
|---------|-------------|---------|
| Protection Overview | Live status, active source, current YouTube surface, quick actions, and jump navigation | Available |
| Master Switch | Enable or pause every blocking engine without uninstalling the script | On |
| Rule Library | Choose a compatible raw list and refresh it on demand; the recommended source is the safest default for extension installs | [youtube-adblock-filters.txt](https://raw.githubusercontent.com/SysAdminDoc/YoutubeAdblock/refs/heads/main/youtube-adblock-filters.txt) |
| Core Blocking | Control JSON pruning, fetch/XHR interception, property traps, and request rewriting | On |
| Anti-Detection | Control abnormality bypass, iframe bypass prevention, SSAP skipping, spoofing, and timer neutralization | On |
| Interface Cleanup | Control cosmetic cleanup, Premium upsell blocking, and Shorts ad removal | On |
| Diagnostics & Recovery | Copy diagnostics, reset local counters, or restore recommended defaults safely | Available |

### Filter List

The default remote filter list is hosted in this repo at [`youtube-adblock-filters.txt`](https://raw.githubusercontent.com/SysAdminDoc/YoutubeAdblock/refs/heads/main/youtube-adblock-filters.txt). It uses uBO-compatible filter syntax and is verified against the bundled Ed25519 public key before it replaces active rules. The userscript build can point the Rule Library field at any compatible raw list URL; custom sources are allowed but shown as unsigned in diagnostics. The extension build works best with sources that allow direct browser fetches from YouTube pages, so the recommended GitHub-hosted source is the safest default there. If a refresh fails or signature verification fails, YoutubeAdblock keeps the last working rules or the built-in fallback active so protection does not drop unexpectedly.

### Pruned API Fields

The proxy engine strips these fields from YouTube API responses before they reach the player:

`adPlacements` · `adSlots` · `playerAds` · `adBreakHeartbeatParams` · `auxiliaryUi.messageRenderers.upsellDialogRenderer` · `responseContext.adSignalsInfo` · `frameworkUpdates`

### Intercepted Endpoints

`/youtubei/v1/player` · `/youtubei/v1/get_watch` · `/youtubei/v1/browse` · `/youtubei/v1/search` · `/youtubei/v1/next` · `/youtubei/v1/guide` · `/watch?`

## Supported Sites

| Site | URL |
|------|-----|
| YouTube | `https://www.youtube.com/*` |
| YouTube Mobile | `https://m.youtube.com/*` |
| YouTube Music | `https://music.youtube.com/*` |
| YouTube TV | `https://tv.youtube.com/*` |
| YouTube No-Cookie | `https://www.youtube-nocookie.com/*` |
| YouTube Kids | `https://youtubekids.com/*`, `https://www.youtubekids.com/*` |

## FAQ / Troubleshooting

**Ads still showing after install?**
Make sure no other YouTube ad-blocker userscripts are running simultaneously — they can conflict with the proxy engine. Disable competing scripts and reload.

**Diagnostics says YoutubeAdblock loaded late?**
Chrome MV3 userscript managers can miss `document-start` unless user scripts are explicitly allowed. Open `chrome://extensions`, select Tampermonkey or Violentmonkey, enable **Allow User Scripts** if Chrome shows it, confirm the script is enabled for YouTube, then reload YouTube. If Diagnostics says document-start is confirmed but ads still show, use **Refresh Rules** instead of reinstalling.

**YouTube detects my ad blocker?**
Ensure the Anti-Detect setting is enabled. If YouTube recently changed their detection, check for a script update or open an issue.

**Works on Firefox?**
Yes, with Violentmonkey or Tampermonkey. All features are cross-browser.

**How do I use a different filter list?**
Point the Rule Library field at a compatible raw list that includes the selectors you want, then refresh the rules from the Control Center.

**How do I reset settings?**
Open the Control Center and use `Restore Defaults`. That resets the master switch and feature toggles to the recommended starting state without requiring DevTools.

## Contributing

Issues and PRs welcome. When reporting bugs, include:
- Browser and version
- Userscript manager and version
- Console errors (F12 → Console, filter by `YoutubeAdblock`)
- Which settings are enabled

## License

[MIT](LICENSE) — Matthew Parker
