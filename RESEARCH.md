# Research - YoutubeAdblock

Confidence: Verified unless marked Likely or Needs live validation.

## Executive Summary
YoutubeAdblock is a single-source YouTube blocker: `YoutubeAdblock.user.js` is the readable product, and `Build-Extension.ps1` generates the Chrome/Firefox MV3 extension. Its strongest current shape is a locally verified release pipeline, split-context page interception, signed default filters, generated DNR, bridge hardening, browser-smoke fixtures, SSAI warnings, DASH/HLS manifest scrubbing, migration importers, and a diagnostics-heavy Control Center. The highest-value direction remains trust and operability before feature breadth. Top opportunities, in priority order: publish the missing `v0.5.20` GitHub Release; fail local release gates when publication/assets drift; sign the refreshable webpack signature database; deny dangerous remote-selected rule capabilities; minimize optional community API permissions; add extension and userscript marketplace preflights; add third-party filter/data license checks; emit release provenance; add DNR matched-rule diagnostics; redact support diagnostics; add i18n and live manager/mobile validation; add community API cache controls; make SponsorBlock SSAI-aware; and add performance budgets for the hot parsers/interceptors.

## Product Map
- Core workflows: install the userscript in Tampermonkey/Violentmonkey/Userscripts, or build/load the MV3 extension; inject page-world proxies at `document-start`; prune InnerTube payloads; block extension DNR endpoints; manage settings and diagnostics from the in-page Control Center.
- User personas: readable-source userscript users, unpacked-extension Chromium users, Firefox/Safari/mobile users relying on script managers, admins once managed policy exists, and future CWS/AMO/userscript-marketplace users once distribution checks are stronger.
- Platforms and distribution: Windows-first local builds; Chromium 121+ unpacked MV3; Firefox 128+ temporary MV3 plus persistent userscript path; Firefox Android via userscript managers; Safari via Userscripts app; GitHub Releases for userscript/ZIP/CRX/checksums.
- Key integrations and data flows: signed GitHub-hosted default filter list; unsigned refreshable `webpack-ad-signatures.json`; SponsorBlock hash-prefix segment lookups and view pings; DeArrow userscript-only branding; Return YouTube Dislike full-video vote lookup; localStorage, `chrome.storage.local`, and chunked `chrome.storage.sync` settings.

## Competitive Landscape
- uBlock Origin / uAssets: fastest filter-response benchmark, active YouTube issue discipline, and mature scriptlet coverage. Learn quick-fix ingestion and rule coverage reporting; avoid becoming a general blocker.
- AdGuard / AdGuard Filters: strongest SSAI public framing and cross-product filter operations. Learn explicit limitation messaging and store-readiness checks; avoid opaque suite packaging and remote-selected executable behavior.
- SponsorBlock / DeArrow / Return YouTube Dislike: mature community-data APIs, category actions, voting/submission UX, attribution, and extension permission constraints. Learn category/action configurability and cache/privacy controls; avoid enabling DeArrow extension mode without permission clarity.
- BlockTube / ImprovedTube / Unhook / Enhancer-style tools: strong UX precedent for surface controls, blocklist editing, import/export, search, and player preferences. Learn list ergonomics and surface grouping; avoid tweak sprawl that weakens ad-blocking reliability.
- FreeTube / Invidious / Piped: adjacent privacy clients show demand for fallback paths and honest degradation when native YouTube is hostile. Learn fallback messaging and resilience; avoid replacing YouTube's native player in this project.
- Tampermonkey / Violentmonkey / Userscripts: distribution/runtime layer affects injection reliability, GM APIs, Safari behavior, and mobile support. Learn live-manager validation; keep manager-specific diagnostics current.
- ReVanced: mobile demand signal for SponsorBlock, original audio, quality controls, and ad blocking. Learn mobile expectations; avoid Android app patching or attestation tactics here.
- Browser and userscript platforms: Chrome DNR, remote-hosted-code, storage, i18n, managed storage, Mozilla signing, and Greasy Fork code rules define real release constraints. Learn platform-native APIs and preflight them locally; avoid reintroducing GitHub Actions.

## Security, Privacy, and Reliability
- Verified release gap: `HEAD`/`origin/main` is `6ac606d` after tag `v0.5.20`, but `gh release view v0.5.20 --repo SysAdminDoc/YoutubeAdblock` returns `release not found`; GitHub Releases stops at `v0.5.19` with userscript, ZIP, CRX, and checksum assets.
- Remote data trust: `youtube-adblock-filters.txt` is signed, but `YoutubeAdblock.user.js:50` and `YoutubeAdblock.user.js:3803` still refresh unsigned `webpack-ad-signatures.json`, which steers ad-factory matching.
- Remote capability safety: `youtube-adblock-filters.txt:65` includes `trusted-rpnt` and `youtube-adblock-filters.txt:152` includes `trusted-set`; tests currently report unsupported scriptlets rather than executing them. Keep dangerous remote-selected capabilities denylisted.
- Permission surface: `extension/manifest.json:16-30` requests `tabs`, DNR, and community API host permissions up front. RYD is optional and SponsorBlock can be disabled, so runtime host permissions remain a high-value reduction.
- Diagnostics privacy: `buildDiagnosticsReport()` includes full `resolveFilterUrl()`, page path, UA, filter details, SSAI URL context, feature toggles, and future event-bundle plans; add a redaction layer before expanding support bundles.
- Distribution compliance: `YoutubeAdblock.user.js` is readable and 371 KB, but `@connect *` plus community APIs need explicit userscript-marketplace preflight and disclosure checks.
- License/attribution risk: `youtube-adblock-filters.txt` states it combines uBO filters, quick-fixes, EasyList, and uBO annoyances; README says MIT, while upstream filters/API data carry their own licenses or attribution terms.
- Local verification is healthy: `npm test` passed 98 tests and `npm audit --include=dev` reported 0 vulnerabilities. `playwright-core` is current at 1.61.1, Apache-2.0, modified 2026-06-29.

