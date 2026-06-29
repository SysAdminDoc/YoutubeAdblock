# Research - YoutubeAdblock

Confidence: Verified unless marked Likely or Needs live validation.

## Executive Summary
YoutubeAdblock is a narrow, Windows-first, local-build YouTube blocker with a readable userscript as source of truth and a generated Chrome/Firefox MV3 extension. Its strongest current shape is trustable local tooling plus page-world payload interception: signed filter manifests, generated DNR, browser-smoke fixtures, extension bridge hardening, SSAI warnings, DASH/HLS manifest scrubbing, and a diagnostics-heavy Control Center. The highest-value direction is release trust and store-readiness hardening before more feature breadth. Top opportunities, in order: publish the missing v0.5.20 release; add a local release-publication guard so tags cannot outrun GitHub assets; sign the refreshable webpack signature database; harden remote rule/scriptlet capability boundaries; reduce optional community API host permissions; add store-policy preflight checks; convert the extracted `STRINGS` table into a real i18n pipeline; validate live userscript-manager/mobile paths beyond fixtures; add community API cache/privacy controls; and make SponsorBlock behavior SSAI-aware.

## Product Map
- Core workflows: install `YoutubeAdblock.user.js` in Tampermonkey/Violentmonkey/Userscripts, or build/load the MV3 extension; inject page-world proxies at `document-start`; prune player/browse/search/next payloads; block DNR endpoints; manage protection from the in-page Control Center.
- User personas: userscript power users who want transparent source; unpacked-extension users; Firefox Android/Safari users relying on script managers; future CWS/AMO users; admins once managed policy exists.
- Platforms and distribution: `YoutubeAdblock.user.js` is canonical; `Build-Extension.ps1` generates `extension/main.js`; `Build-Release.ps1` builds userscript, ZIP, CRX, checksums, and optional unsigned XPI; README covers Chromium 121+, Firefox 128+, Firefox Android via userscripts, Safari via Userscripts app, YouTube desktop/mobile/music/TV/no-cookie/Kids.
- Key integrations and data flows: signed GitHub-hosted filter list; unsigned refreshable `webpack-ad-signatures.json`; SponsorBlock hash-prefix segment lookup plus view pings; DeArrow userscript-only branding; Return YouTube Dislike votes; extension settings via localStorage, `chrome.storage.local`, and chunked `chrome.storage.sync`.

## Competitive Landscape
- uBlock Origin / uAssets: best-in-class YouTube response cadence, scriptlet vocabulary, and issue discipline. Learn from quick-fix monitoring and explicit unsupported-scriptlet tracking; avoid becoming a general-purpose blocker.
- AdGuard / AdGuard Extra / Filters: strongest communication around SSAI limits and mature cross-product filtering. Learn from clear caveats and server-side-ad framing; avoid broad suite packaging and opaque remote-controlled scriptlet selection.
- SponsorBlock / DeArrow / Return YouTube Dislike: mature community-data workflows with category actions, voting, licensing, and privacy-sensitive APIs. Learn category action granularity and submission UX; avoid enabling DeArrow extension mode without permission clarity.
- BlockTube / ImprovedTube / Unhook / Enhancer-style tools: strong UX precedent for channel filtering, granular surface controls, player tweaks, and settings organization. Learn migration/import ergonomics and surface grouping; avoid feature sprawl that weakens ad-blocking reliability.
- FreeTube / Invidious / Piped: adjacent privacy-first YouTube clients show demand for fallback frontends and local privacy posture. Learn diagnostic honesty and recovery alternatives; avoid replacing YouTube's native player in this extension.
- Tampermonkey / Violentmonkey / Userscripts: distribution layer is a dependency, not just an install note. Learn from MV3 injection/cache issues and Safari script-manager constraints; keep manager-specific diagnostics live.
- ReVanced: mobile demand signal for original audio, quality controls, SponsorBlock, and ad blocking. Learn mobile feature expectations; avoid Android app patching or client attestation tactics in this browser repo.
- Browser extension platforms: Chrome DNR, remote-hosted-code policy, i18n, alarms, managed storage, and Mozilla signing define real constraints. Learn from platform-native APIs; avoid CI/workflow reintroduction because this repo's policy is local builds only.

