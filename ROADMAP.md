# YoutubeAdblock Roadmap

Forward-looking scope for the split-context YouTube ad blocker (userscript + Chrome MV3 extension + Firefox MV3).

## Planned Features

### Blocking Engine
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

- [ ] P0 — Publish the missing v0.5.20 GitHub release
  Why: The repo is tagged and pushed at v0.5.20, but GitHub Releases still stops at v0.5.19, so users cannot install the latest verified artifacts.
  Evidence: `gh release view v0.5.20 --repo SysAdminDoc/YoutubeAdblock` returned `release not found`; v0.5.19 release contains the expected userscript, ZIP, CRX, and checksum assets.
  Touches: GitHub release assets, `dist/YoutubeAdblock-v0.5.20.*`, release notes.
  Acceptance: `gh release view v0.5.20 --json assets` returns `YoutubeAdblock-v0.5.20.user.js`, `YoutubeAdblock-extension-v0.5.20.zip`, `YoutubeAdblock-extension-v0.5.20.crx`, and `YoutubeAdblock-v0.5.20.checksums.sha256`.
  Complexity: S

- [ ] P0 — Add a local release-publication guard
  Why: Local artifact verification passed, but publication remained manual and drifted at v0.5.20.
  Evidence: `Build-Release.ps1:186-190` verifies local artifacts only; `extension/README.md:164` says release assets are attached manually.
  Touches: `Build-Release.ps1`, `tools/verify-release-artifacts.mjs`, `tests/repo-contract.test.mjs`.
  Acceptance: A local release command or verifier fails when the current tag lacks a GitHub release with matching asset names and checksums, and repo-contract tests cover the check.
  Complexity: M

- [ ] P1 — Sign the refreshable webpack signature database
  Why: Remote JSON is data, not code, but it still steers ad-factory matching and should have the same tamper resistance as the filter list before store distribution.
  Evidence: `YoutubeAdblock.user.js:50`, `YoutubeAdblock.user.js:3803`, `webpack-ad-signatures.json`, Chrome remote-hosted-code policy, The Hacker News remote-selected scriptlet report.
  Touches: `webpack-ad-signatures.json`, new signature/manifest data files, `tools/sign-filter-manifest.mjs` or a sibling signer, `YoutubeAdblock.user.js`, `tests/engine-core.test.mjs`.
  Acceptance: Tampered remote webpack signatures are rejected, cached/built-in signatures remain active, diagnostics reports signature integrity, and tests cover valid/tampered/unsigned cases.
  Complexity: M

- [ ] P1 — Add a remote-rule capability denylist guard
  Why: Remote filters currently parse unsupported trusted scriptlets as coverage data; future parser work must make executable or DOM-creating scriptlets impossible to route into page execution.
  Evidence: `youtube-adblock-filters.txt:65`, `youtube-adblock-filters.txt:152`, Chrome remote-hosted-code policy, The Hacker News trusted scriptlet report.
  Touches: `parseUBOFilterList` in `YoutubeAdblock.user.js`, `tests/engine-core.test.mjs`, `tests/repo-contract.test.mjs`.
  Acceptance: Remote rules containing script-creating or arbitrary-code scriptlets are reported as rejected-dangerous, never counted as supported, and regression tests prove no remote text can create a script element or executable function body.
  Complexity: M

- [ ] P1 — Convert optional community API hosts to runtime permissions
  Why: RYD is optional and SponsorBlock may be disabled by users, but extension install still requests both community API hosts up front.
  Evidence: `extension/manifest.json:22-30`, Chrome/Mozilla permission guidance, README feature defaults.
  Touches: `extension/manifest.json`, `extension/bridge.js`, `YoutubeAdblock.user.js`, `Build-Extension.ps1`, `tests/repo-contract.test.mjs`.
  Acceptance: Optional API features request host access when enabled, handle denial with locked/off UI plus diagnostics, and keep default userscript behavior unchanged.
  Complexity: L

