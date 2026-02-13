# YoutubeAdblock

![Version](https://img.shields.io/badge/version-0.0.3-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Tampermonkey%20%7C%20Violentmonkey-orange)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-F7DF1E?logo=javascript&logoColor=black)

> A fast, undetectable YouTube ad blocker userscript with split-architecture proxy engine and remote filter lists.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
2. [Click here to install YoutubeAdblock](https://github.com/SysAdminDoc/YoutubeAdblock/raw/refs/heads/main/YoutubeAdblock.user.js)
3. Confirm installation when prompted

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
| Remote Filter List | Fetches and applies uBO-compatible filter lists from a configurable URL | Enabled |
| Custom Filters | Add your own CSS selectors for additional cosmetic blocking | Disabled |
| Live Stats | Real-time counters for blocked, pruned, and skipped ads | Enabled |
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
│  │  • Property traps   │    │  • Settings panel UI             │    │
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

All settings persist via `GM_setValue`. Right-click the Tampermonkey icon → YoutubeAdblock to access the settings panel.

### Settings Panel

| Setting | Description | Default |
|---------|-------------|---------|
| Master Toggle | Enable/disable all ad blocking | On |
| Cosmetic Hide | CSS-based hiding of ad containers | On |
| SSAP Auto-Skip | Auto-click skip button on video ads | On |
| Anti-Detect | Bypass YouTube's abnormality detection | On |
| Filter List URL | Point to any uBO/EasyList-compatible filter list | [youtube-adblock-filters.txt](https://raw.githubusercontent.com/SysAdminDoc/YoutubeAdblock/refs/heads/main/youtube-adblock-filters.txt) |
| Custom Filters | Add your own CSS selectors | Empty |
| Live Stats | Real-time blocked/pruned/skipped counters | Visible |

### Filter List

The default remote filter list is hosted in this repo at [`youtube-adblock-filters.txt`](https://raw.githubusercontent.com/SysAdminDoc/YoutubeAdblock/refs/heads/main/youtube-adblock-filters.txt). It uses uBO-compatible filter syntax and is parsed on fetch. You can point the Filter List URL to any compatible list, or add custom selectors directly in the settings panel.

### Pruned API Fields

The proxy engine strips these fields from YouTube API responses before they reach the player:

`adPlacements` · `adSlots` · `playerAds` · `adBreakHeartbeatParams` · `auxiliaryUi.messageRenderers.upsellDialogRenderer` · `responseContext.adSignalsInfo`

### Intercepted Endpoints

`/youtubei/v1/player` · `/youtubei/v1/get_watch` · `/youtubei/v1/browse` · `/youtubei/v1/search` · `/youtubei/v1/next` · `/watch?`

## Supported Sites

| Site | URL |
|------|-----|
| YouTube | `https://www.youtube.com/*` |
| YouTube Mobile | `https://m.youtube.com/*` |
| YouTube Music | `https://music.youtube.com/*` |
| YouTube TV | `https://tv.youtube.com/*` |
| YouTube No-Cookie | `https://www.youtube-nocookie.com/*` |
| YouTube Kids | `https://youtubekids.com/*` |

## FAQ / Troubleshooting

**Ads still showing after install?**
Make sure no other YouTube ad-blocker userscripts are running simultaneously — they can conflict with the proxy engine. Disable competing scripts and reload.

**YouTube detects my ad blocker?**
Ensure the Anti-Detect setting is enabled. If YouTube recently changed their detection, check for a script update or open an issue.

**Works on Firefox?**
Yes, with Violentmonkey or Tampermonkey. All features are cross-browser.

**How do I add custom filters?**
Open the settings panel and add CSS selectors to the Custom Filters field. One selector per line.

**How do I reset settings?**
Open DevTools console (F12) and run:
```javascript
GM_setValue('ytab_enabled', true);
GM_setValue('ytab_antidetect', true);
```
Then reload the page.

## Contributing

Issues and PRs welcome. When reporting bugs, include:
- Browser and version
- Userscript manager and version
- Console errors (F12 → Console, filter by `YoutubeAdblock`)
- Which settings are enabled

## License

[MIT](LICENSE) — Matthew Parker
