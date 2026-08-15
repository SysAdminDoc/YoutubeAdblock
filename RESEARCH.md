# Research — YoutubeAdblock
Date: 2026-08-15 — replaces all prior research (supersedes the 2026-08-14 pass).

Scope note: this is a differential pass. v0.7.0 shipped after the 2026-08-14 research, changing the storage architecture. Every prior finding was re-verified against HEAD `823dab7`; closed items are recorded as closed and are not repeated as work.

**Product scope (fixed, 2026-08-15):** this project is a YouTube ad blocker delivered as a userscript plus a generated MV3 extension. That is the whole remit. Recommendations that would turn it into a general YouTube enhancer, a cosmetic/UX layer, or an alternative client are rejected on scope regardless of measured demand — see Rejected Ideas. Existing clutter and focus-filter features stay as they are; they are not a licence to expand.

Confidence labels: **Verified** = confirmed in code at HEAD, measured locally, or read from a cited primary source. **Likely** = evidence-backed inference. **Assumption** = reasoned but unconfirmed. **Needs live validation** = requires a real service, manager, browser, device, account, or review outcome.

## Executive Summary

YoutubeAdblock is a YouTube-only intervention layer: one 10,363-line canonical userscript generates an MV3 extension (`extension/main.js`), backed by 19 packaged declarativeNetRequest rules, Ed25519-signed refreshable filter data, an in-page Control Center, focus filters, and optional SponsorBlock/DeArrow/Return-YouTube-Dislike integration. Its real strengths are narrow scope, canonical→generated parity enforced by tests, an unusually good failure-message taxonomy, zero runtime dependencies, and a serious release gate (243 tests, signed-data verification, provenance). Its weakness is now clearly located: **the project has invested in interception breadth while its trust boundary, its upstream rule data, and its distribution channel have all fallen behind.**

Three facts frame the whole plan. First, the v0.7.0 broker moved the storage *call* into the service worker but did not close the trust *boundary* — a YouTube page script can still read and replace the entire settings object, and one of the nine keys it can set is the filter-list URL, which syncs to every signed-in device. Second, the filter data's upstream base is stamped `Last extracted: 2026-02-12` while uAssets' `quick-fixes.txt` — the de-facto YouTube bypass standard, vendored verbatim by Ghostery — was rewritten repeatedly between 2026-07-26 and 2026-08-12, and now disables a YouTube request pipeline this engine has no coverage for at all. Third, the latest published GitHub Release is v0.5.20 (2026-06-30): v0.6.0 and v0.7.0 exist only as local artifacts, so no user is running the security work of the last two releases.

Top opportunities, in priority order:

1. **Verified — Close the page→settings boundary for real.** `extension/bridge.js:311` allowlists only the *container* key `__ytab_ext_settings__` and never inspects the value; `extension/background.js:326-343` validates only type, array-ness, and a 512 KB cap. `isTrustedSettingsSender` (`background.js:347-357`) is satisfied by construction, since the sender *is* the extension's own bridge in a real YouTube tab. Worse, no event is needed for a session-scoped takeover: `Build-Extension.ps1:118-127` makes page-origin `localStorage` the sole read path for every `GM_getValue`. Worst outcome: set `ytab_filter_url` to an attacker host (accepted as `unsigned-custom`), or set `ytab_filters_cache` + `ytab_filters_integrity='verified'` to inject cosmetic selectors, prune keys and response-body `replaceKeys` with no fetch and no signature check.
2. **Verified, measured — Fix the regex denial of service at the root.** `validateSafeRegexSource` (`YoutubeAdblock.user.js:5671-5728`) rejects quantified groups containing a quantifier or alternation, but never consults the root frame's own `hasQuantifier`. `/a*a*a*a*a*a*a*a*a*a*b/` passes. Measured locally on Node 24.18.1: 32 characters of input took **9,380 ms** on the main thread (n=24 → 711 ms, n=28 → 2,721 ms, n=32 → 9,381 ms). The haystack cap is 512 characters, matching is synchronous inside the `JSON.parse`/`fetch`/XHR proxies, and the pattern is settable from the page via opportunity 1.
3. **Verified — Repair two silent sync regressions introduced in v0.7.0.** `splitSyncPayload` (`background.js:167-173`) slices by UTF-16 length against `SYNC_CHUNK_BYTES = 7*1024` while the total gate correctly counts UTF-8 bytes — a CJK/Cyrillic/emoji blocklist produces chunks up to ~21.5 KB against Chrome's documented 8,192-byte per-item quota, so the write fails and returns silently. And `lastMirroredPreferences = serialized` is set at `:215` *before* the write, so every failure path afterwards leaves it latched: one quota error or offline moment stops sync for the life of the service worker with no error surfaced anywhere. The existing test (`tests/background-contract.test.mjs:596`) uses 2,000 ASCII characters and cannot see either.
4. **Verified — Refresh the upstream rule base and cover YouTube's new request pipeline, carefully.** `youtube-adblock-filters.txt` is 165 lines whose uBO-derived portion is stamped 2026-02-12. Current `quick-fixes.txt` sets `ytcfg.data_.EXPERIMENT_FLAGS.all_web_enable_network_machine = false` and `all_web_network_machine_raw_request = false`; this repo has **zero** occurrences of `EXPERIMENT_FLAGS` or `network_machine`. If YouTube routes `/player` through that pipeline, requests bypass the fetch/XHR surfaces this engine proxies. This is the single largest capability gap found. **Counter-evidence that must shape the work (sentiment, 2026-08):** the dominant July–August failure users report is a stop/start refresh loop where the timestamp flickers between 0:00 and full duration, across Firefox+uBO, Opera GX+uBO, Chrome+uBOL and Arc+uBOL — and the workaround that actually fixes it is **disabling uBO's "Quick fixes" list**. The better-supported explanation is aggressive quick-fix rules breaking playback, not YouTube punishing users. Ingest upstream behind a toggle with a fast off-switch, never as an unconditional default.
5. **Verified (sentiment) — Detect and stand down on conflicts with the extensions this project duplicates.** Users report three separate YouTube extension conflicts: DeArrow + YouTube Anti-Translate producing duplicate titles, SponsorBlock + a custom-speed extension silently resetting playback rate on every skip, and stacked blockers *causing* anti-adblock detection rather than defeating it. This project ships its own SponsorBlock, DeArrow and RYD implementations, so a user running the real extensions alongside it is a first-class conflict case that nothing currently detects. Community guidance is unanimous that stacking is the top self-inflicted failure.
6. **Verified — Ship the last two releases.** GitHub Releases stop at v0.5.20 (2026-06-30) while the repo, README badge, manifest and userscript all read 0.7.0, and `dist/` holds unpublished v0.7.0 artifacts. Userscript users self-update via `@updateURL`; extension users have no path to v0.6.0's least-privilege manifest or v0.7.0's broker. uBlock Origin began self-hosting a CRX auto-update manifest on 2026-08-07 — the same mechanism would make this project's existing `Build-CRX.ps1` output self-updating.
7. **Verified — Restore Defaults does not restore.** `YoutubeAdblock.user.js:9156-9167` calls `updateCosmeticCSS()` but never `updateClutterCSS()` and never performs the volume-boost teardown that `setFeatureEnabled` does at `:9693-9705`. After a "restore", clutter hides stay applied while their toggles read off, and audio stays amplified indefinitely. The correct pattern exists 3,700 lines earlier: `applyPauseState()` (`:1465-1470`) calls both.
8. **Verified — The pause cannot survive an MV3 worker eviction, and neither the pause nor the master switch stops the DNR layer.** `state.pauseTimer` is a `setTimeout` (`:1444`); there are zero `chrome.alarms` references in the repo. Separately, there are zero `updateEnabledRulesets` calls, so packaged network rules keep blocking while the UI says "Protection paused" — exactly defeating a user pausing to diagnose blocker-caused breakage.
9. **Verified — The README documents an architecture that does not exist.** `README.md:151` and the diagram at `:128-149` describe injecting the engine into the page "via a `<script>` element at document-start" across two realms. There are zero `createElement('script')`, `unsafeWindow`, or `wrappedJSObject` occurrences in the canonical source; `installProxies` (`:6081-6135`) assigns onto the ambient realm directly. `extension/README.md` is worse: lines 49-55 state the bridge owns no storage code while lines 84-96 still describe the bridge doing chunking and conflict resolution — two mutually exclusive architectures 30 lines apart.
10. **Verified — Three rendered accessibility defects, none reachable by the current test matrix.** The redesign CSS block re-declares `.ytab-panel`/`.ytab-layout`/`.ytab-settings-shell` *after* the `max-width:820px`/`560px` media queries at equal specificity, so every responsive override is dead and the 230 px rail has no small-width variant (1.4.10 Reflow, AA). `.ytab-btn-primary` is `#fff` on `--accent: #ff6a4d` = **2.83:1**, recomputed independently, failing 1.4.3 AA in both themes. There are zero `forced-colors`/`prefers-contrast` rules, and focus is a `box-shadow` ring with `outline: none`, so in Windows High Contrast no toggle's state is discernible. `tests/browser-smoke.test.mjs:22-29` only runs 1440 and 1920 wide, which is why all three are invisible.
11. **Verified — Settings search fails on the names the UI itself displays.** Rail labels (`:285-296`) and section headings diverge for six of ten destinations, and "Interface Cleanup" is used as both the clutter rail label and the cleanup group's heading. `matchesSettingsQuery` (`:1570-1573`) is only ever passed group titles/descriptions and feature keys/labels/descriptions, so rail label strings cannot match by construction: "Anti-Interference", "Ad & Overlay Cleanup" and "Focus & Filters" return the empty state, and "Interface Cleanup" navigates to the wrong group.
12. **Verified — Several toggles promise behavior the code does not deliver.** `nativeToStringMask` (`:3047`) and `webpackChunkHook` (`:4629`) are gated at install time only: toggling them post-load is a no-op that still fires a success toast. `hideHomeFeed` (`:520-522`) promises an empty-state layout and only emits `display:none`. `hideShortsTab` (`:528-530`) promises the navigation destination but only hides three selectors. `sponsorBlock` ships **on** (`:897`) while consent defaults to `unset` (`:1228`), so the headline community feature is inert on every new install with no blocked-state affordance on the row.
13. **Verified — The extension cannot protect embedded players at all.** Both content scripts declare `all_frames: false` while `host_permissions` and `matches` include `youtube-nocookie.com`, which is used almost exclusively inside third-party iframes. The userscript has no `@noframes` and therefore does cover subframes, so the two builds silently diverge on the surface the README's platform table implies parity for. DuckDuckGo's YouTube-only MV3 extension uses `all_frames: true` plus `match_origin_as_fallback: true`.
14. **Verified — YouTube enforces Trusted Types as of 2026-08-15, and this codebase is already clean.** A live `HEAD https://www.youtube.com/` on 2026-08-15 returned `require-trusted-types-for 'script'` in an enforcing `Content-Security-Policy` header. The repo has zero `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, or `new Function` occurrences. The existing "Trusted Types completion audit" roadmap item is therefore mostly already satisfied and should be rescoped from "wrap every sink" to "add a regression gate", which is far cheaper.

## Product Map

### Core workflows

- **Early protection:** install page-realm traps and proxies at document-start, prune player/browse payloads, block known requests via DNR, scrub ad media manifests, clean rendered ad/upsell containers.
- **Rule lifecycle:** load built-in rules immediately, fetch the recommended list and webpack signatures, verify Ed25519 signature + SHA-256 + byte count + role/revision/expiry, parse a bounded subset, retain cached or built-in protection on failure.
- **Control and recovery:** in-page Control Center, toolbar/context-menu actions, diagnostics, temporary pause, restore defaults, import/export, global protection switch.
- **Focus controls:** channel/keyword blocklists, ad allowlist, duration limits, clutter hiding, DeArrow titles/thumbnails, dislikes, volume boost.
- **Community augmentation:** consent-gated SponsorBlock (4-hex hash prefix), DeArrow, Return YouTube Dislike, in-memory caches, optional segment-view reports.

### User personas

- Privacy-conscious viewers wanting one-site blocking without a general-purpose suite.
- Power users tuning aggressive engines, custom rules, focus filters, per-feature overrides.
- Userscript users across Tampermonkey/Violentmonkey/Safari managers who need honest compatibility limits.
- Maintainers needing reproducible artifacts, fast breakage response, and privacy-safe issue evidence.

### Platforms and distribution

- **Verified:** canonical userscript targets desktop/mobile/Music/TV/Kids/no-cookie hosts; the generated MV3 package targets Chromium 121+ and Firefox 128+.
- **Verified:** distribution is currently broken in practice — latest GitHub Release is v0.5.20 (2026-06-30) against a v0.7.0 tree; the CRX has no update manifest; there is no store listing.
- **Verified (2026-08-31):** Chrome Web Store removes all remaining MV2 extensions. uBlock Origin 1.73.0 (2026-08-05) is expected to be its last CWS stable, and uBO began self-hosting a CRX update manifest on 2026-08-07.
- **Verified — the MV3 objection is obsolete:** uBOL now ships the full YouTube bypass through the `userScripts` API in MV3 (`userScripts` in its manifest permissions, `minimum_chrome_version 122`). "MV3 cannot do this" is no longer true.
- **Needs live validation:** Tampermonkey 5.5.0's injection-permission prompt, Violentmonkey 2.47.x default vs experimental "Alternative page mode" document-start timing, Firefox Android, Safari Userscripts, real ad-serving cohorts, store review.
- **Intentional limit:** no native mobile client, proxy frontend, system-wide blocker, or non-YouTube support. **Verified constraint:** a Safari App Store port is structurally incompatible with the project's no-code-signing rule; Safari is reachable only via the third-party Userscripts app consuming the userscript directly.

### Key integrations and data flows

- GitHub Raw/jsDelivr → signed filter text and webpack signatures → WebCrypto verification → bounded parser → in-memory engines and device cache.
- YouTube page data/network → MAIN-realm proxies and cosmetic cleanup; browser requests → 19 packaged DNR block rules.
- MAIN realm ↔ public DOM CustomEvents ↔ isolated bridge ↔ service worker ↔ `chrome.storage.local`, with nine allowlisted preference keys mirrored to `chrome.storage.sync`. **The page-facing half of this path is the central trust problem.**
- Video-derived hash prefix → SponsorBlock/DeArrow buckets; full video ID → Return YouTube Dislike and DeArrow thumbnails (disclosed).
- `YoutubeAdblock.user.js` → `Build-Extension.ps1` → `extension/main.js`; release scripts verify parity, store policy, signatures, DNR freshness, tests, artifacts.

## Competitive Landscape

- **uBlock Origin / uAssets.** Does well: the fastest YouTube breakage response in the field, plus a strategy ladder that degrades instead of failing. Learn: the `quick-fixes.txt` techniques this repo lacks entirely — disabling the `network_machine` experiment flags, tagging each player-request attempt into `INNERTUBE_CONTEXT.client.userAgent` so responses are attributable, an `UNPLAYABLE` self-heal that resumes at the original timestamp while deliberately excluding the `playerCaptchaViewModel` branch, and self-disabling for Premium accounts and `/tv#/` + `/embed/`. Avoid: cloning the full grammar, WASM engine, or all-site maintenance burden. Note: uAssets currently ships `clientScreen:"CHANNEL"` as ladder step one — the exact technique this repo retired in v0.4.1 after breaking the watch page (issue #2).
- **uBO Lite (uBOL).** Does well: proves MV3 can carry the full bypass via `userScripts`, and ships a working MV3 element picker *and* zapper (`chromium/js/scripting/{picker,zapper,tool-overlay}.js`). Learn: the MV3 picker mechanics for this repo's zapper item. Avoid: its general-purpose scope.
- **DuckDuckGo content-blocker-extension.** The closest peer that exists: a YouTube-only MV3 extension, created 2026-01-16, releasing weekly. Does well: automated pruning of the uBOL scriptlet bundle down to YouTube-only arguments (`scripts/prune-scriptlet.mjs`), and `all_frames: true` + `match_origin_as_fallback: true`. Learn: both, directly — the pruning script is the sustainable answer to a filter list that changes weekly. Avoid: nothing yet; it is the benchmark to watch.
- **AdGuard (extension, filters, Scriptlets).** Does well: rule validation, `$urltransform`, and a filtering log that *accumulates* DNR `sourceRules` across matches rather than overwriting — this repo's aggregation has the same hazard. Learn: the decoy strategy is instructive but not adoptable as-is (below). Avoid: general security/privacy suite expansion.
- **Ghostery.** Does well: three patterns worth copying outright — sync as monotonic `revision` + dirty-key diff so a stale remote cannot clobber a just-typed edit (`src/background/sync.js`), pause backed by `chrome.alarms` with `revokeAt` so it survives worker eviction (`src/background/paused.js`), and diagnostic reporting that reduces sensitive settings to boolean presence flags. Avoid: account/telemetry surface.
- **SponsorBlock / DeArrow.** Does well: category-aware segments, hash-prefix privacy, mature caching. Both are effectively in maintenance (6.1.7 and 2.3.10, 2026-07-13, two trivial commits since). Learn: explicit consent, independent cache controls, action modes. Avoid: submission/voting/moderation scope.
- **BlockTube / FilterTube.** BlockTube is abandoned in practice (last release 2026-02-07, 488 open issues); FilterTube is active but has done no ad-blocking work. Learn: compiled filter state and line-level invalid-pattern feedback. Avoid: unbounded regex and an ever-growing classification product. Neither ships an element picker — the zapper gap is still open.
- **ImprovedTube / YouTube Enhancer.** Do well: breadth and mature settings UIs; ImprovedTube merged volume boost in 2026-08. Their issue volumes (1,452 and 369 open) are the cautionary evidence. Learn: a single feature registry with explicit start/teardown contracts. Avoid: general enhancer scope.
- **AdguardAssistant.** The only element picker shipped *as a userscript*, and therefore the only one that fits this project's primary distribution channel. Learn: its specificity slider ("this element" → "all like it") and block-preview-before-commit. Note GPL-3.0 — study the design, do not vendor into an MIT repo.
- **NullDev/YT-Anti-Anti-Adblock.** Does well: documents the current detector shape and forges playback pings so creators still get the view. Learn: the detection surface. Avoid: its `google_ad_status` decoy, which its own source comments out as possibly fingerprinted.
- **Ghostery adblocker engine.** Vendors uBO's `quick-fixes.txt` verbatim — evidence that ingesting that list wholesale is the industry-normal, license-workable path.
- **Commercial tier (AdBlock, Adblock Plus, Ghostery, Total Adblock).** **Verified correction to the prior research:** neither eyeo product monetizes YouTube blocking as of 2026-08-15 — Adblock Plus Premium ($40/yr) explicitly states it adds no ad blocking, and getadblock Premium lists cookie-consent, Distraction Control, Image Swap and VPN. The "AdBlock paywalled YouTube" framing from 2026-07 should not be repeated as a current differentiator. Learn: temporary-trust UX and onboarding. Avoid: paywalls and bundling.
- **YouTube Premium Lite.** $8.99/mo in the US after an April 2026 increase, going worldwide in August 2026 (63 → 120 markets), still ad-supported on Shorts/music/search. Learn: be explicit that an independent blocker cannot promise equivalent availability. Avoid: competing on entitlements.