## Security, Privacy, and Reliability
- Verified release gap: `HEAD`/`origin/main` is tagged `v0.5.20`, but `gh release view v0.5.20 --repo SysAdminDoc/YoutubeAdblock` returns `release not found`; v0.5.19 is the latest GitHub release with assets. This is the current P0 trust issue.
- Remote rule safety: Chrome's MV3 remote-hosted-code policy allows remote JSON/data, not remote executable code; this repo already avoids executing filter-list scriptlets, but `youtube-adblock-filters.txt:65` still carries a `trusted-rpnt` scriptlet and `YoutubeAdblock.user.js:50` fetches unsigned `webpack-ad-signatures.json`. Sign or stronger-bound remote data before store distribution.
- Security advisory signal: a 2026 report on a high-install YouTube ad blocker found risk from server-controlled selection of built-in scriptlets, especially script-creating paths. YoutubeAdblock should keep every remote-selected capability denylisted unless it is a bundled, test-covered, non-executable transformation.
- Permission surface: `extension/manifest.json` requests `https://sponsor.ajay.app/*` and `https://returnyoutubedislikeapi.com/*`; SponsorBlock defaults on, but RYD is optional. Runtime optional permissions would reduce install warnings and align with Mozilla/Chrome permission guidance.
- Firefox truth is now sound: README and `Build-Release.ps1:160-163` correctly describe XPI output as unsigned development-only. The remaining Firefox work is real AMO/web-ext signing and live validation, not docs cleanup.
- Private signing key hygiene remains important: `YoutubeAdblock-filter-signing-private.pem` is local and ignored; any accidental staging should block release.
- Local verification is currently healthy: `npm test` passed 98 tests, including browser-smoke fixtures, bridge security, background relay, filter signatures, artifact contract tests, and SSAI/manifest scrub coverage. `npm audit --include=dev` reported 0 vulnerabilities; `playwright-core` is the only npm dev dependency and is current at 1.61.1.

## Architecture Assessment
- Keep the single-source model: `YoutubeAdblock.user.js` plus generated `extension/main.js` is still the simplest way to keep userscript/MV3 parity. Future refactors should extract pure helpers only when they reduce tests/build risk.
- Existing roadmap items remain valid and should not be duplicated: Trusted Types audit, contrast audit, per-surface profiles, diagnostic bundle with last 50 events, rules playground, SponsorBlock category actions, offline votes, DeArrow submission UI, Firefox stable release, dynamic DNR endpoint, toolbar popup, managed schema, alarms refresh job, Lite mode, quality forcing, and per-tab indicator.
- The `STRINGS` table and repo-contract guard make i18n feasible, but no `_locales` tree, `default_locale`, or userscript locale resolver exists yet.
- Observability is good but still summary-only: `buildDiagnosticsReport()` exposes counters, filter state, engine health, SSAI signals, and settings counts, but no event ring exists yet for root-cause bug reports.
- Release tooling verifies artifacts but not publication: `Build-Release.ps1` and `tools/verify-release-artifacts.mjs` validate local files, while GitHub release creation remains a manual step that has already drifted at v0.5.20.
- Mobile/offline/multi-user/migration coverage: migration import exists for BlockTube/FilterTube-style lists; sync handles multi-profile settings; offline resilience covers cached filters/signatures. Missing pieces are live Firefox Android/Safari validation, SponsorBlock offline submission/vote workflow, and explicit community API cache controls.

## Rejected Ideas
- Remote executable scriptlet execution from filter lists - rejected from THN/Chrome policy evidence; use bundled allowlisted transformations only.
- Native app/VPN/system proxy blocker - rejected because AdGuard-style system filtering changes the product boundary and install burden.
- Replacing YouTube with an iframe/embed/frontend client - rejected because it breaks comments, chapters, player state, accessibility, SponsorBlock anchoring, and the current native-player philosophy.
- Downloader/MP3 features - rejected because they add legal/store-review risk and do not improve ad blocking.
- Automatic store publishing without publisher identity and AMO/CWS credentials - rejected until the user decides account/legal ownership.
- Public telemetry/central analytics - rejected because the product posture is local diagnostics plus optional community APIs.
- Reintroducing generated placeholder icons - rejected by `CLAUDE.md`; the user intentionally prefers no icon over bad branding.

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
- https://github.com/fregante/Awesome-WebExtensions

Community, APIs, and ecosystem signal:
- https://github.com/uBlockOrigin/uAssets/issues/30157
- https://github.com/uBlockOrigin/uAssets/issues/30158
- https://github.com/Tampermonkey/tampermonkey/issues/2786
- https://wiki.sponsor.ajay.app/w/API_Docs
- https://wiki.sponsor.ajay.app/w/API_Docs/DeArrow
- https://returnyoutubedislike.com/docs/usage-rights
- https://adguard.com/en/blog/youtube-server-side-ad-insertion.html
- https://thehackernews.com/2026/06/chrome-ad-blocker-with-10m-installs.html

Standards and platform docs:
- https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
- https://developer.chrome.com/docs/extensions/reference/api/alarms
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/reference/manifest/storage
- https://developer.chrome.com/docs/extensions/reference/api/i18n
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
- https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

## Open Questions
None that block prioritization. AMO/CWS publisher identity and DeArrow extension API permission block implementation of specific existing roadmap items, but not the ordering above.
