# Research — YoutubeAdblock
Date: 2026-08-14 — replaces all prior research.

## Executive Summary

Verified — YoutubeAdblock is a tightly scoped, dual-delivery YouTube intervention layer: one 9,014-line userscript generates the MV3 MAIN-world engine, while packaged DNR rules, signed refreshable filter/signature data, a Control Center, focus filters, and optional community services cover browser and page layers. Its strongest current shape is the one-site focus, canonical/generated parity, last-known-good fallbacks, defensive parser limits, privacy-bounded diagnostics, and a serious release gate. The highest-value direction is not more blocking surface area; it is closing trust and state-integrity gaps, making advertised delivery paths truthful, and turning recovery and accessibility into tested product behavior.

Confidence labels: **Verified** means confirmed in code or a cited primary source; **Likely** is an evidence-backed inference; **Needs live validation** requires a real service, manager, browser, device, account, or review outcome.

Top opportunities, in priority order:

1. **Verified — Treat the existing trusted-context broker item as the most urgent boundary fix.** Any YouTube page script can currently dispatch ytab:page-request, read or replace the complete settings object, and observe the same object in page localStorage through extension/bridge.js:315-327 and 496-541. Do not duplicate the existing roadmap item; expand its implementation to remove page-originated persistence and expose only minimal runtime state to MAIN.
2. **Verified — Require informed opt-in for community services.** SponsorBlock defaults on in YoutubeAdblock.user.js:815, while the generated fetch shim in Build-Extension.ps1:159-188 makes page-context CORS calls even when optional extension host permissions are absent. Hash-prefix lookups and segment-view UUID reports are browsing-derived data and need a real consent/revocation boundary.
3. **Verified — Separate synchronized preferences from local runtime state.** Stats, caches, integrity state, and user preferences share one object; saveStats can persist every two seconds, and extension/bridge.js:187-227 performs a chunk write plus metadata write. That can exceed Chrome’s 1,800 writes/hour quota and makes whole-object last-write-wins capable of clobbering preferences or local-only state.
4. **Verified — Correct the userscript execution-world contract while completing the existing real-manager validation item.** The metadata says @inject-into content at YoutubeAdblock.user.js:20, but Violentmonkey documents that this world cannot modify page JavaScript objects; the core depends on proxying page fetch, XHR, JSON.parse, and webpack. README.md:140 describes a page-script injection that is not present in the canonical source. Tampermonkey and Violentmonkey need explicit, tested manager-specific metadata/build behavior.
5. **Verified — Make signed updates rollback- and freeze-resistant.** Ed25519 protects content authenticity, but the companion metadata has no signed monotonic revision, expiry, artifact role, or key identifier; an old valid filter/signature pair is accepted by YoutubeAdblock.user.js:1967-2055.
6. **Verified — Bound and cache user-entered regular expressions.** parseBlocklist compiles unrestricted JavaScript regexes at YoutubeAdblock.user.js:4982-5003 and reruns them over renderer text at 5112-5125; a pathological expression can stall navigation.
7. **Verified — Make settings import versioned, preflighted, and reversible.** Export emits app/version fields, but importSettingsPayload ignores them and applyImportedSettings performs sequential writes at YoutubeAdblock.user.js:7586-7692.
8. **Verified — Minimize production permissions.** extension/manifest.json requests tabs even though YouTube host permissions cover the only sensitive URL access, and declarativeNetRequestFeedback only enables unpacked-extension debugging. Production diagnostics must degrade honestly or use a user-gesture grant.
9. **Verified — Repair Control Center rail-navigation geometry and add an accessibility gate.** The captured browser-smoke section screenshots show preceding cards painted over destination headings; current tests only check viewport intersection, not obscuration, zoom, forced colors, or automated accessibility rules.
10. **Likely — Add an auto-restoring recovery pause.** A tab/session/short timed pause that never syncs would make false-positive recovery safer than the current persistent global master switch; Ghostery’s temporary trust controls demonstrate the pattern.
11. **Verified — Be ready for the 2026-08-31 Chrome MV2 store removal.** Chrome Web Store deletes all remaining MV2 extensions on 2026-08-31 and uBlock Origin 1.73 is expected to be its last CWS stable; displaced Chrome users’ full-strength options narrow to Firefox, uBO Lite, or userscript/MV3 blockers like this one. The Chrome install path (Tampermonkey 5.5.0’s new userscript-injection permission prompt, the Allow User Scripts toggle, the unpacked MV3 route) becomes the project’s front door and must be documented and tested before 2026-09-01.
12. **Verified demand — Ship a YouTube-semantic element zapper.** July–August 2026 community threads repeatedly ask for hide-Shorts/hide-VODs/kill-hover-autoplay/hide-injected-recommendations controls and hand-write fragile uBO filters; no YouTube-specific blocker ships a picker that maps a clicked element to a stable semantic toggle. The existing bounded rules-playground roadmap item is the natural foundation.

