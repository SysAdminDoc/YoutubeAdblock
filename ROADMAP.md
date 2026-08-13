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