## Security, Privacy, and Reliability

### Open risks (all Verified at HEAD unless noted)

- **Page-reachable settings authority.** `extension/bridge.js:305-350` accepts `op`/`key`/`value` from a public DOM event, checks only the container key, a 64-char id, a rate limit and a size cap. `extension/background.js:326-343` adds no schema or per-key validation. `Build-Extension.ps1:118-127` makes page localStorage the sole read path. Consequences: attacker-controlled unsigned filter URL (synced to all devices), forged "verified" filter cache, anti-rollback floor erased or frozen (`ytab_signed_revision_*`), consent silently granted, protection disabled.
- **Regex DoS, measured.** See Executive Summary item 2. 9.4 s of main-thread hang from 32 input characters, reachable from the page through the boundary above.
- **Silent sync failure (v0.7.0 regression).** UTF-16 chunk slicing against a byte quota, plus a `lastMirroredPreferences` latch set before the write. Both fail closed and silently.
- **Sync conflict model can lose recent edits.** Resolution is last-writer-wins on `Date.now()` (`background.js:124-128`, compared at `:306`), with `lastWriteStamp` resetting to 0 on every worker restart. A device with a fast clock always wins; the other device's edits are accepted locally then overwritten with no divergence signal. Ghostery's revision + dirty-key merge is the fix.
- **Cross-device chunk/meta race.** `chrome.storage.sync` reconciles items independently, so a remote device can observe new metadata with stale chunks; `readSyncSnapshot()` then returns `null` and the update is dropped with no retry, and `bridge.js:368` only re-hydrates on a `SYNC_META_KEY` change, so late chunks never trigger a second read.
- **Pause and master switch do not stop DNR.** Zero `updateEnabledRulesets` calls anywhere. A user pausing to diagnose breakage gets no relief from the network layer.
- **Pause dies with the service worker.** `setTimeout`-backed (`:1444`), zero `chrome.alarms` usage.
- **`isEnabled()` is a mutating predicate.** `isPaused()` (`:1417-1427`) calls `clearRecoveryPause({silent:true})` on expiry → `applyPauseState()` → `updateCosmeticCSS()` + `updateClutterCSS()` + `refreshSettingsUI(true)` (a full panel rebuild) + `registerMenuCommands()`. `isEnabled()` is evaluated inside the `appendChild`/`insertBefore`/`replaceChild` proxy traps (`:3727`, `:3737`, `:3747`) and the `setTimeout` proxy, none of which wrap it in try/catch — so the first hot-path call after expiry runs hundreds of synchronous DOM operations re-entrantly inside a page's `appendChild`, and any throw escapes into `Node.prototype.appendChild` for the whole page.
- **DOM-bypass neutralization runs after execution.** `:3730-3731` calls `Reflect.apply(target, …)` *before* `handleInsertion()` rewrites `node.textContent`. Appending an inline `<script>` executes it synchronously during `appendChild`, so the counter increments while the bypass succeeds.
- **Webpack-signature path fails open.** `:4571-4574` maps every non-rollback/expiry manifest failure to `'unsigned'` and `:4602-4613` only throws on `'tampered'`/`'stale'` — a missing, 404, or truncated manifest results in the remote database being applied unverified and cached. The filters path throws in the same situation. (Likely — inferred from the two branches; worth a direct test.)
- **In the extension build every integrity primitive lives in the attacker's realm.** `main.js` runs `world: "MAIN"`, so `crypto.subtle`, `atob` and `TextEncoder` used for Ed25519 verification are page-reachable; only `fetch` and `JSON.parse` are captured early, and only for the ad proxies. The manifest/revision/expiry design is sound but enforced on the wrong side of the boundary in this build.
- **`externally_connectable` is absent**, which per Chrome's documentation means all other extensions may message the service worker while web pages may not. `{"ids": []}` closes it.
- **Import paths without preview or undo.** JSON import is best-in-class (validate → diff → atomic apply → session undo, `:8539-8634`, `:8683-8714`). Channel-text (`:8978`) and migration (`:8989`) import have none of it, and both overwrite the user's pasted payload with the rejected-entry list on success (`:8997`) and failure (`:8991`) — destroying the source text with no way back, while `README.md:180` advertises preview and undo for "Settings Import".
- **`@connect *`** (`YoutubeAdblock.user.js:26`) grants the userscript network access to any host, nullifying the narrow `@connect` list above it. This is *intentional* — `CLAUDE.md` records that custom filter URLs on non-GitHub hosts require it — but it is undisclosed in both READMEs, and combined with a page-settable `ytab_filter_url` it is the exfiltration half of the boundary problem.
- **DNR rules 16 and 18 block `/youtubei/v1/log_event` (POST) and `/generate_204` wholesale**, while `CLAUDE.md`'s own 2026-08-13 lesson says not to extend short-circuiting to "mixed `log_event` or `generate_204` endpoints without request-specific evidence". `log_event` carries watch-history and resume-position signals. (Likely breakage; needs live validation.)
- **Consent is enforced, permission theatre is not.** Consent gating is real and correct in both builds (`:4075`, `:4179`, `:4894`, `:5085`), defaults to `unset`, and revocation bumps a generation counter. But `state.communityApiPermission` is never consulted before any request and cannot matter: the extension's `GM_xmlhttpRequest` is plain MAIN-realm `fetch` (`Build-Extension.ps1:159-188`), which needs no host permission. "Grant Community API Access" therefore grants a capability the code does not use, and revoking it stops nothing — a misleading security control. `optional_host_permissions` and the `raw.githubusercontent.com` host permission are decorative for the same reason.

