// ==UserScript==
// @name         YoutubeAdblock
// @namespace    https://github.com/SysAdminDoc
// @version      0.5.19
// @description  YouTube ad blocker with remote rules, anti-detect hardening, toString-hiding proxies, DeArrow + RYD, volume boost, UI cleanup, and an in-page Control Center
// @author       SysAdminDoc
// @license      MIT
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://music.youtube.com/*
// @match        https://tv.youtube.com/*
// @match        https://www.youtube-nocookie.com/*
// @match        https://youtubekids.com/*
// @match        https://www.youtubekids.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @inject-into  content
// @run-at       document-start
// @connect      raw.githubusercontent.com
// @connect      github.com
// @connect      githubusercontent.com
// @connect      cdn.jsdelivr.net
// @connect      sponsor.ajay.app
// @connect      dearrow-thumb.ajay.app
// @connect      returnyoutubedislikeapi.com
// @connect      *
// @homepageURL  https://github.com/SysAdminDoc/YoutubeAdblock
// @supportURL   https://github.com/SysAdminDoc/YoutubeAdblock/issues
// @downloadURL  https://raw.githubusercontent.com/SysAdminDoc/YoutubeAdblock/main/YoutubeAdblock.user.js
// @updateURL    https://raw.githubusercontent.com/SysAdminDoc/YoutubeAdblock/main/YoutubeAdblock.user.js
// ==/UserScript==

