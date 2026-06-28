import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const userscriptSource = fs.readFileSync(path.join(repoRoot, 'YoutubeAdblock.user.js'), 'utf8');

// Extract the IIFE body, strip the header, and expose internal functions
// via a module-return pattern so tests can call them without a browser env.
function createTestHarness(options = {}) {
    // Build a minimal sandbox with enough globals for the IIFE to
    // evaluate. Stubs must cover the init path (DOM reads, GM_*,
    // menu commands) without a real browser.
    const noop = () => {};
    const noopEl = () => {
        const el = {
            className: '', id: '', textContent: '', innerHTML: '', type: '',
            style: { cssText: '' }, dataset: {}, value: '', rows: 0,
            spellcheck: true, disabled: false, checked: false, open: false,
            setAttribute: noop, getAttribute: () => null,
            addEventListener: noop, removeEventListener: noop,
            appendChild(c) { return c; }, append: noop, prepend: noop,
            querySelector: () => noopEl(), querySelectorAll: () => [],
            insertBefore: noop, replaceChild: noop, remove: noop,
            firstElementChild: null, parentElement: null, children: [],
            cloneNode: () => noopEl(),
            classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
            getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
            scrollIntoView: noop, focus: noop, blur: noop,
            isConnected: true,
        };
        return el;
    };
    const createElement = () => noopEl();

    const storage = { ...(options.storage || {}) };
    const querySelector = options.querySelector || (() => noopEl());

    const sandbox = {
        window: {},
        self: {},
        document: {
            readyState: 'complete',
            addEventListener: noop,
            removeEventListener: noop,
            createElement,
            createTextNode: (t) => ({ textContent: t }),
            getElementById: () => noopEl(),
            querySelector,
            querySelectorAll: () => [],
            body: { ...noopEl(), classList: { add: noop, remove: noop, contains: () => false }, children: [] },
            head: noopEl(),
            documentElement: noopEl(),
        },
        navigator: { userAgent: 'test', serviceWorker: {} },
        location: { hostname: 'www.youtube.com', pathname: '/watch', href: 'https://www.youtube.com/watch?v=test' },
        console: { log: noop, warn: noop, error: noop },
        setTimeout: () => 0,
        clearTimeout: noop,
        setInterval: () => 0,
        clearInterval: noop,
        Object, Array, Set, Map, WeakMap, Proxy, Reflect, RegExp, JSON,
        Number, Math, String, Date, Error, TypeError, Promise,
        Headers: function Headers() { this.get = () => ''; this.delete = noop; },
        Response: function Response(body, init) { this.body = body; this.status = init?.status || 200; },
        Request: function Request(url) { this.url = url; },
        XMLHttpRequest: function XMLHttpRequest() {},
        Node: { prototype: {} },
        HTMLIFrameElement: { prototype: {} },
        HTMLScriptElement: { prototype: {} },
        MutationObserver: function MutationObserver() { this.observe = noop; this.disconnect = noop; },
        AudioContext: function AudioContext() { this.createMediaElementSource = () => ({ connect: noop }); this.createGain = () => ({ gain: { value: 1 }, connect: noop }); this.destination = {}; },
        Function,
        URL: globalThis.URL,
        matchMedia: () => ({ matches: false }),
        getComputedStyle: () => ({}),
        requestAnimationFrame: noop,
        fetch: noop,
        __YTAB_STORAGE_KEY: undefined,
        // GM_* stubs for the userscript init path
        GM_getValue: (key, def) => Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : def,
        GM_setValue: (key, val) => { storage[key] = val; },
        GM_registerMenuCommand: noop,
        GM_unregisterMenuCommand: noop,
        GM_xmlhttpRequest: noop,
    };

    // Expose the internal functions we want to test by appending an
    // export block right before the closing `})();` of the IIFE.
    const exportBlock = `
    ;(typeof __ytab_test_export !== 'undefined') && __ytab_test_export({
        deleteNestedKey,
        pruneObject,
        sanitizeFilterPayload,
        parseUBOFilterList,
        parseBlocklist,
        extractRendererChannelIdentity,
        videoRendererMatches,
        normalizeBlocklistText,
        buildSettingsExportPayload,
        importSettingsPayload,
        matchesInterceptPattern,
        replaceAdKeys,
        responseTextMightContainAds,
        injectNoAdFlag,
        rewriteRequestBodyText,
        handleExtensionBlockChannel,
        normalizeFeatures,
        DEFAULT_FILTERS,
        state,
    });
    `;
    // Inject the export block before the final `})();`
    const src = userscriptSource.replace(/\}\)\(\);[\s]*$/, exportBlock + '\n})();');

    let exported = null;
    sandbox.__ytab_test_export = (obj) => { exported = obj; };

    const ctx = vm.createContext(sandbox);
    try {
        vm.runInContext(src, ctx, { filename: 'YoutubeAdblock.user.js' });
    } catch (e) {
        // Many engines will throw because we lack DOM/GM_* — that's fine
        // as long as the function definitions were captured.
        if (!exported) throw new Error('Failed to extract test functions: ' + e.message + '\n' + e.stack);
    }
    exported.__storage = storage;
    return exported;
}