## Product Map

### Core workflows

- **Early protection:** install page-world traps and proxies at document-start, prune player/browse payloads, block known requests, scrub ad media manifests, and clean rendered ad/upsell containers.
- **Rule lifecycle:** load built-in rules immediately, fetch the recommended list and webpack signatures, verify Ed25519/hash/size metadata, parse a bounded subset, and retain cached/built-in protection on failure.
- **Control and recovery:** use the in-page Control Center, toolbar/keyboard/context-menu actions, diagnostics, restore defaults, import/export, and the global protection switch.
- **Focus controls:** block channels or keywords, allow selected channels, apply duration limits, and optionally alter clutter, titles, thumbnails, dislikes, and volume.
- **Community augmentation:** query SponsorBlock by a four-hex hash prefix, optionally query DeArrow and Return YouTube Dislike, cache results in memory, and report SponsorBlock segment views.

### User personas

- Privacy-conscious viewers who want one-site blocking without a general-purpose browser suite.
- Power users who tune aggressive engines, custom rules, focus filters, and per-feature overrides.
- Userscript users across Tampermonkey, Violentmonkey, and Safari/Android managers who need honest compatibility limits.
- Maintainers who need reproducible userscript/ZIP/XPI/CRX artifacts, fast YouTube breakage response, and privacy-safe issue evidence.

### Platforms and distribution

- **Verified:** the canonical userscript targets desktop, mobile, Music, TV, Kids, and no-cookie YouTube hosts.
- **Verified:** one generated MV3 package targets Chromium 121+ and Firefox 128+; persistent Firefox and stable-ID CRX distribution remain constrained by signing/identity.
- **Needs live validation:** current Tampermonkey, Violentmonkey, Firefox Android, Safari Userscripts, real ad-serving cohorts, and store-review behavior. Violentmonkey shipped five MV3 releases 2026-07-29 → 2026-08-13 (v2.46.0–v2.47.1) including an off-by-default experimental “Alternative page mode” for document-start timing on MV3 Chromium — the manager matrix must state whether the engine wins the injection race under the default mode.
- **Verified (2026-07-23):** Firefox 153 makes local `file://` access a separate off-by-default permission for all extensions and AMO policy restricts the `userScripts` API to user-script managers only — an AMO port of the generated extension must not use that API, and no workflow may depend on `file://` filter loads.
- **Intentional limit:** no native mobile client, proxy frontend, system-wide blocker, or non-YouTube site support.

### Key integrations and data flows

