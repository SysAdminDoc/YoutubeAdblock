# YoutubeAdblock Roadmap

Incomplete, actionable work only. Completed work belongs in `CHANGELOG.md`. Every item needs evidence, an acceptance test, and a rollback-safe implementation.

## Now / Next — Top Five

Start with the P1 sync-regression repair under Research-Driven Additions, then the remaining P1 root-cause fixes. The item below remains the top non-security piece of work.

- [ ] **P2 — Export a privacy-scrubbed diagnostic bundle**
  Why: copied text now includes browser-layer DNR evidence, but issue triage still lacks a structured bundle of bounded recent engine events and integrity state.
  Next investigation: define a versioned JSON schema over existing counters, engine health, rule integrity, API cooldowns, and DNR summaries; add a small in-memory prune-event ring that records keys and endpoint classes without URLs or media identifiers.
  Acceptance: one explicit export produces deterministic JSON, schema validation rejects private fields, redaction tests cover video/playlist/custom-filter data, and no event history is persisted unless the user downloads it.
  Research note (2026-08-15): two license-compatible reference implementations exist and cover both halves. uBlock Origin's `src/js/support.js` supplies the redaction taxonomy — explicit `sensitiveValues`/`sensitiveKeys` tables driving `redactValue` (arrays become `[array of N redacted]`, scalars `[redacted]`), `redactKeys` for list names, and `patchEmptiness` — then renders Markdown that prefills a GitHub issue. Ghostery's `getReportOptions()` supplies the complementary trick: reduce sensitive settings to a boolean presence flag and omit them entirely when inactive, which is the right treatment for channel/keyword blocklists and the ad allowlist.
  Complexity: M

## Backlog

- [ ] **P2 — Capture SSAI markers before offset-safe SponsorBlock behavior**
  Capture a real `serverStitchedAd`/SSAP session and map player fields, manifest markers, timeline discontinuities, and seeking before changing SponsorBlock offsets or view pings. Until then, retain warn-only behavior.
  Research note (2026-08-15): priority lowered on a negative finding. A 12-month community sweep returned a verified zero reports of SABR or server-stitched ads defeating a browser ad blocker; all substantive SABR discussion concerns downloading, not ad delivery, and browser-side ad leakage is consistently attributed to stale filters and A/B rollouts. Keep this capture-first and warn-only, and treat "SABR is why ads get through" as unsupported until a primary source says otherwise.

- [ ] **P2 — Per-surface engine profiles**
  Add independent desktop profiles for main home/search/watch, Shorts, Music, TV, Kids, and embeds without duplicating setting keys or engine installation.

- [ ] **P2 — Trusted Types completion audit**
  Remove or wrap every remaining string-to-HTML path, add a Trusted Types-enforced browser fixture, and downgrade README claims until the audit passes.
  Research note (2026-08-15): rescoped and cheaper than assumed. The codebase has zero `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(` or `new Function` occurrences, so there is nothing to wrap — but a live `HEAD https://www.youtube.com/` returned an enforcing `require-trusted-types-for 'script'`, meaning any future sink fails hard on the real site. Reduce this to a regression gate: a static check for the sink patterns plus a fixture that serves the enforcing header. Do not register a pass-through default policy — that would only weaken a CSP the project currently satisfies for free.

- [ ] **P2 — Manual uAssets quick-fix ingestion tool**
  Fetch upstream changes on explicit maintainer command, map only locally supported safe syntax, reject dangerous capabilities, re-sign data, and run parser/signature tests.
  Research note (2026-08-15): urgency raised and a working reference exists. The list's uBO-derived base is stamped `Last extracted: 2026-02-12` while upstream changed repeatedly between 2026-07-26 and 2026-08-12. DuckDuckGo's `scripts/prune-scriptlet.mjs` (content-blocker-extension) already automates exactly this shape — running the uBOL scriptlet bundle in a sandbox and rewriting its hostname/arglist/function tables down to YouTube-only arguments — and Ghostery vendors `quick-fixes.txt` verbatim, so wholesale ingestion is the industry-normal path. Pair with the P1 refresh item above, and keep ingested behaviour default-off: community reports attribute the dominant 2026-07/08 playback loop to aggressive quick-fix rules.

- [ ] **P2 — Real localization pipeline**
  Generate extension `_locales`, add `default_locale`, preserve the userscript English fallback, and fail tests when visible strings bypass the catalog.
  Research note (2026-08-15): cheaper than assumed, with one prerequisite. `STRINGS` already centralizes ~478 entries, so this is an extraction plus a userscript-side resolver rather than a rewrite — but the existing centralization guard only matches capitalized string literals, so template-literal strings escape it. Close those first, starting with the `aria-label` applied to all 34 feature switches (YoutubeAdblock.user.js:9542) and the relative-time and duration helpers at :3993-3997 and :8093-8097, plus the two hardcoded English sentences in the copyable diagnostics report at :10062-10064.