const harness = createTestHarness();

// ========== deleteNestedKey ==========

test('deleteNestedKey removes a top-level key', () => {
    const obj = { adPlacements: [1, 2], title: 'ok' };
    const result = harness.deleteNestedKey(obj, 'adPlacements');
    assert.equal(result, true);
    assert.equal('adPlacements' in obj, false);
    assert.equal(obj.title, 'ok');
});

test('deleteNestedKey removes a nested key', () => {
    const obj = { playerResponse: { adSlots: [1], streamingData: {} } };
    const result = harness.deleteNestedKey(obj, 'playerResponse.adSlots');
    assert.equal(result, true);
    assert.equal('adSlots' in obj.playerResponse, false);
    assert.deepEqual(obj.playerResponse.streamingData, {});
});

test('deleteNestedKey returns false for missing key', () => {
    const obj = { a: { b: 1 } };
    assert.equal(harness.deleteNestedKey(obj, 'a.c'), false);
    assert.equal(harness.deleteNestedKey(obj, 'x.y.z'), false);
});

test('deleteNestedKey handles null in path', () => {
    assert.equal(harness.deleteNestedKey(null, 'a'), false);
    assert.equal(harness.deleteNestedKey({ a: null }, 'a.b'), false);
});

// ========== pruneObject ==========

test('pruneObject strips default prune keys from a player response', () => {
    const obj = {
        adPlacements: [{ adPlacementRenderer: {} }],
        adSlots: [{}],
        playerAds: [{}],
        streamingData: { formats: [{ itag: 18 }] },
        videoDetails: { videoId: 'abc123' },
    };
    const result = harness.pruneObject(obj);
    assert.equal(result, true);
    assert.equal('adPlacements' in obj, false);
    assert.equal('adSlots' in obj, false);
    assert.equal('playerAds' in obj, false);
    assert.deepEqual(obj.streamingData, { formats: [{ itag: 18 }] });
    assert.equal(obj.videoDetails.videoId, 'abc123');
});

test('pruneObject returns false when no ad keys present', () => {
    const obj = { streamingData: { formats: [] }, videoDetails: {} };
    assert.equal(harness.pruneObject(obj), false);
});

test('pruneObject strips nested keys like playerResponse.adPlacements', () => {
    const obj = {
        playerResponse: {
            adPlacements: [{}],
            streamingData: { formats: [{ itag: 22 }] }
        }
    };
    harness.pruneObject(obj);
    assert.equal('adPlacements' in obj.playerResponse, false);
    assert.ok(obj.playerResponse.streamingData);
});

test('pruneObject strips enforcement/framework keys', () => {
    const obj = {
        frameworkUpdates: { entityBatchUpdate: {} },
        responseContext: { adSignalsInfo: { params: [] }, serviceTrackingParams: [] },
    };
    harness.pruneObject(obj);
    assert.equal('frameworkUpdates' in obj, false);
    assert.equal('adSignalsInfo' in obj.responseContext, false);
    assert.ok(obj.responseContext.serviceTrackingParams);
});

// ========== sanitizeFilterPayload ==========

test('sanitizeFilterPayload rejects non-objects', () => {
    assert.equal(harness.sanitizeFilterPayload(null), null);
    assert.equal(harness.sanitizeFilterPayload('string'), null);
    assert.equal(harness.sanitizeFilterPayload([1, 2]), null);
    assert.equal(harness.sanitizeFilterPayload(42), null);
});

test('sanitizeFilterPayload merges with defaults', () => {
    const result = harness.sanitizeFilterPayload({
        pruneKeys: ['customAdKey'],
        cosmeticSelectors: ['.my-ad-class'],
    });
    assert.ok(result);
    assert.ok(result.pruneKeys.includes('adPlacements'));
    assert.ok(result.pruneKeys.includes('customAdKey'));
    assert.ok(result.cosmeticSelectors.includes('.my-ad-class'));
    assert.ok(result.cosmeticSelectors.includes('#masthead-ad'));
});

test('sanitizeFilterPayload rejects dangerous selectors', () => {
    const result = harness.sanitizeFilterPayload({
        cosmeticSelectors: [
            '.safe-selector',
            'div{background:url(//evil)}',
            '.ok-too',
        ],
    });
    assert.ok(result);
    assert.ok(result.cosmeticSelectors.includes('.safe-selector'));
    assert.ok(result.cosmeticSelectors.includes('.ok-too'));
    assert.ok(!result.cosmeticSelectors.includes('div{background:url(//evil)}'));
});

