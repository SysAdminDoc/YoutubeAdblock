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

### P2 - validation and migration

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

### P2 - diagnostics and performance additions

- [ ] P2 — Add extension DNR matched-rule diagnostics
  Why: Page diagnostics cannot prove whether the browser network-layer rules actually fired, which makes extension-specific ad reports hard to triage.
  Evidence: Chrome `declarativeNetRequest.getMatchedRules` docs, `extension/manifest.json:57-64`, `extension/rules/network-rules-source.json`, `buildDiagnosticsReport()` in `YoutubeAdblock.user.js:7626-7687`.
  Touches: `extension/background.js`, `extension/bridge.js`, `YoutubeAdblock.user.js`, `extension/manifest.json`, `tests/background-contract.test.mjs`, `tests/bridge-security.test.mjs`.
  Acceptance: Extension diagnostics include recent DNR rule IDs/counts for YouTube ad endpoints when feedback APIs are available, degrade cleanly without the feedback permission/API, and never expose non-YouTube browsing data.
  Complexity: M

### Audit-surfaced items

- [ ] P2 — Harden cosmetic CSS hash to fully deduplicate selector sets
  Why: Current mid-point sampling hash still has false-positive risk for selector sets that differ only in positions not sampled.
  Where: `YoutubeAdblock.user.js` `updateCosmeticCSS` function.

- [ ] P2 — Add light theme or system-preference CSS for the Control Center
  Why: The entire panel CSS is dark-only with hardcoded RGBA values; no `prefers-color-scheme: light` path exists.
  Where: `YoutubeAdblock.user.js` `injectSettingsCSS` function.

- [ ] P3 — Replace DeArrow `locked` boolean arithmetic with explicit comparison
  Why: `b.locked - a.locked` relies on boolean-to-number coercion; explicit `b.locked === a.locked ? 0 : b.locked ? -1 : 1` is clearer.
  Where: `YoutubeAdblock.user.js` `dearrowResolve` function.

- [ ] P3 — Improve DOM bypass prevention script detection beyond simple string matching
  Why: `window,"fetch"` string matching can be evaded with template literals, concatenation, or Unicode escapes.
  Where: `YoutubeAdblock.user.js` `installDOMBypassPrevention` function.

## Research-Driven Additions

### P1 - trust boundary hardening

- [ ] P1 — Move extension settings storage behind a trusted-context broker
  Why: Page-world events can currently request allowlisted settings reads/writes through the bridge; Chrome supports hiding extension storage from untrusted contexts.
  Evidence: `extension/bridge.js:260-424`, `tests/bridge-security.test.mjs:230-346`, Chrome `chrome.storage.*.setAccessLevel()` docs.
  Touches: `extension/background.js`, `extension/bridge.js`, `tests/bridge-security.test.mjs`, `tests/background-contract.test.mjs`.
  Acceptance: The service worker owns `chrome.storage.local/sync` reads and writes; bridge requests use `chrome.runtime.sendMessage`; storage access is restricted to trusted contexts where supported; tests prove page CustomEvents cannot directly reach `chrome.storage.*` and sync chunk/oversize behavior still works.
  Complexity: L

