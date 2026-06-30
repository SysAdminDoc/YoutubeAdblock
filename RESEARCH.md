# Research — YoutubeAdblock

Confidence: Verified unless marked Likely or Needs live validation.

## Executive Summary
YoutubeAdblock is a document-start YouTube blocker shipped as a userscript plus generated Chrome/Firefox MV3 extension, with signed remote filters, split page/content/background extension contexts, optional SponsorBlock/DeArrow/Return YouTube Dislike integrations, and a dense in-page Control Center. Its strongest shape is trust-focused local distribution: v0.5.20 now has GitHub release assets, CRX/ZIP/userscript checksums, a signed filter manifest, parser tests, bridge-security tests, and a browser-smoke matrix. Highest-value direction: keep the project narrow to YouTube, then harden the trust boundary around updateable data, extension storage, diagnostics, third-party APIs, and release provenance. Priority opportunities: release-publication/provenance guards, signed webpack signatures, remote-rule capability denial, trusted-context settings storage, optional host permissions, diagnostics redaction plus DNR rule telemetry, live manager/mobile validation, issue replay fixtures, community API cooldowns, real i18n/store/license preflights, and parser/interceptor performance budgets.

## Product Map
- Core workflows: install userscript or generated MV3 extension; block YouTube ads by pruning InnerTube payloads, hiding cosmetics, trapping player/webpack factories, and applying DNR rules in extension builds; refresh signed remote filters with cached/bundled fallback; tune modules, import/export settings, restore defaults, and copy diagnostics from the Control Center; optionally apply SponsorBlock, DeArrow, RYD, audio, volume, and clutter controls.
- User personas: desktop YouTube users who want a focused blocker; power users running Tampermonkey/Violentmonkey/Safari Userscripts (Safari is Needs live validation); self-hosted extension users; bug reporters who need diagnostics without leaking watch history; maintainers responding to YouTube endpoint and anti-adblock churn.
- Platforms and distribution: raw GitHub userscript, GitHub release userscript asset, generated Chrome/Edge MV3 CRX and ZIP, Firefox MV3 temporary/distribution path, Safari Userscripts instructions marked community-tested in `README.md:48`.
- Key integrations and data flows: `GM_xmlhttpRequest` or extension fetch paths for signed filter data, `webpack-ad-signatures.json`, SponsorBlock hash-prefix buckets, DeArrow hash-prefix branding, RYD dislike counts, extension `chrome.storage.local/sync`, extension DNR rules in `extension/rules/network-rules-source.json`, generated `extension/main.js` from `YoutubeAdblock.user.js`.

## Competitive Landscape
- uBlock Origin / uAssets: fast filter response, strict scriptlet model, and active YouTube breakage triage. Learn the quick-fix ingestion and safe-scriptlet discipline; avoid becoming a general-purpose all-site blocker.
- AdGuard: strong SSAI analysis, mature scriptlet ecosystem, cross-browser release discipline, and commercial support expectations. Learn from its platform review posture and SSAI terminology; avoid system-wide proxy/VPN complexity that contradicts this repo's YouTube-only shape.
- SponsorBlock, DeArrow, and Return YouTube Dislike: privacy-preserving community data APIs, visible attribution requirements, and abuse/rate-limit constraints. Keep them opt-in or clearly attributed; avoid automated submissions/background voting until user identity, moderation errors, cooldowns, and rollback paths are implemented.
- BlockTube: useful channel/title/comment filtering and import/export expectations for YouTube power users. Learn migration ergonomics; avoid expanding into broad content-moderation workflows beyond the existing blocklist surfaces.
- ImprovedTube: large YouTube tweak surface with organized options. Learn settings discoverability and per-surface grouping; avoid feature sprawl that weakens the blocker/security posture.
- Invidious and ReVanced: demonstrate demand for alternative YouTube clients and mobile patching. Learn from their resilience tracking and mobile validation culture; avoid shipping a separate client or patched mobile app from this repo.

## Security, Privacy, and Reliability
- Bugs or risks found: `webpack-ad-signatures.json` can be refreshed remotely without the Ed25519-style integrity used by `youtube-adblock-filters.txt` and `youtube-adblock-filters.manifest.json`; this is remote data, not remote code, but it steers ad-factory matching in `YoutubeAdblock.user.js:3715-3817`.
- Bugs or risks found: extension settings currently pass through content-script `CustomEvent` requests in `extension/bridge.js:260-424`; tests enforce allowlisted keys, bounded payloads, coalescing, sync chunking, and rate limiting, but Chrome supports restricting `storage.local/sync` to trusted contexts with `setAccessLevel()`.
- Bugs or risks found: SponsorBlock, DeArrow, and RYD fetch helpers treat non-200 responses as null in `YoutubeAdblock.user.js:3294-3315`, `YoutubeAdblock.user.js:4012-4028`, and `YoutubeAdblock.user.js:4170-4186`; RYD issue #319 reports rate-limit pressure for per-video API calls, and HTTP 429/`Retry-After` defines the backoff contract. Read paths should surface cooldown state to prevent retry churn and confusing silent failures.
- Bugs or risks found: diagnostics include page path, user agent, filter URL, SSAI context, feature flags, and rule metadata in `YoutubeAdblock.user.js:7626-7687`; the existing roadmap redaction item should land before expanding diagnostic bundles.
- Missing guardrails: release publication is now present for v0.5.20, but local release tooling still needs to fail when a tag lacks matching GitHub assets; store-policy, userscript-marketplace, third-party-license, and provenance preflights remain high-value release gates.
- Recovery and rollback needs: signed filters already fall back to cached/bundled data; restore defaults exists; extension storage should gain a service-worker-owned settings broker and trusted-context storage access; community API failures should have cooldown diagnostics and independent cache clearing.