// ========== parseUBOFilterList ==========

test('parseUBOFilterList extracts cosmetic selectors', () => {
    const text = [
        '! Comment line',
        'youtube.com##.ad-container',
        'youtube.com##ytd-ad-slot-renderer',
    ].join('\n');
    const result = harness.parseUBOFilterList(text);
    assert.ok(result.cosmeticSelectors.includes('.ad-container'));
    assert.ok(result.cosmeticSelectors.includes('ytd-ad-slot-renderer'));
    assert.equal(result.filterCount, 2);
});

test('parseUBOFilterList extracts json-prune keys', () => {
    const text = 'youtube.com##+js(json-prune, myAdKey otherKey)\n';
    const result = harness.parseUBOFilterList(text);
    assert.ok(result.pruneKeys.includes('myAdKey'));
    assert.ok(result.pruneKeys.includes('otherKey'));
});

test('parseUBOFilterList extracts set-undefined paths', () => {
    const text = 'youtube.com##+js(set, myProperty.adField, undefined)\n';
    const result = harness.parseUBOFilterList(text);
    assert.ok(result.setUndefined.includes('myProperty.adField'));
});

test('parseUBOFilterList skips :style() rules', () => {
    const text = 'youtube.com##.ad-container:style(display:none!important)\n';
    const result = harness.parseUBOFilterList(text);
    assert.ok(!result.cosmeticSelectors.some(s => s.includes(':style(')));
});

test('parseUBOFilterList counts network rules without executing them', () => {
    const text = [
        '||doubleclick.net^',
        '||googlesyndication.com^',
        '! comment',
    ].join('\n');
    const result = harness.parseUBOFilterList(text);
    assert.equal(result.filterCount, 2);
});

test('parseUBOFilterList handles cosmetic exceptions', () => {
    const text = [
        'youtube.com##.my-selector',
        'youtube.com#@#.my-selector',
    ].join('\n');
    const result = harness.parseUBOFilterList(text);
    assert.ok(!result.cosmeticSelectors.includes('.my-selector'));
});

test('parseUBOFilterList rejects selectors with CSS injection chars', () => {
    const text = 'youtube.com##div{background:url(//x)}\n';
    const result = harness.parseUBOFilterList(text);
    assert.ok(!result.cosmeticSelectors.some(s => s.includes('background')));
});

test('parseUBOFilterList rejects json-prune keys with unsafe characters', () => {
    const text = [
        'youtube.com##+js(json-prune, safe.key)',
        'youtube.com##+js(json-prune, inject[0].bad)',
    ].join('\n');
    const result = harness.parseUBOFilterList(text);
    assert.ok(result.pruneKeys.includes('safe.key'));
    assert.ok(!result.pruneKeys.includes('inject[0].bad'));
});

// ========== injectNoAdFlag ==========

test('injectNoAdFlag sets the flag on a player request body', () => {
    const body = {
        playbackContext: {
            contentPlaybackContext: {
                autoCaptionsDefaultOn: false,
            }
        }
    };
    const result = harness.injectNoAdFlag(body);
    assert.equal(result, true);
    assert.equal(body.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd, true);
});

test('injectNoAdFlag skips when flag already set', () => {
    const body = {
        playbackContext: {
            contentPlaybackContext: { isInlinePlaybackNoAd: true }
        }
    };
    assert.equal(harness.injectNoAdFlag(body), false);
});

test('injectNoAdFlag returns false for unrelated objects', () => {
    assert.equal(harness.injectNoAdFlag({}), false);
    assert.equal(harness.injectNoAdFlag(null), false);
    assert.equal(harness.injectNoAdFlag({ data: 1 }), false);
});

test('injectNoAdFlag handles contentPlaybackContext at root', () => {
    const body = { contentPlaybackContext: { spikeLevel: 1 } };
    assert.equal(harness.injectNoAdFlag(body), true);
    assert.equal(body.contentPlaybackContext.isInlinePlaybackNoAd, true);
});

// ========== rewriteRequestBodyText ==========

test('rewriteRequestBodyText rewrites a JSON body with contentPlaybackContext', () => {
    const input = JSON.stringify({
        playbackContext: {
            contentPlaybackContext: { autoCaptionsDefaultOn: false }
        },
        videoId: 'test123'
    });
    const result = harness.rewriteRequestBodyText(input);
    assert.ok(result !== null);
    const parsed = JSON.parse(result);
    assert.equal(parsed.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd, true);
    assert.equal(parsed.videoId, 'test123');
});

test('rewriteRequestBodyText returns null for non-player bodies', () => {
    assert.equal(harness.rewriteRequestBodyText('{"browserId":"x"}'), null);
    assert.equal(harness.rewriteRequestBodyText('not json'), null);
    assert.equal(harness.rewriteRequestBodyText(null), null);
    assert.equal(harness.rewriteRequestBodyText(''), null);
});

