# Changelog

All notable changes to YoutubeAdblock are documented here.

## [Unreleased]

### Added
- Added release provenance metadata that records commit SHA, dirty-tree state,
  Node/npm/Playwright versions, and build timestamp alongside release artifacts.
  The artifact verifier validates the provenance file before writing checksums.
- Added diagnostics redaction that strips video IDs from watch/Shorts URLs and
  query strings from custom filter and SSAI URLs before they appear in copied
  diagnostics.
- Added store-policy preflight checks that fail the release gate on remote
  executable URLs, broad host permissions, eval/new Function, invalid extension
  ID, unsigned XPI naming, and stale background compatibility keys.
- Converted SponsorBlock and RYD community API hosts from install-time
  `host_permissions` to `optional_host_permissions` with runtime permission
  request via the context menu. Permission status is tracked and reported in
  diagnostics. Userscript behavior is unchanged.
- Added a remote-rule capability denylist that rejects dangerous scriptlets
  (e.g. trusted-set-constant, trusted-set-attr, evaldata-prune) from remote
  filter lists. Rejected scriptlets are reported as rejected-dangerous in
  diagnostics and the Control Center instead of silently counted as unsupported.
- Added Ed25519 signing and integrity verification for the refreshable webpack
  signature database. Remote signatures are rejected when tampered, diagnostics
  reports integrity status, and the release gate signs/verifies both the filter
  list and the webpack signature database.
- Added a release-publication guard that verifies the current version tag has a
  GitHub release with matching asset names and checksums. Available via
  `--verify-publication` flag on the artifact verifier or `-VerifyPublication`
  switch on the release gate.

## [0.5.20] - 2026-06-28

### Added
- Added PlayerResponse `serverStitchedAd` detection with de-duplicated
  SSAI counters, a Control Center warning, and copied diagnostics context for
  server-side ads that JSON pruning cannot remove.

## [0.5.19] - 2026-06-28

### Added
- Added a DASH/HLS manifest scrub fallback for text manifests, removing
  googlevideo `ctier=SA`/`ctier=SR` ad segment references through fetch/XHR
  interception when browser DNR is unavailable.

## [0.5.18] - 2026-06-28

### Added
- Added a refreshable webpack ad-signature database backed by
  `webpack-ad-signatures.json`, with sanitized token loading, cached startup
  fallback, diagnostics output, and browser-smoke fixture coverage.

## [0.5.17] - 2026-06-28

### Changed
- Extracted Control Center, diagnostics, toast, menu, and feature-toggle copy
  into a central `STRINGS` table as the prerequisite for future localization.

## [0.5.16] - 2026-06-28

### Added
- Added BlockTube/FilterTube-style migration import for channel and keyword
  blocklists, including merge-safe normalization and rejected-entry previews.

## [0.5.15] - 2026-06-28

### Added
- Added safe local support for selected uBO YouTube quick-fix scriptlets:
  response field replacement, DOM-bypass prevention, and `nano-stb` timer
  coverage now report as supported and feed the existing bundled engines.

## [0.5.14] - 2026-06-28

### Added
- Added release artifact verification for ZIP entry paths, CRX3 structure and
  signature, stable Chromium extension ID, unsigned-XPI naming, and SHA-256
  checksum output.

## [0.5.13] - 2026-06-28

### Changed
- Removed inactive DeArrow thumbnail host access from the MV3 extension
  manifest while keeping userscript-only DeArrow thumbnail access available.

## [0.5.12] - 2026-06-28

### Fixed
- Fixed the Firefox release contract so local XPI output is explicitly
  development-only and unsigned. README and extension docs no longer promise a
  signed persistent Firefox XPI unless AMO/web-ext signing is actually wired.

## [0.5.11] - 2026-06-28

### Added
- Added a Playwright-powered browser smoke matrix for userscript and extension
  Control Center flows across desktop YouTube, mobile YouTube, YouTube Music,
  and YouTube Kids fixture hosts. The smoke opens the panel, toggles
  protection, refreshes rules through the signed local fixtures, exercises the
  block-channel event, checks console errors, and captures screenshots under
  `dist/browser-smoke/`.

### Fixed
- Fixed the Control Center smoke path so the master switch remains pointer-clickable
  and the panel stays viewport-bounded across desktop, mobile, Music, and Kids
  fixture surfaces.

## [0.5.10] - 2026-06-28

### Added
- Added Ed25519 verification for the recommended remote filter list, with a
  tracked manifest and detached signature. Tampered default rules now fail
  verification and leave cached or built-in rules active, while custom Rule
  Library URLs remain allowed with an unsigned-source warning.

## [0.5.9] - 2026-06-28

### Added
- Added userscript-manager onboarding diagnostics. Control Center and copied
  diagnostics now report whether YoutubeAdblock evaluated at `document-start`
  or likely loaded late, with setup guidance for Chrome MV3 user-script
  manager issues.

## [0.5.8] - 2026-06-28

### Changed
- Removed the default extension keyboard shortcut. Toolbar and context-menu
  actions remain primary, and users can bind optional browser shortcuts from
  their extension shortcut settings.

## [0.5.7] - 2026-06-28

### Added
- Added an optional Force Original Audio engine that uses YouTube's player
  audio-track API to switch from auto-dubbed or translated tracks back to an
  explicitly marked original track.

## [0.5.6] - 2026-06-28

