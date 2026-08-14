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

- [ ] **P1 — Move extension settings behind a trusted-context broker**
  Why: page-world events currently request allowlisted settings reads/writes through the isolated bridge; a service-worker broker can reduce the exposed storage boundary.
  Next investigation: map every bridge setting operation and `chrome.storage.local/sync` consumer before changing access levels.
  Acceptance: the service worker owns storage reads/writes; bridge mutations use a bounded runtime-message protocol; trusted-context access is restricted where supported; sync chunking, oversize fallback, and context-menu actions retain contract tests.
  Complexity: L

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

- [ ] P1 — Make signed remote data rollback-, freeze-, and mix-and-match-resistant
  Why: Current Ed25519 signatures prove origin and content integrity but accept an older valid filter or webpack-signature release because freshness, artifact role, and key rotation are not signed or persisted.
  Evidence: YoutubeAdblock.user.js:47-64,1967-2055,4015-4060; youtube-adblock-filters.manifest.json; webpack-ad-signatures.manifest.json; The Update Framework metadata and security model.
  Touches: YoutubeAdblock.user.js; tools/sign-filter-manifest.mjs; both manifest/signature pairs; tests/engine-core.test.mjs; tests/repo-contract.test.mjs; README.md.
  Acceptance: the signed envelope includes schema, artifact role, content name, hash, byte count, monotonic revision, expiry, and key ID; filter and webpack roles use domain-separated authorization; the client persists the highest accepted revision per role, rejects replayed, expired, cross-role, or partially mixed candidates, and supports a tested key-rotation path; rejection retains the last-known-good generation offline with an explicit stale reason.
  Complexity: M

- [ ] P1 — Make settings import versioned, preflighted, atomic, and undoable
  Why: Export declares app/schema versions, but import ignores them, silently skips invalid fields, and performs sequential writes that can leave a partial configuration.
  Evidence: YoutubeAdblock.user.js:7448-7470,7586-7692; current portability UI; migration and upgrade category audit.
  Touches: YoutubeAdblock.user.js; tests/engine-core.test.mjs; tests/browser-smoke.test.mjs; README.md.
  Acceptance: import validates app, schema version, every supported field, limits, and URLs before writing; future schemas are rejected with a clear message; the user sees an exact add/change/remove diff; one confirmed operation either commits every change or restores the pre-import snapshot; one-click undo remains available for the session; version-1, malformed, oversized, unknown-key, future-version, and injected write-failure fixtures prove deterministic behavior in userscript and extension builds.
  Complexity: M

- [ ] P1 — Split development diagnostics from least-privilege production manifests
  Why: tabs grants sensitive tab metadata the background does not need, while declarativeNetRequestFeedback is documented for unpacked-extension debugging and cannot support the current production evidence claim.
  Evidence: extension/manifest.json:20-26; extension/background.js:117-191,309-329; extension/README.md:49-57; Chrome Tabs API; Chrome Declarative Net Request API; Chrome Web Store Use of Permissions policy.
  Touches: extension/manifest.json; Build-Extension.ps1; Build-Release.ps1; extension/background.js; extension/bridge.js; tests/background-contract.test.mjs; tests/repo-contract.test.mjs; README.md; extension/README.md.
  Acceptance: the production manifest contains neither tabs nor declarativeNetRequestFeedback; a development manifest enables DNR match debugging only for unpacked QA; toolbar, commands, context menus, tab creation, and YouTube messaging pass on YouTube and non-YouTube tabs without tabs; production diagnostics either use an eligible explicit user-gesture grant or report evidence unavailable without implying blocking failure; release checks inspect both profiles and the ZIP contains only the production profile.
  Complexity: M

- [ ] P1 — Fix Control Center section overlap during rail navigation
  Why: Captured browser-smoke screenshots show the prior section’s cards painting over the selected Core Blocking and Rule Library headings, so the destination can be technically in the viewport while its content remains obscured.
  Evidence: dist/browser-smoke/userscript-www-watch-dark-section-core.png; dist/browser-smoke/userscript-www-watch-dark-section-rules.png; YoutubeAdblock.user.js:5634,8466-8482; tests/browser-smoke.test.mjs section-navigation checks; WCAG 2.2 Focus Not Obscured.
  Touches: YoutubeAdblock.user.js Control Center CSS/navigation; tests/browser-smoke.test.mjs; generated extension/main.js via Build-Extension.ps1.
  Acceptance: all ten rail destinations in both themes at 1440×900 and 1920×1080 leave the target heading and first control fully visible; no preceding/following section painted or bounding region overlaps the target; the dialog remains inside the viewport; mouse and keyboard navigation preserve focus and reduced-motion behavior; Playwright asserts geometry and captures stable screenshots.
  Complexity: S