- GitHub Raw/jsDelivr → signed filter text and webpack signature data → WebCrypto verification → bounded parser → in-memory engines and device cache.
- YouTube page data/network calls → MAIN-world proxies and cosmetic cleanup; browser requests → packaged DNR rules.
- MAIN-world settings shim ↔ public DOM CustomEvents ↔ isolated bridge ↔ chrome.storage.local/sync; the current full-object path is the central trust and consistency problem.
- Video-derived hash prefix → SponsorBlock bucket; segment UUID → SponsorBlock view endpoint; optional full video ID → Return YouTube Dislike; DeArrow uses a hash-prefix bucket in the userscript build.
- Maintainer source → Build-Extension.ps1 → extension/main.js; release scripts verify source parity, store policy, signatures, DNR freshness, tests, and artifacts.

## Competitive Landscape

- **uBlock Origin and uAssets.** Does well: rapid quick-fix maintenance, broad declarative syntax, strict project scope, and mature breakage handling. Learn: reviewed upstream ingestion, known-good rollback, and visible stale-list state. Avoid: cloning the complete grammar, WASM engine, and all-site maintenance burden into a focused userscript. Verified 2026-08-14: Chrome Web Store deletes remaining MV2 extensions on 2026-08-31 and 1.73 is expected to be uBO’s last CWS stable — its displaced Chrome users are this project’s nearest adoption wave.
- **AdGuard Browser Extension and filters.** Does well: multi-browser packaging, rule validation, user rules, and explicit product/privacy documentation. Learn: production/development manifest separation and compatibility matrices. Avoid: expanding into a general security/privacy suite.
- **SponsorBlock.** Does well: category-aware community segments, privacy-reduced hash-prefix lookup, mature caching, and contribution workflows. Learn: explicit consent, independent cache controls, storage-pressure handling, and action modes. Avoid: submission/voting/moderation scope and automatic behavior when SSAI offsets are uncertain.
- **DeArrow.** Does well: progressive title/thumbnail replacement, casual mode, and per-channel nuance. Learn: softer defaults and explainable per-surface overrides. Avoid: local thumbnail generation or silent media downloads in a lightweight blocker.
- **BlockTube and FilterTube.** Do well: focused channel/title filtering and understandable visibility controls. Learn: compiled filter state, line-level invalid-pattern feedback, and a clear “why hidden” explanation. Avoid: arbitrary unbounded regex evaluation and an ever-growing content-classification product. FilterTube’s 2026 additions are whitelist mode, profiles with PIN, and P2P sync — still no element picker; no YouTube-specific blocker ships one (verified 2026-08-14), which is the zapper opportunity.
- **YouTube Enhancer and ImprovedTube.** Do well: broad feature discovery and mature settings UIs. Their current issue histories also show lifecycle, consolidation, and UI-state costs. Learn: a single feature registry and explicit start/teardown contracts. Avoid: general enhancer scope and hundreds of loosely coupled toggles.
- **Ghostery, Malwarebytes Browser Guard, AdGuard commercial products, Total Adblock, Surfshark CleanWeb, and Nord Threat Protection.** Do well: temporary trust/pause UX, onboarding, support surfaces, and packaging polish. Learn: recovery that auto-restores and permission/data explanations. Avoid: paywalls, account telemetry, VPN/antivirus bundling, and unsupported “always undetectable” claims. Verified 2026-07: AdBlock (getadblock.com) moved YouTube ad blocking behind “AdBlock Premium” (~€3.50/mo) to loud community backlash — a “free forever, no premium tier” README statement is a zero-cost differentiator while users are actively resentful of monetized blockers.
- **YouTube Premium and Premium Lite.** Do well: platform-supported ad reduction with no interception race and clear billing/support. Learn: be explicit that an independent blocker cannot promise equivalent availability or terms. Avoid: competing on subscriptions, creator payments, downloads, or background-play entitlements.
- **Tampermonkey, Violentmonkey, and Userscripts for Safari.** Do well: installation, update, storage, and cross-origin capability layers. Learn: manager-specific execution-world metadata, narrow connection grants, and a dated support matrix. Avoid: treating their sandbox, sync, CSP, and mobile behavior as interchangeable. Tampermonkey 5.5.0 (2026-05-08) added a required userscript-injection extension permission and a download-permission prompt on saves; Violentmonkey v2.46.0–v2.47.1 (2026-07-29 → 2026-08-13) added experimental MV3 “Alternative page mode”, a Chrome 146+ webRequest registration fix, and opt-in Firefox CSP bypass — both changes shift first-run friction and injection timing.
- **Brave adblock-rust and AdNauseam.** Do well: high-performance parsing and, in AdNauseam’s case, a distinct anti-tracking philosophy. Learn: adversarial parser/performance tests. Avoid: a heavyweight general filter engine or automated ad interaction, which conflicts with this project’s scope and risk posture.
- **FreeTube, NewPipe, Invidious, and Piped.** Do well: alternative-client privacy, mobile/native UX, subscriptions, and reduced dependence on YouTube’s web UI. Learn: honest degraded states and version-health signaling. Avoid: becoming a frontend, extractor, proxy service, or native app; their frequent upstream breakage illustrates the maintenance cost.

