# YoutubeAdblock Roadmap

Incomplete, actionable work only. Completed work belongs in `CHANGELOG.md`. Every item needs evidence, an acceptance test, and a rollback-safe implementation.

## Now / Next — Top Five

- [ ] **P1 — Capture and replay real ad creative across desktop surfaces**
  Why: the 2026-08-13 live sessions exposed current ad endpoints and DOM roots, but the available account/browser environment did not receive pre-roll, mid-roll, feed, Shorts, Music, TV, Kids, or embed creative.
  Next investigation: use disposable signed-out and non-Premium profiles plus at least two regions; wait until each creative type is actually served; record sanitized request paths, response field shapes, media URLs, and rendered containers.
  Acceptance: one privacy-scrubbed fixture and regression test per observed creative type; unpacked-extension and userscript-manager runs show no visible ads, audible ads, or escaping ad-media requests while normal playback/comments/navigation remain intact.
  Blocker: needs an account/region/experiment combination that receives real ads.
  Complexity: L

- [ ] **P1 — Validate real desktop userscript managers**
  Why: direct userscript fixture injection passes, but it does not prove Tampermonkey or Violentmonkey document-start timing and sandbox behavior on current browser releases.
  Next investigation: test Chrome + Tampermonkey and Firefox + Violentmonkey in isolated desktop profiles; capture injection-health diagnostics on cold watch loads and SPA navigation.
  Note (2026-08-14): Violentmonkey shipped v2.46.0–v2.47.1 between 2026-07-29 and 2026-08-13; its MV3 document-start timing depends on an off-by-default experimental "Alternative page mode". The matrix must test VM 2.47.x default mode explicitly and document the required setting if the injection race is lost. Tampermonkey 5.5.0 added a userscript-injection permission prompt that install docs must name.
  Acceptance: a dated pass/fail matrix covers install, update, Control Center, cold load, search-to-watch navigation, video playback, comments, Music, Shorts, and ad-request suppression; README support claims match the results.
  Blocker: requires those manager extensions and Firefox desktop in disposable profiles.
  Complexity: M

- [ ] **P1 — Recover or deliberately migrate the stable CRX identity**
  Why: v0.5.20 pinned Chromium ID `jpeojodihepmkpdhibnnbgamnakclnnj`, but its matching private key is not present in the repository or current local release locations. A newly generated key changes the ID, storage namespace, and update continuity.
  Next investigation: recover the original PEM from the maintainer's secure backup or prior release machine and verify it with `Build-CRX.ps1 -KeyPath`; if it is permanently lost, design an explicit ID/storage/update migration and document the break before rotating.
  Acceptance: the generated CRX cryptographically verifies, matches `extension/extension-id.txt`, and the full gate passes with `-Artifacts Userscript,Zip,Crx -CrxKeyPath <key>`; no private key is committed.
  Blocker: requires the historical private key or an explicit maintainer decision to rotate identity.
  Complexity: M

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

- [ ] **P2 — Community API cache controls**
  Show SponsorBlock, DeArrow, and RYD cache counts/ages; clear each independently; retain hash-prefix privacy and cooldown reporting.

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

- [ ] **P3 — Clarify DeArrow locked-item ordering**
  Replace boolean arithmetic with explicit comparison and add an ordering unit test.

- [ ] **P3 — Strengthen DOM bypass detection**
  Replace simple source-string matching with narrowly scoped structural detection that recognizes equivalent fetch-lift patterns without blocking legitimate scripts.

## Research-Driven Additions

### P0

- [ ] P0 — Separate synchronized preferences from device-local runtime state
  Why: After the existing trusted-context broker closes the page boundary, the extension still mirrors one whole settings object, including hot stats and caches, so two-part sync writes can exceed Chrome’s 1,800 writes/hour quota and a newer snapshot can overwrite preferences or local-only state.
  Evidence: YoutubeAdblock.user.js:1177-1190; Build-Extension.ps1:118-154; extension/bridge.js:124-129,187-247,273-285; Chrome Storage API.
  Touches: YoutubeAdblock.user.js; Build-Extension.ps1; extension/background.js; extension/bridge.js; tests/bridge-security.test.mjs; tests/repo-contract.test.mjs; README.md; extension/README.md.
  Acceptance: a versioned allowlist syncs only user-authored preferences; stats, rule/signature caches, integrity state, cooldowns, and onboarding state remain local or session-only; UTF-8 byte accounting respects per-item/total quotas; generation IDs, checksum, and a final commit marker prevent partial reads; concurrent-device merges cannot erase local-only keys; migration from the current version-1 snapshot is idempotent; tests cover sustained stats, quota errors, Unicode boundaries, interrupted writes, and competing device updates.
  Complexity: L

### P1

### P2

- [ ] P2 — Add an accessibility release gate for the complete Control Center
  Why: The dialog has strong semantics and focus handling, but current tests do not run an accessibility engine or cover forced colors, high zoom, narrow layouts, and representative assistive technology.
  Evidence: YoutubeAdblock.user.js Control Center construction and CSS; tests/browser-smoke.test.mjs; WAI-ARIA modal dialog pattern; WCAG 2.2 Focus Not Obscured.
  Touches: package.json; package-lock.json; tests/browser-smoke.test.mjs; YoutubeAdblock.user.js; README.md support matrix.
  Acceptance: scoped axe/ARIA checks find no serious or critical violations across every section and both themes; tests cover accessible name/role/state, tab wrap, Escape, focus return, live status, forced colors, 320 CSS-pixel width, and 200%/400% zoom without lost controls or two-dimensional page scrolling; a dated manual NVDA pass is recorded, while VoiceOver/TalkBack remains part of the existing platform-validation work.
  Complexity: M

- [ ] P2 — Add an auto-restoring recovery pause that never syncs
  Why: False positives can break playback, but the current master switch is persistent and global; commercial blockers demonstrate safer tab/session/short timed trust controls.
  Evidence: YoutubeAdblock.user.js protection switch and settings persistence; GitHub issue 2; Ghostery 10 temporary trust controls; community false-positive reports.
  Note (2026-08-14): the pause/self-test should recognize the progressive degradation ladder reported in the 2026-08-09/10 anti-adblock wave — repeated ads → throttling → autoplay stops → videos refuse to load (r/Adblock threads 1vka53b, 1vjyjth) — and suggest stage-appropriate recovery, not only react to binary enforcement popups.
  Touches: YoutubeAdblock.user.js; extension/background.js; extension/bridge.js; extension action/context menus; tests/browser-smoke.test.mjs; tests/background-contract.test.mjs; README.md.
  Acceptance: users can pause the current tab/session or choose a short timed pause with a visible scope and countdown; the state is stored only in memory, sessionStorage, or chrome.storage.session and is excluded from sync/export; expiry, tab close, extension restart, and an explicit Resume restore the documented engine set; persistent global disable remains a separate deliberate action; tests prove a pause cannot silently become permanent or leak to another tab/device.
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