### Closed since the prior research (do not re-open)

- Signed-update freshness: `signedManifestSigningInput()` (`:2260-2277`) domain-separates by `ytab-manifest-v2:<role>:` and covers role, revision, expiry and keyId; the shipped manifest carries `revision: 4`, `expires: 2027-02-11`, `keyId: ytab-2026-08`. Rollback and freeze are rejected at `:2336-2342`. **Caveat:** the monotonic floor is stored via `getSetting('signed_revision_' + role)`, i.e. in the page-writable store — the design is right, its storage is not.
- Community-service consent boundary (v0.6.0), partial-import validation for the JSON path, overbroad production permissions (`tabs` and `declarativeNetRequestFeedback` are correctly dev-only), and Control Center section overlap.
- Trusted Types: nothing to wrap — the codebase has no string-to-HTML sinks.
- Dependency posture: one dev dependency, `playwright-core` 1.61.1 with an integrity-pinned lockfile; `npm audit` reports zero vulnerabilities across all severities. 1.62.1 is current. Note CVE-2025-59288 / GHSA-7mvr-c777-76hp affects `playwright-core ≤ 1.55.0`; the `^1.61.1` range is safe.

### Existing strengths to preserve

- Ed25519 verification with pinned key, SHA-256/byte checks, size caps, request supersession, last-known-good and built-in fallback.
- A remote parser that caps input and collections, validates dotted paths and selectors, reports unsupported/dangerous scriptlets, and uses no eval/Function/innerHTML/document.write.
- The failure-message taxonomy: 20+ distinct strings distinguishing unreachable, mirror-exhausted, oversized, unparseable, byte-mismatch, hash-mismatch, unsigned-manifest, rollback, expired and WebCrypto-unavailable, each ending with a "your current rules stayed active" reassurance. This is the best-designed surface in the project.
- Honest DNR degradation: `background.js:379-384` classifies the error and the UI says "Network blocking stays active; only this diagnostic counter is unavailable."
- Zero runtime dependencies; canonical→generated parity enforced by contract tests.