## Architecture Assessment
- Keep the single-source userscript -> generated extension model. It preserves readability, userscript parity, and local build control.
- Existing roadmap items remain valid and were not duplicated: Trusted Types audit, contrast audit, per-surface profiles, diagnostic event bundle, rules playground, SponsorBlock categories/votes, DeArrow submission UI, Firefox stable release, dynamic DNR updates, toolbar popup, managed schema, alarms refresh, Lite mode, quality forcing, tab-disabled indicator, webpack signature signing, remote-rule denylist, runtime host permissions, store preflight, i18n, live manager/mobile validation, community cache controls, SSAI-aware SponsorBlock, and uAssets ingestion.
- Release tooling verifies local artifacts but lacks publication and provenance checks: `Build-Release.ps1:186-190` reports local outputs; `tools/verify-release-artifacts.mjs` verifies ZIP/CRX/checksums; neither records git SHA/tool versions/test summary nor proves the tag has matching release assets.
- Observability is good in page-world diagnostics but incomplete at the extension network layer: no `declarativeNetRequest.getMatchedRules` path exists, so users cannot tell whether DNR rules actually fired.
- Testing is strong for parsers, bridge security, background relay, browser-smoke fixtures, and release contracts, but there is no performance budget for large InnerTube payloads, large filter lists, or webpack factory scans.
- Mobile/offline/multi-user/migration coverage: migration import and sync exist; cached filters/signatures protect offline starts. Missing pieces are live manager/mobile validation, offline community-submission workflows, cache controls, and explicit support-bundle redaction.

## Rejected Ideas
- Remote executable scriptlets from filter lists - rejected from Chrome policy and the 2026 remote-scriptlet security report; use bundled allowlisted transformations only.
- Native/VPN/system proxy blocker - rejected because it changes install burden and product boundary compared with this readable userscript/MV3 project.
- Replacing YouTube with an iframe/embed/privacy frontend - rejected because it breaks comments, chapters, player state, accessibility, and SponsorBlock anchoring.
- Downloader/MP3 features - rejected because they add legal/store-review risk without improving ad blocking.
- Public telemetry/analytics - rejected because the product posture is local diagnostics plus optional community APIs.
- Automatic CWS/AMO publishing - rejected until publisher identity, account credentials, and legal ownership are available.
- Reintroducing placeholder icons - rejected by `CLAUDE.md`; no icon is preferred over bad generated branding.

## Sources
OSS competitors and adjacent projects:
- https://github.com/gorhill/uBlock
- https://github.com/uBlockOrigin/uAssets
- https://github.com/AdguardTeam/AdguardBrowserExtension
- https://github.com/AdguardTeam/AdguardFilters
- https://github.com/ajayyy/SponsorBlock
- https://github.com/ajayyy/DeArrow
- https://github.com/Anarios/return-youtube-dislike
- https://github.com/amitbl/blocktube
- https://github.com/code-charity/youtube
- https://github.com/FreeTubeApp/FreeTube
- https://github.com/iv-org/invidious
- https://github.com/TeamPiped/Piped
- https://github.com/violentmonkey/violentmonkey
- https://github.com/quoid/userscripts
- https://github.com/fregante/Awesome-WebExtensions

Community, APIs, security, and distribution:
- https://github.com/uBlockOrigin/uAssets/issues/30157
- https://github.com/uBlockOrigin/uAssets/issues/30158
- https://github.com/Tampermonkey/tampermonkey/issues/2786
- https://wiki.sponsor.ajay.app/w/API_Docs
- https://wiki.sponsor.ajay.app/w/API_Docs/DeArrow
- https://returnyoutubedislike.com/docs/usage-rights
- https://adguard.com/en/blog/youtube-server-side-ad-insertion.html
- https://thehackernews.com/2026/06/chrome-ad-blocker-with-10m-installs.html
- https://greasyfork.org/en/help/code-rules

Standards, platform, and dependency docs:
- https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/reference/api/i18n
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
- https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/

## Open Questions
None that block prioritization. CWS/AMO publisher identity, DeArrow extension API permission, and live Safari/Firefox Android device availability block specific implementations, not roadmap ordering.