## Security, Privacy, and Reliability

### Verified risks and missing guardrails

- **Untrusted page → persistent storage capability:** extension/bridge.js:496-541 accepts get/set requests from public document events and checks only a storage key, rate, ID, and payload size. A page script can replace the whole object; extension/bridge.js:315-327 and 581-585 also copy it into origin localStorage. The existing trusted-context broker roadmap item should remove this boundary, not merely rename it.
- **Consent boundary is non-functional in the extension:** SponsorBlock is enabled by default at YoutubeAdblock.user.js:815. state.communityApiPermission is diagnostic-only at 981 and 8737; no fetch path checks it. Build-Extension.ps1:159-188 uses page fetch, so optional_host_permissions do not gate calls. Segment-view POSTs at 3630-3641 need separate disclosure and revocation behavior.
- **Sync schema, quota, and commit integrity:** extension/bridge.js:124-129 counts UTF-16 code units rather than storage bytes, 187-227 writes chunks then metadata without a generation checksum/commit marker, and 232-247 replaces the complete local snapshot by timestamp. YoutubeAdblock.user.js:1177-1190 can persist hot stats every two seconds. Chrome documents 120 writes/minute, 1,800/hour, about 100 KB total, and 8 KB/item.
- **Authenticity without freshness:** the signatures cover content, not a versioned metadata envelope. youtube-adblock-filters.manifest.json and webpack-ad-signatures.manifest.json identify content/hash/bytes/date but provide no signed artifact role, monotonic revision, expiry, or rotation key. Persist the highest accepted revision, reject replay/mix-and-match candidates, and continue the last known good data offline with a stale warning.
- **User regex denial of service:** parseBlocklist accepts any JavaScript regex and matches it synchronously during renderer pruning. Add a conservative documented subset, input/list caps, compile-on-change caching, explicit rejected-line feedback, and an adversarial runtime budget.
- **Partial or misleading imports:** importSettingsPayload accepts top-level objects from any app/schema version, skips invalid fields, and writes sequentially. Validate the entire payload, show a diff, reject future schemas, snapshot current state, and roll back every write on failure.
- **Overbroad/debug-only production permissions:** Chrome documents that most tabs operations need no tabs permission and that matching host permissions expose sensitive fields only for matching hosts. declarativeNetRequestFeedback enables unpacked debugging; a store build cannot promise its current matched-rule diagnostics.
- **Advertised userscript world mismatch:** Violentmonkey documents that @inject-into content cannot access page JavaScript objects, while the engine’s core value depends on replacing them. Use manager-specific metadata/builds and keep the existing real-manager matrix as the release proof.
- **Needs store-review validation — remotely refreshed directives:** parseUBOFilterList at YoutubeAdblock.user.js:1721-1858 maps only a packaged allowlist and rejects dangerous/unsupported scriptlets; no remote JavaScript is evaluated. Chrome permits remote configuration when all logic is packaged, but the submitted behavior must be fully reviewable. Compile the recommended list into an explicit constrained data schema before store submission rather than expanding runtime scriptlet interpretation.
- **Visible recovery/accessibility defect:** dist/browser-smoke/userscript-www-watch-dark-section-core.png and section-rules.png show earlier cards obscuring later headings after rail navigation. scrollSectionIntoView at YoutubeAdblock.user.js:8466-8482 and browser-smoke geometry assertions need a non-obscuration contract.
- **SABR-only delivery erodes URL-level classification (Verified mechanism; rollout % needs live validation):** yt-dlp issues #12482/#15689 and its SABR downloader work show 2026 player responses where `adaptiveFormats` URLs are removed in favor of `serverAbrStreamingUrl`, with non-compliant clients 403’d. The engine’s `isInlinePlaybackNoAd` injection targets SABR fake-buffering, but when ad and content share one server-negotiated stream, googlevideo `ctier` URL rules and manifest scrubbing lose signal. The engine must detect SABR-only responses and degrade gracefully — never misclassify or break playback.
- **Auto-dismissal false-positive class — compliance dialogs (Verified user reports, 2026-07):** desktop YouTube is A/B-testing transient pre-playback overlays tied to AI age/identity verification (r/uBlockOrigin 2026-07-20; YouTube’s published age-estimation program). Any popup-dismissal or anti-detection heuristic that pattern-matches “unexpected overlay at player start” risks silently dismissing a compliance dialog with account consequences. Overlay handling needs an allowlist that surfaces-and-logs these instead of acting.