### Added
- Added `Build-Release.ps1`, a one-command local release gate that cleans
  stale artifacts, regenerates `extension/main.js` and DNR output, runs
  syntax checks and the Node test suite, validates version/artifact freshness,
  and writes current userscript, ZIP, optional XPI, and CRX artifacts.

## [0.5.5] - 2026-06-28

### Added
- Added filter coverage reporting for applied selectors, applied prune paths,
  network-only filter rules, dropped unsafe selectors, supported scriptlets,
  and unsupported scriptlets in the Control Center and diagnostics report.
- Added `extension/rules/network-rules-source.json` as the typed source for
  DNR output and userscript intercept-pattern drift checks. `Build-Extension.ps1`
  now regenerates `extension/rules/network-blocks.json` from that source.

## [0.5.4] - 2026-06-28

### Added
- Added stable channel blocklist identities. Channel blocklists and ad
  allowlists now accept display names, `UC...` channel IDs, `@handles`,
  channel URLs, and regex while preserving existing name-only behavior.
- Added Control Center import/export tools for blocklists and local settings:
  copy JSON, copy plain channel text, import JSON, or import plain channel
  text without leaving YouTube.

## [0.5.3] - 2026-06-28

### Fixed
- Restored the extension context-menu "Block This Channel" action by wiring
  the service-worker click handler to the existing page-world block-channel
  event and covering the relay/storage path with regression tests.

## [0.5.2] - 2026-06-28

### Fixed
- Repaired the local-build repo contract after GitHub Actions removal. The
  repo-contract tests now assert the current local `Build-Extension.ps1` /
  `Build-CRX.ps1` release path instead of importing a deleted workflow.
- Updated the extension README to document local release steps and the
  intentionally iconless manifest state.

## [0.5.1] - 2026-06-16

### Added
- **Extension settings sync.** MV3 builds now mirror the extension settings
  bundle into `chrome.storage.sync` using 7 KB chunks below the browser
  8 KB/item and 100 KB total sync quotas. Signed-in browser profiles receive
  toggles, blocklists, allowlists, and duration thresholds automatically.

### Changed
- **Storage conflict policy.** Extension settings now carry local metadata and
  resolve cross-profile conflicts by newest write timestamp. Oversized
  blocklists still save to `chrome.storage.local` and localStorage, but write an
  oversized sync tombstone so stale sync data does not overwrite the local copy.

## [0.5.0] - 2026-06-12 (audit hardening)

### Fixed
- **Object.assign hook over-broad**: `injectNoAdFlag` now only runs on objects
  that contain `playbackContext` or `contentPlaybackContext`, preventing the
  no-ad flag from being injected into unrelated objects like analytics payloads,
  UI config, or third-party code passing through `Object.assign`.
- **Breakage self-test false positive on age gates**: tightened the enforcement
  popup selector from a broad `tp-yt-paper-dialog[aria-label]` match (which
  hit legitimate age-verification and content-warning dialogs) to specifically
  require `ytd-enforcement-message-view-model` inside the dialog.
- **SponsorBlock stale video skip**: added `video.isConnected` check in the
  timeupdate handler so a detached `<video>` element from a prior SPA
  navigation can't trigger segment skips on the wrong video.
- **Duplicate iframe load listeners**: DOM bypass prevention now marks
  bridged iframes with a sentinel to prevent re-attaching the `load`
  listener when the same iframe is re-inserted into the DOM.
- **Webpack chunk regex on oversized factories**: added a 200KB size guard
  before running the ad-signature regex against webpack factory source
  strings, preventing unnecessary CPU work on mega-bundles.

### Improved
- **Inline styles moved to CSS classes**: blocklist textarea styling and
  attribution note styling now use `.ytab-blocklist-textarea` and
  `.ytab-attribution` CSS classes instead of inline `style.cssText`,
  enabling theme-consistent colors via CSS variables (`--text`,
  `--panel-border`, `--accent`) and proper focus-ring styling.
- **Accessibility**: locked toggle inputs now carry `aria-disabled="true"`;
  toast notification region has explicit `role="status"`.

## [0.5.0] - 2026-06-12

Anti-fake-buffering engine, engine health diagnostics, API compliance,
and cleanup of the retired clientScreenSpoof toggle.

### Added
- **No-ad request injection.** Outbound `/player` and `/get_watch` request
  bodies now carry `playbackContext.contentPlaybackContext.isInlinePlaybackNoAd:
  true`, which tells InnerTube to omit ad payloads and the SABR
  fake-buffering backoff. Injected in three places — the fetch proxy, the
  XHR proxy, and a new `Object.assign` hook — so the flag lands even when
  YouTube's locker script freezes `fetch`/`JSON.parse` first. Covers both
  cold loads (external links) and SPA navigation.
- **Engine health tracking.** Every engine install records its outcome
  (`ok` / `degraded` / `failed`) and which natives `safeOverride` could
  not replace. The Control Center Overview now renders a
  "Protection Degraded" warning naming the affected engines and locked
  natives, and the diagnostics snapshot includes the full health map.
- **Third-party API attribution.** SponsorBlock (CC BY-NC-SA 4.0) and
  Return YouTube Dislike attribution notes now render in the Control Center
  feature sections, linking to the upstream projects.
- **Stale override migration.** `getFeatureOverrides` now drops unknown
  feature keys (e.g. the retired `clientScreenSpoof`) from persisted storage
  on first load, preventing orphaned toggles from surviving indefinitely.

