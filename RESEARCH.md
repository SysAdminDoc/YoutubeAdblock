# Research - YoutubeAdblock

Confidence: Verified unless marked Likely or Needs live validation.

## Executive Summary
YoutubeAdblock is a document-start YouTube blocker shipped as a readable userscript and generated MV3 extension. The current checkout is strongest where it stays narrow: page-world request/payload proxies, DNR endpoint blocks, signed remote filters, local release tooling, diagnostics, SponsorBlock, RYD, DeArrow in userscript mode, and blocklist/clutter controls. Highest-value work now is distribution trust and permission discipline: fix the browser-smoke Control Center failures, reconcile the v0.5.11 local release state before publishing, fix the Firefox signed-XPI story, keep extension permissions aligned with actually enabled integrations, add artifact verification, implement the highest-value unsupported uBO scriptlet equivalents, validate mobile/Safari claims on real managers, and give users migration paths from established YouTube filtering tools.

## Product Map
- Core workflows: install userscript or unpacked MV3 extension; run page-world engines at `document-start`; prune YouTube payloads through `JSON.parse`, fetch, XHR, property traps, request-body injection, webpack chunk hooks, and cosmetic CSS; manage settings and diagnostics from the Control Center.
- User personas: userscript power users; Chromium/Firefox extension users comfortable with developer-mode installs; Firefox Android users; Safari users through the Userscripts app; future store users once identity, permissions, and signing are settled.
- Platforms and distribution: `YoutubeAdblock.user.js` is source of truth; `Build-Extension.ps1` generates `extension/main.js`; `Build-Release.ps1` creates local userscript, ZIP, XPI, and CRX artifacts; README claims Chromium, Firefox, Firefox Android, Safari Userscripts, YouTube desktop/mobile/music/TV/no-cookie/Kids.
- Key integrations and data flows: GitHub raw/jsDelivr filter list with Ed25519 verification; SponsorBlock hash-prefix skip segments plus view pings; DeArrow hash-prefix branding in userscript mode only; Return YouTube Dislike full-video-ID votes; extension settings mirror via localStorage, `chrome.storage.local`, and chunked `chrome.storage.sync`.

## Competitive Landscape
- uBlock Origin / uAssets: strongest fast-response YouTube filter pipeline and scriptlet vocabulary. Learn from its targeted scriptlet coverage and quick-fix cadence; avoid becoming a full general-purpose blocker.
- AdGuard / AdGuard Extra: clear communication on YouTube SSAI limits and mature commercial extension hardening. Learn from explicit server-side-ad caveats; avoid opaque suite bundling that dilutes this repo's single-purpose shape.
- BlockTube / FilterTube-style tools: strong channel/title filtering, regex, context actions, and migration demand from users with large lists. Learn import compatibility and channel-ID/handle normalization; avoid arbitrary user-JS filtering.
- SponsorBlock / DeArrow / Return YouTube Dislike: mature crowd-data ecosystem with category actions, view pings, licensing, and API permission constraints. Keep attribution and conservative privacy defaults; keep DeArrow extension mode gated until permission is resolved.
- Unhook / ImprovedTube / Enhancer for YouTube: mainstream UX benchmarks for granular surface controls, decluttering, player tweaks, and settings organization. Learn the surface grouping and visual clarity; avoid broad tweak sprawl that reintroduces the prior client-spoof playback failure class.
- ReVanced: mobile power-user benchmark with original-audio, quality, and playback patches. Learn demand signals; avoid Android app patching or client attestation tactics in this browser-focused repo.
- Greasy Fork YouTube scripts: confirms continuing userscript demand and strict readable-code distribution expectations. Use it as the natural userscript channel; avoid downloader/MP3 bundling due legal and review risk.

## Security, Privacy, and Reliability
- Current checkout has release-state drift: `HEAD`/`origin/main` is tagged `v0.5.10`, while local docs/manifests/source report `0.5.11` and many v0.5.11 files are uncommitted. Do not publish research or releases from a mixed tree without either committing the release work or reverting to the tagged baseline.
- `README.md:32` promises a signed persistent Firefox XPI, but `Build-Release.ps1:157-158` creates an `.xpi` by zipping the extension payload. A persistent Firefox install needs a real AMO/web-ext signing path or the README must stop calling the generated XPI signed.
- `extension/manifest.json` requests `https://dearrow-thumb.ajay.app/*` although `YoutubeAdblock.user.js:657-660` and `5828-5834` force DeArrow off in the extension build. That permission should be removed or made conditional until DeArrow extension approval exists.
- The extension bridge boundary is comparatively strong: allowlisted storage key, 512 KB payload cap, rate limiting, duplicate ID drop, GET coalescing, pagehide flush, sync chunking, oversized tombstones, and newest-write conflict handling in `extension/bridge.js`.
- Remote filter trust is materially better after signed manifests, but `youtube-adblock-filters.txt:65-104` still contains high-value unsupported scriptlets (`trusted-rpnt`, `trusted-json-edit-fetch-request`, `trusted-replace-outbound-text`, `trusted-prevent-dom-bypass`, `aeld`, `trusted-set`). Coverage reporting is present; the next step is implementing the safest equivalents.
- `npm audit --include=dev` reports 0 vulnerabilities for the current dependency tree; the only npm dev dependency fingerprint is `playwright-core`.
- Private signing material is ignored by `*.pem`, but the local tree contains `YoutubeAdblock-filter-signing-private.pem`; keep it untracked and treat any accidental staging as a release blocker.