### Existing strengths to preserve

- Ed25519 verification, pinned public key, SHA-256/byte checks, size caps, request supersession, and last-known-good/built-in fallback already prevent silent protection loss on ordinary refresh failures.
- The remote parser caps input and collections, validates dotted paths and selectors, reports unsupported/dangerous scriptlets, and does not use eval, new Function, innerHTML, or document.write.
- Packaged DNR blocking is small and typed from extension/rules/network-rules-source.json; diagnostics redact URLs and bound IDs/counts.
- The Control Center already has modal semantics, inert-background handling, focus trapping/return, reduced-motion behavior, semantic buttons, and live status text. The gap is systematic verification, not a wholesale accessibility rewrite.
- The ignored signing-key pattern is enforced by .gitignore and repository contract tests; private signing material must remain outside version control and use documented custody/rotation.

### Recovery and rollback needs

- Preserve an immutable last-known-good remote generation and one previous generation; a failed, replayed, expired, or partially written update must never replace active data.
- Add one-click import undo backed by a pre-import snapshot and make extension sync migrations idempotent across version upgrades.
- Add an unsynced per-tab/session/timed pause with a visible countdown and automatic restoration; keep the persistent global switch for deliberate long-term changes. The pause/self-test should recognize YouTube’s 2026-08 progressive degradation ladder — repeated ads → throttling → autoplay stops → videos refuse to load (r/Adblock reports 2026-08-09/10) — not only binary enforcement popups, so users get a stage-appropriate recovery suggestion.
- When DNR feedback, community APIs, sync, or signatures are unavailable, diagnostics must distinguish “protection unavailable” from “evidence unavailable” and never imply a successful browser-layer measurement.

## Architecture Assessment