- [ ] **P2 — Rules playground**
  Preview a bounded cosmetic selector against the current page without executing arbitrary scriptlets or persisting it until the user confirms.

- [ ] **P2 — Category-aware SponsorBlock behavior**
  Keep sponsor auto-skip, allow mute/manual modes for softer categories, and make uncertain/SSAI behavior explicit.

- [ ] **P2 — Dynamic DNR update design**
  Evaluate signed data-to-DNR compilation for faster endpoint response while keeping all executable logic packaged and store-policy compliant.
  Research note (2026-08-15): all 19 packaged rules use `action: block`, which is a "safe" action, so a change touching only `rules/network-blocks.json` plus the manifest version qualifies for the Chrome Web Store skip-review channel (minutes to live instead of a full review). That makes static DNR the better primary channel for network blocks, with the signed remote file confined to declarative data — worth weighing before building dynamic-rule compilation. Only relevant if a store listing is actually pursued; see the blocked distribution item.

- [ ] **P2 — Toolbar popup parity**
  Provide protection status and the few high-frequency actions without duplicating the full Control Center or introducing stale state.

- [ ] **P3 — Enterprise managed defaults**
  Add a managed schema only after the settings broker exists, with diagnostics showing which values are policy-controlled.

## Research-Driven Additions

### P0

### P1