## Architecture Assessment
- Module or boundary improvements needed: keep the single userscript artifact for userscript-manager compatibility, but route more testable pure helpers through the existing test harness; avoid splitting generated extension code by hand because `extension/README.md` says `extension/main.js` is generated.
- Module or boundary improvements needed: move extension persistence ownership from `extension/bridge.js` toward `extension/background.js` so untrusted page-world events request settings mutations through a narrow runtime-message protocol, then restrict storage access where supported.
- Refactor candidates: `parseUBOFilterList` in `YoutubeAdblock.user.js:1595` should grow an explicit dangerous-capability rejection path for scriptlet families that can create executable code or DOM script elements; current unsupported counts are useful telemetry but not a permanent security contract.
- Refactor candidates: community API helpers should share a small cooldown/cache-status layer so SponsorBlock, DeArrow, and RYD expose consistent diagnostics without leaking video IDs.
- Test gaps: there are no named regression fixtures for closed issue #1 (3-video playback blocker) and #2 (`clientScreen`/watch-page breakage) even though the changelog and source comments document those fixes.
- Test gaps: browser-smoke coverage is useful but still Needs live validation across Tampermonkey Chrome MV3, Violentmonkey Firefox, Safari Userscripts, and Firefox Android/mobile paths claimed in README.
- Documentation gaps: README covers features well, but marketplace constraints, third-party data/filter terms, and release provenance should be verified by local tools rather than maintained by prose.
- Coverage notes: accessibility is covered by existing Control Center semantics plus pending contrast/Trusted Types work; i18n is pending `_locales` generation; observability is page-diagnostics-heavy but missing DNR telemetry and redaction; offline/resilience is strong for signed filters but weak for community API cooldowns; multi-user sync exists through `chrome.storage.sync`; migration exists for BlockTube-style imports; upgrade strategy should stay local-release/provenance-driven; plugin ecosystem work should remain limited to safe rule/signature ingestion, not arbitrary extension plugins.

## Rejected Ideas
- General all-site ad blocker: competitor signal supports all-site DNR/webRequest tooling, but this repo's manifest, README, tests, and risk profile are intentionally YouTube-focused.
- Remote executable scriptlet support: The 2026 Chrome extension security report shows server-selected scriptlets that can create executable script are a high-risk pattern; keep remote inputs as signed, parsed data only.
- Full alternative YouTube client: Invidious proves demand, but this repo's value is preserving first-party YouTube UX with document-start blocking and the Control Center.
- Patched Android app distribution: ReVanced proves the mobile use case, but adopting APK patching would require unrelated signing, update, and legal/distribution systems; live mobile browser validation is the aligned path.
- Automated SponsorBlock submissions or background voting: submission/vote paths introduce user identity, moderation-error, duplicate, and rate-limit states; this project lacks the required UX and rollback tools for that path.
- Default extension DeArrow host permission before approval: current code correctly keeps DeArrow userscript-only until browser-extension API permission is granted.
- Dependabot, Renovate, or GitHub Actions release automation: repository rules require local builds/tests/releases and manual dependency management on this machine.

## Sources
Project/release:
- https://github.com/SysAdminDoc/YoutubeAdblock/releases/tag/v0.5.20

Competitors and analogous projects:
- https://github.com/gorhill/uBlock
- https://github.com/uBlockOrigin/uAssets/issues/30158
- https://github.com/AdguardTeam/AdguardBrowserExtension
- https://adguard.com/en/blog/youtube-server-side-ad-insertion.html
- https://github.com/amitbl/blocktube
- https://github.com/code-charity/youtube
- https://github.com/Anarios/return-youtube-dislike
- https://github.com/iv-org/invidious
- https://github.com/ReVanced/revanced-patches
- https://github.com/fregante/Awesome-WebExtensions
- https://github.com/bvolpato/awesome-userscripts

Platform, store, and userscript policy:
- https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
- https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/reference/api/i18n
- https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/
- https://greasyfork.org/en/help/code-rules
- https://www.tampermonkey.net/faq.php
- https://github.com/Tampermonkey/tampermonkey/issues/2786

Community APIs, security, and dependencies:
- https://wiki.sponsor.ajay.app/w/API_Docs
- https://wiki.sponsor.ajay.app/w/API_Docs/DeArrow
- https://returnyoutubedislike.com/docs/usage-rights
- https://github.com/Anarios/return-youtube-dislike/issues/319
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429
- https://thehackernews.com/2026/06/chrome-ad-blocker-with-10m-installs.html
- https://www.npmjs.com/package/playwright-core

## Open Questions
- Needs live validation: whether DeArrow will grant browser-extension API permission for this extension build; until then, extension DeArrow should remain inert.
- Needs live validation: exact pass/fail status for Safari Userscripts, Firefox Android, and real userscript-manager Chrome MV3 injection paths on current YouTube.