- **Preserve the canonical/generated boundary.** YoutubeAdblock.user.js is the source of truth and extension/main.js is generated; Build-Extension.ps1 and repo-contract tests already make drift detectable. Do not hand-edit or independently modularize the generated file.
- **Land storage changes in dependency order.** First close the public page-write/read boundary through the existing broker item; then introduce a versioned preference schema and transactional sync generations; then migrate old full snapshots. Trying to repair sync while MAIN still owns the full object preserves the root flaw.
- **Use one feature lifecycle registry later.** Defaults at YoutubeAdblock.user.js:805-827, copy/groups at 446-939, installation at 5308-5331, portability at 7448-7583, diagnostics, and teardown behavior are separate lists. A typed registry should drive default, group, sync/portable eligibility, start, teardown, and diagnostic metadata without splitting the project into a framework.
- **Keep remote data declarative.** Convert reviewed upstream syntax during a maintainer build step into a versioned local schema whose runtime operations are exhaustively packaged. This strengthens the existing manual uAssets-ingestion and dynamic-DNR roadmap items; it is not a request for full uBO compatibility.
- **Test the shipped environments, not only extracted functions.** Current unit/contract tests are strong for parser, signatures, bridge sanitization, source parity, and DNR freshness, but many execute VM-extracted functions or fixtures. Missing gates are real manager worlds, service-worker wake-from-idle, a production manifest without debug feedback, interrupted sync generations, real ad creative, section non-obscuration, axe/ARIA snapshots, forced colors, zoom, narrow viewports, and named mobile/Safari devices.
- **Align documentation with executable contracts.** README.md’s page-injection explanation, community-permission meaning, sync-data description, browser support, DNR evidence, and store-readiness language must be generated or checked against the final build profiles. Distribution artwork/icons remain part of the existing blocked store item, not a new feature.
- **Dependency posture is healthy.** package-lock.json resolves playwright-core 1.61.1. On 2026-08-14, npm audit and an exact OSV query reported no known vulnerability; 1.62.1 was the current release. Update after CI as routine maintenance, not as a roadmap feature, because browser provisioning and manager/platform coverage matter more than the minor version itself.

Category audit:

- **Security/privacy/reliability:** broker, consent, sync, update freshness, regex, imports, and least privilege are prioritized.
- **Accessibility:** preserve the strong dialog base; fix obscuration and add an automated/manual release matrix.
- **i18n/l10n:** the existing real-localization roadmap item is correct; MAIN-world UI needs compiled dictionaries because it cannot call extension APIs.
- **Observability:** the existing privacy-scrubbed diagnostic bundle is the right scope; add version/storage/latency health inside it rather than a telemetry service.
- **Testing/docs/distribution:** real-manager, live-ad, stable CRX identity, store listing, and support-matrix work already exists and was not duplicated.
- **Plugin ecosystem:** consciously excluded until the fixed feature registry exists; arbitrary plugins would widen the most sensitive page-world boundary.
- **Mobile:** validate Firefox Android and Safari Userscripts by named version/device; do not infer compatibility from desktop engines or gecko_android metadata.
- **Offline/resilience:** retain cached/built-in protection and make remote/sync generations transactional; no offline video/download feature is in scope.
- **Multi-user:** consciously excluded; browser-profile isolation and sync are sufficient for a local blocker, and a cloud account would create unnecessary identity/data obligations.
- **Migration/upgrade:** versioned sync and atomic import must define idempotent legacy conversion, future-schema rejection, rollback, and explicit behavior when keys disappear.

## Rejected Ideas