## Architecture Assessment
- The single-source userscript plus generated MAIN-world extension remains a good fit. Keep `extension/main.js` generated and focus refactors in `YoutubeAdblock.user.js`, `Build-Extension.ps1`, and typed rule sources.
- `npm test` currently fails 9 browser-smoke cases: userscript modes time out because `.ytab-toggle-track` intercepts clicks on `#ytab-master-toggle`, and extension modes assert panel heights of 2537-2987 px against 760-844 px viewports. This is the top root-cause UI reliability fix before release.
- Release packaging needs a verifier step: build scripts create artifacts but do not prove ZIP path separators, CRX3 structure/signature, extension ID stability, XPI signing status, or artifact hash manifest before release upload.
- Filter compatibility should advance through bundled, named implementations of common uBO scriptlets rather than remote executable scriptlets. This preserves Chrome remote-hosted-code compliance while improving parity with uAssets quick fixes.
- Test coverage is now much stronger: Node tests cover core parsing/pruning/signature/bridge/background behavior and `tests/browser-smoke.test.mjs` opens Control Center flows across fixture hosts. Remaining gap is live userscript-manager/mobile validation for Tampermonkey MV3, Violentmonkey, Firefox Android, and Safari Userscripts.
- Accessibility is ahead of many competitors: ARIA switches, inert overlay handling, status toasts, and DOM-created UI avoid obvious injection paths. Existing roadmap items for contrast audit and i18n extraction remain valid and should not be duplicated.
- Observability is good for local diagnostics but not yet user-migration friendly: copied diagnostics and coverage summaries exist, while importers from BlockTube/FilterTube-style exports and a last-prune event bundle would reduce support friction.

## Rejected Ideas
- Remote executable scriptlet execution from filter lists - rejected because Chrome policy permits remote data, not remote code; bundled equivalents selected by signed data are safer.
- Native Safari Web Extension port - rejected until direct demand appears; the Userscripts-app path is enough to validate Safari behavior first.
- Client spoofing as a default ad-block technique - rejected because this repo already broke playback with client-screen spoofing and the ecosystem continues to churn around attestation/client identity.
- Embed-iframe player replacement - rejected because it would sacrifice comments, chapters, player state, quality controls, SponsorBlock anchoring, and accessibility while the current engine preserves YouTube's player.
- Password-locked settings - rejected until user demand appears; it fits parental-control tools more than a single-user ad blocker.
- Public telemetry or central analytics - rejected because the product posture is local diagnostics and optional community APIs, not centralized behavior collection.
- Downloader/MP3 bundling - rejected because it adds legal and store-review risk without strengthening ad blocking.

## Sources
Engine and platform:
- https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt
- https://github.com/uBlockOrigin/uAssets
- https://adguard.com/en/blog/youtube-server-side-ad-insertion.html
- https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
- https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure
- https://developer.chrome.com/docs/extensions/reference/api/userScripts
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
- https://github.com/Tampermonkey/tampermonkey/issues/2086

Competitors and adjacent projects:
- https://github.com/AdguardTeam/AdguardFilters
- https://github.com/AdguardTeam/AdguardBrowserExtension
- https://github.com/AdguardTeam/AdguardExtra
- https://github.com/amitbl/blocktube
- https://github.com/code-charity/youtube
- https://github.com/ajayyy/SponsorBlock
- https://github.com/ajayyy/DeArrow
- https://github.com/Anarios/return-youtube-dislike
- https://unhook.app/
- https://www.mrfdev.com/enhancer-for-youtube
- https://revanced.app/patches?pkg=com.google.android.youtube
- https://greasyfork.org/en/scripts/by-site/youtube.com?q=ads&sort=total_installs
- https://github.com/fregante/Awesome-WebExtensions

Community and API terms:
- https://github.com/uBlockOrigin/uAssets/issues/30157
- https://news.ycombinator.com/item?id=45359755
- https://wiki.sponsor.ajay.app/w/API_Docs
- https://wiki.sponsor.ajay.app/w/API_Docs/DeArrow
- https://wiki.sponsor.ajay.app/w/DeArrow/Casual_mode
- https://wiki.sponsor.ajay.app/w/Types
- https://github.com/ajayyy/SponsorBlock/wiki/Database-and-API-License
- https://returnyoutubedislike.com/docs/usage-rights

## Open Questions
1. DeArrow permission: will the maintainer grant API use for the extension build, or must DeArrow stay userscript-only/self-hosted?
2. Store identity: should CWS/Edge/AMO submissions use the current publisher identity or wait for a separate publishing identity?
3. SSAI live schema: which real player markers, progress ranges, or `ssap` metadata are visible in flagged sessions, and are they stable enough for auto-seek instead of warn-only behavior?
