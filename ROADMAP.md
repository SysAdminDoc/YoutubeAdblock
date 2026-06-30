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

### P1 - distribution trust additions

- [ ] P1 — Add a userscript marketplace preflight
  Why: Raw GitHub install works, but Greasy Fork/OpenUserJS-style distribution has separate readable-code, size, `@connect`, and external-service disclosure constraints that are not covered by the extension store preflight.
  Evidence: Greasy Fork code rules, `YoutubeAdblock.user.js:2-33`, `YoutubeAdblock.user.js` size 371190 bytes, `README.md:8-55`.
  Touches: new non-md verifier under `tools/`, `tests/repo-contract.test.mjs`, `Build-Release.ps1`, README distribution notes.
  Acceptance: Local release checks fail when the userscript exceeds marketplace size limits, drops required metadata/update URLs, adds undisclosed `@connect` hosts, becomes minified/obfuscated, or uses external services without README disclosure.
  Complexity: M

- [ ] P1 — Add third-party filter and API license preflight
  Why: The bundled filter list combines uBO, quick-fixes, EasyList, and annoyance sources while README only exposes the repo MIT license; community API data also has attribution and usage requirements.
  Evidence: `youtube-adblock-filters.txt:1-8`, uAssets license, SponsorBlock/DeArrow API docs, Return YouTube Dislike usage rights, `YoutubeAdblock.user.js:6600-6614`.
  Touches: `youtube-adblock-filters.txt`, README attribution/license section, `tools/verify-release-artifacts.mjs` or a new non-md license verifier, `tests/repo-contract.test.mjs`.
  Acceptance: Release checks verify upstream filter/source attribution is present, README distinguishes project code license from bundled filter/data terms, and API attribution links remain visible in Control Center and docs.
  Complexity: M

- [ ] P1 — Emit release provenance metadata
  Why: Checksums prove artifact bytes, but current artifacts do not record git SHA, dirty-tree state, tool versions, test command, Playwright version, or browser-smoke result alongside the release.
  Evidence: `Build-Release.ps1:186-190`, `tools/verify-release-artifacts.mjs:218-240`, GitHub release asset digest metadata for v0.5.19.
  Touches: `Build-Release.ps1`, `tools/verify-release-artifacts.mjs`, `tests/repo-contract.test.mjs`, release assets.
  Acceptance: The release gate writes a versioned provenance JSON or text artifact with commit SHA, tag, clean/dirty status, Node/npm/Playwright versions, built artifact hashes, and test summary; verification fails if it is missing or mismatched.
  Complexity: M

### P2 - diagnostics and performance additions

- [ ] P2 — Add extension DNR matched-rule diagnostics
  Why: Page diagnostics cannot prove whether the browser network-layer rules actually fired, which makes extension-specific ad reports hard to triage.
  Evidence: Chrome `declarativeNetRequest.getMatchedRules` docs, `extension/manifest.json:57-64`, `extension/rules/network-rules-source.json`, `buildDiagnosticsReport()` in `YoutubeAdblock.user.js:7626-7687`.
  Touches: `extension/background.js`, `extension/bridge.js`, `YoutubeAdblock.user.js`, `extension/manifest.json`, `tests/background-contract.test.mjs`, `tests/bridge-security.test.mjs`.
  Acceptance: Extension diagnostics include recent DNR rule IDs/counts for YouTube ad endpoints when feedback APIs are available, degrade cleanly without the feedback permission/API, and never expose non-YouTube browsing data.
  Complexity: M