- **Full uBlock Origin grammar or adblock-rust/WASM engine** — uBlock Origin, uAssets, and Brave show the maintenance and binary complexity; the project should ingest a reviewed safe subset instead of becoming an all-site blocker.
- **Remote executable emergency fixes** — uAssets quick-fix speed is attractive, but Chrome MV3 requires packaged logic whose complete functionality is reviewable; signed origin alone does not make remote code acceptable.
- **Automatic SSAI/SABR seeking from heuristics** — Google DAI and current ecosystem reports confirm same-stream insertion; without authenticated live markers, auto-seek can destroy content and SponsorBlock offsets. Keep the existing warn-only/capture-first roadmap.
- **General YouTube enhancer expansion** — ImprovedTube and YouTube Enhancer issue volume demonstrates lifecycle/UI debt; quality, themes, transcript, download, AI, and productivity features dilute the blocker/focus mission.
- **Native app, extractor, proxy, or alternate frontend** — FreeTube, NewPipe, Invidious, and Piped solve a different distribution problem and carry continuous extractor/service breakage.
- **SponsorBlock submissions, voting, or moderation** — SponsorBlock already owns that network and abuse surface; this project only needs consentful consumption and optional view reporting.
- **Ad clicking or AdNauseam-style obfuscation** — it adds fraud, legal, performance, and privacy risk without improving the stated blocking workflow.
- **Local or AI thumbnail generation** — DeArrow already supplies community alternatives; generating media introduces bandwidth, compute, model, copyright, and moderation obligations.
- **Third-party plugin marketplace** — arbitrary page-world extensions would expand the current trust boundary and maintenance load; revisit only after a closed lifecycle registry and capability model exist.
- **Multi-user cloud accounts** — no collaboration or server component exists, browser profiles already isolate users, and accounts would create unnecessary data-retention and security duties.
- **Stacking blockers or claiming permanent undetectability** — community reports show extension interactions and rapidly changing YouTube experiments; support one owned configuration and make confidence limits explicit.
- **Paywalling core protection** — commercial blockers validate demand for support/polish, not a fit with this MIT repository’s current philosophy and local-first design.

## Sources

### Project and repository

- https://github.com/SysAdminDoc/YoutubeAdblock
- https://github.com/SysAdminDoc/YoutubeAdblock/issues/1
- https://github.com/SysAdminDoc/YoutubeAdblock/issues/2

### Open-source blockers and adjacent projects

- https://github.com/gorhill/uBlock/releases/tag/1.73.0
- https://github.com/uBlockOrigin/uAssets/issues/30157
- https://github.com/uBlockOrigin/uAssets/issues/30158
- https://github.com/uBlockOrigin/uAssets/blob/master/filters/quick-fixes.txt
- https://github.com/AdguardTeam/AdguardBrowserExtension
- https://github.com/AdguardTeam/AdguardBrowserExtension/issues/3559
- https://github.com/AdguardTeam/AdguardFilters/issues/203236
- https://github.com/ajayyy/SponsorBlock/releases/tag/6.1.7
- https://github.com/ajayyy/SponsorBlock/issues/2480
- https://github.com/ajayyy/SponsorBlock/issues/2516
- https://github.com/ajayyy/DeArrow/releases/tag/2.3.10
- https://github.com/ajayyy/DeArrow/issues/423
- https://github.com/amitbl/blocktube
- https://github.com/amitbl/blocktube/issues/681
- https://github.com/varshneydevansh/FilterTube/issues/58
- https://github.com/YouTube-Enhancer/extension/issues/1348
- https://github.com/YouTube-Enhancer/extension/issues/1351
- https://github.com/code-charity/youtube/releases/tag/v4.2027
- https://github.com/brave/adblock-rust/issues/1
- https://github.com/dhowe/AdNauseam
- https://github.com/violentmonkey/violentmonkey/issues/1934
- https://github.com/quoid/userscripts/issues/873
- https://github.com/FreeTubeApp/FreeTube/releases/tag/v0.25.2-beta
- https://github.com/iv-org/invidious/releases/tag/v2.20260804.1
- https://github.com/TeamPiped/Piped/issues/4257
- https://github.com/TeamNewPipe/NewPipeExtractor/issues/1444
- https://github.com/yt-dlp/yt-dlp/issues/12482
- https://github.com/yt-dlp/yt-dlp/issues/15689
- https://github.com/yt-dlp/yt-dlp/pull/13515

### Landscape lists

- https://github.com/pluja/awesome-privacy
- https://github.com/digitalblossom/alternative-frontends

### Commercial and platform-supported products

- https://adguard.com/en/adguard-youtube/overview.html
- https://www.ghostery.com/blog/launching-ghostery-10-adblocker
- https://www.malwarebytes.com/browserguard
- https://help.totaladblock.com/en/tech/ab/-/block-ads-on-youtube
- https://surfshark.com/features/clean-web
- https://nordvpn.com/features/threat-protection/ad-blocker/
- https://getadblock.com/en/video-plus/
- https://support.google.com/youtube/answer/6308116
- https://support.google.com/youtube/answer/15968883

