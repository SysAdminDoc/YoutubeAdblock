# Research — YoutubeAdblock

Snapshot date: 2026-08-13. Confidence labels are `Verified`, `Likely`, or `Needs live validation`.

## Executive Summary

YoutubeAdblock remains the right project for a focused zero-ad pass. It is the only sibling repository whose primary job is blocking YouTube ads across both userscript and generated MV3-extension builds. Astra Deck overlaps in SponsorBlock, DeArrow, dislike counts, filtering, and general YouTube enhancements, but its 200+ feature surface makes it a broader product rather than the canonical blocker. Chapterizer, WolfPack, YT Reaction Spammer, and the YouTube MCP server have narrower, non-blocking roles. No sibling repository was edited.

This pass verified the current desktop YouTube family, repaired four concrete compatibility gaps, redesigned the real Control Center from an ImageGen reference, and added both deterministic fixtures and an isolated live unpacked-extension smoke. The strongest new network proof is extension-specific: Playwright Chromium 149 loaded the unpacked build, reported `ytab-network-blocks` enabled, rejected a real `https://www.google.com/pagead/lvz` image request with `net::ERR_BLOCKED_BY_CLIENT`, and showed no visible or audible ad state. Live signed-session recon independently confirmed the current request and DOM surface, but ad creative was not served in that session and several ad hosts were already DNS-blocked by the browser environment. Those observations must not be presented as proof that every account, region, or experiment is ad-free.

## Repository and Sibling Inventory

| Project | Role | Overlap with YoutubeAdblock | Decision |
| --- | --- | --- | --- |
| `YoutubeAdblock` | Focused userscript + generated MV3 YouTube blocker | Canonical zero-ad engine, filters, DNR, diagnostics | Selected and edited |
| `Astra-Deck` | Large desktop YouTube enhancement suite | SponsorBlock, DeArrow, estimated dislike counts, filtering, some zero-ad checks | Kept separate; broader product and release graph |
| `Chapterizer` | Local chapter generation, transcript analysis, silence/filler skipping | Player/SPA hooks only | No blocking ownership |
| `WolfPack` | LibreWolf distribution with uBO/SponsorBlock and a small RYD userscript | Distribution and duplicate RYD utility | No source merge |
| `yt-reaction-spammer` | Live-chat reaction automation | YouTube live-chat DOM only | Unrelated to blocking |
| `_vet-youtube-mcp` | YouTube Data/Analytics/Reporting MCP server | YouTube APIs only | Unrelated to page blocking |

## Live Desktop Recon

The built-in in-app browser was used at 1440×900 with its existing signed-in session. It was not used to load the local extension. A separate headless Playwright profile was used for the unpacked-extension check so no physical display or personal browser profile was touched.

| Surface | Current roots and hooks observed | Network/ad observations | Status |
| --- | --- | --- | --- |
| Main home/search | `ytd-app`, rich-grid/search renderers, SPA navigation | Search emitted DoubleClick/pagead/ad-status requests; no rendered ad node in this account | Verified shell and SPA lifecycle |
| Watch | `ytd-watch-flexy`, `ytd-player #movie_player`, `video.html5-main-video`, owner, comments, related, `.ytp-right-controls` | `googleads.g.doubleclick.net/pagead/id`, `static.doubleclick.net/instream/ad_status.js`, `www.google.com/pagead/lvz`, and `youtube.com/generate_204` were observed; some failed at DNS before the script | Verified selectors; creative not served |
| Shorts | `ytd-shorts`, reel renderer, Shorts player; first of two video nodes was visible | No creative served | Verified shell/player selection |
| YouTube Music | `ytmusic-app`, `ytmusic-player`, `ytmusic-player-bar #volume-slider`; no `.ytp-right-controls` | DoubleClick/ad-status requests attempted and failed at DNS | Verified; exposed volume-control insertion gap |
| YouTube TV | `ytu-app-vessel`; hidden `ytu-ads-title-tray` nodes present | 40 `/youtubei/v1/tenx_player` requests on cold load plus browse/log/att traffic | Verified; exposed missing endpoint/cosmetic coverage |
| YouTube Kids | Public setup screen with “I’m a kid” / “I’m a parent” | Parental setup was intentionally not changed | Setup shell verified; playback needs validation |
| No-cookie embed | Direct embed returned player Error 153 without a referrer | No playback proof | Needs a referrer-bearing host fixture/live page |