### Recovery and rollback needs

- Preserve an immutable last-known-good generation and one previous generation; a failed, replayed, expired or partially written update must never replace active data.
- Extend import undo to the text and migration paths, and stop destroying the input payload.
- Make the pause alarm-backed with a visible countdown, and have it actually disable the DNR ruleset.
- Make the breakage self-test stage-aware. The existing test (`:10323-10349`) is binary — enforcement popup or ad elements. Community reports describe a *ladder*: repeated ads → throttling → autoplay stops → video refuses to load. `UNPLAYABLE` with the `answer/3037019` subreason is the machine-readable signal, and the `playerCaptchaViewModel` branch must be excluded to avoid an infinite retry loop.

## Architecture Assessment

- **The trust boundary must move before anything else is built on it.** Storage is now in the right process but the contract is still "any page script may replace the whole settings object". The fix is a typed per-key schema validated in the service worker, and demoting page localStorage from authority to cache. Every other state-integrity item — anti-rollback floor, consent, filter URL — is downstream of this.
- **Sync needs a revision, not a timestamp.** Replace last-writer-wins with a monotonic revision plus a dirty-key diff, merging remote values only for keys not locally dirty. Fix the chunk-size unit bug and the failure latch in the same pass, and add a non-ASCII chunking test.
- **The generated/canonical boundary is sound; its freshness gate is not.** `tests/repo-contract.test.mjs:316-353` compares `SCRIPT_VERSION` between the userscript and `extension/main.js`. A stale `main.js` at the same version passes — which is precisely the incident `CLAUDE.md` already logs ("Build-Extension.ps1 silently no-ops when chained in Bash"). Gate on a content hash instead.
- **Several tests assert on data the test itself supplied.** `browser-smoke.test.mjs:453-462` reads back the storage the click just wrote; `:485-489` compares a nav button's `textContent` to itself; `engine-core.test.mjs:1181-1202` round-trips export output into import. The `@inject-into` test (`repo-contract.test.mjs:378-385`) asserts a *string* and cannot distinguish a working engine from a dead one. The `STRINGS` centralization guard is a regex that its own live stragglers evade (`:9542` `` `Toggle ${feature.label}` `` covers all 34 switch labels).
- **Test the shipped environments.** Missing gates: real manager worlds, viewports below 1440, forced colors, zoom, automated accessibility rules, contrast, interrupted sync generations, non-ASCII sync payloads, runtime-toggle effectiveness, the rendered failure-state matrix, and the two `hidden`-attribute lifecycles that `CLAUDE.md` already records as a bug class.
- **Keep remote inputs declarative.** The CWS line is "external resources must not contain any logic"; signed filter *data* is compliant, a filter DSL rich enough to be interpreted is not. Convert reviewed upstream syntax at maintainer build time into a versioned local schema.
- **Two shipping channels pull in opposite directions and both should be kept.** All 19 DNR rules are `action: block`, i.e. entirely "safe rules", which makes the project eligible for the CWS skip-review channel (minutes to live) if a rules-only change touches nothing else. The signed remote file updates instantly with no store involvement but sits nearer the remote-logic line. Make static DNR the primary channel for network blocks and confine the remote file to declarative data.
- **Align documentation with executable contracts.** The README's injection architecture, `extension/README.md`'s two contradictory storage sections, the "150+ selectors" claim (actual: ≤92 before dedupe), "eight" clutter toggles (actual: ten), six listed stats (actual: 7 rendered, 10 counted), eight intercepted endpoints (actual: 15) and seven pruned fields (actual: 25) should be generated or test-checked, not hand-maintained.