### Community signal

- https://www.reddit.com/r/Adblock/comments/1v5bd30/adblock_is_now_charing_money_to_block_youtube_ads/
- https://www.reddit.com/r/uBlockOrigin/comments/1vg98o4/ublock_origin_ubo_173_announcement_thread/
- https://www.reddit.com/r/Adblock/comments/1vka53b/is_ublock_origin_down_on_youtube_for_anyone_else/
- https://www.reddit.com/r/uBlockOrigin/comments/1v1x09u/strange_youtube_pop_up_even_when_ublock_is_active/
- https://www.reddit.com/r/uBlockOrigin/comments/1vfouqs/is_there_a_solution_in_ublock_origin_that/
- https://www.reddit.com/r/uBlockOrigin/comments/1v6qoz6/how_to_remove_youtube_shorts_and_channel_posts/
- https://www.reddit.com/r/uBlockOrigin/comments/1plo3du/ubo_has_made_my_youtube_sidebar_disappeargo_blank/
- https://news.ycombinator.com/item?id=44329712
- https://stackoverflow.com/questions/35397523/can-a-tampermonkey-userscript-save-data-into-a-synced-storage
- https://addons.mozilla.org/en-US/firefox/addon/adguard-adblocker/reviews/?score=2

### Browser standards, store policy, and userscript platforms

- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/reference/api/tabs
- https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- https://developer.chrome.com/docs/extensions/develop/concepts/content-filtering
- https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- https://developer.chrome.com/docs/webstore/program-policies/policies
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts
- https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/
- https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility
- https://violentmonkey.github.io/api/metadata-block/
- https://www.tampermonkey.net/documentation.php?locale=en&q=sandbox
- https://greasyfork.org/en/help/code-rules
- https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline
- https://blog.mozilla.org/addons/2026/07/23/firefox-153-webextensions-api-updates/
- https://blog.mozilla.org/addons/2026/04/23/webextensions-api-changes-firefox-149-152/
- https://www.tampermonkey.net/changelog.php
- https://github.com/violentmonkey/violentmonkey/releases

### Security, accessibility, media, and research

- https://theupdateframework.io/docs/metadata/
- https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS
- https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- https://developers.google.com/ad-manager/dynamic-ad-insertion/api/full-service/video-pod-serving/hls-timed-metadata
- https://support.google.com/youtube/answer/14129599
- https://blog.youtube/news-and-events/extending-our-built-in-protections-to-more-teens-on-youtube/
- https://www.usenix.org/conference/usenixsecurity25/presentation/el-hajj-chehade
- https://arxiv.org/abs/2503.01000

### Dependency and test tooling

- https://github.com/microsoft/playwright/releases/tag/v1.62.1
- https://playwright.dev/docs/chrome-extensions
- https://osv.dev/

## Open Questions

1. Which disposable account/region/experiment combinations will actually serve pre-roll, mid-roll, feed, Shorts, Music, TV, Kids, embed, and SSAI creative so privacy-scrubbed fixtures can be captured?
2. What is the dated pass/fail result for current Chrome + Tampermonkey, Firefox + Violentmonkey, Firefox Android, and Safari Userscripts after applying explicit manager execution-world metadata — specifically including whether document-start injection wins the race under Violentmonkey 2.47.x MV3 default mode versus its experimental “Alternative page mode”?
3. Is the private key for Chromium ID jpeojodihepmkpdhibnnbgamnakclnnj recoverable from the maintainer’s secure backup, or must identity/storage/update continuity be deliberately migrated?
4. What fraction of logged-in desktop web sessions receive SABR-only player responses (no distinct `adaptiveFormats` URLs) as of 2026-08, and what does the engine currently do on such a response — needed before the SABR degradation contingency can be scoped?