- [ ] P1 — Add store-policy preflight checks for the generated extension
  Why: Chrome and AMO reviews care about remote hosted code, broad permissions, unsigned XPI language, and background compatibility; these are currently spread across docs/tests instead of one preflight.
  Evidence: Chrome remote-hosted-code policy, Mozilla signing docs, `extension/manifest.json`, `tests/repo-contract.test.mjs:67-115`.
  Touches: `tools/verify-release-artifacts.mjs` or new non-md tool, `tests/repo-contract.test.mjs`, `Build-Release.ps1`.
  Acceptance: Release gate fails on remote executable URLs in generated code, unexpected broad host permissions, stale background compatibility keys, unsigned-XPI naming drift, or missing extension ID/checksum checks.
  Complexity: M

- [ ] P2 — Turn `STRINGS` into a real i18n pipeline
  Why: Visible copy is centralized, but there is no `_locales` output, `default_locale`, or userscript locale resolver yet.
  Evidence: `YoutubeAdblock.user.js:386`, `tests/repo-contract.test.mjs:131-168`, Chrome `i18n` API docs.
  Touches: `YoutubeAdblock.user.js`, `Build-Extension.ps1`, `extension/manifest.json`, generated `_locales`, `tests/repo-contract.test.mjs`.
  Acceptance: Extension build emits default locale messages, manifest uses localized name/description where appropriate, userscript keeps English fallback, and tests fail if new visible copy bypasses the locale table.
  Complexity: L

- [ ] P2 — Add live userscript-manager and mobile validation matrix
  Why: Browser-smoke fixtures pass, but README claims Tampermonkey, Violentmonkey, Safari Userscripts, and Firefox Android paths that are not exercised live.
  Evidence: `README.md:8-55`, `tests/browser-smoke.test.mjs`, Tampermonkey YouTube/MV3 injection issues.
  Touches: `tests/browser-smoke.test.mjs`, optional local test tooling, README support notes.
  Acceptance: A local validation script records pass/fail for Tampermonkey Chrome MV3, Violentmonkey Firefox, Safari Userscripts when available, and Firefox Android or emulator/device when available; unsupported environments are reported explicitly.
  Complexity: L

- [ ] P2 — Add community API cache and privacy controls
  Why: SponsorBlock, DeArrow, and RYD data are cached locally, but users cannot inspect or clear those caches independently from restoring all settings.
  Evidence: SponsorBlock/DeArrow/RYD API docs, `README.md:85-93`, local cache helpers in `YoutubeAdblock.user.js`.
  Touches: `YoutubeAdblock.user.js`, `tests/engine-core.test.mjs`, Control Center diagnostics/recovery section.
  Acceptance: Control Center shows community API cache counts/ages, can clear SponsorBlock/DeArrow/RYD caches independently, and copied diagnostics reports cache state without video history leakage.
  Complexity: M

- [ ] P2 — Make SponsorBlock SSAI-aware
  Why: Server-side insertion can shift content timestamps, so SponsorBlock skip/view behavior should not silently pollute metrics or skip the wrong segment after an SSAI signal.
  Evidence: `YoutubeAdblock.user.js:2093-2184`, `YoutubeAdblock.user.js:3360-3361`, AdGuard SSAI analysis, SponsorBlock API docs.
  Touches: SponsorBlock skip/view path in `YoutubeAdblock.user.js`, diagnostics, `tests/engine-core.test.mjs`.
  Acceptance: When current-video SSAI is detected, SponsorBlock skips either pause with a warning or run in an offset-safe mode, view pings are suppressed for uncertain offsets, and diagnostics reports the chosen behavior.
  Complexity: M

- [ ] P2 — Add a manual uAssets quick-fix ingestion tool
  Why: YouTube fixes move through uAssets faster than this repo's bundled filter/signature files, but updates are manual and easy to miss.
  Evidence: uAssets YouTube ongoing issues, `youtube-adblock-filters.txt`, `tools/sign-filter-manifest.mjs`, `webpack-ad-signatures.json`.
  Touches: new non-md tool under `tools/`, `youtube-adblock-filters.txt`, `webpack-ad-signatures.json`, filter/signature manifests, tests.
  Acceptance: A local command fetches upstream quick-fixes, maps supported scriptlets to bundled equivalents, leaves dangerous/unsupported rules as rejected coverage, re-signs filter/signature data, and runs the relevant parser/signature tests.
  Complexity: M
