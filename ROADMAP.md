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
- [ ] P3 — DeArrow casual mode
  Why: vote-aware title replacement (only community-confirmed clickbait) shipped ecosystem-wide Feb 2025; softer default than full DeArrow.
  Evidence: wiki.sponsor.ajay.app/w/DeArrow/Casual_mode.
  Touches: DeArrow engine + feature group (sub-toggle).
  Acceptance: casual mode toggle replaces only vote-qualified titles. Gated on the P0 DeArrow permission outcome.
  Complexity: S
- [ ] P3 — Extract UI strings for i18n
  Why: ~100 hardcoded English strings block any localization; extraction is the prerequisite, shipping translations is not yet justified by user demand.
  Evidence: FEATURE_GROUPS + panel builders (~lines 220–435, 4320–5115).
  Touches: YoutubeAdblock.user.js (central STRINGS table), build script unaffected.
  Acceptance: all user-visible strings resolve through one table; English-only behavior unchanged.
  Complexity: L

### Audit-Surfaced Items

### P0 - release trust
- [ ] P0 - Reconcile the v0.5.11 release state before publishing
  Why: The working tree reports v0.5.11 while `HEAD`/`origin/main` remains tagged v0.5.10, so release docs, manifests, generated files, artifacts, and tags can drift.
  Evidence: `git log -10`, `git status --short`, `README.md:3`, `YoutubeAdblock.user.js:4`, `extension/manifest.json:3`.
  Touches: versioned files, generated extension output, changelog, tags, GitHub release assets.
  Acceptance: clean working tree; pushed commit/tag/version all match; latest release assets correspond to the same version shown in README and manifests.
  Complexity: M
- [ ] P0 - Fix the Firefox signed-XPI release path
  Why: README promises a signed persistent XPI, but the local release script currently creates an `.xpi` ZIP artifact rather than proving AMO/web-ext signing.
  Evidence: `README.md:32`, `Build-Release.ps1:157`, Mozilla extension signing requirements.
  Touches: `Build-Release.ps1`, `extension/README.md`, `README.md`, release checklist.
  Acceptance: either release builds invoke and verify the real signing path, or docs clearly label generated XPI output as unsigned/development-only.
  Complexity: M

### P1 - permission and packaging hardening
- [ ] P1 - Remove inactive DeArrow thumbnail permission from the extension build
  Why: DeArrow is forced off in MV3 pending API permission, so requesting `dearrow-thumb.ajay.app` increases review and user-trust friction without enabling a feature.
  Evidence: `extension/manifest.json`, `YoutubeAdblock.user.js:657`, `YoutubeAdblock.user.js:5828`, Chrome extension security guidance.
  Touches: `extension/manifest.json`, `Build-Extension.ps1`, docs, repo-contract tests.
  Acceptance: extension install prompt no longer lists DeArrow thumbnail host access while DeArrow remains locked in extension mode.
  Complexity: S
- [ ] P1 - Add release artifact verification
  Why: Local builds produce install artifacts, but the release gate does not verify ZIP entry paths, CRX3 structure/signature, extension ID stability, XPI signing status, or artifact hashes.
  Evidence: `Build-Release.ps1`, `Build-CRX.ps1`, Chrome MV3 packaging rules.
  Touches: `Build-Release.ps1`, `Build-CRX.ps1`, `tests/repo-contract.test.mjs`, `dist/` release manifest output.
  Acceptance: release gate fails on malformed ZIP paths, invalid CRX3, changed CRX ID, unsigned claimed XPI, or missing artifact checksums.
  Complexity: M
- [ ] P1 - Implement top unsupported uBO YouTube scriptlet equivalents
  Why: The filter list still carries high-value unsupported rules; coverage reporting is honest now, but protection improves only when safe equivalents are bundled locally.
  Evidence: `youtube-adblock-filters.txt:65`, `youtube-adblock-filters.txt:93`, `YoutubeAdblock.user.js:1144`, uBO `quick-fixes.txt`.
  Touches: filter parser, engine installers, diagnostics coverage, unit tests.
  Acceptance: signed filter refresh reports local support for selected `trusted-rpnt`, `trusted-json-edit-fetch-request`, `trusted-replace-outbound-text`, `trusted-prevent-dom-bypass`, `aeld`, or `trusted-set` patterns without executing remote code.
  Complexity: L

### P2 - validation and migration
- [ ] P2 - Validate real userscript-manager and mobile install paths
  Why: Browser smoke tests use local fixtures; README claims Tampermonkey MV3, Violentmonkey, Firefox Android, and Safari Userscripts behavior that still needs real manager/device validation.
  Evidence: `README.md:43`, `README.md:52`, `tests/browser-smoke.test.mjs`, Tampermonkey MV3 issue threads.
  Touches: manual QA checklist, browser-smoke fixtures, README support matrix.
  Acceptance: documented pass/fail matrix for Chrome Tampermonkey MV3, Violentmonkey, Firefox Android, and Safari Userscripts with any unsupported feature caveats reflected in README.
  Complexity: M
- [ ] P2 - Add BlockTube/FilterTube migration importers
  Why: Channel/title filtering competitors accumulate large user blocklists; plain-text import helps, but named migration importers reduce lossy moves and support requests.
  Evidence: BlockTube feature set, current blocklist import/export controls in `YoutubeAdblock.user.js:6035`.
  Touches: blocklist import parser, Control Center copy, diagnostics, unit tests.
  Acceptance: users can paste/export common BlockTube-style JSON/text lists and get normalized channel IDs, handles, names, regex entries, and keyword rules with a preview of rejected entries.
  Complexity: M