// ========== Extension context-menu channel block ==========

test('extension block-channel handler adds current channel and enables blocker', () => {
    const h = createTestHarness({
        storage: { ytab_channel_blocklist: 'Existing Channel' },
        querySelector: () => ({ textContent: '  New Channel  ' })
    });

    h.state.features.channelBlocker = false;
    h.handleExtensionBlockChannel();

    assert.equal(h.__storage.ytab_channel_blocklist, 'Existing Channel\nNew Channel');
    assert.equal(h.__storage.ytab_channelBlocker, true);
    assert.equal(h.state.features.channelBlocker, true);
});

test('extension block-channel handler avoids duplicate channel names', () => {
    const h = createTestHarness({
        storage: { ytab_channel_blocklist: 'Existing Channel' },
        querySelector: () => ({ textContent: 'existing channel' })
    });

    h.state.features.channelBlocker = true;
    h.handleExtensionBlockChannel();

    assert.equal(h.__storage.ytab_channel_blocklist, 'Existing Channel');
    assert.equal(h.__storage.ytab_channelBlocker, undefined);
});

test('channel blocklist parser recognizes names, UC IDs, handles, and URLs', () => {
    const entries = harness.parseBlocklist([
        'Legacy Name',
        'UCabcdefghijklmnopqrstuv',
        '@Creator.Handle',
        'https://www.youtube.com/@OtherCreator',
        'https://www.youtube.com/channel/UCzzzzzzzzzzzzzzzzzzzzzz'
    ].join('\n'), { channel: true });

    assert.equal(entries[0].value, 'legacy name');
    assert.equal(entries[1].channelId, 'ucabcdefghijklmnopqrstuv');
    assert.equal(entries[2].handle, '@creator.handle');
    assert.equal(entries[3].handle, '@othercreator');
    assert.equal(entries[3].path, '/@othercreator');
    assert.equal(entries[4].channelId, 'uczzzzzzzzzzzzzzzzzzzzzz');
    assert.equal(entries[4].path, '/channel/uczzzzzzzzzzzzzzzzzzzzzz');
});

test('video renderer matching uses stable channel IDs and handles', () => {
    const h = createTestHarness();
    const renderer = {
        title: { simpleText: 'Review' },
        shortBylineText: {
            runs: [{
                text: 'Mutable Display Name',
                navigationEndpoint: {
                    browseEndpoint: {
                        browseId: 'UCabcdefghijklmnopqrstuv',
                        canonicalBaseUrl: '/@StableHandle'
                    },
                    commandMetadata: {
                        webCommandMetadata: { url: '/@StableHandle' }
                    }
                }
            }]
        }
    };

    assert.equal(
        h.videoRendererMatches(renderer, h.parseBlocklist('@stablehandle', { channel: true }), []),
        true
    );
    assert.equal(
        h.videoRendererMatches(renderer, h.parseBlocklist('UCabcdefghijklmnopqrstuv', { channel: true }), []),
        true
    );
});

test('settings export and JSON import preserve blocklists and feature overrides', () => {
    const h = createTestHarness({
        storage: {
            ytab_channel_blocklist: '@creator\nUCabcdefghijklmnopqrstuv',
            ytab_keyword_blocklist: 'spoiler',
            ytab_feature_overrides: { channelBlocker: true, keywordBlocker: true }
        }
    });

    const payload = h.buildSettingsExportPayload();
    assert.equal(payload.settings.channel_blocklist, '@creator\nUCabcdefghijklmnopqrstuv');
    assert.equal(payload.settings.feature_overrides.channelBlocker, true);

    const target = createTestHarness();
    const result = target.importSettingsPayload(JSON.stringify(payload), 'json');
    assert.equal(result.ok, true);
    assert.equal(target.__storage.ytab_channel_blocklist, '@creator\nUCabcdefghijklmnopqrstuv');
    assert.equal(target.__storage.ytab_keyword_blocklist, 'spoiler');
    assert.equal(target.__storage.ytab_feature_overrides.channelBlocker, true);
    assert.equal(target.__storage.ytab_feature_overrides.keywordBlocker, true);
});

test('plain text import normalizes channel entries and enables channel blocker', () => {
    const h = createTestHarness();

    const result = h.importSettingsPayload(' @Creator \n@creator\nUCabcdefghijklmnopqrstuv\n', 'text');

    assert.equal(result.ok, true);
    assert.equal(h.__storage.ytab_channel_blocklist, '@Creator\nUCabcdefghijklmnopqrstuv');
    assert.equal(h.__storage.ytab_feature_overrides.channelBlocker, true);
    assert.equal(h.state.features.channelBlocker, true);
});
