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

## Nice-to-Haves
- Webext background job that refreshes the filter list on `chrome.alarms`, independent of page reloads.
- A minimal variant (`Lite`) that only ships payload pruning + CSS cleanup for users on low-end hardware.
- Playback quality forcer (auto-select 1080p/4K on load) as an optional power-user toggle.
- Per-tab "engine disabled" indicator in the toolbar icon when a site breakage recovery was triggered.

## Research-Driven Additions

Evidence and competitive context: see RESEARCH.md (consolidated; older inline research notes moved there).

### P2 — larger bets / parity

### P3 — polish / niche

### Audit-Surfaced Items

### P0 - release trust

### P1 - permission and packaging hardening

### P2 - validation and migration
