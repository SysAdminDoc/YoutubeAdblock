# YoutubeAdblock Roadmap

Incomplete, actionable work only. Completed work belongs in `CHANGELOG.md`. Every item needs evidence, an acceptance test, and a rollback-safe implementation.

## Now / Next — Top Five

- [ ] **P2 — Export a privacy-scrubbed diagnostic bundle**
  Why: copied text now includes browser-layer DNR evidence, but issue triage still lacks a structured bundle of bounded recent engine events and integrity state.
  Next investigation: define a versioned JSON schema over existing counters, engine health, rule integrity, API cooldowns, and DNR summaries; add a small in-memory prune-event ring that records keys and endpoint classes without URLs or media identifiers.
  Acceptance: one explicit export produces deterministic JSON, schema validation rejects private fields, redaction tests cover video/playlist/custom-filter data, and no event history is persisted unless the user downloads it.
  Complexity: M

## Backlog

- [ ] **P2 — Capture SSAI markers before offset-safe SponsorBlock behavior**
  Capture a real `serverStitchedAd`/SSAP session and map player fields, manifest markers, timeline discontinuities, and seeking before changing SponsorBlock offsets or view pings. Until then, retain warn-only behavior.

- [ ] **P2 — Per-surface engine profiles**
  Add independent desktop profiles for main home/search/watch, Shorts, Music, TV, Kids, and embeds without duplicating setting keys or engine installation.

- [ ] **P2 — Trusted Types completion audit**
  Remove or wrap every remaining string-to-HTML path, add a Trusted Types-enforced browser fixture, and downgrade README claims until the audit passes.

- [ ] **P2 — Manual uAssets quick-fix ingestion tool**
  Fetch upstream changes on explicit maintainer command, map only locally supported safe syntax, reject dangerous capabilities, re-sign data, and run parser/signature tests.

- [ ] **P2 — Real localization pipeline**
  Generate extension `_locales`, add `default_locale`, preserve the userscript English fallback, and fail tests when visible strings bypass the catalog.

- [ ] **P2 — Rules playground**
  Preview a bounded cosmetic selector against the current page without executing arbitrary scriptlets or persisting it until the user confirms.

- [ ] **P2 — Category-aware SponsorBlock behavior**
  Keep sponsor auto-skip, allow mute/manual modes for softer categories, and make uncertain/SSAI behavior explicit.

- [ ] **P2 — Dynamic DNR update design**
  Evaluate signed data-to-DNR compilation for faster endpoint response while keeping all executable logic packaged and store-policy compliant.

- [ ] **P2 — Toolbar popup parity**
  Provide protection status and the few high-frequency actions without duplicating the full Control Center or introducing stale state.

- [ ] **P3 — Enterprise managed defaults**
  Add a managed schema only after the settings broker exists, with diagnostics showing which values are policy-controlled.

## Research-Driven Additions

### P0

### P1

### P2

- [ ] P2 — Add an accessibility release gate for the complete Control Center
  Why: The dialog has strong semantics and focus handling, but current tests do not run an accessibility engine or cover forced colors, high zoom, narrow layouts, and representative assistive technology.
  Evidence: YoutubeAdblock.user.js Control Center construction and CSS; tests/browser-smoke.test.mjs; WAI-ARIA modal dialog pattern; WCAG 2.2 Focus Not Obscured.
  Touches: package.json; package-lock.json; tests/browser-smoke.test.mjs; YoutubeAdblock.user.js; README.md support matrix.
  Acceptance: scoped axe/ARIA checks find no serious or critical violations across every section and both themes; tests cover accessible name/role/state, tab wrap, Escape, focus return, live status, forced colors, 320 CSS-pixel width, and 200%/400% zoom without lost controls or two-dimensional page scrolling; a dated manual NVDA pass is recorded, while VoiceOver/TalkBack remains part of the existing platform-validation work.
  Complexity: M

- [ ] P2 — YouTube-semantic element zapper (picker → stable named toggle)
  Why: July–August 2026 threads show sustained unmet demand for hide-Shorts/hide-VODs/kill-hover-autoplay/hide-injected-recommendations controls; users hand-write fragile uBO filters, and no YouTube-specific blocker ships a picker — a leapfrog feature this repo's existing filter/clutter infrastructure can carry.
  Evidence: r/uBlockOrigin threads 1v5lajc (2026-07-24), 1v6qoz6 (2026-07-26), 1vfouqs (2026-08-04), 1viss98 (2026-08-08); FilterTube 2026 additions lack a picker (AMO listing); uBO element zapper is generic and its CWS host dies 2026-08-31. Builds on the existing P2 Rules playground item — the playground's bounded-preview/confirm flow is the zapper's commit step.
  Touches: YoutubeAdblock.user.js (picker overlay, renderer-name mapping, CLUTTER_SELECTORS-style toggle registry); Control Center; tests/browser-smoke.test.mjs; generated extension/main.js via Build-Extension.ps1.
  Acceptance: picking a rendered element maps it to the closest known semantic container (renderer/component name, e.g. Shorts shelf, hover-preview, injected recommendation unit) and offers a named persistent toggle rather than a brittle positional selector; unknown elements fall back to the bounded playground flow with an explicit fragility warning; created toggles survive DOM churn tests on current fixtures, are listed/removable in the Control Center, and never touch player, consent, or compliance surfaces; picker mode is fully keyboard-accessible and cannot persist a rule without explicit confirmation.
  Complexity: L

### P3

- [ ] P3 — Drive feature defaults, UI, persistence, and lifecycle from one registry
  Why: Feature defaults, copy/groups, install calls, portable/sync eligibility, diagnostics, and teardown behavior live in separate lists, making exposed toggles easy to drift from runtime behavior.
  Evidence: YoutubeAdblock.user.js:446-939,805-827,5308-5331,7448-7583; CHANGELOG.md v0.5.23 and tests/repo-contract.test.mjs feature contract; YouTube Enhancer issues 1348 and 1351.
  Touches: YoutubeAdblock.user.js; Build-Extension.ps1; tests/engine-core.test.mjs; tests/repo-contract.test.mjs; README.md.
  Acceptance: one validated registry declares each feature’s key, default, section/copy reference, availability by build/surface, sync/export eligibility, start hook, optional teardown hook, and diagnostic label; adding a fixture feature fails contract tests when any required lifecycle field or referenced copy is missing; generated-extension parity stays exact and all current feature behavior remains unchanged.
  Complexity: L