Search-to-watch navigation produced `Page.navigatedWithinDocument`, confirming that `yt-navigate-finish` and SPA-safe reapplication remain required. The current watch DOM also contained three dislike controls: the first and third were hidden and only the middle one was rendered. A plain `querySelector` therefore targeted the wrong RYD button.

## Ad-Delivery and Tracking Map

| Layer | Current signal | Handling after this pass |
| --- | --- | --- |
| External ad hosts | DoubleClick, Google Syndication, Google Ad Services, and `google.com/pagead/*` | Extension DNR blocks them for YouTube initiators; userscript fetch/XHR guard now short-circuits ad-exclusive URLs with native-compatible empty JSON responses |
| YouTube ad paths | `/pagead/`, `/api/stats/ads`, `/api/stats/atr`, `/pcs/activeview`, `/get_midroll_info`, `/ptracking`, `/youtubei/v1/player/ad_break` | DNR and userscript guard coverage retained/expanded |
| Player data | `/youtubei/v1/player`, `/get_watch`, and TV `/tenx_player` payloads | Additive no-ad request flag plus response pruning; TV endpoint added to the canonical typed source |
| Media manifests | googlevideo `ctier=SA` / `ctier=SR` and `initplayback?...adformat=` | DNR blocks known media URLs; userscript scrubs text DASH/HLS as fallback |
| Page containers | Desktop ad renderers, player ad modules, promotions, TV `ytu-ads-title-tray` | Signed cosmetic list and built-in fallback; TV tray added |
| Mixed telemetry | `/youtubei/v1/log_event`, `/youtubei/v1/att/log`, `generate_204` | Existing extension DNR remains intentionally aggressive. The new userscript guard does not swallow these mixed-purpose endpoints, avoiding a broader page-world regression |
| Server-side insertion | `serverStitchedAd`, SSAP/SSAI markers | Detection/warning only; safe automatic removal still needs real marker captures |

## Defects and Repairs

1. `Verified` — Google’s current `www.google.com/pagead/lvz` image path was not covered. Added a YouTube-initiator DNR rule and matching userscript ad-exclusive request classifier.
2. `Verified` — YouTube TV uses `/youtubei/v1/tenx_player` and exposes `ytu-ads-title-tray`. Added the endpoint to request rewriting/interception and the tray to cosmetic cleanup.
3. `Verified` — Return YouTube Dislike selected the first duplicate button even when hidden. Added rendered-element selection and a three-button regression fixture.
4. `Verified` — YouTube Music lacks `.ytp-right-controls`, so volume boost had no insertion point. Added a `ytmusic-player-bar #volume-slider`-anchored control with an accessible range label.
5. `Verified` — Settings notifications could overlap or consume the panel during bursts. Notices now live inside the dialog, retain only the latest message there, and return to the page-level region on close.
6. `Verified` — The old narrow Control Center did not fit the density or hierarchy of the feature set. The implemented desktop shell now uses a persistent section rail, overview metrics, search, explicit saved/sync status, dark/light tokens, and viewport-bounded scrolling.
7. `Verified` — The release gate generated a fresh CRX key when the historical private key was missing, then failed only after producing an artifact with a different extension ID. The safe default is now userscript + ZIP; CRX packaging refuses a missing pinned-ID key, verifies identity before publishing the artifact, and remains explicitly blocked until the matching private key is recovered or a deliberate migration is approved.
8. `Verified` — Windows PowerShell 5 writes `Set-Content -Encoding UTF8` with a BOM, which made Node reject generated provenance JSON. The gate now writes that file through a BOM-free `UTF8Encoding` and has a repository-contract assertion for it.