### Changed
- **DeArrow gated off in the extension build.** The DeArrow API is
  "free to use for all non browser-extensions" per the maintainer's terms.
  Until explicit permission is granted, the toggle is disabled and
  read-only in the extension build; the userscript build is unaffected.
- **Outbound request rewrite toggle** moved from Core Blocking to
  Anti-Detection and relabeled "No-ad request signal" to reflect its
  current purpose (the old clientScreen body rewrite is gone).
- **Webpack chunk hook** comment block corrected: it does replace matching
  ad-rendering factories with no-op modules (not hint-only as the stale
  v0.4.0 comment said). The `pruned` stat accurately counts replacements.

### Removed
- **`clientScreenSpoof` feature toggle.** Retired in v0.4.1 after breaking
  playback (issue #2); the toggle remained in the UI as a no-op. Now fully
  removed from defaults, FEATURE_GROUPS, and the UI. Stored overrides
  containing the key are automatically cleaned.

## [0.4.1] - 2026-06-03

Critical playback fix.

### Fixed
- **Broken video player + missing comments on `/watch` (issue #2).** The
  `clientScreenSpoof` feature rewrote outbound `/youtubei/v1/player` (and
  `/youtubei/v1/get_watch`) request bodies, setting
  `context.client.clientScreen = 'CHANNEL'`. YouTube treats that as a
  channel-page preview surface and returns `playabilityStatus = UNPLAYABLE`
  with **no `streamingData`** — so the player never renders (no video, no
  play button) and the watch-page hydration aborts, taking the comments
  section with it. Verified against the live authenticated player endpoint:
  the identical request returns `OK` + 14 adaptive formats without the spoof
  and `UNPLAYABLE` + 0 formats with it.
  - The spoof no longer rewrites the player/watch request bodies under any
    circumstance (removed in both the fetch and XHR proxies).
  - `clientScreenSpoof` now defaults to **off**. Existing users who had it
    persisted as on are protected regardless, because the harmful mutation
    is gone — the toggle can no longer strip `streamingData`.

## [0.4.0] - 2026-04-22

Major capability release. Anti-detect hardening, three new user-visible
integrations (DeArrow, Return YouTube Dislike, volume boost), a full
Unhook-style clutter panel, and deeper network coverage.

### Added — anti-detect hardening
- **`Function.prototype.toString` mask.** Every hooked native (JSON.parse,
  fetch, XHR, Node.prototype.appendChild/insertBefore/replaceChild,
  Promise.prototype.then, window.setTimeout, navigator.serviceWorker.register,
  webpack chunk array push) now routes `.toString()` back to the original
  native source. YouTube's source-inspection-based detection paths see
  `function fetch() { [native code] }` — not our proxy.
- **ServiceWorker registration block.** `navigator.serviceWorker.register`,
  `getRegistration`, and `getRegistrations` are proxied so YouTube cannot
  install a service worker that would bypass our fetch/XHR proxies. SW-
  scoped ad beacons (`/api/stats/ads`, `/log_event`) now hit our hooks
  instead of flowing around them.
- **Webpack chunk array hook.** `self.webpackChunk_youtube_player.push`
  is intercepted at document-start. Module factories whose source matches
  ad-rendering signatures (`adPlacements`, `adBreakHeartbeatParams`,
  `onAbnormalityDetected`, `getAdBlockedState`, `playerLegacyDesktopWatchAdsRenderer`)
  are replaced with a no-op that fulfills the module contract without
  running the ad-rendering body.
- **Jittered nano-stb replacement delay.** The aggressive anti-stall
  path used to fire at a fixed 17ms (`0.001 * 17000`), which is itself a
  fingerprint. Replacement delay now jitters 8-45ms per invocation so
  the neutralization pattern is no longer deterministic.

### Added — UX integrations
- **DeArrow crowd-sourced titles & thumbnails** (off by default). Uses
  the same privacy-preserving hash-prefix API as SponsorBlock —
  `sha256(videoID).slice(0, 4)` only, never the full ID. Replaces titles
  and thumbnails on feeds and the watch page. 6-hour TTL + LRU cache.
- **Return YouTube Dislike** (off by default). Fetches archived vote
  counts and injects the dislike count under the like button on watch
  pages. 30-minute TTL + LRU cache, cookies stripped on fetch.
- **Volume boost up to 5x** (off by default). Web Audio
  `MediaElementSource → GainNode → destination` graph with a dedicated
  slider in the player controls. Persisted across SPA navs.

### Added — clutter-free mode (Unhook-style, all off by default)
- `Hide home feed`, `Hide Shorts shelves`, `Hide Shorts nav entries`,
  `Hide related videos`, `Hide comments`, `Hide end-screen cards`,
  `Hide live chat`, `Hide merch shelves`. Each is a pure CSS rule scoped
  to YT's own component tags — no runtime DOM removal that could race
  with the player.

### Added — channel + keyword blocklist
- Two local text-area editors in the Control Center. Channel matches
  are case-insensitive substring matches on channel name; keyword
  matches are substring matches on video title. Applied inside the
  existing `pruneObject` walk so every intercepted payload (fetch,
  XHR, JSON.parse) shares the same filter.
- **Shorts → /watch redirect** (off by default). Every `/shorts/VIDEO_ID`
  URL hard-redirects to `/watch?v=VIDEO_ID`.

### Added — network & payload coverage
- **Expanded prune keys** with `promotedSparklesWebRenderer`,
  `promotedVideoRenderer`, `compactPromotedVideoRenderer`,
  `compactPromotedItemRenderer`, `backgroundPromoRenderer`,
  `statementBannerRenderer`, `brandVideoShelfRenderer`,
  `brandVideoSingletonRenderer`, `inlineAdLayoutRenderer`,
  `adSlotRenderer`, `linkedInstreamAdRenderer`,
  `shoppingCarouselRenderer`, `merchandiseShelfRenderer`.
- **Expanded intercept patterns** with `/youtubei/v1/log_event`,
  `/youtubei/v1/att/get`, `/youtubei/v1/att/log`,
  `/youtubei/v1/reel_watch_sequence`, `/youtubei/v1/get_survey`,
  `/youtubei/v1/player/ad_break`.
- **Expanded cosmetic selectors** for `ytd-in-feed-ad-layout-renderer`,
  `ytd-banner-promo-renderer`, `ytd-promoted-video-renderer`,
  `ytd-compact-promoted-video-renderer`, `ytd-action-companion-ad-renderer`,
  `ytd-brand-video-shelf-renderer`, `ytd-brand-video-singleton-renderer`.
- **Expanded DNR rules** (8 new entries, 18 total): `||youtube.com/pagead/adview`,
  `||youtube.com/pagead/interaction`, `||youtube.com/pcs/activeview`,
  googlevideo `ctier=SR` (SABR-retry), googlevideo `initplayback?...adformat=`,
  `/youtubei/v1/log_event` (POST), `/youtubei/v1/att/log` (POST),
  `||youtube.com/generate_204`.

### Added — Control Center
- Two new live stat tiles: `DeArrow Replaced`, `Feed Filtered`.
- Three new sections: `Experience Enhancements`, `Clutter-Free Mode`,
  `Channels & Keywords`.
- Anti-Detection section gains `nativeToStringMask`, `serviceWorkerBlock`,
  `webpackChunkHook` toggles.
- Feature toggles for `volumeBoost`, `dearrow`, `returnYoutubeDislike`,
  `shortsRedirect` apply instantly without needing a page reload.

## [0.3.3] - 2026-04-22

### Changed
- **Removed placeholder branding assets.** The auto-generated `banner.png`,
  `favicon.ico`, `icon.svg`, and the top-level `icons/*.png` set have been
  deleted; they were ugly placeholders rather than considered branding and
  now live nowhere in the repo. The `icon.png` hero image that the README
  uses is retained.
- **Manifest no longer references the removed extension icons.** The MV3
  manifest's `icons` block and `action.default_icon` block were dropped so
  the extension still loads without the now-missing `extension/icons/*.png`
  files. Chrome and Firefox will render the browser default toolbar icon
  until a replacement branding set is commissioned and the manifest entries
  are restored.

### Fixed
- **CI drift guard.** CI now hard-fails when the committed
  `extension/main.js` does not match what `Build-Extension.ps1` produces
  from the current userscript. This closes the regression class where a
  userscript edit lands without the matching extension regeneration (the
  failure mode that left v0.3.2 shipping a v0.3.1 extension build before
  the hardening pass).
- **Version-lockstep regression tests.** The repo contract tests now assert
  that the userscript `@version`, userscript `SCRIPT_VERSION`, manifest
  version, generated `extension/main.js` `SCRIPT_VERSION`, and README
  version badge all agree, plus the generated build carries every required
  shim + bridge marker, plus the `@inject-into content` directive stays
  pinned.

## [0.3.2] - 2026-04-22

### Fixed
- **Script not detected as running in Tampermonkey MV3.** Added explicit `@inject-into content`
  directive so Tampermonkey unambiguously places the script in the content (isolated) execution
  context, where all `GM_*` APIs are available. Without this, some MV3 builds would silently
  skip injection when the sandbox context was ambiguous, causing the script to appear absent
  in the Tampermonkey dashboard even though the match pattern was correct. Users who installed
  on v0.1.1 and saw the "player blocked after 3 videos" popup should update — the iframe
  fetch-lift defense (added in v0.2.1) and this injection fix together resolve the issue.

## [0.3.1] - 2026-04-17

End-to-end hardening pass. No new features — every change either fixes a
real correctness, security, performance, or UX bug, or prevents a new
class of failure from reaching users.

### Fixed — correctness
- **Shorts-specific fast-path pruning now keeps URL context.** The
  fetch/XHR fast-reject helper was called without the request URL, so
  Shorts reel payloads that only exposed the `isAd` marker could bypass
  the cheap hint path and skip pruning entirely.
- **SponsorBlock race on fast navigation.** Previously, if the user
  navigated from video A to video B while A's segments were still being
  fetched, A's segments could be applied to B's `<video>` element — the
  handler checked `videoId` at apply time but `videoId` still pointed at
  A because the second nav's `loadSponsorSegments(B)` early-returned on
  the `loading=true` flag. Replaced with a token-based guard (`loadingToken`)
  plus a `pendingVideoId` queue, and an extra URL re-check at apply time.
  A second URL check inside the `timeupdate` handler prevents any stale
  segments from firing on a mismatched video.
- **Segment de-dup + duration clamping in SponsorBlock.** Overlapping
  segments are now deterministically resolved by `start` order; segments
  with non-finite `start`/`end` are rejected; a seek past `video.duration`
  is clamped to `duration - 0.01` to avoid browser-side seek refusals.
- **Stats type safety.** A corrupt `stats` value in GM storage (e.g.
  `blocked: "NaN"` from an older version) silently poisoned every future
  increment into `NaN`. `loadState` now coerces each key to a finite
  non-negative integer with `Math.floor(Number(...))`, and all writes
  route through a new `incrementStat(name, by)` helper that guards
  against the object being replaced at runtime.
- **Video-ad fast-forward left the video muted after ad end.** The old
  code set `video.muted = true` whenever `.ad-showing` was present but
  never restored the muted state on the ad → content transition,
  silencing the subsequent real video. Now tracks whether **we** muted
  (distinct from the user's own mute) and only restores in that case.
- **Stale filter cache is kept active, not discarded.** A cache past its
  4-hour TTL used to be dropped in favor of the built-in defaults while
  the background refresh ran, visibly losing custom coverage for the
  first seconds of every page load. The stale copy now stays active
  under a new `'stale'` filter source, while the refresh runs in the
  background — user never sees a coverage gap.
- **Panel surviving SPA navigation.** A YouTube SPA nav that rewrote
  `<body>` could detach the control-center overlay; the next open kept
  the stale reference and attached handlers to an orphan. `toggleSettings`
  now drops the reference when the overlay is no longer connected, so
  the next open rebuilds cleanly.

### Fixed — security / safety
- **Remote JSON filter payloads now go through the same sanitizer as
  parsed uBO lists.** Previously, a JSON-formatted remote list could
  bypass selector/path/key validation, exceed list caps, and smuggle
  unsafe selectors or malformed prune paths into cache. Cached filters
  are also re-sanitized on load now, so older or corrupted snapshots
  cannot silently reintroduce those risks.
- **CSS-injection guard on remote filter lists.** Cosmetic selectors are
  now validated against an allowlist (no `{`, `}`, `;`, `<`, `>`, CSS
  comment terminators, or newlines) and capped at 400 characters each,
  5000 cosmetic selectors total, 500 upsell selectors total. Without
  this, a malicious or compromised filter list could inject
  `background: url(//attacker.example/leak)` and exfiltrate request
  context via rendered CSS. The check runs in the parser *and*
  defensively again at CSS-generation time, covering both freshly
  parsed and cached-from-older-versions selectors.
- **Scriptlet argument allowlisting.** `setUndefined` and prune-key
  paths from remote lists now have to match `identifier(.identifier)*`
  before being applied; anything with brackets, spaces, or quotes is
  rejected. Caps: 500 prune keys, 500 setUndefined paths.
- **Filter-list DoS bounds.** Parser bails after 50000 input lines.
- **Extension bridge hardening.** The `ytab:page-request` CustomEvent
  listener (visible to any page-world script, not just ours) now only
  accepts writes to a single allowlisted key, debounces writes at
  150 ms, rejects payloads over 512 KB, and rejects IDs longer than
  64 chars. Cross-subdomain sync only forwards the allowlisted key so
  no unrelated extension storage shape can leak into untrusted code.

### Fixed — performance
- **Extension settings sync no longer needlessly rebuilds the Control
  Center.** Mirrored `chrome.storage.local` updates used to trigger a
  full settings-panel rebuild whenever the panel was open, even when the
  effective settings were unchanged. The sync handler now compares a
  small settings signature and only rebuilds on real changes, which
  avoids extra DOM churn while keeping live status and counters updated.

### Fixed — UX / release hardening
- **Rule Library messaging now matches the extension fetch model.** The
  Control Center and docs now explain that custom Rule Library URLs in
  the extension build work best when the host allows direct browser
  fetches from YouTube pages, instead of implying every raw list URL is
  equally reliable there.
- **CRX packaging in CI is pinned and key cleanup is automatic.** The
  optional GitHub Actions pack step now pins `crx3@2.0.0` and removes
  the temporary PEM on exit, which improves reproducibility and reduces
  the chance of the signing key lingering in the runner workspace.
- **XHR interception listener cleanup.** Readystatechange listeners are
  now removed once a request finishes, preventing unnecessary handler
  accumulation on reused XHR instances.
- **Fetch/XHR proxy fast-path.** A cheap substring scan (`responseTextMightContainAds`)
  skips the JSON parse + tree walk when the response body clearly has
  no ad field names, eliminating the bulk of wasted work on
  `/browse`, `/search`, `/next`, and `/guide` responses (typically
  hundreds of KB each, many per page). URL-scoped hints preserve the
  Shorts `isAd` path, which uses a key that isn't in `pruneKeys`.
- **Iframe bridge hot path.** Same-origin frames that have already been
  bridged carry a `__ytabBridged__` sentinel so repeat `contentWindow`
  reads become O(1) boolean checks instead of five reassignments; cross-
  origin frames are cached in a WeakMap so repeat reads don't keep
  triggering `cw.document`-access DOMExceptions. The cache is cleared
  on iframe `load` events so a frame that navigates between origins is
  re-probed.

### Fixed — UX
- **Sponsor-skipped metric tile.** Previously only surfaced in the
  small footer stats row; now sits in the main metric grid alongside
  Ads blocked / Responses pruned / SSAP skips. Grid switched to
  `auto-fit` so the count adapts to narrow panels.
- **Stale-filter status.** New `'Cached list (stale)'` source label
  surfaces when rules are being refreshed in the background.
- **Action-button reload fallback.** If the toolbar click arrives before
  the content script has loaded (common immediately after install),
  the service worker now reloads the tab instead of silently failing.
- **Extension settings mirror now rehydrates on fresh loads.** The
  isolated-world bridge now pushes the current `chrome.storage.local`
  snapshot into page storage at startup and flushes pending writes on
  `pagehide`, so settings changes follow users across `www`, `m`,
  `music`, and Kids surfaces more reliably.
- **Kids domain coverage.** Added explicit `www.youtubekids.com`
  coverage across userscript matches, MV3 content-script matches,
  context-menu targeting, and DNR initiator scoping.

### Fixed — CI / build
- **Release auto-create on tag push.** Previous workflow called
  `gh release upload --clobber` which errors out if the release doesn't
  already exist; now calls `gh release view` and only `create`s when
  needed. Tag version must match the manifest version.
- **Tag/manifest version mismatch is now a hard fail.**
- **Concurrency guard** cancels stale workflow runs on the same ref
  so two retries can't race the upload.
- **Build script self-check.** `Build-Extension.ps1` now verifies the
  generated file contains all the expected shim + command-hook
  markers, and runs `node --check` on the output if Node is on PATH.
- **Reusable CRX packer.** Added [Build-CRX.ps1](Build-CRX.ps1) so the
  repo can produce a signed Chromium `.crx` from the same generated
  extension folder while reusing a preserved private key in `dist/`.
- **Optional CRX release packaging in CI.** Tag builds now package and
  upload a `.crx` automatically when `CHROMIUM_EXTENSION_KEY_B64` is
  configured as a GitHub Actions secret, while still succeeding without
  that secret for zip/userscript-only releases.
- **Ship-zip excludes `extension/README.md`** (dev-facing) from the
  shipped archive.

### Fixed — small bugs
- Cosmetic selector exceptions now apply to upsell selectors too, not
  just the main cosmetic list.
- Iframe-bridge `load` listener re-fires on every document swap (was
  `{ once: true }` — a frame that swapped documents more than once
  lost coverage after the first swap).
- `inertRecords` restoration on panel close correctly handles elements
  added after open (no longer tries to unwind state it never set).

## [0.3.0] - 2026-04-17

### Added — SponsorBlock
- **Silent SponsorBlock auto-skip.** Queries the [SponsorBlock](https://sponsor.ajay.app/)
  community database via the privacy-preserving hash-prefix endpoint
  (only the first 4 hex chars of `sha256(videoID)` leave the client;
  local filtering matches the exact videoID). Silently seeks past
  segments tagged `sponsor`, `selfpromo`, `interaction`, `intro`,
  `outro`, `preview`, `music_offtopic`, and `filler` with `actionType`
  of `skip` or `full`. No toast, no panel nudge — just quiet skips.
  Handled on `timeupdate` with per-segment de-duplication to avoid
  ping-pong when a skip lands near another segment's leading edge.
- New `sponsorSkipped` counter added to the stats footer and diagnostics
  report so you can confirm it's working without adding any visible
  notification to the video.

### Added — Chrome / Firefox MV3 extension
- **Structured extension build** at [extension/](extension/). The same
  ad-blocking engine as the userscript plus MV3-native superpowers:
  - **declarativeNetRequest rules** at [extension/rules/network-blocks.json](extension/rules/network-blocks.json)
    block `/pagead/`, `/api/stats/ads`, `/youtubei/v1/player/ad_break`,
    `/get_midroll_info`, `/ptracking`, googlevideo `ctier=SA` segments,
    doubleclick.net and googlesyndication.com (from YouTube initiators
    only), googleadservices.com, and `/api/stats/atr` ad telemetry at
    the **browser network layer**, where no page-level anti-adblock
    countermeasure can see them.
  - **MAIN-world content script** at `world: "MAIN"` injects the engine
    directly into the page context at `document_start` — no iframe
    trick, no `<script>` element needed. Chrome 111+ / Firefox 128+.
  - **Isolated-world bridge** at [extension/bridge.js](extension/bridge.js)
    mirrors settings into `chrome.storage.local` so a setting change
    on `www.youtube.com` propagates to `m.youtube.com` and
    `music.youtube.com` on the next load.
  - **Service worker** at [extension/background.js](extension/background.js)
    handles the toolbar action button, a 3-item right-click context
    menu ("Open control center / Pause-resume / Refresh rules"), and
    three keyboard commands including a default `Ctrl+Shift+Y` to open
    the panel.
- **One-shot build script** [Build-Extension.ps1](Build-Extension.ps1)
  converts [YoutubeAdblock.user.js](YoutubeAdblock.user.js) (single
  source of truth) into [extension/main.js](extension/main.js) by
  stripping the `==UserScript==` header, injecting `GM_*` shims
  (`localStorage` + `chrome.storage.local` mirror, `fetch`-backed
  `GM_xmlhttpRequest`), and wiring command-bridge listeners.
  Windows-first workflow, no build chain needed.

### Notes
- SponsorBlock fetches use `GM_xmlhttpRequest` in the userscript and
  native `fetch` in the extension build. Both endpoints
  (`sponsor.ajay.app`, `raw.githubusercontent.com`) send
  `Access-Control-Allow-Origin: *`, so the extension doesn't need a
  background-script proxy.
- The extension's DNR rules are additive, not a replacement for the
  page-level engine. Together they defend at three layers: network
  request (DNR), payload (JSON.parse/fetch/XHR proxies), and render
  (cosmetic CSS + enforcement-popup pruning).

## [0.2.1] - 2026-04-17

### Added
- **Iframe fetch-lift defense.** YouTube's 2026 anti-adblock pattern lifts
  pristine `fetch` / `XMLHttpRequest` / `JSON.parse` out of a freshly
  inserted same-origin iframe and uses that unhooked copy for ad delivery.
  `appendChild`, `insertBefore`, and `replaceChild` are now all proxied,
  and the `HTMLIFrameElement.prototype.contentWindow` getter is wrapped
  so every read rebridges our hooks into the child window. Cross-origin
  iframes are skipped (access throws, and YT can't lift usable globals
  across origins either). Only the network/parsing APIs are bridged —
  `Promise` and `setTimeout` are left alone so legitimate same-origin
  iframes aren't affected.
- **Aggressive anti-stall** (new anti-detection toggle). Targets the same
  bound-`setTimeout(…, 17000)` profile that uBO's `nano-stb, [native code],
  17000, 0.001` quick-fix rule hits. Narrowed to `delay === 17000` exactly
  (not the 16000–18000 window the marker-based neutralizer uses) to keep
  false-positives low on legitimate 17s bound timers. Disabled in the
  normal neutralizer path, so turning the toggle off restores v0.2.0
  behavior.
- **Video ad fast-forward** (new last-resort toggle). If the prune/intercept
  layers miss a payload and a client-side ad actually starts playing, the
  `.ad-showing` class on `#movie_player` triggers mute + 16x playback rate
  on the `<video>`, shaving unskippable ads to under a second without
  relying on `seekTo` (which YT can reject on some ad surfaces).
- **Wider pruneKey coverage.** Built-in filters now strip
  `adBreakHeartbeatParams`, `frameworkUpdates`, `responseContext.adSignalsInfo`,
  `playerResponse.adBreakHeartbeatParams`, and
  `(playerResponse.)auxiliaryUi.messageRenderers.upsellDialogRenderer` from
  every parsed response. `/youtubei/v1/guide` is now in the intercept
  patterns so the enforcement-popup payload is caught before it leaves
  the network layer, not just by cosmetic CSS after render.
- **Enforcement-popup cosmetic fallback.** `ytd-enforcement-message-view-model`
  and its `tp-yt-paper-dialog` wrapper are hidden by default if pruning ever
  lets one through.

### Notes
- The iframe `contentWindow` getter wrap is best-effort — if another
  script (e.g. another adblock userscript) has already locked the getter
  non-configurable, YoutubeAdblock skips it silently and the node-insertion
  proxies still cover the common path.
- Aggressive anti-stall only fires on bound/native functions at exactly
  17000 ms. If you see unrelated 17 s features running too fast, turn it
  off in the control center.

## [0.2.0] - 2026-04-17

### Added
- Background content becomes `inert` + `aria-hidden` while the control center
  is open so keyboard users and screen readers stay inside the dialog.
  Previously-set state on YouTube nodes is preserved and restored on close,
  rather than clobbered.
- Menu-triggered "Open Control Center" now builds the panel on demand if the
  user picks it before DOMContentLoaded; previously a no-op.
- Diagnostics report now includes timestamp, user agent, trapped roots,
  prune-key count, cosmetic selector count, and intercept patterns —
  enough context to triage a bug report without a follow-up.
- URL input preserves in-progress typing across settings panel rebuilds
  (feature toggles used to wipe the user's unsaved edit).
- Toast cap (4 visible) plus input-type sanitization so transient error
  bursts don't fill the viewport.
- Focus trap now pulls focus back into the panel if it escapes, not just on
  wrap-around.
- Feature toggles now expose `role="switch"` with `aria-checked` so
  assistive tech announces on/off state instead of generic tick/untick.
- Property traps now eagerly prune any already-populated root at install
  time, so ad fields a page-inline `<script>` committed before our trap
  installed no longer reach the first paint.
- SSAP polling pauses while the tab is hidden.
- Toggle inputs now carry `aria-describedby` pointing at the visible
  description so AT users hear *what the switch does*, not just its short
  label.
- Rule-source fetch errors now surface the underlying reason (`HTTP 404`,
  `exceeds 5MB limit`, `Invalid JSON filter schema`) rather than a generic
  "could not be parsed".
- `safeOverride` now logs one warning per locked property when another
  script has made the target non-configurable — helps diagnose conflicts
  with other YouTube adblock userscripts.
- `matchesInterceptPattern` compiles its patterns into a single RegExp
  once per-array-identity, replacing N `String#includes` iterations per
  request with a single regex match.
- A `<head>`-scoped `MutationObserver` re-applies the cosmetic stylesheet
  if YouTube or a detection script removes it. Observer is lazily attached
  on first cosmetic update so we don't spend the MutationObserver budget
  before the stylesheet actually matters.
- Overlay `aria-hidden` is now **removed** rather than set to `"false"`
  when the dialog opens — explicit `aria-hidden="false"` conflicts with
  ancestor inheritance in some assistive tech.
- Feature counts (`Modules enabled`, `N/M on` pills) now count the
  canonical feature set rather than whatever keys a cached filter payload
  happens to carry. A stale cache with orphan keys no longer inflates
  the displayed module count.
- `Intl.NumberFormat` and `Intl.DateTimeFormat` are now lazily
  instantiated once and reused. Previously every stats tick and every
  chip re-render constructed a new formatter.

### Fixed
- **Property traps now cover every declared path.** The previous implementation called `Object.defineProperty` on `window.ytInitialPlayerResponse` once per configured path, so only the first (`playerAds`) succeeded and `adPlacements`, `adSlots`, and `adBreakHeartbeatParams` were never trapped. Paths are now grouped by root and handled together.
- **Timer neutralization no longer breaks YouTube's own 17s callbacks.** The old heuristic matched `[native code]` (which every bound function prints) and any callback shorter than 50 characters; both fired legitimate timers at 1ms. The tightened rule only fires on callbacks containing known anti-adblock markers (`onAbnormal`, `adBlock`, `abnormalityDetected`) and ignores bound/native functions entirely.
- **XHR proxy honors `responseType='json'`.** Previously, rewriting the response handed callers a string when they had requested an object, breaking YouTube code paths that parse by responseType. The proxy now inspects `responseType` and serializes/parses appropriately; binary responseTypes are skipped.
- **Blocked counter no longer inflates.** Fetch interception incremented the counter on every intercepted URL (not just actual blocks) and double-counted via the already-proxied `JSON.parse`. The fetch and XHR proxies now bypass the JSON.parse proxy using a captured original and only count actual rewrites.
- **Shorts ad pruning is scoped by URL.** The prior implementation filtered any parsed JSON containing an `entries` array, which could silently remove non-ad entries from unrelated YouTube payloads. Shorts pruning now only runs when the URL matches `reel_watch_sequence` / `/reel`.
- **Remote filter updates now re-apply property traps.** New roots introduced by remote rules get guarded, and new subpaths on already-trapped roots are picked up via a shared mutable map instead of being closed over statically.
- **Cosmetic stylesheet self-heals after SPA nav.** The cached reference is now validated with `isConnected` before reuse so a `<head>` rewrite no longer freezes cosmetic cleanup.
- **Focus and scroll preserved across settings rebuilds.** Toggling a feature no longer yanks keyboard focus to the top of the panel.
- **Pause/Resume menu command now reflects current state.** The label is re-registered whenever protection is toggled (where `GM_unregisterMenuCommand` is available).
- **Filter URL validated on load.** A corrupted saved value is silently replaced with the default instead of stranding the user with a broken source.

### Performance
- SSAP auto-skip replaced `MutationObserver` on the whole document (firing thousands of times per second on YouTube) with a 1-second poll of the player's debug info.
- `Promise.prototype.then` abnormality check now caches decisions per-function in a `WeakSet`, so hot Promise chains avoid repeat `Function.prototype.toString` calls.
- Stats persistence is debounced by 2s so fast-firing ad-pruning paths no longer touch GM storage on every object.
- The panel stats refresh loop only repaints while the control center is open.
- `replaceAdKeys` caches its compiled RegExp array by source and reuses it across all fetch/XHR interceptions.
- Three internal `JSON.parse` call sites (filter fetch, outbound fetch body rewrite, outbound XHR body rewrite) now bypass our own JSON.parse proxy via a captured original, avoiding unnecessary re-entry into `pruneObject` on payloads that definitionally contain no ad keys.

### Security / safety
- Remote filter lists are now capped at 5MB and the HTTP status is verified before parsing; malformed or oversized responses are rejected.
- `@connect *` added so users who configure a custom filter URL on a non-GitHub host can actually fetch it (previously blocked by Tampermonkey's connect policy).
- Fetch proxy skips rewriting non-JSON responses by inspecting `Content-Type`, reducing the chance of mangling unintended payloads.
- Rewritten responses strip `Content-Length` so strict consumers reading the declared length against the new payload don't see a mismatch.
- `GM_getValue`/`GM_setValue` are wrapped in try/catch; a corrupted key or quota rejection no longer throws past the caller.
- XHR proxy coerces the `url` arg to a string so a `URL` instance passed to `open()` (legal per spec) cannot trip `String#includes`.

### UX
- Expanded `interceptPatterns` to match the endpoints the README advertises (`/youtubei/v1/browse`, `/search`, `/next`).
- Cache-busting query string now correctly joins with `&` when the URL already contains `?`.

### Chore
- `@downloadURL` / `@updateURL` / `@homepageURL` / `@supportURL` now use canonical repo casing (`YoutubeAdblock`).
- Dropped the unused `networkBlocks` accumulator and the unused `shortsAdPrune` field from `DEFAULT_FILTERS`.

## [0.1.1] - 2026-04-16

- Added a redesigned in-product control center with stronger hierarchy, live status, diagnostics, and calmer feedback states.
- Added a real master switch, runtime-safe feature toggles, timer neutralization controls, and better rule-source refresh handling.
- Added first-run guidance plus extra userscript menu commands for opening the control center, pausing or resuming protection, and refreshing rules.
- Improved destructive-action UX by replacing native confirmation prompts with an in-context two-step confirmation flow.
- Refined the README and changelog so onboarding, configuration, and versioning better match the current product surface.

## [0.0.3]

- Earlier repository snapshot before the 0.1.x control-center and UX refinement work.
