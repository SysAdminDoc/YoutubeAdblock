// ==UserScript==
// @name         YoutubeAdblock
// @namespace    https://github.com/SysAdminDoc
// @version      0.3.1
// @description  YouTube ad blocker with remote rules, anti-detect hardening, and an in-page Control Center
// @author       SysAdminDoc
// @license      MIT
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://music.youtube.com/*
// @match        https://tv.youtube.com/*
// @match        https://www.youtube-nocookie.com/*
// @match        https://youtubekids.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @run-at       document-start
// @connect      raw.githubusercontent.com
// @connect      github.com
// @connect      githubusercontent.com
// @connect      sponsor.ajay.app
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
    const SCRIPT_VERSION = '0.3.1';
const PROJECT_URL = 'https://github.com/SysAdminDoc/YoutubeAdblock';
const ISSUES_URL = `${PROJECT_URL}/issues`;
    const FILTER_URL_DEFAULT = 'https://raw.githubusercontent.com/SysAdminDoc/YoutubeAdblock/refs/heads/main/youtube-adblock-filters.txt';
    const FILTER_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
    const FILTER_MAX_BYTES = 5 * 1024 * 1024; // 5MB safety cap on remote lists
    const FILTER_FETCH_TIMEOUT_MS = 15000;
    const SSAP_POLL_INTERVAL_MS = 1000;
    const STATS_PERSIST_INTERVAL_MS = 2000;
    const STATS_UI_REFRESH_MS = 5000;
    const CSS_PREFIX = 'ytab';
    const IS_EXTENSION_BUILD = typeof __YTAB_STORAGE_KEY !== 'undefined';
    const DEFAULT_STATS = { blocked: 0, pruned: 0, ssapSkipped: 0, sponsorSkipped: 0 };
    const SPONSORBLOCK_API = 'https://sponsor.ajay.app/api/skipSegments';
    const SPONSORBLOCK_CATEGORIES = [
        'sponsor', 'selfpromo', 'interaction',
        'intro', 'outro', 'preview',
        'music_offtopic', 'filler'
    ];
    const SPONSORBLOCK_TIMEOUT_MS = 10000;
    const SECTION_IDS = {
        overview: `${CSS_PREFIX}-section-overview`,
        rules: `${CSS_PREFIX}-section-rules`,
        core: `${CSS_PREFIX}-section-core`,
        anti: `${CSS_PREFIX}-section-anti`,
        cleanup: `${CSS_PREFIX}-section-cleanup`,
        sponsor: `${CSS_PREFIX}-section-sponsor`,
        diagnostics: `${CSS_PREFIX}-section-diagnostics`
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
            'auxiliaryUi.messageRenderers.upsellDialogRenderer'
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
            '.ytd-two-column-browse-results-renderer > ytd-rich-grid-renderer > #masthead-ad'
        ],
        upsellSelectors: [
            'ytd-popup-container > .ytd-popup-container > #contentWrapper > .ytd-popup-container[position-type="OPEN_POPUP_POSITION_BOTTOMLEFT"]'
        ],
        features: {
            jsonParsePrune: true, fetchIntercept: true, xhrIntercept: true,
            setUndefinedTraps: true, ssapAutoSkip: true, abnormalityBypass: true,
            domBypassPrevention: true, clientScreenSpoof: true, shortsAdBlock: true,
            cosmeticHiding: true, upsellBlock: true, requestBodyModify: true,
            timerNeutralization: true,
            // New in 0.2.1 — opt-in by default because they trade off
            // slightly more aggressive behavior for stronger protection.
            aggressiveAntiStall: true,
            videoAdFastForward: true,
            sponsorBlock: true
        }
    };

    const FEATURE_GROUPS = [
        {
            sectionId: SECTION_IDS.core,
            title: 'Core Blocking',
            description: 'Intercept the network and data paths that carry ad payloads before YouTube can render them.',
            features: [
                {
                    key: 'jsonParsePrune',
                    label: 'JSON response pruning',
                    desc: 'Removes ad payloads from parsed player responses before they are consumed.'
                },
                {
                    key: 'fetchIntercept',
                    label: 'fetch() interception',
                    desc: 'Applies pruning to player and browse requests handled through fetch().'
                },
                {
                    key: 'xhrIntercept',
                    label: 'XMLHttpRequest interception',
                    desc: 'Catches older request paths that still deliver ad-related responses.'
                },
                {
                    key: 'setUndefinedTraps',
                    label: 'Initial property traps',
                    desc: 'Keeps early ad-related player properties undefined during first-page hydration.'
                },
                {
                    key: 'requestBodyModify',
                    label: 'Outbound request rewrite',
                    desc: 'Adjusts request payloads that can influence how YouTube returns ad data.'
                }
            ]
        },
        {
            sectionId: SECTION_IDS.anti,
            title: 'Anti-Detection',
            description: 'Reduce the odds of YouTube detecting, rehydrating, or bypassing the protections already in place.',
            features: [
                {
                    key: 'abnormalityBypass',
                    label: 'Abnormality callback bypass',
                    desc: 'Neutralizes callbacks that flag ad blocking as abnormal behavior.'
                },
                {
                    key: 'domBypassPrevention',
                    label: 'Iframe bypass prevention',
                    desc: 'Stops clean iframe contexts from restoring unmodified browser APIs.'
                },
                {
                    key: 'clientScreenSpoof',
                    label: 'Client screen spoofing',
                    desc: 'Reports a safer client screen value to reduce ad-specific responses.'
                },
                {
                    key: 'ssapAutoSkip',
                    label: 'SSAP auto-skip',
                    desc: 'Fast-forwards through stitched server-side ads whenever they are detected.'
                },
                {
                    key: 'timerNeutralization',
                    label: 'Timer neutralization',
                    desc: 'Disarms the long timers YouTube uses to validate ad playback.'
                },
                {
                    key: 'aggressiveAntiStall',
                    label: 'Aggressive anti-stall',
                    desc: 'Fast-forwards the 17-second bound timers YouTube uses to stall playback when a blocker is suspected.'
                },
                {
                    key: 'videoAdFastForward',
                    label: 'Video ad fast-forward',
                    desc: 'If an unskippable ad still plays, mutes it and accelerates playback as a fallback safety net.'
                }
            ]
        },
        {
            sectionId: SECTION_IDS.cleanup,
            title: 'Interface Cleanup',
            description: 'Remove the visible clutter that remains after payload blocking has already done the heavy lifting.',
            features: [
                {
                    key: 'cosmeticHiding',
                    label: 'Cosmetic cleanup',
                    desc: 'Hides promoted shelves, banners, overlays, and remaining ad containers.'
                },
                {
                    key: 'upsellBlock',
                    label: 'Premium upsell blocking',
                    desc: 'Suppresses Premium upgrade popups and related prompts.'
                },
                {
                    key: 'shortsAdBlock',
                    label: 'Shorts ad removal',
                    desc: 'Removes sponsored entries from Shorts feeds before they appear.'
                }
            ]
        },
        {
            sectionId: SECTION_IDS.sponsor,
            title: 'Community Sponsor Segments',
            description: 'Silently jump past sponsor reads, self-promotion, intros, outros, and other crowd-marked segments.',
            features: [
                {
                    key: 'sponsorBlock',
                    label: 'SponsorBlock auto-skip',
                    desc: 'Uses the SponsorBlock community database to silently skip sponsor, self-promo, intro, outro, interaction, preview, music-off-topic, and filler segments. No notifications.'
                }
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
        filterRequestPromise: null,
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
        // Interval handles owned by the installed engines. Kept so the
        // INIT path can avoid re-registering on hot reload (e.g. dev
        // scenarios where the userscript is re-evaluated) and future
        // teardown paths can cleanly stop them.
        engineIntervals: []
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

    function isValidCachedFilters(value) {
        return !!(
            value &&
            typeof value === 'object' &&
            Array.isArray(value.pruneKeys) &&
            Array.isArray(value.setUndefined) &&
            Array.isArray(value.cosmeticSelectors)
        );
    }

    function loadState() {
        const cached = getSetting('filters_cache', null);
        const cacheTime = getSetting('filters_cache_time', 0);
        const rawOverrides = getSetting('feature_overrides', {});
        const featureOverrides = (rawOverrides && typeof rawOverrides === 'object') ? rawOverrides : {};
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

        if (isValidCachedFilters(cached)) {
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
            state.filterSource = (Date.now() - state.lastFilterUpdate < FILTER_CACHE_TTL)
                ? 'cached'
                : 'stale';
        } else {
            state.filters = DEFAULT_FILTERS;
            state.filterSource = 'built-in';
            // Discard any malformed cache so a subsequent successful fetch
            // starts clean rather than layering onto corrupt data.
            if (cached) {
                try { setSetting('filters_cache', null); } catch (e) { /* ignore */ }
            }
        }

        // Merge feature defaults with user overrides
        state.features = normalizeFeatures(state.filters?.features);
        for (const [k, v] of Object.entries(featureOverrides)) {
            if (k in state.features) state.features[k] = !!v;
        }
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
        if (!timestamp) return 'Not synced yet';
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
        if (host === 'music.youtube.com') return 'YouTube Music';
        if (host === 'tv.youtube.com') return 'YouTube TV';
        if (host === 'm.youtube.com') return 'YouTube Mobile';
        if (host === 'www.youtube-nocookie.com') return 'YouTube No-Cookie';
        if (host === 'youtubekids.com' || host === 'www.youtubekids.com') return 'YouTube Kids';
        return 'YouTube';
    }

    function getSurfaceLabel() {
        try {
            const pathname = location.pathname || '/';
            if (pathname === '/watch') return 'Watch Page';
            if (pathname.startsWith('/shorts')) return 'Shorts Feed';
            if (pathname.startsWith('/results')) return 'Search Results';
            if (pathname.startsWith('/playlist')) return 'Playlist';
            if (pathname.startsWith('/feed/subscriptions')) return 'Subscriptions';
            if (pathname.startsWith('/feed/history')) return 'History';
            if (pathname.startsWith('/feed/library')) return 'Library';
            if (pathname.startsWith('/channel') || pathname.startsWith('/@') || pathname.startsWith('/c/')) return 'Channel';
            if (pathname.startsWith('/live')) return 'Live Stream';
            if (pathname.startsWith('/browse')) return 'Browse';
            if (pathname === '/' || pathname === '') return 'Home';
        } catch (e) { /* ignore */ }
        return 'Current Page';
    }

    function getOpenShortcutLabel() {
        const platform = typeof navigator !== 'undefined' ? (navigator.platform || navigator.userAgent || '') : '';
        return /(Mac|iPhone|iPad|iPod)/i.test(platform)
            ? 'Cmd + Shift + Y'
            : 'Ctrl + Shift + Y';
    }

    function getControlCenterAccessLabel() {
        return IS_EXTENSION_BUILD ? getOpenShortcutLabel() : 'Userscript Menu';
    }

    function getControlCenterAccessHint() {
        return IS_EXTENSION_BUILD
            ? `Click the toolbar button or press ${getOpenShortcutLabel()} from any YouTube tab.`
            : 'Open the Control Center from your userscript manager menu any time.';
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
        const labels = {
            remote: 'Remote list',
            cached: 'Cached list',
            stale: 'Cached list (stale)',
            'built-in': 'Built-in fallback'
        };
        return labels[source] || 'Custom source';
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
            return {
                label: 'Paused',
                tone: 'warn',
                description: 'Every blocking engine is paused until you turn protection back on.'
            };
        }

        if (state.filterSyncing) {
            return {
                label: 'Refreshing…',
                tone: 'info',
                description: 'Pulling the latest rule set while keeping your current protection active.'
            };
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
                label: 'Protected',
                tone: 'success',
                description: 'Remote rules are live and the fallback remains ready if the source goes away.'
            };
        }

        if (state.filterSource === 'cached') {
            return {
                label: 'Protected',
                tone: 'info',
                description: 'Cached rules are active while YoutubeAdblock waits for a fresher remote copy.'
            };
        }

        if (state.filterSource === 'stale') {
            return {
                label: 'Protected',
                tone: 'info',
                description: 'Previously saved rules are active while YoutubeAdblock refreshes in the background.'
            };
        }

        return {
            label: 'Protected',
            tone: 'success',
            description: 'Built-in rules are active, so protection still works even without a remote list.'
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
        let filterCount = 0;
        let droppedUnsafeSelectors = 0;

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
                    const parts = argsStr.split(',').map(s => s.trim());
                    if (parts.length >= 2 && parts[1] === 'undefined' && setUndefined.size < FILTER_MAX_SET_UNDEFINED) {
                        const path = parts[0];
                        // Only accept identifier.path syntax — reject anything with
                        // brackets, spaces, or characters that suggest code smuggling.
                        if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(path)) {
                            setUndefined.add(path);
                        }
                    }
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
                        if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(clean)) continue;
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
            replaceKeys: DEFAULT_FILTERS.replaceKeys,
            interceptPatterns: DEFAULT_FILTERS.interceptPatterns,
            cosmeticSelectors: [...new Set([...DEFAULT_FILTERS.cosmeticSelectors, ...cosmeticSelectors])],
            upsellSelectors: [...new Set([...DEFAULT_FILTERS.upsellSelectors, ...upsellSelectors])],
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

    function fetchFilters(force = false) {
        const url = resolveFilterUrl();
        // Fresh cache skips the network call unless forced. Stale cache and
        // built-in defaults both benefit from a refresh attempt on startup.
        if (!force && state.filterSource === 'cached') return Promise.resolve(state.filters);
        if (state.filterSyncing && state.filterRequestPromise) return state.filterRequestPromise;
        if (typeof GM_xmlhttpRequest !== 'function') {
            // No network privilege — stay on whatever we have.
            return Promise.resolve(state.filters);
        }

        const request = new Promise((resolve) => {
            state.filterSyncing = true;
            state.filterError = '';
            refreshSettingsUI();

            const finish = () => {
                state.filterSyncing = false;
                state.filterRequestPromise = null;
            };

            const cacheBusted = url + (url.includes('?') ? '&' : '?') + '_=' + Date.now();

            GM_xmlhttpRequest({
                method: 'GET',
                url: cacheBusted,
                timeout: FILTER_FETCH_TIMEOUT_MS,
                onload(resp) {
                    try {
                        const text = resp.responseText || '';
                        if (text.length > FILTER_MAX_BYTES) {
                            throw new Error(`Remote filter list exceeds ${Math.round(FILTER_MAX_BYTES / 1024 / 1024)}MB limit.`);
                        }
                        if (resp.status && (resp.status < 200 || resp.status >= 300)) {
                            throw new Error(`Remote filter request returned HTTP ${resp.status}.`);
                        }

                        let data;
                        // Detect format: JSON starts with { or [, otherwise uBO filter list
                        if (text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) {
                            data = jsonParseRaw(text);
                            if (!data || !Array.isArray(data.pruneKeys) || !data.features) {
                                throw new Error('Invalid JSON filter schema.');
                            }
                        } else {
                            data = parseUBOFilterList(text);
                        }

                        data.features = normalizeFeatures(data.features);
                        state.filters = data;
                        state.filterSource = 'remote';
                        state.lastFilterUpdate = Date.now();
                        state.filterError = '';
                        try {
                            setSetting('filters_cache', data);
                            setSetting('filters_cache_time', Date.now());
                        } catch (e) { /* quota errors are non-fatal */ }
                        // Re-merge features with overrides
                        const overrides = getSetting('feature_overrides', {});
                        state.features = normalizeFeatures(data.features);
                        for (const [k, v] of Object.entries(overrides)) {
                            if (k in state.features) state.features[k] = v;
                        }
                        updateCosmeticCSS();
                        // New remote rules may introduce additional setUndefined
                        // paths or new roots. Re-install lets the newly named
                        // roots get guarded, and rebuildTrapPathsByRoot makes
                        // new subpaths on already-trapped roots take effect.
                        try { installPropertyTraps(); } catch (e) { /* ignore */ }
                        finish();
                        resolve(data);
                        refreshSettingsUI(true);
                        const count = data.filterCount || data.cosmeticSelectors?.length || 0;
                        showToast(`Rule refresh complete. ${formatNumber(count)} rules are active (${data.version || '?'}).`, 'success');
                    } catch (e) {
                        console.warn(`[${SCRIPT_NAME}] Filter parse error:`, e);
                        const detail = e && e.message ? e.message : '';
                        state.filterError = detail
                            ? `Rule library problem: ${detail} Your current rules stayed active.`
                            : 'The remote list could not be parsed. Your current rules stayed active.';
                        finish();
                        resolve(state.filters);
                        refreshSettingsUI(true);
                        showToast(state.filterError, 'error');
                    }
                },
                onerror() {
                    state.filterError = 'The remote list was unreachable, so YoutubeAdblock stayed on the last known rule set.';
                    finish();
                    resolve(state.filters);
                    refreshSettingsUI(true);
                    showToast('The remote list was unreachable. Your current protection stayed active.', 'error');
                },
                ontimeout() {
                    state.filterError = 'The remote list took too long to respond, so your current rules remained in place.';
                    finish();
                    resolve(state.filters);
                    refreshSettingsUI(true);
                    showToast('The rule refresh timed out. Your current protection stayed active.', 'error');
                }
            });
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
        try {
            obj[prop] = newValue;
            // Skip strict equality check — proxied properties may not read back identically
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
            // Another script (e.g. another YouTube adblock userscript) already
            // locked the property non-configurably. Log once so the user can
            // diagnose conflicts; downstream engines still do their part.
            console.warn(`[${SCRIPT_NAME}] Could not override ${label || prop}. Another script may have already locked it.`);
            return false;
        }
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

        safeOverride(JSON, 'parse', proxied, 'JSON.parse');
    }

    /* =========================================================================
     * ENGINE: fetch() Proxy
     * ===================================================================== */

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

                // Modify outbound request body (clientScreen spoof)
                if (state.features.clientScreenSpoof && state.features.requestBodyModify) {
                    try {
                        if (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/get_watch')) {
                            const init = args[1];
                            if (init && init.body && typeof init.body === 'string') {
                                const bodyObj = jsonParseRaw(init.body);
                                if (bodyObj?.context?.client?.clientName === 'WEB') {
                                    bodyObj.context.client.clientScreen = 'CHANNEL';
                                    args[1] = { ...init, body: JSON.stringify(bodyObj) };
                                }
                            }
                        }
                    } catch (e) { /* fail silently */ }
                }

                if (!state.features.fetchIntercept || !matchesInterceptPattern(url)) {
                    return Reflect.apply(target, thisArg, args);
                }

                return Reflect.apply(target, thisArg, args).then(response => {
                    if (!response || !response.ok) return response;
                    const contentType = response.headers?.get?.('content-type') || '';
                    // Only rewrite JSON-ish responses; leaves media/HTML intact.
                    if (contentType && !/json|javascript|text\/plain/i.test(contentType)) {
                        return response;
                    }
                    return response.clone().text().then(text => {
                        if (!text) return response;
                        // Fast reject: if the raw body doesn't mention any of
                        // the prune keys or replaceKeys targets, skip the JSON
                        // parse and tree walk entirely. On YT this short-circuits
                        // nearly all /browse, /search, /next responses.
                        if (!responseTextMightContainAds(text)) return response;
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

        safeOverride(window, 'fetch', proxiedFetch, 'window.fetch');
    }

    /* =========================================================================
     * ENGINE: XMLHttpRequest Proxy
     * ===================================================================== */

    function installXHRProxy() {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;
        state.originals.xhrOpen = originalOpen;
        state.originals.xhrSend = originalSend;

        const proxiedOpen = function(method, url, ...rest) {
            // url may be a URL instance per spec; coerce so downstream
            // String#includes calls never throw on a non-string.
            const urlStr = (typeof url === 'string') ? url : (url != null ? String(url) : '');
            this._ytab_url = urlStr;

            // Modify outbound request body interception point
            if (isEnabled() && state.features.clientScreenSpoof && state.features.requestBodyModify) {
                this._ytab_shouldModify = (
                    urlStr.includes('/youtubei/v1/player') || urlStr.includes('/youtubei/v1/get_watch')
                );
            } else {
                this._ytab_shouldModify = false;
            }

            return originalOpen.call(this, method, url, ...rest);
        };

        const proxiedSend = function(body) {
            if (!isEnabled()) {
                return originalSend.call(this, body);
            }

            // Modify outbound request body
            if (this._ytab_shouldModify && body && typeof body === 'string') {
                try {
                    const bodyObj = jsonParseRaw(body);
                    if (bodyObj?.context?.client?.clientName === 'WEB') {
                        bodyObj.context.client.clientScreen = 'CHANNEL';
                        body = JSON.stringify(bodyObj);
                    }
                } catch (e) { /* fail silently */ }
            }

            if (!state.features.xhrIntercept || !matchesInterceptPattern(this._ytab_url)) {
                return originalSend.call(this, body);
            }

            const xhr = this;
            let intercepted = false;

            function interceptResponse() {
                if (intercepted) return;
                if (xhr.readyState !== 4) return;
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
                // Same fast reject as fetch: skip the JSON parse + walk when
                // the body clearly has no ad fields.
                if (!responseTextMightContainAds(sourceText)) return;
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
                    intercepted = true;
                } catch (e) { /* fail silently */ }
            }

            // Fire interception before user handlers so rewritten data is what
            // they read. Only one capture-phase listener is registered per send.
            xhr.addEventListener('readystatechange', interceptResponse, { capture: true });

            return originalSend.call(this, body);
        };

        safeOverride(XMLHttpRequest.prototype, 'open', proxiedOpen, 'XMLHttpRequest.prototype.open');
        safeOverride(XMLHttpRequest.prototype, 'send', proxiedSend, 'XMLHttpRequest.prototype.send');
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
        state.originals.promiseThen = originalThen;

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
        state.originals.appendChild = originalAppendChild;
        state.originals.insertBefore = originalInsertBefore;
        state.originals.replaceChild = originalReplaceChild;

        function handleInsertion(node, result) {
            try {
                // Any iframe insertion — not just about:blank. YT 2026 also uses
                // sandboxed iframes with srcdoc, and blob:/data: sources. If the
                // frame is same-origin-accessible, rebridge on insertion and
                // once on load for cases where the document swaps in later.
                if (node instanceof HTMLIFrameElement) {
                    bridgeIframeWindow(node);
                    try {
                        // Re-bridge on every document swap, not just once.
                        // An iframe can swap its document multiple times
                        // (e.g. YT uses blob: and srcdoc-driven swaps).
                        // Each new document gets a fresh Window, and the
                        // sentinel lives on the old one — so this listener
                        // picks up every swap without leaking old refs.
                        node.addEventListener('load', () => {
                            // Clear the cross-origin memoization so the
                            // new document gets a fresh probe — an iframe
                            // that navigated from same-origin to cross-
                            // origin (or vice versa) would otherwise stay
                            // stuck in the old classification.
                            frameCrossOriginCache.delete(node);
                            bridgeIframeWindow(node);
                        });
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
        state._videoAdFastForwardInterval = registerInterval(tickVideo, 500);
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

    function getCurrentVideoId() {
        try {
            const u = new URL(location.href);
            if (u.pathname === '/watch') return u.searchParams.get('v');
            const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
            return m ? m[1] : null;
        } catch (e) {
            return null;
        }
    }

    function sponsorBlockFetchBucket(hashPrefix) {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                resolve(null);
                return;
            }
            const cats = encodeURIComponent(JSON.stringify(SPONSORBLOCK_CATEGORIES));
            const actions = encodeURIComponent(JSON.stringify(['skip', 'full']));
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
            for (const s of match.segments) {
                if (!s || !Array.isArray(s.segment) || s.segment.length !== 2) continue;
                if (s.actionType && s.actionType !== 'skip' && s.actionType !== 'full') continue;
                const start = Number(s.segment[0]);
                const end = Number(s.segment[1]);
                if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
                if (end <= start || start < 0) continue;
                clean.push({ start, end, category: s.category, uuid: s.UUID });
            }
            // Sort by start so the skip decision is deterministic when
            // segments overlap — we always take the earliest qualifying
            // match.
            clean.sort((a, b) => a.start - b.start);
            sponsorBlockState.segments = clean;
            sponsorBlockState.videoId = videoId;
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
                } catch (e) { /* some codepaths reject currentTime writes */ }
                return;
            }
        };
        sponsorBlockState.timeupdateHandler = handler;
        try {
            video.addEventListener('timeupdate', handler);
        } catch (e) { /* ignore */ }
    }

    function handleSponsorBlockNav() {
        if (!isEnabled() || !state.features.sponsorBlock) return;
        const vid = getCurrentVideoId();
        if (!vid) {
            sponsorBlockState.segments = [];
            sponsorBlockState.videoId = null;
            sponsorBlockState.pendingVideoId = null;
            sponsorBlockState.lastSkipEnd = -1;
            return;
        }
        // Fresh video — drop whatever segments we had so a stale in-flight
        // fetch can't apply in the gap between nav and new segments.
        if (vid !== sponsorBlockState.videoId) {
            sponsorBlockState.segments = [];
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
        state._sponsorBlockInterval = registerInterval(() => {
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
        state.originals.setTimeout = originalSetTimeout;

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
                            args[1] = 17; // 0.001x ≈ 17ms
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

        safeOverride(window, 'setTimeout', proxiedSetTimeout, 'window.setTimeout');
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

    function updateCosmeticCSS() {
        // Re-resolve when the cached node has been torn out of the document,
        // e.g. if YouTube rewrites <head> during an SPA navigation. The old
        // implementation kept a stale reference and silently stopped updating.
        if (!state.cosmeticStyleEl || !state.cosmeticStyleEl.isConnected) {
            state.cosmeticStyleEl = ensureStyleElement(`${CSS_PREFIX}-cosmetic`);
        }
        watchCosmeticStyleSurvival();

        if (!isEnabled() || !state.features.cosmeticHiding) {
            state.cosmeticStyleEl.textContent = '';
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
            state.cosmeticStyleEl.textContent = '';
            return;
        }
        // One rule per selector — per the CSS spec, a malformed selector in
        // a comma list invalidates the whole rule. Per-selector isolation
        // means a single bad entry only loses itself.
        state.cosmeticStyleEl.textContent = safe
            .map(s => `${s} { display: none !important; }`)
            .join('\n');
    }

    /* =========================================================================
     * INSTALL ALL ENGINES
     * ===================================================================== */

    function installProxies() {
        if (state.proxiesInstalled) return;
        state.proxiesInstalled = true;

        const engines = [
            ['JSONParseProxy', installJSONParseProxy],
            ['FetchProxy', installFetchProxy],
            ['XHRProxy', installXHRProxy],
            ['PropertyTraps', installPropertyTraps],
            ['AbnormalityBypass', installAbnormalityBypass],
            ['DOMBypassPrevention', installDOMBypassPrevention],
            ['SSAPAutoSkip', installSSAPAutoSkip],
            ['VideoAdFastForward', installVideoAdFastForward],
            ['SponsorBlock', installSponsorBlock],
            ['TimerNeutralization', installTimerNeutralization],
            ['CosmeticCSS', updateCosmeticCSS],
        ];

        for (const [name, fn] of engines) {
            try { fn(); }
            catch (e) { console.warn(`[${SCRIPT_NAME}] Engine ${name} failed:`, e); }
        }

        console.log(`[${SCRIPT_NAME} v${SCRIPT_VERSION}] Engines active | Source: ${state.filterSource} | Filters v${state.filters?.version || '?'}`);
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
        const labels = {
            info: 'Heads Up',
            success: 'Updated',
            error: 'Needs Attention',
            warn: 'Check This'
        };
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
        title.textContent = labels[safeType];
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
                background:
                    radial-gradient(circle at top, rgba(255, 106, 77, 0.18), transparent 32%),
                    linear-gradient(180deg, rgba(7, 10, 18, 0.76), rgba(7, 10, 18, 0.86));
                backdrop-filter: blur(20px) saturate(150%);
                -webkit-backdrop-filter: blur(20px) saturate(150%);
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.24s ease;
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
                --success: #66d995;
                --info: #7abfff;
                --warning: #ffc46b;
                --danger: #ff8e97;
                --text: #f7f8fb;
                --text-2: #c3cbda;
                --text-3: #8893a7;
                width: min(880px, calc(100vw - 24px));
                max-height: min(920px, calc(100vh - 24px));
                display: flex;
                flex-direction: column;
                overflow: hidden;
                border-radius: 28px;
                border: 1px solid var(--panel-border);
                background:
                    radial-gradient(circle at top right, rgba(255, 106, 77, 0.12), transparent 26%),
                    linear-gradient(180deg, rgba(18, 24, 35, 0.98), rgba(8, 12, 20, 0.98));
                color: var(--text);
                color-scheme: dark;
                box-shadow:
                    0 36px 110px rgba(0, 0, 0, 0.55),
                    0 0 0 1px rgba(255, 255, 255, 0.03),
                    inset 0 1px 0 rgba(255, 255, 255, 0.04);
                transform: translateY(12px) scale(0.985);
                transition: transform 0.24s ease;
                outline: none;
            }
            .${CSS_PREFIX}-overlay.${CSS_PREFIX}-active .${CSS_PREFIX}-panel {
                transform: translateY(0) scale(1);
            }
            .${CSS_PREFIX}-header,
            .${CSS_PREFIX}-footer {
                padding-left: 28px;
                padding-right: 28px;
            }
            .${CSS_PREFIX}-header {
                display: flex;
                justify-content: space-between;
                gap: 20px;
                align-items: flex-start;
                padding-top: 24px;
                padding-bottom: 20px;
                border-bottom: 1px solid var(--panel-border);
                background: linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent);
            }
            .${CSS_PREFIX}-header-left {
                display: flex;
                gap: 16px;
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
                box-shadow: 0 14px 34px rgba(255, 106, 77, 0.28);
                flex-shrink: 0;
            }
            .${CSS_PREFIX}-brand {
                min-width: 0;
            }
            .${CSS_PREFIX}-eyebrow {
                margin: 0 0 7px;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.14em;
                font-weight: 700;
                color: var(--text-3);
            }
            .${CSS_PREFIX}-title-row {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
                align-items: center;
                margin-bottom: 7px;
            }
            .${CSS_PREFIX}-title {
                margin: 0;
                font-size: 23px;
                line-height: 1.05;
                font-weight: 780;
                letter-spacing: -0.04em;
                text-wrap: balance;
            }
            .${CSS_PREFIX}-version {
                padding: 5px 9px;
                border-radius: 999px;
                border: 1px solid var(--panel-border);
                background: rgba(255, 255, 255, 0.05);
                font-size: 11px;
                font-weight: 700;
                color: var(--text-2);
            }
            .${CSS_PREFIX}-header-desc {
                margin: 0;
                max-width: 500px;
                font-size: 13px;
                line-height: 1.55;
                color: var(--text-2);
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
                scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
            }
            .${CSS_PREFIX}-content::-webkit-scrollbar {
                width: 8px;
            }
            .${CSS_PREFIX}-content::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.12);
                border-radius: 999px;
            }
            .${CSS_PREFIX}-layout {
                display: grid;
                grid-template-columns: minmax(0, 1fr);
                gap: 18px;
                padding: 14px 28px 28px;
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
                margin-bottom: 12px;
            }
            .${CSS_PREFIX}-section-head > div {
                min-width: 0;
            }
            .${CSS_PREFIX}-section-title {
                margin: 0 0 4px;
                font-size: 15px;
                line-height: 1.2;
                font-weight: 740;
                letter-spacing: -0.02em;
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
                gap: 16px;
                height: 100%;
                padding: 20px;
                border-radius: 20px;
                border: 1px solid var(--panel-border);
                background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.015));
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
            }
            .${CSS_PREFIX}-summary {
                gap: 18px;
                background:
                    radial-gradient(circle at top right, rgba(255, 106, 77, 0.14), transparent 34%),
                    linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
            }
            .${CSS_PREFIX}-summary-hero {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 18px;
                align-items: start;
            }
            .${CSS_PREFIX}-summary-copy {
                display: grid;
                gap: 12px;
                min-width: 0;
            }
            .${CSS_PREFIX}-summary-title {
                margin: 0;
                font-size: 29px;
                line-height: 0.98;
                font-weight: 790;
                letter-spacing: -0.05em;
                text-wrap: balance;
            }
            .${CSS_PREFIX}-chip-row,
            .${CSS_PREFIX}-btn-row,
            .${CSS_PREFIX}-url-group,
            .${CSS_PREFIX}-stats,
            .${CSS_PREFIX}-jump-nav {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .${CSS_PREFIX}-summary-control {
                display: flex;
                gap: 14px;
                align-items: center;
                justify-content: space-between;
                min-width: 248px;
                padding: 16px 18px;
                border-radius: 18px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid var(--panel-border-strong);
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
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
                gap: 6px;
                padding: 15px 16px;
                border-radius: 16px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(255, 255, 255, 0.04);
            }
            .${CSS_PREFIX}-glance[data-tone="success"] {
                border-color: rgba(102, 217, 149, 0.24);
                background: rgba(102, 217, 149, 0.08);
            }
            .${CSS_PREFIX}-glance[data-tone="info"] {
                border-color: rgba(122, 191, 255, 0.22);
                background: rgba(122, 191, 255, 0.08);
            }
            .${CSS_PREFIX}-glance[data-tone="warn"] {
                border-color: rgba(255, 196, 107, 0.24);
                background: rgba(255, 196, 107, 0.08);
            }
            .${CSS_PREFIX}-glance-label {
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.09em;
                font-weight: 700;
                color: var(--text-3);
            }
            .${CSS_PREFIX}-glance-value {
                font-size: 15px;
                line-height: 1.2;
                font-weight: 740;
                letter-spacing: -0.02em;
                text-wrap: balance;
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
                gap: 6px;
                padding: 6px 10px;
                border-radius: 999px;
                border: 1px solid transparent;
                font-size: 11px;
                font-weight: 700;
            }
            .${CSS_PREFIX}-pill::before {
                content: '';
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: currentColor;
                opacity: 0.9;
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
                padding: 13px 15px;
                border-radius: 14px;
                border: 1px solid var(--panel-border);
                background: rgba(255, 255, 255, 0.045);
                color: var(--text);
                font-size: 12px;
                line-height: 1.45;
                font-family: "Cascadia Code", "SF Mono", Consolas, monospace;
                touch-action: manipulation;
                -webkit-tap-highlight-color: rgba(255, 106, 77, 0.14);
                outline: none;
                transition: border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
            }
            .${CSS_PREFIX}-input:hover {
                background: rgba(255, 255, 255, 0.06);
            }
            .${CSS_PREFIX}-input:focus-visible {
                border-color: rgba(255, 106, 77, 0.48);
                box-shadow: 0 0 0 4px rgba(255, 106, 77, 0.14);
                background: rgba(255, 255, 255, 0.065);
            }
            .${CSS_PREFIX}-input[aria-invalid="true"] {
                border-color: rgba(255, 142, 151, 0.58);
                box-shadow: 0 0 0 4px rgba(255, 142, 151, 0.14);
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
                min-height: 44px;
                padding: 10px 16px;
                border-radius: 14px;
                border: 1px solid transparent;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                font-size: 12px;
                font-weight: 720;
                cursor: pointer;
                white-space: nowrap;
                text-decoration: none;
                touch-action: manipulation;
                -webkit-tap-highlight-color: rgba(255, 106, 77, 0.14);
            }
            .${CSS_PREFIX}-btn:hover {
                transform: translateY(-1px);
            }
            .${CSS_PREFIX}-btn:disabled {
                cursor: default;
                opacity: 0.74;
                transform: none;
            }
            .${CSS_PREFIX}-btn-primary {
                background: linear-gradient(135deg, var(--accent), var(--accent-strong));
                color: #200d08;
                box-shadow: 0 14px 30px rgba(255, 106, 77, 0.24);
            }
            .${CSS_PREFIX}-btn-primary:hover {
                box-shadow: 0 18px 34px rgba(255, 106, 77, 0.28);
            }
            .${CSS_PREFIX}-btn-secondary {
                background: rgba(255, 255, 255, 0.06);
                color: var(--text);
                border-color: var(--panel-border);
            }
            .${CSS_PREFIX}-btn-secondary:hover {
                background: rgba(255, 255, 255, 0.08);
                border-color: var(--panel-border-strong);
            }
            .${CSS_PREFIX}-btn-ghost {
                background: transparent;
                color: var(--text-2);
                border-color: rgba(255, 255, 255, 0.08);
            }
            .${CSS_PREFIX}-btn-ghost:hover {
                color: var(--text);
                background: rgba(255, 255, 255, 0.04);
                border-color: rgba(255, 255, 255, 0.14);
            }
            .${CSS_PREFIX}-btn-danger {
                background: rgba(255, 142, 151, 0.14);
                color: #ffd8dc;
                border-color: rgba(255, 142, 151, 0.24);
            }
            .${CSS_PREFIX}-btn-danger:hover {
                background: rgba(255, 142, 151, 0.2);
            }
            .${CSS_PREFIX}-btn[data-armed="true"] {
                background: rgba(255, 196, 107, 0.16);
                color: #ffe7b6;
                border-color: rgba(255, 196, 107, 0.3);
                box-shadow: 0 0 0 3px rgba(255, 196, 107, 0.08);
            }
            .${CSS_PREFIX}-btn-small {
                min-height: 36px;
                padding-inline: 13px;
                border-radius: 12px;
                font-size: 11px;
            }
            .${CSS_PREFIX}-close {
                width: 40px;
                height: 40px;
                border-radius: 14px;
                background: transparent;
                border: 1px solid rgba(255, 255, 255, 0.08);
                color: var(--text-2);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                cursor: pointer;
                touch-action: manipulation;
                -webkit-tap-highlight-color: rgba(255, 106, 77, 0.14);
            }
            .${CSS_PREFIX}-close:hover {
                color: var(--text);
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(255, 255, 255, 0.14);
            }
            .${CSS_PREFIX}-toggle-list {
                display: grid;
                gap: 10px;
            }
            .${CSS_PREFIX}-row {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 16px;
                align-items: center;
                padding: 15px 16px;
                border-radius: 17px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(255, 255, 255, 0.035);
                transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
                cursor: pointer;
                touch-action: manipulation;
                -webkit-tap-highlight-color: rgba(255, 106, 77, 0.12);
            }
            .${CSS_PREFIX}-row:hover {
                background: rgba(255, 255, 255, 0.055);
                border-color: rgba(255, 255, 255, 0.13);
                transform: translateY(-1px);
            }
            .${CSS_PREFIX}-row:focus-within {
                border-color: rgba(255, 106, 77, 0.38);
                box-shadow: 0 0 0 3px rgba(255, 106, 77, 0.1);
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
                font-weight: 720;
                letter-spacing: -0.01em;
            }
            .${CSS_PREFIX}-row[data-enabled="false"] {
                background: rgba(255, 255, 255, 0.02);
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
            }
            .${CSS_PREFIX}-toggle-track {
                position: absolute;
                inset: 0;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.17);
                border: 1px solid rgba(255, 255, 255, 0.08);
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
                background: linear-gradient(135deg, var(--accent), var(--accent-strong));
                border-color: transparent;
                box-shadow: 0 10px 24px rgba(255, 106, 77, 0.24);
            }
            .${CSS_PREFIX}-toggle input:checked + .${CSS_PREFIX}-toggle-track::after {
                transform: translateX(20px);
            }
            .${CSS_PREFIX}-note {
                display: grid;
                gap: 6px;
                padding: 14px 16px;
                border-radius: 16px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                background: rgba(255, 255, 255, 0.04);
            }
            .${CSS_PREFIX}-note[data-tone="success"] {
                border-color: rgba(102, 217, 149, 0.24);
                background: rgba(102, 217, 149, 0.08);
            }
            .${CSS_PREFIX}-note[data-tone="info"] {
                border-color: rgba(122, 191, 255, 0.22);
                background: rgba(122, 191, 255, 0.08);
            }
            .${CSS_PREFIX}-note[data-tone="warn"] {
                border-color: rgba(255, 196, 107, 0.24);
                background: rgba(255, 196, 107, 0.09);
            }
            .${CSS_PREFIX}-note[data-tone="danger"] {
                border-color: rgba(255, 142, 151, 0.24);
                background: rgba(255, 142, 151, 0.08);
            }
            .${CSS_PREFIX}-note-title {
                margin: 0;
                font-size: 12px;
                font-weight: 760;
            }
            .${CSS_PREFIX}-footer {
                display: flex;
                justify-content: space-between;
                gap: 18px;
                flex-wrap: wrap;
                align-items: center;
                padding-top: 16px;
                padding-bottom: 18px;
                border-top: 1px solid var(--panel-border);
                background: linear-gradient(180deg, rgba(255, 255, 255, 0.015), transparent);
            }
            .${CSS_PREFIX}-footer-meta {
                display: grid;
                gap: 5px;
                min-width: 0;
            }
            .${CSS_PREFIX}-footer-aside {
                display: flex;
                justify-content: flex-end;
                align-items: center;
            }
            .${CSS_PREFIX}-footer-hint,
            .${CSS_PREFIX}-stat {
                font-size: 11px;
                color: var(--text-3);
            }
            .${CSS_PREFIX}-footer-hint {
                text-wrap: balance;
            }
            .${CSS_PREFIX}-stat b {
                color: var(--text);
                margin-left: 4px;
                font-weight: 760;
                font-variant-numeric: tabular-nums;
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
                padding: 14px 16px;
                border-radius: 16px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(15, 20, 31, 0.96);
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.36);
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
                width: 10px;
                height: 10px;
                margin-top: 5px;
                border-radius: 50%;
                background: var(--info);
                box-shadow: 0 0 0 6px rgba(122, 191, 255, 0.12);
            }
            .${CSS_PREFIX}-toast-success .${CSS_PREFIX}-toast-tone {
                background: var(--success);
                box-shadow: 0 0 0 6px rgba(102, 217, 149, 0.12);
            }
            .${CSS_PREFIX}-toast-error .${CSS_PREFIX}-toast-tone {
                background: var(--danger);
                box-shadow: 0 0 0 6px rgba(255, 142, 151, 0.14);
            }
            .${CSS_PREFIX}-toast-warn .${CSS_PREFIX}-toast-tone {
                background: var(--warning);
                box-shadow: 0 0 0 6px rgba(255, 196, 107, 0.14);
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
                box-shadow: 0 0 0 4px rgba(255, 106, 77, 0.16);
            }
            @media (min-width: 760px) {
                .${CSS_PREFIX}-layout {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
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
                    width: min(100vw - 8px, 100%);
                    max-height: min(100vh - 8px, 100%);
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
                .${CSS_PREFIX}-glance-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
                .${CSS_PREFIX}-summary-support {
                    grid-template-columns: 1fr;
                }
                .${CSS_PREFIX}-metric-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
                .${CSS_PREFIX}-row {
                    grid-template-columns: 1fr;
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
                .${CSS_PREFIX}-layout {
                    padding: 12px 16px 20px;
                }
                .${CSS_PREFIX}-glance-grid,
                .${CSS_PREFIX}-metric-grid {
                    grid-template-columns: 1fr;
                }
                .${CSS_PREFIX}-btn-row,
                .${CSS_PREFIX}-url-group,
                .${CSS_PREFIX}-jump-nav {
                    display: grid;
                }
                .${CSS_PREFIX}-btn {
                    width: 100%;
                }
                .${CSS_PREFIX}-footer {
                    align-items: flex-start;
                }
            }
            @media (prefers-reduced-motion: reduce) {
                .${CSS_PREFIX}-overlay,
                .${CSS_PREFIX}-panel,
                .${CSS_PREFIX}-btn,
                .${CSS_PREFIX}-row,
                .${CSS_PREFIX}-toast,
                .${CSS_PREFIX}-toggle-track,
                .${CSS_PREFIX}-toggle-track::after {
                    transition: none !important;
                }
                .${CSS_PREFIX}-spinner {
                    animation-duration: 0.01ms;
                    animation-iteration-count: 1;
                }
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

        const logo = document.createElement('div');
        logo.className = `${CSS_PREFIX}-logo`;
        logo.textContent = 'YT';
        logo.setAttribute('aria-hidden', 'true');

        const brand = document.createElement('div');
        brand.className = `${CSS_PREFIX}-brand`;

        const eyebrow = document.createElement('div');
        eyebrow.className = `${CSS_PREFIX}-eyebrow`;
        eyebrow.textContent = 'Protection Workspace';

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
        description.textContent = 'Check live coverage, refresh your rule library, and tune blocking behavior without leaving YouTube.';

        brand.append(eyebrow, titleRow, description);
        headerLeft.append(logo, brand);

        const headerRight = document.createElement('div');
        headerRight.className = `${CSS_PREFIX}-header-right`;

        const statusPill = createPill('Protected', 'success');
        statusPill.id = `${CSS_PREFIX}-header-pill`;

        const closeBtn = document.createElement('button');
        closeBtn.className = `${CSS_PREFIX}-close`;
        closeBtn.id = `${CSS_PREFIX}-close-btn`;
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close the YoutubeAdblock Control Center');
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
        footerHint.textContent = `Changes save instantly. ${getControlCenterAccessHint()} Press Esc to close the panel.`;

        footerMeta.append(footerStatus, footerHint);

        const footerAside = document.createElement('div');
        footerAside.className = `${CSS_PREFIX}-footer-aside`;

        const statsEl = document.createElement('div');
        statsEl.className = `${CSS_PREFIX}-stats`;
        statsEl.id = `${CSS_PREFIX}-stats`;

        footerAside.append(statsEl);
        footer.append(footerMeta, footerAside);

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
        const layout = document.createElement('div');
        layout.className = `${CSS_PREFIX}-layout`;
        layout.append(
            createOverviewSection(),
            createFilterSection(),
            ...FEATURE_GROUPS.map(group => createFeatureSection(group)),
            createDiagnosticsSection()
        );
        content.appendChild(layout);
    }

    function createOverviewSection() {
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
        title.textContent = isEnabled() ? 'Protection Is Live' : 'Protection Is Paused';
        const body = document.createElement('p');
        body.className = `${CSS_PREFIX}-summary-text`;
        body.textContent = summary.description;
        const chips = document.createElement('div');
        chips.className = `${CSS_PREFIX}-chip-row`;
        chips.append(
            createPill(getFilterSourceLabel(), getFilterSourceTone()),
            createPill(`${formatNumber(getRuleCount())} Rules`, 'neutral'),
            createPill(`Synced ${formatTimestamp(state.lastFilterUpdate)}`, 'neutral'),
            createPill(`${getEnabledFeatureCount()}/${getFeatureCount()} Modules On`, 'neutral')
        );
        copy.append(title, body, chips);

        const control = document.createElement('div');
        control.className = `${CSS_PREFIX}-summary-control`;
        const controlCopy = document.createElement('div');
        controlCopy.className = `${CSS_PREFIX}-summary-control-copy`;
        const controlLabel = document.createElement('p');
        controlLabel.className = `${CSS_PREFIX}-summary-control-label`;
        controlLabel.textContent = 'Master Switch';
        const controlText = document.createElement('p');
        controlText.className = `${CSS_PREFIX}-summary-control-text`;
        controlText.id = `${CSS_PREFIX}-master-toggle-help`;
        controlText.textContent = isEnabled()
            ? 'Pause every blocking engine without uninstalling the script.'
            : 'Resume blocking instantly with your saved settings intact.';
        controlCopy.append(controlLabel, controlText);
        const { toggle, input } = createToggleControl(`${CSS_PREFIX}-master-toggle`, isEnabled(), checked => setScriptEnabled(checked), 'Toggle YoutubeAdblock protection');
        input.setAttribute('aria-describedby', controlText.id);
        control.append(controlCopy, toggle);
        hero.append(copy, control);

        const glanceGrid = document.createElement('div');
        glanceGrid.className = `${CSS_PREFIX}-glance-grid`;
        glanceGrid.append(
            createGlanceItem('Current Surface', getSiteLabel(), getSurfaceLabel(), 'info'),
            createGlanceItem(
                'Rule Library',
                isDefaultFilterUrl() ? 'Recommended Source' : 'Custom Source',
                getFilterSourceLabel(),
                getFilterSourceTone()
            ),
            createGlanceItem(
                'Last Sync',
                formatTimestamp(state.lastFilterUpdate),
                state.filterSource === 'remote'
                    ? 'Latest remote rules are active.'
                    : 'Refresh any time to look for a newer rule list.',
                getFilterSourceTone()
            ),
            createGlanceItem(
                IS_EXTENSION_BUILD ? 'Quick Shortcut' : 'Open From',
                getControlCenterAccessLabel(),
                IS_EXTENSION_BUILD
                    ? 'Reopen the Control Center from any YouTube tab.'
                    : 'The userscript menu stays available whenever you need it.',
                'neutral'
            )
        );

        const supportGrid = document.createElement('div');
        supportGrid.className = `${CSS_PREFIX}-summary-support`;

        const actionsCard = createDetailCard(
            'Quick Actions',
            'Refresh the active source or jump to the project page when you need release notes, issues, or updates.'
        );
        const actions = document.createElement('div');
        actions.className = `${CSS_PREFIX}-btn-row`;
        const quickRefresh = document.createElement('button');
        quickRefresh.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-primary`;
        quickRefresh.id = `${CSS_PREFIX}-quick-refresh`;
        quickRefresh.type = 'button';
        setButtonBusy(quickRefresh, state.filterSyncing, 'Refreshing…', 'Refresh Rules');
        quickRefresh.addEventListener('click', async () => {
            setButtonBusy(quickRefresh, true, 'Refreshing…', 'Refresh Rules');
            await fetchFilters(true);
            setButtonBusy(quickRefresh, false, 'Refreshing…', 'Refresh Rules');
        });
        const sourceBtn = createExternalLinkButton(PROJECT_URL, 'Project Page', `${CSS_PREFIX}-btn-ghost`);
        sourceBtn.id = `${CSS_PREFIX}-open-source`;
        actions.append(quickRefresh, sourceBtn);
        actionsCard.card.append(actions);

        const jumpCard = createDetailCard(
            'Jump To',
            'Move straight to the rule library, module groups, or recovery tools without hunting through the panel.'
        );
        const nav = document.createElement('nav');
        nav.className = `${CSS_PREFIX}-jump-nav`;
        nav.setAttribute('aria-label', 'Jump to a Control Center section');
        nav.append(
            createJumpButton('Rule Library', SECTION_IDS.rules),
            createJumpButton('Core Blocking', SECTION_IDS.core),
            createJumpButton('Anti-Detection', SECTION_IDS.anti),
            createJumpButton('Cleanup', SECTION_IDS.cleanup),
            createJumpButton('SponsorBlock', SECTION_IDS.sponsor),
            createJumpButton('Recovery', SECTION_IDS.diagnostics)
        );
        jumpCard.card.append(nav);
        supportGrid.append(actionsCard.card, jumpCard.card);

        const metrics = document.createElement('div');
        metrics.className = `${CSS_PREFIX}-metric-grid`;
        metrics.append(
            createMetric('Ads Blocked', `${CSS_PREFIX}-metric-blocked`),
            createMetric('Responses Pruned', `${CSS_PREFIX}-metric-pruned`),
            createMetric('SSAP Skips', `${CSS_PREFIX}-metric-ssap`),
            createMetric('Sponsor Skips', `${CSS_PREFIX}-metric-sponsor`),
            createMetric('Modules Enabled', `${CSS_PREFIX}-metric-features`)
        );
        surface.append(hero, glanceGrid, supportGrid, metrics);
        section.appendChild(surface);
        return section;
    }

    function createFilterSection() {
        const section = createSection(
            'Rule Library',
            'Choose the source that feeds cosmetic selectors and remote rule updates. YoutubeAdblock keeps your last working rules or the built-in fallback ready if a refresh fails.',
            createPill(getFilterSourceLabel(), getFilterSourceTone()),
            SECTION_IDS.rules,
            true
        );
        const surface = createSurface();
        const chips = document.createElement('div');
        chips.className = `${CSS_PREFIX}-chip-row`;
        chips.append(
            createPill(`Version ${state.filters?.version || '?'}`, 'neutral'),
            createPill(`Last Sync ${formatTimestamp(state.lastFilterUpdate)}`, 'neutral'),
            createPill(`${formatNumber(getRuleCount())} Active Rules`, 'neutral')
        );

        const field = document.createElement('div');
        field.className = `${CSS_PREFIX}-field`;
        const label = document.createElement('label');
        label.className = `${CSS_PREFIX}-field-label`;
        label.setAttribute('for', `${CSS_PREFIX}-url-input`);
        label.textContent = 'Rule List URL';
        const help = document.createElement('p');
        help.className = `${CSS_PREFIX}-field-help`;
        help.id = `${CSS_PREFIX}-url-help`;
        help.textContent = 'Point this at a raw EasyList or uBO-style source. Refreshing applies new rules without dropping your current protection.';
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
        input.placeholder = 'https://example.com/youtube-filters.txt…';
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
        setButtonBusy(refresh, state.filterSyncing, 'Refreshing…', 'Refresh Rules');
        refresh.addEventListener('click', async () => {
            const value = input.value.trim();
            if (!isValidHttpUrl(value)) {
                input.setAttribute('aria-invalid', 'true');
                input.focus();
                showToast('Enter a valid http or https URL before refreshing the Rule Library.', 'warn');
                return;
            }
            setSetting('filter_url', value);
            state.pendingFilterUrl = null; // committed
            setButtonBusy(refresh, true, 'Refreshing…', 'Refresh Rules');
            await fetchFilters(true);
            setButtonBusy(refresh, false, 'Refreshing…', 'Refresh Rules');
        });
        row.append(input, refresh);
        const actions = document.createElement('div');
        actions.className = `${CSS_PREFIX}-btn-row`;
        const reset = document.createElement('button');
        reset.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary ${CSS_PREFIX}-btn-small`;
        reset.id = `${CSS_PREFIX}-use-default-source`;
        reset.type = 'button';
        reset.textContent = 'Use Recommended Source';
        reset.addEventListener('click', () => {
            setSetting('filter_url', FILTER_URL_DEFAULT);
            state.pendingFilterUrl = null;
            input.value = FILTER_URL_DEFAULT;
            input.removeAttribute('aria-invalid');
            state.filterError = '';
            refreshSettingsUI(true);
            showToast('The recommended Rule Library is active again.', 'success');
        });
        actions.appendChild(reset);
        field.append(label, help, row, actions);

        let note;
        if (state.filterError) {
            note = createNote('Refresh Problem', state.filterError, 'warn');
        } else if (!isDefaultFilterUrl()) {
            note = createNote(
                'Custom Source Active',
                'You are using a custom list. Keep it raw text and refresh after you edit it so the new rules load.',
                'info'
            );
        } else if (state.filterSource === 'remote') {
            note = createNote(
                'Recommended Source Active',
                'The recommended remote list is live, and the built-in fallback stays ready if the source ever goes offline.',
                'success'
            );
        } else {
            note = createNote(
                'Fallback Ready',
                'Protection is still running with cached or built-in rules. Refresh when you want a fresher remote copy.',
                'info'
            );
        }

        surface.append(chips, field, note);
        section.appendChild(surface);
        return section;
    }

    function createFeatureSection(group) {
        const enabledCount = group.features.filter(feat => state.features[feat.key] !== false).length;
        const section = createSection(
            group.title,
            group.description,
            createPill(`${enabledCount}/${group.features.length} On`, getFeatureGroupTone(enabledCount, group.features.length)),
            group.sectionId
        );
        const surface = createSurface();
        const list = document.createElement('div');
        list.className = `${CSS_PREFIX}-toggle-list`;
        for (const feat of group.features) list.appendChild(createToggleRow(feat));
        surface.appendChild(list);
        section.appendChild(surface);
        return section;
    }

    function createDiagnosticsSection() {
        const section = createSection(
            'Diagnostics & Recovery',
            'Copy a clean snapshot for bug reports or reset local state without reinstalling the script.',
            null,
            SECTION_IDS.diagnostics,
            true
        );
        const surface = createSurface();
        const grid = document.createElement('div');
        grid.className = `${CSS_PREFIX}-summary-support`;

        const diagnosticsCard = createDetailCard(
            'Share a Snapshot',
            'Copy the active Rule Library, module states, counters, and environment details, then jump straight to the repo issue tracker with clean context.'
        );
        const diagnosticsActions = document.createElement('div');
        diagnosticsActions.className = `${CSS_PREFIX}-btn-row`;
        const copyBtn = document.createElement('button');
        copyBtn.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary`;
        copyBtn.id = `${CSS_PREFIX}-copy-btn`;
        copyBtn.type = 'button';
        copyBtn.textContent = 'Copy Diagnostics';
        copyBtn.addEventListener('click', copyDiagnosticsToClipboard);
        const issuesLink = createExternalLinkButton(ISSUES_URL, 'Open Issues', `${CSS_PREFIX}-btn-ghost`);
        diagnosticsActions.append(copyBtn, issuesLink);
        diagnosticsCard.card.append(diagnosticsActions);

        const recoveryCard = createDetailCard(
            'Reset Local State',
            'Reset counters or restore the recommended defaults without uninstalling the script. Your cached rule library stays ready.'
        );
        recoveryCard.card.append(createNote(
            'Local Only',
            'These actions change only local settings and counters. They do not remove the script or erase your current cached rules.',
            'info'
        ));
        const actions = document.createElement('div');
        actions.className = `${CSS_PREFIX}-btn-row`;
        const resetStats = document.createElement('button');
        resetStats.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary`;
        resetStats.id = `${CSS_PREFIX}-reset-counters`;
        resetStats.type = 'button';
        resetStats.textContent = 'Reset Counters';
        attachArmedAction(resetStats, {
            idleLabel: 'Reset Counters',
            armedLabel: 'Confirm Reset',
            onConfirm() {
                state.stats = { ...DEFAULT_STATS };
                saveStats();
                refreshSettingsUI();
                showToast('Session counters reset.', 'info');
            }
        });
        const restore = document.createElement('button');
        restore.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-danger`;
        restore.id = `${CSS_PREFIX}-restore-defaults`;
        restore.type = 'button';
        restore.textContent = 'Restore Defaults';
        attachArmedAction(restore, {
            idleLabel: 'Restore Defaults',
            armedLabel: 'Confirm Restore',
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
                showToast('Recommended defaults restored. Your current rules stayed in place.', 'success');
            }
        });
        actions.append(resetStats, restore);
        recoveryCard.card.append(actions);

        grid.append(diagnosticsCard.card, recoveryCard.card);
        surface.append(grid);
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

    function createSurface(extraClass = '') {
        const surface = document.createElement('div');
        surface.className = `${CSS_PREFIX}-surface${extraClass ? ` ${extraClass}` : ''}`;
        return surface;
    }

    function createMetric(label, id) {
        const metric = document.createElement('div');
        metric.className = `${CSS_PREFIX}-metric`;
        const labelEl = document.createElement('span');
        labelEl.className = `${CSS_PREFIX}-metric-label`;
        labelEl.textContent = label;
        const valueEl = document.createElement('span');
        valueEl.className = `${CSS_PREFIX}-metric-value`;
        valueEl.id = id;
        valueEl.textContent = '0';
        metric.append(labelEl, valueEl);
        return metric;
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

    function createDetailCard(title, description) {
        const card = document.createElement('div');
        card.className = `${CSS_PREFIX}-detail-card`;
        const titleEl = document.createElement('h3');
        titleEl.className = `${CSS_PREFIX}-detail-title`;
        titleEl.textContent = title;
        card.appendChild(titleEl);
        if (description) {
            const descEl = document.createElement('p');
            descEl.className = `${CSS_PREFIX}-detail-text`;
            descEl.textContent = description;
            card.appendChild(descEl);
        }
        return { card, titleEl };
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
        row.dataset.enabled = String(state.features[feature.key] !== false);
        const copy = document.createElement('div');
        const line = document.createElement('div');
        line.className = `${CSS_PREFIX}-row-label-line`;
        const label = document.createElement('span');
        label.className = `${CSS_PREFIX}-row-label`;
        label.textContent = feature.label;
        line.append(label, createPill(state.features[feature.key] !== false ? 'On' : 'Off', state.features[feature.key] !== false ? 'success' : 'neutral'));
        const desc = document.createElement('p');
        desc.className = `${CSS_PREFIX}-row-desc`;
        const descId = `${CSS_PREFIX}-desc-${feature.key}`;
        desc.id = descId;
        desc.textContent = feature.desc;
        copy.append(line, desc);
        const { toggle, input } = createToggleControl(`${CSS_PREFIX}-toggle-${feature.key}`, state.features[feature.key] !== false, checked => setFeatureEnabled(feature.key, checked, feature.label), `Toggle ${feature.label}`);
        // Tie the switch to the visible description so screen-reader users
        // hear what the toggle does, not just its short label.
        input.setAttribute('aria-describedby', descId);
        row.append(copy, toggle);
        return row;
    }

    function updateStatsDisplay() {
        const liveValues = {
            [`${CSS_PREFIX}-metric-blocked`]: formatNumber(state.stats.blocked),
            [`${CSS_PREFIX}-metric-pruned`]: formatNumber(state.stats.pruned),
            [`${CSS_PREFIX}-metric-ssap`]: formatNumber(state.stats.ssapSkipped),
            [`${CSS_PREFIX}-metric-sponsor`]: formatNumber(state.stats.sponsorSkipped),
            [`${CSS_PREFIX}-metric-features`]: `${getEnabledFeatureCount()}/${getFeatureCount()}`
        };
        for (const [id, value] of Object.entries(liveValues)) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        }

        const container = document.getElementById(`${CSS_PREFIX}-stats`);
        if (!container) return;
        container.textContent = '';
        const stats = [
            ['Blocked', state.stats.blocked],
            ['Pruned', state.stats.pruned],
            ['SSAP', state.stats.ssapSkipped],
            ['Sponsor', state.stats.sponsorSkipped]
        ];
        for (const [label, value] of stats) {
            const span = document.createElement('span');
            span.className = `${CSS_PREFIX}-stat`;
            span.textContent = `${label} `;
            const b = document.createElement('b');
            b.textContent = formatNumber(value);
            span.appendChild(b);
            container.appendChild(span);
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
                showToast(`${idleLabel} is armed. Click again to confirm.`, 'warn');
                timer = setTimeout(reset, timeout);
                return;
            }

            reset();
            onConfirm();
        });
    }

    function setFeatureEnabled(key, checked, label) {
        const overrides = getSetting('feature_overrides', {});
        overrides[key] = checked;
        setSetting('feature_overrides', overrides);
        state.features[key] = checked;
        updateCosmeticCSS();
        refreshSettingsUI(true);
        showToast(`${label} ${checked ? 'enabled' : 'disabled'}.`, checked ? 'success' : 'warn');
    }

    function setScriptEnabled(enabled) {
        state.enabled = enabled;
        setSetting('enabled', enabled);
        updateCosmeticCSS();
        refreshSettingsUI(true);
        // Refresh menu command labels so Pause/Resume reflects the new state.
        try { registerMenuCommands(); } catch (e) { /* ignore */ }
        showToast(enabled ? 'Protection resumed across every engine.' : 'Protection paused. YoutubeAdblock stays installed and ready to resume.', enabled ? 'success' : 'warn');
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
                ? 'Diagnostics copied. You can paste them into a bug report or note.'
                : 'Clipboard access was unavailable, so diagnostics could not be copied.',
            success ? 'success' : 'error'
        );
        return success;
    }

    function scrollSectionIntoView(sectionId) {
        const section = document.getElementById(sectionId);
        if (!section) return;
        try {
            section.scrollIntoView({
                behavior: prefersReducedMotion() ? 'auto' : 'smooth',
                block: 'start'
            });
        } catch (e) {
            section.scrollIntoView();
        }
    }

    function buildDiagnosticsReport() {
        const features = normalizeFeatures(state.features);
        const disabledFeatures = Object.entries(features)
            .filter(([, enabled]) => !enabled)
            .map(([key]) => key)
            .join(', ') || 'none';
        const enabledFeatures = Object.entries(features)
            .filter(([, enabled]) => enabled)
            .map(([key]) => key)
            .join(', ') || 'none';
        const trappedRoots = state.trappedRoots && state.trappedRoots.size
            ? [...state.trappedRoots].join(', ')
            : 'none';
        const uaHint = typeof navigator !== 'undefined' ? (navigator.userAgent || 'unknown') : 'unknown';
        return [
            `${SCRIPT_NAME} v${SCRIPT_VERSION}`,
            `Captured: ${new Date().toISOString()}`,
            `Site: ${location.hostname}${location.pathname}`,
            `Surface: ${getSiteLabel()} / ${getSurfaceLabel()}`,
            `Build: ${IS_EXTENSION_BUILD ? 'extension' : 'userscript'}`,
            `UA: ${uaHint}`,
            `Protection enabled: ${isEnabled()}`,
            `Filter source: ${getFilterSourceLabel()}`,
            `Filter URL: ${resolveFilterUrl()}`,
            `Filter version: ${state.filters?.version || 'unknown'}`,
            `Last sync: ${state.lastFilterUpdate ? new Date(state.lastFilterUpdate).toISOString() : 'never'}`,
            `Last error: ${state.filterError || 'none'}`,
            `Rules active: ${getRuleCount()}`,
            `Prune keys: ${(state.filters?.pruneKeys || []).length}`,
            `Cosmetic selectors: ${(state.filters?.cosmeticSelectors || []).length}`,
            `Intercept patterns: ${(state.filters?.interceptPatterns || []).join(' · ') || 'none'}`,
            `Trapped roots: ${trappedRoots}`,
            `Stats: blocked=${state.stats.blocked}, pruned=${state.stats.pruned}, ssapSkipped=${state.stats.ssapSkipped}, sponsorSkipped=${state.stats.sponsorSkipped}`,
            `Enabled features: ${enabledFeatures}`,
            `Disabled features: ${disabledFeatures}`
        ].join('\n');
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
        // Build lazily: menu-triggered opens that happen before DOMContentLoaded
        // previously no-oped. If the body is ready, build on demand.
        if (show && !state.overlayEl && document.body) {
            try { buildSettingsPanel(); } catch (e) { /* stays closed */ }
        }
        if (!state.overlayEl) {
            if (show) {
                showToast('Control Center is still loading. Try again in a moment.', 'info');
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
            state.lastFocusedEl?.focus?.();
        }
    }

    /* =========================================================================
     * INIT
     * ===================================================================== */

    // Phase 1: Load config and install proxies ASAP (document-start)
    loadState();
    installProxies();
    injectSettingsCSS();

    // Phase 2: Background filter fetch
    fetchFilters();

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

        const h1 = safeRegisterMenu(`${SCRIPT_NAME}: Open Control Center`, () => toggleSettings(true));
        const h2 = safeRegisterMenu(
            `${SCRIPT_NAME}: ${isEnabled() ? 'Pause Protection' : 'Resume Protection'}`,
            () => setScriptEnabled(!isEnabled())
        );
        const h3 = safeRegisterMenu(`${SCRIPT_NAME}: Refresh Rules`, () => { fetchFilters(true); });
        const h4 = safeRegisterMenu(`${SCRIPT_NAME}: Copy Diagnostics`, copyDiagnosticsToClipboard);
        for (const h of [h1, h2, h3, h4]) if (h != null) state.menuHandles.push(h);
    }

    // Phase 3: DOM-dependent setup
    function onDOMReady() {
        buildSettingsPanel();

        if (!getSetting('welcomed', false)) {
            setSetting('welcomed', true);
            showToast(`YoutubeAdblock is active. ${getControlCenterAccessHint()}`, 'success');
        }

        // Stats counter update interval (panel only repaints when open)
        registerInterval(() => {
            if (state.settingsOpen) updateStatsDisplay();
        }, STATS_UI_REFRESH_MS);

        // SPA navigation handling
        document.addEventListener('yt-navigate-finish', () => {
            updateCosmeticCSS();
        });
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