(function() {
    'use strict';

    /* =========================================================================
     * CONSTANTS & CONFIG
     * ===================================================================== */

    const SCRIPT_NAME = 'YoutubeAdblock';
    const SCRIPT_VERSION = '0.5.19';
    const PROJECT_URL = 'https://github.com/SysAdminDoc/YoutubeAdblock';
    const ISSUES_URL = `${PROJECT_URL}/issues`;
    const FILTER_URL_DEFAULT = 'https://raw.githubusercontent.com/SysAdminDoc/YoutubeAdblock/refs/heads/main/youtube-adblock-filters.txt';
    const FILTER_MANIFEST_URL_DEFAULT = 'https://raw.githubusercontent.com/SysAdminDoc/YoutubeAdblock/refs/heads/main/youtube-adblock-filters.manifest.json';
    const FILTER_SIGNATURE_URL_DEFAULT = 'https://raw.githubusercontent.com/SysAdminDoc/YoutubeAdblock/refs/heads/main/youtube-adblock-filters.txt.sig';
    const WEBPACK_SIGNATURE_URL_DEFAULT = 'https://raw.githubusercontent.com/SysAdminDoc/YoutubeAdblock/refs/heads/main/webpack-ad-signatures.json';
    const FILTER_PUBLIC_KEY_BASE64 = 'MCowBQYDK2VwAyEAdkjPuIDzXFI9UPn5w4t4selqoqbT4WCinGI58a2/a6E=';
    const FILTER_URL_MIRRORS = [
        'https://cdn.jsdelivr.net/gh/SysAdminDoc/YoutubeAdblock@main/youtube-adblock-filters.txt',
    ];
    const FILTER_MANIFEST_URL_MIRRORS = [
        'https://cdn.jsdelivr.net/gh/SysAdminDoc/YoutubeAdblock@main/youtube-adblock-filters.manifest.json',
    ];
    const FILTER_SIGNATURE_URL_MIRRORS = [
        'https://cdn.jsdelivr.net/gh/SysAdminDoc/YoutubeAdblock@main/youtube-adblock-filters.txt.sig',
    ];
    const FILTER_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
    const FILTER_MAX_BYTES = 5 * 1024 * 1024; // 5MB safety cap on remote lists
    const FILTER_FETCH_TIMEOUT_MS = 15000;
    const SSAP_POLL_INTERVAL_MS = 1000;
    const STATS_PERSIST_INTERVAL_MS = 2000;
    const STATS_UI_REFRESH_MS = 5000;
    const CSS_PREFIX = 'ytab';
    const IS_EXTENSION_BUILD = typeof __YTAB_STORAGE_KEY !== 'undefined';
    const SCRIPT_EVAL_READY_STATE = (typeof document !== 'undefined' && document.readyState) ? document.readyState : 'unknown';
    const SCRIPT_EVAL_ELAPSED_MS = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? Math.round(performance.now())
        : null;
    const LATE_INJECTION_THRESHOLD_MS = 1500;
    const DEFAULT_STATS = {
        blocked: 0,
        pruned: 0,
        ssapSkipped: 0,
        sponsorSkipped: 0,
        dearrowReplaced: 0,
        feedFiltered: 0
    };
    const SPONSORBLOCK_API = 'https://sponsor.ajay.app/api/skipSegments';
    const SPONSORBLOCK_CATEGORIES = [
        'sponsor', 'selfpromo', 'interaction',
        'intro', 'outro', 'preview',
        'music_offtopic', 'filler'
    ];
    const SPONSORBLOCK_TIMEOUT_MS = 10000;
    const DEARROW_API = 'https://sponsor.ajay.app/api/branding';
    const DEARROW_TIMEOUT_MS = 10000;
    const DEARROW_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
    const DEARROW_CACHE_MAX = 400;
    const RYD_API = 'https://returnyoutubedislikeapi.com/votes';
    const RYD_TIMEOUT_MS = 8000;
    const RYD_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
    const RYD_CACHE_MAX = 200;
    const VOLUME_BOOST_MAX = 5; // hard cap — beyond this audio clips badly
    const SECTION_IDS = {
        overview: `${CSS_PREFIX}-section-overview`,
        rules: `${CSS_PREFIX}-section-rules`,
        core: `${CSS_PREFIX}-section-core`,
        anti: `${CSS_PREFIX}-section-anti`,
        cleanup: `${CSS_PREFIX}-section-cleanup`,
        sponsor: `${CSS_PREFIX}-section-sponsor`,
        enhance: `${CSS_PREFIX}-section-enhance`,
        clutter: `${CSS_PREFIX}-section-clutter`,
        blocklist: `${CSS_PREFIX}-section-blocklist`,
        diagnostics: `${CSS_PREFIX}-section-diagnostics`
    };
    const STRINGS = {
        common: {
            none: 'none',
            unknown: 'unknown',
            never: 'never',
            notInstalled: 'not installed',
            notSyncedYet: 'Not synced yet',
            unknownShort: '?'
        },
        sites: {
            youtube: 'YouTube',
            music: 'YouTube Music',
            tv: 'YouTube TV',
            mobile: 'YouTube Mobile',
            noCookie: 'YouTube No-Cookie',
            kids: 'YouTube Kids'
        },
        surfaces: {
            watch: 'Watch Page',
            shorts: 'Shorts Feed',
            search: 'Search Results',
            playlist: 'Playlist',
            subscriptions: 'Subscriptions',
            history: 'History',
            library: 'Library',
            channel: 'Channel',
            live: 'Live Stream',
            browse: 'Browse',
            home: 'Home',
            current: 'Current Page'
        },
        access: {
            toolbarButton: 'Toolbar Button',
            userscriptMenu: 'Userscript Menu',
            extensionHint: 'Click the toolbar button from any YouTube tab. Optional shortcuts can be bound in browser extension settings.',
            userscriptHint: 'Open the Control Center from your userscript manager menu any time.'
        },
        filters: {
            sourceLabels: {
                remote: 'Remote list',
                cached: 'Cached list',
                stale: 'Cached list (stale)',
                'built-in': 'Built-in fallback',
                custom: 'Custom source'
            },
            integrityLabels: {
                verified: 'Verified',
                'unsigned-custom': 'Unsigned Custom',
                failed: 'Verification Failed',
                cached: 'Cached',
                'built-in': 'Built-In',
                unknown: 'Unknown'
            },
            cachedIntegrityMessage: 'Cached rules are active; refresh to re-check signature status.',
            builtInIntegrityMessage: 'Built-in fallback rules are bundled with the script.',
            signedCompanionsUnavailable: 'Signed filter companion URLs are unavailable.',
            signedManifestInvalid: 'Signed filter manifest is invalid.',
            signedByteMismatch: 'Signed filter byte count does not match the downloaded list.',
            signedHashMismatch: 'Signed filter hash does not match the downloaded list.',
            signedVerificationFailed: 'Signed filter verification failed.',
            webCryptoShaUnavailable: 'WebCrypto SHA-256 is unavailable.',
            webCryptoEd25519Unavailable: 'WebCrypto Ed25519 verification is unavailable.',
            defaultVerified: updated => `Default Rule Library verified with Ed25519${updated ? ` (${updated})` : ''}.`,
            customSourceLoadedWithoutSignature: 'Custom Rule Library source loaded without signature verification.',
            allSourcesUnreachable: 'All filter sources (primary + mirrors) were unreachable. Your current rules stayed active.',
            remoteUnreachable: 'The remote list was unreachable, so YoutubeAdblock stayed on the last known rule set.',
            remoteTooLarge: maxMb => `Remote filter list exceeds ${maxMb}MB limit.`,
            invalidJsonSchema: 'Invalid JSON filter schema.',
            noUsableRules: 'The remote list produced no usable rules.',
            couldNotVerifyOrParse: 'Remote rules could not be verified or parsed.',
            remoteParseFailed: 'The remote list could not be parsed. Your current rules stayed active.',
            remoteVerificationFailed: 'Remote rules could not be verified.',
            remoteRequestFailed: 'Remote filter request failed.',
            remoteRequestTimedOut: 'Remote filter request timed out.',
            ruleLibraryProblem: detail => `Rule library problem: ${detail} Your current rules stayed active.`,
            webpackSignatureTooLarge: maxKb => `Remote webpack signature database exceeds ${maxKb}KB limit.`,
            webpackSignatureInvalid: 'Remote webpack signature database did not contain usable tokens.',
            webpackSignatureFetchFailed: 'Webpack signature refresh failed.',
            refreshComplete: (count, version, integrity) => {
                const suffix = integrity === 'unsigned-custom'
                    ? ' Unsigned custom source.'
                    : ' Signature verified.';
                return `Rule refresh complete. ${formatNumber(count)} rules active (${version || STRINGS.common.unknownShort}).${suffix}`;
            }
        },
        protectionSummary: {
            paused: {
                label: 'Paused',
                tone: 'warn',
                description: 'Every blocking engine is paused until you turn protection back on.'
            },
            refreshing: {
                label: 'Refreshing…',
                tone: 'info',
                description: 'Pulling the latest rule set while keeping your current protection active.'
            },
            protected: 'Protected',
            remoteDescription: 'Remote rules are live and the fallback remains ready if the source goes away.',
            cachedDescription: 'Cached rules are active while YoutubeAdblock waits for a fresher remote copy.',
            staleDescription: 'Previously saved rules are active while YoutubeAdblock refreshes in the background.',
            builtInDescription: 'Built-in rules are active, so protection still works even without a remote list.'
        },
        injectionTiming: {
            confirmedTitle: 'Document-start confirmed',
            lateTitle: 'Late injection suspected',
            confirmedDescription: (readyState, elapsedText) => `YoutubeAdblock evaluated while the document was ${readyState} (${elapsedText}), so manager setup looks correct. If ads still appear, refresh rules or check engine health instead of reinstalling.`,
            extensionProduct: 'extension content script',
            userscriptProduct: 'userscript manager',
            lateDescription: (readyState, elapsedText, product) => `YoutubeAdblock evaluated after document-start (${readyState}, ${elapsedText}). This usually points to ${product} setup, such as Chrome's "Allow User Scripts" toggle, a disabled manager, or a manager that missed @run-at document-start. Reload YouTube after fixing setup; rule refreshes cannot recover player responses that loaded before the script.`
        },
        toastTitles: {
            info: 'Heads Up',
            success: 'Updated',
            error: 'Needs Attention',
            warn: 'Check This'
        },
        sponsorBlock: {
            highlightTitle: timeText => `Jump to highlight (${timeText})`,
            highlightSymbol: '★'
        },
        ryd: {
            dislikeLabel: label => `Dislike (${label})`
        },
        volumeBoost: {
            tag: 'Boost',
            title: 'YoutubeAdblock volume boost'
        },
        ui: {
            controlCenter: 'Control Center',
            headerDescription: 'Pause protection, refresh the rule library, and adjust modules without leaving YouTube.',
            findSetting: 'Find a setting',
            findSettingPlaceholder: 'Find a setting…',
            closeControlCenter: 'Close the YoutubeAdblock Control Center',
            footerHint: 'Search or scroll. Changes save instantly. Press Esc to close.',
            quickActions: 'Quick actions',
            protectionOn: 'Protection On',
            protectionPaused: 'Protection Paused',
            masterSwitch: 'Master Switch',
            masterSwitchPause: 'Pause every blocking engine without uninstalling the script.',
            masterSwitchResume: 'Resume blocking instantly with your saved settings intact.',
            toggleProtection: 'Toggle YoutubeAdblock protection',
            ruleLibrary: 'Rule Library',
            diagnostics: 'Diagnostics',
            currentPage: 'Current Page',
            currentPageDetail: 'Context for this tab.',
            recommendedSourceActive: 'Recommended source active.',
            customSourceActive: 'Custom source active.',
            lastSync: 'Last Sync',
            activeRulesDetail: count => `${formatNumber(count)} active rules.`,
            metrics: {
                blocked: 'Ads Blocked',
                pruned: 'Responses Pruned',
                ssapSkipped: 'SSAP Skips',
                sponsorSkipped: 'Sponsor Skips',
                dearrowReplaced: 'DeArrow Replaced',
                feedFiltered: 'Feed Filtered'
            },
            managerSetupWarning: 'Manager Setup Warning',
            protectionDegraded: 'Protection Degraded',
            coexistenceDetected: 'Coexistence Detected',
            degradedBody: (engineList, lockedList, preProxied) => {
                let body = `Some engines could not fully install: ${engineList}.`;
                if (lockedList) body += ` Locked natives: ${lockedList}.`;
                if (preProxied.length) body += ` Pre-proxied by another extension: ${preProxied.join(', ')}.`;
                return body + ' Another extension or YouTube may have claimed these first. Remaining engines are still active; reloading the page usually wins the race back.';
            },
            coexistenceBody: preProxied => `Another extension already hooked: ${preProxied.join(', ')}. YoutubeAdblock replaced them with its own proxies. If you see unexpected behavior, try disabling the other blocker.`,
            refreshing: 'Refreshing…',
            refreshRules: 'Refresh Rules',
            ruleLibraryDescription: 'Choose the source that feeds cosmetic selectors and remote rule updates. YoutubeAdblock keeps your last working rules or the built-in fallback ready if a refresh fails.',
            sourceUrl: 'Source URL',
            filterHelpExtension: 'Point this at a raw EasyList or uBO-style source. Extension installs work best with hosts that allow direct browser fetches from YouTube pages.',
            filterHelpUserscript: 'Point this at a raw EasyList or uBO-style source. Refreshing applies new rules without dropping your current protection.',
            filterPlaceholder: 'https://example.com/youtube-filters.txt…',
            invalidFilterUrl: 'Enter a valid http or https URL before refreshing the Rule Library.',
            useRecommendedSource: 'Use Recommended Source',
            recommendedSourceToast: 'The recommended Rule Library is active again.',
            ruleVersionPill: version => `Version ${version || STRINGS.common.unknownShort}`,
            syncedPill: timestamp => `Synced ${formatTimestamp(timestamp)}`,
            integrityPill: label => `Integrity ${label}`,
            rulesPill: count => `${formatNumber(count)} Rules`,
            selectorsPill: count => `${formatNumber(count)} Selectors`,
            prunePathsPill: count => `${formatNumber(count)} Prune Paths`,
            networkOnlyPill: count => `${formatNumber(count)} Network-Only`,
            unsupportedScriptletsPill: count => `${formatNumber(count)} Unsupported Scriptlets`,
            refreshProblem: 'Refresh Problem',
            signatureVerified: 'Signature Verified',
            verifiedFilterNote: 'The recommended remote list was verified before it replaced your active rules.',
            unsignedCustomSource: 'Unsigned Custom Source',
            unsignedCustomNote: 'Custom Rule Library sources are allowed, but they are not verified by the bundled Ed25519 key.',
            customSourceTitle: 'Custom Source Active',
            customSourceExtensionNote: 'Keep the source raw text, refresh after edits, and use a host that allows direct browser fetches from YouTube pages.',
            customSourceUserscriptNote: 'Keep the source raw text and refresh after edits so the new rules load.',
            recommendedSourceTitle: 'Recommended Source Active',
            recommendedSourceNote: 'The recommended remote list is live, and the built-in fallback stays ready if the source ever goes offline.',
            fallbackReady: 'Fallback Ready',
            fallbackReadyNote: 'Protection is still running with cached or built-in rules. Refresh when you want a newer remote copy.',
            onPill: (enabled, total) => `${enabled}/${total} On`,
            unavailableDearrowExtension: 'Unavailable in the extension build: the DeArrow API requires explicit permission for browser extensions. Use the userscript build for this feature.',
            sponsorAttribution: 'Segment data from SponsorBlock, licensed CC BY-NC-SA 4.0.',
            sponsorAttributionLink: 'sponsor.ajay.app',
            enhanceAttribution: 'Title/thumbnail data from DeArrow (CC BY-NC-SA 4.0); dislike counts from Return YouTube Dislike.',
            dearrowAttributionLink: 'dearrow.ajay.app',
            rydAttributionLink: 'returnyoutubedislike.com',
            blocklist: {
                blockedChannels: 'Blocked Channels',
                blockedChannelsWhitelistHelp: 'Whitelist mode active: only videos from these channels will be shown. Supports names, UC IDs, @handles, channel URLs, and regex.',
                blockedChannelsHelp: 'One channel per line. Supports names, UC IDs, @handles, channel URLs, and regex, e.g. /^Exact Channel$/.',
                blockedKeywords: 'Blocked Keywords',
                blockedKeywordsHelp: 'One keyword per line. Substring match (case-insensitive). Wrap in /slashes/ for regex, e.g. /sponsor|promo/i.',
                adAllowedChannels: 'Ad-Allowed Channels',
                adAllowedChannelsHelp: 'Ads will play on videos from these channels. Supports names, UC IDs, @handles, channel URLs, and regex.',
                importExport: 'Import / Export',
                importExportHelp: 'Move blocklists and local settings between installs without changing your cached rule library.',
                importPlaceholder: 'Paste YoutubeAdblock JSON, BlockTube/FilterTube-style JSON, or plain channel names / @handles / UC IDs. Use keyword: or title: prefixes for keyword text imports.',
                copyJson: 'Copy JSON',
                settingsJsonCopied: 'Settings JSON copied.',
                settingsJsonClipboardFallback: 'Clipboard unavailable. JSON is in the import box.',
                copyChannelText: 'Copy Channel Text',
                channelBlocklistCopied: 'Channel blocklist copied.',
                channelClipboardFallback: 'Clipboard unavailable. Channel text is in the import box.',
                importJson: 'Import JSON',
                importedSettings: count => `Imported ${count} settings.`,
                importChannelText: 'Import Channel Text',
                channelBlocklistImported: 'Channel blocklist imported.',
                importMigration: 'Import Migration',
                rejectedEntries: items => `Rejected entries:\n${items.join('\n')}`,
                migrationImported: (channels, keywords, rejectedCount) => `Migration imported ${channels} channel and ${keywords} keyword entries${rejectedCount ? `; ${rejectedCount} rejected.` : '.'}`,
                migrationNoSupportedEntries: 'Migration import did not find supported channel or keyword entries.',
                importJsonParseError: 'Import JSON could not be parsed.',
                importJsonNoSupportedSettings: 'Import JSON did not contain supported YoutubeAdblock settings.',
                durationTitle: 'Duration Filter (seconds)',
                durationHelp: 'Hide videos shorter than min or longer than max. Leave blank to skip.',
                minPlaceholder: 'Min (sec)',
                maxPlaceholder: 'Max (sec)'
            },
            diagnosticsSection: {
                title: 'Diagnostics & Recovery',
                description: 'Copy a clean snapshot for bug reports or reset local state without reinstalling the script.',
                installTiming: 'Install Timing',
                installTimingHelp: 'Separate userscript-manager setup problems from YouTube rule breakage before changing settings.',
                shareSnapshot: 'Share a Snapshot',
                shareSnapshotHelp: 'Copy the active Rule Library, module states, counters, and environment details, then open the repo issue tracker with clean context.',
                copyDiagnostics: 'Copy Diagnostics',
                openIssues: 'Open Issues',
                resetLocalState: 'Reset Local State',
                resetLocalStateHelp: 'Reset counters or restore the recommended defaults without reinstalling. Your cached rule library stays ready.',
                localOnly: 'Local Only',
                localOnlyHelp: 'These actions change only local settings and counters. They do not remove the script or erase your current cached rules.',
                resetCounters: 'Reset Counters',
                confirmReset: 'Confirm Reset',
                countersReset: 'Session counters reset.',
                restoreDefaults: 'Restore Defaults',
                confirmRestore: 'Confirm Restore',
                defaultsRestored: 'Recommended defaults restored. Your current rules stayed in place.'
            },
            searchEmptyTitle: 'No Matching Settings',
            searchEmptyBody: query => `Nothing matches "${query}". Try terms like "rule", "shorts", "sponsor", or "reset".`,
            armedAction: label => `${label} is armed. Click again to confirm.`,
            featureToggle: (label, enabled) => `${label} ${enabled ? 'enabled' : 'disabled'}.`,
            protectionResumed: 'Protection resumed across every engine.',
            protectionPausedToast: 'Protection paused. YoutubeAdblock stays installed and ready to resume.',
            diagnosticsCopied: 'Diagnostics copied. You can paste them into a bug report or note.',
            diagnosticsClipboardFailed: 'Clipboard access was unavailable, so diagnostics could not be copied.',
            stillLoading: 'Control Center is still loading. Try again in a moment.',
            loadedLate: hint => `YoutubeAdblock loaded late. Open Diagnostics for setup steps. ${hint}`,
            activeToast: hint => `YoutubeAdblock is active. ${hint}`,
            youtubeChanged: 'YouTube may have changed its ad delivery. Try refreshing rules from the Control Center.'
        },
        featureGroups: {
            core: {
                title: 'Core Blocking',
                description: 'Intercept the network and data paths that carry ad payloads before YouTube can render them.',
                features: {
                    jsonParsePrune: {
                        label: 'JSON response pruning',
                        desc: 'Removes ad payloads from parsed player responses before they are consumed.'
                    },
                    fetchIntercept: {
                        label: 'fetch() interception',
                        desc: 'Applies pruning to player and browse requests handled through fetch().'
                    },
                    xhrIntercept: {
                        label: 'XMLHttpRequest interception',
                        desc: 'Catches older request paths that still deliver ad-related responses.'
                    },
                    setUndefinedTraps: {
                        label: 'Initial property traps',
                        desc: 'Keeps early ad-related player properties undefined during first-page hydration.'
                    }
                }
            },
            anti: {
                title: 'Anti-Detection',
                description: 'Reduce the odds of YouTube detecting, rehydrating, or bypassing the protections already in place.',
                features: {
                    abnormalityBypass: {
                        label: 'Abnormality callback bypass',
                        desc: 'Neutralizes callbacks that flag ad blocking as abnormal behavior.'
                    },
                    domBypassPrevention: {
                        label: 'Iframe bypass prevention',
                        desc: 'Stops clean iframe contexts from restoring unmodified browser APIs.'
                    },
                    requestBodyModify: {
                        label: 'No-ad request signal',
                        desc: 'Marks outbound player requests with the inline-playback no-ad flag so YouTube serves no ad payload and no fake-buffering delay. Works on cold loads and in-app navigation.'
                    },
                    ssapAutoSkip: {
                        label: 'SSAP auto-skip',
                        desc: 'Fast-forwards through stitched server-side ads whenever they are detected.'
                    },
                    timerNeutralization: {
                        label: 'Timer neutralization',
                        desc: 'Disarms the long timers YouTube uses to validate ad playback.'
                    },
                    aggressiveAntiStall: {
                        label: 'Aggressive anti-stall',
                        desc: 'Fast-forwards the 17-second bound timers YouTube uses to stall playback when a blocker is suspected.'
                    },
                    videoAdFastForward: {
                        label: 'Video ad fast-forward',
                        desc: 'If an unskippable ad still plays, mutes it and accelerates playback as a fallback safety net.'
                    },
                    nativeToStringMask: {
                        label: 'Hide proxies from toString',
                        desc: 'Patches Function.prototype.toString so YouTube cannot detect our hooked natives by source inspection.'
                    },
                    serviceWorkerBlock: {
                        label: 'Block service worker injection',
                        desc: 'Prevents YouTube from registering a service worker that could bypass our request proxies.'
                    },
                    webpackChunkHook: {
                        label: 'Webpack chunk prune',
                        desc: 'Rewrites YouTube webpack chunks before execution to strip modules that render ad placements.'
                    }
                }
            },
            cleanup: {
                title: 'Interface Cleanup',
                description: 'Remove the visible clutter that remains after payload blocking has already done the heavy lifting.',
                features: {
                    cosmeticHiding: {
                        label: 'Cosmetic cleanup',
                        desc: 'Hides promoted shelves, banners, overlays, and remaining ad containers.'
                    },
                    upsellBlock: {
                        label: 'Premium upsell blocking',
                        desc: 'Suppresses Premium upgrade popups and related prompts.'
                    },
                    shortsAdBlock: {
                        label: 'Shorts ad removal',
                        desc: 'Removes sponsored entries from Shorts feeds before they appear.'
                    }
                }
            },
            sponsor: {
                title: 'Community Sponsor Segments',
                description: 'Silently jump past sponsor reads, self-promotion, intros, outros, and other crowd-marked segments.',
                features: {
                    sponsorBlock: {
                        label: 'SponsorBlock auto-skip',
                        desc: 'Uses the SponsorBlock community database to silently skip sponsor, self-promo, intro, outro, interaction, preview, music-off-topic, and filler segments. No notifications.'
                    }
                }
            },
            enhance: {
                title: 'Experience Enhancements',
                description: 'Player, metadata, and audio tweaks that make watching nicer once the ads are gone.',
                features: {
                    dearrow: {
                        label: 'DeArrow titles & thumbnails',
                        desc: 'Replaces clickbait titles and thumbnails with crowd-submitted alternatives via the privacy-preserving DeArrow hash-prefix API.'
                    },
                    returnYoutubeDislike: {
                        label: 'Return YouTube Dislike',
                        desc: 'Restores the public dislike count under the like button using the Return YouTube Dislike archive.'
                    },
                    forceOriginalAudio: {
                        label: 'Force original audio',
                        desc: 'Switches back to the original-language audio track when YouTube defaults to an auto-dubbed or translated track.'
                    },
                    volumeBoost: {
                        label: 'Volume boost (up to 5x)',
                        desc: 'Adds a gain slider under the player so you can amplify quiet videos past the browser\u2019s 100% ceiling.'
                    }
                }
            },
            clutter: {
                title: 'Clutter-Free Mode',
                description: 'Hide the parts of YouTube you never want to see. Selectors only — the engine stays in charge of ads.',
                features: {
                    hideHomeFeed: {
                        label: 'Hide home feed',
                        desc: 'Clears the infinite scroll on the YouTube homepage and shows the empty-state layout instead.'
                    },
                    hideShortsShelf: {
                        label: 'Hide Shorts shelves',
                        desc: 'Removes Shorts carousels from the home, subscriptions, search, and channel surfaces.'
                    },
                    hideShortsTab: {
                        label: 'Hide Shorts nav entries',
                        desc: 'Removes the Shorts sidebar entry, chip, and navigation destination.'
                    },
                    hideRelated: {
                        label: 'Hide related videos',
                        desc: 'Clears the up-next/suggested rail on the watch page.'
                    },
                    hideComments: {
                        label: 'Hide comments',
                        desc: 'Collapses the comment section on watch pages.'
                    },
                    hideEndScreen: {
                        label: 'Hide end-screen cards',
                        desc: 'Suppresses the card and "more videos" overlay that appears at the end of a video.'
                    },
                    hideLiveChat: {
                        label: 'Hide live chat',
                        desc: 'Removes the live-stream chat panel from watch pages.'
                    },
                    hideMerch: {
                        label: 'Hide merch shelves',
                        desc: 'Hides merchandise, ticket, and shopping shelves below videos.'
                    },
                    hideMembersOnly: {
                        label: 'Hide members-only videos',
                        desc: 'Removes videos with a Members badge from feeds so free-tier users never see paywalled content.'
                    },
                    hideSponsoredComments: {
                        label: 'Hide sponsored comments & affiliate links',
                        desc: 'Hides sponsor-badged comments and common affiliate redirect links in video descriptions.'
                    }
                }
            },
            blocklist: {
                title: 'Channels & Keywords',
                description: 'Quietly remove videos from the feed when the channel or title matches your rules. Lists live locally only.',
                features: {
                    shortsRedirect: {
                        label: 'Redirect Shorts to /watch',
                        desc: 'Rewrites any /shorts/VIDEO_ID URL into the regular watch page so the full player is always used.'
                    },
                    channelBlocker: {
                        label: 'Channel blocklist',
                        desc: 'Drops videos from your blocked-channel list out of every feed. Manage the list via the text area below.'
                    },
                    keywordBlocker: {
                        label: 'Keyword blocklist',
                        desc: 'Drops videos whose title matches one of your blocked keywords (one per line, case-insensitive).'
                    },
                    whitelistMode: {
                        label: 'Whitelist mode',
                        desc: 'Inverts the channel list: only show videos from listed channels, hide everything else.'
                    },
                    durationFilter: {
                        label: 'Duration filter',
                        desc: 'Hides videos shorter or longer than your thresholds. Set via the fields below.'
                    },
                    adAllowlist: {
                        label: 'Per-channel ad allowlist',
                        desc: 'Skips ad pruning for listed channels so their ads play normally. Supports creator sponsorship.'
                    }
                }
            }
        },
        diagnosticsReport: {
            captured: 'Captured',
            site: 'Site',
            surface: 'Surface',
            build: 'Build',
            extension: 'extension',
            userscript: 'userscript',
            ua: 'UA',
            injectionStatus: 'Injection status',
            injectionReadyState: 'Injection readyState',
            injectionElapsed: 'Injection elapsed',
            injectionGuidance: 'Injection guidance',
            protectionEnabled: 'Protection enabled',
            filterSource: 'Filter source',
            filterIntegrity: 'Filter integrity',
            filterIntegrityDetail: 'Filter integrity detail',
            filterUrl: 'Filter URL',
            filterVersion: 'Filter version',
            lastSync: 'Last sync',
            lastError: 'Last error',
            rulesActive: 'Rules active',
            pruneKeys: 'Prune keys',
            cosmeticSelectors: 'Cosmetic selectors',
            interceptPatterns: 'Intercept patterns',
            appliedSelectors: 'Applied selector rules',
            appliedPrunePaths: 'Applied prune paths',
            networkOnlyRules: 'Network-only filter rules',
            droppedUnsafeSelectors: 'Dropped unsafe selectors',
            supportedScriptlets: 'Supported scriptlets',
            unsupportedScriptlets: 'Unsupported scriptlets',
            webpackSignatureSource: 'Webpack signature source',
            webpackSignatureVersion: 'Webpack signature version',
            webpackSignatureTokens: 'Webpack signature tokens',
            webpackSignatureError: 'Webpack signature error',
            channelBlockEntries: 'Channel block entries',
            keywordBlockEntries: 'Keyword block entries',
            adAllowEntries: 'Ad-allow entries',
            trappedRoots: 'Trapped roots',
            engineHealth: 'Engine health',
            lockedNatives: 'Locked natives',
            preProxied: 'Pre-proxied (another extension)',
            stats: 'Stats',
            enabledFeatures: 'Enabled features',
            disabledFeatures: 'Disabled features'
        },
        menu: {
            openControlCenter: 'Open Control Center',
            pauseProtection: 'Pause Protection',
            resumeProtection: 'Resume Protection',
            refreshRules: 'Refresh Rules',
            copyDiagnostics: 'Copy Diagnostics'
        }
    };

    /* =========================================================================
     * DEFAULT FILTERS (fallback when remote unavailable)
     * ===================================================================== */

    const DEFAULT_FILTERS = {
        version: '0.0.2',
        updated: '2026-04-17',
        pruneKeys: [
            'adPlacements', 'adSlots', 'playerAds',
            'playerResponse.adPlacements', 'playerResponse.adSlots', 'playerResponse.playerAds',
            // Anti-adblock enforcement popup payloads. YT 2026 delivery
            // surface: these arrive via /browse, /guide, and /next rather
            // than /player, so widening pruneKeys catches them before the
            // engagement-message renderer builds the popup.
            'adBreakHeartbeatParams',
            'frameworkUpdates',
            'responseContext.adSignalsInfo',
            'playerResponse.adBreakHeartbeatParams',
            'playerResponse.auxiliaryUi.messageRenderers.upsellDialogRenderer',
            'auxiliaryUi.messageRenderers.upsellDialogRenderer',
            // v0.4.0: wider renderer coverage. YT ships promoted content
            // through a dozen distinct renderer names; pruning each of
            // them at the payload layer is cheaper and more reliable
            // than racing cosmetic filters.
            'promotedSparklesWebRenderer',
            'promotedVideoRenderer',
            'compactPromotedVideoRenderer',
            'compactPromotedItemRenderer',
            'backgroundPromoRenderer',
            'statementBannerRenderer',
            'brandVideoShelfRenderer',
            'brandVideoSingletonRenderer',
            'inlineAdLayoutRenderer',
            'adSlotRenderer',
            'linkedInstreamAdRenderer',
            'shoppingCarouselRenderer',
            'merchandiseShelfRenderer'
        ],
        setUndefined: [
            'ytInitialPlayerResponse.playerAds',
            'ytInitialPlayerResponse.adPlacements',
            'ytInitialPlayerResponse.adSlots',
            'ytInitialPlayerResponse.adBreakHeartbeatParams',
            'ytInitialPlayerResponse.auxiliaryUi.messageRenderers.upsellDialogRenderer',
            'ytInitialData.frameworkUpdates',
            'playerResponse.adPlacements'
        ],
        replaceKeys: { adPlacements: 'no_ads', adSlots: 'no_ads', playerAds: 'no_ads' },
        interceptPatterns: [
            '/youtubei/v1/player', '/youtubei/v1/get_watch',
            '/youtubei/v1/browse', '/youtubei/v1/search', '/youtubei/v1/next',
            '/youtubei/v1/guide',
            // v0.4.0: cover newer InnerTube surfaces. `log_event` is the
            // primary adblock-detection beacon; `att/*` are attestation
            // challenges; `reel_watch_sequence` delivers Shorts ads;
            // `get_survey` delivers survey ads.
            '/youtubei/v1/log_event',
            '/youtubei/v1/att/get', '/youtubei/v1/att/log',
            '/youtubei/v1/reel_watch_sequence',
            '/youtubei/v1/get_survey',
            '/youtubei/v1/player/ad_break',
            '/watch?', '/playlist?list=', '/reel_watch_sequence'
        ],
        cosmeticSelectors: [
            '#masthead-ad', '#promotion-shelf', '#shopping-timely-shelf',
            '.masthead-ad-control', '.ad-div', '.pyv-afc-ads-container',
            '.ytp-ad-progress', '.ytp-suggested-action-badge',
            'ytd-ad-slot-renderer', 'ytd-video-masthead-ad-advertiser-info-renderer',
            'ytm-promoted-sparkles-web-renderer', 'ytd-search-pyv-renderer',
            'ytd-merch-shelf-renderer', 'ad-slot-renderer', 'ytm-companion-ad-renderer',
            'ytd-statement-banner-renderer',
            // Anti-adblock enforcement modal. Hiding it cosmetically is a
            // defense-in-depth layer — the primary kill is pruning the
            // frameworkUpdates payload that builds it.
            'ytd-enforcement-message-view-model',
            'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)',
            'ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer)',
            '#shorts-inner-container > .ytd-shorts:has(> .ytd-reel-video-renderer > ytd-ad-slot-renderer)',
            '.ytd-watch-flexy > .ytd-watch-next-secondary-results-renderer > ytd-ad-slot-renderer',
            '.ytd-two-column-browse-results-renderer > ytd-rich-grid-renderer > #masthead-ad',
            // v0.4.0: broaden cosmetic coverage for renderer variants
            // pruning may not catch during the first frame.
            'ytd-in-feed-ad-layout-renderer',
            'ytd-banner-promo-renderer',
            'ytd-promoted-video-renderer',
            'ytd-compact-promoted-video-renderer',
            'ytd-action-companion-ad-renderer',
            'ytd-brand-video-shelf-renderer',
            'ytd-brand-video-singleton-renderer'
        ],
        upsellSelectors: [
            'ytd-popup-container > .ytd-popup-container > #contentWrapper > .ytd-popup-container[position-type="OPEN_POPUP_POSITION_BOTTOMLEFT"]'
        ],
        features: {
            jsonParsePrune: true, fetchIntercept: true, xhrIntercept: true,
            setUndefinedTraps: true, ssapAutoSkip: true, abnormalityBypass: true,
            domBypassPrevention: true, shortsAdBlock: true,
            cosmeticHiding: true, upsellBlock: true, requestBodyModify: true,
            timerNeutralization: true,
            // New in 0.2.1 — opt-in by default because they trade off
            // slightly more aggressive behavior for stronger protection.
            aggressiveAntiStall: true,
            videoAdFastForward: true,
            sponsorBlock: true,
            // v0.4.0 anti-detect hardening
            nativeToStringMask: true,
            serviceWorkerBlock: true,
            webpackChunkHook: true,
            // v0.4.0 UX — all off by default so the engine-first posture
            // is preserved; users opt in from the Control Center.
            dearrow: false,
            returnYoutubeDislike: false,
            forceOriginalAudio: false,
            volumeBoost: false,
            shortsRedirect: false,
            channelBlocker: false,
            keywordBlocker: false,
            // v0.4.0 interface cleanup (Unhook-style)
            hideHomeFeed: false,
            hideShortsShelf: false,
            hideShortsTab: false,
            hideRelated: false,
            hideComments: false,
            hideEndScreen: false,
            hideLiveChat: false,
            hideMerch: false,
            hideMembersOnly: false,
            hideSponsoredComments: false
        }
    };

    const FEATURE_COPY = STRINGS.featureGroups;
    function featureCopy(groupKey, featureKey) {
        return FEATURE_COPY[groupKey].features[featureKey];
    }

    const FEATURE_GROUPS = [
        {
            sectionId: SECTION_IDS.core,
            title: FEATURE_COPY.core.title,
            description: FEATURE_COPY.core.description,
            features: [
                { key: 'jsonParsePrune', ...featureCopy('core', 'jsonParsePrune') },
                { key: 'fetchIntercept', ...featureCopy('core', 'fetchIntercept') },
                { key: 'xhrIntercept', ...featureCopy('core', 'xhrIntercept') },
                { key: 'setUndefinedTraps', ...featureCopy('core', 'setUndefinedTraps') },
            ]
        },
        {
            sectionId: SECTION_IDS.anti,
            title: FEATURE_COPY.anti.title,
            description: FEATURE_COPY.anti.description,
            features: [
                { key: 'abnormalityBypass', ...featureCopy('anti', 'abnormalityBypass') },
                { key: 'domBypassPrevention', ...featureCopy('anti', 'domBypassPrevention') },
                { key: 'requestBodyModify', ...featureCopy('anti', 'requestBodyModify') },
                { key: 'ssapAutoSkip', ...featureCopy('anti', 'ssapAutoSkip') },
                { key: 'timerNeutralization', ...featureCopy('anti', 'timerNeutralization') },
                { key: 'aggressiveAntiStall', ...featureCopy('anti', 'aggressiveAntiStall') },
                { key: 'videoAdFastForward', ...featureCopy('anti', 'videoAdFastForward') },
                { key: 'nativeToStringMask', ...featureCopy('anti', 'nativeToStringMask') },
                { key: 'serviceWorkerBlock', ...featureCopy('anti', 'serviceWorkerBlock') },
                { key: 'webpackChunkHook', ...featureCopy('anti', 'webpackChunkHook') }
            ]
        },
        {
            sectionId: SECTION_IDS.cleanup,
            title: FEATURE_COPY.cleanup.title,
            description: FEATURE_COPY.cleanup.description,
            features: [
                { key: 'cosmeticHiding', ...featureCopy('cleanup', 'cosmeticHiding') },
                { key: 'upsellBlock', ...featureCopy('cleanup', 'upsellBlock') },
                { key: 'shortsAdBlock', ...featureCopy('cleanup', 'shortsAdBlock') }
            ]
        },
        {
            sectionId: SECTION_IDS.sponsor,
            title: FEATURE_COPY.sponsor.title,
            description: FEATURE_COPY.sponsor.description,
            features: [
                { key: 'sponsorBlock', ...featureCopy('sponsor', 'sponsorBlock') }
            ]
        },
        {
            sectionId: SECTION_IDS.enhance,
            title: FEATURE_COPY.enhance.title,
            description: FEATURE_COPY.enhance.description,
            features: [
                { key: 'dearrow', ...featureCopy('enhance', 'dearrow') },
                { key: 'returnYoutubeDislike', ...featureCopy('enhance', 'returnYoutubeDislike') },
                { key: 'forceOriginalAudio', ...featureCopy('enhance', 'forceOriginalAudio') },
                { key: 'volumeBoost', ...featureCopy('enhance', 'volumeBoost') }
            ]
        },
        {
            sectionId: SECTION_IDS.clutter,
            title: FEATURE_COPY.clutter.title,
            description: FEATURE_COPY.clutter.description,
            features: [
                { key: 'hideHomeFeed', ...featureCopy('clutter', 'hideHomeFeed') },
                { key: 'hideShortsShelf', ...featureCopy('clutter', 'hideShortsShelf') },
                { key: 'hideShortsTab', ...featureCopy('clutter', 'hideShortsTab') },
                { key: 'hideRelated', ...featureCopy('clutter', 'hideRelated') },
                { key: 'hideComments', ...featureCopy('clutter', 'hideComments') },
                { key: 'hideEndScreen', ...featureCopy('clutter', 'hideEndScreen') },
                { key: 'hideLiveChat', ...featureCopy('clutter', 'hideLiveChat') },
                { key: 'hideMerch', ...featureCopy('clutter', 'hideMerch') },
                { key: 'hideMembersOnly', ...featureCopy('clutter', 'hideMembersOnly') },
                { key: 'hideSponsoredComments', ...featureCopy('clutter', 'hideSponsoredComments') }
            ]
        },
        {
            sectionId: SECTION_IDS.blocklist,
            title: FEATURE_COPY.blocklist.title,
            description: FEATURE_COPY.blocklist.description,
            features: [
                { key: 'shortsRedirect', ...featureCopy('blocklist', 'shortsRedirect') },
                { key: 'channelBlocker', ...featureCopy('blocklist', 'channelBlocker') },
                { key: 'keywordBlocker', ...featureCopy('blocklist', 'keywordBlocker') },
                { key: 'whitelistMode', ...featureCopy('blocklist', 'whitelistMode') },
                { key: 'durationFilter', ...featureCopy('blocklist', 'durationFilter') },
                { key: 'adAllowlist', ...featureCopy('blocklist', 'adAllowlist') }
            ]
        }
    ];

    /* =========================================================================
     * STATE
     * ===================================================================== */

    const state = {
        filters: null,
        features: {},
        enabled: true,
        stats: { ...DEFAULT_STATS },
        settingsOpen: false,
        lastFilterUpdate: 0,
        filterSource: 'built-in',
        filterSyncing: false,
        filterError: '',
        filterIntegrity: 'built-in',
        filterIntegrityMessage: STRINGS.filters.builtInIntegrityMessage,
        filterRequestPromise: null,
        filterRequestId: 0,
        activeFilterRequestUrl: '',
        webpackSignatureDatabase: null,
        webpackSignatureMatcher: null,
        webpackSignatureSource: 'built-in',
        webpackSignatureVersion: '',
        webpackSignatureUpdated: '',
        webpackSignatureError: '',
        webpackSignatureSyncing: false,
        proxiesInstalled: false,
        overlayEl: null,
        panelEl: null,
        lastFocusedEl: null,
        cosmeticStyleEl: null,
        toastRegionEl: null,
        originals: {},
        // Roots already guarded by installPropertyTraps — prevents TypeError on re-install
        trappedRoots: new Set(),
        // Mutable map keyed by root → array of subpath arrays (updated on filter refresh)
        trapPathsByRoot: new Map(),
        // Pending save for stats batching
        statsSaveTimer: null,
        // Menu command handles (used to unregister before re-register)
        menuHandles: [],
        // In-flight URL edit not yet committed via Refresh. Survives settings
        // panel rebuilds so feature toggles don't discard unsaved typing.
        pendingFilterUrl: null,
        // In-panel settings search. Ephemeral UI state only; cleared when the
        // Control Center closes so a fresh open always starts from the full view.
        settingsQuery: '',
        // Collapsed section state for the Control Center. Stored in-memory so
        // rebuilds preserve the user's browsing context without persisting UI
        // chrome into settings.
        openSections: new Set([SECTION_IDS.core]),
        // Interval handles owned by the installed engines. Kept so the
        // INIT path can avoid re-registering on hot reload (e.g. dev
        // scenarios where the userscript is re-evaluated) and future
        // teardown paths can cleanly stop them.
        engineIntervals: [],
        // Per-engine install outcome ('ok' | 'degraded' | 'failed'),
        // recorded by installProxies and surfaced in the Control Center
        // overview + diagnostics so a lost document-start race (YouTube's
        // locker script, a competing blocker) is never silent.
        engineHealth: {},
        // Labels of natives safeOverride could not replace (e.g.
        // 'window.fetch'). Drives the degraded-protection warning.
        overrideFailures: []
    };

    // Cap simultaneously visible toasts so a flurry of errors doesn't fill
    // the viewport. Oldest-visible is dropped when at cap.
    const TOAST_MAX_VISIBLE = 4;
    const TOAST_TYPES = new Set(['info', 'success', 'error', 'warn']);

    /* =========================================================================
     * STORAGE HELPERS
     * ===================================================================== */

    function getSetting(key, def) {
        try {
            return GM_getValue(`${CSS_PREFIX}_${key}`, def);
        } catch (e) {
            // GM storage can raise on corrupted payloads or when the
            // underlying backing store (extension quota) rejects reads.
            // Returning the default keeps protection functional.
            return def;
        }
    }
    function setSetting(key, val) {
        try {
            GM_setValue(`${CSS_PREFIX}_${key}`, val);
            return true;
        } catch (e) {
            // Quota / serialization failures are non-fatal — the in-memory
            // state is still correct, we just can't persist until next time.
            return false;
        }
    }

    function normalizeFeatures(features) {
        return { ...DEFAULT_FILTERS.features, ...(features || {}) };
    }

    function getFeatureOverrides() {
        const rawOverrides = getSetting('feature_overrides', {});
        if (!rawOverrides || typeof rawOverrides !== 'object') return {};
        const clean = {};
        let droppedStaleKey = false;
        for (const [key, value] of Object.entries(rawOverrides)) {
            if (key in DEFAULT_FILTERS.features) clean[key] = !!value;
            else droppedStaleKey = true;
        }
        // One-time migration: persist the cleaned map when a removed
        // feature key (e.g. clientScreenSpoof, retired in v0.5.0) is
        // still present in storage, so stale toggles don't live forever
        // in the settings blob.
        if (droppedStaleKey) {
            try { setSetting('feature_overrides', clean); } catch (e) { /* non-fatal */ }
        }
        return clean;
    }

    function loadState() {
        const cached = sanitizeFilterPayload(getSetting('filters_cache', null));
        const cacheTime = getSetting('filters_cache_time', 0);
        const cacheUrl = getSetting('filters_cache_url', FILTER_URL_DEFAULT);
        const cachedIntegrity = getSetting('filters_integrity', '');
        const cachedIntegrityMessage = getSetting('filters_integrity_message', '');
        const featureOverrides = getFeatureOverrides();
        const rawStats = getSetting('stats', DEFAULT_STATS);
        // Type-safe stats hydration: silently coerce non-numeric values
        // (including NaN from corrupt older storage) to 0 so no increment
        // can ever produce NaN/string-concatenation. Without this, a
        // single bad write in a prior version silently breaks every
        // counter for the rest of the session.
        const incoming = (rawStats && typeof rawStats === 'object') ? rawStats : {};
        const hydrated = { ...DEFAULT_STATS };
        for (const key of Object.keys(DEFAULT_STATS)) {
            const n = Number(incoming[key]);
            hydrated[key] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_STATS[key];
        }
        state.stats = hydrated;
        state.enabled = getSetting('enabled', true) !== false;
        state.lastFilterUpdate = Number(cacheTime) || 0;

        if (cached) {
            // Use cached rules whether or not the TTL has expired. Dropping
            // to built-in defaults on TTL expiry just to then refetch the
            // same remote list in the background was a visible regression
            // for users with a customized filter URL — they'd lose coverage
            // for the first few seconds of every page load. Keeping the
            // stale copy active while the background refresh runs is
            // strictly better: if the refresh succeeds, the user never
            // sees a gap; if it fails, the stale copy is still far better
            // than the built-in fallback for a customized setup.
            state.filters = cached;
            const cacheMatchesCurrentUrl = String(cacheUrl || '') === String(resolveFilterUrl());
            state.filterSource = (cacheMatchesCurrentUrl && Date.now() - state.lastFilterUpdate < FILTER_CACHE_TTL)
                ? 'cached'
                : 'stale';
            state.filterIntegrity = cachedIntegrity || 'cached';
            state.filterIntegrityMessage = cachedIntegrityMessage || STRINGS.filters.cachedIntegrityMessage;
        } else {
            state.filters = DEFAULT_FILTERS;
            state.filterSource = 'built-in';
            state.filterIntegrity = 'built-in';
            state.filterIntegrityMessage = STRINGS.filters.builtInIntegrityMessage;
            // Discard any malformed cache so a subsequent successful fetch
            // starts clean rather than layering onto corrupt data.
            try {
                setSetting('filters_cache', null);
                setSetting('filters_cache_time', 0);
                setSetting('filters_cache_url', FILTER_URL_DEFAULT);
                setSetting('filters_integrity', state.filterIntegrity);
                setSetting('filters_integrity_message', state.filterIntegrityMessage);
            } catch (e) { /* ignore */ }
        }

        // Merge feature defaults with user overrides
        state.features = normalizeFeatures(state.filters?.features);
        for (const [k, v] of Object.entries(featureOverrides)) {
            if (k in state.features) state.features[k] = !!v;
        }

        // DeArrow is gated off in the extension build pending API permission
        // for browser extensions (see installDeArrow). Forcing the runtime
        // flag keeps a userscript-era override from re-enabling it here.
        if (IS_EXTENSION_BUILD) state.features.dearrow = false;

        hydrateWebpackSignatureDatabase();
    }

    function saveStats() {
        // Debounce persistence — hot paths (fetch/XHR/JSON.parse) call this frequently.
        if (state.statsSaveTimer) return;
        state.statsSaveTimer = setTimeout(() => {
            state.statsSaveTimer = null;
            try { setSetting('stats', state.stats); } catch (e) { /* silent */ }
        }, STATS_PERSIST_INTERVAL_MS);
    }

    // Safe counter increment. Runtime-defensive against state.stats being
    // shaped unexpectedly (e.g. a caller mutating it to a non-object) and
    // against NaN/string values that would otherwise poison every future
    // read. Call sites should always route through this helper rather
    // than doing `state.stats.foo++` directly.
    function incrementStat(name, by = 1) {
        if (!state.stats || typeof state.stats !== 'object') {
            state.stats = { ...DEFAULT_STATS };
        }
        const current = Number(state.stats[name]);
        state.stats[name] = (Number.isFinite(current) && current >= 0 ? current : 0) + by;
        saveStats();
    }

    // Route every engine-owned setInterval through this helper so the
    // handles are tracked in one place (enables teardown in tests / future
    // runtime-kill paths, and makes it easy to audit which long-running
    // timers the script owns).
    function registerInterval(fn, ms) {
        const id = setInterval(fn, ms);
        state.engineIntervals.push(id);
        return id;
    }

    function isEnabled() {
        return state.enabled !== false;
    }

    function ensureStyleElement(id) {
        let style = document.getElementById(id);
        if (style && style.isConnected) return style;
        if (style && !style.isConnected) {
            try { style.remove(); } catch (e) { /* ignore */ }
        }
        style = document.createElement('style');
        style.id = id;
        const host = document.head || document.documentElement;
        if (host) host.appendChild(style);
        return style;
    }

    // Lazy singletons — constructing Intl formatters is the dominant cost of
    // these helpers, and they're called from every panel refresh and every
    // metric tick. Lazy so we don't pay the construction cost on document-start
    // for users who never open the panel.
    let _numberFormatter = null;
    let _dateFormatter = null;
    function formatNumber(value) {
        if (!_numberFormatter) {
            try { _numberFormatter = new Intl.NumberFormat(); }
            catch (e) { _numberFormatter = { format: v => String(v) }; }
        }
        return _numberFormatter.format(Number(value) || 0);
    }

    function formatTimestamp(timestamp) {
        if (!timestamp) return STRINGS.common.notSyncedYet;
        if (!_dateFormatter) {
            try {
                _dateFormatter = new Intl.DateTimeFormat(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                });
            } catch (e) { _dateFormatter = null; }
        }
        try {
            return _dateFormatter
                ? _dateFormatter.format(new Date(timestamp))
                : new Date(timestamp).toLocaleString();
        } catch (e) {
            return new Date(timestamp).toLocaleString();
        }
    }

    function getSiteLabel() {
        const host = (location.hostname || '').toLowerCase();
        if (host === 'music.youtube.com') return STRINGS.sites.music;
        if (host === 'tv.youtube.com') return STRINGS.sites.tv;
        if (host === 'm.youtube.com') return STRINGS.sites.mobile;
        if (host === 'www.youtube-nocookie.com') return STRINGS.sites.noCookie;
        if (host === 'youtubekids.com' || host === 'www.youtubekids.com') return STRINGS.sites.kids;
        return STRINGS.sites.youtube;
    }

    function getSurfaceLabel() {
        try {
            const pathname = location.pathname || '/';
            if (pathname === '/watch') return STRINGS.surfaces.watch;
            if (pathname.startsWith('/shorts')) return STRINGS.surfaces.shorts;
            if (pathname.startsWith('/results')) return STRINGS.surfaces.search;
            if (pathname.startsWith('/playlist')) return STRINGS.surfaces.playlist;
            if (pathname.startsWith('/feed/subscriptions')) return STRINGS.surfaces.subscriptions;
            if (pathname.startsWith('/feed/history')) return STRINGS.surfaces.history;
            if (pathname.startsWith('/feed/library')) return STRINGS.surfaces.library;
            if (pathname.startsWith('/channel') || pathname.startsWith('/@') || pathname.startsWith('/c/')) return STRINGS.surfaces.channel;
            if (pathname.startsWith('/live')) return STRINGS.surfaces.live;
            if (pathname.startsWith('/browse')) return STRINGS.surfaces.browse;
            if (pathname === '/' || pathname === '') return STRINGS.surfaces.home;
        } catch (e) { /* ignore */ }
        return STRINGS.surfaces.current;
    }

    function getControlCenterAccessLabel() {
        return IS_EXTENSION_BUILD ? STRINGS.access.toolbarButton : STRINGS.access.userscriptMenu;
    }

    function getControlCenterAccessHint() {
        return IS_EXTENSION_BUILD
            ? STRINGS.access.extensionHint
            : STRINGS.access.userscriptHint;
    }

    function normalizeSettingsQuery(value) {
        return String(value || '').trim().toLowerCase();
    }

    function matchesSettingsQuery(query, ...values) {
        if (!query) return true;
        return values.some(value => String(value || '').toLowerCase().includes(query));
    }

    function isSectionExpanded(sectionId, defaultOpen = false) {
        if (normalizeSettingsQuery(state.settingsQuery)) return true;
        if (!sectionId) return defaultOpen;
        return state.openSections.has(sectionId) || defaultOpen;
    }

    function setSectionExpanded(sectionId, expanded) {
        if (!sectionId || normalizeSettingsQuery(state.settingsQuery)) return;
        if (expanded) state.openSections.add(sectionId);
        else state.openSections.delete(sectionId);
    }

    function prefersReducedMotion() {
        try {
            return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        } catch (e) {
            return false;
        }
    }

    function getRuleCount() {
        return state.filters?.filterCount
            || (state.filters?.cosmeticSelectors?.length || 0) + (state.filters?.upsellSelectors?.length || 0);
    }

    function getFilterSourceLabel(source = state.filterSource) {
        return STRINGS.filters.sourceLabels[source] || STRINGS.filters.sourceLabels.custom;
    }

    function getFilterSourceTone(source = state.filterSource) {
        if (state.filterError) return 'warn';
        switch (source) {
            case 'remote':
                return 'success';
            case 'cached':
            case 'stale':
                return 'info';
            default:
                return 'neutral';
        }
    }

    function getFilterIntegrityLabel() {
        switch (state.filterIntegrity) {
            case 'verified':
                return STRINGS.filters.integrityLabels.verified;
            case 'unsigned-custom':
                return STRINGS.filters.integrityLabels['unsigned-custom'];
            case 'failed':
                return STRINGS.filters.integrityLabels.failed;
            case 'cached':
                return STRINGS.filters.integrityLabels.cached;
            case 'built-in':
                return STRINGS.filters.integrityLabels['built-in'];
            default:
                return STRINGS.filters.integrityLabels.unknown;
        }
    }

    function getFilterIntegrityTone() {
        switch (state.filterIntegrity) {
            case 'verified':
                return 'success';
            case 'unsigned-custom':
            case 'failed':
                return 'warn';
            case 'cached':
                return 'info';
            default:
                return 'neutral';
        }
    }

    function isDefaultFilterUrl(value = resolveFilterUrl()) {
        return String(value || '').trim() === FILTER_URL_DEFAULT;
    }

    // Use the canonical feature set (DEFAULT_FILTERS.features) so counts stay
    // consistent even if an older cached filter payload carries orphan keys
    // that the current UI doesn't expose.
    function getFeatureCount() {
        return Object.keys(DEFAULT_FILTERS.features).length;
    }

    function getEnabledFeatureCount() {
        const features = normalizeFeatures(state.features);
        let count = 0;
        for (const key of Object.keys(DEFAULT_FILTERS.features)) {
            if (features[key]) count++;
        }
        return count;
    }

    function getFeatureGroupTone(enabledCount, total) {
        if (enabledCount <= 0) return 'warn';
        if (enabledCount >= total) return 'success';
        return 'info';
    }

    function getProtectionSummary() {
        if (!isEnabled()) {
            return STRINGS.protectionSummary.paused;
        }

        if (state.filterSyncing) {
            return STRINGS.protectionSummary.refreshing;
        }

        if (state.filterError) {
            return {
                label: 'Protected',
                tone: 'warn',
                description: state.filterError
            };
        }

        if (state.filterSource === 'remote') {
            return {
                label: STRINGS.protectionSummary.protected,
                tone: 'success',
                description: STRINGS.protectionSummary.remoteDescription
            };
        }

        if (state.filterSource === 'cached') {
            return {
                label: STRINGS.protectionSummary.protected,
                tone: 'info',
                description: STRINGS.protectionSummary.cachedDescription
            };
        }

        if (state.filterSource === 'stale') {
            return {
                label: STRINGS.protectionSummary.protected,
                tone: 'info',
                description: STRINGS.protectionSummary.staleDescription
            };
        }

        return {
            label: STRINGS.protectionSummary.protected,
            tone: 'success',
            description: STRINGS.protectionSummary.builtInDescription
        };
    }

    function getInjectionTimingStatus() {
        const readyState = SCRIPT_EVAL_READY_STATE || STRINGS.common.unknown;
        const elapsedMs = Number.isFinite(SCRIPT_EVAL_ELAPSED_MS) ? SCRIPT_EVAL_ELAPSED_MS : null;
        const lateByReadyState = readyState !== 'loading' && readyState !== 'unknown';
        const lateByTime = elapsedMs !== null && elapsedMs > LATE_INJECTION_THRESHOLD_MS;
        const likelyLate = lateByReadyState || lateByTime;
        const elapsedText = elapsedMs === null ? 'unknown timing' : `${elapsedMs}ms after navigation start`;

        if (!likelyLate) {
            return {
                title: STRINGS.injectionTiming.confirmedTitle,
                tone: 'success',
                likelyLate: false,
                readyState,
                elapsedMs,
                description: STRINGS.injectionTiming.confirmedDescription(readyState, elapsedText)
            };
        }

        const product = IS_EXTENSION_BUILD
            ? STRINGS.injectionTiming.extensionProduct
            : STRINGS.injectionTiming.userscriptProduct;
        return {
            title: STRINGS.injectionTiming.lateTitle,
            tone: 'warn',
            likelyLate: true,
            readyState,
            elapsedMs,
            description: STRINGS.injectionTiming.lateDescription(readyState, elapsedText, product)
        };
    }

    /* =========================================================================
     * FILTER PARSER (uBO filter list format)
     * ===================================================================== */

    // Bounds on parsed filter list — DoS and pathological-list safety.
    // A remote list that tries to inject tens of thousands of selectors
    // would tank cosmetic CSS performance and could be used to freeze the
    // tab. These caps stop parsing once exceeded.
    const FILTER_PARSE_MAX_LINES = 50000;
    const FILTER_MAX_COSMETIC_SELECTORS = 5000;
    const FILTER_MAX_UPSELL_SELECTORS = 500;
    const FILTER_MAX_PRUNE_KEYS = 500;
    const FILTER_MAX_SET_UNDEFINED = 500;
    const FILTER_MAX_SELECTOR_LENGTH = 400;
    const FILTER_MAX_INTERCEPT_PATTERNS = 100;
    const FILTER_MAX_INTERCEPT_PATTERN_LENGTH = 200;
    const SAFE_DOTTED_PATH_RE = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;
    const SAFE_PLAIN_KEY_RE = /^[A-Za-z_$][\w$]*$/;

    // Reject selectors that could carry an inline CSS payload — braces,
    // semicolons, CSS comment terminators, newlines, or characters that
    // make no sense in a selector. The cosmetic CSS sheet is generated as
    // `SELECTOR { display: none !important; }` so a selector containing
    // `{`/`}` can escape its rule block and inject arbitrary styling
    // (including `background: url(//attacker.example/leak)` which the
    // browser will fetch on render). See issue: filter-list supply chain.
    const CSS_SELECTOR_DISALLOWED = /[{};<>]|\/\*|\*\//;

    function isSafeCosmeticSelector(selector) {
        if (typeof selector !== 'string') return false;
        if (!selector) return false;
        if (selector.length > FILTER_MAX_SELECTOR_LENGTH) return false;
        if (CSS_SELECTOR_DISALLOWED.test(selector)) return false;
        if (/[\r\n\u2028\u2029]/.test(selector)) return false;
        return true;
    }

    function sanitizeDottedPathList(values, maxCount) {
        const clean = [];
        if (!Array.isArray(values)) return clean;
        for (const value of values) {
            if (clean.length >= maxCount) break;
            if (typeof value !== 'string') continue;
            const normalized = value.replace(/\[-\]\./g, '').trim();
            if (!normalized || !SAFE_DOTTED_PATH_RE.test(normalized)) continue;
            if (['important', 'legacyImportant', 'no_ads'].includes(normalized)) continue;
            clean.push(normalized);
        }
        return [...new Set(clean)];
    }

    function sanitizeSelectorList(values, maxCount) {
        const clean = [];
        if (!Array.isArray(values)) return clean;
        for (const value of values) {
            if (clean.length >= maxCount) break;
            if (!isSafeCosmeticSelector(value)) continue;
            clean.push(value.trim());
        }
        return [...new Set(clean)];
    }

    function sanitizeInterceptPatterns(values) {
        const clean = [];
        if (!Array.isArray(values)) return clean;
        for (const value of values) {
            if (clean.length >= FILTER_MAX_INTERCEPT_PATTERNS) break;
            if (typeof value !== 'string') continue;
            const normalized = value.trim();
            if (!normalized || normalized.length > FILTER_MAX_INTERCEPT_PATTERN_LENGTH) continue;
            clean.push(normalized);
        }
        return [...new Set(clean)];
    }

    function sanitizeReplaceKeys(value) {
        const clean = {};
        if (!value || typeof value !== 'object') return clean;
        for (const [key, replacement] of Object.entries(value)) {
            if (!SAFE_PLAIN_KEY_RE.test(String(key || ''))) continue;
            if (typeof replacement !== 'string' || !replacement.trim()) continue;
            clean[key] = replacement.trim();
        }
        return clean;
    }

    function splitScriptletArgs(argsStr) {
        const parts = [];
        let current = '';
        let quote = '';
        let escaped = false;
        for (const ch of String(argsStr || '')) {
            if (escaped) {
                current += ch;
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                current += ch;
                escaped = true;
                continue;
            }
            if (quote) {
                current += ch;
                if (ch === quote) quote = '';
                continue;
            }
            if (ch === '"' || ch === "'") {
                quote = ch;
                current += ch;
                continue;
            }
            if (ch === ',') {
                parts.push(current.trim());
                current = '';
                continue;
            }
            current += ch;
        }
        if (current.trim() || argsStr) parts.push(current.trim());
        return parts;
    }

    function unwrapScriptletLiteral(value) {
        let out = String(value || '').trim();
        for (let i = 0; i < 2; i++) {
            if (out.length >= 2 && ((out[0] === '"' && out[out.length - 1] === '"') || (out[0] === "'" && out[out.length - 1] === "'"))) {
                out = out.slice(1, -1).replace(/\\(["'])/g, '$1').trim();
            }
        }
        return out;
    }

    function addTrustedResponseReplacement(argsStr, replaceKeys) {
        const parts = splitScriptletArgs(argsStr);
        if (parts.length < 2) return false;
        const sourceKey = unwrapScriptletLiteral(parts[0]);
        const replacement = unwrapScriptletLiteral(parts[1]);
        if (!SAFE_PLAIN_KEY_RE.test(sourceKey)) return false;
        if (!SAFE_PLAIN_KEY_RE.test(replacement)) return false;
        replaceKeys[sourceKey] = replacement;
        return true;
    }

    function isSupportedDomBypassScriptlet(argsStr) {
        const parts = splitScriptletArgs(argsStr).map(part => unwrapScriptletLiteral(part));
        return parts[0] === 'Node.prototype.appendChild' && ['fetch', 'Request', 'JSON.parse'].includes(parts[1]);
    }

    function isSupportedNanoStbScriptlet(argsStr) {
        const parts = splitScriptletArgs(argsStr).map(part => unwrapScriptletLiteral(part));
        return parts.some(part => part === '17000');
    }

    function summarizeScriptlets(mapLike) {
        const out = [];
        if (!mapLike) return out;
        if (mapLike instanceof Map) {
            for (const [name, count] of mapLike.entries()) {
                if (name) out.push({ name, count: Math.max(0, Number(count) || 0) });
            }
        } else if (Array.isArray(mapLike)) {
            for (const item of mapLike) {
                if (!item || typeof item !== 'object' || !item.name) continue;
                out.push({ name: String(item.name).slice(0, 80), count: Math.max(0, Number(item.count) || 0) });
            }
        }
        return out.sort((a, b) => a.name.localeCompare(b.name));
    }

    function sanitizeFilterCoverage(value, fallback) {
        const src = value && typeof value === 'object' ? value : {};
        const base = fallback && typeof fallback === 'object' ? fallback : {};
        return {
            appliedSelectors: Math.max(0, Number(src.appliedSelectors ?? base.appliedSelectors) || 0),
            appliedPrunePaths: Math.max(0, Number(src.appliedPrunePaths ?? base.appliedPrunePaths) || 0),
            networkOnlyRules: Math.max(0, Number(src.networkOnlyRules ?? base.networkOnlyRules) || 0),
            droppedUnsafeSelectors: Math.max(0, Number(src.droppedUnsafeSelectors ?? base.droppedUnsafeSelectors) || 0),
            supportedScriptlets: summarizeScriptlets(src.supportedScriptlets || base.supportedScriptlets),
            unsupportedScriptlets: summarizeScriptlets(src.unsupportedScriptlets || base.unsupportedScriptlets)
        };
    }

    function sanitizeFilterPayload(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

        const pruneKeys = sanitizeDottedPathList(value.pruneKeys, FILTER_MAX_PRUNE_KEYS);
        const setUndefined = sanitizeDottedPathList(value.setUndefined, FILTER_MAX_SET_UNDEFINED);
        const cosmeticSelectors = sanitizeSelectorList(value.cosmeticSelectors, FILTER_MAX_COSMETIC_SELECTORS);
        const upsellSelectors = sanitizeSelectorList(value.upsellSelectors, FILTER_MAX_UPSELL_SELECTORS);
        const interceptPatterns = sanitizeInterceptPatterns(value.interceptPatterns);
        const replaceKeys = sanitizeReplaceKeys(value.replaceKeys);
        const coverage = sanitizeFilterCoverage(value.coverage, {
            appliedSelectors: cosmeticSelectors.length + upsellSelectors.length,
            appliedPrunePaths: pruneKeys.length + setUndefined.length
        });
        const features = normalizeFeatures(
            value.features && typeof value.features === 'object'
                ? value.features
                : {}
        );

        const filterCountRaw = Number(value.filterCount);
        const filterCount = Number.isFinite(filterCountRaw) && filterCountRaw >= 0
            ? Math.floor(filterCountRaw)
            : pruneKeys.length + setUndefined.length + cosmeticSelectors.length + upsellSelectors.length;

        return {
            version: (typeof value.version === 'string' && value.version.trim())
                ? value.version.trim().slice(0, 80)
                : new Date().toISOString().slice(0, 10),
            updated: (typeof value.updated === 'string' && value.updated.trim())
                ? value.updated.trim().slice(0, 80)
                : new Date().toISOString().slice(0, 10),
            filterCount,
            pruneKeys: [...new Set([...DEFAULT_FILTERS.pruneKeys, ...pruneKeys])],
            setUndefined: [...new Set([...DEFAULT_FILTERS.setUndefined, ...setUndefined])],
            replaceKeys: { ...DEFAULT_FILTERS.replaceKeys, ...replaceKeys },
            interceptPatterns: [...new Set([...DEFAULT_FILTERS.interceptPatterns, ...interceptPatterns])],
            cosmeticSelectors: [...new Set([...DEFAULT_FILTERS.cosmeticSelectors, ...cosmeticSelectors])],
            upsellSelectors: [...new Set([...DEFAULT_FILTERS.upsellSelectors, ...upsellSelectors])],
            coverage,
            features
        };
    }

    function parseUBOFilterList(text) {
        // Short-circuit pathological line counts before allocating Sets
        // and running full regex per line.
        const rawLines = text.split('\n');
        const lineLimit = Math.min(rawLines.length, FILTER_PARSE_MAX_LINES);
        const cosmeticSelectors = new Set();
        const cosmeticExceptions = new Set();
        const upsellSelectors = new Set();
        const setUndefined = new Set();
        const pruneKeys = new Set();
        const replaceKeys = {};
        const supportedScriptlets = new Map();
        const unsupportedScriptlets = new Map();
        let networkOnlyRules = 0;
        let filterCount = 0;
        let droppedUnsafeSelectors = 0;

        function countScriptlet(target, name) {
            target.set(name, (target.get(name) || 0) + 1);
        }

        for (let li = 0; li < lineLimit; li++) {
            const line = rawLines[li].trim();
            if (!line || line.charCodeAt(0) === 33 /* ! */) continue;

            // Skip conditional compilation directives
            if (line.startsWith('!#')) continue;

            // Cosmetic exception rules (domain#@#selector) — exclude from hiding
            const exMatch = line.match(/^[^#]*#@#(.+)$/);
            if (exMatch) {
                const sel = exMatch[1].trim();
                if (sel) cosmeticExceptions.add(sel);
                continue;
            }

            // Scriptlet injection: ##+js(name, args...)
            const jsMatch = line.match(/#\+js\(([^,)]+)(?:,\s*(.+))?\)$/);
            if (jsMatch) {
                const [, scriptlet, argsStr] = jsMatch;
                const name = scriptlet.trim();

                if (name === 'set' && argsStr) {
                    const parts = splitScriptletArgs(argsStr);
                    if (parts.length >= 2 && parts[1] === 'undefined' && setUndefined.size < FILTER_MAX_SET_UNDEFINED) {
                        const path = parts[0];
                        // Only accept identifier.path syntax — reject anything with
                        // brackets, spaces, or characters that suggest code smuggling.
                        if (SAFE_DOTTED_PATH_RE.test(path)) {
                            setUndefined.add(path);
                        }
                    }
                    countScriptlet(supportedScriptlets, name);
                } else if (name === 'json-prune' || name === 'json-prune-fetch-response' || name === 'json-prune-xhr-response') {
                    countScriptlet(supportedScriptlets, name);
                } else if (name === 'trusted-replace-fetch-response' || name === 'trusted-replace-xhr-response') {
                    if (argsStr && addTrustedResponseReplacement(argsStr, replaceKeys)) {
                        countScriptlet(supportedScriptlets, name);
                    } else {
                        countScriptlet(unsupportedScriptlets, name);
                    }
                } else if (name === 'trusted-prevent-dom-bypass') {
                    if (argsStr && isSupportedDomBypassScriptlet(argsStr)) {
                        countScriptlet(supportedScriptlets, name);
                    } else {
                        countScriptlet(unsupportedScriptlets, name);
                    }
                } else if (name === 'nano-stb') {
                    if (argsStr && isSupportedNanoStbScriptlet(argsStr)) {
                        countScriptlet(supportedScriptlets, name);
                    } else {
                        countScriptlet(unsupportedScriptlets, name);
                    }
                } else {
                    countScriptlet(unsupportedScriptlets, name);
                }

                if ((name === 'json-prune' || name === 'json-prune-fetch-response' || name === 'json-prune-xhr-response') && argsStr) {
                    // First arg before any comma-separated options is space-delimited keys
                    const keysPart = argsStr.split(',')[0].trim();
                    for (const key of keysPart.split(/\s+/)) {
                        if (pruneKeys.size >= FILTER_MAX_PRUNE_KEYS) break;
                        const clean = key.replace(/\[-\]\./g, '');
                        // Same identifier discipline — refuse anything that looks
                        // like it could be used as a key-path injection vector.
                        if (!clean || ['important', 'legacyImportant', 'no_ads'].includes(clean)) continue;
                        if (!SAFE_DOTTED_PATH_RE.test(clean)) continue;
                        pruneKeys.add(clean);
                    }
                }

                filterCount++;
                continue;
            }

            // Cosmetic hiding rules: domain##selector
            const cosmMatch = line.match(/^([^#]*)##([^+^].*)$/);
            if (cosmMatch) {
                const selector = cosmMatch[2].trim();
                if (!selector || selector.startsWith('^')) continue;
                // Check if it's a :style() rule — skip those
                if (selector.includes(':style(')) continue;
                // Reject selectors that could smuggle CSS declarations out of
                // their rule block. This is the critical guardrail on remote
                // filter lists — without it, a malicious list could inject
                // `background: url(//attacker/leak)` and exfiltrate tokens
                // via rendered CSS.
                if (!isSafeCosmeticSelector(selector)) {
                    droppedUnsafeSelectors++;
                    continue;
                }
                // Upsell-related selectors
                if (selector.includes('popup-container') || selector.includes('upsell') || selector.includes('mealbar')) {
                    if (upsellSelectors.size < FILTER_MAX_UPSELL_SELECTORS) {
                        upsellSelectors.add(selector);
                    }
                } else if (cosmeticSelectors.size < FILTER_MAX_COSMETIC_SELECTORS) {
                    cosmeticSelectors.add(selector);
                }
                filterCount++;
                continue;
            }

            // Network block rules are counted (for UI) but not applied at
            // runtime — the proxy engines intercept the same URLs via
            // interceptPatterns instead. Counting keeps the rule count honest
            // without pretending we enforce them.
            if ((line.startsWith('||') || line.startsWith('*') || line.startsWith('/')) && !line.startsWith('@@')) {
                networkOnlyRules++;
                filterCount++;
                continue;
            }
        }

        // Remove exception selectors from both sets — the prior implementation
        // only pruned cosmeticSelectors, so an exception could not disable a
        // cosmetic rule that was classified as an upsell.
        for (const ex of cosmeticExceptions) {
            cosmeticSelectors.delete(ex);
            upsellSelectors.delete(ex);
        }

        if (droppedUnsafeSelectors > 0) {
            console.warn(`[${SCRIPT_NAME}] Dropped ${droppedUnsafeSelectors} remote selector(s) that failed the CSS-injection safety check.`);
        }

        return {
            version: new Date().toISOString().slice(0, 10),
            updated: new Date().toISOString().slice(0, 10),
            filterCount,
            pruneKeys: [...new Set([...DEFAULT_FILTERS.pruneKeys, ...pruneKeys])],
            setUndefined: [...new Set([...DEFAULT_FILTERS.setUndefined, ...setUndefined])],
            replaceKeys: { ...DEFAULT_FILTERS.replaceKeys, ...replaceKeys },
            interceptPatterns: DEFAULT_FILTERS.interceptPatterns,
            cosmeticSelectors: [...new Set([...DEFAULT_FILTERS.cosmeticSelectors, ...cosmeticSelectors])],
            upsellSelectors: [...new Set([...DEFAULT_FILTERS.upsellSelectors, ...upsellSelectors])],
            coverage: sanitizeFilterCoverage({
                appliedSelectors: cosmeticSelectors.size + upsellSelectors.size,
                appliedPrunePaths: pruneKeys.size + setUndefined.size + Object.keys(replaceKeys).length,
                networkOnlyRules,
                droppedUnsafeSelectors,
                supportedScriptlets: summarizeScriptlets(supportedScriptlets),
                unsupportedScriptlets: summarizeScriptlets(unsupportedScriptlets)
            }),
            features: { ...DEFAULT_FILTERS.features }
        };
    }

    /* =========================================================================
     * FILTER FETCHER
     * ===================================================================== */

    function resolveFilterUrl() {
        let url = getSetting('filter_url', FILTER_URL_DEFAULT);
        // Guard against a corrupted or malicious saved setting. If the stored
        // URL is not a valid http(s) URL, silently restore the default so the
        // user is never stranded with a broken source.
        if (!isValidHttpUrl(url)) {
            url = FILTER_URL_DEFAULT;
            try { setSetting('filter_url', url); } catch (e) { /* ignore */ }
        }
        return url;
    }

    function addCacheBust(url) {
        return url + (url.includes('?') ? '&' : '?') + '_=' + Date.now();
    }

    function normalizeFilterTextForSignature(text) {
        return String(text || '').replace(/\r\n?/g, '\n');
    }

    function isSignedDefaultFilterUrl(url) {
        return url === FILTER_URL_DEFAULT || FILTER_URL_MIRRORS.includes(url);
    }

    function getSignedFilterCompanionUrls(url) {
        const mirrorIndex = FILTER_URL_MIRRORS.indexOf(url);
        if (url === FILTER_URL_DEFAULT) {
            return {
                manifestUrl: FILTER_MANIFEST_URL_DEFAULT,
                signatureUrl: FILTER_SIGNATURE_URL_DEFAULT
            };
        }
        if (mirrorIndex >= 0) {
            return {
                manifestUrl: FILTER_MANIFEST_URL_MIRRORS[mirrorIndex],
                signatureUrl: FILTER_SIGNATURE_URL_MIRRORS[mirrorIndex]
            };
        }
        return null;
    }

    function base64ToBytes(value) {
        const clean = String(value || '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
        const padded = clean + '='.repeat((4 - clean.length % 4) % 4);
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function bytesToBase64Url(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    async function sha256Base64Url(text) {
        if (!crypto?.subtle || typeof TextEncoder !== 'function') {
            throw new Error(STRINGS.filters.webCryptoShaUnavailable);
        }
        const bytes = new TextEncoder().encode(normalizeFilterTextForSignature(text));
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return bytesToBase64Url(new Uint8Array(digest));
    }

    function sanitizeFilterManifest(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        if (value.schemaVersion !== 1 || value.algorithm !== 'Ed25519') return null;
        if (value.signedContent !== 'youtube-adblock-filters.txt') return null;
        if (value.signatureFile !== 'youtube-adblock-filters.txt.sig') return null;
        if (value.publicKey !== FILTER_PUBLIC_KEY_BASE64) return null;
        if (typeof value.sha256 !== 'string' || !value.sha256.trim()) return null;
        if (!Number.isFinite(Number(value.bytes)) || Number(value.bytes) <= 0) return null;
        return {
            sha256: value.sha256.trim(),
            bytes: Math.floor(Number(value.bytes)),
            updated: typeof value.updated === 'string' ? value.updated.trim().slice(0, 80) : ''
        };
    }

    async function verifyEd25519Signature(text, signatureBase64, publicKeyBase64 = FILTER_PUBLIC_KEY_BASE64) {
        if (!crypto?.subtle || typeof TextEncoder !== 'function') {
            throw new Error(STRINGS.filters.webCryptoEd25519Unavailable);
        }
        const key = await crypto.subtle.importKey(
            'spki',
            base64ToBytes(publicKeyBase64),
            { name: 'Ed25519' },
            false,
            ['verify']
        );
        const data = new TextEncoder().encode(normalizeFilterTextForSignature(text));
        return crypto.subtle.verify({ name: 'Ed25519' }, key, base64ToBytes(signatureBase64), data);
    }

    function gmFetchText(url, timeout = FILTER_FETCH_TIMEOUT_MS) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout,
                onload(resp) {
                    if (resp.status && (resp.status < 200 || resp.status >= 300)) {
                        const err = new Error(`Remote filter request returned HTTP ${resp.status}.`);
                        err.retryMirror = true;
                        reject(err);
                        return;
                    }
                    resolve(resp.responseText || '');
                },
                onerror() {
                    const err = new Error(STRINGS.filters.remoteRequestFailed);
                    err.retryMirror = true;
                    reject(err);
                },
                ontimeout() {
                    const err = new Error(STRINGS.filters.remoteRequestTimedOut);
                    err.retryMirror = true;
                    reject(err);
                }
            });
        });
    }

    async function fetchFilterTextWithIntegrity(fetchUrl) {
        const text = await gmFetchText(addCacheBust(fetchUrl));
        if (!isSignedDefaultFilterUrl(fetchUrl)) {
            return {
                text,
                integrity: 'unsigned-custom',
                message: STRINGS.filters.customSourceLoadedWithoutSignature
            };
        }

        const companions = getSignedFilterCompanionUrls(fetchUrl);
        if (!companions) throw new Error(STRINGS.filters.signedCompanionsUnavailable);
        const manifestRaw = await gmFetchText(addCacheBust(companions.manifestUrl));
        let manifest;
        try {
            manifest = sanitizeFilterManifest(jsonParseRaw(manifestRaw));
        } catch (e) {
            manifest = null;
        }
        if (!manifest) throw new Error(STRINGS.filters.signedManifestInvalid);

        const canonicalText = normalizeFilterTextForSignature(text);
        const expectedBytes = new TextEncoder().encode(canonicalText).length;
        if (manifest.bytes !== expectedBytes) throw new Error(STRINGS.filters.signedByteMismatch);
        const digest = await sha256Base64Url(canonicalText);
        if (digest !== manifest.sha256) throw new Error(STRINGS.filters.signedHashMismatch);

        const signature = await gmFetchText(addCacheBust(companions.signatureUrl));
        const verified = await verifyEd25519Signature(canonicalText, signature);
        if (!verified) throw new Error(STRINGS.filters.signedVerificationFailed);
        return {
            text: canonicalText,
            integrity: 'verified',
            message: STRINGS.filters.defaultVerified(manifest.updated)
        };
    }

    function fetchFilters(force = false) {
        const url = resolveFilterUrl();
        // Fresh cache skips the network call unless forced. Stale cache and
        // built-in defaults both benefit from a refresh attempt on startup.
        if (!force && state.filterSource === 'cached') return Promise.resolve(state.filters);
        // If an in-flight request is already targeting the same URL, reuse it.
        // Anything else (different URL, forced refresh) issues a fresh request
        // and supersedes the old one via the request-id token below.
        if (state.filterSyncing && state.filterRequestPromise && state.activeFilterRequestUrl === url) {
            return state.filterRequestPromise;
        }
        if (typeof GM_xmlhttpRequest !== 'function') {
            // No network privilege — stay on whatever we have.
            return Promise.resolve(state.filters);
        }

        // Single monotonic bump. Any in-flight callback that reads its
        // captured `requestId` after this assignment will see a mismatch
        // and treat itself as stale.
        const requestId = ++state.filterRequestId;
        state.activeFilterRequestUrl = url;
        const request = new Promise((resolve) => {
            state.filterSyncing = true;
            state.filterError = '';
            refreshSettingsUI();

            const isStaleRequest = () => {
                return requestId !== state.filterRequestId || url !== resolveFilterUrl();
            };

            const finish = () => {
                if (requestId === state.filterRequestId) {
                    state.filterSyncing = false;
                    state.filterRequestPromise = null;
                    state.activeFilterRequestUrl = '';
                }
            };

            // Build the list of URLs to attempt. The default URL gets
            // automatic mirror fallback; custom URLs are tried once only.
            const isDefault = url === FILTER_URL_DEFAULT;
            const urls = [url, ...(isDefault ? FILTER_URL_MIRRORS : [])];
            let urlIndex = 0;

            function attemptFetch() {
                const fetchUrl = urls[urlIndex];

                const tryNextMirror = () => {
                    urlIndex++;
                    if (urlIndex < urls.length && !isStaleRequest()) {
                        attemptFetch();
                    } else {
                        if (isStaleRequest()) { finish(); resolve(state.filters); return; }
                        state.filterError = urls.length > 1
                            ? STRINGS.filters.allSourcesUnreachable
                            : STRINGS.filters.remoteUnreachable;
                        finish();
                        resolve(state.filters);
                        refreshSettingsUI(true);
                        showToast(state.filterError, 'error');
                    }
                };

                fetchFilterTextWithIntegrity(fetchUrl).then(result => {
                    try {
                            const text = result.text || '';
                            if (text.length > FILTER_MAX_BYTES) {
                                throw new Error(STRINGS.filters.remoteTooLarge(Math.round(FILTER_MAX_BYTES / 1024 / 1024)));
                            }

                            let data;
                            if (text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) {
                                data = sanitizeFilterPayload(jsonParseRaw(text));
                                if (!data) throw new Error(STRINGS.filters.invalidJsonSchema);
                            } else {
                                data = sanitizeFilterPayload(parseUBOFilterList(text));
                            }

                            if (!data) throw new Error(STRINGS.filters.noUsableRules);
                            if (isStaleRequest()) { finish(); resolve(state.filters); return; }
                            state.filters = data;
                            state.filterSource = 'remote';
                            state.lastFilterUpdate = Date.now();
                            state.filterError = '';
                            state.filterIntegrity = result.integrity;
                            state.filterIntegrityMessage = result.message;
                            try {
                                setSetting('filters_cache', data);
                                setSetting('filters_cache_time', Date.now());
                                setSetting('filters_cache_url', url);
                                setSetting('filters_integrity', state.filterIntegrity);
                                setSetting('filters_integrity_message', state.filterIntegrityMessage);
                            } catch (e) { /* quota errors are non-fatal */ }
                            const overrides = getFeatureOverrides();
                            state.features = normalizeFeatures(data.features);
                            for (const [k, v] of Object.entries(overrides)) {
                                if (k in state.features) state.features[k] = !!v;
                            }
                            if (IS_EXTENSION_BUILD) state.features.dearrow = false;
                            updateCosmeticCSS();
                            try { installPropertyTraps(); } catch (e) { /* ignore */ }
                            finish();
                            resolve(data);
                            refreshSettingsUI(true);
                            const applied = data.filterCount || data.cosmeticSelectors?.length || 0;
                            showToast(STRINGS.filters.refreshComplete(applied, data.version, result.integrity), 'success');
                        } catch (e) {
                            console.warn(`[${SCRIPT_NAME}] Filter parse error:`, e);
                            if (isStaleRequest()) { finish(); resolve(state.filters); return; }
                            const detail = e && e.message ? e.message : '';
                            state.filterIntegrity = 'failed';
                            state.filterIntegrityMessage = detail || STRINGS.filters.couldNotVerifyOrParse;
                            state.filterError = detail
                                ? STRINGS.filters.ruleLibraryProblem(detail)
                                : STRINGS.filters.remoteParseFailed;
                            finish();
                            resolve(state.filters);
                            refreshSettingsUI(true);
                            showToast(state.filterError, 'error');
                        }
                }).catch(e => {
                    if (e && e.retryMirror) {
                        tryNextMirror();
                        return;
                    }
                    console.warn(`[${SCRIPT_NAME}] Filter integrity error:`, e);
                    if (isStaleRequest()) { finish(); resolve(state.filters); return; }
                    const detail = e && e.message ? e.message : STRINGS.filters.remoteVerificationFailed;
                    state.filterIntegrity = 'failed';
                    state.filterIntegrityMessage = detail;
                    state.filterError = STRINGS.filters.ruleLibraryProblem(detail);
                    finish();
                    resolve(state.filters);
                    refreshSettingsUI(true);
                    showToast(state.filterError, 'error');
                });
            }

            attemptFetch();
        });
        state.filterRequestPromise = request;
        return request;
    }

    /* =========================================================================
     * UTILITY: Deep key access / pruning
     * ===================================================================== */

    function deleteNestedKey(obj, path) {
        const keys = path.split('.');
        let current = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (current == null || typeof current !== 'object') return false;
            current = current[keys[i]];
        }
        if (current != null && typeof current === 'object') {
            const lastKey = keys[keys.length - 1];
            if (lastKey in current) {
                delete current[lastKey];
                return true;
            }
        }
        return false;
    }

    function pruneObject(obj, context) {
        if (!obj || typeof obj !== 'object') return false;
        if (state.features.adAllowlist && obj.videoDetails && (obj.videoDetails.author || obj.videoDetails.channelId)) {
            if (isChannelAdAllowed({
                name: obj.videoDetails.author || '',
                channelId: obj.videoDetails.channelId || ''
            })) return false;
        }
        let pruned = false;
        const keys = state.filters?.pruneKeys || DEFAULT_FILTERS.pruneKeys;
        for (const keyPath of keys) {
            if (deleteNestedKey(obj, keyPath)) pruned = true;
        }
        // Shorts ad pruning — scoped by URL because a generic `entries` array
        // exists in many unrelated YouTube payloads; the previous implementation
        // applied this filter to every parsed JSON object site-wide, which
        // could silently remove non-ad entries from other feeds.
        if (state.features.shortsAdBlock && Array.isArray(obj.entries)) {
            const url = typeof context === 'string' ? context : context?.url;
            if (url && /reel_watch_sequence|\/reel\b/.test(url)) {
                const before = obj.entries.length;
                obj.entries = obj.entries.filter(entry => {
                    return !entry?.command?.reelWatchEndpoint?.adClientParams?.isAd;
                });
                if (obj.entries.length !== before) pruned = true;
            }
        }
        // v0.4.0: apply user blocklists (channels + keywords) during the
        // same walk. The walk only runs when at least one list is non-empty
        // so the common case (both empty) pays zero cost.
        if (isEnabled() && (state.features.channelBlocker || state.features.keywordBlocker)) {
            const channels = getChannelBlocklist();
            const keywords = getKeywordBlocklist();
            if (channels.length || keywords.length) {
                const dropped = feedFilterWalk(obj, channels, keywords);
                if (dropped > 0) {
                    incrementStat('feedFiltered', dropped);
                    pruned = true;
                }
            }
        }
        if (pruned) incrementStat('pruned');
        return pruned;
    }

    let interceptPatternCompiled = null;
    let interceptPatternSource = null;

    function matchesInterceptPattern(url) {
        if (!url) return false;
        const patterns = state.filters?.interceptPatterns || DEFAULT_FILTERS.interceptPatterns;
        // Compile to a single RegExp once per patterns-array identity. The
        // fetch/XHR proxies call this on every request; replacing N repeated
        // `String#includes` iterations with a single regex match keeps the
        // hot path lean.
        if (interceptPatternSource !== patterns) {
            interceptPatternSource = patterns;
            const escaped = patterns
                .filter(p => typeof p === 'string' && p.length)
                .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            interceptPatternCompiled = escaped.length ? new RegExp(escaped.join('|')) : null;
        }
        return interceptPatternCompiled ? interceptPatternCompiled.test(url) : false;
    }

    // Cache compiled key→replacement pairs so hot fetch/XHR interception paths
    // don't recompile RegExp objects on every response.
    let replaceAdKeysCache = null;
    let replaceAdKeysSource = null;

    function getReplaceAdKeysPairs() {
        const rk = state.filters?.replaceKeys || DEFAULT_FILTERS.replaceKeys;
        if (replaceAdKeysSource === rk && replaceAdKeysCache) return replaceAdKeysCache;
        replaceAdKeysSource = rk;
        replaceAdKeysCache = Object.entries(rk).map(([key, replacement]) => [
            new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'),
            `"${replacement}"`
        ]);
        return replaceAdKeysCache;
    }

    function replaceAdKeys(text) {
        if (typeof text !== 'string') return text;
        let modified = text;
        for (const [regex, replacement] of getReplaceAdKeysPairs()) {
            modified = modified.replace(regex, replacement);
        }
        return modified;
    }

    const MANIFEST_URL_RE = /(?:googlevideo\.com\/videoplayback|\/api\/manifest\/|\.m3u8(?:[?#]|$)|\.mpd(?:[?#]|$))/i;
    const MANIFEST_TEXT_CT_RE = /(?:mpegurl|dash\+xml|application\/xml|text\/xml|text\/plain)/i;
    const MANIFEST_AD_TIER_RE = /(?:[?&]|\b)ctier=(?:SA|SR)\b/i;
    const MANIFEST_HLS_TAGS_TO_DROP = /^(#EXTINF|#EXT-X-BYTERANGE|#EXT-X-PROGRAM-DATE-TIME|#EXT-X-DISCONTINUITY)\b/i;
    const DASH_AD_ELEMENT_PATTERNS = [
        /<Representation\b[^>]*(?:[?&]|\b)ctier=(?:SA|SR)\b[\s\S]*?<\/Representation>/gi,
        /<Representation\b(?=[^>]*\bid=["'][^"']*(?:ad|sabr|ssai)[^"']*["'])[^>]*>[\s\S]*?(?:[?&]|\b)ctier=(?:SA|SR)\b[\s\S]*?<\/Representation>/gi,
        /<SegmentURL\b[^>]*(?:[?&]|\b)ctier=(?:SA|SR)\b[^>]*\/?>/gi,
        /<BaseURL\b[^>]*>[^<]*(?:[?&]|\b)ctier=(?:SA|SR)\b[^<]*<\/BaseURL>/gi
    ];

    function manifestUrlMightNeedScrub(url) {
        return typeof url === 'string' && MANIFEST_URL_RE.test(url);
    }

    function manifestContentTypeIsText(contentType) {
        return !contentType || MANIFEST_TEXT_CT_RE.test(contentType);
    }

    function manifestTextMightContainAds(text) {
        return typeof text === 'string' && MANIFEST_AD_TIER_RE.test(text);
    }

    function scrubAdManifestText(text) {
        if (!manifestTextMightContainAds(text)) {
            return { changed: false, text, removed: 0 };
        }

        let removed = 0;
        let rewritten = String(text);
        for (const pattern of DASH_AD_ELEMENT_PATTERNS) {
            rewritten = rewritten.replace(pattern, match => {
                removed++;
                return '';
            });
        }

        const newline = rewritten.includes('\r\n') ? '\r\n' : '\n';
        const lines = rewritten.split(/\r?\n/);
        const kept = [];
        for (const line of lines) {
            if (MANIFEST_AD_TIER_RE.test(line)) {
                removed++;
                while (kept.length && MANIFEST_HLS_TAGS_TO_DROP.test(kept[kept.length - 1])) {
                    kept.pop();
                }
                continue;
            }
            kept.push(line);
        }
        rewritten = kept.join(newline);
        return {
            changed: removed > 0 && rewritten !== text,
            text: rewritten,
            removed
        };
    }

    // Fast substring-based "could this response contain ad keys?" test.
    // Browse/search/next responses on YouTube are often 100-500KB; parsing
    // JSON + walking the tree on EVERY intercepted response (not just ones
    // that actually contain ad payloads) is measurable overhead. The hint
    // set is built once per-pruneKeys-identity and each check is O(n) over
    // the hint tokens (all short literals — Array#some + String#includes
    // with SIMD-optimized paths in modern engines).
    let adHintsCompiled = null;
    let adHintsSource = null;

    function getAdHints() {
        const keys = state.filters?.pruneKeys || DEFAULT_FILTERS.pruneKeys;
        if (adHintsSource === keys && adHintsCompiled) return adHintsCompiled;
        adHintsSource = keys;
        // Use the leaf name of each prune path plus the replaceKeys targets.
        // Quoted form matches the exact JSON field name rather than e.g. a
        // substring in base64 content.
        const set = new Set();
        for (const path of keys) {
            const leaf = String(path).split('.').pop();
            if (leaf) set.add(`"${leaf}"`);
        }
        for (const key of Object.keys(state.filters?.replaceKeys || DEFAULT_FILTERS.replaceKeys)) {
            set.add(`"${key}"`);
        }
        adHintsCompiled = [...set];
        return adHintsCompiled;
    }

    // Shorts ad-pruning uses a URL-scoped path (`entries[].command.reelWatchEndpoint.adClientParams.isAd`)
    // that isn't in pruneKeys, so the generic ad-key hint set would
    // false-negative on reel responses. Scope-specific hints keep that
    // path in the slow lane.
    const SHORTS_URL_RE = /reel_watch_sequence|\/reel\b/;

    function responseTextMightContainAds(text, url) {
        if (typeof text !== 'string' || !text) return false;
        if (url && SHORTS_URL_RE.test(url) && state.features && state.features.shortsAdBlock) {
            // Reel payloads always include an `entries` array; check for
            // the isAd marker explicitly rather than deferring to the
            // generic prune-key hints.
            if (text.indexOf('"isAd"') !== -1) return true;
        }
        const hints = getAdHints();
        for (let i = 0; i < hints.length; i++) {
            if (text.indexOf(hints[i]) !== -1) return true;
        }
        return false;
    }

    // Parse using the pre-proxy JSON.parse so internal parsing of filter
    // payloads, outbound request bodies, and proxy-internal work does not
    // re-enter the JSON.parse proxy (which would run pruneObject against
    // payloads that by definition have no ad keys).
    function jsonParseRaw(text) {
        const parse = state.originals.jsonParse || JSON.parse;
        return parse.call(JSON, text);
    }

    /* =========================================================================
     * ENGINE: JSON.parse Proxy
     * ===================================================================== */

    function safeOverride(obj, prop, newValue, label) {
        // Detect pre-proxied natives before we attempt the override. If
        // the current value is a function whose toString doesn't print
        // [native code], another extension likely already hooked it.
        // Record this for the coexistence notice — it's not a failure,
        // but it explains unexpected behavior in diagnostics.
        try {
            const current = obj[prop];
            if (typeof current === 'function') {
                const src = Function.prototype.toString.call(current);
                if (typeof src === 'string' && !src.includes('[native code]')) {
                    state.preProxiedNatives = state.preProxiedNatives || [];
                    state.preProxiedNatives.push(label || String(prop));
                }
            }
        } catch (e) { /* hostile getter or cross-origin — skip detection */ }
        try {
            obj[prop] = newValue;
            return true;
        } catch (e) { /* direct assign failed */ }
        try {
            Object.defineProperty(obj, prop, {
                value: newValue, writable: true, configurable: true, enumerable: true
            });
            return true;
        } catch (e) { /* defineProperty failed */ }
        try {
            delete obj[prop];
            Object.defineProperty(obj, prop, {
                value: newValue, writable: true, configurable: true, enumerable: true
            });
            return true;
        } catch (e) {
            // Another script (YouTube's locker script, or another YouTube
            // adblock userscript) already locked the property
            // non-configurably. Record the loss so installProxies can mark
            // the owning engine degraded and the Control Center can surface
            // it; downstream engines still do their part.
            state.overrideFailures.push(label || String(prop));
            console.warn(`[${SCRIPT_NAME}] Could not override ${label || prop}. Another script may have already locked it.`);
            return false;
        }
    }

    /* =========================================================================
     * ENGINE: Function.prototype.toString mask
     * =========================================================================
     * The #1 adblock-detection path is Function.prototype.toString against our
     * hooked natives — a patched `JSON.parse.toString()` returns the proxy
     * source, which is obviously NOT `[native code]`. We patch toString ONCE,
     * before any other engine installs, and route proxied functions through
     * a WeakMap back to the original's toString output. Every subsequent
     * engine calls `registerNativeMask(proxy, original)` so detection
     * sees the unmodified native source.
     * ===================================================================== */

    const nativeMaskMap = new WeakMap();
    let nativeToStringOriginal = null;

    function registerNativeMask(fake, original) {
        try {
            if (typeof fake !== 'function' || typeof original !== 'function') return;
            nativeMaskMap.set(fake, original);
        } catch (e) { /* ignore */ }
    }

    function installNativeToStringMask() {
        if (!state.features.nativeToStringMask) return;
        const originalToString = Function.prototype.toString;
        nativeToStringOriginal = originalToString;
        state.originals.functionToString = originalToString;
        const proxied = new Proxy(originalToString, {
            apply(target, thisArg, args) {
                try {
                    if (typeof thisArg === 'function' && nativeMaskMap.has(thisArg)) {
                        const original = nativeMaskMap.get(thisArg);
                        return Reflect.apply(target, original, args);
                    }
                } catch (e) { /* fall through to real toString */ }
                return Reflect.apply(target, thisArg, args);
            }
        });
        // Register the mask on itself so toString.toString() still prints
        // `function toString() { [native code] }` — otherwise the mask itself
        // becomes a detection vector.
        nativeMaskMap.set(proxied, originalToString);
        safeOverride(Function.prototype, 'toString', proxied, 'Function.prototype.toString');
    }

    function installJSONParseProxy() {
        const original = JSON.parse;
        state.originals.jsonParse = original;

        const proxied = new Proxy(original, {
            apply(target, thisArg, args) {
                const result = Reflect.apply(target, thisArg, args);
                try {
                    if (isEnabled() && state.features.jsonParsePrune && result && typeof result === 'object') {
                        if (pruneObject(result)) incrementStat('blocked');
                    }
                } catch (e) { /* fail silently */ }
                return result;
            }
        });

        registerNativeMask(proxied, original);
        safeOverride(JSON, 'parse', proxied, 'JSON.parse');
    }

    /* =========================================================================
     * ENGINE: fetch() Proxy
     * ===================================================================== */

    // Outbound no-ad request signal (feature key: requestBodyModify).
    // Setting `playbackContext.contentPlaybackContext.isInlinePlaybackNoAd: true`
    // on InnerTube /player requests makes the server return no ad payload and
    // no SABR fake-buffering backoff. Unlike the retired clientScreen spoof
    // (issue #2), this flag is purely additive: it never changes the response
    // shape, and we only annotate a contentPlaybackContext that already
    // exists — parents are never fabricated, so a malformed body can't gain
    // structure it didn't have.
    const PLAYER_ENDPOINT_RE = /\/youtubei\/v1\/(?:player|get_watch)(?:\?|$)/;

    function injectNoAdFlag(obj) {
        try {
            if (!obj || typeof obj !== 'object') return false;
            const ctx = (obj.playbackContext && obj.playbackContext.contentPlaybackContext) ||
                obj.contentPlaybackContext;
            if (ctx && typeof ctx === 'object' && ctx.isInlinePlaybackNoAd !== true) {
                ctx.isInlinePlaybackNoAd = true;
                return true;
            }
        } catch (e) { /* foreign object with hostile getters — leave it alone */ }
        return false;
    }

    // Returns the rewritten JSON body string, or null when nothing changed
    // (non-JSON body, no contentPlaybackContext, or flag already present).
    function rewriteRequestBodyText(text) {
        if (typeof text !== 'string' || !text || text.indexOf('contentPlaybackContext') === -1) {
            return null;
        }
        try {
            const parse = state.originals.jsonParse || JSON.parse;
            const body = parse.call(JSON, text);
            if (injectNoAdFlag(body)) return JSON.stringify(body);
        } catch (e) { /* not JSON — pass through untouched */ }
        return null;
    }

    function installFetchProxy() {
        const originalFetch = window.fetch;
        state.originals.fetch = originalFetch;
        const proxiedFetch = new Proxy(originalFetch, {
            apply(target, thisArg, args) {
                const request = args[0];
                let url = '';
                if (typeof request === 'string') url = request;
                else if (request && typeof request.url === 'string') url = request.url;
                else if (request && typeof URL !== 'undefined' && request instanceof URL) url = request.href;

                if (!isEnabled()) {
                    return Reflect.apply(target, thisArg, args);
                }

                // Outbound no-ad signal on player requests. Historical note:
                // an earlier clientScreen='CHANNEL' spoof here returned
                // playabilityStatus=UNPLAYABLE with no streamingData and broke
                // playback (issue #2, removed in v0.4.1/v0.5.0). The
                // isInlinePlaybackNoAd flag is additive-only and safe.
                // Only `fetch(url, init)` string bodies are handled — YouTube's
                // InnerTube client builds requests that way; Request-object
                // bodies would force an async clone and aren't used by YT.
                if (state.features.requestBodyModify && PLAYER_ENDPOINT_RE.test(url)) {
                    try {
                        const init = args[1];
                        if (init && typeof init.body === 'string') {
                            const rewritten = rewriteRequestBodyText(init.body);
                            if (rewritten !== null) args[1] = { ...init, body: rewritten };
                        }
                    } catch (e) { /* never block the request over a rewrite */ }
                }

                const shouldPruneJsonResponse = state.features.fetchIntercept && matchesInterceptPattern(url);
                const shouldScrubManifestResponse = state.features.fetchIntercept && manifestUrlMightNeedScrub(url);
                if (!shouldPruneJsonResponse && !shouldScrubManifestResponse) {
                    return Reflect.apply(target, thisArg, args);
                }

                return Reflect.apply(target, thisArg, args).then(response => {
                    if (!response || !response.ok) return response;
                    const contentType = response.headers?.get?.('content-type') || '';
                    // Only rewrite JSON-ish or text-manifest responses; leaves binary media/HTML intact.
                    if (contentType && !/json|javascript|text\/plain/i.test(contentType) && !(shouldScrubManifestResponse && manifestContentTypeIsText(contentType))) {
                        return response;
                    }
                    return response.clone().text().then(text => {
                        if (!text) return response;
                        const scrubbedManifest = shouldScrubManifestResponse ? scrubAdManifestText(text) : null;
                        if (scrubbedManifest && scrubbedManifest.changed) {
                            let newHeaders;
                            try {
                                newHeaders = new Headers(response.headers);
                                newHeaders.delete('content-length');
                            } catch (e) {
                                newHeaders = response.headers;
                            }
                            incrementStat('blocked');
                            incrementStat('pruned', scrubbedManifest.removed || 1);
                            return new Response(scrubbedManifest.text, {
                                status: response.status,
                                statusText: response.statusText,
                                headers: newHeaders
                            });
                        }
                        if (!shouldPruneJsonResponse) return response;
                        // Fast reject: if the raw body doesn't mention any of
                        // the prune keys or replaceKeys targets, skip the JSON
                        // parse and tree walk entirely. On YT this short-circuits
                        // nearly all /browse, /search, /next responses.
                        if (!responseTextMightContainAds(text, url)) return response;
                        try {
                            const modified = replaceAdKeys(text);
                            // Use the ORIGINAL JSON.parse (captured before our
                            // proxy installed) to avoid double-pruning and the
                            // resulting inflated `blocked` counter.
                            const parse = state.originals.jsonParse || JSON.parse;
                            const obj = parse.call(JSON, modified);
                            const wasPruned = pruneObject(obj, url);
                            if (!wasPruned && modified === text) {
                                return response;
                            }
                            if (wasPruned) {
                                incrementStat('blocked');
                            }
                            // Strip Content-Length: the rewritten body has a
                            // different byte length and some strict consumers
                            // check the declared length against the payload.
                            let newHeaders;
                            try {
                                newHeaders = new Headers(response.headers);
                                newHeaders.delete('content-length');
                            } catch (e) {
                                newHeaders = response.headers;
                            }
                            return new Response(JSON.stringify(obj), {
                                status: response.status,
                                statusText: response.statusText,
                                headers: newHeaders
                            });
                        } catch (e) {
                            return response;
                        }
                    }).catch(() => response);
                });
            }
        });

        registerNativeMask(proxiedFetch, originalFetch);
        safeOverride(window, 'fetch', proxiedFetch, 'window.fetch');
    }

    /* =========================================================================
     * ENGINE: XMLHttpRequest Proxy
     * ===================================================================== */

    function installXHRProxy() {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        const proxiedOpen = function(method, url, ...rest) {
            // url may be a URL instance per spec; coerce so downstream
            // String#includes calls never throw on a non-string.
            const urlStr = (typeof url === 'string') ? url : (url != null ? String(url) : '');
            this._ytab_url = urlStr;

            return originalOpen.call(this, method, url, ...rest);
        };

        const proxiedSend = function(body) {
            if (!isEnabled()) {
                return originalSend.call(this, body);
            }

            // Outbound no-ad signal — same additive isInlinePlaybackNoAd flag
            // as the fetch proxy (see rewriteRequestBodyText for the issue #2
            // history on why only this flag is safe to inject here).
            if (state.features.requestBodyModify &&
                typeof body === 'string' &&
                PLAYER_ENDPOINT_RE.test(this._ytab_url || '')) {
                try {
                    const rewritten = rewriteRequestBodyText(body);
                    if (rewritten !== null) body = rewritten;
                } catch (e) { /* never block the request over a rewrite */ }
            }

            const shouldPruneJsonResponse = state.features.xhrIntercept && matchesInterceptPattern(this._ytab_url);
            const shouldScrubManifestResponse = state.features.xhrIntercept && manifestUrlMightNeedScrub(this._ytab_url);
            if (!shouldPruneJsonResponse && !shouldScrubManifestResponse) {
                return originalSend.call(this, body);
            }

            const xhr = this;

            function interceptResponse() {
                if (xhr.readyState !== 4) return;
                // Self-remove on the only state we care about. readystatechange
                // fires for 0→1→2→3→4; the early-return above is the loop guard
                // for earlier states, and removing here prevents accidentally
                // re-processing a long-polling XHR that somehow ticks back past
                // 4 (browsers don't, but the removal is free insurance).
                try {
                    xhr.removeEventListener('readystatechange', interceptResponse, true);
                } catch (e) { /* ignore */ }
                if (!isEnabled() || !state.features.xhrIntercept) return;
                let sourceText = '';
                const rt = xhr.responseType;
                try {
                    if (rt === '' || rt === 'text') {
                        sourceText = xhr.responseText || '';
                    } else if (rt === 'json') {
                        // `xhr.response` is already parsed; serialize so we can
                        // apply text-level replaceAdKeys, then re-parse.
                        const original = xhr.response;
                        if (!original || typeof original !== 'object') return;
                        sourceText = JSON.stringify(original);
                    } else {
                        // blob / arraybuffer / document — not safely rewritable;
                        // leave the response untouched.
                        return;
                    }
                } catch (e) { return; }

                if (!sourceText) return;
                if (shouldScrubManifestResponse) {
                    const scrubbedManifest = scrubAdManifestText(sourceText);
                    if (scrubbedManifest.changed) {
                        if (rt === '' || rt === 'text') {
                            Object.defineProperty(xhr, 'responseText', { value: scrubbedManifest.text, writable: false, configurable: true });
                            Object.defineProperty(xhr, 'response', { value: scrubbedManifest.text, writable: false, configurable: true });
                            incrementStat('blocked');
                            incrementStat('pruned', scrubbedManifest.removed || 1);
                        }
                        return;
                    }
                    if (!shouldPruneJsonResponse) return;
                }
                // Same fast reject as fetch: skip the JSON parse + walk when
                // the body clearly has no ad fields.
                if (!responseTextMightContainAds(sourceText, xhr._ytab_url)) return;
                try {
                    const modified = replaceAdKeys(sourceText);
                    const parse = state.originals.jsonParse || JSON.parse;
                    const obj = parse.call(JSON, modified);
                    const wasPruned = pruneObject(obj, xhr._ytab_url);
                    if (!wasPruned && modified === sourceText) return;

                    const newText = JSON.stringify(obj);

                    if (rt === '' || rt === 'text') {
                        // Freeze both representations so that callers reading
                        // either `.responseText` or `.response` get the same
                        // rewritten payload.
                        Object.defineProperty(xhr, 'responseText', { value: newText, writable: false, configurable: true });
                        Object.defineProperty(xhr, 'response', { value: newText, writable: false, configurable: true });
                    } else if (rt === 'json') {
                        // Preserve the contract: responseType='json' expects the
                        // parsed object, not a string. The previous implementation
                        // handed callers a string here, silently breaking YouTube
                        // code paths that depended on json responseType.
                        Object.defineProperty(xhr, 'response', { value: obj, writable: false, configurable: true });
                    }

                    if (wasPruned) {
                        incrementStat('blocked');
                    }
                } catch (e) { /* fail silently */ }
            }

            // Fire interception before user handlers so rewritten data is what
            // they read. Only one capture-phase listener is registered per send.
            xhr.addEventListener('readystatechange', interceptResponse, { capture: true });

            return originalSend.call(this, body);
        };

        registerNativeMask(proxiedOpen, originalOpen);
        registerNativeMask(proxiedSend, originalSend);
        safeOverride(XMLHttpRequest.prototype, 'open', proxiedOpen, 'XMLHttpRequest.prototype.open');
        safeOverride(XMLHttpRequest.prototype, 'send', proxiedSend, 'XMLHttpRequest.prototype.send');
    }

    /* =========================================================================
     * ENGINE: Object.assign no-ad hook
     * =========================================================================
     * Locker-resilient fallback for the outbound no-ad signal. YouTube's
     * anti-adblock "locker" script (injected first in <head>) freezes
     * window.fetch / JSON.parse via Object.defineProperty, which defeats the
     * fetch/XHR proxies when it wins the document-start race. Object.assign
     * stays writable, and YouTube's InnerTube client routes the player
     * request context through it while building the body — so annotating
     * contentPlaybackContext here still lands the flag even when the network
     * proxies are locked out. Same additive-only injection contract as
     * rewriteRequestBodyText.
     * ===================================================================== */

    function installObjectAssignHook() {
        const originalAssign = Object.assign;
        state.originals.objectAssign = originalAssign;
        const proxiedAssign = new Proxy(originalAssign, {
            apply(target, thisArg, args) {
                const result = Reflect.apply(target, thisArg, args);
                // Only check objects that could plausibly be InnerTube player
                // request bodies. Object.assign is extremely hot — every YT
                // component merges state through it — so the guard must be
                // cheap: one typeof + one property-in check. Without this
                // gate the flag would be injected into analytics payloads,
                // UI config objects, and any third-party code that happens
                // to merge an object with a contentPlaybackContext field.
                if (isEnabled() && state.features.requestBodyModify &&
                    result && typeof result === 'object' &&
                    ('playbackContext' in result || 'contentPlaybackContext' in result)) {
                    injectNoAdFlag(result);
                }
                return result;
            }
        });
        registerNativeMask(proxiedAssign, originalAssign);
        safeOverride(Object, 'assign', proxiedAssign, 'Object.assign');
    }

    /* =========================================================================
     * ENGINE: Object.defineProperty traps (initial page response)
     * ===================================================================== */

    function rebuildTrapPathsByRoot() {
        const paths = state.filters?.setUndefined || DEFAULT_FILTERS.setUndefined;
        const byRoot = new Map();
        for (const path of paths) {
            if (typeof path !== 'string' || !path.includes('.')) continue;
            const parts = path.split('.');
            const root = parts[0];
            if (!byRoot.has(root)) byRoot.set(root, []);
            byRoot.get(root).push(parts.slice(1));
        }
        state.trapPathsByRoot = byRoot;
    }

    function applySubPathPrunes(target, subPaths) {
        if (!target || typeof target !== 'object') return false;
        let prunedHere = false;
        for (const subPath of subPaths) {
            let cursor = target;
            for (let i = 0; i < subPath.length - 1; i++) {
                if (cursor && typeof cursor === 'object' && subPath[i] in cursor) {
                    cursor = cursor[subPath[i]];
                } else {
                    cursor = null;
                    break;
                }
            }
            if (cursor && typeof cursor === 'object') {
                const lastKey = subPath[subPath.length - 1];
                if (lastKey in cursor) {
                    try { delete cursor[lastKey]; } catch (e) { /* frozen */ }
                    prunedHere = true;
                }
            }
        }
        return prunedHere;
    }

    function installPropertyTraps() {
        rebuildTrapPathsByRoot();

        for (const rootName of state.trapPathsByRoot.keys()) {
            // Each root gets ONE accessor. The setter reads the current subpath
            // list from state.trapPathsByRoot so later filter refreshes apply to
            // the same installed trap (setUndefined paths introduced by remote
            // rules take effect without needing to re-define the property, which
            // would silently fail once the accessor is in place).
            if (state.trappedRoots.has(rootName)) continue;
            try {
                let _value = window[rootName];
                // If the root was already populated before our trap installed
                // (race between document-start injection and an earlier inline
                // <script> on the page), eagerly prune it so the first paint
                // doesn't carry ad fields.
                if (isEnabled() && state.features.setUndefinedTraps && _value && typeof _value === 'object') {
                    const subPaths = state.trapPathsByRoot.get(rootName) || [];
                    if (applySubPathPrunes(_value, subPaths)) incrementStat('pruned');
                }
                Object.defineProperty(window, rootName, {
                    get() { return _value; },
                    set(newVal) {
                        if (isEnabled() && state.features.setUndefinedTraps && newVal && typeof newVal === 'object') {
                            const subPaths = state.trapPathsByRoot.get(rootName) || [];
                            if (applySubPathPrunes(newVal, subPaths)) incrementStat('pruned');
                        }
                        _value = newVal;
                    },
                    configurable: true,
                    enumerable: true
                });
                state.trappedRoots.add(rootName);
            } catch (e) {
                // Root was already defined as a non-configurable property by an
                // earlier script. Nothing more we can do; downstream proxies
                // (JSON.parse, fetch, XHR) will still prune the same fields.
            }
        }
    }

    /* =========================================================================
     * ENGINE: Promise.prototype.then Proxy (abnormality detection bypass)
     * ===================================================================== */

    // Caches for Promise.then fn analysis. Without caching the proxy calls
    // Function.prototype.toString on every Promise resolution site-wide,
    // which is a large hot-path cost on YouTube.
    const promiseFnChecked = new WeakSet();
    const promiseFnBad = new WeakSet();
    const NOOP_FN = function () {};

    function installAbnormalityBypass() {
        const originalThen = Promise.prototype.then;
        const proxiedThen = new Proxy(originalThen, {
            apply(target, thisArg, args) {
                if (!isEnabled() || !state.features.abnormalityBypass) {
                    return Reflect.apply(target, thisArg, args);
                }
                const onFulfilled = args[0];
                if (typeof onFulfilled === 'function') {
                    if (promiseFnBad.has(onFulfilled)) {
                        args[0] = NOOP_FN;
                        incrementStat('blocked');
                    } else if (!promiseFnChecked.has(onFulfilled)) {
                        promiseFnChecked.add(onFulfilled);
                        try {
                            const fnStr = Function.prototype.toString.call(onFulfilled);
                            if (fnStr.length < 4096 && fnStr.includes('onAbnormalityDetected')) {
                                promiseFnBad.add(onFulfilled);
                                args[0] = NOOP_FN;
                                incrementStat('blocked');
                            }
                        } catch (e) { /* fail silently */ }
                    }
                }
                return Reflect.apply(target, thisArg, args);
            }
        });

        registerNativeMask(proxiedThen, originalThen);
        safeOverride(Promise.prototype, 'then', proxiedThen, 'Promise.prototype.then');
    }

    /* =========================================================================
     * ENGINE: DOM Bypass Prevention
     * ===================================================================== */

    // Sync the parent window's hooked APIs into a child iframe's window so
    // YouTube's "lift a pristine fetch/JSON.parse from an empty iframe" pattern
    // returns to our proxies instead of vanilla browser implementations.
    // Scoped to same-origin iframes — cross-origin access throws and is not
    // a bypass vector anyway.
    //
    // We mark each bridged window with a sentinel property so repeat calls
    // (and the contentWindow getter hot path in particular) become O(1)
    // no-ops instead of re-assigning every hooked global. Frames whose
    // document swaps out get re-bridged via the 'load' event listener
    // attached on insertion — the sentinel lives on the old Window object
    // and won't follow a navigation into a new document.
    const IFRAME_BRIDGE_FLAG = '__ytabBridged__';
    // WeakMap, keyed on the HTMLIFrameElement, mapping to a remembered
    // result of "this frame's current document is cross-origin". Set on
    // the first failed same-origin probe, cleared on load events (new
    // document → re-probe). Avoids hot-path exception-throwing on every
    // contentWindow read of a cross-origin frame.
    const frameCrossOriginCache = new WeakMap();

    function bridgeIframeWindow(frame) {
        try {
            if (frameCrossOriginCache.get(frame) === true) return;
            const cw = frame.contentWindow;
            if (!cw) return;
            // Idempotency short-circuit (cheap boolean check on same-origin
            // windows). If the sentinel already exists, skip both the
            // cross-origin probe and the reassignment.
            try { if (cw[IFRAME_BRIDGE_FLAG] === true) return; } catch (e) {
                // Reading a property on a cross-origin window throws. Remember
                // that so the next read can short-circuit without triggering
                // another DOMException (throws measure in the microseconds
                // but on a hot contentWindow-getter path that adds up).
                frameCrossOriginCache.set(frame, true);
                return;
            }
            // Secondary probe: reading .document surfaces cross-origin on
            // frames where the sentinel was never set. Same caching rationale.
            try { void cw.document; } catch (e) {
                frameCrossOriginCache.set(frame, true);
                return;
            }
            // Only bridge the APIs YT's ad-enforcement scripts have been
            // observed lifting (fetch, Request/Response, XHR, JSON.parse).
            // Promise/setTimeout are intentionally NOT bridged — legitimate
            // same-origin iframes (e.g. embedded players) rely on their own
            // references and swapping them can break unrelated consumers.
            try { cw.fetch = window.fetch; } catch (e) { /* locked */ }
            try { cw.Request = window.Request; } catch (e) { /* locked */ }
            try { cw.Response = window.Response; } catch (e) { /* locked */ }
            try { cw.XMLHttpRequest = window.XMLHttpRequest; } catch (e) { /* locked */ }
            try {
                if (cw.JSON) cw.JSON.parse = JSON.parse;
            } catch (e) { /* locked */ }
            try {
                Object.defineProperty(cw, IFRAME_BRIDGE_FLAG, {
                    value: true,
                    writable: false,
                    configurable: true,
                    enumerable: false
                });
            } catch (e) { /* ignore — sentinel is a perf hint, not correctness */ }
        } catch (e) { /* fail silently */ }
    }

    function installDOMBypassPrevention() {
        const originalAppendChild = Node.prototype.appendChild;
        const originalInsertBefore = Node.prototype.insertBefore;
        const originalReplaceChild = Node.prototype.replaceChild;

        function handleInsertion(node, result) {
            try {
                // Any iframe insertion — not just about:blank. YT 2026 also uses
                // sandboxed iframes with srcdoc, and blob:/data: sources. If the
                // frame is same-origin-accessible, rebridge on insertion and
                // once on load for cases where the document swaps in later.
                if (node instanceof HTMLIFrameElement) {
                    bridgeIframeWindow(node);
                    try {
                        if (!node.__ytabLoadBridged) {
                            node.__ytabLoadBridged = true;
                            node.addEventListener('load', () => {
                                frameCrossOriginCache.delete(node);
                                bridgeIframeWindow(node);
                            });
                        }
                    } catch (e) { /* ignore */ }
                }
                // Block inline script injection that resets fetch.
                if (node instanceof HTMLScriptElement) {
                    const text = node.textContent || '';
                    if (text.includes('window,"fetch"') || text.includes("window,'fetch'")) {
                        node.textContent = '/* blocked by YoutubeAdblock */';
                    }
                }
            } catch (e) { /* fail silently */ }
            return result;
        }

        const proxiedAppendChild = new Proxy(originalAppendChild, {
            apply(target, thisArg, args) {
                if (!isEnabled() || !state.features.domBypassPrevention) {
                    return Reflect.apply(target, thisArg, args);
                }
                const result = Reflect.apply(target, thisArg, args);
                return handleInsertion(args[0], result);
            }
        });

        const proxiedInsertBefore = new Proxy(originalInsertBefore, {
            apply(target, thisArg, args) {
                if (!isEnabled() || !state.features.domBypassPrevention) {
                    return Reflect.apply(target, thisArg, args);
                }
                const result = Reflect.apply(target, thisArg, args);
                return handleInsertion(args[0], result);
            }
        });

        const proxiedReplaceChild = new Proxy(originalReplaceChild, {
            apply(target, thisArg, args) {
                if (!isEnabled() || !state.features.domBypassPrevention) {
                    return Reflect.apply(target, thisArg, args);
                }
                const result = Reflect.apply(target, thisArg, args);
                return handleInsertion(args[0], result);
            }
        });

        registerNativeMask(proxiedAppendChild, originalAppendChild);
        registerNativeMask(proxiedInsertBefore, originalInsertBefore);
        registerNativeMask(proxiedReplaceChild, originalReplaceChild);
        safeOverride(Node.prototype, 'appendChild', proxiedAppendChild, 'Node.prototype.appendChild');
        safeOverride(Node.prototype, 'insertBefore', proxiedInsertBefore, 'Node.prototype.insertBefore');
        safeOverride(Node.prototype, 'replaceChild', proxiedReplaceChild, 'Node.prototype.replaceChild');

        // Defense-in-depth: wrap the contentWindow getter so *reads* of
        // iframe.contentWindow rebridge if the frame swapped documents between
        // insertion and the ad-script's lift. A no-op if the getter is already
        // locked by another script.
        try {
            const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
            if (descriptor && descriptor.configurable && typeof descriptor.get === 'function') {
                const origGetter = descriptor.get;
                Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
                    get() {
                        const cw = origGetter.call(this);
                        if (isEnabled() && state.features.domBypassPrevention && cw) {
                            bridgeIframeWindow(this);
                        }
                        return cw;
                    },
                    configurable: true,
                    enumerable: descriptor.enumerable
                });
            }
        } catch (e) { /* another script locked the getter */ }
    }

    /* =========================================================================
     * ENGINE: SSAP Auto-Skip
     * ===================================================================== */

    function installSSAPAutoSkip() {
        // Poll rather than observe-every-mutation: the previous MutationObserver
        // on document with subtree:true fired thousands of times per second on
        // YouTube, dwarfing the cost of the skip check itself. A 1-second poll
        // catches stitched-ad segments plenty fast and costs near-zero.
        let timer = null;

        function checkAndSkipSSAP() {
            if (!isEnabled() || !state.features.ssapAutoSkip) return;
            // Background tabs don't play ads to the user; skip the poll to
            // keep throttled-timer wake-ups cheap.
            if (document.hidden) return;
            const player = document.getElementById('movie_player');
            if (!player || typeof player.getStatsForNerds !== 'function') return;
            try {
                const stats = player.getStatsForNerds();
                const debugInfo = stats?.debug_info || '';
                if (debugInfo.startsWith('SSAP, AD') || debugInfo.startsWith('SSAP,AD')) {
                    const progress = player.getProgressState?.();
                    if (progress && progress.duration > 0) {
                        if (progress.loaded < progress.duration || progress.duration - progress.current > 1) {
                            player.seekTo?.(progress.duration);
                            incrementStat('ssapSkipped');
                        }
                    }
                }
            } catch (e) { /* fail silently */ }
        }

        function startSSAPMonitor() {
            if (timer) return;
            checkAndSkipSSAP();
            timer = registerInterval(checkAndSkipSSAP, SSAP_POLL_INTERVAL_MS);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startSSAPMonitor, { once: true });
        } else {
            startSSAPMonitor();
        }
    }

    /* =========================================================================
     * ENGINE: Video Ad Fast-Forward Fallback
     * ===================================================================== */

    // Last-resort safety net. If the prune/intercept layers miss an ad payload
    // and a client-side ad actually starts playing, YouTube tags the player
    // host with `.ad-showing`. Muting and accelerating the <video> while that
    // class is set shaves unskippable ads from ~15s to <1s without needing
    // to seek (which YT can reject on some ad surfaces).
    function installVideoAdFastForward() {
        // Track whether WE muted the video (vs the user's own mute state)
        // so the restoration step on ad-end doesn't unmute content that
        // the user themselves muted. Only restore when we were the muter.
        let weMutedThisAd = false;
        let lastAdShowing = false;

        function tickVideo() {
            if (!isEnabled() || !state.features.videoAdFastForward) {
                // If the feature was turned off mid-ad, still try to
                // unwind our own mute so we don't leave the user with
                // a silent player.
                if (weMutedThisAd) {
                    const player = document.getElementById('movie_player');
                    const video = player && player.querySelector('video.html5-main-video');
                    if (video && video.muted) {
                        try { video.muted = false; } catch (e) { /* ignore */ }
                    }
                    weMutedThisAd = false;
                }
                lastAdShowing = false;
                return;
            }
            if (document.hidden) return;
            const player = document.getElementById('movie_player');
            if (!player) return;
            const adShowing = player.classList.contains('ad-showing');
            const video = player.querySelector('video.html5-main-video');
            if (!video) return;

            if (adShowing) {
                try {
                    if (video.playbackRate < 16) video.playbackRate = 16;
                    // Only mute if the user hadn't already muted — and
                    // remember that it was us, so the ad-end branch below
                    // knows to undo it. YT does NOT restore muted state
                    // on its own when the ad ends, so missing this step
                    // silences the subsequent content for the user.
                    if (!video.muted) {
                        video.muted = true;
                        weMutedThisAd = true;
                    }
                } catch (e) { /* some codepaths reject rate writes */ }
            } else if (lastAdShowing) {
                // Transition from ad → content: unwind anything we set.
                // Leave playbackRate alone — YT resets it, and if the
                // user has a preferred rate (e.g. 2x) our 16x write has
                // already been overwritten by their choice or the
                // player's own reset.
                if (weMutedThisAd) {
                    try { video.muted = false; } catch (e) { /* ignore */ }
                    weMutedThisAd = false;
                }
            }
            lastAdShowing = adShowing;
        }

        // Poll while an ad is actually on-screen. Outside of `.ad-showing`
        // this poll is a single classList read and returns immediately.
        registerInterval(tickVideo, 500);
    }

    /* =========================================================================
     * ENGINE: SponsorBlock (silent auto-skip)
     * ===================================================================== */

    // Privacy-preserving SponsorBlock client. Sends only the first 4 hex chars
    // of sha256(videoID) so the server cannot pinpoint which video was watched;
    // the local client filters the returned bucket by exact videoID. Skipping
    // is silent — no toast, no panel update — as requested.
    const sponsorBlockState = {
        // The video ID the currently-loaded segments belong to. null when
        // nothing is loaded or while a fresh load is in flight.
        videoId: null,
        // Non-null while a fetch is in flight, used as a token so that a
        // result is only applied if the token still matches the videoId
        // recorded at dispatch time. Protects against a fast SPA nav
        // applying videoA's segments to videoB.
        loadingToken: null,
        segments: [],
        highlight: null,
        video: null,
        timeupdateHandler: null,
        lastSkipEnd: -1,
        // Set when a nav arrives while a fetch is in flight; processed
        // after the current fetch finishes so we never drop a user's
        // navigation silently.
        pendingVideoId: null
    };

    async function sha256HexPrefix(str, prefixLen = 4) {
        try {
            if (!crypto || !crypto.subtle) return null;
            const buf = new TextEncoder().encode(str);
            const hash = await crypto.subtle.digest('SHA-256', buf);
            const bytes = new Uint8Array(hash);
            let hex = '';
            for (let i = 0; i < bytes.length; i++) {
                hex += bytes[i].toString(16).padStart(2, '0');
                if (hex.length >= prefixLen) break;
            }
            return hex.slice(0, prefixLen);
        } catch (e) {
            return null;
        }
    }

    function extractVideoIdFromUrl(urlStr, base) {
        try {
            const u = base ? new URL(urlStr, base) : new URL(urlStr);
            if (u.pathname === '/watch') return u.searchParams.get('v');
            const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
            return m ? m[1] : null;
        } catch (e) { return null; }
    }

    function getCurrentVideoId() {
        return extractVideoIdFromUrl(location.href);
    }

    function lruCacheSet(cache, maxSize, key, entry) {
        if (cache.has(key)) cache.delete(key);
        cache.set(key, { ...entry, fetchedAt: Date.now() });
        while (cache.size > maxSize) {
            const firstKey = cache.keys().next().value;
            if (firstKey === undefined) break;
            cache.delete(firstKey);
        }
    }

    function lruCacheGet(cache, ttl, key) {
        const entry = cache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.fetchedAt > ttl) {
            cache.delete(key);
            return null;
        }
        return entry;
    }

    function sponsorBlockFetchBucket(hashPrefix) {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                resolve(null);
                return;
            }
            const cats = encodeURIComponent(JSON.stringify([...SPONSORBLOCK_CATEGORIES, 'poi_highlight']));
            const actions = encodeURIComponent(JSON.stringify(['skip', 'full', 'poi']));
            const url = `${SPONSORBLOCK_API}/${hashPrefix}?categories=${cats}&actionTypes=${actions}`;
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout: SPONSORBLOCK_TIMEOUT_MS,
                onload(resp) {
                    if (!resp || resp.status !== 200) {
                        resolve(null);
                        return;
                    }
                    try {
                        // Use raw JSON.parse — this response contains no ad keys
                        // and would waste cycles re-entering our prune pipeline.
                        resolve(jsonParseRaw(resp.responseText));
                    } catch (e) {
                        resolve(null);
                    }
                },
                onerror() { resolve(null); },
                ontimeout() { resolve(null); }
            });
        });
    }

    async function loadSponsorSegments(videoId) {
        if (!videoId) return;
        // If another load is in flight for a different video, record that
        // we need to reload — we'll pick it up after the current load
        // finishes rather than firing two concurrent fetches that both
        // hold the videoId lock.
        if (sponsorBlockState.loadingToken && sponsorBlockState.loadingToken !== videoId) {
            sponsorBlockState.pendingVideoId = videoId;
            return;
        }
        // Already loaded for this video — nothing to do.
        if (sponsorBlockState.videoId === videoId && !sponsorBlockState.loadingToken) return;

        sponsorBlockState.loadingToken = videoId;
        sponsorBlockState.segments = [];
        sponsorBlockState.lastSkipEnd = -1;
        try {
            const prefix = await sha256HexPrefix(videoId, 4);
            // Check the token *and* the current URL because either the
            // user has since navigated, or a pending nav is queued. In
            // either case, the in-flight result is stale by now.
            if (sponsorBlockState.loadingToken !== videoId) return;
            if (getCurrentVideoId() !== videoId) return;
            if (!prefix) return;

            const bucket = await sponsorBlockFetchBucket(prefix);
            if (sponsorBlockState.loadingToken !== videoId) return;
            if (getCurrentVideoId() !== videoId) return;
            if (!Array.isArray(bucket)) return;

            const match = bucket.find(entry => entry && entry.videoID === videoId);
            if (!match || !Array.isArray(match.segments)) return;

            const clean = [];
            var highlight = null;
            for (const s of match.segments) {
                if (!s || !Array.isArray(s.segment) || s.segment.length !== 2) continue;
                var action = s.actionType || 'skip';
                if (action !== 'skip' && action !== 'full' && action !== 'poi') continue;
                const start = Number(s.segment[0]);
                const end = Number(s.segment[1]);
                if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
                if (action === 'poi') {
                    if (start >= 0) highlight = { time: start, category: s.category, uuid: s.UUID };
                    continue;
                }
                if (end <= start || start < 0) continue;
                clean.push({ start, end, category: s.category, uuid: s.UUID });
            }
            // Sort by start so the skip decision is deterministic when
            // segments overlap — we always take the earliest qualifying
            // match.
            clean.sort((a, b) => a.start - b.start);
            sponsorBlockState.segments = clean;
            sponsorBlockState.highlight = highlight;
            sponsorBlockState.videoId = videoId;
            renderHighlightButton();
        } finally {
            // Only clear the token if we still own it. If another load
            // replaced us, leave it alone.
            if (sponsorBlockState.loadingToken === videoId) {
                sponsorBlockState.loadingToken = null;
            }
            // Process any nav that arrived mid-flight.
            const queued = sponsorBlockState.pendingVideoId;
            if (queued && queued !== videoId) {
                sponsorBlockState.pendingVideoId = null;
                // Fire-and-forget; next tick to avoid deep await chains.
                Promise.resolve().then(() => loadSponsorSegments(queued));
            }
        }
    }

    function reportSponsorBlockView(segmentUUID) {
        if (!segmentUUID || typeof GM_xmlhttpRequest !== 'function') return;
        try {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `https://sponsor.ajay.app/api/viewedVideoSponsorTime?UUID=${encodeURIComponent(segmentUUID)}`,
                timeout: 5000,
                onload() {},
                onerror() {},
                ontimeout() {}
            });
        } catch (e) { /* fire-and-forget */ }
    }

    function attachSponsorBlockVideo() {
        const video = document.querySelector('video.html5-main-video');
        if (!video || video === sponsorBlockState.video) return;
        if (sponsorBlockState.video && sponsorBlockState.timeupdateHandler) {
            try {
                sponsorBlockState.video.removeEventListener('timeupdate', sponsorBlockState.timeupdateHandler);
            } catch (e) { /* ignore */ }
        }
        sponsorBlockState.video = video;
        const handler = function onSponsorBlockTimeUpdate() {
            if (!isEnabled() || !state.features.sponsorBlock) return;
            if (!video.isConnected) {
                try { video.removeEventListener('timeupdate', handler); } catch (e) { /* ignore */ }
                return;
            }
            const segments = sponsorBlockState.segments;
            if (!segments.length) return;
            // Defense-in-depth against the stale-fetch race: only apply
            // skips when the loaded segments match the current URL.
            if (sponsorBlockState.videoId && sponsorBlockState.videoId !== getCurrentVideoId()) {
                return;
            }
            const t = video.currentTime;
            if (!Number.isFinite(t)) return;
            for (const seg of segments) {
                // Small leading-edge tolerance so we don't fire for a user
                // who just happens to land at `seg.start` via manual seek.
                if (t < seg.start || t >= seg.end - 0.25) continue;
                // Prevent re-fire ping-pong when the seek itself lands near
                // another segment's leading edge.
                if (sponsorBlockState.lastSkipEnd >= seg.end - 0.01) continue;
                try {
                    // Some browsers reject a seek to exactly the duration;
                    // clamp a hair short of end-of-stream.
                    const target = Math.min(seg.end, (video.duration || seg.end) - 0.01);
                    video.currentTime = Number.isFinite(target) && target > t ? target : seg.end;
                    sponsorBlockState.lastSkipEnd = seg.end;
                    incrementStat('sponsorSkipped');
                    // Ecosystem contract: report the skip so community stats
                    // stay accurate. Fire-and-forget, non-blocking.
                    reportSponsorBlockView(seg.uuid);
                } catch (e) { /* some codepaths reject currentTime writes */ }
                return;
            }
        };
        sponsorBlockState.timeupdateHandler = handler;
        try {
            video.addEventListener('timeupdate', handler);
        } catch (e) { /* ignore */ }
    }

    function renderHighlightButton() {
        var existing = document.getElementById('ytab-highlight-btn');
        if (existing) existing.remove();
        var hl = sponsorBlockState.highlight;
        if (!hl || !isEnabled() || !state.features.sponsorBlock) return;
        var controls = document.querySelector('.ytp-right-controls');
        if (!controls) return;
        var btn = document.createElement('button');
        btn.id = 'ytab-highlight-btn';
        btn.className = 'ytp-button';
        btn.title = STRINGS.sponsorBlock.highlightTitle(Math.floor(hl.time / 60) + ':' + String(Math.floor(hl.time % 60)).padStart(2, '0'));
        btn.setAttribute('aria-label', btn.title);
        btn.style.cssText = 'font-size:12px;font-weight:600;color:#ff0;cursor:pointer;padding:0 6px;line-height:36px;opacity:0.9;';
        btn.textContent = STRINGS.sponsorBlock.highlightSymbol;
        btn.addEventListener('click', function() {
            var video = sponsorBlockState.video || document.querySelector('video.html5-main-video');
            if (video && Number.isFinite(hl.time)) {
                try { video.currentTime = hl.time; } catch (e) { /* ignore */ }
            }
        });
        controls.prepend(btn);
    }

    function handleSponsorBlockNav() {
        if (!isEnabled() || !state.features.sponsorBlock) return;
        const vid = getCurrentVideoId();
        if (!vid) {
            sponsorBlockState.segments = [];
            sponsorBlockState.highlight = null;
            sponsorBlockState.videoId = null;
            sponsorBlockState.pendingVideoId = null;
            sponsorBlockState.lastSkipEnd = -1;
            var hlBtn = document.getElementById('ytab-highlight-btn');
            if (hlBtn) hlBtn.remove();
            return;
        }
        // Fresh video — drop whatever segments we had so a stale in-flight
        // fetch can't apply in the gap between nav and new segments.
        if (vid !== sponsorBlockState.videoId) {
            sponsorBlockState.segments = [];
            sponsorBlockState.highlight = null;
            sponsorBlockState.lastSkipEnd = -1;
            loadSponsorSegments(vid);
        }
        attachSponsorBlockVideo();
    }

    function installSponsorBlock() {
        // Initial load + reattach on SPA nav. A periodic re-attach catches
        // cases where the <video> element is recreated without a nav event
        // (e.g. theater-mode toggle on some builds).
        handleSponsorBlockNav();
        document.addEventListener('yt-navigate-finish', handleSponsorBlockNav);
        registerInterval(() => {
            if (!isEnabled() || !state.features.sponsorBlock) return;
            if (!sponsorBlockState.video || !sponsorBlockState.video.isConnected) {
                attachSponsorBlockVideo();
            }
            const vid = getCurrentVideoId();
            if (vid && vid !== sponsorBlockState.videoId && sponsorBlockState.loadingToken !== vid) {
                handleSponsorBlockNav();
            }
        }, 2000);
    }

    /* =========================================================================
     * ENGINE: Anti-Detection Timer Neutralization
     * ===================================================================== */

    // Cache for setTimeout fn identity → decision.
    // Prevents repeat Function.prototype.toString calls and lets us trust a
    // prior analysis rather than racing against a minifier-renamed function
    // that happens to match a heuristic.
    const timerKillCache = new WeakSet();
    const timerInspectedCache = new WeakSet();

    function installTimerNeutralization() {
        const originalSetTimeout = window.setTimeout;
        const proxiedSetTimeout = new Proxy(originalSetTimeout, {
            apply(target, thisArg, args) {
                if (!isEnabled() || !state.features.timerNeutralization) {
                    return Reflect.apply(target, thisArg, args);
                }
                const fn = args[0];
                const delay = args[1];
                // YouTube uses a ~17 second timer to validate ad playback.
                // IMPORTANT: the previous heuristic matched `[native code]` which
                // is the output of EVERY bound/native function — and `length<50`
                // matched most short minified helpers. Both were far too broad
                // and would fire legitimate 17s callbacks at 1ms. The tightened
                // rule matches only an unambiguous anti-adblock marker present
                // in the known YouTube abnormality timer, and never bind/native.
                if (typeof fn !== 'function' || typeof delay !== 'number') {
                    return Reflect.apply(target, thisArg, args);
                }
                if (delay < 16000 || delay > 18000) {
                    return Reflect.apply(target, thisArg, args);
                }
                if (timerKillCache.has(fn)) {
                    args[1] = 1;
                } else if (!timerInspectedCache.has(fn)) {
                    timerInspectedCache.add(fn);
                    try {
                        const fnStr = Function.prototype.toString.call(fn);
                        const isNativeOrBound = fnStr.includes('[native code]');
                        // Known ad-validation signatures from abnormality flow.
                        if (/onAbnormal|adBlock|adblock|abnormalityDetected/.test(fnStr)) {
                            timerKillCache.add(fn);
                            args[1] = 1;
                        } else if (isNativeOrBound && state.features.aggressiveAntiStall && delay === 17000) {
                            // Aggressive anti-stall: the same profile uBO's
                            // `nano-stb, [native code], 17000, 0.001` rule
                            // targets. YT deploys a bound setTimeout at
                            // exactly 17s to stall playback on suspected
                            // blockers. Narrowed to delay === 17000 (not the
                            // broader 16000-18000 window) to keep false
                            // positives low on legitimate 17s bound timers.
                            timerKillCache.add(fn);
                            // Jittered replacement delay. A fixed 17ms makes
                            // the neutralizer itself fingerprintable — YT
                            // could flag "callback fired ~17ms after
                            // setTimeout(17000)" as an adblock signature.
                            // 8-45ms keeps the visible stall imperceptible
                            // while breaking the deterministic signature.
                            args[1] = 8 + Math.floor(Math.random() * 38);
                        } else if (isNativeOrBound) {
                            // Preserve v0.2.0 behavior: don't neutralize
                            // unrecognized bound 17s timers when the
                            // aggressive path is off.
                            return Reflect.apply(target, thisArg, args);
                        }
                    } catch (e) { /* fail silently */ }
                }
                return Reflect.apply(target, thisArg, args);
            }
        });

        registerNativeMask(proxiedSetTimeout, originalSetTimeout);
        safeOverride(window, 'setTimeout', proxiedSetTimeout, 'window.setTimeout');
    }

    /* =========================================================================
     * ENGINE: ServiceWorker registration block
     * =========================================================================
     * YouTube registers /sw.js during hydration and uses it for static asset
     * caching. A service worker sits in front of the network layer, so SW-
     * scoped requests bypass our fetch/XHR proxies entirely — meaning ad
     * pings routed through the SW (e.g. `/api/stats/ads`, `/log_event`)
     * would never hit our hooks. Blocking registration is safe: the cache
     * is a performance optimization, not a correctness requirement, and
     * most other ad blockers (uBO included) take this approach.
     * ===================================================================== */

    function installServiceWorkerBlock() {
        try {
            if (!navigator.serviceWorker) return;
            const sw = navigator.serviceWorker;
            const originalRegister = sw.register;
            const proxiedRegister = new Proxy(originalRegister, {
                apply(target, thisArg, args) {
                    if (!isEnabled() || !state.features.serviceWorkerBlock) {
                        return Reflect.apply(target, thisArg, args);
                    }
                    // Return a resolved sentinel so sites that chain .then
                    // off the promise don't crash, but no worker installs.
                    return Promise.reject(new Error('ServiceWorker registration blocked'));
                }
            });
            registerNativeMask(proxiedRegister, originalRegister);
            try {
                Object.defineProperty(sw, 'register', {
                    value: proxiedRegister,
                    writable: true,
                    configurable: true
                });
            } catch (e) { /* locked */ }

            // Also block getRegistration{,s} from handing YT a handle to a
            // pre-existing worker (e.g. on a cold page-load where a prior
            // session registered one before install).
            const originalGet = sw.getRegistration;
            if (typeof originalGet === 'function') {
                const proxiedGet = new Proxy(originalGet, {
                    apply(target, thisArg, args) {
                        if (!isEnabled() || !state.features.serviceWorkerBlock) {
                            return Reflect.apply(target, thisArg, args);
                        }
                        return Promise.resolve(undefined);
                    }
                });
                registerNativeMask(proxiedGet, originalGet);
                try {
                    Object.defineProperty(sw, 'getRegistration', {
                        value: proxiedGet, writable: true, configurable: true
                    });
                } catch (e) { /* locked */ }
            }
            const originalGetAll = sw.getRegistrations;
            if (typeof originalGetAll === 'function') {
                const proxiedGetAll = new Proxy(originalGetAll, {
                    apply(target, thisArg, args) {
                        if (!isEnabled() || !state.features.serviceWorkerBlock) {
                            return Reflect.apply(target, thisArg, args);
                        }
                        return Promise.resolve([]);
                    }
                });
                registerNativeMask(proxiedGetAll, originalGetAll);
                try {
                    Object.defineProperty(sw, 'getRegistrations', {
                        value: proxiedGetAll, writable: true, configurable: true
                    });
                } catch (e) { /* locked */ }
            }
        } catch (e) { /* navigator.serviceWorker missing (http:// or private mode) */ }
    }

    /* =========================================================================
     * ENGINE: Webpack chunk array hook
     * =========================================================================
     * YouTube's player + feed code is shipped as a webpack chunk array
     * (`self.webpackChunk_youtube_player` or similar) that every chunk
     * `.push`-es factories into before execution. Proxying that array's
     * push at document-start lets us inspect module source before the
     * module runs, which catches ad-related modules that relocate
     * between YT builds. Factories whose source matches the local or
     * refreshed webpack signature database are replaced with a no-op module (empty
     * exports) before the chunk executes, so the ad-rendering code never
     * runs; each replacement counts toward the `pruned` stat.
     * ===================================================================== */

    const WEBPACK_CHUNK_NAMES = [
        'webpackChunk_youtube_player',
        'webpackChunk_www_youtube_com',
        'webpackChunkytmusic_app'
    ];
    const WEBPACK_SIGNATURE_MAX_BYTES = 64 * 1024;
    const WEBPACK_SIGNATURE_MAX_TOKENS = 100;
    const WEBPACK_SIGNATURE_MAX_TOKEN_LENGTH = 120;
    const WEBPACK_SIGNATURE_TOKEN_RE = /^[A-Za-z_$][\w$]*$/;
    const DEFAULT_WEBPACK_SIGNATURE_DATABASE = {
        version: 'built-in',
        updated: '2026-06-28',
        maxFactoryBytes: 200000,
        tokens: [
            'adPlacements',
            'adBreakHeartbeatParams',
            'onAbnormalityDetected',
            'getAdBlockedState',
            'adSlots',
            'playerLegacyDesktopWatchAdsRenderer'
        ]
    };

    function sanitizeWebpackSignatureDatabase(value, mergeDefaults = true) {
        const source = value && typeof value === 'object' && !Array.isArray(value)
            ? value
            : {};
        const rawTokens = Array.isArray(source.tokens)
            ? source.tokens
            : (Array.isArray(source.factorySourceTokens) ? source.factorySourceTokens : []);
        const tokens = [];
        const pushToken = token => {
            if (tokens.length >= WEBPACK_SIGNATURE_MAX_TOKENS) return;
            const normalized = String(token || '').trim();
            if (!normalized || normalized.length > WEBPACK_SIGNATURE_MAX_TOKEN_LENGTH) return;
            if (!WEBPACK_SIGNATURE_TOKEN_RE.test(normalized)) return;
            if (!tokens.includes(normalized)) tokens.push(normalized);
        };
        if (mergeDefaults) {
            for (const token of DEFAULT_WEBPACK_SIGNATURE_DATABASE.tokens) pushToken(token);
        }
        for (const token of rawTokens) pushToken(token);
        if (!tokens.length) return null;

        const maxFactoryBytesRaw = Number(source.maxFactoryBytes);
        const maxFactoryBytes = Number.isFinite(maxFactoryBytesRaw)
            ? Math.min(500000, Math.max(1000, Math.floor(maxFactoryBytesRaw)))
            : DEFAULT_WEBPACK_SIGNATURE_DATABASE.maxFactoryBytes;
        return {
            version: typeof source.version === 'string' && source.version.trim()
                ? source.version.trim().slice(0, 80)
                : DEFAULT_WEBPACK_SIGNATURE_DATABASE.version,
            updated: typeof source.updated === 'string' && source.updated.trim()
                ? source.updated.trim().slice(0, 80)
                : DEFAULT_WEBPACK_SIGNATURE_DATABASE.updated,
            maxFactoryBytes,
            tokens
        };
    }

    function compileWebpackSignatureMatcher(database) {
        const tokens = database && Array.isArray(database.tokens) ? database.tokens : [];
        if (!tokens.length) return null;
        const escaped = tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        return new RegExp(`\\b(?:${escaped.join('|')})\\b`);
    }

    function applyWebpackSignatureDatabase(database, source) {
        const clean = sanitizeWebpackSignatureDatabase(database);
        const effective = clean || sanitizeWebpackSignatureDatabase(DEFAULT_WEBPACK_SIGNATURE_DATABASE, false);
        state.webpackSignatureDatabase = effective;
        state.webpackSignatureMatcher = compileWebpackSignatureMatcher(effective);
        state.webpackSignatureSource = source || 'built-in';
        state.webpackSignatureVersion = effective.version;
        state.webpackSignatureUpdated = effective.updated;
    }

    function hydrateWebpackSignatureDatabase() {
        const cached = sanitizeWebpackSignatureDatabase(getSetting('webpack_signature_cache', null));
        if (cached) {
            applyWebpackSignatureDatabase(cached, 'cached');
            return;
        }
        applyWebpackSignatureDatabase(DEFAULT_WEBPACK_SIGNATURE_DATABASE, 'built-in');
    }

    function webpackFactoryMatchesAdSignature(src) {
        const database = state.webpackSignatureDatabase || sanitizeWebpackSignatureDatabase(DEFAULT_WEBPACK_SIGNATURE_DATABASE, false);
        const maxBytes = database.maxFactoryBytes || DEFAULT_WEBPACK_SIGNATURE_DATABASE.maxFactoryBytes;
        const matcher = state.webpackSignatureMatcher || compileWebpackSignatureMatcher(database);
        return !!(src && src.length < maxBytes && matcher && matcher.test(src));
    }

    function fetchWebpackSignatureDatabase() {
        if (state.webpackSignatureSyncing) return Promise.resolve(state.webpackSignatureDatabase);
        if (typeof GM_xmlhttpRequest !== 'function') return Promise.resolve(state.webpackSignatureDatabase);
        state.webpackSignatureSyncing = true;
        state.webpackSignatureError = '';
        return gmFetchText(addCacheBust(WEBPACK_SIGNATURE_URL_DEFAULT), FILTER_FETCH_TIMEOUT_MS)
            .then(text => {
                if (text.length > WEBPACK_SIGNATURE_MAX_BYTES) {
                    throw new Error(STRINGS.filters.webpackSignatureTooLarge(Math.round(WEBPACK_SIGNATURE_MAX_BYTES / 1024)));
                }
                const parsed = sanitizeWebpackSignatureDatabase(jsonParseRaw(text));
                if (!parsed) throw new Error(STRINGS.filters.webpackSignatureInvalid);
                applyWebpackSignatureDatabase(parsed, 'remote');
                setSetting('webpack_signature_cache', parsed);
                setSetting('webpack_signature_cache_time', Date.now());
                return parsed;
            })
            .catch(e => {
                state.webpackSignatureError = e && e.message ? e.message : STRINGS.filters.webpackSignatureFetchFailed;
                return state.webpackSignatureDatabase;
            })
            .finally(() => {
                state.webpackSignatureSyncing = false;
            });
    }

    function installWebpackChunkHook() {
        if (!state.features.webpackChunkHook) return;
        for (const name of WEBPACK_CHUNK_NAMES) {
            try {
                // If the chunk array already exists (late install), wrap its
                // push directly. Otherwise install an accessor that wraps on
                // first assignment.
                const existing = window[name];
                if (Array.isArray(existing)) {
                    wrapChunkArrayPush(existing);
                    continue;
                }
                let _value = existing;
                Object.defineProperty(window, name, {
                    configurable: true,
                    enumerable: true,
                    get() { return _value; },
                    set(v) {
                        try { if (Array.isArray(v)) wrapChunkArrayPush(v); }
                        catch (e) { /* ignore */ }
                        _value = v;
                    }
                });
            } catch (e) { /* another script locked the property — skip */ }
        }
    }

    function wrapChunkArrayPush(arr) {
        if (!Array.isArray(arr) || arr.__ytabChunkWrapped) return;
        try {
            Object.defineProperty(arr, '__ytabChunkWrapped', {
                value: true, writable: false, configurable: false, enumerable: false
            });
        } catch (e) { /* ignore */ }
        const originalPush = arr.push;
        const proxiedPush = new Proxy(originalPush, {
            apply(target, thisArg, args) {
                try {
                    if (isEnabled() && state.features.webpackChunkHook) {
                        for (const chunk of args) {
                            // Chunk shape: [chunkIds, modules, runtime?]
                            if (!Array.isArray(chunk)) continue;
                            const modules = chunk[1];
                            if (!modules || typeof modules !== 'object') continue;
                            for (const id of Object.keys(modules)) {
                                const factory = modules[id];
                                if (typeof factory !== 'function') continue;
                                let src;
                                try {
                                    src = (state.originals.functionToString || Function.prototype.toString).call(factory);
                                } catch (e) { continue; }
                                if (webpackFactoryMatchesAdSignature(src)) {
                                    // Replace the factory with a no-op that
                                    // still fulfills the module contract.
                                    // module.exports stays an empty object,
                                    // which means YT's consumer code treats
                                    // the module as "returned no ad data"
                                    // — strictly better than running the
                                    // ad-rendering factory.
                                    modules[id] = function ytabNoopModule(module, __unused_exports, __unused_require) {
                                        try { module.exports = {}; } catch (e) { /* ignore */ }
                                    };
                                    incrementStat('pruned');
                                }
                            }
                        }
                    }
                } catch (e) { /* never let recon break the page */ }
                return Reflect.apply(target, thisArg, args);
            }
        });
        registerNativeMask(proxiedPush, originalPush);
        try {
            Object.defineProperty(arr, 'push', {
                value: proxiedPush, writable: true, configurable: true
            });
        } catch (e) { /* locked */ }
    }

    /* =========================================================================
     * ENGINE: Cosmetic Filtering
     * ===================================================================== */

    function watchCosmeticStyleSurvival() {
        // Re-inject if YouTube's head rewrites during SPA nav or ad-detection
        // tries to strip our style. The observer is scoped to <head> only,
        // so the cost is negligible compared to a document-wide observer.
        if (state._cosmeticObserver) return;
        if (typeof MutationObserver === 'undefined') return;
        const head = document.head;
        if (!head) return; // document-start: <head> not yet in the tree — retry later
        const observer = new MutationObserver(() => {
            if (state.cosmeticStyleEl && !state.cosmeticStyleEl.isConnected) {
                updateCosmeticCSS();
            }
        });
        try {
            observer.observe(head, { childList: true });
            state._cosmeticObserver = observer;
        } catch (e) {
            try { observer.disconnect(); } catch (err) { /* ignore */ }
        }
    }

    let cosmeticCSSLastHash = '';

    function updateCosmeticCSS() {
        // Re-resolve when the cached node has been torn out of the document,
        // e.g. if YouTube rewrites <head> during an SPA navigation. The old
        // implementation kept a stale reference and silently stopped updating.
        if (!state.cosmeticStyleEl || !state.cosmeticStyleEl.isConnected) {
            state.cosmeticStyleEl = ensureStyleElement(`${CSS_PREFIX}-cosmetic`);
            cosmeticCSSLastHash = '';
        }
        watchCosmeticStyleSurvival();

        if (!isEnabled() || !state.features.cosmeticHiding) {
            if (cosmeticCSSLastHash !== '') {
                state.cosmeticStyleEl.textContent = '';
                cosmeticCSSLastHash = '';
            }
            return;
        }

        const selectors = state.filters?.cosmeticSelectors || DEFAULT_FILTERS.cosmeticSelectors;
        const upsellSelectors = (state.features.upsellBlock)
            ? (state.filters?.upsellSelectors || DEFAULT_FILTERS.upsellSelectors)
            : [];
        // Defense-in-depth: re-check every selector before serializing it
        // into CSS. The parser filters unsafe selectors, but the built-in
        // DEFAULT_FILTERS and any cached filter payload from older versions
        // haven't been through that gate. Keeping the check here means no
        // selector — from any source — can introduce CSS-escape vectors.
        const safe = [];
        for (const s of selectors) if (isSafeCosmeticSelector(s)) safe.push(s);
        for (const s of upsellSelectors) if (isSafeCosmeticSelector(s)) safe.push(s);
        if (!safe.length) {
            if (cosmeticCSSLastHash !== '') {
                state.cosmeticStyleEl.textContent = '';
                cosmeticCSSLastHash = '';
            }
            return;
        }
        // Cheap identity check: only rewrite the <style> element when the
        // selector set actually changed. On SPA navigations + the 1.5s
        // DeArrow sweep this short-circuits the common case (same filter
        // set, same feature flags) with zero DOM writes.
        const hash = safe.length + ':' + safe[0] + ':' + safe[safe.length - 1];
        if (hash === cosmeticCSSLastHash) return;
        cosmeticCSSLastHash = hash;
        // One rule per selector — per the CSS spec, a malformed selector in
        // a comma list invalidates the whole rule. Per-selector isolation
        // means a single bad entry only loses itself.
        state.cosmeticStyleEl.textContent = safe
            .map(s => `${s} { display: none !important; }`)
            .join('\n');
    }

    /* =========================================================================
     * ENGINE: DeArrow (crowd-sourced titles & thumbnails)
     * =========================================================================
     * Uses the same privacy-preserving hash-prefix pattern as SponsorBlock:
     * send sha256(videoID).slice(0, 4) to /api/branding/{prefix}, then
     * filter the returned bucket locally. Never sends the full videoID.
     * The fetched branding replaces titles and thumbnails in feeds and on
     * the watch page. Cached per-videoID with a 6-hour TTL + LRU cap.
     * ===================================================================== */

    const dearrowCache = new Map(); // videoId → {title, thumbnailUrl, fetchedAt}

    function dearrowCacheSet(videoId, entry) {
        lruCacheSet(dearrowCache, DEARROW_CACHE_MAX, videoId, entry);
    }

    function dearrowCacheGet(videoId) {
        return lruCacheGet(dearrowCache, DEARROW_CACHE_TTL, videoId);
    }

    function dearrowFetchBucket(hashPrefix) {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest !== 'function') { resolve(null); return; }
            const url = `${DEARROW_API}/${hashPrefix}`;
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout: DEARROW_TIMEOUT_MS,
                onload(resp) {
                    if (!resp || resp.status !== 200) { resolve(null); return; }
                    try { resolve(jsonParseRaw(resp.responseText)); }
                    catch (e) { resolve(null); }
                },
                onerror() { resolve(null); },
                ontimeout() { resolve(null); }
            });
        });
    }

    async function dearrowResolve(videoId) {
        if (!videoId) return null;
        const cached = dearrowCacheGet(videoId);
        if (cached) return cached;
        const prefix = await sha256HexPrefix(videoId, 4);
        if (!prefix) return null;
        const bucket = await dearrowFetchBucket(prefix);
        if (!bucket || typeof bucket !== 'object') return null;
        // DeArrow returns { videoID: { titles: [...], thumbnails: [...] } }
        // keyed by full videoId. Pick the top-voted entry that is locked or
        // has positive score.
        const entry = bucket[videoId];
        if (!entry || typeof entry !== 'object') {
            dearrowCacheSet(videoId, { title: null, thumbnailUrl: null });
            return dearrowCacheGet(videoId);
        }
        const title = (Array.isArray(entry.titles) ? entry.titles : [])
            .filter(t => t && typeof t.title === 'string' && t.votes >= 0)
            .sort((a, b) => (b.locked - a.locked) || (b.votes - a.votes))[0];
        const thumb = (Array.isArray(entry.thumbnails) ? entry.thumbnails : [])
            .filter(t => t && (t.locked || t.votes >= 0))
            .sort((a, b) => (b.locked - a.locked) || (b.votes - a.votes))[0];
        const result = {
            title: title ? String(title.title) : null,
            thumbnailUrl: (thumb && thumb.timestamp != null)
                ? `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${encodeURIComponent(videoId)}&time=${encodeURIComponent(thumb.timestamp)}`
                : null
        };
        dearrowCacheSet(videoId, result);
        return result;
    }

    function extractVideoIdFromHref(href) {
        if (!href) return null;
        return extractVideoIdFromUrl(href, location.origin);
    }

    async function applyDearrowToElement(el) {
        if (!el || el._ytabDearrowApplied) return;
        // Support multiple renderer shapes: tile, rich-item, video-renderer,
        // compact, grid. All of them nest an <a id="thumbnail"> with the
        // watch link + a title element with id or class containing "title".
        const anchor = el.querySelector('a#thumbnail, a.yt-simple-endpoint[href*="/watch"], a.yt-simple-endpoint[href*="/shorts/"]');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        const videoId = extractVideoIdFromHref(href);
        if (!videoId) return;

        let branding;
        try { branding = await dearrowResolve(videoId); }
        catch (e) { return; }
        if (!branding) return;

        // Mark AFTER the async fetch so concurrent passes see we're in flight.
        // The idempotent branding write below is safe on repeat application.
        el._ytabDearrowApplied = true;

        if (branding.title) {
            const titleEl = el.querySelector('#video-title, yt-formatted-string#video-title, .title, h3 a, a#video-title-link, #title > h1, yt-formatted-string.ytd-rich-grid-media');
            if (titleEl) {
                try {
                    if (titleEl.tagName === 'A' || titleEl.querySelector) {
                        const innerTitle = titleEl.querySelector('yt-formatted-string') || titleEl;
                        innerTitle.textContent = branding.title;
                    } else {
                        titleEl.textContent = branding.title;
                    }
                    incrementStat('dearrowReplaced');
                } catch (e) { /* ignore */ }
            }
        }
        if (branding.thumbnailUrl) {
            const img = el.querySelector('img.yt-core-image, img#img, ytd-thumbnail img, img.yt-img-shadow');
            if (img) {
                try { img.src = branding.thumbnailUrl; }
                catch (e) { /* ignore */ }
            }
        }
    }

    function sweepDearrow(root = document) {
        if (!isEnabled() || !state.features.dearrow) return;
        const items = root.querySelectorAll(
            'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ' +
            'ytd-grid-video-renderer, ytd-compact-radio-renderer, ytd-playlist-video-renderer, ' +
            'yt-lockup-view-model, ytd-reel-item-renderer'
        );
        items.forEach(applyDearrowToElement);
        // Also replace the watch page primary title.
        if (location.pathname === '/watch') {
            const vid = getCurrentVideoId();
            if (vid) {
                dearrowResolve(vid).then(branding => {
                    if (!branding || !branding.title) return;
                    const h1 = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1 yt-formatted-string.ytd-video-primary-info-renderer');
                    if (h1 && h1.textContent !== branding.title) {
                        try { h1.textContent = branding.title; incrementStat('dearrowReplaced'); }
                        catch (e) { /* ignore */ }
                    }
                }).catch(() => {});
            }
        }
    }

    function installDeArrow() {
        // The DeArrow API is "free to use for all non browser-extensions"
        // (wiki.sponsor.ajay.app/w/API_Docs/DeArrow). The userscript build
        // qualifies; the extension build does not until explicit permission
        // from the maintainer is granted, so it ships with DeArrow inert.
        if (IS_EXTENSION_BUILD) return;
        // Sweep on SPA nav + on a throttled interval. A MutationObserver on
        // document.body is too noisy on YouTube — polling every 1.5s is
        // functionally equivalent for feed-level replacements.
        const run = () => sweepDearrow(document);
        registerInterval(run, 1500);
        document.addEventListener('yt-navigate-finish', run);
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run, { once: true });
        } else {
            run();
        }
    }

    /* =========================================================================
     * ENGINE: Return YouTube Dislike
     * =========================================================================
     * Fetches archived vote counts from returnyoutubedislikeapi.com and
     * injects the dislike count under the like button. Cached 30 minutes
     * per-videoID with an LRU cap so repeat views on the same tab don't
     * re-fetch. No cookies are sent (GM_xmlhttpRequest omits credentials
     * in the extension build, and Tampermonkey omits them by default on
     * cross-origin sync calls).
     * ===================================================================== */

    const rydCache = new Map(); // videoId → { dislikes, fetchedAt }

    function rydCacheSet(videoId, entry) {
        lruCacheSet(rydCache, RYD_CACHE_MAX, videoId, entry);
    }

    function rydCacheGet(videoId) {
        return lruCacheGet(rydCache, RYD_CACHE_TTL, videoId);
    }

    function rydFetch(videoId) {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest !== 'function') { resolve(null); return; }
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${RYD_API}?videoId=${encodeURIComponent(videoId)}`,
                timeout: RYD_TIMEOUT_MS,
                onload(resp) {
                    if (!resp || resp.status !== 200) { resolve(null); return; }
                    try {
                        const data = jsonParseRaw(resp.responseText);
                        if (data && typeof data.dislikes === 'number') {
                            resolve({ dislikes: data.dislikes, likes: data.likes, rating: data.rating });
                        } else { resolve(null); }
                    } catch (e) { resolve(null); }
                },
                onerror() { resolve(null); },
                ontimeout() { resolve(null); }
            });
        });
    }

    function formatCompact(n) {
        if (!Number.isFinite(n) || n < 0) return String(n);
        if (n < 1000) return String(Math.floor(n));
        if (n < 10000) return (Math.floor(n / 100) / 10).toFixed(1) + 'K';
        if (n < 1_000_000) return Math.floor(n / 1000) + 'K';
        if (n < 10_000_000) return (Math.floor(n / 100_000) / 10).toFixed(1) + 'M';
        return Math.floor(n / 1_000_000) + 'M';
    }

    async function applyRyd(videoId) {
        let entry = rydCacheGet(videoId);
        if (!entry) {
            entry = await rydFetch(videoId);
            if (!entry) return;
            rydCacheSet(videoId, entry);
        }
        // Find the dislike button — YT buries it in segmented-like-dislike-button-view-model
        // or in the legacy like-button-view-model. Fall back to segmented button text span.
        const dislikeBtn = document.querySelector(
            'dislike-button-view-model button, ' +
            'segmented-like-dislike-button-view-model dislike-button-view-model button, ' +
            'ytd-toggle-button-renderer[is-disabled] #text, ' +
            'button[aria-label*="Dislike" i]'
        );
        if (!dislikeBtn) return;
        const label = formatCompact(entry.dislikes);
        // Try to write into an existing count span first.
        const existing = dislikeBtn.querySelector('.yt-spec-button-shape-next__button-text-content');
        if (existing) {
            if (existing.textContent !== label) existing.textContent = label;
        } else {
            // Append a small count chip ourselves.
            let chip = dislikeBtn.querySelector(`.${CSS_PREFIX}-ryd-count`);
            if (!chip) {
                chip = document.createElement('span');
                chip.className = `${CSS_PREFIX}-ryd-count`;
                chip.style.marginLeft = '6px';
                chip.style.fontSize = '13px';
                chip.style.opacity = '0.9';
                dislikeBtn.appendChild(chip);
            }
            chip.textContent = label;
        }
        try { dislikeBtn.setAttribute('aria-label', STRINGS.ryd.dislikeLabel(label)); } catch (e) { /* ignore */ }
    }

    function sweepRyd() {
        if (!isEnabled() || !state.features.returnYoutubeDislike) return;
        if (location.pathname !== '/watch') return;
        const vid = getCurrentVideoId();
        if (!vid) return;
        applyRyd(vid).catch(() => {});
    }

    function installReturnYoutubeDislike() {
        registerInterval(sweepRyd, 2500);
        document.addEventListener('yt-navigate-finish', sweepRyd);
    }

    /* =========================================================================
     * ENGINE: Original Audio Track Forcer
     * =========================================================================
     * YouTube can default to auto-dubbed or translated audio tracks. The player
     * API exposes the active and available tracks after the watch page loads,
     * so this helper picks an explicitly marked "original" track when one is
     * available and leaves ambiguous track lists untouched.
     * ===================================================================== */

    const ORIGINAL_AUDIO_LABEL_RE = /\boriginal\b/i;
    const DUBBED_AUDIO_LABEL_RE = /\b(auto[-\s]?dub|dubbed|translated|translation)\b/i;

    const originalAudioState = {
        lastAttemptKey: '',
        lastAttemptAt: 0
    };

    function getAudioTrackSearchText(track) {
        const parts = [];
        const seen = new Set();

        function walk(value, depth) {
            if (value == null || depth > 4) return;
            if (typeof value === 'string') {
                const text = value.trim();
                if (text) parts.push(text);
                return;
            }
            if (typeof value !== 'object') return;
            if (seen.has(value)) return;
            seen.add(value);
            for (const child of Object.values(value)) {
                walk(child, depth + 1);
            }
        }

        walk(track, 0);
        return parts.join(' ');
    }

    function audioTrackIdentity(track) {
        if (!track || typeof track !== 'object') return '';
        const direct = track.id || track.audioTrackId || track.trackId || track.languageCode || track.vssId;
        const nested = track.audioTrack?.id ||
            track.audioTrack?.audioTrackId ||
            track.audioTrack?.languageCode ||
            track.captionTrack?.vssId ||
            track.captionTrack?.languageCode ||
            track.captionTrack?.name;
        return String(direct || nested || getAudioTrackSearchText(track)).trim().toLowerCase();
    }

    function audioTracksSame(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        const aId = audioTrackIdentity(a);
        const bId = audioTrackIdentity(b);
        return !!aId && aId === bId;
    }

    function audioTrackHasOriginalMarker(track) {
        return ORIGINAL_AUDIO_LABEL_RE.test(getAudioTrackSearchText(track));
    }

    function audioTrackHasDubbedMarker(track) {
        return DUBBED_AUDIO_LABEL_RE.test(getAudioTrackSearchText(track));
    }

    function pickOriginalAudioTrack(tracks, currentTrack) {
        if (!Array.isArray(tracks) || tracks.length < 2) return null;
        if (currentTrack && audioTrackHasOriginalMarker(currentTrack)) return null;
        const candidates = tracks
            .filter(track => track && typeof track === 'object' && audioTrackHasOriginalMarker(track))
            .filter(track => !audioTracksSame(track, currentTrack))
            .sort((a, b) => {
                const aScore = audioTrackHasDubbedMarker(a) ? 0 : 1;
                const bScore = audioTrackHasDubbedMarker(b) ? 0 : 1;
                return bScore - aScore;
            });
        return candidates[0] || null;
    }

    function getYoutubePlayerApi() {
        const candidates = [
            document.getElementById('movie_player'),
            document.querySelector('#movie_player'),
            document.querySelector('ytd-player #movie_player'),
            document.querySelector('#shorts-player')
        ];
        return candidates.find(player =>
            player &&
            typeof player.getAvailableAudioTracks === 'function' &&
            typeof player.setAudioTrack === 'function'
        ) || null;
    }

    function applyOriginalAudioTrack(player) {
        if (!isEnabled() || !state.features.forceOriginalAudio) return false;
        if (!player || typeof player.getAvailableAudioTracks !== 'function' || typeof player.setAudioTrack !== 'function') {
            return false;
        }
        let tracks;
        try {
            tracks = player.getAvailableAudioTracks();
        } catch (e) {
            return false;
        }
        const current = typeof player.getAudioTrack === 'function'
            ? (() => {
                try { return player.getAudioTrack(); } catch (e) { return null; }
            })()
            : null;
        const target = pickOriginalAudioTrack(tracks, current);
        if (!target) return false;

        const videoKey = getCurrentVideoId() || location.href || 'unknown';
        const attemptKey = `${videoKey}|${audioTrackIdentity(target)}`;
        const now = Date.now();
        if (originalAudioState.lastAttemptKey === attemptKey && now - originalAudioState.lastAttemptAt < 10000) {
            return false;
        }

        try {
            player.setAudioTrack(target);
            originalAudioState.lastAttemptKey = attemptKey;
            originalAudioState.lastAttemptAt = now;
            return true;
        } catch (e) {
            return false;
        }
    }

    function enforceOriginalAudioTrack() {
        const player = getYoutubePlayerApi();
        if (!player) return false;
        return applyOriginalAudioTrack(player);
    }

    function installOriginalAudioForcer() {
        const tick = () => {
            try { enforceOriginalAudioTrack(); } catch (e) { /* keep player playback untouched */ }
        };
        registerInterval(tick, 2500);
        document.addEventListener('yt-navigate-finish', () => {
            originalAudioState.lastAttemptKey = '';
            originalAudioState.lastAttemptAt = 0;
            tick();
        });
    }

    /* =========================================================================
     * ENGINE: Volume Boost (Web Audio)
     * =========================================================================
     * The HTMLMediaElement.volume ceiling is 1.0. For quiet videos we attach
     * a Web Audio graph: video → MediaElementSource → GainNode → destination.
     * Gain is driven by a local setting (default 1.0) and persists across
     * SPA navs. If attaching fails (cross-origin media, autoplay policy), we
     * leave the video alone — the native player keeps working.
     * ===================================================================== */

    const volumeBoostState = {
        ctx: null,
        gainNode: null,
        source: null,
        video: null,
        sliderEl: null,
        labelEl: null
    };

    function clampVolumeBoost(v) {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return 1;
        return Math.min(VOLUME_BOOST_MAX, Math.max(1, n));
    }

    function getStoredVolumeBoost() {
        const raw = Number(getSetting('volume_boost', 1));
        return clampVolumeBoost(raw);
    }

    function attachVolumeBoost() {
        if (!isEnabled() || !state.features.volumeBoost) return;
        const video = document.querySelector('video.html5-main-video');
        if (!video) return;
        if (volumeBoostState.video === video && volumeBoostState.gainNode) return;
        try {
            if (!volumeBoostState.ctx) {
                const Ctor = window.AudioContext || window.webkitAudioContext;
                if (!Ctor) return;
                volumeBoostState.ctx = new Ctor();
            }
            // If we already bridged a *different* element, the old
            // MediaElementSource is still wired to destination. Disconnect
            // before rewiring so we don't route two videos through our node.
            if (volumeBoostState.source && volumeBoostState.video !== video) {
                try { volumeBoostState.source.disconnect(); } catch (e) { /* ignore */ }
                try { volumeBoostState.gainNode.disconnect(); } catch (e) { /* ignore */ }
            }
            // createMediaElementSource throws if the element is already
            // routed through another AudioContext (e.g. after a hot reload).
            // Fall back to swapping gain only.
            let source;
            try {
                source = volumeBoostState.ctx.createMediaElementSource(video);
            } catch (e) {
                // Re-use the previously-built graph if it exists.
                if (volumeBoostState.source && volumeBoostState.gainNode) {
                    volumeBoostState.gainNode.gain.value = getStoredVolumeBoost();
                    return;
                }
                return;
            }
            const gain = volumeBoostState.ctx.createGain();
            gain.gain.value = getStoredVolumeBoost();
            source.connect(gain).connect(volumeBoostState.ctx.destination);
            volumeBoostState.source = source;
            volumeBoostState.gainNode = gain;
            volumeBoostState.video = video;
        } catch (e) { /* attach failed — leave native audio path alone */ }
    }

    function setVolumeBoost(value) {
        const v = clampVolumeBoost(value);
        setSetting('volume_boost', v);
        if (volumeBoostState.gainNode) {
            try { volumeBoostState.gainNode.gain.value = v; } catch (e) { /* ignore */ }
        }
        if (volumeBoostState.ctx && volumeBoostState.ctx.state === 'suspended') {
            try { volumeBoostState.ctx.resume(); } catch (e) { /* ignore */ }
        }
        if (volumeBoostState.labelEl) {
            volumeBoostState.labelEl.textContent = `${Math.round(v * 100)}%`;
        }
        if (volumeBoostState.sliderEl && Number(volumeBoostState.sliderEl.value) !== v) {
            volumeBoostState.sliderEl.value = String(v);
        }
    }

    function ensureVolumeBoostSlider() {
        if (!isEnabled() || !state.features.volumeBoost) {
            // Clean up if disabled mid-session.
            const existing = document.getElementById(`${CSS_PREFIX}-vol-boost`);
            if (existing) existing.remove();
            return;
        }
        if (document.getElementById(`${CSS_PREFIX}-vol-boost`)) return;
        const anchor = document.querySelector('.ytp-chrome-controls .ytp-right-controls') ||
                       document.querySelector('.ytp-chrome-bottom .ytp-chrome-controls');
        if (!anchor) return;
        const host = document.createElement('div');
        host.id = `${CSS_PREFIX}-vol-boost`;
        host.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:0 8px;color:#fff;font:12px Aptos,system-ui,sans-serif;';
        const tag = document.createElement('span');
        tag.textContent = STRINGS.volumeBoost.tag;
        tag.style.opacity = '0.75';
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '1';
        slider.max = String(VOLUME_BOOST_MAX);
        slider.step = '0.1';
        slider.value = String(getStoredVolumeBoost());
        slider.style.width = '80px';
        slider.title = STRINGS.volumeBoost.title;
        const label = document.createElement('span');
        label.textContent = `${Math.round(getStoredVolumeBoost() * 100)}%`;
        slider.addEventListener('input', () => setVolumeBoost(Number(slider.value)));
        volumeBoostState.sliderEl = slider;
        volumeBoostState.labelEl = label;
        host.append(tag, slider, label);
        anchor.prepend(host);
    }

    function installVolumeBoost() {
        const tick = () => {
            if (!isEnabled() || !state.features.volumeBoost) {
                const existing = document.getElementById(`${CSS_PREFIX}-vol-boost`);
                if (existing) existing.remove();
                return;
            }
            attachVolumeBoost();
            ensureVolumeBoostSlider();
        };
        registerInterval(tick, 1500);
        document.addEventListener('yt-navigate-finish', tick);
    }

    /* =========================================================================
     * ENGINE: Clutter-Free Mode (Unhook-style feed/UI hides)
     * =========================================================================
     * Each toggle is a small CSS ruleset written into a dedicated style
     * element managed by updateClutterCSS(). The engine re-runs on feature
     * toggle so users see instant results without reload. Selectors are
     * widely-known YT component tags — no semantic content is removed,
     * only promotional and distracting surfaces.
     * ===================================================================== */

    const CLUTTER_SELECTORS = {
        hideHomeFeed: [
            'ytd-browse[page-subtype="home"] ytd-rich-grid-renderer',
            'ytm-rich-grid-renderer'
        ],
        hideShortsShelf: [
            'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
            'ytd-reel-shelf-renderer',
            'ytd-rich-shelf-renderer[is-shorts]',
            'grid-shelf-view-model:has(a[href*="/shorts/"])'
        ],
        hideShortsTab: [
            'ytd-guide-entry-renderer a[title="Shorts"]',
            'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
            'ytd-guide-entry-renderer:has(a[href="/shorts"])',
            'yt-chip-cloud-chip-renderer[chip-style="STYLE_HOME_FILTER"]:has(yt-formatted-string[title="Shorts"])'
        ],
        hideRelated: [
            '#related.ytd-watch-flexy',
            'ytd-watch-next-secondary-results-renderer'
        ],
        hideComments: [
            '#comments.ytd-watch-flexy',
            'ytd-comments#comments'
        ],
        hideEndScreen: [
            '.ytp-ce-element',
            '.ytp-endscreen-content',
            '.ytp-pause-overlay'
        ],
        hideLiveChat: [
            '#chat.ytd-watch-flexy',
            'ytd-live-chat-frame'
        ],
        hideMerch: [
            'ytd-merch-shelf-renderer',
            'ytd-product-list-renderer',
            'ytd-ticket-shelf-renderer',
            'ytd-shopping-carousel-renderer'
        ],
        hideMembersOnly: [
            'ytd-rich-item-renderer:has(ytd-badge-supported-renderer [aria-label*="Members"])',
            'ytd-video-renderer:has(ytd-badge-supported-renderer [aria-label*="Members"])',
            'ytd-compact-video-renderer:has(ytd-badge-supported-renderer [aria-label*="Members"])',
            'ytd-grid-video-renderer:has(ytd-badge-supported-renderer [aria-label*="Members"])'
        ],
        hideSponsoredComments: [
            'ytd-comment-renderer:has(#sponsor-comment-badge)',
            '#description ytd-metadata-row-renderer:has(a[href*="/redirect"])',
            '#description a[href*="amzn.to"]',
            '#description a[href*="bit.ly"]'
        ]
    };

    function updateClutterCSS() {
        const style = ensureStyleElement(`${CSS_PREFIX}-clutter`);
        if (!isEnabled()) { style.textContent = ''; return; }
        const parts = [];
        for (const [feature, selectors] of Object.entries(CLUTTER_SELECTORS)) {
            if (!state.features[feature]) continue;
            for (const sel of selectors) parts.push(`${sel} { display: none !important; }`);
        }
        style.textContent = parts.join('\n');
    }

    /* =========================================================================
     * ENGINE: Shorts → /watch redirect
     * =========================================================================
     * Rewrites every /shorts/VIDEO_ID URL so the full player is used.
     * Catches: direct navigation, back/forward, in-page SPA nav (click
     * on a shorts tile while /watch is the primary surface). Uses a
     * history.replaceState rewrite so the location bar matches what the
     * player loads.
     * ===================================================================== */

    function redirectShortsIfNeeded() {
        if (!isEnabled() || !state.features.shortsRedirect) return;
        try {
            if (location.pathname.startsWith('/shorts/')) {
                const m = location.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/);
                if (m) {
                    const target = `/watch?v=${m[1]}`;
                    // Hard nav — a replaceState trick doesn't actually
                    // switch the surface renderer. Use location.replace
                    // so the user's back button lands on the feed they
                    // came from, not the aborted /shorts URL.
                    location.replace(target);
                }
            }
        } catch (e) { /* ignore */ }
    }

    function installShortsRedirect() {
        redirectShortsIfNeeded();
        document.addEventListener('yt-navigate-finish', redirectShortsIfNeeded);
    }

    /* =========================================================================
     * ENGINE: Channel + Keyword blocklist
     * =========================================================================
     * Reads user-defined channel names and keyword lines from GM storage
     * and strips matching entries from common feed payloads inside
     * pruneObject's walk surface. Lists are plain text, one entry per line,
     * case-insensitive. Integrates with the existing pruneKeys pipeline
     * so filters apply across every intercepted surface.
     * ===================================================================== */

    function normalizeChannelId(value) {
        if (typeof value !== 'string') return '';
        var match = value.match(/\b(UC[A-Za-z0-9_-]{20,})\b/);
        return match ? match[1].toLowerCase() : '';
    }

    function normalizeChannelHandle(value) {
        if (typeof value !== 'string') return '';
        var match = value.match(/(^|[\/\s])@([A-Za-z0-9._-]{2,})\b/);
        return match ? `@${match[2].toLowerCase()}` : '';
    }

    function normalizeChannelPath(value) {
        if (typeof value !== 'string') return '';
        var text = value.trim();
        if (!text) return '';
        var path = '';
        try {
            if (/^https?:\/\//i.test(text)) {
                path = new URL(text).pathname;
            } else if (/^(www\.)?(youtube\.com|m\.youtube\.com|music\.youtube\.com)\//i.test(text)) {
                path = new URL(`https://${text}`).pathname;
            } else {
                path = text;
            }
        } catch (e) {
            path = text;
        }
        path = String(path || '').split(/[?#]/)[0].replace(/\/+$/, '');
        if (!path) return '';
        if (!path.startsWith('/')) path = `/${path}`;
        var channelId = normalizeChannelId(path);
        if (channelId) return `/channel/${channelId}`;
        var handle = normalizeChannelHandle(path);
        if (handle) return `/${handle}`;
        var custom = path.match(/^\/(c|user)\/([^/]+)$/i);
        if (custom) return `/${custom[1].toLowerCase()}/${custom[2].toLowerCase()}`;
        return '';
    }

    function parseChannelEntry(raw) {
        var channelId = normalizeChannelId(raw);
        var handle = normalizeChannelHandle(raw);
        var path = normalizeChannelPath(raw);
        var hasStableKey = !!(channelId || handle || path);
        return {
            type: 'channel',
            value: hasStableKey ? '' : raw.toLowerCase(),
            channelId,
            handle,
            path
        };
    }

    function parseBlocklist(raw, options) {
        if (typeof raw !== 'string' || !raw) return [];
        const channelMode = !!(options && options.channel);
        const entries = [];
        for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            var rxMatch = trimmed.match(/^\/(.+)\/([gimsuy]*)$/);
            if (rxMatch) {
                try {
                    var flags = rxMatch[2].includes('i') ? rxMatch[2] : rxMatch[2] + 'i';
                    entries.push({ type: 'regex', pattern: new RegExp(rxMatch[1], flags) });
                } catch (e) {
                    entries.push({ type: 'string', value: trimmed.toLowerCase() });
                }
            } else if (channelMode) {
                entries.push(parseChannelEntry(trimmed));
            } else {
                entries.push({ type: 'string', value: trimmed.toLowerCase() });
            }
        }
        return entries;
    }

    function getChannelBlocklist() {
        if (!state.features.channelBlocker) return [];
        return parseBlocklist(getSetting('channel_blocklist', ''), { channel: true });
    }

    function getKeywordBlocklist() {
        if (!state.features.keywordBlocker) return [];
        return parseBlocklist(getSetting('keyword_blocklist', ''));
    }

    function getAdAllowlist() {
        if (!state.features.adAllowlist) return [];
        return parseBlocklist(getSetting('ad_allowlist', ''), { channel: true });
    }

    function parseDurationSeconds(text) {
        if (typeof text !== 'string') return -1;
        var parts = text.trim().split(':').map(Number);
        if (parts.some(isNaN)) return -1;
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 1) return parts[0];
        return -1;
    }

    function extractRendererDuration(renderer) {
        try {
            var lt = renderer.lengthText || {};
            var raw = lt.simpleText || (Array.isArray(lt.runs) ? lt.runs.map(function(r) { return r?.text || ''; }).join('') : '');
            if (raw) return parseDurationSeconds(raw);
            if (renderer.thumbnailOverlays) {
                for (var i = 0; i < renderer.thumbnailOverlays.length; i++) {
                    var ov = renderer.thumbnailOverlays[i];
                    var tr = ov?.thumbnailOverlayTimeStatusRenderer;
                    if (tr && tr.text) {
                        var txt = tr.text.simpleText || (Array.isArray(tr.text.runs) ? tr.text.runs.map(function(r) { return r?.text || ''; }).join('') : '');
                        if (txt) return parseDurationSeconds(txt);
                    }
                }
            }
        } catch (e) { /* ignore */ }
        return -1;
    }

    function extractRendererChannel(renderer) {
        try {
            var c = renderer.longBylineText || renderer.shortBylineText || renderer.ownerText || {};
            if (Array.isArray(c.runs)) return c.runs.map(function(r) { return r?.text || ''; }).join('');
            if (typeof c.simpleText === 'string') return c.simpleText;
        } catch (e) { /* ignore */ }
        return '';
    }

    function addUnique(list, value) {
        if (!value || list.includes(value)) return;
        list.push(value);
    }

    function collectEndpointIdentity(endpoint, identity) {
        if (!endpoint || typeof endpoint !== 'object' || !identity) return;
        try {
            var browse = endpoint.browseEndpoint || {};
            addUnique(identity.channelIds, normalizeChannelId(browse.browseId || ''));
            addUnique(identity.paths, normalizeChannelPath(browse.canonicalBaseUrl || ''));
            addUnique(identity.handles, normalizeChannelHandle(browse.canonicalBaseUrl || ''));
            var webUrl = endpoint.commandMetadata && endpoint.commandMetadata.webCommandMetadata
                ? endpoint.commandMetadata.webCommandMetadata.url
                : '';
            addUnique(identity.paths, normalizeChannelPath(webUrl || ''));
            addUnique(identity.handles, normalizeChannelHandle(webUrl || ''));
        } catch (e) { /* ignore */ }
    }

    function collectTextEndpointIdentity(textObj, identity) {
        if (!textObj || typeof textObj !== 'object') return;
        try {
            if (!Array.isArray(textObj.runs)) return;
            for (var i = 0; i < textObj.runs.length; i++) {
                collectEndpointIdentity(textObj.runs[i]?.navigationEndpoint, identity);
            }
        } catch (e) { /* ignore */ }
    }

    function extractRendererChannelIdentity(renderer) {
        var identity = {
            name: extractRendererChannel(renderer),
            channelIds: [],
            handles: [],
            paths: []
        };
        if (!renderer || typeof renderer !== 'object') return identity;
        addUnique(identity.channelIds, normalizeChannelId(renderer.channelId || ''));
        collectTextEndpointIdentity(renderer.longBylineText, identity);
        collectTextEndpointIdentity(renderer.shortBylineText, identity);
        collectTextEndpointIdentity(renderer.ownerText, identity);
        collectEndpointIdentity(renderer.navigationEndpoint, identity);
        collectEndpointIdentity(renderer.ownerEndpoint, identity);
        try {
            collectEndpointIdentity(
                renderer.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.navigationEndpoint,
                identity
            );
        } catch (e) { /* ignore */ }
        return identity;
    }

    function matchesList(text, list) {
        if (!text) return false;
        text = String(text);
        var lc = text.toLowerCase();
        for (var i = 0; i < list.length; i++) {
            var entry = list[i];
            if (entry.type === 'regex') {
                entry.pattern.lastIndex = 0;
                if (entry.pattern.test(text)) return true;
            } else if (lc.includes(entry.value)) {
                return true;
            }
        }
        return false;
    }

    function normalizeChannelIdentity(channel) {
        if (!channel || typeof channel === 'string') {
            return {
                name: channel || '',
                channelIds: [],
                handles: [],
                paths: []
            };
        }
        return {
            name: channel.name || channel.author || '',
            channelIds: Array.isArray(channel.channelIds)
                ? channel.channelIds
                : [normalizeChannelId(channel.channelId || '')].filter(Boolean),
            handles: Array.isArray(channel.handles)
                ? channel.handles
                : [normalizeChannelHandle(channel.handle || '')].filter(Boolean),
            paths: Array.isArray(channel.paths)
                ? channel.paths
                : [normalizeChannelPath(channel.path || channel.url || '')].filter(Boolean)
        };
    }

    function channelIdentityCandidates(identity) {
        identity = normalizeChannelIdentity(identity);
        return [identity.name]
            .concat(identity.channelIds || [])
            .concat(identity.handles || [])
            .concat(identity.paths || [])
            .filter(Boolean);
    }

    function matchesChannelEntry(identity, entry) {
        identity = normalizeChannelIdentity(identity);
        if (!entry) return false;
        if (entry.type === 'regex') {
            var candidates = channelIdentityCandidates(identity);
            for (var i = 0; i < candidates.length; i++) {
                entry.pattern.lastIndex = 0;
                if (entry.pattern.test(candidates[i])) return true;
            }
            return false;
        }
        if (entry.type === 'channel') {
            if (entry.channelId && (identity.channelIds || []).includes(entry.channelId)) return true;
            if (entry.handle && (identity.handles || []).includes(entry.handle)) return true;
            if (entry.path && (identity.paths || []).includes(entry.path)) return true;
            if (entry.value && String(identity.name || '').toLowerCase().includes(entry.value)) return true;
            return false;
        }
        return matchesList(identity.name || '', [entry]);
    }

    function matchesChannelList(identity, list) {
        for (var i = 0; i < list.length; i++) {
            if (matchesChannelEntry(identity, list[i])) return true;
        }
        return false;
    }

    function isChannelAdAllowed(channel) {
        var identity = normalizeChannelIdentity(channel);
        if (!identity.name && !identity.channelIds.length && !identity.handles.length && !identity.paths.length) return false;
        var list = getAdAllowlist();
        if (!list.length) return false;
        return matchesChannelList(identity, list);
    }

    function videoRendererMatches(renderer, channels, keywords) {
        if (!renderer || typeof renderer !== 'object') return false;
        var title = '';
        try {
            var t = renderer.title || {};
            if (typeof t.simpleText === 'string') title = t.simpleText;
            else if (Array.isArray(t.runs)) title = t.runs.map(function(r) { return r?.text || ''; }).join('');
        } catch (e) { /* ignore */ }
        var channelIdentity = extractRendererChannelIdentity(renderer);
        var isWhitelist = state.features.whitelistMode;
        if (isWhitelist && channels.length) {
            if (!matchesChannelList(channelIdentity, channels)) return true;
        } else {
            if (matchesChannelList(channelIdentity, channels)) return true;
        }
        if (matchesList(title, keywords)) return true;
        if (state.features.durationFilter) {
            var dur = extractRendererDuration(renderer);
            if (dur >= 0) {
                var minDur = parseInt(getSetting('duration_min', ''), 10);
                var maxDur = parseInt(getSetting('duration_max', ''), 10);
                if (!isNaN(minDur) && minDur > 0 && dur < minDur) return true;
                if (!isNaN(maxDur) && maxDur > 0 && dur > maxDur) return true;
            }
        }
        return false;
    }

    function feedFilterWalk(value, channels, keywords, depth) {
        if (depth === undefined) depth = 0;
        if (!value || depth > 16) return 0;
        var dropped = 0;
        if (Array.isArray(value)) {
            for (var i = value.length - 1; i >= 0; i--) {
                var item = value[i];
                if (!item || typeof item !== 'object') continue;
                var candidate = item.videoRenderer || item.gridVideoRenderer ||
                                  item.compactVideoRenderer || (item.richItemRenderer && item.richItemRenderer.content && item.richItemRenderer.content.videoRenderer) ||
                                  item.reelItemRenderer || null;
                if (candidate && videoRendererMatches(candidate, channels, keywords)) {
                    value.splice(i, 1);
                    dropped++;
                    continue;
                }
                dropped += feedFilterWalk(item, channels, keywords, depth + 1);
            }
        } else if (typeof value === 'object') {
            var keys = Object.keys(value);
            for (var ki = 0; ki < keys.length; ki++) {
                dropped += feedFilterWalk(value[keys[ki]], channels, keywords, depth + 1);
            }
        }
        return dropped;
    }

    function handleExtensionBlockChannel() {
        try {
            var channelEl = document.querySelector('#owner #channel-name a, ytd-video-owner-renderer #channel-name a, #upload-info #channel-name a');
            var channelName = channelEl ? channelEl.textContent.trim() : '';
            if (!channelName) return;
            var channelLine = '';
            try {
                channelLine = channelEl && (channelEl.href || channelEl.getAttribute('href')) || '';
            } catch (e) { channelLine = ''; }
            channelLine = channelLine || channelName;
            var existing = getSetting('channel_blocklist', '');
            var lines = existing ? existing.split(/\r?\n/).map(function(l) { return l.trim(); }) : [];
            if (lines.some(function(l) { return l.toLowerCase() === channelLine.toLowerCase(); })) return;
            lines.push(channelLine);
            setSetting('channel_blocklist', lines.filter(Boolean).join('\n'));
            if (!state.features.channelBlocker) {
                state.features.channelBlocker = true;
                setSetting('channelBlocker', true);
            }
        } catch (e) { /* ignore */ }
    }

    function installFeedFilter() {
        // No-op install point — the blocklist walk is inlined into
        // pruneObject so every intercept surface (JSON.parse, fetch, XHR)
        // shares the same filtering. This engine slot exists so the
        // feature can be observed in diagnostics and so future hooks
        // (e.g. SPA DOM sweep for already-rendered tiles) can attach here.
        try {
            document.addEventListener('ytab:block-channel', handleExtensionBlockChannel);
        } catch (e) { /* ignore */ }
    }

    /* =========================================================================
     * INSTALL ALL ENGINES
     * ===================================================================== */

    function installProxies() {
        if (state.proxiesInstalled) return;
        state.proxiesInstalled = true;

        const engines = [
            // The toString mask MUST install first so every subsequent
            // `registerNativeMask(proxy, original)` call has the patched
            // Function.prototype.toString in place when YT inspects it.
            ['NativeToStringMask', installNativeToStringMask],
            ['ServiceWorkerBlock', installServiceWorkerBlock],
            ['WebpackChunkHook', installWebpackChunkHook],
            ['JSONParseProxy', installJSONParseProxy],
            ['FetchProxy', installFetchProxy],
            ['XHRProxy', installXHRProxy],
            ['ObjectAssignHook', installObjectAssignHook],
            ['PropertyTraps', installPropertyTraps],
            ['AbnormalityBypass', installAbnormalityBypass],
            ['DOMBypassPrevention', installDOMBypassPrevention],
            ['SSAPAutoSkip', installSSAPAutoSkip],
            ['VideoAdFastForward', installVideoAdFastForward],
            ['SponsorBlock', installSponsorBlock],
            ['TimerNeutralization', installTimerNeutralization],
            ['CosmeticCSS', updateCosmeticCSS],
            ['DeArrow', installDeArrow],
            ['ReturnYoutubeDislike', installReturnYoutubeDislike],
            ['OriginalAudioForcer', installOriginalAudioForcer],
            ['VolumeBoost', installVolumeBoost],
            ['ClutterCSS', updateClutterCSS],
            ['ShortsRedirect', installShortsRedirect],
            ['FeedFilter', installFeedFilter]
        ];

        for (const [name, fn] of engines) {
            const failuresBefore = state.overrideFailures.length;
            try {
                fn();
                // An engine that "succeeded" but lost one of its safeOverride
                // calls (e.g. to YouTube's locker script or a competing
                // blocker) is degraded, not healthy — surface that distinctly
                // so the Control Center can explain what actually happened.
                state.engineHealth[name] = state.overrideFailures.length > failuresBefore
                    ? 'degraded'
                    : 'ok';
            } catch (e) {
                state.engineHealth[name] = 'failed';
                console.warn(`[${SCRIPT_NAME}] Engine ${name} failed:`, e);
            }
        }

        const unhealthy = Object.entries(state.engineHealth)
            .filter(([, status]) => status !== 'ok')
            .map(([name, status]) => `${name}:${status}`);
        console.log(`[${SCRIPT_NAME} v${SCRIPT_VERSION}] Engines active | Source: ${state.filterSource} | Filters v${state.filters?.version || '?'}${unhealthy.length ? ` | Unhealthy: ${unhealthy.join(', ')}` : ''}`);
    }

    /* =========================================================================
     * UI: Toast Notifications
     * ===================================================================== */

    function showToast(msg, type = 'info') {
        if (typeof msg !== 'string' || !msg) return;
        const safeType = TOAST_TYPES.has(type) ? type : 'info';
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => showToast(msg, safeType), { once: true });
            return;
        }
        const region = ensureToastRegion();
        if (!region) return;

        // Drop the oldest toasts once we exceed the visible cap so a burst of
        // errors can't fill the viewport or overlap with the settings panel.
        while (region.childElementCount >= TOAST_MAX_VISIBLE) {
            const oldest = region.firstElementChild;
            if (!oldest) break;
            oldest.remove();
        }

        const toast = document.createElement('div');
        toast.className = `${CSS_PREFIX}-toast ${CSS_PREFIX}-toast-${safeType}`;
        toast.setAttribute('role', safeType === 'error' ? 'alert' : 'status');

        const tone = document.createElement('span');
        tone.className = `${CSS_PREFIX}-toast-tone`;

        const copy = document.createElement('div');
        const title = document.createElement('div');
        title.className = `${CSS_PREFIX}-toast-title`;
        title.textContent = STRINGS.toastTitles[safeType];
        const msgSpan = document.createElement('div');
        msgSpan.className = `${CSS_PREFIX}-toast-message`;
        msgSpan.textContent = msg;
        copy.append(title, msgSpan);

        toast.append(tone, copy);
        region.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add(`${CSS_PREFIX}-toast-visible`);
        });
        setTimeout(() => {
            if (!toast.isConnected) return;
            toast.classList.remove(`${CSS_PREFIX}-toast-visible`);
            setTimeout(() => toast.remove(), 220);
        }, 3500);
    }

    function ensureToastRegion() {
        if (state.toastRegionEl && state.toastRegionEl.isConnected) return state.toastRegionEl;
        if (!document.body) return null;
        const region = document.createElement('div');
        region.className = `${CSS_PREFIX}-toast-region`;
        region.setAttribute('role', 'status');
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-atomic', 'false');
        document.body.appendChild(region);
        state.toastRegionEl = region;
        return region;
    }

    /* =========================================================================
     * UI: Settings Panel
     * ===================================================================== */

    function injectSettingsCSS() {
        const css = `
            body:not(.${CSS_PREFIX}-ready) .${CSS_PREFIX}-overlay { display: none !important; }
            .${CSS_PREFIX}-sr-only {
                position: absolute;
                width: 1px;
                height: 1px;
                padding: 0;
                margin: -1px;
                overflow: hidden;
                clip: rect(0, 0, 0, 0);
                white-space: nowrap;
                border: 0;
            }
            .${CSS_PREFIX}-overlay {
                position: fixed;
                inset: 0;
                z-index: 2147483646;
                display: grid;
                place-items: center;
                padding:
                    max(14px, env(safe-area-inset-top))
                    max(14px, env(safe-area-inset-right))
                    max(14px, env(safe-area-inset-bottom))
                    max(14px, env(safe-area-inset-left));
                background: rgba(7, 10, 18, 0.76);
                backdrop-filter: blur(16px) saturate(120%);
                -webkit-backdrop-filter: blur(16px) saturate(120%);
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.18s ease;
                font-family: "Aptos", "Segoe UI Variable Text", "SF Pro Display", "Helvetica Neue", system-ui, sans-serif;
            }
            .${CSS_PREFIX}-overlay.${CSS_PREFIX}-active {
                opacity: 1;
                pointer-events: auto;
            }
            .${CSS_PREFIX}-panel {
                --panel-border: rgba(255, 255, 255, 0.08);
                --panel-border-strong: rgba(255, 255, 255, 0.14);
                --accent: #ff6a4d;
                --accent-strong: #ff8a5c;
                --accent-focus: rgba(255, 106, 77, 0.16);
                --accent-focus-border: rgba(255, 106, 77, 0.48);
                --accent-tap: rgba(255, 106, 77, 0.14);
                --accent-glow: rgba(255, 106, 77, 0.28);
                --scrollbar-thumb: rgba(255, 255, 255, 0.14);
                --scrollbar-thumb-webkit: rgba(255, 255, 255, 0.12);
                --success: #66d995;
                --info: #7abfff;
                --warning: #ffc46b;
                --danger: #ff8e97;
                --text: #f7f8fb;
                --text-2: #c3cbda;
                --text-3: #8893a7;
                width: min(760px, calc(100vw - 24px));
                height: min(920px, calc(100vh - 24px));
                max-height: min(920px, calc(100vh - 24px));
                display: flex;
                flex-direction: column;
                overflow: hidden;
                border-radius: 22px;
                border: 1px solid var(--panel-border);
                background: rgba(16, 20, 29, 0.98);
                color: var(--text);
                color-scheme: dark;
                box-shadow: 0 24px 56px rgba(0, 0, 0, 0.45);
                transform: translateY(8px);
                transition: transform 0.18s ease;
                outline: none;
            }
            .${CSS_PREFIX}-overlay.${CSS_PREFIX}-active .${CSS_PREFIX}-panel {
                transform: translateY(0);
            }
            .${CSS_PREFIX}-header,
            .${CSS_PREFIX}-footer {
                padding-left: 24px;
                padding-right: 24px;
            }
            .${CSS_PREFIX}-header {
                display: flex;
                justify-content: space-between;
                gap: 16px;
                align-items: flex-start;
                padding-top: 20px;
                padding-bottom: 16px;
                border-bottom: 1px solid var(--panel-border);
                background: rgba(255, 255, 255, 0.015);
            }
            .${CSS_PREFIX}-header-left {
                display: grid;
                gap: 8px;
                min-width: 0;
            }
            .${CSS_PREFIX}-logo {
                width: 46px;
                height: 46px;
                border-radius: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, var(--accent), var(--accent-strong));
                color: #fff;
                font-size: 14px;
                font-weight: 800;
                letter-spacing: 0.08em;
                box-shadow: 0 14px 34px var(--accent-glow);
                flex-shrink: 0;
            }
            .${CSS_PREFIX}-brand {
                min-width: 0;
            }
            .${CSS_PREFIX}-eyebrow {
                margin: 0;
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.12em;
                font-weight: 700;
                color: var(--text-3);
            }
            .${CSS_PREFIX}-title-row {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                align-items: center;
                margin-bottom: 4px;
            }
            .${CSS_PREFIX}-title {
                margin: 0;
                font-size: 21px;
                line-height: 1.1;
                font-weight: 760;
                letter-spacing: -0.03em;
                text-wrap: balance;
            }
            .${CSS_PREFIX}-version {
                padding: 4px 8px;
                border-radius: 999px;
                border: 1px solid var(--panel-border);
                background: rgba(255, 255, 255, 0.03);
                font-size: 10px;
                font-weight: 650;
                color: var(--text-3);
            }
            .${CSS_PREFIX}-header-desc {
                margin: 0;
                max-width: 520px;
                font-size: 13px;
                line-height: 1.5;
                color: var(--text-2);
            }
            .${CSS_PREFIX}-header-search {
                margin-top: 10px;
                max-width: 320px;
            }
            .${CSS_PREFIX}-search-input {
                width: 100%;
                min-height: 38px;
                padding-block: 10px;
                font-family: inherit;
                font-size: 13px;
            }
            .${CSS_PREFIX}-header-right {
                display: flex;
                gap: 10px;
                align-items: center;
                flex-shrink: 0;
            }
            .${CSS_PREFIX}-content {
                flex: 1;
                min-height: 0;
                overflow: auto;
                overflow-x: hidden;
                padding: 0;
                overscroll-behavior: contain;
                scrollbar-gutter: stable both-edges;
                scrollbar-width: thin;
                scrollbar-color: var(--scrollbar-thumb) transparent;
            }
            .${CSS_PREFIX}-content::-webkit-scrollbar {
                width: 8px;
            }
            .${CSS_PREFIX}-content::-webkit-scrollbar-thumb {
                background: var(--scrollbar-thumb-webkit);
                border-radius: 999px;
            }
            .${CSS_PREFIX}-layout {
                display: grid;
                grid-template-columns: minmax(0, 1fr);
                gap: 16px;
                padding: 16px 24px 24px;
            }
            .${CSS_PREFIX}-section {
                min-width: 0;
                scroll-margin-top: 18px;
            }
            .${CSS_PREFIX}-section-span {
                grid-column: 1 / -1;
            }
            .${CSS_PREFIX}-section-head {
                display: flex;
                justify-content: space-between;
                gap: 16px;
                align-items: flex-start;
                margin-bottom: 10px;
            }
            .${CSS_PREFIX}-section-head > div {
                min-width: 0;
            }
            .${CSS_PREFIX}-section-disclosure {
                display: grid;
                gap: 10px;
            }
            .${CSS_PREFIX}-section-toggle {
                margin-bottom: 0;
                list-style: none;
                cursor: pointer;
            }
            .${CSS_PREFIX}-section-toggle::-webkit-details-marker {
                display: none;
            }
            .${CSS_PREFIX}-section-toggle::marker {
                content: '';
            }
            .${CSS_PREFIX}-section-toggle-meta {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
            }
            .${CSS_PREFIX}-section-toggle:hover .${CSS_PREFIX}-section-title {
                color: var(--text);
            }
            .${CSS_PREFIX}-section-toggle:focus-visible {
                outline: none;
                border-radius: 12px;
                box-shadow: 0 0 0 3px var(--accent-focus);
            }
            .${CSS_PREFIX}-section-chevron {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 18px;
                height: 18px;
                color: var(--text-3);
                font-size: 15px;
                line-height: 1;
                transition: transform 0.16s ease, color 0.16s ease;
            }
            .${CSS_PREFIX}-section-disclosure[open] .${CSS_PREFIX}-section-chevron {
                transform: rotate(90deg);
                color: var(--text-2);
            }
            .${CSS_PREFIX}-section-title {
                margin: 0 0 3px;
                font-size: 14px;
                line-height: 1.2;
                font-weight: 720;
                letter-spacing: -0.01em;
                text-wrap: balance;
            }
            .${CSS_PREFIX}-section-desc,
            .${CSS_PREFIX}-field-help,
            .${CSS_PREFIX}-row-desc,
            .${CSS_PREFIX}-summary-text,
            .${CSS_PREFIX}-footer-status,
            .${CSS_PREFIX}-detail-text,
            .${CSS_PREFIX}-glance-detail,
            .${CSS_PREFIX}-note-text,
            .${CSS_PREFIX}-toast-message {
                margin: 0;
                font-size: 12px;
                line-height: 1.55;
                color: var(--text-2);
            }
            .${CSS_PREFIX}-surface {
                display: grid;
                gap: 14px;
                height: 100%;
                padding: 18px;
                border-radius: 16px;
                border: 1px solid var(--panel-border);
                background: rgba(255, 255, 255, 0.025);
            }
            .${CSS_PREFIX}-summary {
                gap: 16px;
            }
            .${CSS_PREFIX}-summary-hero {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 16px;
                align-items: start;
            }
            .${CSS_PREFIX}-summary-copy {
                display: grid;
                gap: 12px;
                min-width: 0;
            }
            .${CSS_PREFIX}-summary-title {
                margin: 0;
                font-size: 24px;
                line-height: 1;
                font-weight: 770;
                letter-spacing: -0.04em;
                text-wrap: balance;
            }
            .${CSS_PREFIX}-chip-row,
            .${CSS_PREFIX}-btn-row,
            .${CSS_PREFIX}-url-group,
            .${CSS_PREFIX}-jump-nav,
            .${CSS_PREFIX}-summary-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .${CSS_PREFIX}-summary-facts {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 10px;
            }
            .${CSS_PREFIX}-summary-control {
                display: flex;
                gap: 12px;
                align-items: center;
                justify-content: space-between;
                min-width: 220px;
                padding: 14px 16px;
                border-radius: 14px;
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.08);
            }
            .${CSS_PREFIX}-summary-control-copy {
                min-width: 0;
            }
            .${CSS_PREFIX}-summary-control-label {
                margin: 0 0 4px;
                font-size: 12px;
                font-weight: 720;
                color: var(--text);
            }
            .${CSS_PREFIX}-summary-control-text {
                margin: 0;
                font-size: 11px;
                line-height: 1.5;
                color: var(--text-2);
            }
            .${CSS_PREFIX}-glance-grid {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 10px;
            }
            .${CSS_PREFIX}-glance {
                display: grid;
                gap: 4px;
                padding: 12px 14px;
                border-radius: 14px;
                border: 1px solid rgba(255, 255, 255, 0.06);
                background: rgba(255, 255, 255, 0.015);
            }
            .${CSS_PREFIX}-glance[data-tone="success"] {
                border-color: rgba(102, 217, 149, 0.24);
            }
            .${CSS_PREFIX}-glance[data-tone="info"] {
                border-color: rgba(122, 191, 255, 0.22);
            }
            .${CSS_PREFIX}-glance[data-tone="warn"] {
                border-color: rgba(255, 196, 107, 0.24);
            }
            .${CSS_PREFIX}-glance-label {
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                font-weight: 700;
                color: var(--text-3);
            }
            .${CSS_PREFIX}-glance-value {
                font-size: 14px;
                line-height: 1.2;
                font-weight: 720;
                letter-spacing: -0.02em;
                text-wrap: balance;
            }
            .${CSS_PREFIX}-action-groups {
                display: grid;
                gap: 14px;
            }
            .${CSS_PREFIX}-action-group {
                display: grid;
                gap: 12px;
            }
            .${CSS_PREFIX}-action-group + .${CSS_PREFIX}-action-group {
                padding-top: 16px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
            }
            .${CSS_PREFIX}-action-group-title {
                margin: 0;
                font-size: 13px;
                font-weight: 720;
                letter-spacing: -0.01em;
            }
            .${CSS_PREFIX}-summary-support {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 12px;
            }
            .${CSS_PREFIX}-detail-card {
                display: grid;
                gap: 12px;
                min-width: 0;
                padding: 16px;
                border-radius: 16px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(255, 255, 255, 0.04);
            }
            .${CSS_PREFIX}-detail-title {
                margin: 0;
                font-size: 13px;
                font-weight: 720;
                letter-spacing: -0.01em;
            }
            .${CSS_PREFIX}-metric-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                gap: 10px;
            }
            .${CSS_PREFIX}-metric {
                padding: 15px 16px;
                border-radius: 16px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(255, 255, 255, 0.04);
            }
            .${CSS_PREFIX}-metric-label {
                display: block;
                margin-bottom: 8px;
                color: var(--text-3);
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.09em;
                font-weight: 700;
            }
            .${CSS_PREFIX}-metric-value {
                display: block;
                font-size: 23px;
                line-height: 1;
                font-weight: 780;
                letter-spacing: -0.05em;
                font-variant-numeric: tabular-nums;
            }
            .${CSS_PREFIX}-pill {
                display: inline-flex;
                align-items: center;
                gap: 0;
                padding: 5px 9px;
                border-radius: 999px;
                border: 1px solid transparent;
                font-size: 10px;
                font-weight: 650;
            }
            .${CSS_PREFIX}-pill::before {
                display: none;
            }
            .${CSS_PREFIX}-pill[data-tone="success"] {
                color: var(--success);
                background: rgba(102, 217, 149, 0.14);
                border-color: rgba(102, 217, 149, 0.22);
            }
            .${CSS_PREFIX}-pill[data-tone="info"] {
                color: var(--info);
                background: rgba(122, 191, 255, 0.14);
                border-color: rgba(122, 191, 255, 0.22);
            }
            .${CSS_PREFIX}-pill[data-tone="warn"] {
                color: var(--warning);
                background: rgba(255, 196, 107, 0.15);
                border-color: rgba(255, 196, 107, 0.22);
            }
            .${CSS_PREFIX}-pill[data-tone="danger"] {
                color: var(--danger);
                background: rgba(255, 142, 151, 0.15);
                border-color: rgba(255, 142, 151, 0.22);
            }
            .${CSS_PREFIX}-pill[data-tone="neutral"] {
                color: var(--text-2);
                background: rgba(255, 255, 255, 0.06);
                border-color: var(--panel-border);
            }
            .${CSS_PREFIX}-field {
                display: grid;
                gap: 10px;
            }
            .${CSS_PREFIX}-field-label {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                font-size: 12px;
                font-weight: 720;
            }
            .${CSS_PREFIX}-input {
                flex: 1 1 320px;
                min-width: 0;
                min-height: 44px;
                padding: 12px 14px;
                border-radius: 12px;
                border: 1px solid var(--panel-border);
                background: rgba(255, 255, 255, 0.025);
                color: var(--text);
                font-size: 12px;
                line-height: 1.45;
                font-family: "Cascadia Code", "SF Mono", Consolas, monospace;
                touch-action: manipulation;
                -webkit-tap-highlight-color: var(--accent-tap);
                outline: none;
                transition: border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
            }
            .${CSS_PREFIX}-input:hover {
                background: rgba(255, 255, 255, 0.04);
            }
            .${CSS_PREFIX}-input:focus-visible {
                border-color: var(--accent-focus-border);
                box-shadow: 0 0 0 3px var(--accent-tap);
                background: rgba(255, 255, 255, 0.045);
            }
            .${CSS_PREFIX}-input[aria-invalid="true"] {
                border-color: rgba(255, 142, 151, 0.58);
                box-shadow: 0 0 0 3px rgba(255, 142, 151, 0.14);
            }
            .${CSS_PREFIX}-input::placeholder {
                color: var(--text-3);
            }
            .${CSS_PREFIX}-btn,
            .${CSS_PREFIX}-close {
                transition:
                    background 0.16s ease,
                    border-color 0.16s ease,
                    color 0.16s ease,
                    transform 0.16s ease,
                    box-shadow 0.16s ease;
            }
            .${CSS_PREFIX}-btn {
                min-height: 40px;
                padding: 9px 14px;
                border-radius: 12px;
                border: 1px solid transparent;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                white-space: nowrap;
                text-decoration: none;
                touch-action: manipulation;
                -webkit-tap-highlight-color: var(--accent-tap);
            }
            .${CSS_PREFIX}-btn:disabled {
                cursor: default;
                opacity: 0.74;
            }
            .${CSS_PREFIX}-btn-primary {
                background: var(--accent);
                color: #fff;
            }
            .${CSS_PREFIX}-btn-primary:hover {
                background: var(--accent-strong);
            }
            .${CSS_PREFIX}-btn-secondary {
                background: rgba(255, 255, 255, 0.04);
                color: var(--text);
                border-color: var(--panel-border);
            }
            .${CSS_PREFIX}-btn-secondary:hover {
                background: rgba(255, 255, 255, 0.06);
                border-color: var(--panel-border-strong);
            }
            .${CSS_PREFIX}-btn-ghost {
                background: transparent;
                color: var(--text-2);
                border-color: rgba(255, 255, 255, 0.08);
            }
            .${CSS_PREFIX}-btn-ghost:hover {
                color: var(--text);
                background: rgba(255, 255, 255, 0.03);
                border-color: rgba(255, 255, 255, 0.14);
            }
            .${CSS_PREFIX}-btn-danger {
                background: rgba(255, 142, 151, 0.12);
                color: #ffd8dc;
                border-color: rgba(255, 142, 151, 0.24);
            }
            .${CSS_PREFIX}-btn-danger:hover {
                background: rgba(255, 142, 151, 0.16);
            }
            .${CSS_PREFIX}-btn[data-armed="true"] {
                background: rgba(255, 196, 107, 0.16);
                color: #ffe7b6;
                border-color: rgba(255, 196, 107, 0.3);
                box-shadow: 0 0 0 3px rgba(255, 196, 107, 0.08);
            }
            .${CSS_PREFIX}-btn-small {
                min-height: 36px;
                padding-inline: 12px;
                border-radius: 10px;
                font-size: 11px;
            }
            .${CSS_PREFIX}-close {
                width: 36px;
                height: 36px;
                border-radius: 12px;
                background: transparent;
                border: 1px solid rgba(255, 255, 255, 0.08);
                color: var(--text-2);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                cursor: pointer;
                touch-action: manipulation;
                -webkit-tap-highlight-color: var(--accent-tap);
            }
            .${CSS_PREFIX}-close:hover {
                color: var(--text);
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(255, 255, 255, 0.14);
            }
            .${CSS_PREFIX}-toggle-list {
                display: grid;
                gap: 8px;
            }
            .${CSS_PREFIX}-row {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 16px;
                align-items: center;
                padding: 13px 14px;
                border-radius: 14px;
                border: 1px solid rgba(255, 255, 255, 0.07);
                background: rgba(255, 255, 255, 0.015);
                transition: border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
                cursor: pointer;
                touch-action: manipulation;
                -webkit-tap-highlight-color: var(--accent-tap);
            }
            .${CSS_PREFIX}-row:hover {
                background: rgba(255, 255, 255, 0.028);
                border-color: rgba(255, 255, 255, 0.1);
            }
            .${CSS_PREFIX}-row:focus-within {
                border-color: var(--accent-focus-border);
                box-shadow: 0 0 0 3px var(--accent-focus);
            }
            .${CSS_PREFIX}-row-label-line {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                align-items: center;
                margin-bottom: 5px;
            }
            .${CSS_PREFIX}-row-label {
                font-size: 13px;
                font-weight: 700;
                letter-spacing: -0.01em;
            }
            .${CSS_PREFIX}-row[data-enabled="false"] {
                background: rgba(255, 255, 255, 0.008);
            }
            .${CSS_PREFIX}-toggle {
                position: relative;
                width: 50px;
                height: 30px;
                display: inline-flex;
                flex-shrink: 0;
            }
            .${CSS_PREFIX}-toggle input {
                position: absolute;
                opacity: 0;
                inset: 0;
                margin: 0;
                cursor: pointer;
                z-index: 1;
            }
            .${CSS_PREFIX}-toggle-track {
                position: absolute;
                inset: 0;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.17);
                border: 1px solid rgba(255, 255, 255, 0.08);
                pointer-events: none;
                transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .${CSS_PREFIX}-toggle-track::after {
                content: '';
                position: absolute;
                top: 3px;
                left: 3px;
                width: 22px;
                height: 22px;
                border-radius: 50%;
                background: #fff;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.24);
                transition: transform 0.2s ease;
            }
            .${CSS_PREFIX}-toggle input:checked + .${CSS_PREFIX}-toggle-track {
                background: var(--accent);
                border-color: transparent;
            }
            .${CSS_PREFIX}-toggle input:checked + .${CSS_PREFIX}-toggle-track::after {
                transform: translateX(20px);
            }
            .${CSS_PREFIX}-note {
                display: grid;
                gap: 4px;
                padding: 12px 14px;
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-left-width: 3px;
                background: rgba(255, 255, 255, 0.02);
            }
            .${CSS_PREFIX}-note[data-tone="success"] {
                border-color: rgba(102, 217, 149, 0.24);
                background: rgba(102, 217, 149, 0.05);
            }
            .${CSS_PREFIX}-note[data-tone="info"] {
                border-color: rgba(122, 191, 255, 0.22);
                background: rgba(122, 191, 255, 0.05);
            }
            .${CSS_PREFIX}-note[data-tone="warn"] {
                border-color: rgba(255, 196, 107, 0.24);
                background: rgba(255, 196, 107, 0.05);
            }
            .${CSS_PREFIX}-note[data-tone="danger"] {
                border-color: rgba(255, 142, 151, 0.24);
                background: rgba(255, 142, 151, 0.05);
            }
            .${CSS_PREFIX}-note-title {
                margin: 0;
                font-size: 12px;
                font-weight: 760;
            }
            .${CSS_PREFIX}-footer {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                flex-wrap: wrap;
                align-items: center;
                padding-top: 14px;
                padding-bottom: 16px;
                border-top: 1px solid var(--panel-border);
                background: rgba(255, 255, 255, 0.015);
            }
            .${CSS_PREFIX}-footer-meta {
                display: grid;
                gap: 5px;
                min-width: 0;
            }
            .${CSS_PREFIX}-footer-hint {
                font-size: 11px;
                color: var(--text-3);
            }
            .${CSS_PREFIX}-footer-hint {
                text-wrap: balance;
            }
            .${CSS_PREFIX}-toast-region {
                position: fixed;
                right: max(18px, env(safe-area-inset-right));
                bottom: max(18px, env(safe-area-inset-bottom));
                z-index: 2147483647;
                display: grid;
                gap: 10px;
                width: min(360px, calc(100vw - 30px));
                pointer-events: none;
            }
            .${CSS_PREFIX}-toast {
                display: grid;
                grid-template-columns: auto minmax(0, 1fr);
                gap: 12px;
                align-items: start;
                padding: 12px 14px;
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(15, 20, 31, 0.96);
                box-shadow: 0 18px 36px rgba(0, 0, 0, 0.34);
                backdrop-filter: blur(18px);
                -webkit-backdrop-filter: blur(18px);
                opacity: 0;
                transform: translateY(10px);
                transition: opacity 0.2s ease, transform 0.2s ease;
            }
            .${CSS_PREFIX}-toast-visible {
                opacity: 1;
                transform: translateY(0);
            }
            .${CSS_PREFIX}-toast-tone {
                width: 8px;
                height: 8px;
                margin-top: 5px;
                border-radius: 50%;
                background: var(--info);
            }
            .${CSS_PREFIX}-toast-success .${CSS_PREFIX}-toast-tone {
                background: var(--success);
            }
            .${CSS_PREFIX}-toast-error .${CSS_PREFIX}-toast-tone {
                background: var(--danger);
            }
            .${CSS_PREFIX}-toast-warn .${CSS_PREFIX}-toast-tone {
                background: var(--warning);
            }
            .${CSS_PREFIX}-toast-title {
                margin-bottom: 4px;
                font-size: 12px;
                font-weight: 760;
            }
            .${CSS_PREFIX}-spinner {
                width: 14px;
                height: 14px;
                border: 2px solid transparent;
                border-top-color: currentColor;
                border-radius: 50%;
                animation: ${CSS_PREFIX}-spin 0.6s linear infinite;
                display: inline-block;
            }
            @keyframes ${CSS_PREFIX}-spin {
                to { transform: rotate(360deg); }
            }
            .${CSS_PREFIX}-btn:focus-visible,
            .${CSS_PREFIX}-close:focus-visible,
            .${CSS_PREFIX}-toggle input:focus-visible + .${CSS_PREFIX}-toggle-track,
            .${CSS_PREFIX}-input:focus-visible {
                outline: none;
                box-shadow: 0 0 0 3px var(--accent-focus);
            }
            @media (max-width: 820px) {
                .${CSS_PREFIX}-overlay {
                    padding:
                        max(10px, env(safe-area-inset-top))
                        max(10px, env(safe-area-inset-right))
                        max(10px, env(safe-area-inset-bottom))
                        max(10px, env(safe-area-inset-left));
                }
                .${CSS_PREFIX}-panel {
                    width: min(100%, calc(100vw - 8px));
                    height: min(920px, calc(100vh - 8px));
                    max-height: min(920px, calc(100vh - 8px));
                    border-radius: 22px;
                }
                .${CSS_PREFIX}-header,
                .${CSS_PREFIX}-footer {
                    padding-left: 20px;
                    padding-right: 20px;
                }
                .${CSS_PREFIX}-layout {
                    padding: 12px 20px 22px;
                }
                .${CSS_PREFIX}-summary-hero {
                    grid-template-columns: 1fr;
                }
                .${CSS_PREFIX}-summary-control {
                    min-width: 0;
                    width: 100%;
                }
                .${CSS_PREFIX}-summary-facts {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
            }
            @media (max-width: 560px) {
                .${CSS_PREFIX}-header {
                    flex-direction: column;
                }
                .${CSS_PREFIX}-header-right {
                    width: 100%;
                    justify-content: space-between;
                }
                .${CSS_PREFIX}-header-search {
                    max-width: none;
                }
                .${CSS_PREFIX}-layout {
                    padding: 12px 16px 20px;
                }
                .${CSS_PREFIX}-summary-facts {
                    grid-template-columns: 1fr;
                }
                .${CSS_PREFIX}-btn-row,
                .${CSS_PREFIX}-url-group,
                .${CSS_PREFIX}-jump-nav,
                .${CSS_PREFIX}-summary-actions {
                    display: grid;
                }
                .${CSS_PREFIX}-btn {
                    width: 100%;
                }
                .${CSS_PREFIX}-footer {
                    align-items: flex-start;
                }
                .${CSS_PREFIX}-row {
                    grid-template-columns: 1fr;
                }
            }
            @media (prefers-reduced-motion: reduce) {
                .${CSS_PREFIX}-overlay,
                .${CSS_PREFIX}-panel,
                .${CSS_PREFIX}-btn,
                .${CSS_PREFIX}-row,
                .${CSS_PREFIX}-toast,
                .${CSS_PREFIX}-toggle-track,
                .${CSS_PREFIX}-toggle-track::after,
                .${CSS_PREFIX}-section-chevron {
                    transition: none !important;
                }
                .${CSS_PREFIX}-spinner {
                    animation-duration: 0.01ms;
                    animation-iteration-count: 1;
                }
            }
            .${CSS_PREFIX}-blocklist-textarea {
                width: 100%;
                min-height: 80px;
                resize: vertical;
                padding: 10px;
                border-radius: 10px;
                border: 1px solid var(--panel-border);
                background: rgba(0, 0, 0, 0.35);
                color: var(--text);
                font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
            }
            .${CSS_PREFIX}-blocklist-textarea:focus {
                outline: 2px solid var(--accent);
                outline-offset: -2px;
            }
            .${CSS_PREFIX}-attribution {
                margin-top: 8px;
                font-size: 11px;
                opacity: 0.7;
            }
            .${CSS_PREFIX}-attribution a {
                color: var(--accent);
                text-decoration: underline;
            }
        `;
        ensureStyleElement(`${CSS_PREFIX}-ui`).textContent = css;
    }

    function buildSettingsPanel() {
        if (state.overlayEl && state.overlayEl.isConnected) return;

        const overlay = document.createElement('div');
        overlay.className = `${CSS_PREFIX}-overlay`;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) toggleSettings(false);
        });

        const panel = document.createElement('div');
        panel.className = `${CSS_PREFIX}-panel`;
        panel.tabIndex = -1;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', `${CSS_PREFIX}-dialog-title`);
        panel.setAttribute('aria-describedby', `${CSS_PREFIX}-dialog-desc`);
        panel.addEventListener('keydown', handleDialogKeydown);

        const header = document.createElement('div');
        header.className = `${CSS_PREFIX}-header`;

        const headerLeft = document.createElement('div');
        headerLeft.className = `${CSS_PREFIX}-header-left`;

        const brand = document.createElement('div');
        brand.className = `${CSS_PREFIX}-brand`;

        const eyebrow = document.createElement('div');
        eyebrow.className = `${CSS_PREFIX}-eyebrow`;
        eyebrow.textContent = STRINGS.ui.controlCenter;

        const titleRow = document.createElement('div');
        titleRow.className = `${CSS_PREFIX}-title-row`;

        const title = document.createElement('h1');
        title.className = `${CSS_PREFIX}-title`;
        title.id = `${CSS_PREFIX}-dialog-title`;
        title.textContent = SCRIPT_NAME;

        const version = document.createElement('span');
        version.className = `${CSS_PREFIX}-version`;
        version.textContent = `v${SCRIPT_VERSION}`;

        titleRow.append(title, version);

        const description = document.createElement('p');
        description.className = `${CSS_PREFIX}-header-desc`;
        description.id = `${CSS_PREFIX}-dialog-desc`;
        description.textContent = STRINGS.ui.headerDescription;

        const searchWrap = document.createElement('div');
        searchWrap.className = `${CSS_PREFIX}-header-search`;
        const searchLabel = document.createElement('label');
        searchLabel.className = `${CSS_PREFIX}-sr-only`;
        searchLabel.setAttribute('for', `${CSS_PREFIX}-settings-search`);
        searchLabel.textContent = STRINGS.ui.findSetting;
        const searchInput = document.createElement('input');
        searchInput.className = `${CSS_PREFIX}-input ${CSS_PREFIX}-search-input`;
        searchInput.id = `${CSS_PREFIX}-settings-search`;
        searchInput.type = 'search';
        searchInput.name = 'settings_search';
        searchInput.autocomplete = 'off';
        searchInput.spellcheck = false;
        searchInput.placeholder = STRINGS.ui.findSettingPlaceholder;
        searchInput.value = state.settingsQuery;
        searchInput.setAttribute('aria-controls', `${CSS_PREFIX}-content`);
        searchInput.setAttribute('aria-label', STRINGS.ui.findSetting);
        // Debounce the search rebuild: every keystroke triggered a full
        // panel re-render (buildContent recreates every section DOM).
        // On a typical query that's a dozen wasted rebuilds in a second,
        // each producing a perceptible focus wobble. A 120ms gap feels
        // instant to a human but coalesces fast typing into a single
        // rebuild. Escape still clears synchronously because it's a
        // one-shot action, not high-frequency.
        const SEARCH_DEBOUNCE_MS = 120;
        let searchDebounceTimer = null;
        const applySearchRebuild = () => {
            searchDebounceTimer = null;
            const content = document.getElementById(`${CSS_PREFIX}-content`);
            if (content) content.scrollTop = 0;
            buildContent();
            refreshSettingsUI();
        };
        searchInput.addEventListener('input', () => {
            state.settingsQuery = searchInput.value;
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(applySearchRebuild, SEARCH_DEBOUNCE_MS);
        });
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && searchInput.value) {
                event.preventDefault();
                event.stopPropagation();
                searchInput.value = '';
                state.settingsQuery = '';
                if (searchDebounceTimer) {
                    clearTimeout(searchDebounceTimer);
                    searchDebounceTimer = null;
                }
                buildContent();
                refreshSettingsUI();
            }
        });
        searchWrap.append(searchLabel, searchInput);

        brand.append(eyebrow, titleRow, description, searchWrap);
        headerLeft.append(brand);

        const headerRight = document.createElement('div');
        headerRight.className = `${CSS_PREFIX}-header-right`;

        const statusPill = createPill(STRINGS.protectionSummary.protected, 'success');
        statusPill.id = `${CSS_PREFIX}-header-pill`;

        const closeBtn = document.createElement('button');
        closeBtn.className = `${CSS_PREFIX}-close`;
        closeBtn.id = `${CSS_PREFIX}-close-btn`;
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', STRINGS.ui.closeControlCenter);
        closeBtn.textContent = '\u00D7';

        headerRight.append(statusPill, closeBtn);
        header.append(headerLeft, headerRight);

        const contentEl = document.createElement('div');
        contentEl.className = `${CSS_PREFIX}-content`;
        contentEl.id = `${CSS_PREFIX}-content`;

        const footer = document.createElement('div');
        footer.className = `${CSS_PREFIX}-footer`;

        const footerMeta = document.createElement('div');
        footerMeta.className = `${CSS_PREFIX}-footer-meta`;

        const footerStatus = document.createElement('div');
        footerStatus.className = `${CSS_PREFIX}-footer-status`;
        footerStatus.id = `${CSS_PREFIX}-footer-status`;
        footerStatus.setAttribute('aria-live', 'polite');

        const footerHint = document.createElement('div');
        footerHint.className = `${CSS_PREFIX}-footer-hint`;
        footerHint.textContent = STRINGS.ui.footerHint;

        footerMeta.append(footerStatus, footerHint);
        footer.append(footerMeta);

        panel.append(header, contentEl, footer);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        document.body.classList.add(`${CSS_PREFIX}-ready`);

        panel.querySelector(`#${CSS_PREFIX}-close-btn`).addEventListener('click', () => toggleSettings(false));

        buildContent();
        state.overlayEl = overlay;
        state.panelEl = panel;
        refreshSettingsUI();
    }

    function buildContent() {
        const content = document.getElementById(`${CSS_PREFIX}-content`);
        if (!content) return;
        content.textContent = '';
        const query = normalizeSettingsQuery(state.settingsQuery);
        const layout = document.createElement('div');
        layout.className = `${CSS_PREFIX}-layout`;
        const sections = [
            createOverviewSection(query),
            createFilterSection(query),
            ...FEATURE_GROUPS.map(group => createFeatureSection(group, query)),
            createDiagnosticsSection(query)
        ].filter(Boolean);
        if (!sections.length && query) {
            sections.push(createSearchEmptyState(query));
        }
        layout.append(...sections);
        content.appendChild(layout);
    }

    function createOverviewSection(query = '') {
        if (query && !matchesSettingsQuery(
            query,
            'overview protection paused refresh project page diagnostics master switch rule library engine health degraded conflict',
            getProtectionSummary().description
        )) {
            return null;
        }
        const section = document.createElement('section');
        section.className = `${CSS_PREFIX}-section ${CSS_PREFIX}-section-span`;
        section.id = SECTION_IDS.overview;
        const surface = createSurface(`${CSS_PREFIX}-summary`);
        const summary = getProtectionSummary();
        const hero = document.createElement('div');
        hero.className = `${CSS_PREFIX}-summary-hero`;
        const copy = document.createElement('div');
        copy.className = `${CSS_PREFIX}-summary-copy`;
        const title = document.createElement('h2');
        title.className = `${CSS_PREFIX}-summary-title`;
        title.textContent = isEnabled() ? STRINGS.ui.protectionOn : STRINGS.ui.protectionPaused;
        const body = document.createElement('p');
        body.className = `${CSS_PREFIX}-summary-text`;
        body.textContent = summary.description;
        copy.append(title, body);

        const control = document.createElement('div');
        control.className = `${CSS_PREFIX}-summary-control`;
        const controlCopy = document.createElement('div');
        controlCopy.className = `${CSS_PREFIX}-summary-control-copy`;
        const controlLabel = document.createElement('p');
        controlLabel.className = `${CSS_PREFIX}-summary-control-label`;
        controlLabel.textContent = STRINGS.ui.masterSwitch;
        const controlText = document.createElement('p');
        controlText.className = `${CSS_PREFIX}-summary-control-text`;
        controlText.id = `${CSS_PREFIX}-master-toggle-help`;
        controlText.textContent = isEnabled()
            ? STRINGS.ui.masterSwitchPause
            : STRINGS.ui.masterSwitchResume;
        controlCopy.append(controlLabel, controlText);
        const { toggle, input } = createToggleControl(`${CSS_PREFIX}-master-toggle`, isEnabled(), checked => setScriptEnabled(checked), STRINGS.ui.toggleProtection);
        input.setAttribute('aria-describedby', controlText.id);
        control.append(controlCopy, toggle);
        hero.append(copy, control);

        const facts = document.createElement('div');
        facts.className = `${CSS_PREFIX}-summary-facts`;
        facts.append(
            createGlanceItem(STRINGS.ui.currentPage, `${getSiteLabel()} · ${getSurfaceLabel()}`, STRINGS.ui.currentPageDetail),
            createGlanceItem(
                STRINGS.ui.ruleLibrary,
                getFilterSourceLabel(),
                isDefaultFilterUrl() ? STRINGS.ui.recommendedSourceActive : STRINGS.ui.customSourceActive,
                getFilterSourceTone()
            ),
            createGlanceItem(
                STRINGS.ui.lastSync,
                formatTimestamp(state.lastFilterUpdate),
                STRINGS.ui.activeRulesDetail(getRuleCount()),
                'neutral'
            )
        );

        // Live metric tiles. The CSS and the `updateStatsDisplay` updater
        // both expect these IDs; without the tiles they had no visible
        // landing spot and the counters silently ran without ever
        // surfacing in the UI. Keeping the tiles co-located with the
        // overview hero makes the product feel responsive while the
        // engines work.
        const metrics = document.createElement('div');
        metrics.className = `${CSS_PREFIX}-metric-grid`;
        metrics.id = `${CSS_PREFIX}-stats`;
        metrics.append(
            createMetricTile(STRINGS.ui.metrics.blocked, 'blocked'),
            createMetricTile(STRINGS.ui.metrics.pruned, 'pruned'),
            createMetricTile(STRINGS.ui.metrics.ssapSkipped, 'ssapSkipped'),
            createMetricTile(STRINGS.ui.metrics.sponsorSkipped, 'sponsorSkipped'),
            createMetricTile(STRINGS.ui.metrics.dearrowReplaced, 'dearrowReplaced'),
            createMetricTile(STRINGS.ui.metrics.feedFiltered, 'feedFiltered')
        );

        const injectionStatus = getInjectionTimingStatus();
        const injectionNote = injectionStatus.likelyLate
            ? createNote(STRINGS.ui.managerSetupWarning, injectionStatus.description, 'warn')
            : null;

        // Degraded-protection warning. Engines that threw during install or
        // lost a native to another script's lock are otherwise invisible —
        // the user sees "Protection On" while core interception is dead.
        // Naming the engines and natives turns a silent failure into a
        // diagnosable one (this was the failure mode behind issues #1 and #2).
        const unhealthyEngines = Object.entries(state.engineHealth || {})
            .filter(([, status]) => status !== 'ok');
        const preProxied = (state.preProxiedNatives || []);
        let healthNote = null;
        if (unhealthyEngines.length) {
            const engineList = unhealthyEngines
                .map(function(pair) { return pair[0] + ' (' + pair[1] + ')'; })
                .join(', ');
            const lockedList = (state.overrideFailures || []).join(', ');
            healthNote = createNote(STRINGS.ui.protectionDegraded, STRINGS.ui.degradedBody(engineList, lockedList, preProxied), 'warn');
        } else if (preProxied.length) {
            healthNote = createNote(
                STRINGS.ui.coexistenceDetected,
                STRINGS.ui.coexistenceBody(preProxied),
                'info'
            );
        }

        const actions = document.createElement('nav');
        actions.className = `${CSS_PREFIX}-summary-actions`;
        actions.setAttribute('aria-label', STRINGS.ui.quickActions);
        const quickRefresh = document.createElement('button');
        quickRefresh.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-primary`;
        quickRefresh.id = `${CSS_PREFIX}-quick-refresh`;
        quickRefresh.type = 'button';
        setButtonBusy(quickRefresh, state.filterSyncing, STRINGS.ui.refreshing, STRINGS.ui.refreshRules);
        quickRefresh.addEventListener('click', async () => {
            setButtonBusy(quickRefresh, true, STRINGS.ui.refreshing, STRINGS.ui.refreshRules);
            await fetchFilters(true);
            setButtonBusy(quickRefresh, false, STRINGS.ui.refreshing, STRINGS.ui.refreshRules);
        });
        const libraryJump = createJumpButton(STRINGS.ui.ruleLibrary, SECTION_IDS.rules);
        const diagnosticsJump = createJumpButton(STRINGS.ui.diagnostics, SECTION_IDS.diagnostics);
        actions.append(
            quickRefresh,
            libraryJump,
            diagnosticsJump
        );

        const notes = [injectionNote, healthNote].filter(Boolean);
        if (notes.length) surface.append(hero, facts, ...notes, metrics, actions);
        else surface.append(hero, facts, metrics, actions);
        section.appendChild(surface);
        return section;
    }

    function createMetricTile(label, statKey) {
        const tile = document.createElement('div');
        tile.className = `${CSS_PREFIX}-metric`;
        const labelEl = document.createElement('span');
        labelEl.className = `${CSS_PREFIX}-metric-label`;
        labelEl.textContent = label;
        const valueEl = document.createElement('span');
        valueEl.className = `${CSS_PREFIX}-metric-value`;
        valueEl.id = `${CSS_PREFIX}-metric-${statKey}`;
        valueEl.textContent = formatNumber(state.stats?.[statKey] ?? 0);
        tile.append(labelEl, valueEl);
        return tile;
    }

    function createFilterSection(query = '') {
        if (query && !matchesSettingsQuery(
            query,
            'rule library source url filter list refresh recommended custom remote cached fallback',
            resolveFilterUrl(),
            getFilterSourceLabel(),
            state.filterError
        )) {
            return null;
        }
        const section = createSection(
            STRINGS.ui.ruleLibrary,
            STRINGS.ui.ruleLibraryDescription,
            createPill(getFilterSourceLabel(), getFilterSourceTone()),
            SECTION_IDS.rules,
            true
        );
        const surface = createSurface();
        const field = document.createElement('div');
        field.className = `${CSS_PREFIX}-field`;
        const label = document.createElement('label');
        label.className = `${CSS_PREFIX}-field-label`;
        label.setAttribute('for', `${CSS_PREFIX}-url-input`);
        label.textContent = STRINGS.ui.sourceUrl;
        const help = document.createElement('p');
        help.className = `${CSS_PREFIX}-field-help`;
        help.id = `${CSS_PREFIX}-url-help`;
        help.textContent = IS_EXTENSION_BUILD
            ? STRINGS.ui.filterHelpExtension
            : STRINGS.ui.filterHelpUserscript;
        const row = document.createElement('div');
        row.className = `${CSS_PREFIX}-url-group`;
        const input = document.createElement('input');
        input.className = `${CSS_PREFIX}-input`;
        input.id = `${CSS_PREFIX}-url-input`;
        input.type = 'url';
        input.name = 'filter_source_url';
        input.autocomplete = 'off';
        input.inputMode = 'url';
        input.spellcheck = false;
        input.placeholder = STRINGS.ui.filterPlaceholder;
        input.setAttribute('aria-describedby', help.id);
        // Prefer an in-flight edit the user hasn't committed yet, otherwise
        // fall back to the persisted value. Settings rebuilds trigger on
        // every feature toggle; without this preservation the user's typed
        // URL would be wiped before they could click Refresh.
        input.value = (state.pendingFilterUrl != null)
            ? state.pendingFilterUrl
            : resolveFilterUrl();
        input.addEventListener('input', () => {
            input.removeAttribute('aria-invalid');
            state.pendingFilterUrl = input.value;
        });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                refresh.click();
            }
        });
        const refresh = document.createElement('button');
        refresh.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-primary`;
        refresh.id = `${CSS_PREFIX}-refresh-btn`;
        refresh.type = 'button';
        setButtonBusy(refresh, state.filterSyncing, STRINGS.ui.refreshing, STRINGS.ui.refreshRules);
        refresh.addEventListener('click', async () => {
            const value = input.value.trim();
            if (!isValidHttpUrl(value)) {
                input.setAttribute('aria-invalid', 'true');
                input.focus();
                showToast(STRINGS.ui.invalidFilterUrl, 'warn');
                return;
            }
            setSetting('filter_url', value);
            state.pendingFilterUrl = null; // committed
            setButtonBusy(refresh, true, STRINGS.ui.refreshing, STRINGS.ui.refreshRules);
            await fetchFilters(true);
            setButtonBusy(refresh, false, STRINGS.ui.refreshing, STRINGS.ui.refreshRules);
        });
        row.append(input, refresh);
        const actions = document.createElement('div');
        actions.className = `${CSS_PREFIX}-btn-row`;
        const reset = document.createElement('button');
        reset.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary ${CSS_PREFIX}-btn-small`;
        reset.id = `${CSS_PREFIX}-use-default-source`;
        reset.type = 'button';
        reset.textContent = STRINGS.ui.useRecommendedSource;
        reset.addEventListener('click', () => {
            setSetting('filter_url', FILTER_URL_DEFAULT);
            state.pendingFilterUrl = null;
            input.value = FILTER_URL_DEFAULT;
            input.removeAttribute('aria-invalid');
            state.filterError = '';
            refreshSettingsUI(true);
            showToast(STRINGS.ui.recommendedSourceToast, 'success');
        });
        const details = document.createElement('div');
        details.className = `${CSS_PREFIX}-chip-row`;
        const coverage = sanitizeFilterCoverage(state.filters?.coverage);
        const unsupportedCount = coverage.unsupportedScriptlets.reduce((sum, item) => sum + item.count, 0);
        details.append(
            createPill(STRINGS.ui.ruleVersionPill(state.filters?.version), 'neutral'),
            createPill(STRINGS.ui.syncedPill(state.lastFilterUpdate), 'neutral'),
            createPill(STRINGS.ui.integrityPill(getFilterIntegrityLabel()), getFilterIntegrityTone()),
            createPill(STRINGS.ui.rulesPill(getRuleCount()), 'neutral'),
            createPill(STRINGS.ui.selectorsPill(coverage.appliedSelectors), 'neutral'),
            createPill(STRINGS.ui.prunePathsPill(coverage.appliedPrunePaths), 'neutral'),
            createPill(STRINGS.ui.networkOnlyPill(coverage.networkOnlyRules), coverage.networkOnlyRules ? 'info' : 'neutral'),
            createPill(STRINGS.ui.unsupportedScriptletsPill(unsupportedCount), unsupportedCount ? 'warn' : 'neutral')
        );
        actions.appendChild(reset);
        field.append(label, help, row, actions);

        let note;
        if (state.filterError) {
            note = createNote(STRINGS.ui.refreshProblem, state.filterError, 'warn');
        } else if (state.filterIntegrity === 'verified') {
            note = createNote(
                STRINGS.ui.signatureVerified,
                state.filterIntegrityMessage || STRINGS.ui.verifiedFilterNote,
                'success'
            );
        } else if (state.filterIntegrity === 'unsigned-custom') {
            note = createNote(
                STRINGS.ui.unsignedCustomSource,
                state.filterIntegrityMessage || STRINGS.ui.unsignedCustomNote,
                'warn'
            );
        } else if (!isDefaultFilterUrl()) {
            note = createNote(
                STRINGS.ui.customSourceTitle,
                IS_EXTENSION_BUILD
                    ? STRINGS.ui.customSourceExtensionNote
                    : STRINGS.ui.customSourceUserscriptNote,
                'info'
            );
        } else if (state.filterSource === 'remote') {
            note = createNote(
                STRINGS.ui.recommendedSourceTitle,
                STRINGS.ui.recommendedSourceNote,
                'success'
            );
        } else {
            note = createNote(
                STRINGS.ui.fallbackReady,
                STRINGS.ui.fallbackReadyNote,
                'info'
            );
        }

        surface.append(details, field, note);
        section.appendChild(surface);
        return section;
    }

    function createFeatureSection(group, query = '') {
        const visibleFeatures = group.features.filter(feat => matchesSettingsQuery(
            query,
            group.title,
            group.description,
            feat.key,
            feat.label,
            feat.desc
        ));
        if (!visibleFeatures.length) return null;
        const enabledCount = visibleFeatures.filter(feat => state.features[feat.key] !== false).length;
        const section = createSection(
            group.title,
            group.description,
            createPill(STRINGS.ui.onPill(enabledCount, visibleFeatures.length), getFeatureGroupTone(enabledCount, visibleFeatures.length)),
            group.sectionId
        );
        const surface = createSurface();
        const list = document.createElement('div');
        list.className = `${CSS_PREFIX}-toggle-list`;
        for (const feat of visibleFeatures) {
            // DeArrow is read-only in the extension build pending DeArrow API
            // permission for browser extensions (see installDeArrow).
            const effective = (feat.key === 'dearrow' && IS_EXTENSION_BUILD)
                ? {
                    ...feat,
                    locked: true,
                    lockedReason: STRINGS.ui.unavailableDearrowExtension
                }
                : feat;
            list.appendChild(createToggleRow(effective));
        }
        surface.appendChild(list);
        // Community data sources deserve visible credit — SponsorBlock and
        // DeArrow data are CC BY-NC-SA licensed (attribution required), and
        // Return YouTube Dislike's usage terms mandate attribution.
        if (group.sectionId === SECTION_IDS.sponsor) {
            surface.appendChild(createAttributionNote(
                STRINGS.ui.sponsorAttribution,
                [[STRINGS.ui.sponsorAttributionLink, 'https://sponsor.ajay.app']]
            ));
        }
        if (group.sectionId === SECTION_IDS.enhance) {
            surface.appendChild(createAttributionNote(
                STRINGS.ui.enhanceAttribution,
                [
                    [STRINGS.ui.dearrowAttributionLink, 'https://dearrow.ajay.app'],
                    [STRINGS.ui.rydAttributionLink, 'https://returnyoutubedislike.com']
                ]
            ));
        }
        // Blocklist editors live with the blocklist feature group so users
        // can edit channels and keywords inline without a separate surface.
        if (group.sectionId === SECTION_IDS.blocklist) {
            surface.appendChild(createBlocklistEditor(
                STRINGS.ui.blocklist.blockedChannels,
                'channel_blocklist',
                state.features.whitelistMode
                    ? STRINGS.ui.blocklist.blockedChannelsWhitelistHelp
                    : STRINGS.ui.blocklist.blockedChannelsHelp
            ));
            surface.appendChild(createBlocklistEditor(
                STRINGS.ui.blocklist.blockedKeywords,
                'keyword_blocklist',
                STRINGS.ui.blocklist.blockedKeywordsHelp
            ));
            surface.appendChild(createBlocklistEditor(
                STRINGS.ui.blocklist.adAllowedChannels,
                'ad_allowlist',
                STRINGS.ui.blocklist.adAllowedChannelsHelp
            ));
            surface.appendChild(createDurationFilterEditor());
            surface.appendChild(createBlocklistPortabilityTools());
        }
        return createCollapsibleSection(section, surface, group.sectionId);
    }

    const PORTABLE_TEXT_SETTINGS = new Set([
        'channel_blocklist',
        'keyword_blocklist',
        'ad_allowlist',
        'duration_min',
        'duration_max',
        'filter_url'
    ]);

    function normalizeBlocklistText(raw) {
        if (typeof raw !== 'string') raw = String(raw || '');
        var seen = new Set();
        var lines = [];
        for (const line of raw.split(/\r?\n/)) {
            var trimmed = line.trim();
            if (!trimmed) continue;
            var key = trimmed.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            lines.push(trimmed);
        }
        return lines.join('\n');
    }

    const MIGRATION_MAX_ENTRIES = 5000;
    const MIGRATION_MAX_REJECTED = 25;
    const MIGRATION_CHANNEL_HINT_RE = /channel|author|creator|uploader/i;
    const MIGRATION_KEYWORD_HINT_RE = /keyword|title|phrase|word|video/i;

    function mergeBlocklistText(existing, incoming) {
        return normalizeBlocklistText([existing, incoming].filter(Boolean).join('\n'));
    }

    function normalizeMigrationType(hint) {
        hint = String(hint || '').trim();
        if (!hint) return '';
        if (MIGRATION_CHANNEL_HINT_RE.test(hint)) return 'channel';
        if (MIGRATION_KEYWORD_HINT_RE.test(hint)) return 'keyword';
        return '';
    }

    function looksLikeChannelEntry(value) {
        return /^UC[A-Za-z0-9_-]{20,}$/.test(value)
            || /^@[\w.-]{2,}$/.test(value)
            || /^https?:\/\/(?:www\.)?(?:youtube\.com|m\.youtube\.com|music\.youtube\.com|youtubekids\.com)\/(?:@|channel\/|c\/|user\/)/i.test(value);
    }

    function addMigrationEntry(result, rawValue, hint) {
        if (result.seen >= MIGRATION_MAX_ENTRIES) return;
        if (rawValue == null) return;
        var value = String(rawValue).trim();
        if (!value || value.startsWith('#') || value.startsWith('//')) return;
        var explicit = value.match(/^(channel|channelid|channelname|handle|author|creator|uploader|keyword|title|word|phrase|regex)\s*[:=]\s*(.+)$/i);
        var target = normalizeMigrationType(hint);
        if (explicit) {
            value = explicit[2].trim();
            target = normalizeMigrationType(explicit[1]) || target;
        }
        if (!value) return;
        if (!target) target = looksLikeChannelEntry(value) ? 'channel' : 'channel';
        if (target === 'channel') {
            result.channels.push(value);
            result.seen++;
            return;
        }
        if (target === 'keyword') {
            if (value.length > 200) {
                if (result.rejected.length < MIGRATION_MAX_REJECTED) result.rejected.push(value.slice(0, 120));
                return;
            }
            result.keywords.push(value);
            result.seen++;
            return;
        }
        if (result.rejected.length < MIGRATION_MAX_REJECTED) result.rejected.push(value.slice(0, 120));
    }

    function visitMigrationObject(node, result, hint, depth) {
        if (!node || result.seen >= MIGRATION_MAX_ENTRIES || depth > 5) return;
        if (Array.isArray(node)) {
            for (const item of node) visitMigrationObject(item, result, hint, depth + 1);
            return;
        }
        if (typeof node === 'string' || typeof node === 'number') {
            addMigrationEntry(result, node, hint);
            return;
        }
        if (typeof node !== 'object') return;

        var ownHint = normalizeMigrationType(node.type || node.kind || node.category || node.listType || hint);
        var channelCandidate = node.channelId || node.channelID || node.channelName || node.channel || node.author || node.creator || node.uploader || node.handle || node.url || (ownHint === 'channel' ? node.value : null);
        var keywordCandidate = node.keyword || node.title || node.phrase || node.word || node.pattern || node.regex || node.name || (ownHint === 'keyword' ? node.value : null);
        if (channelCandidate && (ownHint === 'channel' || !ownHint)) addMigrationEntry(result, channelCandidate, 'channel');
        else if (keywordCandidate && ownHint === 'keyword') addMigrationEntry(result, keywordCandidate, 'keyword');

        for (const [key, value] of Object.entries(node)) {
            if (['type', 'kind', 'category', 'listType', 'value'].includes(key)) continue;
            var keyHint = normalizeMigrationType(key) || ownHint;
            if (typeof value === 'string' || typeof value === 'number') {
                var valueHint = normalizeMigrationType(value);
                if (valueHint && key && !['type', 'kind', 'category', 'listType'].includes(key)) addMigrationEntry(result, key, valueHint);
                else addMigrationEntry(result, value, keyHint);
            } else {
                visitMigrationObject(value, result, keyHint, depth + 1);
            }
        }
    }

    function parseMigrationPayload(raw) {
        var result = { channels: [], keywords: [], rejected: [], seen: 0 };
        var text = String(raw || '').trim();
        if (!text) return result;
        try {
            var parsed = JSON.parse(text);
            visitMigrationObject(parsed, result, '', 0);
        } catch (e) {
            for (const line of text.split(/\r?\n/)) {
                addMigrationEntry(result, line, '');
            }
        }
        result.channels = normalizeBlocklistText(result.channels.join('\n'));
        result.keywords = normalizeBlocklistText(result.keywords.join('\n'));
        return result;
    }

    function readPortableSettings() {
        return {
            enabled: isEnabled(),
            filter_url: resolveFilterUrl(),
            channel_blocklist: String(getSetting('channel_blocklist', '')),
            keyword_blocklist: String(getSetting('keyword_blocklist', '')),
            ad_allowlist: String(getSetting('ad_allowlist', '')),
            duration_min: String(getSetting('duration_min', '')),
            duration_max: String(getSetting('duration_max', '')),
            feature_overrides: getFeatureOverrides()
        };
    }

    function buildSettingsExportPayload() {
        return {
            app: SCRIPT_NAME,
            version: 1,
            appVersion: SCRIPT_VERSION,
            exportedAt: new Date().toISOString(),
            settings: readPortableSettings()
        };
    }

    function buildSettingsExportJson() {
        return JSON.stringify(buildSettingsExportPayload(), null, 2);
    }

    function sanitizeImportedFeatureOverrides(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        var clean = {};
        for (const [key, enabled] of Object.entries(value)) {
            if (key in DEFAULT_FILTERS.features) clean[key] = !!enabled;
        }
        return clean;
    }

    function applyImportedSettings(settings) {
        if (!settings || typeof settings !== 'object') return 0;
        var changed = 0;
        for (const key of PORTABLE_TEXT_SETTINGS) {
            if (!(key in settings)) continue;
            var value = String(settings[key] == null ? '' : settings[key]);
            if (key === 'filter_url' && value && !isValidHttpUrl(value)) continue;
            if (key === 'channel_blocklist' || key === 'keyword_blocklist' || key === 'ad_allowlist') {
                value = normalizeBlocklistText(value);
            }
            setSetting(key, value);
            changed++;
        }
        if (typeof settings.enabled === 'boolean') {
            setSetting('enabled', settings.enabled);
            state.enabled = settings.enabled;
            changed++;
        }
        var overrides = sanitizeImportedFeatureOverrides(settings.feature_overrides);
        if (overrides) {
            setSetting('feature_overrides', overrides);
            state.features = normalizeFeatures({ ...(state.filters?.features || {}), ...overrides });
            changed++;
        }
        return changed;
    }

    function importSettingsPayload(raw, mode) {
        if (mode === 'text') {
            var text = normalizeBlocklistText(raw);
            setSetting('channel_blocklist', text);
            if (text) {
                var overrides = getFeatureOverrides();
                overrides.channelBlocker = true;
                setSetting('feature_overrides', overrides);
                state.features.channelBlocker = true;
            }
            return { ok: true, count: 1, mode: 'text' };
        }
        if (mode === 'migration') {
            var migrated = parseMigrationPayload(raw);
            var changed = 0;
            if (migrated.channels) {
                setSetting('channel_blocklist', mergeBlocklistText(getSetting('channel_blocklist', ''), migrated.channels));
                changed++;
            }
            if (migrated.keywords) {
                setSetting('keyword_blocklist', mergeBlocklistText(getSetting('keyword_blocklist', ''), migrated.keywords));
                changed++;
            }
            if (changed) {
                var migrationOverrides = getFeatureOverrides();
                if (migrated.channels) {
                    migrationOverrides.channelBlocker = true;
                    state.features.channelBlocker = true;
                }
                if (migrated.keywords) {
                    migrationOverrides.keywordBlocker = true;
                    state.features.keywordBlocker = true;
                }
                setSetting('feature_overrides', migrationOverrides);
                return {
                    ok: true,
                    count: changed,
                    channels: migrated.channels ? migrated.channels.split('\n').length : 0,
                    keywords: migrated.keywords ? migrated.keywords.split('\n').length : 0,
                    rejected: migrated.rejected,
                    mode: 'migration'
                };
            }
            return { ok: false, error: STRINGS.ui.blocklist.migrationNoSupportedEntries, rejected: migrated.rejected };
        }
        var parsed;
        try {
            parsed = JSON.parse(String(raw || ''));
        } catch (e) {
            return { ok: false, error: STRINGS.ui.blocklist.importJsonParseError };
        }
        var settings = parsed && typeof parsed === 'object'
            ? (parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : parsed)
            : null;
        var count = applyImportedSettings(settings);
        if (!count) return { ok: false, error: STRINGS.ui.blocklist.importJsonNoSupportedSettings };
        return { ok: true, count, mode: 'json' };
    }

    function createBlocklistEditor(title, storageKey, help) {
        const wrap = document.createElement('div');
        wrap.className = `${CSS_PREFIX}-field`;
        wrap.style.marginTop = '12px';
        const label = document.createElement('label');
        label.className = `${CSS_PREFIX}-field-label`;
        label.textContent = title;
        const helpEl = document.createElement('p');
        helpEl.className = `${CSS_PREFIX}-field-help`;
        helpEl.textContent = help;
        const ta = document.createElement('textarea');
        ta.className = `${CSS_PREFIX}-blocklist-textarea`;
        ta.rows = 4;
        ta.spellcheck = false;
        ta.value = String(getSetting(storageKey, ''));
        let saveTimer = null;
        ta.addEventListener('input', () => {
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                saveTimer = null;
                setSetting(storageKey, ta.value);
            }, 400);
        });
        wrap.append(label, helpEl, ta);
        return wrap;
    }

    function createBlocklistPortabilityTools() {
        const wrap = createActionGroup(
            STRINGS.ui.blocklist.importExport,
            STRINGS.ui.blocklist.importExportHelp
        );
        const payload = document.createElement('textarea');
        payload.className = `${CSS_PREFIX}-blocklist-textarea`;
        payload.rows = 5;
        payload.spellcheck = false;
        payload.placeholder = STRINGS.ui.blocklist.importPlaceholder;

        const actions = document.createElement('div');
        actions.className = `${CSS_PREFIX}-btn-row`;

        const copyJson = document.createElement('button');
        copyJson.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary`;
        copyJson.type = 'button';
        copyJson.textContent = STRINGS.ui.blocklist.copyJson;
        copyJson.addEventListener('click', async () => {
            const text = buildSettingsExportJson();
            payload.value = text;
            const copied = await copyTextToClipboard(text);
            showToast(copied ? STRINGS.ui.blocklist.settingsJsonCopied : STRINGS.ui.blocklist.settingsJsonClipboardFallback, copied ? 'success' : 'warn');
        });

        const copyText = document.createElement('button');
        copyText.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary`;
        copyText.type = 'button';
        copyText.textContent = STRINGS.ui.blocklist.copyChannelText;
        copyText.addEventListener('click', async () => {
            const text = String(getSetting('channel_blocklist', ''));
            payload.value = text;
            const copied = await copyTextToClipboard(text);
            showToast(copied ? STRINGS.ui.blocklist.channelBlocklistCopied : STRINGS.ui.blocklist.channelClipboardFallback, copied ? 'success' : 'warn');
        });

        const importJson = document.createElement('button');
        importJson.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-primary`;
        importJson.type = 'button';
        importJson.textContent = STRINGS.ui.blocklist.importJson;
        importJson.addEventListener('click', () => {
            const result = importSettingsPayload(payload.value, 'json');
            if (!result.ok) {
                showToast(result.error, 'error');
                return;
            }
            loadState();
            updateCosmeticCSS();
            updateClutterCSS();
            refreshSettingsUI(true);
            showToast(STRINGS.ui.blocklist.importedSettings(result.count), 'success');
        });

        const importText = document.createElement('button');
        importText.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary`;
        importText.type = 'button';
        importText.textContent = STRINGS.ui.blocklist.importChannelText;
        importText.addEventListener('click', () => {
            const result = importSettingsPayload(payload.value, 'text');
            loadState();
            refreshSettingsUI(true);
            showToast(result.ok ? STRINGS.ui.blocklist.channelBlocklistImported : result.error, result.ok ? 'success' : 'error');
        });

        const importMigration = document.createElement('button');
        importMigration.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary`;
        importMigration.type = 'button';
        importMigration.textContent = STRINGS.ui.blocklist.importMigration;
        importMigration.addEventListener('click', () => {
            const result = importSettingsPayload(payload.value, 'migration');
            if (!result.ok) {
                if (result.rejected && result.rejected.length) payload.value = STRINGS.ui.blocklist.rejectedEntries(result.rejected);
                showToast(result.error, 'error');
                return;
            }
            loadState();
            refreshSettingsUI(true);
            if (result.rejected && result.rejected.length) payload.value = STRINGS.ui.blocklist.rejectedEntries(result.rejected);
            showToast(STRINGS.ui.blocklist.migrationImported(result.channels, result.keywords, result.rejected && result.rejected.length), 'success');
        });

        actions.append(copyJson, copyText, importJson, importText, importMigration);
        wrap.append(payload, actions);
        return wrap;
    }


    function createDurationFilterEditor() {
        const wrap = document.createElement('div');
        wrap.className = `${CSS_PREFIX}-field`;
        wrap.style.marginTop = '12px';
        const label = document.createElement('label');
        label.className = `${CSS_PREFIX}-field-label`;
        label.textContent = STRINGS.ui.blocklist.durationTitle;
        const helpEl = document.createElement('p');
        helpEl.className = `${CSS_PREFIX}-field-help`;
        helpEl.textContent = STRINGS.ui.blocklist.durationHelp;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:12px;margin-top:6px;';
        function makeInput(key, placeholder) {
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.min = '0';
            inp.placeholder = placeholder;
            inp.className = `${CSS_PREFIX}-input`;
            inp.style.cssText = 'width:100px;';
            inp.value = getSetting(key, '');
            let timer = null;
            inp.addEventListener('input', () => {
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                    timer = null;
                    setSetting(key, inp.value);
                }, 400);
            });
            return inp;
        }
        row.append(makeInput('duration_min', STRINGS.ui.blocklist.minPlaceholder), makeInput('duration_max', STRINGS.ui.blocklist.maxPlaceholder));
        wrap.append(label, helpEl, row);
        return wrap;
    }

    function createDiagnosticsSection(query = '') {
        if (query && !matchesSettingsQuery(
            query,
            'diagnostics recovery reset defaults reset counters copy diagnostics issues local only document-start injection userscript manager setup',
            state.filterError
        )) {
            return null;
        }
        const section = createSection(
            STRINGS.ui.diagnosticsSection.title,
            STRINGS.ui.diagnosticsSection.description,
            null,
            SECTION_IDS.diagnostics,
            true
        );
        const surface = createSurface();
        const groups = document.createElement('div');
        groups.className = `${CSS_PREFIX}-action-groups`;

        const injectionStatus = getInjectionTimingStatus();
        const setupGroup = createActionGroup(
            STRINGS.ui.diagnosticsSection.installTiming,
            STRINGS.ui.diagnosticsSection.installTimingHelp
        );
        setupGroup.appendChild(createNote(injectionStatus.title, injectionStatus.description, injectionStatus.tone));

        const diagnosticsGroup = createActionGroup(
            STRINGS.ui.diagnosticsSection.shareSnapshot,
            STRINGS.ui.diagnosticsSection.shareSnapshotHelp
        );
        const diagnosticsActions = document.createElement('div');
        diagnosticsActions.className = `${CSS_PREFIX}-btn-row`;
        const copyBtn = document.createElement('button');
        copyBtn.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary`;
        copyBtn.id = `${CSS_PREFIX}-copy-btn`;
        copyBtn.type = 'button';
        copyBtn.textContent = STRINGS.ui.diagnosticsSection.copyDiagnostics;
        copyBtn.addEventListener('click', copyDiagnosticsToClipboard);
        const issuesLink = createExternalLinkButton(ISSUES_URL, STRINGS.ui.diagnosticsSection.openIssues, `${CSS_PREFIX}-btn-ghost`);
        diagnosticsActions.append(copyBtn, issuesLink);
        diagnosticsGroup.appendChild(diagnosticsActions);

        const recoveryGroup = createActionGroup(
            STRINGS.ui.diagnosticsSection.resetLocalState,
            STRINGS.ui.diagnosticsSection.resetLocalStateHelp
        );
        recoveryGroup.appendChild(createNote(
            STRINGS.ui.diagnosticsSection.localOnly,
            STRINGS.ui.diagnosticsSection.localOnlyHelp,
            'info'
        ));
        const recoveryActions = document.createElement('div');
        recoveryActions.className = `${CSS_PREFIX}-btn-row`;
        const resetStats = document.createElement('button');
        resetStats.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary`;
        resetStats.id = `${CSS_PREFIX}-reset-counters`;
        resetStats.type = 'button';
        resetStats.textContent = STRINGS.ui.diagnosticsSection.resetCounters;
        attachArmedAction(resetStats, {
            idleLabel: STRINGS.ui.diagnosticsSection.resetCounters,
            armedLabel: STRINGS.ui.diagnosticsSection.confirmReset,
            onConfirm() {
                state.stats = { ...DEFAULT_STATS };
                saveStats();
                refreshSettingsUI();
                showToast(STRINGS.ui.diagnosticsSection.countersReset, 'info');
            }
        });
        const restore = document.createElement('button');
        restore.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-danger`;
        restore.id = `${CSS_PREFIX}-restore-defaults`;
        restore.type = 'button';
        restore.textContent = STRINGS.ui.diagnosticsSection.restoreDefaults;
        attachArmedAction(restore, {
            idleLabel: STRINGS.ui.diagnosticsSection.restoreDefaults,
            armedLabel: STRINGS.ui.diagnosticsSection.confirmRestore,
            onConfirm() {
                setSetting('feature_overrides', {});
                setSetting('filter_url', FILTER_URL_DEFAULT);
                setSetting('enabled', true);
                state.enabled = true;
                state.pendingFilterUrl = null;
                state.features = normalizeFeatures(state.filters?.features);
                state.filterError = '';
                updateCosmeticCSS();
                refreshSettingsUI(true);
                showToast(STRINGS.ui.diagnosticsSection.defaultsRestored, 'success');
            }
        });
        recoveryActions.append(resetStats, restore);
        recoveryGroup.appendChild(recoveryActions);

        groups.append(setupGroup, diagnosticsGroup, recoveryGroup);
        surface.appendChild(groups);
        return createCollapsibleSection(section, surface, SECTION_IDS.diagnostics);
    }

    function createSearchEmptyState(query) {
        const section = document.createElement('section');
        section.className = `${CSS_PREFIX}-section ${CSS_PREFIX}-section-span`;
        const surface = createSurface();
        surface.appendChild(createNote(
            STRINGS.ui.searchEmptyTitle,
            STRINGS.ui.searchEmptyBody(query),
            'info'
        ));
        section.appendChild(surface);
        return section;
    }

    function createSection(title, description, metaEl, sectionId, fullSpan = false) {
        const section = document.createElement('section');
        section.className = `${CSS_PREFIX}-section${fullSpan ? ` ${CSS_PREFIX}-section-span` : ''}`;
        if (sectionId) section.id = sectionId;
        const head = document.createElement('div');
        head.className = `${CSS_PREFIX}-section-head`;
        const copy = document.createElement('div');
        const titleEl = document.createElement('h2');
        titleEl.className = `${CSS_PREFIX}-section-title`;
        titleEl.textContent = title;
        copy.appendChild(titleEl);
        if (description) {
            const descEl = document.createElement('p');
            descEl.className = `${CSS_PREFIX}-section-desc`;
            descEl.textContent = description;
            copy.appendChild(descEl);
        }
        head.append(copy);
        if (metaEl) head.appendChild(metaEl);
        section.appendChild(head);
        return section;
    }

    function createCollapsibleSection(section, surface, sectionId, defaultOpen = false) {
        if (!section || !surface) return section;
        const head = section.firstElementChild;
        if (!head) {
            section.appendChild(surface);
            return section;
        }
        const details = document.createElement('details');
        details.className = `${CSS_PREFIX}-section-disclosure`;
        details.open = isSectionExpanded(sectionId, defaultOpen);
        details.addEventListener('toggle', () => {
            if (normalizeSettingsQuery(state.settingsQuery)) {
                if (!details.open) {
                    requestAnimationFrame(() => { details.open = true; });
                }
                return;
            }
            setSectionExpanded(sectionId, details.open);
        });

        const summary = document.createElement('summary');
        summary.className = `${CSS_PREFIX}-section-head ${CSS_PREFIX}-section-toggle`;
        while (head.firstChild) summary.appendChild(head.firstChild);
        const metaWrap = document.createElement('div');
        metaWrap.className = `${CSS_PREFIX}-section-toggle-meta`;
        const existingMeta = summary.lastElementChild;
        if (existingMeta && existingMeta !== summary.firstElementChild && !existingMeta.classList.contains(`${CSS_PREFIX}-section-toggle-meta`)) {
            metaWrap.appendChild(existingMeta);
        }
        const chevron = document.createElement('span');
        chevron.className = `${CSS_PREFIX}-section-chevron`;
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '›';
        metaWrap.appendChild(chevron);
        summary.appendChild(metaWrap);

        details.append(summary, surface);
        section.textContent = '';
        section.appendChild(details);
        return section;
    }

    function createSurface(extraClass = '') {
        const surface = document.createElement('div');
        surface.className = `${CSS_PREFIX}-surface${extraClass ? ` ${extraClass}` : ''}`;
        return surface;
    }

    function createGlanceItem(label, value, detail, tone = 'neutral') {
        const item = document.createElement('div');
        item.className = `${CSS_PREFIX}-glance`;
        item.dataset.tone = tone;
        const labelEl = document.createElement('span');
        labelEl.className = `${CSS_PREFIX}-glance-label`;
        labelEl.textContent = label;
        const valueEl = document.createElement('span');
        valueEl.className = `${CSS_PREFIX}-glance-value`;
        valueEl.textContent = value;
        const detailEl = document.createElement('p');
        detailEl.className = `${CSS_PREFIX}-glance-detail`;
        detailEl.textContent = detail;
        item.append(labelEl, valueEl, detailEl);
        return item;
    }

    function createActionGroup(title, description) {
        const card = document.createElement('div');
        card.className = `${CSS_PREFIX}-action-group`;
        const titleEl = document.createElement('h3');
        titleEl.className = `${CSS_PREFIX}-action-group-title`;
        titleEl.textContent = title;
        card.appendChild(titleEl);
        if (description) {
            const descEl = document.createElement('p');
            descEl.className = `${CSS_PREFIX}-detail-text`;
            descEl.textContent = description;
            card.appendChild(descEl);
        }
        return card;
    }

    function createJumpButton(label, targetId) {
        const button = document.createElement('button');
        button.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-ghost ${CSS_PREFIX}-btn-small`;
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', () => scrollSectionIntoView(targetId));
        return button;
    }

    function createExternalLinkButton(href, label, variantClass = `${CSS_PREFIX}-btn-ghost`) {
        const link = document.createElement('a');
        link.className = `${CSS_PREFIX}-btn ${variantClass}`;
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = label;
        return link;
    }

    function createNote(title, body, tone = 'neutral') {
        const note = document.createElement('div');
        note.className = `${CSS_PREFIX}-note`;
        note.dataset.tone = tone;
        if (title) {
            const titleEl = document.createElement('div');
            titleEl.className = `${CSS_PREFIX}-note-title`;
            titleEl.textContent = title;
            note.appendChild(titleEl);
        }
        const bodyEl = document.createElement('p');
        bodyEl.className = `${CSS_PREFIX}-note-text`;
        bodyEl.textContent = body;
        note.appendChild(bodyEl);
        return note;
    }

    function createAttributionNote(text, links) {
        const note = document.createElement('div');
        note.className = `${CSS_PREFIX}-note ${CSS_PREFIX}-attribution`;
        note.dataset.tone = 'neutral';
        const bodyEl = document.createElement('p');
        bodyEl.className = `${CSS_PREFIX}-note-text`;
        bodyEl.textContent = text + ' ';
        for (var i = 0; i < links.length; i++) {
            if (i > 0) bodyEl.appendChild(document.createTextNode(' · '));
            var a = document.createElement('a');
            a.href = links[i][1];
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = links[i][0];
            bodyEl.appendChild(a);
        }
        note.appendChild(bodyEl);
        return note;
    }

    function createPill(text, tone = 'neutral') {
        const pill = document.createElement('span');
        pill.className = `${CSS_PREFIX}-pill`;
        pill.dataset.tone = tone;
        pill.textContent = text;
        return pill;
    }

    function createToggleControl(id, checked, onChange, ariaLabel) {
        const toggle = document.createElement('span');
        toggle.className = `${CSS_PREFIX}-toggle`;
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = id;
        input.checked = checked;
        // `role="switch"` conveys "on/off" semantics to assistive tech more
        // accurately than plain checkbox, which reads as "tick/untick". The
        // underlying input stays a checkbox for forms/keyboard behavior.
        input.setAttribute('role', 'switch');
        input.setAttribute('aria-checked', String(!!checked));
        input.setAttribute('aria-label', ariaLabel);
        input.addEventListener('change', () => {
            input.setAttribute('aria-checked', String(!!input.checked));
            onChange(input.checked);
        });
        const track = document.createElement('span');
        track.className = `${CSS_PREFIX}-toggle-track`;
        toggle.append(input, track);
        return { toggle, input };
    }

    function createToggleRow(feature) {
        const row = document.createElement('label');
        row.className = `${CSS_PREFIX}-row`;
        const isOn = !feature.locked && state.features[feature.key] !== false;
        row.dataset.enabled = String(isOn);
        const copy = document.createElement('div');
        const line = document.createElement('div');
        line.className = `${CSS_PREFIX}-row-label-line`;
        const label = document.createElement('span');
        label.className = `${CSS_PREFIX}-row-label`;
        label.textContent = feature.label;
        line.appendChild(label);
        const desc = document.createElement('p');
        desc.className = `${CSS_PREFIX}-row-desc`;
        const descId = `${CSS_PREFIX}-desc-${feature.key}`;
        desc.id = descId;
        desc.textContent = feature.locked && feature.lockedReason
            ? `${feature.desc} ${feature.lockedReason}`
            : feature.desc;
        copy.append(line, desc);
        const { toggle, input } = createToggleControl(`${CSS_PREFIX}-toggle-${feature.key}`, isOn, checked => {
            if (feature.locked) return;
            setFeatureEnabled(feature.key, checked, feature.label);
        }, `Toggle ${feature.label}`);
        // Tie the switch to the visible description so screen-reader users
        // hear what the toggle does, not just its short label.
        input.setAttribute('aria-describedby', descId);
        if (feature.locked) {
            input.disabled = true;
            input.setAttribute('aria-disabled', 'true');
            row.style.opacity = '0.6';
        }
        row.append(copy, toggle);
        return row;
    }

    function updateStatsDisplay() {
        // Live-update each metric tile in-place. Avoids a full tile
        // rebuild so the number can flip without flashing the
        // surrounding label or triggering layout. No-op when the
        // overview isn't rendered (panel closed or mid-rebuild).
        if (!state.stats) return;
        for (const key of Object.keys(DEFAULT_STATS)) {
            const el = document.getElementById(`${CSS_PREFIX}-metric-${key}`);
            if (el) el.textContent = formatNumber(state.stats[key] || 0);
        }
    }

    function updatePanelStatus() {
        const summary = getProtectionSummary();
        const pill = document.getElementById(`${CSS_PREFIX}-header-pill`);
        if (pill) {
            pill.textContent = summary.label;
            pill.dataset.tone = summary.tone;
        }
        const footerStatus = document.getElementById(`${CSS_PREFIX}-footer-status`);
        if (footerStatus) footerStatus.textContent = summary.description;
    }

    function refreshSettingsUI(rebuild = false) {
        if (rebuild && state.settingsOpen) {
            // Preserve focus and scroll across rebuilds so toggling a row does
            // not yank the user to the top of the panel or drop keyboard focus.
            const active = document.activeElement;
            const activeId = active && active.id ? active.id : null;
            const content = document.getElementById(`${CSS_PREFIX}-content`);
            const scrollTop = content ? content.scrollTop : 0;
            buildContent();
            if (activeId) {
                const restored = document.getElementById(activeId);
                if (restored && typeof restored.focus === 'function') {
                    try { restored.focus({ preventScroll: true }); } catch (e) { restored.focus(); }
                }
            }
            const contentAfter = document.getElementById(`${CSS_PREFIX}-content`);
            if (contentAfter) contentAfter.scrollTop = scrollTop;
        }
        updatePanelStatus();
        updateStatsDisplay();
    }

    function getFocusableElements(root) {
        return [...root.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')]
            .filter(el => !(el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true'));
    }

    function handleDialogKeydown(event) {
        if (!state.settingsOpen || !state.panelEl) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            toggleSettings(false);
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = getFocusableElements(state.panelEl);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        // Focus somehow escaped the panel — pull it back before the Tab
        // would move outside.
        if (!state.panelEl.contains(active)) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
            return;
        }
        if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function attachArmedAction(button, { idleLabel, armedLabel, onConfirm, timeout = 3200 }) {
        let armed = false;
        let timer = null;

        const reset = () => {
            armed = false;
            button.dataset.armed = 'false';
            button.textContent = idleLabel;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };

        button.textContent = idleLabel;
        button.dataset.armed = 'false';
        button.addEventListener('click', () => {
            if (!armed) {
                armed = true;
                button.dataset.armed = 'true';
                button.textContent = armedLabel;
                showToast(STRINGS.ui.armedAction(idleLabel), 'warn');
                timer = setTimeout(reset, timeout);
                return;
            }

            reset();
            onConfirm();
        });
    }

    // Features whose on/off state directly changes the cosmetic stylesheet.
    // Toggling anything else (e.g. timer neutralization) doesn't require
    // rewriting the style sheet — skipping that work avoids re-hitting
    // document.head and prevents unrelated selectors from flashing.
    const COSMETIC_AFFECTING_FEATURES = new Set(['cosmeticHiding', 'upsellBlock']);
    const CLUTTER_AFFECTING_FEATURES = new Set(Object.keys(CLUTTER_SELECTORS));

    function setFeatureEnabled(key, checked, label) {
        const overrides = getFeatureOverrides();
        overrides[key] = checked;
        setSetting('feature_overrides', overrides);
        state.features[key] = checked;
        if (COSMETIC_AFFECTING_FEATURES.has(key)) {
            updateCosmeticCSS();
        }
        if (CLUTTER_AFFECTING_FEATURES.has(key)) {
            updateClutterCSS();
        }
        if (key === 'volumeBoost') {
            try {
                if (checked) { attachVolumeBoost(); ensureVolumeBoostSlider(); }
                else {
                    const existing = document.getElementById(`${CSS_PREFIX}-vol-boost`);
                    if (existing) existing.remove();
                    if (volumeBoostState.gainNode) {
                        try { volumeBoostState.gainNode.gain.value = 1; } catch (e) { /* ignore */ }
                    }
                }
            } catch (e) { /* ignore */ }
        }
        if (key === 'dearrow' && checked) {
            try { sweepDearrow(document); } catch (e) { /* ignore */ }
        }
        if (key === 'returnYoutubeDislike' && checked) {
            try { sweepRyd(); } catch (e) { /* ignore */ }
        }
        if (key === 'forceOriginalAudio' && checked) {
            try { enforceOriginalAudioTrack(); } catch (e) { /* ignore */ }
        }
        if (key === 'shortsRedirect' && checked) {
            try { redirectShortsIfNeeded(); } catch (e) { /* ignore */ }
        }
        refreshSettingsUI(true);
        showToast(STRINGS.ui.featureToggle(label, checked), checked ? 'success' : 'warn');
    }

    function setScriptEnabled(enabled) {
        state.enabled = enabled;
        setSetting('enabled', enabled);
        updateCosmeticCSS();
        updateClutterCSS();
        refreshSettingsUI(true);
        // Refresh menu command labels so Pause/Resume reflects the new state.
        try { registerMenuCommands(); } catch (e) { /* ignore */ }
        showToast(enabled ? STRINGS.ui.protectionResumed : STRINGS.ui.protectionPausedToast, enabled ? 'success' : 'warn');
    }

    function setButtonBusy(button, busy, busyLabel, idleLabel) {
        button.disabled = busy;
        button.setAttribute('aria-busy', String(!!busy));
        button.textContent = '';
        if (busy) {
            const spinner = document.createElement('span');
            spinner.className = `${CSS_PREFIX}-spinner`;
            const text = document.createElement('span');
            text.textContent = busyLabel;
            button.append(spinner, text);
            return;
        }
        button.textContent = idleLabel;
    }

    function isValidHttpUrl(value) {
        try {
            const url = new URL(value);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (e) {
            return false;
        }
    }

    async function copyTextToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.setAttribute('readonly', 'true');
                textarea.style.position = 'fixed';
                textarea.style.top = '-9999px';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                const copied = document.execCommand('copy');
                textarea.remove();
                return copied;
            } catch (err) {
                return false;
            }
        }
    }

    async function copyDiagnosticsToClipboard() {
        const success = await copyTextToClipboard(buildDiagnosticsReport());
        showToast(
            success
                ? STRINGS.ui.diagnosticsCopied
                : STRINGS.ui.diagnosticsClipboardFailed,
            success ? 'success' : 'error'
        );
        return success;
    }

    function scrollSectionIntoView(sectionId) {
        const section = document.getElementById(sectionId);
        if (!section) return;
        const disclosure = section.querySelector(`.${CSS_PREFIX}-section-disclosure`);
        if (disclosure && !disclosure.open) {
            disclosure.open = true;
            setSectionExpanded(sectionId, true);
        }
        try {
            section.scrollIntoView({
                behavior: prefersReducedMotion() ? 'auto' : 'smooth',
                block: 'start'
            });
        } catch (e) {
            section.scrollIntoView();
        }
    }

    function formatScriptletCoverage(list) {
        if (!Array.isArray(list) || !list.length) return STRINGS.common.none;
        return list.map(item => `${item.name}=${item.count}`).join(', ');
    }

    function buildDiagnosticsReport() {
        const features = normalizeFeatures(state.features);
        const report = STRINGS.diagnosticsReport;
        const disabledFeatures = Object.entries(features)
            .filter(([, enabled]) => !enabled)
            .map(([key]) => key)
            .join(', ') || STRINGS.common.none;
        const enabledFeatures = Object.entries(features)
            .filter(([, enabled]) => enabled)
            .map(([key]) => key)
            .join(', ') || STRINGS.common.none;
        const trappedRoots = state.trappedRoots && state.trappedRoots.size
            ? [...state.trappedRoots].join(', ')
            : STRINGS.common.none;
        const coverage = sanitizeFilterCoverage(state.filters?.coverage);
        const uaHint = typeof navigator !== 'undefined' ? (navigator.userAgent || STRINGS.common.unknown) : STRINGS.common.unknown;
        const injectionStatus = getInjectionTimingStatus();
        return [
            `${SCRIPT_NAME} v${SCRIPT_VERSION}`,
            `${report.captured}: ${new Date().toISOString()}`,
            `${report.site}: ${location.hostname}${location.pathname}`,
            `${report.surface}: ${getSiteLabel()} / ${getSurfaceLabel()}`,
            `${report.build}: ${IS_EXTENSION_BUILD ? report.extension : report.userscript}`,
            `${report.ua}: ${uaHint}`,
            `${report.injectionStatus}: ${injectionStatus.title}`,
            `${report.injectionReadyState}: ${injectionStatus.readyState}`,
            `${report.injectionElapsed}: ${injectionStatus.elapsedMs === null ? STRINGS.common.unknown : injectionStatus.elapsedMs + 'ms'}`,
            `${report.injectionGuidance}: ${injectionStatus.description}`,
            `${report.protectionEnabled}: ${isEnabled()}`,
            `${report.filterSource}: ${getFilterSourceLabel()}`,
            `${report.filterIntegrity}: ${getFilterIntegrityLabel()}`,
            `${report.filterIntegrityDetail}: ${state.filterIntegrityMessage || STRINGS.common.none}`,
            `${report.filterUrl}: ${resolveFilterUrl()}`,
            `${report.filterVersion}: ${state.filters?.version || STRINGS.common.unknown}`,
            `${report.lastSync}: ${state.lastFilterUpdate ? new Date(state.lastFilterUpdate).toISOString() : STRINGS.common.never}`,
            `${report.lastError}: ${state.filterError || STRINGS.common.none}`,
            `${report.rulesActive}: ${getRuleCount()}`,
            `${report.pruneKeys}: ${(state.filters?.pruneKeys || []).length}`,
            `${report.cosmeticSelectors}: ${(state.filters?.cosmeticSelectors || []).length}`,
            `${report.interceptPatterns}: ${(state.filters?.interceptPatterns || []).join(' · ') || STRINGS.common.none}`,
            `${report.appliedSelectors}: ${coverage.appliedSelectors}`,
            `${report.appliedPrunePaths}: ${coverage.appliedPrunePaths}`,
            `${report.networkOnlyRules}: ${coverage.networkOnlyRules}`,
            `${report.droppedUnsafeSelectors}: ${coverage.droppedUnsafeSelectors}`,
            `${report.supportedScriptlets}: ${formatScriptletCoverage(coverage.supportedScriptlets)}`,
            `${report.unsupportedScriptlets}: ${formatScriptletCoverage(coverage.unsupportedScriptlets)}`,
            `${report.webpackSignatureSource}: ${state.webpackSignatureSource || STRINGS.common.unknown}`,
            `${report.webpackSignatureVersion}: ${state.webpackSignatureVersion || STRINGS.common.unknown}`,
            `${report.webpackSignatureTokens}: ${(state.webpackSignatureDatabase?.tokens || []).length}`,
            `${report.webpackSignatureError}: ${state.webpackSignatureError || STRINGS.common.none}`,
            `${report.channelBlockEntries}: ${parseBlocklist(getSetting('channel_blocklist', ''), { channel: true }).length}`,
            `${report.keywordBlockEntries}: ${parseBlocklist(getSetting('keyword_blocklist', '')).length}`,
            `${report.adAllowEntries}: ${parseBlocklist(getSetting('ad_allowlist', ''), { channel: true }).length}`,
            `${report.trappedRoots}: ${trappedRoots}`,
            `${report.engineHealth}: ${Object.entries(state.engineHealth || {}).map(([name, status]) => `${name}=${status}`).join(', ') || STRINGS.common.notInstalled}`,
            `${report.lockedNatives}: ${(state.overrideFailures || []).join(', ') || STRINGS.common.none}`,
            `${report.preProxied}: ${(state.preProxiedNatives || []).join(', ') || STRINGS.common.none}`,
            `${report.stats}: blocked=${state.stats.blocked}, pruned=${state.stats.pruned}, ssapSkipped=${state.stats.ssapSkipped}, sponsorSkipped=${state.stats.sponsorSkipped}`,
            `${report.enabledFeatures}: ${enabledFeatures}`,
            `${report.disabledFeatures}: ${disabledFeatures}`
        ].join('\n');
    }

    function handleExtensionSettingsSync(event) {
        if (!IS_EXTENSION_BUILD || typeof __YTAB_STORAGE_KEY === 'undefined') return;
        const detail = event && event.detail;
        if (!detail || typeof detail !== 'object' || !(__YTAB_STORAGE_KEY in detail)) return;

        const previousFilterUrl = resolveFilterUrl();
        const previousSettingsSignature = JSON.stringify({
            enabled: isEnabled(),
            filterUrl: previousFilterUrl,
            filterSource: state.filterSource,
            lastFilterUpdate: state.lastFilterUpdate,
            ruleCount: getRuleCount(),
            features: state.features
        });
        loadState();
        const currentFilterUrl = resolveFilterUrl();
        const settingsChanged = previousSettingsSignature !== JSON.stringify({
            enabled: isEnabled(),
            filterUrl: currentFilterUrl,
            filterSource: state.filterSource,
            lastFilterUpdate: state.lastFilterUpdate,
            ruleCount: getRuleCount(),
            features: state.features
        });
        if (settingsChanged) {
            updateCosmeticCSS();
            try { installPropertyTraps(); } catch (e) { /* ignore */ }
            try { registerMenuCommands(); } catch (e) { /* ignore */ }
        }
        refreshSettingsUI(settingsChanged);

        if (currentFilterUrl !== previousFilterUrl || state.filterSource === 'stale' || state.filterSource === 'built-in') {
            fetchFilters();
        }
    }

    // Remember which nodes WE set aria-hidden/inert on so we can restore them
    // without clobbering state that YouTube itself may have applied.
    const inertRecords = new Map(); // element → { hadHidden, hadInert }

    function setBackgroundInert(inert) {
        if (!document.body) return;
        if (inert) {
            for (const child of Array.from(document.body.children)) {
                if (!child || child === state.overlayEl || child === state.toastRegionEl) continue;
                if (inertRecords.has(child)) continue;
                const hadHidden = child.getAttribute('aria-hidden') === 'true';
                const hadInert = child.hasAttribute('inert');
                inertRecords.set(child, { hadHidden, hadInert });
                if (!hadHidden) child.setAttribute('aria-hidden', 'true');
                if (!hadInert) {
                    try { child.inert = true; } catch (e) { /* ignore */ }
                }
            }
        } else {
            for (const [el, prev] of inertRecords) {
                if (!el) continue;
                if (!prev.hadHidden) el.removeAttribute('aria-hidden');
                if (!prev.hadInert) {
                    try { el.inert = false; } catch (e) { /* ignore */ }
                }
            }
            inertRecords.clear();
        }
    }

    function toggleSettings(show) {
        if (show === undefined) show = !state.settingsOpen;
        // If a prior SPA navigation detached the overlay node, drop the
        // stale reference so the next open rebuilds cleanly rather than
        // attaching event handlers to an orphaned element.
        if (state.overlayEl && !state.overlayEl.isConnected) {
            state.overlayEl = null;
            state.panelEl = null;
        }
        if (show) injectSettingsCSS();
        // Build lazily: menu-triggered opens that happen before DOMContentLoaded
        // previously no-oped. If the body is ready, build on demand.
        if (show && !state.overlayEl && document.body) {
            try { buildSettingsPanel(); } catch (e) { /* stays closed */ }
        }
        if (!state.overlayEl) {
            if (show) {
                showToast(STRINGS.ui.stillLoading, 'info');
            }
            return;
        }
        state.settingsOpen = show;
        if (show) {
            state.lastFocusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            state.overlayEl.classList.add(`${CSS_PREFIX}-active`);
            // Remove rather than set to "false" — explicit aria-hidden="false"
            // can conflict with ancestor inheritance semantics in some AT.
            state.overlayEl.removeAttribute('aria-hidden');
            setBackgroundInert(true);
            buildContent();
            refreshSettingsUI();
            requestAnimationFrame(() => {
                const target = document.getElementById(`${CSS_PREFIX}-master-toggle`) || document.getElementById(`${CSS_PREFIX}-close-btn`);
                target?.focus();
            });
        } else {
            state.overlayEl.classList.remove(`${CSS_PREFIX}-active`);
            state.overlayEl.setAttribute('aria-hidden', 'true');
            setBackgroundInert(false);
            // Drop uncommitted URL edits when the panel closes so the next
            // open shows the committed value rather than stale scratch text.
            state.pendingFilterUrl = null;
            state.settingsQuery = '';
            const searchInput = document.getElementById(`${CSS_PREFIX}-settings-search`);
            if (searchInput) searchInput.value = '';
            state.lastFocusedEl?.focus?.();
        }
    }

    /* =========================================================================
     * INIT
     * ===================================================================== */

    if (IS_EXTENSION_BUILD && typeof document !== 'undefined') {
        document.addEventListener('ytab:settings-changed', handleExtensionSettingsSync);
    }

    // Phase 1: Load config and install proxies ASAP (document-start).
    // If document-start was lost (late injection under Tampermonkey MV3,
    // prerendered navigations, or hot-reload), installProxies is
    // idempotent: it bails on `state.proxiesInstalled` and safeOverride
    // logs any natives that are already locked.
    loadState();
    // Handle Chrome prerendered documents: defer proxy install until the
    // page activates so we don't race against a speculative document
    // that may be discarded (wasted work + possible double-install).
    if (typeof document !== 'undefined' && document.prerendering) {
        document.addEventListener('prerenderingchange', () => {
            installProxies();
            injectSettingsCSS();
            fetchFilters();
            fetchWebpackSignatureDatabase();
        }, { once: true });
    } else {
        installProxies();
        injectSettingsCSS();

        // Phase 2: Background filter fetch
        fetchFilters();
        fetchWebpackSignatureDatabase();
    }

    function safeRegisterMenu(label, fn) {
        if (typeof GM_registerMenuCommand !== 'function') return null;
        try {
            return GM_registerMenuCommand(label, fn);
        } catch (e) {
            return null;
        }
    }

    function registerMenuCommands() {
        // Unregister previously registered handles so the Pause/Resume label
        // reflects current state. `GM_unregisterMenuCommand` is only available
        // in some managers (Tampermonkey, Violentmonkey) — we silently skip it
        // elsewhere; duplicate entries are a minor cosmetic issue rather than
        // a functional one.
        if (typeof GM_unregisterMenuCommand === 'function') {
            for (const handle of state.menuHandles) {
                try { GM_unregisterMenuCommand(handle); } catch (e) { /* ignore */ }
            }
        }
        state.menuHandles = [];

        const h1 = safeRegisterMenu(`${SCRIPT_NAME}: ${STRINGS.menu.openControlCenter}`, () => toggleSettings(true));
        const h2 = safeRegisterMenu(
            `${SCRIPT_NAME}: ${isEnabled() ? STRINGS.menu.pauseProtection : STRINGS.menu.resumeProtection}`,
            () => setScriptEnabled(!isEnabled())
        );
        const h3 = safeRegisterMenu(`${SCRIPT_NAME}: ${STRINGS.menu.refreshRules}`, () => { fetchFilters(true); });
        const h4 = safeRegisterMenu(`${SCRIPT_NAME}: ${STRINGS.menu.copyDiagnostics}`, copyDiagnosticsToClipboard);
        for (const h of [h1, h2, h3, h4]) if (h != null) state.menuHandles.push(h);
    }

    // Phase 3: DOM-dependent setup
    function onDOMReady() {
        buildSettingsPanel();

        if (!getSetting('welcomed', false)) {
            setSetting('welcomed', true);
            const injectionStatus = getInjectionTimingStatus();
            if (injectionStatus.likelyLate) {
                showToast(STRINGS.ui.loadedLate(getControlCenterAccessHint()), 'warn');
            } else {
                showToast(STRINGS.ui.activeToast(getControlCenterAccessHint()), 'success');
            }
        }

        // Stats counter update interval (panel only repaints when open)
        registerInterval(() => {
            if (state.settingsOpen) updateStatsDisplay();
        }, STATS_UI_REFRESH_MS);

        // SPA navigation handling
        document.addEventListener('yt-navigate-finish', () => {
            updateCosmeticCSS();
            updateClutterCSS();
        });

        // Breakage self-test: detect enforcement popups or ad elements that
        // survived pruning. When the user has protection on but YouTube still
        // rendered an enforcement banner or a video ad overlay, a recovery
        // toast offers a one-click rule refresh. The check runs every 10s and
        // debounces (at most one toast per page load) to avoid false-alarm
        // spam on transient DOM.
        let breakageToastFired = false;
        registerInterval(() => {
            if (!isEnabled() || breakageToastFired) return;
            const enforcement = document.querySelector(
                'ytd-enforcement-message-view-model, tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)'
            );
            const adOverlay = document.querySelector(
                '.ytp-ad-player-overlay, .ytp-ad-action-interstitial, .ad-showing .ytp-ad-module'
            );
            if (enforcement || adOverlay) {
                breakageToastFired = true;
                showToast(
                    STRINGS.ui.youtubeChanged,
                    'warn'
                );
            }
        }, 10000);
        document.addEventListener('yt-navigate-finish', () => { breakageToastFired = false; });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onDOMReady);
    } else {
        onDOMReady();
    }

    // Register menu command
    try {
        registerMenuCommands();
    } catch (e) { /* GM_registerMenuCommand may not be available */ }

})();