Category audit: **security/privacy** — boundary, regex, sync integrity, `externally_connectable` prioritized. **Accessibility** — three concrete rendered defects plus the existing release-gate item. **i18n** — `STRINGS` already centralizes ~478 entries, so this is extraction plus a userscript-side resolver, not a rewrite; six template-literal stragglers must be closed first. **Observability** — finish the diagnostic bundle using uBO's redaction taxonomy and Ghostery's boolean reduction. **Testing** — content-hash freshness, small viewports, runtime-toggle effectiveness. **Distribution** — publish v0.6.0/v0.7.0, add a CRX update manifest, structure releases for skip-review. **Plugin ecosystem** — still consciously excluded until a feature registry exists. **Mobile** — unchanged; needs real devices. **Offline/resilience** — cached/built-in fallback is good; sync generations need to be transactional. **Multi-user** — consciously excluded. **Migration** — versioned sync and atomic import must define idempotent legacy conversion and rollback.

## Rejected Ideas

- **Repositioning the project as a YouTube cosmetic/UX layer that assumes a general ad blocker is installed** — the community research argues the unserved demand sits in layout repair, channel/keyword/AI filtering and hide-watched rather than ad blocking, and that a site-specific blocker is met with default suspicion. **Rejected on scope: this project is a YouTube ad blocker and nothing else.** The finding is still useful in one narrow direction — users stack blockers and stacking *causes* detection — which is why conflict detection (opportunity 5) is in and feature expansion is out.
- **The demand-ranked enhancer features that came with it** — hide watched/partially-watched videos, restoring YouTube UI regressions (sidebar logos, view-count row, old layout), hide by video age/duration/view count, comment word-filtering, playback defaults (default volume, persistent timecode, disabling hotkeys), and end-card restoration. All have real, repeated demand and none of them block ads. They belong in ImprovedTube, BlockTube or a dedicated userscript, not here. Recorded so a future pass does not re-harvest them as opportunities.
- **Adopt uAssets' `clientScreen:"CHANNEL"` player-request spoof as-is** — this repo shipped exactly that and retired it in v0.4.1 after it broke the watch page (GitHub issue #2); a code comment at `:3183` still records why. Only a conditional re-evaluation gated on that repro belongs on the roadmap.
- **AdGuard's `google_ad_status` decoy** — requires *un-blocking* `static.doubleclick.net/instream/ad_status.js` on youtube.com, contradicting the project's blocking posture, and NullDev's source comments the constant out as possibly fingerprinted. Source: AdGuard `BaseFilter/sections/antiadblock.txt`.
- **Registering a pass-through `trustedTypes.createPolicy("default", …)`** — NullDev needs it because it injects HTML/scripts; this codebase has zero sinks, so the policy would only weaken a CSP the project currently satisfies for free.
- **Premium playback-speed unlock (`granularVariableSpeedConfig`)** — circumventing a paid entitlement is a different act from blocking ads, and carries ToS and framing risk disproportionate to a speed slider. Source: uAssets `experimental.txt`.
- **Forged playback pings to credit creators (`markVideoAsWatched`)** — re-enables the exact tracking endpoint the project deliberately blocks and depends on a synthesized CPN; a user who wants this can disable the block. Source: NullDev/YT-Anti-Anti-Adblock.
- **Safari App Store port** — structurally incompatible with the project's no-code-signing rule; Safari is reachable only through the Userscripts app consuming the userscript.
- **YouTube IP-range lists (`iplist-youtube`)** — DNR cannot match on IP ranges, and a continuously-refreshed network dataset is a maintenance burden disproportionate to the signal.
- **Full uBO grammar or an adblock-rust/WASM engine; remote executable emergency fixes; automatic SSAI/SABR seeking from heuristics; general enhancer expansion; native app/extractor/proxy/alternate frontend; SponsorBlock submissions or moderation; ad clicking or AdNauseam-style obfuscation; local or AI thumbnail generation; a third-party plugin marketplace; multi-user cloud accounts; stacking blockers or claiming permanent undetectability; paywalling core protection** — all re-confirmed from the 2026-08-14 pass; reasons unchanged.