## Verification Matrix

The product has one settings route/dialog rather than ten separate pages. Its ten rail destinations reuse one shell and component system, so one selected full-dialog mockup is the correct distinct-page reference. The browser matrix now clicks every destination in both userscript and generated-extension modes and verifies its semantic section, disclosure state, and sole active-navigation state.

| Destination | Material controls/state | Parity/functional status |
| --- | --- | --- |
| Overview | master switch, source/sync facts, seven counters, quick actions | Verified dark/light and 1440/1920 desktop |
| Rule Library | source URL, recommended reset, integrity/version/coverage pills, refresh errors | Verified navigation and signed fixture refresh |
| Core Blocking | JSON, fetch, XHR, and property-trap toggles | Verified section/disclosure and persisted toggles |
| Anti-Interference | request flag, bypass, SSAP, timers, fast-forward, native masking, worker/webpack controls | Verified section/disclosure |
| Ad & Overlay Cleanup | player-ad fallback plus cosmetic/upsell/Shorts cleanup | Verified section/disclosure |
| SponsorBlock | community segment toggle, attribution, permission/cooldown states | Verified section/disclosure; live segments not forced |
| Enhancements | DeArrow, RYD, original audio, volume boost | Verified; RYD rendered duplicate and Music volume rail exercised |
| Interface Cleanup | desktop feed/related/comments/chat/merch and other clutter toggles | Verified section/disclosure |
| Focus & Filters | Shorts redirect, channel/keyword/whitelist/duration/ad-allow lists, import/export | Verified section/disclosure and block-channel write |
| Diagnostics | injection health, copy, issue link, counters, restore-default confirmation | Verified section/disclosure and recovery placement |

Selected ImageGen reference: `design/mockups/control-center-desktop-dark-v1.png`. Current implementation renders: `design/screenshots/control-center-desktop-dark-v0.5.21.png` and `design/screenshots/control-center-desktop-light-v0.5.21.png`.

| Evidence | Result | What it proves |
| --- | --- | --- |
| Pure engine and repository contracts | Pass | URL classification, TV endpoint/source parity, RYD visible duplicate selection, version/build/filter contracts |
| Browser fixture matrix | Pass in userscript and generated-extension modes on main dark/light/wide, Music, TV, and Kids | Control Center behavior, navigation, theme, settings toggles, Music volume insertion, RYD duplicate handling, no console errors |
| Browser-level fetch/XHR leak probe | Pass | Ad-only DoubleClick fetch and Google pagead XHR are answered locally and never reach Playwright routing |
| Live unpacked extension | Pass, Playwright Chromium 149 | Actual packaged extension loads; static DNR ruleset is enabled; pagead image probe is blocked by the browser; no visible/audible ad state |
| Local release gate | Pass for userscript + ZIP | Generated source, 136 passing tests plus one gated skip, signed data, ZIP paths/content, provenance, and checksums agree |
| Built-in-browser signed-session recon | Pass for surface discovery | Current DOM/request names and SPA lifecycle across main, Music, Shorts, TV, and Kids setup |
| Real ad creative across accounts/regions | Not observed | Needs a non-Premium/signed-out matrix where YouTube actually returns pre-roll, mid-roll, overlay, and feed creative |
| Real Tampermonkey/Violentmonkey/Safari manager installs | Not run | Requires manager-specific desktop environments; fixture mode is not a substitute |
| Stable-ID CRX v0.5.21 | Blocked before packaging | Historical private key for pinned ID `jpeojodihepmkpdhibnnbgamnakclnnj` is not present; rotating identity is not an automatic repair |

## Architecture and Product Assessment

