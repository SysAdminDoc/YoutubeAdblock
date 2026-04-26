# YoutubeAdblock Roadmap

Forward-looking scope for the split-context YouTube ad blocker (userscript + Chrome MV3 extension + Firefox MV3).

## Planned Features

### Blocking Engine
- Webpack chunk signature database: maintain a JSON of known ad-rendering factory signatures, refresh on startup from the repo raw URL.
- DASH/HLS manifest scrubbing for the in-stream `ctier=SA`/`SR` segments (already at network layer; add playback-layer fallback when DNR is unavailable, e.g. userscript in Firefox).
- Server-side ad detection heuristic: measure PlayerResponse `serverStitchedAd` flag and warn in Control Center when SSAI ads can't be pruned.
- `Trusted Types` full coverage audit: eliminate remaining string-HTML code paths in the Control Center.

### Control Center
- Per-surface toggles (home feed, watch, shorts, YT Music, YT Kids) with independent engine profiles.
- Exportable diagnostic bundle (counters, last 50 prune events, UA, version) as a single JSON for bug reports.
- Rules playground: paste a custom uBO-style selector and preview what it would hide on the current page.
- Dark-mode CSS audit for Control Center contrast ratio ≥ AA.

### SponsorBlock / DeArrow Integration
- Category-aware skip behavior: auto-skip sponsor, mute-ads-only for self-promo, manual for filler.
- Offline vote cache: submit SponsorBlock segments from within the Control Center without leaving YouTube.
- DeArrow submission UI for replacing clickbait titles directly from the player (gated behind opt-in).

### Extension
- Firefox MV3 stable release: drop the temporary-add-on path once `background.scripts` stops being a compat hack.
- Declarative NetRequest dynamic rules: ship a rules update endpoint for fast response when YouTube rotates endpoints.
- Popup (toolbar) UI mirroring Control Center for users who never use the userscript menu.
- Enterprise policy schema (`managed_schema`) so IT admins can lock defaults.

## Competitive Research
- **uBlock Origin (Firefox)** — reference; Firefox MV2 still allows full filtering; YoutubeAdblock's moat on Chrome is the MV3 DNR + split-context engine that uBO Lite can't match.
- **SponsorBlock + DeArrow** — already integrated; deepen by letting users submit without installing the official extensions.
- **AdGuard system-level** — wins on mobile; YoutubeAdblock is browser-only, mention this explicitly in FAQ.
- **ReVanced / ReVanced Extended** — Android patching path; worth a README "for mobile, use ReVanced" handoff link.

## Nice-to-Haves
- Webext background job that refreshes the filter list on `chrome.alarms`, independent of page reloads.
- Optional Return YouTube Dislike + Enhanced YT thumbnails stack toggleable from the Control Center (avoid extension sprawl for users).
- Telemetry-free usage counters (local only) with a "Share counters" export for bug reports.
- A minimal variant (`Lite`) that only ships payload pruning + CSS cleanup for users on low-end hardware.
- Playback quality forcer (auto-select 1080p/4K on load) as an optional power-user toggle.
- Per-tab "engine disabled" indicator in the toolbar icon when a site breakage recovery was triggered.

## Open-Source Research (Round 2)

### Related OSS Projects
- https://github.com/ajayyy/SponsorBlock — crowdsourced segment skipping (sponsor/intro/outro/etc.)
- https://github.com/0x48piraj/fadblock — "skip-not-block" strategy, Chrome/Opera/Firefox
- https://github.com/antonlam/youtube-adblock-javascript — iOS Safari compatible userscript
- https://github.com/GodgamingonYT/YouTube-and-YouTube-Music-Enhanced-Adblocker — YouTube Music coverage
- https://github.com/AlejandroLuisHC/yt-adblocker-script — Enhancer-for-YouTube integration pattern
- https://github.com/siku2/script.service.sponsorblock — SponsorBlock Kodi port
- https://github.com/gorhill/uBlock — uBO static filter lists reference (yt-specific cosmetic)
- https://github.com/Sponsorblock-Cast/SponsorBlock-cast — Cast-compatible variant
- https://github.com/rooting-for-success/coffee-break-for-youtube — 16× ad speed-up instead of block (novel evasion)

### Features to Borrow
- SponsorBlock API integration for sponsor/intro/outro/recap skipping in addition to ads (ajayyy/SponsorBlock)
- YouTube Music coverage on `music.youtube.com` with the same proxy engine (GodgamingonYT)
- "Skip via rate change" fallback when blocking a request is detected by YT's ad-verify (0x48piraj, coffee-break)
- Rule-subscription UI to subscribe to community rule lists with signed ETag caching
- Telemetry-free metrics: local counters only, show ads-skipped and seconds-saved in Control Center
- Enhancer-for-YouTube cooperation mode: detect EFY presence, disable overlapping features (AlejandroLuisHC)
- Cast/TV adblock path via DIAL discovery to YouTube on TV (SponsorBlock-Cast)
- Playback-speed throttle detection: if YT stalls the player on ad, fast-forward instead (fadblock)
- iOS Safari userscripts manager compatibility (Userscripts extension) — already partial, document + test (antonlam)
- Per-channel allow-list so creators you want to support still see an ad impression

### Patterns & Architectures Worth Studying
- Split-context (MAIN + ISOLATED) proxy engine for XHR/fetch interception — already adopted; codify as a library
- Trusted Types policy for DOM injection on YouTube's strict CSP (required on `music.youtube.com`)
- Worker-thread ad-URL classification via Bloom filter seeded from EasyList-YouTube so matching is O(1)
- Rule sync: ETag-based pull from GitHub raw + jsDelivr fallback, signed with ed25519 manifest
- MV3 declarativeNetRequest dynamic rules for static URL blocks + scripting API for DOM cleanup — cleaner than webRequest