## Sources

### Project and repository
- https://github.com/SysAdminDoc/YoutubeAdblock
- https://github.com/SysAdminDoc/YoutubeAdblock/issues/1
- https://github.com/SysAdminDoc/YoutubeAdblock/issues/2

### uBlock Origin, uAssets, uBOL
- https://github.com/gorhill/uBlock/releases/tag/1.73.0
- https://github.com/uBlockOrigin/uAssets/blob/master/filters/quick-fixes.txt
- https://github.com/uBlockOrigin/uAssets/blob/master/filters/experimental.txt
- https://github.com/uBlockOrigin/uAssets/issues/30157
- https://github.com/gorhill/uBlock/blob/master/dist/chromium/update-dev.xml
- https://github.com/gorhill/uBlock/commit/5e176aec5d7ce8a9a6c0c4f55be37fe20d3b76dc
- https://github.com/gorhill/uBlock/commit/5c34167eb4970d46f4dee2a82d6bffc2de1d0537
- https://github.com/gorhill/uBlock/blob/master/src/js/support.js
- https://github.com/gorhill/uBlock/blob/master/src/js/scriptlets/epicker.js
- https://github.com/uBlockOrigin/uBOL-home/tree/main/chromium/js/scripting
- https://github.com/uBlockOrigin/uBOL-home/blob/main/chromium/manifest.json
- https://github.com/uBlockOrigin/uBOL-home/releases

### Peer and adjacent projects
- https://github.com/duckduckgo/content-blocker-extension
- https://github.com/duckduckgo/content-blocker-extension/blob/main/scripts/prune-scriptlet.mjs
- https://github.com/NullDev/YT-Anti-Anti-Adblock
- https://github.com/ghostery/ghostery-extension/blob/main/src/background/sync.js
- https://github.com/ghostery/ghostery-extension/blob/main/src/background/paused.js
- https://github.com/ghostery/ghostery-extension/blob/main/src/store/options.js
- https://github.com/ghostery/adblocker
- https://github.com/AdguardTeam/AdguardAssistant/tree/master/src
- https://github.com/AdguardTeam/AdguardBrowserExtension/releases/tag/v5.5.0.4-beta
- https://github.com/AdguardTeam/Scriptlets/blob/master/CHANGELOG.md
- https://github.com/AdguardTeam/AdguardFilters/blob/master/BaseFilter/sections/antiadblock.txt
- https://github.com/ajayyy/SponsorBlock/commits/master
- https://github.com/ajayyy/DeArrow/releases/tag/2.3.10
- https://github.com/Anarios/return-youtube-dislike/commits/main
- https://github.com/amitbl/blocktube
- https://github.com/varshneydevansh/FilterTube/commits/main
- https://github.com/code-charity/youtube/commits/master
- https://github.com/YouTube-Enhancer/extension/releases
- https://github.com/awesome-scripts/awesome-userscripts