- [ ] P2 — Add diagnostics redaction controls
  Why: Current diagnostics include page path, user agent, filter URL, SSAI URL context, features, and rule metadata; future event bundles increase the chance of leaking video IDs or private custom filter query tokens.
  Evidence: `YoutubeAdblock.user.js:7626-7687`, SponsorBlock hash-prefix privacy pattern, existing roadmap diagnostic bundle item.
  Touches: `buildDiagnosticsReport()` in `YoutubeAdblock.user.js`, Control Center diagnostics copy flow, `tests/engine-core.test.mjs`, `tests/browser-smoke.test.mjs`.
  Acceptance: Copied diagnostics redact video IDs, query strings, custom filter tokens, and raw community API cache keys by default, with tests covering YouTube watch URLs, Shorts URLs, custom filter URLs, and SSAI URLs.
  Complexity: S

- [ ] P2 — Add parser and interceptor performance budgets
  Why: Remote filters, InnerTube payloads, and webpack factories are bounded but not benchmarked, so regressions in hot document-start paths can ship while functional tests remain green.
  Evidence: `YoutubeAdblock.user.js:1373-1384`, `YoutubeAdblock.user.js:3715-3817`, `tests/engine-core.test.mjs`, active uAssets commits and YouTube quick-fix churn.
  Touches: `tests/engine-core.test.mjs` or a new non-md perf test under `tests/`, package scripts, parser/prune/webpack helper exports.
  Acceptance: A local test command fails when parsing a 50k-line filter list, pruning representative large player/browse payloads, or scanning guarded webpack factories exceeds fixed budgets on this machine.
  Complexity: M

## Research-Driven Additions

### P1 - trust boundary hardening

- [ ] P1 — Move extension settings storage behind a trusted-context broker
  Why: Page-world events can currently request allowlisted settings reads/writes through the bridge; Chrome supports hiding extension storage from untrusted contexts.
  Evidence: `extension/bridge.js:260-424`, `tests/bridge-security.test.mjs:230-346`, Chrome `chrome.storage.*.setAccessLevel()` docs.
  Touches: `extension/background.js`, `extension/bridge.js`, `tests/bridge-security.test.mjs`, `tests/background-contract.test.mjs`.
  Acceptance: The service worker owns `chrome.storage.local/sync` reads and writes; bridge requests use `chrome.runtime.sendMessage`; storage access is restricted to trusted contexts where supported; tests prove page CustomEvents cannot directly reach `chrome.storage.*` and sync chunk/oversize behavior still works.
  Complexity: L

### P2 - regression and API resilience

- [ ] P2 — Add closed-breakage replay fixtures for issue #1 and issue #2
  Why: Both real user reports were severe playback/watch-page blockers, but current tests only cover narrower helper behavior and browser smoke.
  Evidence: GitHub issues #1/#2, `CHANGELOG.md:246-260`, `YoutubeAdblock.user.js:2511-2563`, `tests/engine-core.test.mjs`, `tests/browser-smoke.test.mjs`.
  Touches: `tests/engine-core.test.mjs`, `tests/browser-smoke.test.mjs`, test fixture helpers.
  Acceptance: Local tests replay the 3-video playback blocker and the `/watch` `clientScreen` regression inputs; tests fail if comments/player `streamingData` is removed or if the retired `clientScreen` rewrite behavior returns.
  Complexity: M

- [ ] P2 — Add community API cooldown and retry diagnostics
  Why: SponsorBlock/DeArrow/RYD failures currently collapse to null; RYD has known rate-limit pressure, and users need visible cooldown state instead of silent retry churn.
  Evidence: `YoutubeAdblock.user.js:3294-3315`, `YoutubeAdblock.user.js:4012-4028`, `YoutubeAdblock.user.js:4170-4186`, SponsorBlock API docs, DeArrow API docs, Return YouTube Dislike issue #319, MDN HTTP 429 docs.
  Touches: `YoutubeAdblock.user.js`, `tests/engine-core.test.mjs`, Control Center diagnostics/recovery UI.
  Acceptance: 429 and `Retry-After` responses set per-service cooldowns, suppress repeated fetches until expiry, show cooldown/service status in diagnostics, preserve existing cache fallback, and tests cover SponsorBlock, DeArrow, and RYD cooldown behavior.
  Complexity: M