- Keep `YoutubeAdblock.user.js` canonical and `extension/main.js` generated. The one-file userscript remains distribution-friendly, while pure helpers and bridge/background contracts provide test seams.
- Preserve the layered model: browser DNR first in extension builds, then document-start request/data pruning, targeted cosmetics, and media fast-forward only as the final safety net.
- Keep remote inputs as signed, parsed data. Chrome Web Store MV3 policy disallows remotely supplied executable logic, and Greasy Fork requires the primary inspectable functionality to remain in the posted script.
- Keep ad-only URL blocking narrow in page-world code. `log_event` and `generate_204` carry mixed telemetry; broad synthetic responses there could hide regressions. Extension policy can remain more aggressive because its current product promise includes tracking suppression, but matched-rule diagnostics should make that behavior observable.
- Avoid merging Astra Deck. Shared concepts are useful comparison points, but cross-repo coupling would expand the blocker’s risk surface and release complexity.

## Competitive and Platform Findings

- Chrome and Firefox both evaluate MV3 Declarative Net Request rules in the browser rather than routing request contents through extension JavaScript. Static rules must be packaged and validated; unpacked Chrome exposes feedback APIs useful for testing.
- uBlock Origin/uAssets and AdGuard treat YouTube as a continuously maintained filter problem. Their useful pattern is layered network rules plus tightly scoped response/scriptlet transforms and rapid breakage triage—not a single permanent selector list.
- uBO’s `json-prune`, fetch-response, and XHR-response primitives validate this project’s response-pruning architecture, while its safety model reinforces rejecting executable or dangerous remote scriptlets.
- SponsorBlock remains a separate community-data product with its own API, dataset, and rate constraints. Hash-prefix reads and explicit attribution remain preferable to full video-ID lookups or automated write paths.
- Greasy Fork permits external non-executable JSON/CSS data but requires primary functionality to remain readable, non-obfuscated, and in the posted script. The signed filter/signature files fit that model; remote executable rules would not.

## Rejected or Deferred Ideas

- General-purpose all-site blocking, a separate YouTube client, or Android patch distribution: outside this focused repo.
- Automated SponsorBlock/DeArrow submissions or voting: identity, moderation, rollback, and abuse handling are not present.
- Blind blocking of every `log_event`-like request in the userscript: too much mixed-purpose regression risk without per-request evidence.
- Automatic SSAI seeking from inferred timing: unsafe until real stitched-ad marker schemas and offset behavior are captured.

## Exact Next Investigations

1. Run a signed-out/non-Premium account and regional matrix until real pre-roll, mid-roll, overlay, feed, Shorts, Music, TV, Kids, and embed creative is served; preserve sanitized HAR-like endpoint/schema notes and add a fixture for each new shape.
2. Run actual desktop Tampermonkey on Chrome and Violentmonkey on Firefox, record document-start health, and compare network/DOM results to the unpacked extension.
3. Host a `youtube-nocookie.com/embed/*` player inside a real referrer-bearing test page to distinguish Error 153 from blocker behavior.
4. Complete YouTube Kids parental setup in a disposable test profile, then validate browse/watch/ad surfaces without changing a personal family configuration.
5. Add extension-only DNR matched-rule counts/IDs to diagnostics when the browser exposes feedback APIs, keeping all non-YouTube URLs out of reports.
6. Capture a real `serverStitchedAd`/SSAI session before implementing any SponsorBlock offset correction or automatic seek.
7. Recover the private CRX key matching `extension/extension-id.txt`; if it is permanently lost, plan an explicit extension-ID/storage/update migration rather than silently accepting a new key.

## Sources

Primary platform and distribution:

- https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest
- https://greasyfork.org/en/help/code-rules
- https://greasyfork.org/en/help/external-scripts

Primary project and competitor material:

- https://github.com/uBlockOrigin/uAssets
- https://github.com/gorhill/uBlock/wiki/Resources-Library
- https://github.com/gorhill/uBlock/wiki/static-filter-syntax
- https://github.com/AdguardTeam/AdguardFilters
- https://github.com/ajayyy/SponsorBlock
- https://github.com/Anarios/return-youtube-dislike

Local evidence:

- `tests/browser-smoke.test.mjs`
- `tests/live-extension-smoke.test.mjs`
- `dist/live-extension-smoke.json` (generated, ignored)
- `design/mockups/control-center-desktop-dark-v1.png`
