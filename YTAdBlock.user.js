// ==UserScript==
// @name         YTAdBlock
// @namespace    https://github.com/SysAdminDoc
// @version      0.0.2
// @description  YouTube Ad Blocker with remote filter list support
// @author       SysAdminDoc
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://music.youtube.com/*
// @match        https://tv.youtube.com/*
// @match        https://www.youtube-nocookie.com/*
// @match        https://youtubekids.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @connect      raw.githubusercontent.com
// @connect      github.com
// @homepageURL  https://github.com/SysAdminDoc/youtube-adblock
// @supportURL   https://github.com/SysAdminDoc/youtube-adblock/issues
// @downloadURL  https://raw.githubusercontent.com/SysAdminDoc/youtubeadblock/main/YTAdBlock.user.js
// @updateURL    https://raw.githubusercontent.com/SysAdminDoc/youtubeadblock/main/YTAdBlock.user.js
// ==/UserScript==

(function() {
    'use strict';

    /* =========================================================================
     * CONSTANTS & CONFIG
     * ===================================================================== */

    const SCRIPT_NAME = 'YTAdBlock';
    const SCRIPT_VERSION = '0.0.2';
    const FILTER_URL_DEFAULT = 'https://raw.githubusercontent.com/SysAdminDoc/youtube-adblock/main/yt-adblock-filters.json';
    const FILTER_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
    const CSS_PREFIX = 'ytab';

    /* =========================================================================
     * DEFAULT FILTERS (fallback when remote unavailable)
     * ===================================================================== */

    const DEFAULT_FILTERS = {
        version: '0.0.1',
        updated: '2026-02-12',
        pruneKeys: [
            'adPlacements', 'adSlots', 'playerAds',
            'playerResponse.adPlacements', 'playerResponse.adSlots', 'playerResponse.playerAds'
        ],
        setUndefined: [
            'ytInitialPlayerResponse.playerAds',
            'ytInitialPlayerResponse.adPlacements',
            'ytInitialPlayerResponse.adSlots',
            'ytInitialPlayerResponse.adBreakHeartbeatParams',
            'playerResponse.adPlacements'
        ],
        replaceKeys: { adPlacements: 'no_ads', adSlots: 'no_ads', playerAds: 'no_ads' },
        interceptPatterns: [
            '/youtubei/v1/player', '/youtubei/v1/get_watch',
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
            cosmeticHiding: true, upsellBlock: true, requestBodyModify: true
        },
        shortsAdPrune: [
            'entries.[-].command.reelWatchEndpoint.adClientParams.isAd',
            'reelWatchSequenceResponse.entries.[-].command.reelWatchEndpoint.adClientParams.isAd'
        ]
    };

    /* =========================================================================
     * STATE
     * ===================================================================== */

    const state = {
        filters: null,
        features: {},
        stats: { blocked: 0, pruned: 0, hidden: 0, ssapSkipped: 0 },
        settingsOpen: false,
        lastFilterUpdate: 0,
        filterSource: 'built-in',
        proxiesInstalled: false,
        cosmeticStyleEl: null,
        originals: {}
    };

    /* =========================================================================
     * STORAGE HELPERS
     * ===================================================================== */

    function getSetting(key, def) { return GM_getValue(`${CSS_PREFIX}_${key}`, def); }
    function setSetting(key, val) { GM_setValue(`${CSS_PREFIX}_${key}`, val); }

    function loadState() {
        const cached = getSetting('filters_cache', null);
        const cacheTime = getSetting('filters_cache_time', 0);
        const featureOverrides = getSetting('feature_overrides', {});
        state.stats = getSetting('stats', state.stats);
        state.lastFilterUpdate = cacheTime;

        if (cached && (Date.now() - cacheTime < FILTER_CACHE_TTL)) {
            state.filters = cached;
            state.filterSource = 'cached';
        } else {
            state.filters = DEFAULT_FILTERS;
            state.filterSource = 'built-in';
        }

        // Merge feature defaults with user overrides
        state.features = { ...state.filters.features };
        for (const [k, v] of Object.entries(featureOverrides)) {
            if (k in state.features) state.features[k] = v;
        }
    }

    function saveStats() { setSetting('stats', state.stats); }

    /* =========================================================================
     * FILTER FETCHER
     * ===================================================================== */

    function fetchFilters(force = false) {
        return new Promise((resolve) => {
            const url = getSetting('filter_url', FILTER_URL_DEFAULT);
            if (!force && state.filterSource === 'cached') return resolve(state.filters);

            GM_xmlhttpRequest({
                method: 'GET',
                url: url + '?_=' + Date.now(),
                timeout: 10000,
                onload(resp) {
                    try {
                        const data = JSON.parse(resp.responseText);
                        if (data.pruneKeys && data.features) {
                            state.filters = data;
                            state.filterSource = 'remote';
                            state.lastFilterUpdate = Date.now();
                            setSetting('filters_cache', data);
                            setSetting('filters_cache_time', Date.now());
                            // Re-merge features with overrides
                            const overrides = getSetting('feature_overrides', {});
                            state.features = { ...data.features };
                            for (const [k, v] of Object.entries(overrides)) {
                                if (k in state.features) state.features[k] = v;
                            }
                            updateCosmeticCSS();
                            resolve(data);
                            showToast(`Filters updated to v${data.version}`, 'success');
                        } else {
                            throw new Error('Invalid filter format');
                        }
                    } catch (e) {
                        console.warn(`[${SCRIPT_NAME}] Filter parse error:`, e);
                        resolve(state.filters);
                        showToast('Filter update failed: invalid data', 'error');
                    }
                },
                onerror() {
                    resolve(state.filters);
                    showToast('Filter update failed: network error', 'error');
                },
                ontimeout() {
                    resolve(state.filters);
                    showToast('Filter update failed: timeout', 'error');
                }
            });
        });
    }

    /* =========================================================================
     * UTILITY: Deep key access / pruning
     * ===================================================================== */

    function getNestedValue(obj, path) {
        const keys = path.split('.');
        let current = obj;
        for (const key of keys) {
            if (current == null || typeof current !== 'object') return undefined;
            current = current[key];
        }
        return current;
    }

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

    function pruneObject(obj) {
        if (!obj || typeof obj !== 'object') return false;
        let pruned = false;
        const keys = state.filters.pruneKeys || DEFAULT_FILTERS.pruneKeys;
        for (const keyPath of keys) {
            if (deleteNestedKey(obj, keyPath)) pruned = true;
        }
        // Shorts ad pruning
        if (state.features.shortsAdBlock && obj.entries && Array.isArray(obj.entries)) {
            obj.entries = obj.entries.filter(entry => {
                const isAd = entry?.command?.reelWatchEndpoint?.adClientParams?.isAd;
                if (isAd) { pruned = true; return false; }
                return true;
            });
        }
        if (pruned) { state.stats.pruned++; saveStats(); }
        return pruned;
    }

    function matchesInterceptPattern(url) {
        if (!url) return false;
        const patterns = state.filters?.interceptPatterns || DEFAULT_FILTERS.interceptPatterns;
        return patterns.some(p => url.includes(p));
    }

    function replaceAdKeys(text) {
        if (typeof text !== 'string') return text;
        let modified = text;
        const rk = state.filters?.replaceKeys || DEFAULT_FILTERS.replaceKeys;
        for (const [key, replacement] of Object.entries(rk)) {
            const regex = new RegExp(`"${key}"`, 'g');
            modified = modified.replace(regex, `"${replacement}"`);
        }
        return modified;
    }

    /* =========================================================================
     * ENGINE: JSON.parse Proxy
     * ===================================================================== */

    function safeOverride(obj, prop, newValue) {
        try {
            obj[prop] = newValue;
            if (obj[prop] === newValue) return true;
        } catch (e) { /* direct assign failed */ }
        try {
            Object.defineProperty(obj, prop, {
                value: newValue, writable: true, configurable: true, enumerable: true
            });
            return true;
        } catch (e) { /* defineProperty failed */ }
        try {
            // Last resort: delete and re-add
            delete obj[prop];
            Object.defineProperty(obj, prop, {
                value: newValue, writable: true, configurable: true, enumerable: true
            });
            return true;
        } catch (e) {
            console.warn(`[${SCRIPT_NAME}] Failed to override ${prop}`);
            return false;
        }
    }

    function installJSONParseProxy() {
        if (!state.features.jsonParsePrune) return;

        const original = JSON.parse;
        state.originals.jsonParse = original;

        const proxied = new Proxy(original, {
            apply(target, thisArg, args) {
                const result = Reflect.apply(target, thisArg, args);
                try {
                    if (result && typeof result === 'object') {
                        if (pruneObject(result)) {
                            state.stats.blocked++;
                            saveStats();
                        }
                    }
                } catch (e) { /* fail silently */ }
                return result;
            }
        });

        safeOverride(JSON, 'parse', proxied);
    }

    /* =========================================================================
     * ENGINE: fetch() Proxy
     * ===================================================================== */

    function installFetchProxy() {
        if (!state.features.fetchIntercept) return;

        const originalFetch = window.fetch;
        state.originals.fetch = originalFetch;

        const proxiedFetch = new Proxy(originalFetch, {
            apply(target, thisArg, args) {
                const request = args[0];
                let url = '';
                if (typeof request === 'string') url = request;
                else if (request instanceof Request) url = request.url;

                // Modify outbound request body (clientScreen spoof)
                if (state.features.clientScreenSpoof && state.features.requestBodyModify) {
                    try {
                        if (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/get_watch')) {
                            const init = args[1];
                            if (init && init.body && typeof init.body === 'string') {
                                const bodyObj = JSON.parse(init.body);
                                if (bodyObj?.context?.client?.clientName === 'WEB') {
                                    bodyObj.context.client.clientScreen = 'CHANNEL';
                                    args[1] = { ...init, body: JSON.stringify(bodyObj) };
                                }
                            }
                        }
                    } catch (e) { /* fail silently */ }
                }

                if (!matchesInterceptPattern(url)) {
                    return Reflect.apply(target, thisArg, args);
                }

                return Reflect.apply(target, thisArg, args).then(response => {
                    if (!response || !response.ok) return response;
                    return response.clone().text().then(text => {
                        try {
                            const modified = replaceAdKeys(text);
                            const obj = JSON.parse(modified);
                            pruneObject(obj);
                            state.stats.blocked++;
                            saveStats();
                            return new Response(JSON.stringify(obj), {
                                status: response.status,
                                statusText: response.statusText,
                                headers: response.headers
                            });
                        } catch (e) {
                            return response;
                        }
                    }).catch(() => response);
                });
            }
        });

        safeOverride(window, 'fetch', proxiedFetch);
    }

    /* =========================================================================
     * ENGINE: XMLHttpRequest Proxy
     * ===================================================================== */

    function installXHRProxy() {
        if (!state.features.xhrIntercept) return;

        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;
        state.originals.xhrOpen = originalOpen;
        state.originals.xhrSend = originalSend;

        const proxiedOpen = function(method, url, ...rest) {
            this._ytab_url = url;

            // Modify outbound request body interception point
            if (state.features.clientScreenSpoof && state.features.requestBodyModify) {
                this._ytab_shouldModify = (
                    url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/get_watch')
                );
            }

            return originalOpen.call(this, method, url, ...rest);
        };

        const proxiedSend = function(body) {
            // Modify outbound request body
            if (this._ytab_shouldModify && body && typeof body === 'string') {
                try {
                    const bodyObj = JSON.parse(body);
                    if (bodyObj?.context?.client?.clientName === 'WEB') {
                        bodyObj.context.client.clientScreen = 'CHANNEL';
                        body = JSON.stringify(bodyObj);
                    }
                } catch (e) { /* fail silently */ }
            }

            if (!matchesInterceptPattern(this._ytab_url)) {
                return originalSend.call(this, body);
            }

            const xhr = this;
            const origOnReadyStateChange = xhr.onreadystatechange;
            const origOnLoad = xhr.onload;

            function interceptResponse() {
                if (xhr.readyState !== 4) return;
                try {
                    const text = xhr.responseText;
                    if (!text) return;
                    const modified = replaceAdKeys(text);
                    const obj = JSON.parse(modified);
                    pruneObject(obj);
                    const newText = JSON.stringify(obj);

                    Object.defineProperty(xhr, 'responseText', { value: newText, writable: false, configurable: true });
                    Object.defineProperty(xhr, 'response', { value: newText, writable: false, configurable: true });

                    state.stats.blocked++;
                    saveStats();
                } catch (e) { /* fail silently */ }
            }

            if (origOnReadyStateChange) {
                xhr.onreadystatechange = function(ev) {
                    interceptResponse();
                    return origOnReadyStateChange.call(this, ev);
                };
            }

            xhr.addEventListener('readystatechange', interceptResponse);

            return originalSend.call(this, body);
        };

        safeOverride(XMLHttpRequest.prototype, 'open', proxiedOpen);
        safeOverride(XMLHttpRequest.prototype, 'send', proxiedSend);
    }

    /* =========================================================================
     * ENGINE: Object.defineProperty traps (initial page response)
     * ===================================================================== */

    function installPropertyTraps() {
        if (!state.features.setUndefinedTraps) return;

        const paths = state.filters?.setUndefined || DEFAULT_FILTERS.setUndefined;

        for (const path of paths) {
            try {
                const parts = path.split('.');
                const rootName = parts[0];

                // Watch for the root object to appear on window
                let _value = window[rootName];
                Object.defineProperty(window, rootName, {
                    get() { return _value; },
                    set(newVal) {
                        if (newVal && typeof newVal === 'object') {
                            const subPath = parts.slice(1);
                            let target = newVal;
                            for (let i = 0; i < subPath.length - 1; i++) {
                                if (target && typeof target === 'object' && subPath[i] in target) {
                                    target = target[subPath[i]];
                                } else {
                                    target = null;
                                    break;
                                }
                            }
                            if (target && typeof target === 'object') {
                                const lastKey = subPath[subPath.length - 1];
                                if (lastKey in target) {
                                    delete target[lastKey];
                                    state.stats.pruned++;
                                    saveStats();
                                }
                            }
                        }
                        _value = newVal;
                    },
                    configurable: true,
                    enumerable: true
                });
            } catch (e) { /* some properties may already be defined */ }
        }
    }

    /* =========================================================================
     * ENGINE: Promise.prototype.then Proxy (abnormality detection bypass)
     * ===================================================================== */

    function installAbnormalityBypass() {
        if (!state.features.abnormalityBypass) return;

        const originalThen = Promise.prototype.then;
        state.originals.promiseThen = originalThen;

        const proxiedThen = new Proxy(originalThen, {
            apply(target, thisArg, args) {
                const onFulfilled = args[0];
                if (typeof onFulfilled === 'function') {
                    try {
                        const fnStr = onFulfilled.toString();
                        if (fnStr.includes('onAbnormalityDetected')) {
                            args[0] = function() {};
                            state.stats.blocked++;
                            saveStats();
                        }
                    } catch (e) { /* fail silently */ }
                }
                return Reflect.apply(target, thisArg, args);
            }
        });

        safeOverride(Promise.prototype, 'then', proxiedThen);
    }

    /* =========================================================================
     * ENGINE: DOM Bypass Prevention
     * ===================================================================== */

    function installDOMBypassPrevention() {
        if (!state.features.domBypassPrevention) return;

        const originalAppendChild = Node.prototype.appendChild;
        state.originals.appendChild = originalAppendChild;

        const proxiedAppendChild = new Proxy(originalAppendChild, {
            apply(target, thisArg, args) {
                const node = args[0];
                try {
                    if (node instanceof HTMLIFrameElement && node.src === 'about:blank') {
                        const result = Reflect.apply(target, thisArg, args);
                        // Propagate our proxied fetch/JSON.parse into the iframe
                        if (node.contentWindow) {
                            node.contentWindow.fetch = window.fetch;
                            node.contentWindow.Request = window.Request;
                            node.contentWindow.JSON.parse = JSON.parse;
                        }
                        return result;
                    }
                    // Block script injection that resets fetch
                    if (node instanceof HTMLScriptElement) {
                        const text = node.textContent || '';
                        if (text.includes('window,"fetch"') || text.includes("window,'fetch'")) {
                            // Replace with no-op
                            node.textContent = '/* blocked by YTAdBlock */';
                        }
                    }
                } catch (e) { /* fail silently */ }
                return Reflect.apply(target, thisArg, args);
            }
        });

        safeOverride(Node.prototype, 'appendChild', proxiedAppendChild);
    }

    /* =========================================================================
     * ENGINE: SSAP Auto-Skip
     * ===================================================================== */

    function installSSAPAutoSkip() {
        if (!state.features.ssapAutoSkip) return;

        let ssapObserver = null;

        function checkAndSkipSSAP() {
            const player = document.getElementById('movie_player');
            if (!player) return;
            try {
                const stats = player.getStatsForNerds?.();
                const debugInfo = stats?.debug_info || '';
                if (debugInfo.startsWith('SSAP, AD') || debugInfo.startsWith('SSAP,AD')) {
                    const progress = player.getProgressState?.();
                    if (progress && progress.duration > 0) {
                        if (progress.loaded < progress.duration || progress.duration - progress.current > 1) {
                            player.seekTo?.(progress.duration);
                            state.stats.ssapSkipped++;
                            saveStats();
                        }
                    }
                }
            } catch (e) { /* fail silently */ }
        }

        function startSSAPMonitor() {
            checkAndSkipSSAP();
            if (ssapObserver) ssapObserver.disconnect();
            ssapObserver = new MutationObserver(() => checkAndSkipSSAP());
            ssapObserver.observe(document, { childList: true, subtree: true });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startSSAPMonitor);
        } else {
            startSSAPMonitor();
        }
    }

    /* =========================================================================
     * ENGINE: Anti-Detection Timer Neutralization
     * ===================================================================== */

    function installTimerNeutralization() {
        const originalSetTimeout = window.setTimeout;
        state.originals.setTimeout = originalSetTimeout;

        const proxiedSetTimeout = new Proxy(originalSetTimeout, {
            apply(target, thisArg, args) {
                const [fn, delay] = args;
                // YouTube uses a ~17 second timer for ad playback detection
                if (typeof fn === 'function' && delay >= 16000 && delay <= 18000) {
                    try {
                        const fnStr = fn.toString();
                        if (fnStr.includes('[native code]') || fnStr.length < 50) {
                            args[1] = 1; // Fire immediately to avoid detection
                        }
                    } catch (e) { /* fail silently */ }
                }
                return Reflect.apply(target, thisArg, args);
            }
        });

        safeOverride(window, 'setTimeout', proxiedSetTimeout);
    }

    /* =========================================================================
     * ENGINE: Cosmetic Filtering
     * ===================================================================== */

    function updateCosmeticCSS() {
        if (!state.features.cosmeticHiding) return;
        const selectors = state.filters?.cosmeticSelectors || DEFAULT_FILTERS.cosmeticSelectors;
        const upsellSelectors = (state.features.upsellBlock)
            ? (state.filters?.upsellSelectors || DEFAULT_FILTERS.upsellSelectors)
            : [];
        const allSelectors = [...selectors, ...upsellSelectors];
        if (!allSelectors.length) return;

        const css = allSelectors.map(s => `${s} { display: none !important; }`).join('\n');

        if (state.cosmeticStyleEl) {
            state.cosmeticStyleEl.textContent = css;
        } else if (typeof GM_addStyle === 'function') {
            state.cosmeticStyleEl = GM_addStyle(css);
        } else {
            const style = document.createElement('style');
            style.id = `${CSS_PREFIX}-cosmetic`;
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
            state.cosmeticStyleEl = style;
        }
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
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => showToast(msg, type));
            return;
        }
        const colors = {
            info: { bg: 'rgba(30,136,229,0.95)', icon: '\u2139' },
            success: { bg: 'rgba(46,125,50,0.95)', icon: '\u2714' },
            error: { bg: 'rgba(198,40,40,0.95)', icon: '\u2718' },
            warn: { bg: 'rgba(245,124,0,0.95)', icon: '\u26A0' }
        };
        const c = colors[type] || colors.info;
        const toast = document.createElement('div');
        toast.className = `${CSS_PREFIX}-toast`;
        Object.assign(toast.style, {
            position: 'fixed', bottom: '24px', right: '24px',
            background: c.bg, color: '#fff',
            padding: '12px 20px', borderRadius: '10px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: '2147483647',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: '13px', fontWeight: '500',
            display: 'flex', alignItems: 'center', gap: '8px',
            opacity: '0', transform: 'translateY(12px)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.15)',
            maxWidth: '360px', lineHeight: '1.4',
            pointerEvents: 'none'
        });
        toast.innerHTML = `<span style="font-size:16px">${c.icon}</span><span>${msg}</span>`;
        document.body.appendChild(toast);
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(12px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    /* =========================================================================
     * UI: Settings Panel
     * ===================================================================== */

    function injectSettingsCSS() {
        const css = `
            /* ---- Anti-FOUC ---- */
            body:not(.${CSS_PREFIX}-ready) .${CSS_PREFIX}-overlay { display: none !important; }

            /* ---- Overlay ---- */
            .${CSS_PREFIX}-overlay {
                position: fixed; inset: 0; z-index: 2147483646;
                background: rgba(0,0,0,0.6);
                backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
                display: flex; align-items: center; justify-content: center;
                opacity: 0; transition: opacity 0.25s ease;
                pointer-events: none;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            .${CSS_PREFIX}-overlay.${CSS_PREFIX}-active {
                opacity: 1; pointer-events: auto;
            }

            /* ---- Panel ---- */
            .${CSS_PREFIX}-panel {
                --panel-bg: rgba(18,18,24,0.96);
                --panel-border: rgba(255,255,255,0.08);
                --panel-hover: rgba(255,255,255,0.04);
                --accent: #4fc3f7;
                --accent-dim: rgba(79,195,247,0.15);
                --text-primary: #e8eaed;
                --text-secondary: #9aa0a6;
                --text-muted: #5f6368;
                --danger: #ef5350;
                --success: #66bb6a;
                --toggle-off: #5f6368;
                --toggle-on: var(--accent);
                --radius: 12px;

                background: var(--panel-bg);
                border: 1px solid var(--panel-border);
                border-radius: var(--radius);
                width: 520px; max-width: 94vw; max-height: 85vh;
                box-shadow: 0 24px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05);
                color: var(--text-primary);
                display: flex; flex-direction: column;
                overflow: hidden;
                transform: scale(0.95); transition: transform 0.25s ease;
            }
            .${CSS_PREFIX}-overlay.${CSS_PREFIX}-active .${CSS_PREFIX}-panel {
                transform: scale(1);
            }

            /* ---- Header ---- */
            .${CSS_PREFIX}-header {
                display: flex; align-items: center; justify-content: space-between;
                padding: 18px 22px 14px;
                border-bottom: 1px solid var(--panel-border);
                flex-shrink: 0;
            }
            .${CSS_PREFIX}-header-left {
                display: flex; align-items: center; gap: 10px;
            }
            .${CSS_PREFIX}-logo {
                width: 28px; height: 28px; border-radius: 8px;
                background: linear-gradient(135deg, var(--accent), #1565c0);
                display: flex; align-items: center; justify-content: center;
                font-size: 14px; font-weight: 700; color: #fff;
                box-shadow: 0 2px 8px rgba(79,195,247,0.3);
            }
            .${CSS_PREFIX}-title {
                font-size: 16px; font-weight: 700; color: var(--text-primary);
                letter-spacing: -0.3px;
            }
            .${CSS_PREFIX}-version {
                font-size: 11px; color: var(--text-muted); font-weight: 500;
                background: var(--panel-hover); padding: 2px 7px; border-radius: 4px;
                margin-left: 4px;
            }
            .${CSS_PREFIX}-close {
                width: 30px; height: 30px; border-radius: 8px;
                background: transparent; border: none; color: var(--text-secondary);
                cursor: pointer; display: flex; align-items: center; justify-content: center;
                font-size: 18px; transition: all 0.15s;
            }
            .${CSS_PREFIX}-close:hover {
                background: rgba(255,255,255,0.08); color: var(--text-primary);
            }

            /* ---- Content ---- */
            .${CSS_PREFIX}-content {
                overflow-y: auto; flex: 1;
                padding: 6px 0;
                scrollbar-width: thin;
                scrollbar-color: rgba(255,255,255,0.1) transparent;
            }
            .${CSS_PREFIX}-content::-webkit-scrollbar { width: 6px; }
            .${CSS_PREFIX}-content::-webkit-scrollbar-track { background: transparent; }
            .${CSS_PREFIX}-content::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.12); border-radius: 3px;
            }

            /* ---- Section ---- */
            .${CSS_PREFIX}-section {
                padding: 10px 22px 6px;
            }
            .${CSS_PREFIX}-section-title {
                font-size: 11px; font-weight: 600; text-transform: uppercase;
                letter-spacing: 0.8px; color: var(--text-muted);
                margin-bottom: 8px;
            }

            /* ---- Toggle Row ---- */
            .${CSS_PREFIX}-row {
                display: flex; align-items: center; justify-content: space-between;
                padding: 9px 12px; border-radius: 8px; gap: 12px;
                transition: background 0.15s;
                cursor: pointer;
            }
            .${CSS_PREFIX}-row:hover { background: var(--panel-hover); }
            .${CSS_PREFIX}-row-label {
                font-size: 13px; font-weight: 500; color: var(--text-primary);
                flex: 1;
            }
            .${CSS_PREFIX}-row-desc {
                font-size: 11px; color: var(--text-secondary); margin-top: 2px;
                line-height: 1.35;
            }

            /* ---- Toggle Switch ---- */
            .${CSS_PREFIX}-toggle {
                position: relative; width: 38px; height: 22px; flex-shrink: 0;
            }
            .${CSS_PREFIX}-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
            .${CSS_PREFIX}-toggle-track {
                position: absolute; inset: 0; border-radius: 11px;
                background: var(--toggle-off); transition: background 0.2s;
                cursor: pointer;
            }
            .${CSS_PREFIX}-toggle-track::after {
                content: ''; position: absolute;
                top: 3px; left: 3px; width: 16px; height: 16px;
                border-radius: 50%; background: #fff;
                transition: transform 0.2s ease;
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            }
            .${CSS_PREFIX}-toggle input:checked + .${CSS_PREFIX}-toggle-track {
                background: var(--toggle-on);
            }
            .${CSS_PREFIX}-toggle input:checked + .${CSS_PREFIX}-toggle-track::after {
                transform: translateX(16px);
            }

            /* ---- Filter Info ---- */
            .${CSS_PREFIX}-filter-info {
                display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
                padding: 10px 12px; border-radius: 8px;
                background: rgba(255,255,255,0.025);
                border: 1px solid var(--panel-border);
                margin-bottom: 10px;
            }
            .${CSS_PREFIX}-filter-stat {
                display: flex; flex-direction: column; gap: 2px;
            }
            .${CSS_PREFIX}-filter-stat-label {
                font-size: 10px; font-weight: 600; text-transform: uppercase;
                letter-spacing: 0.5px; color: var(--text-muted);
            }
            .${CSS_PREFIX}-filter-stat-value {
                font-size: 13px; font-weight: 600; color: var(--text-primary);
            }

            /* ---- URL Input ---- */
            .${CSS_PREFIX}-url-group {
                display: flex; gap: 6px; margin-top: 8px;
            }
            .${CSS_PREFIX}-input {
                flex: 1; background: rgba(255,255,255,0.04);
                border: 1px solid var(--panel-border); border-radius: 8px;
                color: var(--text-primary); padding: 8px 12px;
                font-size: 12px; font-family: 'SF Mono', 'Fira Code', monospace;
                outline: none; transition: border-color 0.15s;
            }
            .${CSS_PREFIX}-input:focus { border-color: var(--accent); }
            .${CSS_PREFIX}-input::placeholder { color: var(--text-muted); }

            /* ---- Buttons ---- */
            .${CSS_PREFIX}-btn {
                padding: 8px 16px; border-radius: 8px;
                font-size: 12px; font-weight: 600; cursor: pointer;
                border: none; transition: all 0.15s;
                display: inline-flex; align-items: center; gap: 6px;
                white-space: nowrap;
            }
            .${CSS_PREFIX}-btn-primary {
                background: var(--accent); color: #000;
            }
            .${CSS_PREFIX}-btn-primary:hover { background: #81d4fa; }
            .${CSS_PREFIX}-btn-secondary {
                background: rgba(255,255,255,0.06); color: var(--text-primary);
                border: 1px solid var(--panel-border);
            }
            .${CSS_PREFIX}-btn-secondary:hover {
                background: rgba(255,255,255,0.1);
            }
            .${CSS_PREFIX}-btn-danger {
                background: rgba(239,83,80,0.12); color: var(--danger);
                border: 1px solid rgba(239,83,80,0.2);
            }
            .${CSS_PREFIX}-btn-danger:hover {
                background: rgba(239,83,80,0.2);
            }

            /* ---- Footer ---- */
            .${CSS_PREFIX}-footer {
                padding: 12px 22px;
                border-top: 1px solid var(--panel-border);
                display: flex; align-items: center; justify-content: space-between;
                flex-shrink: 0;
            }
            .${CSS_PREFIX}-stats {
                display: flex; gap: 16px;
            }
            .${CSS_PREFIX}-stat {
                font-size: 11px; color: var(--text-secondary);
            }
            .${CSS_PREFIX}-stat b {
                color: var(--accent); font-variant-numeric: tabular-nums;
            }

            /* ---- Spinner ---- */
            .${CSS_PREFIX}-spinner {
                width: 14px; height: 14px; border: 2px solid transparent;
                border-top-color: currentColor; border-radius: 50%;
                animation: ${CSS_PREFIX}-spin 0.6s linear infinite;
                display: inline-block;
            }
            @keyframes ${CSS_PREFIX}-spin { to { transform: rotate(360deg); } }

            /* ---- Shimmer ---- */
            .${CSS_PREFIX}-shimmer {
                background: linear-gradient(90deg,
                    transparent, rgba(255,255,255,0.04), transparent);
                background-size: 200% 100%;
                animation: ${CSS_PREFIX}-shimmer 2s ease infinite;
            }
            @keyframes ${CSS_PREFIX}-shimmer {
                0% { background-position: -200% 0; }
                100% { background-position: 200% 0; }
            }
        `;
        GM_addStyle(css);
    }

    function buildSettingsPanel() {
        // Overlay
        const overlay = document.createElement('div');
        overlay.className = `${CSS_PREFIX}-overlay`;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) toggleSettings(false);
        });

        const panel = document.createElement('div');
        panel.className = `${CSS_PREFIX}-panel`;

        // Header
        panel.innerHTML = `
            <div class="${CSS_PREFIX}-header">
                <div class="${CSS_PREFIX}-header-left">
                    <div class="${CSS_PREFIX}-logo">YT</div>
                    <span class="${CSS_PREFIX}-title">${SCRIPT_NAME}</span>
                    <span class="${CSS_PREFIX}-version">v${SCRIPT_VERSION}</span>
                </div>
                <button class="${CSS_PREFIX}-close" id="${CSS_PREFIX}-close-btn">\u00D7</button>
            </div>
            <div class="${CSS_PREFIX}-content" id="${CSS_PREFIX}-content"></div>
            <div class="${CSS_PREFIX}-footer">
                <div class="${CSS_PREFIX}-stats" id="${CSS_PREFIX}-stats"></div>
                <button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary" id="${CSS_PREFIX}-github-btn">GitHub</button>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        document.body.classList.add(`${CSS_PREFIX}-ready`);

        // Close handler
        panel.querySelector(`#${CSS_PREFIX}-close-btn`).addEventListener('click', () => toggleSettings(false));

        // GitHub handler
        panel.querySelector(`#${CSS_PREFIX}-github-btn`).addEventListener('click', () => {
            window.open('https://github.com/SysAdminDoc/youtube-adblock', '_blank');
        });

        buildContent();
        updateStatsDisplay();

        state.overlayEl = overlay;
    }

    function buildContent() {
        const content = document.getElementById(`${CSS_PREFIX}-content`);
        if (!content) return;
        content.innerHTML = '';

        // ---- Filter Management Section ----
        const filterSection = createSection('Filter Management');
        const filterInfo = document.createElement('div');
        filterInfo.className = `${CSS_PREFIX}-filter-info`;
        filterInfo.innerHTML = `
            <div class="${CSS_PREFIX}-filter-stat">
                <span class="${CSS_PREFIX}-filter-stat-label">Filter Version</span>
                <span class="${CSS_PREFIX}-filter-stat-value" id="${CSS_PREFIX}-fv">${state.filters?.version || '?'}</span>
            </div>
            <div class="${CSS_PREFIX}-filter-stat">
                <span class="${CSS_PREFIX}-filter-stat-label">Source</span>
                <span class="${CSS_PREFIX}-filter-stat-value" id="${CSS_PREFIX}-fs">${state.filterSource}</span>
            </div>
            <div class="${CSS_PREFIX}-filter-stat">
                <span class="${CSS_PREFIX}-filter-stat-label">Last Updated</span>
                <span class="${CSS_PREFIX}-filter-stat-value" id="${CSS_PREFIX}-flu">${state.lastFilterUpdate ? new Date(state.lastFilterUpdate).toLocaleString() : 'Never'}</span>
            </div>
            <div class="${CSS_PREFIX}-filter-stat">
                <span class="${CSS_PREFIX}-filter-stat-label">Selectors</span>
                <span class="${CSS_PREFIX}-filter-stat-value">${(state.filters?.cosmeticSelectors?.length || 0) + (state.filters?.upsellSelectors?.length || 0)}</span>
            </div>
        `;
        filterSection.appendChild(filterInfo);

        // URL input
        const urlGroup = document.createElement('div');
        urlGroup.className = `${CSS_PREFIX}-url-group`;
        const urlInput = document.createElement('input');
        urlInput.className = `${CSS_PREFIX}-input`;
        urlInput.id = `${CSS_PREFIX}-url-input`;
        urlInput.type = 'text';
        urlInput.placeholder = 'Filter list URL';
        urlInput.value = getSetting('filter_url', FILTER_URL_DEFAULT);
        urlGroup.appendChild(urlInput);

        const updateBtn = document.createElement('button');
        updateBtn.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-primary`;
        updateBtn.id = `${CSS_PREFIX}-update-btn`;
        updateBtn.textContent = 'Update';
        updateBtn.addEventListener('click', async () => {
            const newUrl = urlInput.value.trim();
            if (newUrl) setSetting('filter_url', newUrl);
            updateBtn.innerHTML = `<span class="${CSS_PREFIX}-spinner"></span>`;
            await fetchFilters(true);
            updateBtn.textContent = 'Update';
            buildContent(); // Rebuild to reflect new data
            updateStatsDisplay();
        });
        urlGroup.appendChild(updateBtn);
        filterSection.appendChild(urlGroup);

        // Reset URL button
        const resetRow = document.createElement('div');
        resetRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
        const resetUrlBtn = document.createElement('button');
        resetUrlBtn.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary`;
        resetUrlBtn.textContent = 'Reset URL';
        resetUrlBtn.style.fontSize = '11px';
        resetUrlBtn.addEventListener('click', () => {
            setSetting('filter_url', FILTER_URL_DEFAULT);
            urlInput.value = FILTER_URL_DEFAULT;
            showToast('Filter URL reset to default', 'info');
        });
        const resetStatsBtn = document.createElement('button');
        resetStatsBtn.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-danger`;
        resetStatsBtn.textContent = 'Reset Stats';
        resetStatsBtn.style.fontSize = '11px';
        resetStatsBtn.addEventListener('click', () => {
            state.stats = { blocked: 0, pruned: 0, hidden: 0, ssapSkipped: 0 };
            saveStats();
            updateStatsDisplay();
            showToast('Stats reset', 'info');
        });
        resetRow.appendChild(resetUrlBtn);
        resetRow.appendChild(resetStatsBtn);
        filterSection.appendChild(resetRow);

        content.appendChild(filterSection);

        // ---- Feature Toggles ----
        const featureGroups = {
            'Core Blocking': [
                { key: 'jsonParsePrune', label: 'JSON Parse Pruning', desc: 'Strip ad data from parsed JSON responses' },
                { key: 'fetchIntercept', label: 'Fetch Interception', desc: 'Intercept and modify fetch() API responses' },
                { key: 'xhrIntercept', label: 'XHR Interception', desc: 'Intercept and modify XMLHttpRequest responses' },
                { key: 'setUndefinedTraps', label: 'Property Traps', desc: 'Set ad properties to undefined on initial page load' },
                { key: 'requestBodyModify', label: 'Request Body Modify', desc: 'Modify outbound request bodies to prevent ad loading' },
            ],
            'Anti-Detection': [
                { key: 'abnormalityBypass', label: 'Abnormality Bypass', desc: 'Block YouTube onAbnormalityDetected callbacks' },
                { key: 'domBypassPrevention', label: 'DOM Bypass Prevention', desc: 'Prevent YouTube from using iframes to get clean references' },
                { key: 'clientScreenSpoof', label: 'Client Screen Spoof', desc: 'Spoof clientScreen to CHANNEL to alter ad behavior' },
                { key: 'ssapAutoSkip', label: 'SSAP Auto-Skip', desc: 'Detect and auto-skip server-side ad stitching' },
            ],
            'Content Filtering': [
                { key: 'cosmeticHiding', label: 'Cosmetic Hiding', desc: 'Hide ad elements, banners, merch shelves via CSS' },
                { key: 'upsellBlock', label: 'Premium Upsell Block', desc: 'Block YouTube Premium upsell popups' },
                { key: 'shortsAdBlock', label: 'Shorts Ad Block', desc: 'Remove ad entries from Shorts feed' },
            ]
        };

        const overrides = getSetting('feature_overrides', {});

        for (const [group, features] of Object.entries(featureGroups)) {
            const section = createSection(group);
            for (const feat of features) {
                const isEnabled = state.features[feat.key] ?? true;
                const row = createToggleRow(feat.label, feat.desc, isEnabled, (checked) => {
                    const o = getSetting('feature_overrides', {});
                    o[feat.key] = checked;
                    setSetting('feature_overrides', o);
                    state.features[feat.key] = checked;
                    if (feat.key === 'cosmeticHiding' || feat.key === 'upsellBlock') {
                        updateCosmeticCSS();
                    }
                    showToast(`${feat.label}: ${checked ? 'enabled' : 'disabled'}`, checked ? 'success' : 'warn');
                });
                section.appendChild(row);
            }
            content.appendChild(section);
        }
    }

    function createSection(title) {
        const section = document.createElement('div');
        section.className = `${CSS_PREFIX}-section`;
        const titleEl = document.createElement('div');
        titleEl.className = `${CSS_PREFIX}-section-title`;
        titleEl.textContent = title;
        section.appendChild(titleEl);
        return section;
    }

    function createToggleRow(label, desc, checked, onChange) {
        const row = document.createElement('div');
        row.className = `${CSS_PREFIX}-row`;

        const labelWrap = document.createElement('div');
        const labelEl = document.createElement('div');
        labelEl.className = `${CSS_PREFIX}-row-label`;
        labelEl.textContent = label;
        labelWrap.appendChild(labelEl);
        if (desc) {
            const descEl = document.createElement('div');
            descEl.className = `${CSS_PREFIX}-row-desc`;
            descEl.textContent = desc;
            labelWrap.appendChild(descEl);
        }

        const toggle = document.createElement('label');
        toggle.className = `${CSS_PREFIX}-toggle`;
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.addEventListener('change', () => onChange(input.checked));
        const track = document.createElement('span');
        track.className = `${CSS_PREFIX}-toggle-track`;
        toggle.appendChild(input);
        toggle.appendChild(track);

        row.appendChild(labelWrap);
        row.appendChild(toggle);

        row.addEventListener('click', (e) => {
            if (e.target === input || e.target === track) return;
            input.checked = !input.checked;
            input.dispatchEvent(new Event('change'));
        });

        return row;
    }

    function updateStatsDisplay() {
        const container = document.getElementById(`${CSS_PREFIX}-stats`);
        if (!container) return;
        container.innerHTML = `
            <span class="${CSS_PREFIX}-stat">Blocked <b>${state.stats.blocked}</b></span>
            <span class="${CSS_PREFIX}-stat">Pruned <b>${state.stats.pruned}</b></span>
            <span class="${CSS_PREFIX}-stat">SSAP <b>${state.stats.ssapSkipped}</b></span>
        `;
    }

    function toggleSettings(show) {
        if (show === undefined) show = !state.settingsOpen;
        state.settingsOpen = show;
        if (!state.overlayEl) return;
        if (show) {
            state.overlayEl.classList.add(`${CSS_PREFIX}-active`);
            buildContent();
            updateStatsDisplay();
        } else {
            state.overlayEl.classList.remove(`${CSS_PREFIX}-active`);
        }
    }

    /* =========================================================================
     * INIT
     * ===================================================================== */

    // Phase 1: Load config and install proxies ASAP (document-start)
    loadState();
    installProxies();

    // Phase 2: Background filter fetch
    fetchFilters();

    // Phase 3: DOM-dependent setup
    function onDOMReady() {
        injectSettingsCSS();
        buildSettingsPanel();

        // Stats counter update interval
        setInterval(updateStatsDisplay, 5000);

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
        GM_registerMenuCommand(`${SCRIPT_NAME} Settings`, () => toggleSettings(true));
    } catch (e) { /* GM_registerMenuCommand may not be available */ }

})();