- [ ] P1 — Move signed-filter verification into the service worker
  Why: the settings schema now bounds what a page can store, but two guarantees still cannot be enforced from the worker because the engine itself runs in the MAIN world: a page can set `filters_integrity` to `verified` and hand over a matching `filters_cache`, and it can grant community consent. Both are decisions, not shapes, so no validator can distinguish the engine from page code. The fix is to stop asking the page for a verdict — the worker fetches the list, verifies the Ed25519 signature and the manifest role/revision/expiry itself, and hands MAIN the result. The extension already holds the `raw.githubusercontent.com` host permission this needs, and the worker has `crypto.subtle`.
  Evidence: extension/manifest.json content_scripts `world: "MAIN"`; Build-Extension.ps1:159-188 (GM_xmlhttpRequest is the page's own fetch, so host permissions never apply); YoutubeAdblock.user.js:2260-2342 (verification runs in the page realm, against page-reachable `crypto.subtle` and `atob`); extension/background.js `SETTINGS_VALIDATORS` (shape rules only).
  Touches: extension/background.js (fetch + verify + cache ownership); extension/bridge.js (request/response for verified rules); YoutubeAdblock.user.js (extension build asks the worker instead of verifying locally; the userscript build keeps verifying in-process); Build-Extension.ps1; tests/background-contract.test.mjs.
  Acceptance: in the extension build the worker performs the fetch and signature check and is the only writer of integrity state and the revision floor; a page that writes `filters_integrity` or `filters_cache` cannot cause unverified rules to be applied; the userscript build is unchanged; offline and failed-refresh behaviour still falls back to cached-then-built-in rules with the existing failure copy.
  Complexity: L

- [ ] P1 — Repair the two silent sync regressions shipped in v0.7.0
  Why: `splitSyncPayload` slices by UTF-16 length against a byte-denominated constant, so a CJK/Cyrillic/emoji blocklist yields chunks up to ~21.5 KB against Chrome's 8,192-byte per-item quota and the write fails silently; and `lastMirroredPreferences` is assigned before the write, so any failure path latches it and sync stops for the life of the service worker with nothing surfaced.
  Evidence: extension/background.js:167-173 vs the byte gate at :216-224; extension/background.js:214-215 with early returns at :219, :236, :244, :254; tests/background-contract.test.mjs:596 uses 2,000 ASCII characters and cannot observe either.
  Touches: extension/background.js; tests/background-contract.test.mjs.
  Acceptance: chunks are split so that every item is under the per-item byte quota for non-ASCII payloads; the mirrored-state marker is only set after a fully successful commit and is cleared on any failure; a test with multi-byte characters asserts chunk sizes and a successful round trip, and a forced write failure followed by a retry asserts the retry actually writes.
  Complexity: M

- [ ] P1 — Replace last-writer-wins sync with a monotonic revision and a dirty-key merge
  Why: conflict resolution compares `Date.now()` and `lastWriteStamp` resets to 0 on every worker restart, so a device with a fast clock always wins and the other device's edits are accepted locally then silently overwritten. A stale remote snapshot can discard a channel blocklist edit made seconds earlier.
  Evidence: extension/background.js:121-128, compared at :306; Ghostery's implementation (revision integer + per-flush dirty-key diff, merging remote values only for keys not locally dirty) in ghostery-extension src/background/sync.js.
  Touches: extension/background.js; tests/background-contract.test.mjs.
  Acceptance: the sync payload carries a monotonic revision independent of wall-clock time; a remote snapshot is merged only for keys not modified locally since the last flush, and only when its revision is strictly greater; a two-device test asserts that a local edit made during an in-flight remote update survives, and that clock skew in either direction cannot cause one-way overwrite.
  Complexity: M

- [ ] P1 — Make Restore Defaults actually restore live engine state
  Why: the one documented recovery action leaves the page in the previous state — clutter hides stay applied while their toggles read off, and the volume gain node stays amplified indefinitely. The correct teardown already exists in two other code paths.
  Evidence: YoutubeAdblock.user.js:9156-9167 calls `updateCosmeticCSS()` only; `applyPauseState()` at :1465-1470 calls both CSS updaters; `setFeatureEnabled` at :9693-9705 performs the volume teardown; README.md:225 advertises the behaviour.
  Touches: YoutubeAdblock.user.js; tests/browser-smoke.test.mjs.
  Acceptance: after Restore Defaults with clutter hides and volume boost previously enabled, the clutter stylesheet is empty, the boost slider is removed, gain is reset to 1, and the SponsorBlock highlight button is gone — asserted in a rendered test, not from storage.
  Complexity: S

- [ ] P1 — Make the pause and the master switch actually stop protection, and survive worker eviction
  Why: the timed pause is backed by `setTimeout`, so an MV3 service-worker eviction leaves protection paused with no scheduled restore; and nothing ever disables the packaged DNR ruleset, so network rules keep blocking while the UI says "Protection paused" — defeating the exact diagnostic the pause exists for.
  Evidence: YoutubeAdblock.user.js:1444 (`setTimeout`); zero `chrome.alarms` references repo-wide; zero `updateEnabledRulesets` references repo-wide; UI copy at :376, :382; Ghostery's alarm-backed pattern in src/background/paused.js.
  Touches: YoutubeAdblock.user.js; extension/background.js; extension/bridge.js; extension/manifest.json (alarms permission); tests/background-contract.test.mjs; tests/browser-smoke.test.mjs.
  Acceptance: a timed pause restores itself after a simulated worker restart; pausing and the master switch both disable the packaged ruleset and re-enable it on resume; a rendered test asserts the countdown is visible and that a blocked request succeeds while paused.
  Complexity: M

- [ ] P1 — Stop `isEnabled()` mutating state and rebuilding the UI from inside proxy traps
  Why: pause expiry is detected inside `isPaused()`, which calls `clearRecoveryPause()` → `applyPauseState()` → two CSS updates, a full panel rebuild and menu re-registration. `isEnabled()` is evaluated in the `appendChild`/`insertBefore`/`replaceChild` and `setTimeout` proxy traps with no try/catch, so the first hot-path call after expiry runs hundreds of synchronous DOM operations re-entrantly inside a page's `appendChild`, and any throw escapes into `Node.prototype.appendChild` for the whole page.
  Evidence: YoutubeAdblock.user.js:1417-1427, :1465-1470, :1475-1477; trap sites at :3727, :3737, :3747 and the timer proxy at :4324.
  Touches: YoutubeAdblock.user.js; tests/engine-core.test.mjs.
  Acceptance: `isEnabled()` is a pure predicate; expiry is applied by the scheduled restore or a navigation tick, never by a read from a proxy trap; a test asserts that evaluating `isEnabled()` after a lapsed deadline performs no DOM work and cannot throw into the trap.
  Complexity: S

- [ ] P1 — Neutralize DOM-bypass script insertions before they execute
  Why: the proxy calls `Reflect.apply(target, …)` first and rewrites `node.textContent` afterwards. Appending an inline `<script>` executes it synchronously during `appendChild`, so the bypass succeeds while the counter records a block — the enforcement point is a no-op for the exact case the v0.7.0 detector was improved to catch.
  Evidence: YoutubeAdblock.user.js:3713-3720 (`handleInsertion`), :3730-3731, :3740-3741, :3750-3751.
  Touches: YoutubeAdblock.user.js; tests/engine-core.test.mjs; tests/browser-smoke.test.mjs.
  Acceptance: a detected bypass node is neutralized or its insertion refused before the native call runs; a test appends a real inline script matching the pattern and asserts its side effect never occurs while the counter still increments.
  Complexity: S

- [ ] P1 — Publish the v0.6.0 and v0.7.0 releases
  Why: the latest GitHub Release is v0.5.20 (2026-06-30) while the tree, README badge, manifest and userscript all read 0.7.0 and `dist/` holds unpublished artifacts. No extension user is running v0.6.0's least-privilege manifest or v0.7.0's storage broker; the security work of two releases is undelivered.
  Evidence: `gh release list` (latest v0.5.20, 2026-06-30); package.json/manifest.json/userscript all 0.7.0; dist/YoutubeAdblock-extension-v0.7.0.zip present and unpublished.
  Touches: release process only (Build-Release.ps1 output, GitHub release assets, CHANGELOG links).
  Acceptance: releases exist for the shipped versions with the userscript, ZIP, checksums and provenance attached, and the published assets verify against their recorded checksums. The self-hosted CRX auto-update manifest half of this work stays blocked on the CRX identity decision in Roadmap_Blocked.md.
  Complexity: S

- [ ] P1 — Refresh the upstream filter base and cover YouTube's request-pipeline experiment flags, behind a toggle
  Why: the uBO-derived portion of the filter list is stamped `Last extracted: 2026-02-12`, while uAssets' `quick-fixes.txt` was rewritten repeatedly between 2026-07-26 and 2026-08-12 and now disables YouTube's `network_machine` request pipeline — which this engine has no coverage for, and which can route `/player` past the fetch/XHR surfaces it proxies.
  Evidence: youtube-adblock-filters.txt header; uAssets filters/quick-fixes.txt (`all_web_enable_network_machine`, `all_web_network_machine_raw_request`); zero repo occurrences of `EXPERIMENT_FLAGS` or `network_machine`. Counter-evidence: community reports attribute the dominant 2026-07/08 stop-start playback loop to aggressive quick-fix rules, with "disable uBO's Quick fixes list" as the working fix.
  Touches: youtube-adblock-filters.txt; YoutubeAdblock.user.js (experiment-flag handling); tools/sign-filter-manifest.mjs; tests/engine-core.test.mjs. Extends the existing "Manual uAssets quick-fix ingestion tool" backlog item rather than replacing it.
  Acceptance: the refreshed base is re-signed and version-bumped; experiment-flag suppression ships as a named toggle that is off by default until validated, with a one-click off switch surfaced in the Control Center; a fixture test asserts flags are set before any proxy installs, and the release notes record the upstream extraction date.
  Complexity: M

- [ ] P1 — Fix the three rendered accessibility defects in the Control Center
  Why: the redesign CSS re-declares the panel, layout and settings shell *after* the `max-width:820px`/`560px` media queries at equal specificity, so every responsive override is dead and the 230 px rail has no small-width variant; the primary CTA is #fff on `--accent: #ff6a4d` at 2.83:1; and there are zero `forced-colors`/`prefers-contrast` rules while all state is carried by background and box-shadow with `outline: none`.
  Evidence: YoutubeAdblock.user.js media queries at :7060, :7093 vs re-declarations at :7225, :7234-7238, :7381-7385, :7413-7417; contrast from `--accent` at :7204 and `.ytab-btn-primary` at :6789 (recomputed 2.83:1, hover 2.31:1); zero forced-colors rules repo-wide; focus ring at :7053-7059. WCAG 2.2 1.4.10, 1.4.3, 1.4.11, 1.4.1, 2.4.13.
  Touches: YoutubeAdblock.user.js (stylesheet ordering, accent tokens, forced-colors block); tests/browser-smoke.test.mjs (viewport matrix). Complements the existing accessibility release gate item, which currently has no failing defect to protect against.
  Acceptance: at 320 CSS px and at 200%/400% zoom the panel reflows without two-dimensional scrolling and no control is clipped; primary and hover CTA text meets 4.5:1 in both themes; every focus indicator pairs box-shadow with an outline and every toggle's state remains discernible under `forced-colors: active`.
  Complexity: M

- [ ] P1 — Correct the architecture documentation to match the code
  Why: README.md describes injecting the engine into the page via a `<script>` element across two realms; there are zero `createElement('script')`, `unsafeWindow` or `wrappedJSObject` occurrences in the canonical source. extension/README.md is self-contradictory: lines 49-55 state the bridge owns no storage code while lines 84-96 still describe the bridge chunking and resolving conflicts. Contributors following either will re-introduce the architecture v0.7.0 removed.
  Evidence: README.md:151 and the diagram at :128-149; extension/README.md:49-55 vs :84-96; installProxies at YoutubeAdblock.user.js:6081-6135. Also stale: "150+ selectors" (≤92 before dedupe), "eight" clutter toggles (ten), six stats (7 rendered, 10 counted), eight intercepted endpoints (15), seven pruned fields (25).
  Touches: README.md; extension/README.md; CLAUDE.md; tests/repo-contract.test.mjs.
  Acceptance: the execution-model sections describe the realms the code actually uses; extension/README.md documents one storage architecture; the countable claims are either generated from source or asserted by a contract test that fails when the counts drift.
  Complexity: S

- [ ] P1 — Extend import preflight and undo to the text and migration paths
  Why: JSON import validates, previews, applies atomically and offers undo; the channel-text and migration importers have none of it, and both overwrite the user's pasted payload with the rejected-entry list on success and failure, destroying the source text with no way back — while the README advertises preview and undo for "Settings Import".
  Evidence: YoutubeAdblock.user.js:8978 (text), :8989 (migration), payload overwrite at :8991 and :8997; the good path at :8539-8634 and :8683-8714; README.md:180.
  Touches: YoutubeAdblock.user.js; tests/engine-core.test.mjs; tests/browser-smoke.test.mjs.
  Acceptance: every import path validates before writing, snapshots for undo, and rolls back completely on partial failure; rejected entries are reported without destroying the input; a rendered test covers preview, apply and undo for all three paths.
  Complexity: M

### P2

- [ ] P2 — Detect conflicting YouTube extensions and stand down instead of fighting them
  Why: this project ships its own SponsorBlock, DeArrow and Return YouTube Dislike implementations, so a user running the real extensions alongside it is a first-class conflict. Community reports show exactly this class of failure — DeArrow plus a translation extension duplicating titles, SponsorBlock plus a speed extension silently resetting playback rate on every skip — and stacking blockers is reported as *causing* anti-adblock detection rather than defeating it.
  Evidence: community threads 2025-11-22 (DeArrow + Anti-Translate), 2026-06-20 (SponsorBlock + custom speed), 2026-08-15 (stacking causes breakage, ad leakage and detection); this repo's own community engines at YoutubeAdblock.user.js:4075, :4894, :5085.
  Touches: YoutubeAdblock.user.js (engine install guards, Control Center health note); tests/browser-smoke.test.mjs.
  Acceptance: when another extension already owns the SponsorBlock skip, DeArrow title/thumbnail or dislike surfaces, the corresponding engine declines to install and the Control Center says which surface was ceded and why; detection uses observable DOM/marker evidence only, never a general extension enumeration; no double-application of titles, thumbnails or skips is observable in a fixture with a competing marker present.
  Complexity: M

- [ ] P2 — Make the breakage self-test stage-aware and add an UNPLAYABLE self-heal
  Why: the current self-test is binary — enforcement popup or ad elements — while the reported failure ladder is repeated ads, then throttling and fake buffering, then autoplay stops, then the video refuses to load. `playabilityStatus.status === "UNPLAYABLE"` with the `support.google.com/youtube/answer/3037019` subreason is the machine-readable signal, and recovery must preserve playback position.
  Evidence: YoutubeAdblock.user.js:10323-10349 (binary self-test); uAssets quick-fixes.txt UNPLAYABLE handling, which reads the subreason, excludes the `playerCaptchaViewModel` branch, then resumes via `loadVideoById(id, startSeconds)`; community reports of the four-stage ladder and of a signed-in-only failure mode.
  Touches: YoutubeAdblock.user.js (self-test, recovery card, diagnostics); tests/engine-core.test.mjs.
  Acceptance: each stage maps to a distinct diagnosis and a stage-appropriate suggestion; an UNPLAYABLE response with the enforcement subreason triggers one bounded recovery attempt that resumes at the original timestamp, and the CAPTCHA branch is excluded so no retry loop is possible; every automatic recovery is recorded in diagnostics.
  Complexity: M

- [ ] P2 — Stand down for Premium accounts and on TV/embed surfaces
  Why: fighting the player for a user who already pays for ad-free playback is pure breakage risk with no benefit, and it is one of the cheapest reliability wins available. uAssets self-disables on the Premium logo and on `/tv#/` and `/embed/`.
  Evidence: uAssets quick-fixes.txt (`ytInitialData…topbarLogoRenderer.iconImage.iconType === "YOUTUBE_PREMIUM_LOGO"`); zero repo occurrences of `YOUTUBE_PREMIUM_LOGO`.
  Touches: YoutubeAdblock.user.js (engine install gate, Control Center status); tests/engine-core.test.mjs.
  Acceptance: with a Premium marker present the interception engines do not install and the Control Center states that protection stood down and why, with a manual override available; a fixture asserts no player request is modified in that state.
  Complexity: S

- [ ] P2 — Cover embedded players in the extension build
  Why: both content scripts declare `all_frames: false` while the manifest matches and requests host permissions for `youtube-nocookie.com`, which is used almost exclusively inside third-party iframes — so the extension protects no embed at all, while the userscript (no `@noframes`) does. The two builds silently diverge on a surface the README's platform table implies parity for.
  Evidence: extension/manifest.json:34-61 and manifest.dev.json:47; no `@noframes` in YoutubeAdblock.user.js; DuckDuckGo's YouTube-only MV3 extension uses `all_frames: true` with `match_origin_as_fallback: true`.
  Touches: extension/manifest.json; extension/manifest.dev.json; Build-Extension.ps1; tests/repo-contract.test.mjs; README.md support matrix.
  Acceptance: the extension injects into YouTube player subframes including `about:blank`/`blob:` derived frames, verified in a fixture that embeds a player in a third-party page; per-frame installation does not duplicate the Control Center or double-count stats.
  Complexity: S

- [ ] P2 — Restrict which extensions may message the service worker
  Why: omitting `externally_connectable` means every other installed extension may send messages to the service worker while web pages may not. The broker now handles settings reads and writes, so this is a live surface.
  Evidence: extension/manifest.json (key absent); Chrome documentation for `externally_connectable` states that omission allows all extensions to connect.
  Touches: extension/manifest.json; extension/manifest.dev.json; tests/repo-contract.test.mjs.
  Acceptance: the manifest declares an empty allowlist, an external message is rejected in a test, and a contract test fails if the key is ever removed.
  Complexity: S

- [ ] P2 — Make the webpack-signature path fail closed like the filter path
  Why: every manifest failure that is not a rollback or expiry is mapped to `unsigned`, and only `tampered`/`stale` throw — so a missing, 404 or truncated signature manifest results in the remote signature database being applied unverified and cached, while the filter path throws in the same situation.
  Evidence: YoutubeAdblock.user.js:4571-4574 and :4602-4613, contrasted with the filters path at :2428-2430.
  Touches: YoutubeAdblock.user.js; tests/engine-core.test.mjs.
  Acceptance: an absent, malformed or truncated signature manifest is treated as a verification failure, the remote database is not applied or cached, the built-in signatures remain active, and the Control Center reports which database is in use.
  Complexity: S

- [ ] P2 — Gate the build-freshness check on content, not the version string
  Why: the parity test compares `SCRIPT_VERSION` between the userscript and the generated bundle, so a stale `extension/main.js` at the same version passes — which is exactly the failure already recorded in CLAUDE.md, where a chained build silently no-opped and the suite ran green against the previous build.
  Evidence: tests/repo-contract.test.mjs:316-353 (version comparison) and :355-377 (six substring markers); CLAUDE.md `## Learned` 2026-08-14 entry.
  Touches: Build-Extension.ps1; tests/repo-contract.test.mjs.
  Acceptance: the build records a hash of the canonical source it was generated from, and the contract test fails when that hash does not match the current userscript, regardless of version equality.
  Complexity: S

- [ ] P2 — Close the settings-search and navigation label mismatch
  Why: rail labels and section headings diverge for six of ten destinations, "Interface Cleanup" names two different groups, and the search corpus is built only from group titles/descriptions and feature keys/labels — so searching three of the rail names the UI itself displays returns the empty state and a fourth navigates to the wrong group.
  Evidence: rail labels at YoutubeAdblock.user.js:285-296 vs section titles at :553, :599, :617, :627, :649, :695; `matchesSettingsQuery` at :1570-1573 and its call site at :8271-8278.
  Touches: YoutubeAdblock.user.js; tests/browser-smoke.test.mjs.
  Acceptance: each destination has one name used by both the rail and its heading, or the rail label is added to the search corpus; a test types every rail label into the search box and asserts the matching section survives and is the one the rail navigates to.
  Complexity: S

- [ ] P2 — Make every toggle's behaviour match its label
  Why: `nativeToStringMask` and `webpackChunkHook` are gated at install time only, so toggling them after page load is a no-op that still fires a success toast; `hideHomeFeed` promises an empty-state layout it never renders; `hideShortsTab` promises the navigation destination but only hides three selectors; and the ad allowlist silently also disables channel, keyword and duration filtering for the allowlisted payload.
  Evidence: YoutubeAdblock.user.js:3047, :4629 (install-time gates) with the toast at :9718; copy at :520-522 and :528-530 vs selectors at :5495-5510; :2766-2772 (allowlist early return).
  Touches: YoutubeAdblock.user.js (feature copy, install/teardown, toast wording); tests/engine-core.test.mjs; README.md feature table.
  Acceptance: a toggle either takes effect immediately or states plainly that it applies on reload and suppresses the success toast; every label describes only behaviour the code implements, including the allowlist's effect on other filters; a test toggles each feature key and asserts an observable change or a documented deferral.
  Complexity: M

- [ ] P2 — Fix the first-run state of consent-gated community features
  Why: SponsorBlock ships enabled while consent defaults to unset and every network path is gated on consent, so the headline community feature is inert on every new install with the toggle reading "on", the section pill reading "1/1 On", and no blocked-state affordance on the row. The consent explanation sits several sections away behind a collapsed disclosure.
  Evidence: YoutubeAdblock.user.js:897 (default on) vs :1228 (consent unset) and the fetch gate at :4075; consent card at :8305-8315; toggle row at :9519-9553.
  Touches: YoutubeAdblock.user.js (feature row state, first-run copy); tests/browser-smoke.test.mjs.
  Acceptance: a consent-gated feature whose consent is unset renders a visible pending state on its own row with a direct action to grant or turn it off, group counts do not report it as active, and a rendered test on a fresh profile asserts both the affordance and that no request is made.
  Complexity: S

- [ ] P2 — Report matched-rule evidence in production or say it is unavailable by design
  Why: the production manifest declares neither `declarativeNetRequestFeedback` nor `activeTab`, so `getMatchedRules` can never succeed for a real user; the code degrades honestly, but the feature is permanently dead outside unpacked builds while the README cites matched-rule counts as validation evidence.
  Evidence: extension/manifest.json:18-22 vs extension/background.js:395-451; error classification at :379-384; README.md:8.
  Touches: extension/manifest.json; extension/background.js; YoutubeAdblock.user.js (diagnostics copy); README.md.
  Acceptance: either `activeTab` is added and matched-rule evidence works behind an explicit user gesture within the documented query quota, or the surface states that browser-layer evidence is unavailable in packaged builds and the README stops citing it as general validation.
  Complexity: S

- [ ] P2 — Verify the log_event and generate_204 block rules do not break playback state
  Why: two packaged rules block `/youtubei/v1/log_event` POSTs and `/generate_204` outright, while the repo's own recorded lesson warns against extending short-circuiting to these mixed endpoints without request-specific evidence. `log_event` carries watch-history and resume-position signals.
  Evidence: extension/rules/network-rules-source.json rules 16 and 18; CLAUDE.md `## Gotchas` 2026-08-13 network lesson.
  Touches: extension/rules/network-rules-source.json; extension/rules/network-blocks.json; tests/repo-contract.test.mjs; README.md.
  Acceptance: a dated check records whether watch history, resume position and playback progress survive with both rules enabled; any rule that breaks them is narrowed to ad-exclusive paths or removed, and the finding is recorded in CLAUDE.md.
  Complexity: S

- [ ] P2 — Guard one-shot installation against prerendered page activation
  Why: Speculation-Rules prerendering runs the document-start script in an invisible tab, so one-shot engine installation, stat counters and the Control Center mount can double-fire on activation.
  Evidence: `document.prerendering` / `prerenderingchange` (Chrome 108+); zero repo occurrences of `prerendering`.
  Touches: YoutubeAdblock.user.js (bootstrap); tests/engine-core.test.mjs.
  Acceptance: installation and counters run once per activated page; a test simulating prerender-then-activate asserts no duplicate installation and no double-counted stats.
  Complexity: S

- [ ] P2 — Close the test gaps that let broken features ship green
  Why: several tests assert on data the test itself supplied or on source text rather than behaviour — storage read back immediately after the click that wrote it, a nav button compared to its own text, an export/import round trip, and a string check for the `@inject-into` directive that cannot distinguish a working engine from a dead one. The viewport matrix is 1440 and 1920 only, which is why the reflow break is invisible.
  Evidence: tests/browser-smoke.test.mjs:22-29, :453-462, :485-489, :521-527; tests/engine-core.test.mjs:1181-1202; tests/repo-contract.test.mjs:378-385, :195-235.
  Touches: tests/browser-smoke.test.mjs; tests/engine-core.test.mjs; tests/repo-contract.test.mjs.
  Acceptance: the viewport matrix includes a 320-wide and a 360-wide surface; assertions read rendered state rather than the value under test; the rule-refresh failure matrix asserts a distinct rendered note per failure class; the string-centralization guard catches template-literal strings, starting with the switch `aria-label` that currently escapes it.
  Complexity: M

- [ ] P2 — Put a measured budget on the blocking engine's main-thread cost
  Why: the pruning walk, cosmetic selector application and blocklist matching all run synchronously on the main thread inside the fetch/XHR/JSON proxies, on payloads YouTube delivers continuously. Community reports identify stacked cosmetic filtering as a visible cause of YouTube slowness — one user measured roughly half a second of added latency per video patch — so speed is a competitive property of a blocker, not a nicety. The project currently has no performance assertion anywhere.
  Evidence: YoutubeAdblock.user.js prune path (`pruneObject`, feed filter walk) invoked from the proxies at :2793-2807 and :5889-5899; the measured 9.4 s regex hang recorded in RESEARCH.md; community performance reports 2026-07-24 and 2026-02-01; `scheduler.yield()` is available in Chrome 129+ and Firefox 142+ with a `setTimeout(0)` fallback.
  Touches: YoutubeAdblock.user.js (prune walk, cosmetic application, blocklist matching); tests/engine-core.test.mjs; tests/browser-smoke.test.mjs.
  Acceptance: a benchmark test asserts an upper bound on time spent per intercepted payload and per navigation for representative large fixtures, and fails the build when exceeded; long walks yield rather than blocking the main thread; the Control Center's diagnostics report the observed per-payload cost so a user can attribute slowness correctly. Do not adopt `isInputPending` — it is Chrome-only.
  Complexity: M

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

- [ ] P3 — Re-evaluate the player-request strategy ladder against the v0.4.1 regression
  Why: uAssets currently ships a degrading ladder of player-request spoofs whose first step is `clientScreen:"CHANNEL"` — the exact technique this repo shipped and retired in v0.4.1 after it broke the watch page (issue #2). The ladder's value is that it degrades instead of failing, but adopting any step without first reproducing the original breakage would re-introduce the project's only user-reported regression.
  Evidence: uAssets quick-fixes.txt and experimental.txt (`clientScreen` CHANNEL/ADUNIT, `params:"8AUB"`, `lactMilliseconds`, `adPlaybackContext`, attempt tagging via `INNERTUBE_CONTEXT.client.userAgent`); this repo's retirement recorded in CHANGELOG.md and the standing comment at YoutubeAdblock.user.js:3183; GitHub issue #2.
  Touches: YoutubeAdblock.user.js (request-body modification, strategy selection); tests/engine-core.test.mjs; README.md.
  Acceptance: the v0.4.1 breakage is first reproduced or shown not to reproduce on current YouTube, dated and recorded in CLAUDE.md; only then, any adopted step ships behind a default-off toggle with automatic degradation on failure and per-attempt attribution, and a fixture asserts normal playback, comments and SPA navigation are unaffected. If the regression still reproduces, this item is closed as rejected rather than implemented.
  Complexity: M

- [ ] P3 — Surface an honest health state when the playback path is not instrumented
  Why: MediaSource can be constructed inside a dedicated worker, which is invisible to the window-scoped proxies this engine installs — so the engine can report healthy while having no visibility into the media pipeline at all.
  Evidence: `MediaSource.handle` / `canConstructInDedicatedWorker` (Chrome 108+, Safari 18+); the engine's proxy installation at YoutubeAdblock.user.js:6081-6135; existing engine-health reporting at :7963-7990.
  Touches: YoutubeAdblock.user.js (engine health, diagnostics); tests/engine-core.test.mjs.
  Acceptance: worker-constructed media sources are detected and reported as an explicit "playback path not instrumented" state distinct from healthy and from degraded; diagnostics record it; no automatic behaviour change is attempted.
  Complexity: M

- [ ] P3 — Modernize the extension messaging layer once the minimum Chrome version can rise
  Why: Chrome 148 exposes every extension API under the `browser` namespace and adds opt-in structured-clone message serialization, which would remove the cross-browser alias shim and the JSON round trip on every bridge↔worker message. Currently gated by `minimum_chrome_version: 121`.
  Evidence: Chrome 148 release notes (`browser` namespace alias; `"message_serialization": "structured_clone"`); extension/manifest.json:8.
  Touches: extension/manifest.json; extension/bridge.js; extension/background.js; Build-Extension.ps1.
  Acceptance: when the supported floor is raised, the alias shim is removed and structured-clone serialization is enabled, with the bridge↔worker contract tests unchanged in behaviour and the README support matrix updated to the new floor.
  Complexity: S