- [ ] P1 — Make the Chrome install path bulletproof before the 2026-08-31 MV2 store removal
  Why: Chrome Web Store deletes all remaining MV2 extensions on 2026-08-31 and uBO 1.73 is expected to be its last CWS stable, so displaced Chrome users' full-strength options narrow to Firefox, uBO Lite, or userscript/MV3 blockers — this repo's Chrome onboarding becomes its front door within weeks.
  Evidence: developer.chrome.com MV2 deprecation timeline (2026-08-31 milestone); r/uBlockOrigin 1.73 announcement thread 2026-08-05 (1vg98o4); tampermonkey.net changelog 5.5.0 (new userscript-injection permission + download-permission prompt).
  Touches: README.md install/troubleshooting sections; extension/README.md; userscript-manager diagnostics copy in YoutubeAdblock.user.js (Allow User Scripts guidance).
  Acceptance: README documents the current Chrome paths step-by-step — Tampermonkey 5.5.0 permission prompt named and shown, Allow User Scripts toggle, unpacked MV3 extension route — plus a short "coming from uBlock Origin" orientation note; the in-product manager diagnostics message matches Tampermonkey 5.5.x behavior; claims verified against a real Chrome + Tampermonkey 5.5.x profile or explicitly marked pending the manager-validation matrix.
  Complexity: S

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

- [ ] P2 — Detect SABR-only player responses and degrade gracefully
  Why: 2026 enforcement removes distinct adaptiveFormats URLs from web player responses in favor of serverAbrStreamingUrl, eroding URL-level ad classification (googlevideo ctier rules, manifest scrubbing) and 403ing non-compliant clients; the engine must never misclassify or break playback on such a response.
  Evidence: yt-dlp issues 12482 and 15689; yt-dlp SABR downloader PR 13515; existing isInlinePlaybackNoAd SABR fake-buffering counter in YoutubeAdblock.user.js. Related: Roadmap_Blocked.md SSAI item (server-stitched ads are the adjacent unsolved problem; this item is only detection + safe degradation, not seeking).
  Touches: YoutubeAdblock.user.js player-response handling and diagnostics; tests/engine-core.test.mjs with a SABR-only player-response fixture.
  Acceptance: a fixture player response lacking adaptiveFormats URLs is detected and counted in diagnostics; JSON pruning and cosmetic engines stay active; URL-dependent engines (ctier rules, manifest scrub) report "no signal" rather than false success; playback-affecting interventions are suppressed for that session; behavior is covered by a regression test. Rollout measurement stays in RESEARCH.md Open Question 4.
  Complexity: M

- [ ] P2 — Never auto-dismiss compliance dialogs; surface and log them instead
  Why: Desktop YouTube is A/B-testing transient pre-playback overlays tied to AI age/identity verification; popup-dismissal or anti-detection heuristics that pattern-match "unexpected overlay at player start" risk silently dismissing a dialog with account consequences.
  Evidence: r/uBlockOrigin 2026-07-20 thread 1v1x09u (multiple reports, uBO active); YouTube age-estimation program announcement (blog.youtube); existing enforcement-popup cosmetic fallback and breakage self-test in YoutubeAdblock.user.js.
  Touches: YoutubeAdblock.user.js enforcement-popup/overlay handling and self-test; tests/engine-core.test.mjs; diagnostics copy.
  Acceptance: overlay handling checks a conservative allowlist of compliance-dialog signatures (age/identity verification markers) before any hide/dismiss action; matches are left untouched, counted, and surfaced in diagnostics as "compliance dialog detected, not blocked"; a fixture proves an age-verification overlay survives while a known enforcement popup is still handled; the allowlist is data-driven so signed filter updates can extend it without code changes.
  Complexity: S

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