### Browser platform, store policy, userscript managers
- https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline
- https://developer.chrome.com/blog/cws-policy-updates-2026
- https://developer.chrome.com/docs/webstore/skip-review
- https://developer.chrome.com/docs/extensions/develop/migrate/mv3-remote-code
- https://developer.chrome.com/docs/webstore/program-policies/policies
- https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/reference/api/userScripts
- https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- https://developer.chrome.com/blog/trusted-types-on-youtube
- https://developer.chrome.com/blog/chrome-two-week-release
- https://developer.chrome.com/blog/structured-clone-messaging
- https://developer.chrome.com/docs/extensions/reference/api/i18n
- https://blog.mozilla.org/addons/2026/07/23/firefox-153-webextensions-api-updates/
- https://extensionworkshop.com/documentation/publish/add-on-policies/
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/sync
- https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/declarativeNetRequest.json
- https://developer.apple.com/videos/play/wwdc2026/216/
- https://github.com/violentmonkey/violentmonkey/releases
- https://www.tampermonkey.net/changelog.php

### Standards, security, accessibility, media
- https://theupdateframework.github.io/specification/latest/
- https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS
- https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- https://www.w3.org/WAI/WCAG22/quickref/
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- https://w3c.github.io/webcrypto/#ed25519
- https://api.webstatus.dev/v1/features/trusted-types
- https://github.com/advisories/GHSA-7mvr-c777-76hp
- https://nodejs.org/en/feed/vulnerability.xml
- https://registry.npmjs.org/axe-core
- https://developer.mozilla.org/docs/Web/API/Document/prerendering
- https://github.com/mdn/browser-compat-data/blob/main/api/MediaSource.json

### Commercial products and platform
- https://adblockplus.org/en/premium
- https://getadblock.com/en/premium/
- https://adguard.com/en/blog/youtube-missing-comments-descriptions.html
- https://adguard.com/en/blog/youtube-server-side-ad-insertion.html
- https://blog.youtube/news-and-events/introducing-premium-lite/
- https://www.afterdawn.com/news/article.cfm/2026/08/10/youtube-premium-lite-to-be-available-worldwide

### Community signal (sentiment, corroborate before acting)
- https://www.reddit.com/r/uBlockOrigin/comments/1vg98o4/ublock_origin_ubo_173_announcement_thread/
- https://www.reddit.com/r/Adblock/comments/1vka53b/is_ublock_origin_down_on_youtube_for_anyone_else/
- https://www.reddit.com/r/uBlockOrigin/comments/1v1x09u/strange_youtube_pop_up_even_when_ublock_is_active/
- https://www.reddit.com/r/uBlockOrigin/comments/1vfouqs/is_there_a_solution_in_ublock_origin_that/
- https://www.reddit.com/r/uBlockOrigin/comments/1vllunz/how_to_bring_back_youtuber_logos_for_sidebar/
- https://www.reddit.com/r/uBlockOrigin/comments/1vo55bp/how_to_revert_this_youtube_new_view_count_and/
- https://www.reddit.com/r/chrome_extensions/comments/1vffs5j/i_just_found_out_today_that_there_are_some_cases/

## Open Questions

1. Does YouTube currently route `/player` through the `network_machine` pipeline for this project's users, and does disabling `all_web_enable_network_machine` / `all_web_network_machine_raw_request` at document-start restore proxy coverage without side effects? This gates the largest capability item.
2. Under what conditions does uAssets' `clientScreen:"CHANNEL"` step succeed as of 2026-08-15, given that this repo's identical spoof broke the watch page in v0.4.1 (issue #2)? Needed before any player-request ladder work is safe.
3. Do DNR rules 16 and 18 (`log_event` POST, `generate_204`) measurably break watch history, resume position, or QoE reporting? The repo's own 2026-08-13 lesson warns against exactly this.
4. Which disposable account/region/experiment combinations actually serve pre-roll, mid-roll, feed, Shorts, Music, TV, Kids, embed and SSAI creative, so privacy-scrubbed fixtures can be captured? **Priority downgraded by a negative finding:** a 12-month sweep of r/uBlockOrigin returned a verified *zero* reports of SABR or server-stitched ads defeating a browser ad blocker; all substantive SABR discussion concerns downloading (yt-dlp), not ad delivery. Browser-side ad leakage is consistently attributed to stale filters and A/B rollouts. Keep the SSAI work warn-only and capture-first, and treat any "SABR is why ads get through" claim as unsupported until a primary source says otherwise.
5. What is the dated pass/fail result for Chrome + Tampermonkey 5.5.0 and Firefox + Violentmonkey 2.47.x, including whether document-start injection wins the race under VM's default mode versus its experimental "Alternative page mode"? **Priority downgraded by a negative finding:** a 12-month community sweep found *zero* threads about Tampermonkey 5.5.x's permission prompt and *zero* about Violentmonkey's "Alternative page mode". The friction users actually hit is Chrome's own per-extension "Allow user scripts" toggle, which the install docs should name. Still worth validating, but it is not the live support burden the prior pass assumed.
6. Is the private key for Chromium ID `jpeojodihepmkpdhibnnbgamnakclnnj` recoverable, or must identity/storage/update continuity be deliberately migrated? This now also gates the self-hosted CRX update manifest, which requires a stable ID.
7. Is the maintainer willing to publish a store listing at all? Skip-review eligibility, the single-purpose rewrite and the disclosure work are only worth doing if the answer is yes.
