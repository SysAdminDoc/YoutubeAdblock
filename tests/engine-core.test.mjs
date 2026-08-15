import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const userscriptSource = fs.readFileSync(path.join(repoRoot, 'YoutubeAdblock.user.js'), 'utf8');
const filterText = fs.readFileSync(path.join(repoRoot, 'youtube-adblock-filters.txt'), 'utf8');
const filterManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'youtube-adblock-filters.manifest.json'), 'utf8'));
const filterSignature = fs.readFileSync(path.join(repoRoot, 'youtube-adblock-filters.txt.sig'), 'utf8');
const webpackSigText = fs.readFileSync(path.join(repoRoot, 'webpack-ad-signatures.json'), 'utf8');
const webpackSigManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'webpack-ad-signatures.manifest.json'), 'utf8'));
const webpackSigSignature = fs.readFileSync(path.join(repoRoot, 'webpack-ad-signatures.json.sig'), 'utf8');
const filterManifestSignature = fs.readFileSync(path.join(repoRoot, 'youtube-adblock-filters.manifest.json.sig'), 'utf8');
const webpackSigManifestSignature = fs.readFileSync(path.join(repoRoot, 'webpack-ad-signatures.manifest.json.sig'), 'utf8');

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
    let writeFailureAfter = null;
    let writesPerformed = 0;
    const querySelector = options.querySelector || (() => noopEl());
    const documentReadyState = options.documentReadyState || 'complete';
    const performanceNow = options.performanceNow ?? 0;

    const sandbox = {
        window: {},
        self: {},
        document: {
            readyState: documentReadyState,
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
        TextEncoder: globalThis.TextEncoder,
        crypto: globalThis.crypto,
        atob: globalThis.atob,
        btoa: globalThis.btoa,
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
        performance: { now: () => performanceNow },
        requestAnimationFrame: noop,
        fetch: noop,
        __YTAB_STORAGE_KEY: options.extensionBuild ? '__ytab_ext_settings__' : undefined,
        // GM_* stubs for the userscript init path
        GM_getValue: (key, def) => Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : def,
        GM_setValue: (key, val) => {
            // Injected-failure hook: tests can make the Nth+ write throw
            // to prove the importer's rollback path.
            if (writeFailureAfter !== null && writesPerformed >= writeFailureAfter) {
                // Fail exactly once so the importer's rollback writes,
                // which follow immediately, can still succeed.
                writeFailureAfter = null;
                throw new Error('injected storage write failure');
            }
            writesPerformed++;
            storage[key] = val;
        },
        GM_registerMenuCommand: noop,
        GM_unregisterMenuCommand: noop,
        GM_xmlhttpRequest: options.gmXhr || noop,
    };

    // Expose the internal functions we want to test by appending an
    // export block right before the closing `})();` of the IIFE.
    const exportBlock = `
    ;(typeof __ytab_test_export !== 'undefined') && __ytab_test_export({
        deleteNestedKey,
        pruneObject,
        sanitizeFilterPayload,
        parseUBOFilterList,
        sanitizeFilterManifest,
        normalizeFilterTextForSignature,
        verifyEd25519Signature,
        parseBlocklist,
        extractRendererChannelIdentity,
        videoRendererMatches,
        normalizeBlocklistText,
        parseMigrationPayload,
        buildSettingsExportPayload,
        importSettingsPayload,
        audioTrackHasOriginalMarker,
        pickOriginalAudioTrack,
        applyOriginalAudioTrack,
        getInjectionTimingStatus,
        buildDiagnosticsReport,
        sanitizeDnrDiagnostics,
        formatDnrDiagnosticsReport,
        getDnrDiagnosticsPresentation,
        matchesInterceptPattern,
        replaceAdKeys,
        responseTextMightContainAds,
        scrubAdManifestText,
        manifestTextMightContainAds,
        detectServerStitchedAdSignal,
        injectNoAdFlag,
        rewriteRequestBodyText,
        isKnownAdRequestUrl,
        PLAYER_ENDPOINT_RE,
        isElementVisiblyRendered,
        findRydDislikeButton,
        handleExtensionBlockChannel,
        normalizeFeatures,
        sanitizeWebpackSignatureDatabase,
        compileWebpackSignatureMatcher,
        webpackFactoryMatchesAdSignature,
        isDangerousScriptlet,
        redactUrl,
        isApiCoolingDown,
        setApiCooldown,
        getApiCooldownStatus,
        apiCooldowns,
        isComplianceDialogElement,
        scanForComplianceDialogs,
        hasVisibleComplianceDialog,
        COMPLIANCE_MARK_ATTR,
        validateSafeRegexSource,
        updateCosmeticCSS,
        verifySignedManifest,
        checkManifestFreshness,
        signedManifestSigningInput,
        getHighestAcceptedRevision,
        recordAcceptedRevision,
        validateImportPayload,
        applyValidatedSettings,
        undoLastImport,
        hasUndoableImport,
        snapshotPortableSettings,
        SETTINGS_SCHEMA_VERSION,
        matchesList,
        getParsedBlocklist,
        sanitizeCommunityConsent,
        getCommunityConsent,
        hasServiceConsent,
        setServiceConsent,
        getCommunityConsentReport,
        sponsorBlockFetchBucket,
        reportSponsorBlockView,
        dearrowFetchBucket,
        rydFetch,
        COMMUNITY_CONSENT_SERVICES,
        DEFAULT_FILTERS,
        DEFAULT_WEBPACK_SIGNATURE_DATABASE,
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
    exported.__failWriteAfter = (n) => { writeFailureAfter = n; writesPerformed = 0; };
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

test('Focus & Filters settings have explicit off defaults', () => {
    for (const key of ['whitelistMode', 'durationFilter', 'adAllowlist']) {
        assert.equal(harness.DEFAULT_FILTERS.features[key], false, `${key} should default off`);
        assert.equal(harness.state.features[key], false, `${key} runtime state should match its toggle`);
    }
});

test('duration filtering works without channel or keyword filtering', () => {
    const h = createTestHarness({
        storage: {
            ytab_duration_min: '120',
            ytab_feature_overrides: { durationFilter: true },
        }
    });
    const obj = {
        contents: [
            { videoRenderer: { title: { simpleText: 'Short clip' }, lengthText: { simpleText: '0:45' } } },
            { videoRenderer: { title: { simpleText: 'Long clip' }, lengthText: { simpleText: '3:00' } } },
        ]
    };

    assert.equal(h.state.features.channelBlocker, false);
    assert.equal(h.state.features.keywordBlocker, false);
    assert.equal(h.pruneObject(obj), true);
    assert.equal(obj.contents.length, 1);
    assert.equal(obj.contents[0].videoRenderer.title.simpleText, 'Long clip');
});

test('ad allowlist override persists and skips player ad pruning', () => {
    const h = createTestHarness({
        storage: {
            ytab_ad_allowlist: 'UCabcdefghijklmnopqrstuv',
            ytab_feature_overrides: { adAllowlist: true },
        }
    });
    const obj = {
        adPlacements: [{}],
        videoDetails: {
            author: 'Allowed Creator',
            channelId: 'UCabcdefghijklmnopqrstuv',
        }
    };

    assert.equal(h.state.features.adAllowlist, true);
    assert.equal(h.pruneObject(obj), false);
    assert.equal(obj.adPlacements.length, 1);
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
    assert.equal(result.coverage.networkOnlyRules, 2);
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
    assert.equal(result.coverage.droppedUnsafeSelectors, 1);
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

test('parseUBOFilterList reports supported and unsupported scriptlet coverage', () => {
    const text = [
        'youtube.com##+js(set, ytInitialPlayerResponse.playerAds, undefined)',
        'youtube.com##+js(json-prune, playerResponse.adPlacements)',
        'youtube.com##+js(trusted-replace-fetch-response, "adPlacements", "no_ads", player?)',
        'youtube.com##+js(trusted-json-edit-fetch-request, ..client[?.clientName=="WEB"]+={"clientScreen":"CHANNEL"}, propsToMatch, /player/)'
    ].join('\n');
    const result = harness.parseUBOFilterList(text);
    const supported = new Map(result.coverage.supportedScriptlets.map(item => [item.name, item.count]));
    const rejected = new Map(result.coverage.rejectedDangerousScriptlets.map(item => [item.name, item.count]));

    assert.equal(result.coverage.appliedPrunePaths, 3);
    assert.equal(supported.get('set'), 1);
    assert.equal(supported.get('json-prune'), 1);
    assert.equal(supported.get('trusted-replace-fetch-response'), 1);
    assert.equal(rejected.get('trusted-json-edit-fetch-request'), 1);
    assert.equal(result.replaceKeys.adPlacements, 'no_ads');
});

test('parseUBOFilterList supports safe response replacements and bundled bypass equivalents', () => {
    const text = [
        'www.youtube.com##+js(trusted-replace-fetch-response, \'"adSlots"\', \'"no_ads"\', player?)',
        'www.youtube.com##+js(trusted-replace-xhr-response, \'"adPlacements"\', \'"no_ads"\', /player/)',
        'www.youtube.com##+js(trusted-prevent-dom-bypass, Node.prototype.appendChild, fetch)',
        'www.youtube.com##+js(trusted-prevent-dom-bypass, Node.prototype.appendChild, Request)',
        'www.youtube.com##+js(trusted-prevent-dom-bypass, Node.prototype.appendChild, JSON.parse)',
        'www.youtube.com##+js(nano-stb, [native code], 17000, 0.001)',
        'www.youtube.com##+js(trusted-rpnt, script, unsafe, replacement)'
    ].join('\n');
    const result = harness.parseUBOFilterList(text);
    const supported = new Map(result.coverage.supportedScriptlets.map(item => [item.name, item.count]));
    const unsupported = new Map(result.coverage.unsupportedScriptlets.map(item => [item.name, item.count]));

    const rejected = new Map(result.coverage.rejectedDangerousScriptlets.map(item => [item.name, item.count]));

    assert.equal(result.replaceKeys.adSlots, 'no_ads');
    assert.equal(result.replaceKeys.adPlacements, 'no_ads');
    assert.equal(supported.get('trusted-replace-fetch-response'), 1);
    assert.equal(supported.get('trusted-replace-xhr-response'), 1);
    assert.equal(supported.get('trusted-prevent-dom-bypass'), 3);
    assert.equal(supported.get('nano-stb'), 1);
    assert.equal(rejected.get('trusted-rpnt'), 1);
});

test('parseUBOFilterList rejects dangerous scriptlets that could create executable code', () => {
    const text = [
        'www.youtube.com##+js(trusted-set-constant, window.ads, true)',
        'www.youtube.com##+js(trusted-set-attr, script, src, //evil)',
        'www.youtube.com##+js(trusted-click-element, .skip-btn)',
        'www.youtube.com##+js(trusted-replace-node-text, script, token)',
        'www.youtube.com##+js(evaldata-prune, payload)',
        'www.youtube.com##+js(trusted-set-local-storage-item, key, val)',
        'www.youtube.com##+js(trusted-suppress-native-method, fetch)',
        'www.youtube.com##+js(trusted-override-element-method, script, text)',
        'www.youtube.com##+js(trusted-prune-inbound-object, window)',
    ].join('\n');
    const result = harness.parseUBOFilterList(text);
    const supported = new Map(result.coverage.supportedScriptlets.map(item => [item.name, item.count]));
    const unsupported = new Map(result.coverage.unsupportedScriptlets.map(item => [item.name, item.count]));
    const rejected = new Map(result.coverage.rejectedDangerousScriptlets.map(item => [item.name, item.count]));

    for (const name of [
        'trusted-set-constant', 'trusted-set-attr', 'trusted-click-element',
        'trusted-replace-node-text', 'evaldata-prune', 'trusted-set-local-storage-item',
        'trusted-suppress-native-method', 'trusted-override-element-method',
        'trusted-prune-inbound-object',
    ]) {
        assert.ok(rejected.has(name), `${name} must be rejected-dangerous`);
        assert.equal(supported.has(name), false, `${name} must never be supported`);
        assert.equal(unsupported.has(name), false, `${name} must not be unsupported (must be rejected)`);
    }
});

test('isDangerousScriptlet allows safe trusted scriptlets through', () => {
    assert.equal(harness.isDangerousScriptlet('trusted-replace-fetch-response'), false);
    assert.equal(harness.isDangerousScriptlet('trusted-replace-xhr-response'), false);
    assert.equal(harness.isDangerousScriptlet('trusted-prevent-dom-bypass'), false);
    assert.equal(harness.isDangerousScriptlet('json-prune'), false);
    assert.equal(harness.isDangerousScriptlet('set'), false);
    assert.equal(harness.isDangerousScriptlet('nano-stb'), false);
});

test('isDangerousScriptlet blocks dangerous trusted scriptlets', () => {
    assert.equal(harness.isDangerousScriptlet('trusted-set-constant'), true);
    assert.equal(harness.isDangerousScriptlet('trusted-set-attr'), true);
    assert.equal(harness.isDangerousScriptlet('trusted-click-element'), true);
    assert.equal(harness.isDangerousScriptlet('trusted-replace-node-text'), true);
    assert.equal(harness.isDangerousScriptlet('trusted-suppress-native-method'), true);
    assert.equal(harness.isDangerousScriptlet('evaldata-prune'), true);
    assert.equal(harness.isDangerousScriptlet('trusted-unknown-future-scriptlet'), true);
});

// ========== diagnostics redaction ==========

test('redactUrl removes video IDs from YouTube watch URLs', () => {
    assert.match(harness.redactUrl('/watch?v=dQw4w9WgXcQ&t=42'), /\[video-id\]/);
    assert.doesNotMatch(harness.redactUrl('/watch?v=dQw4w9WgXcQ&t=42'), /dQw4w9WgXcQ/);
    assert.doesNotMatch(harness.redactUrl('/watch?v=dQw4w9WgXcQ&list=PLxyz'), /PLxyz/);
});

test('redactUrl removes video IDs from Shorts URLs', () => {
    assert.match(harness.redactUrl('/shorts/abc123XYZ'), /\[video-id\]/);
    assert.doesNotMatch(harness.redactUrl('/shorts/abc123XYZ'), /abc123XYZ/);
});

test('redactUrl strips query strings from custom filter URLs', () => {
    const result = harness.redactUrl('https://example.com/filters.txt?token=secret123');
    assert.doesNotMatch(result, /secret123/);
    assert.match(result, /\[redacted\]/);
});

test('redactUrl strips query strings from SSAI URLs', () => {
    const result = harness.redactUrl('https://rr1.googlevideo.com/videoplayback?id=abc&itag=140');
    assert.doesNotMatch(result, /abc/);
    assert.match(result, /\[redacted\]/);
});

test('redactUrl preserves benign paths without video IDs', () => {
    assert.equal(harness.redactUrl('/feed/trending'), '/feed/trending');
    assert.equal(harness.redactUrl('/'), '/');
});

// ========== Community API cooldowns ==========

test('setApiCooldown sets a cooldown that isApiCoolingDown detects', () => {
    harness.setApiCooldown('ryd', null);
    assert.equal(harness.isApiCoolingDown('ryd'), true);
    const status = harness.getApiCooldownStatus();
    assert.notEqual(status.ryd, 'ok');
    harness.apiCooldowns.ryd = 0;
});

test('setApiCooldown parses Retry-After header', () => {
    harness.setApiCooldown('sponsorblock', { responseHeaders: 'retry-after: 120\r\n' });
    assert.equal(harness.isApiCoolingDown('sponsorblock'), true);
    harness.apiCooldowns.sponsorblock = 0;
});

test('getApiCooldownStatus reports ok when no cooldowns active', () => {
    harness.apiCooldowns.sponsorblock = 0;
    harness.apiCooldowns.dearrow = 0;
    harness.apiCooldowns.ryd = 0;
    const status = harness.getApiCooldownStatus();
    assert.equal(status.sponsorblock, 'ok');
    assert.equal(status.dearrow, 'ok');
    assert.equal(status.ryd, 'ok');
});

// ========== Webpack signature database ==========

test('webpack signature database sanitizes remote tokens and preserves defaults', () => {
    const db = harness.sanitizeWebpackSignatureDatabase({
        version: 'remote-test',
        updated: '2026-06-28',
        maxFactoryBytes: 50000,
        tokens: [
            'paidAdRendererFactory',
            'bad-token',
            'adSlots',
            'x'.repeat(160)
        ]
    });

    assert.equal(db.version, 'remote-test');
    assert.equal(db.maxFactoryBytes, 50000);
    assert.ok(db.tokens.includes('adPlacements'), 'built-in tokens should stay active');
    assert.ok(db.tokens.includes('paidAdRendererFactory'), 'safe remote tokens should be accepted');
    assert.equal(db.tokens.includes('bad-token'), false);
});

test('webpack factory matcher uses the active token database and size guard', () => {
    const h = createTestHarness({
        storage: {
            ytab_webpack_signature_cache: {
                version: 'cached-test',
                updated: '2026-06-28',
                maxFactoryBytes: 80,
                tokens: ['paidAdRendererFactory']
            }
        }
    });

    assert.equal(h.state.webpackSignatureSource, 'cached');
    assert.equal(h.state.webpackSignatureVersion, 'cached-test');
    assert.equal(h.webpackFactoryMatchesAdSignature('function(){return paidAdRendererFactory && true;}'), true);
    assert.equal(h.webpackFactoryMatchesAdSignature('function(){return ordinaryRenderer && true;}'), false);
    assert.equal(h.webpackFactoryMatchesAdSignature(`function(){return ${'paidAdRendererFactory'.repeat(8)};}`), false);
});

// ========== DASH / HLS manifest scrub ==========

test('manifest scrub removes HLS ctier ad segments and keeps content segments', () => {
    const manifest = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXTINF:4.0,',
        'https://rr1---sn.googlevideo.com/videoplayback?id=content-1&ctier=V',
        '#EXTINF:5.0,',
        'https://rr1---sn.googlevideo.com/videoplayback?id=ad-1&ctier=SA',
        '#EXT-X-DISCONTINUITY',
        '#EXTINF:4.0,',
        'https://rr1---sn.googlevideo.com/videoplayback?id=content-2&ctier=V'
    ].join('\n');

    const result = harness.scrubAdManifestText(manifest);

    assert.equal(result.changed, true);
    assert.equal(harness.manifestTextMightContainAds(result.text), false);
    assert.match(result.text, /content-1/);
    assert.match(result.text, /content-2/);
    assert.doesNotMatch(result.text, /ad-1|ctier=SA/);
});

test('manifest scrub removes DASH ad representations with ctier segments', () => {
    const manifest = [
        '<MPD>',
        '<Period>',
        '<AdaptationSet>',
        '<Representation id="main"><BaseURL>https://rr1---sn.googlevideo.com/videoplayback?id=content&ctier=V</BaseURL></Representation>',
        '<Representation id="ad-sabr"><BaseURL>https://rr1---sn.googlevideo.com/videoplayback?id=ad&ctier=SR</BaseURL></Representation>',
        '</AdaptationSet>',
        '</Period>',
        '</MPD>'
    ].join('');

    const result = harness.scrubAdManifestText(manifest);

    assert.equal(result.changed, true);
    assert.match(result.text, /id="main"/);
    assert.doesNotMatch(result.text, /ad-sabr|ctier=SR/);
});

// ========== Server-side ad detection ==========

test('server-stitched ad signal is measured without treating it as pruned JSON', () => {
    const h = createTestHarness();
    const playerResponse = {
        playerResponse: {
            videoDetails: { videoId: 'abc123' },
            streamingData: { formats: [{ itag: 18 }] },
            serverStitchedAd: true
        }
    };

    const signal = h.detectServerStitchedAdSignal(playerResponse);
    assert.ok(signal);
    assert.equal(signal.videoId, 'abc123');
    assert.equal(h.pruneObject(playerResponse, 'https://www.youtube.com/youtubei/v1/player'), false);
    assert.equal(h.state.stats.ssaiDetected, 1);
    assert.match(h.buildDiagnosticsReport(), /SSAI signals: detected=1/);
    assert.match(h.buildDiagnosticsReport(), /lastUrl=www\.youtube\.com\/youtubei\/v1\/player/);
});

test('server-stitched ad signal de-duplicates repeated parses for the same video and endpoint', () => {
    const h = createTestHarness();
    const playerResponse = {
        videoDetails: { videoId: 'dedupe1' },
        serverStitchedAd: true
    };

    h.pruneObject(playerResponse, '/youtubei/v1/player');
    h.pruneObject(playerResponse, '/youtubei/v1/player');

    assert.equal(h.state.stats.ssaiDetected, 1);
});

// ========== Performance budgets ==========

test('parseUBOFilterList processes a 50k-line filter list within budget', () => {
    const lines = [];
    for (let i = 0; i < 50000; i++) {
        if (i % 3 === 0) lines.push(`youtube.com##.ad-container-${i}`);
        else if (i % 3 === 1) lines.push(`||youtube.com/pagead/${i}`);
        else lines.push(`! comment line ${i}`);
    }
    const text = lines.join('\n');
    const start = performance.now();
    const result = harness.parseUBOFilterList(text);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 5000, `Filter parsing took ${elapsed.toFixed(0)}ms, budget is 5000ms`);
    assert.ok(result.filterCount > 0);
});

test('pruneObject processes a large player response within budget', () => {
    const response = {
        videoDetails: { videoId: 'perf-test' },
        streamingData: { adaptiveFormats: Array.from({ length: 200 }, (_, i) => ({ itag: i, url: `https://rr.google.com/vid?id=${i}` })) },
        adPlacements: Array.from({ length: 50 }, () => ({ adPlacementRenderer: { renderer: { adSlotRenderer: {} } } })),
        playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
    };
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
        const copy = JSON.parse(JSON.stringify(response));
        harness.pruneObject(copy);
    }
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 2000, `100x pruneObject took ${elapsed.toFixed(0)}ms, budget is 2000ms`);
});

test('webpackFactoryMatchesAdSignature scans within budget', () => {
    const factory = 'function(){' + 'var x=1;'.repeat(5000) + 'return adPlacements;}';
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
        harness.webpackFactoryMatchesAdSignature(factory);
    }
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 1000, `1000x webpack scan took ${elapsed.toFixed(0)}ms, budget is 1000ms`);
});

// ========== Signed filter manifest ==========

test('signed filter manifest accepts the committed filter list', async () => {
    const manifest = harness.sanitizeFilterManifest(filterManifest);

    assert.ok(manifest);
    assert.equal(manifest.sha256, filterManifest.sha256);
    assert.equal(
        await harness.verifyEd25519Signature(filterText, filterSignature, filterManifest.publicKey),
        true
    );
});

test('signed filter manifest rejects tampered filter content', async () => {
    assert.equal(
        await harness.verifyEd25519Signature(`${filterText}\n! tampered`, filterSignature, filterManifest.publicKey),
        false
    );
});

test('signed filter manifest rejects untrusted public keys', () => {
    const manifest = { ...filterManifest, publicKey: filterManifest.publicKey.replace(/.$/, 'A') };

    assert.equal(harness.sanitizeFilterManifest(manifest), null);
});

// ========== signed webpack signature manifest ==========

test('signed webpack signature manifest accepts the committed database', async () => {
    const manifest = harness.sanitizeFilterManifest(webpackSigManifest);

    assert.ok(manifest);
    assert.equal(manifest.sha256, webpackSigManifest.sha256);
    assert.equal(
        await harness.verifyEd25519Signature(webpackSigText, webpackSigSignature, webpackSigManifest.publicKey),
        true
    );
});

test('signed webpack signature manifest rejects tampered database', async () => {
    assert.equal(
        await harness.verifyEd25519Signature(`${webpackSigText}\n{"tampered":true}`, webpackSigSignature, webpackSigManifest.publicKey),
        false
    );
});

test('signed webpack signature manifest uses the same trusted public key as filters', () => {
    assert.equal(webpackSigManifest.publicKey, filterManifest.publicKey);
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

test('request guard blocks ad-exclusive endpoints without swallowing mixed telemetry', () => {
    assert.equal(harness.isKnownAdRequestUrl('https://googleads.g.doubleclick.net/pagead/id'), true);
    assert.equal(harness.isKnownAdRequestUrl('https://www.google.com/pagead/lvz?x=1'), true);
    assert.equal(harness.isKnownAdRequestUrl('/youtubei/v1/player/ad_break'), true);
    assert.equal(harness.isKnownAdRequestUrl('/api/stats/ads'), true);
    assert.equal(harness.isKnownAdRequestUrl('/youtubei/v1/log_event'), false);
    assert.equal(harness.isKnownAdRequestUrl('/generate_204?check=1'), false);
    assert.equal(harness.isKnownAdRequestUrl('/youtubei/v1/player'), false);
});

test('YouTube TV tenx_player uses the same no-ad request and response contract', () => {
    assert.equal(harness.PLAYER_ENDPOINT_RE.test('https://tv.youtube.com/youtubei/v1/tenx_player'), true);
    assert.equal(harness.matchesInterceptPattern('https://tv.youtube.com/youtubei/v1/tenx_player'), true);
    assert.ok(harness.DEFAULT_FILTERS.cosmeticSelectors.includes('ytu-ads-title-tray'));
});

test('RYD resolves the rendered dislike control instead of hidden duplicate buttons', () => {
    const hiddenBefore = {
        isConnected: true,
        getBoundingClientRect: () => ({ width: 0, height: 0 }),
    };
    const visible = {
        isConnected: true,
        getBoundingClientRect: () => ({ width: 56, height: 40 }),
    };
    const hiddenAfter = {
        isConnected: true,
        getBoundingClientRect: () => ({ width: 0, height: 0 }),
    };
    const root = { querySelectorAll: () => [hiddenBefore, visible, hiddenAfter] };
    assert.equal(harness.findRydDislikeButton(root), visible);
});

// ========== Closed-breakage replay fixtures ==========

test('issue #2 replay: pruneObject preserves streamingData and comments on a watch-page player response', () => {
    const playerResponse = {
        videoDetails: { videoId: 'replay_issue2' },
        playabilityStatus: { status: 'OK' },
        streamingData: { adaptiveFormats: [{ itag: 137 }, { itag: 140 }] },
        adPlacements: [{ adPlacementRenderer: {} }],
        playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
        adSlots: [{ adSlotRenderer: {} }],
        frameworkUpdates: { entityBatchUpdate: {} },
    };
    const browseResponse = {
        contents: {
            twoColumnWatchNextResults: {
                results: {
                    results: {
                        contents: [
                            { videoPrimaryInfoRenderer: {} },
                            { videoSecondaryInfoRenderer: {} },
                            { itemSectionRenderer: { contents: [{ commentRenderer: { text: 'test comment' } }] } }
                        ]
                    }
                }
            }
        }
    };

    const pruned = harness.pruneObject(playerResponse);
    assert.equal(pruned, true);
    assert.ok(playerResponse.streamingData, 'streamingData must survive pruning');
    assert.ok(playerResponse.streamingData.adaptiveFormats, 'adaptiveFormats must survive pruning');
    assert.equal(playerResponse.streamingData.adaptiveFormats.length, 2);
    assert.ok(playerResponse.playabilityStatus, 'playabilityStatus must survive pruning');
    assert.equal(playerResponse.playabilityStatus.status, 'OK');
    assert.equal(playerResponse.adPlacements, undefined, 'adPlacements must be removed');
    assert.equal(playerResponse.playerAds, undefined, 'playerAds must be removed');

    const browsePruned = harness.pruneObject(browseResponse);
    assert.equal(browsePruned, false, 'browse response without ads should not be pruned');
    assert.ok(browseResponse.contents.twoColumnWatchNextResults.results.results.contents[2].itemSectionRenderer,
        'comments section must survive pruning');
});

test('issue #2 replay: rewriteRequestBodyText does not inject clientScreen', () => {
    const body = JSON.stringify({
        context: {
            client: { clientName: 'WEB', clientVersion: '2.20260101' }
        },
        playbackContext: {
            contentPlaybackContext: { autoCaptionsDefaultOn: false }
        }
    });
    const result = harness.rewriteRequestBodyText(body);
    assert.ok(result, 'should inject noAd flag');
    const parsed = JSON.parse(result);
    assert.equal(parsed.context.client.clientScreen, undefined, 'clientScreen rewrite must not exist');
    assert.equal(parsed.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd, true);
});

test('issue #1 replay: pruneObject handles multi-video navigation without blocking playback', () => {
    const videos = [
        { videoDetails: { videoId: 'vid1' }, streamingData: { formats: [{ itag: 18 }] }, adPlacements: [{}] },
        { videoDetails: { videoId: 'vid2' }, streamingData: { formats: [{ itag: 18 }] }, playerAds: [{}] },
        { videoDetails: { videoId: 'vid3' }, streamingData: { formats: [{ itag: 18 }] }, adSlots: [{}] },
    ];

    for (const response of videos) {
        harness.pruneObject(response);
        assert.ok(response.streamingData, `streamingData must survive for ${response.videoDetails.videoId}`);
        assert.ok(response.streamingData.formats.length > 0);
    }
});

// ========== Original audio track forcing ==========

test('pickOriginalAudioTrack selects explicitly marked original audio', () => {
    const tracks = [
        { id: 'en-dub', displayName: 'English dubbed audio' },
        { id: 'ja-original', displayName: 'Japanese (Original)' },
    ];

    const selected = harness.pickOriginalAudioTrack(tracks, tracks[0]);

    assert.equal(selected, tracks[1]);
    assert.equal(harness.audioTrackHasOriginalMarker(selected), true);
});

test('pickOriginalAudioTrack returns null when current audio is already original', () => {
    const tracks = [
        { id: 'en-original', displayName: 'English Original audio' },
        { id: 'es-dub', displayName: 'Spanish dubbed audio' },
    ];

    assert.equal(harness.pickOriginalAudioTrack(tracks, tracks[0]), null);
});

test('applyOriginalAudioTrack uses the player API when enabled', () => {
    const h = createTestHarness();
    h.state.features.forceOriginalAudio = true;
    const tracks = [
        { id: 'en-auto', audioTrack: { name: 'English translated' } },
        { id: 'ko-original', audioTrack: { name: 'Korean Original' } },
    ];
    let selected = null;
    const player = {
        getAvailableAudioTracks: () => tracks,
        getAudioTrack: () => tracks[0],
        setAudioTrack: track => { selected = track; },
    };

    assert.equal(h.applyOriginalAudioTrack(player), true);
    assert.equal(selected, tracks[1]);
});

// ========== Userscript-manager diagnostics ==========

test('injection diagnostics flag late userscript-manager startup', () => {
    const h = createTestHarness({ documentReadyState: 'interactive', performanceNow: 2400 });
    const status = h.getInjectionTimingStatus();

    assert.equal(status.likelyLate, true);
    assert.match(status.description, /Allow User Scripts|document-start/);
    assert.match(h.buildDiagnosticsReport(), /Injection status: Late injection suspected/);
});

test('injection diagnostics confirm document-start startup separately from rule breakage', () => {
    const h = createTestHarness({ documentReadyState: 'loading', performanceNow: 24 });
    const status = h.getInjectionTimingStatus();

    assert.equal(status.likelyLate, false);
    assert.equal(status.title, 'Document-start confirmed');
    assert.match(status.description, /refresh rules or check engine health/i);
});

test('userscript diagnostics label DNR match evidence as extension-only', () => {
    const h = createTestHarness();
    const report = h.buildDiagnosticsReport();

    assert.match(report, /DNR matched rules: status=not-extension/);
    assert.match(h.formatDnrDiagnosticsReport(), /total=0/);
});

test('extension DNR diagnostics sanitize, merge, and format match counts without URLs', () => {
    const h = createTestHarness({ extensionBuild: true });
    const now = Date.now();
    const raw = {
        status: 'available',
        total: 900,
        matches: [
            { ruleId: 19, count: 2, url: 'https://private.example/token' },
            { ruleId: 4, count: 1 },
            { ruleId: 19, count: 3 },
            { ruleId: 5, count: -1 },
            { ruleId: 'bad', count: 7 }
        ],
        lastMatchedAt: now,
        requestUrl: 'https://private.example/raw'
    };

    const safe = JSON.parse(JSON.stringify(h.sanitizeDnrDiagnostics(raw)));
    assert.equal(safe.total, 6);
    assert.deepEqual(safe.matches, [
        { ruleId: 4, count: 1 },
        { ruleId: 19, count: 5 }
    ]);
    const formatted = h.formatDnrDiagnosticsReport(raw);
    assert.match(formatted, /status=available; window=5m; total=6; rules=4x1, 19x5/);
    assert.equal(formatted.includes('private'), false);
    const presentation = h.getDnrDiagnosticsPresentation(raw);
    assert.equal(presentation.tone, 'success');
    assert.match(presentation.title, /6 recent network matches/);
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
    assert.equal(h.__storage.ytab_feature_overrides.channelBlocker, true);
    assert.equal(h.__storage.ytab_channelBlocker, undefined);
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

test('legacy context-menu channel blocker key migrates into feature overrides', () => {
    const h = createTestHarness({
        storage: { ytab_channelBlocker: true }
    });

    assert.equal(h.state.features.channelBlocker, true);
    assert.equal(h.__storage.ytab_feature_overrides.channelBlocker, true);
    assert.equal(h.__storage.ytab_channelBlocker, null);
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

test('migration parser reads BlockTube-style maps and generic entries', () => {
    const parsed = harness.parseMigrationPayload(JSON.stringify({
        'UCabcdefghijklmnopqrstuv': 'channel',
        '@Creator': 'channel',
        'spoiler phrase': 'title',
        blockedChannels: [{ type: 'channel', value: 'https://www.youtube.com/@OtherCreator' }],
        blockedKeywords: [{ type: 'keyword', value: '/sponsor|promo/i' }]
    }));

    assert.equal(parsed.channels, 'UCabcdefghijklmnopqrstuv\n@Creator\nhttps://www.youtube.com/@OtherCreator');
    assert.equal(parsed.keywords, 'spoiler phrase\n/sponsor|promo/i');
});

test('migration import merges channel and keyword entries and previews rejects', () => {
    const h = createTestHarness({
        storage: {
            ytab_channel_blocklist: '@Existing',
            ytab_keyword_blocklist: 'old keyword'
        }
    });
    const longKeyword = `keyword:${'x'.repeat(240)}`;
    const result = h.importSettingsPayload([
        'channel:@Creator',
        'keyword:spoiler phrase',
        longKeyword
    ].join('\n'), 'migration');

    assert.equal(result.ok, true);
    assert.equal(result.channels, 1);
    assert.equal(result.keywords, 1);
    assert.equal(result.rejected.length, 1);
    assert.equal(h.__storage.ytab_channel_blocklist, '@Existing\n@Creator');
    assert.equal(h.__storage.ytab_keyword_blocklist, 'old keyword\nspoiler phrase');
    assert.equal(h.__storage.ytab_feature_overrides.channelBlocker, true);
    assert.equal(h.__storage.ytab_feature_overrides.keywordBlocker, true);
});

test('migration import classifies plain text as keywords when not a channel entry', () => {
    const h = createTestHarness({ storage: {} });
    const result = h.importSettingsPayload('some random phrase\nanother word', 'migration');
    assert.equal(result.ok, true);
    assert.equal(result.keywords, 2);
    assert.equal(result.channels, 0);
    assert.equal(h.__storage.ytab_keyword_blocklist, 'some random phrase\nanother word');
});

// ========== community service consent ==========

function makeCountingXhr() {
    const calls = [];
    const stub = (req) => {
        calls.push({ method: req.method || 'GET', url: req.url });
        // Resolve immediately so awaited wrappers settle in tests.
        if (req && typeof req.onload === 'function') {
            req.onload({ status: 404, responseText: '', responseHeaders: '' });
        }
    };
    stub.calls = calls;
    stub.community = () => calls.filter(c =>
        /sponsor\.ajay\.app|dearrow-thumb\.ajay\.app|returnyoutubedislikeapi\.com/.test(c.url));
    return stub;
}

test('community consent defaults to unset for new and legacy installs', () => {
    const h = createTestHarness({ storage: {} });
    const consent = h.getCommunityConsent();
    assert.equal(consent.version, 1);
    for (const service of h.COMMUNITY_CONSENT_SERVICES) {
        assert.equal(consent.services[service], 'unset');
        assert.equal(h.hasServiceConsent(service), false);
    }
});

test('community consent rejects invalid, wrong-version, and garbage payloads', () => {
    for (const bad of [null, 42, 'granted', [], { version: 99, services: { sponsorBlock: 'granted' } },
        { version: 1, services: { sponsorBlock: 'yes-please' } }]) {
        const h = createTestHarness({ storage: { ytab_community_consent: bad } });
        const consent = h.getCommunityConsent();
        for (const service of h.COMMUNITY_CONSENT_SERVICES) {
            assert.equal(consent.services[service], 'unset', JSON.stringify(bad));
        }
    }
});

test('no community request is made before consent, for any service', async () => {
    const gmXhr = makeCountingXhr();
    const h = createTestHarness({ storage: {}, gmXhr });
    assert.equal(await h.sponsorBlockFetchBucket('abcd'), null);
    assert.equal(await h.dearrowFetchBucket('abcd'), null);
    assert.equal(await h.rydFetch('dQw4w9WgXcQ'), null);
    h.reportSponsorBlockView('segment-uuid');
    assert.equal(gmXhr.community().length, 0);
});

test('granting consent enables exactly that service', async () => {
    const gmXhr = makeCountingXhr();
    const h = createTestHarness({ storage: {}, gmXhr });
    h.setServiceConsent('sponsorBlock', true);
    await h.sponsorBlockFetchBucket('abcd');
    assert.equal(gmXhr.community().length, 1);
    assert.match(gmXhr.community()[0].url, /sponsor\.ajay\.app\/api\/skipSegments\/abcd/);
    // Other services stay gated.
    await h.dearrowFetchBucket('abcd');
    await h.rydFetch('dQw4w9WgXcQ');
    h.reportSponsorBlockView('segment-uuid');
    assert.equal(gmXhr.community().length, 1);
});

test('view reports require both segment consent and report consent', async () => {
    const gmXhr = makeCountingXhr();
    const h = createTestHarness({ storage: {}, gmXhr });
    h.setServiceConsent('sponsorBlockViewReports', true);
    h.reportSponsorBlockView('segment-uuid');
    assert.equal(gmXhr.community().length, 0, 'reports without segment consent must not fire');
    h.setServiceConsent('sponsorBlock', true);
    h.reportSponsorBlockView('segment-uuid');
    assert.equal(gmXhr.community().length, 1);
    assert.match(gmXhr.community()[0].url, /viewedVideoSponsorTime\?UUID=segment-uuid/);
});

test('revoking segment consent also revokes dependent view reporting', () => {
    const h = createTestHarness({ storage: {} });
    h.setServiceConsent('sponsorBlock', true);
    h.setServiceConsent('sponsorBlockViewReports', true);
    h.setServiceConsent('sponsorBlock', false);
    const consent = h.getCommunityConsent();
    assert.equal(consent.services.sponsorBlock, 'denied');
    assert.equal(consent.services.sponsorBlockViewReports, 'denied');
});

test('revocation persists, blocks future requests, and bumps the consent generation', async () => {
    const gmXhr = makeCountingXhr();
    const h = createTestHarness({ storage: {}, gmXhr });
    h.setServiceConsent('dearrow', true);
    await h.dearrowFetchBucket('abcd');
    assert.equal(gmXhr.community().length, 1);
    const genBefore = h.state.communityConsentGeneration.dearrow;
    h.setServiceConsent('dearrow', false);
    assert.equal(h.state.communityConsentGeneration.dearrow, genBefore + 1);
    await h.dearrowFetchBucket('abcd');
    assert.equal(gmXhr.community().length, 1, 'no request after revocation');
    assert.equal(h.__storage.ytab_community_consent.services.dearrow, 'denied');
});

test('consent report lists every service state for diagnostics', () => {
    const h = createTestHarness({ storage: {} });
    h.setServiceConsent('returnYoutubeDislike', true);
    const report = h.getCommunityConsentReport();
    assert.match(report, /sponsorBlock=unset/);
    assert.match(report, /returnYoutubeDislike=granted/);
});


// ========== user regex bounding (ReDoS) ==========

test('validateSafeRegexSource rejects exponential and unsupported constructs', () => {
    const h = harness;
    assert.equal(h.validateSafeRegexSource('(a+)+').reason, 'nestedQuantifier');
    assert.equal(h.validateSafeRegexSource('(a|aa)+').reason, 'nestedQuantifier');
    assert.equal(h.validateSafeRegexSource('(.*a)*').reason, 'nestedQuantifier');
    assert.equal(h.validateSafeRegexSource('((b+)c)+').reason, 'nestedQuantifier');
    // A quantified group with only literals inside is linear-safe.
    assert.equal(h.validateSafeRegexSource('((b)c)+').ok, true);
    assert.equal(h.validateSafeRegexSource('(a)' + String.fromCharCode(92) + '1').reason, 'backreference');
    assert.equal(h.validateSafeRegexSource('a(?=b)').reason, 'lookaround');
    assert.equal(h.validateSafeRegexSource('(?<=a)b').reason, 'lookaround');
    assert.equal(h.validateSafeRegexSource('(?<!a)b').reason, 'lookaround');
    assert.equal(h.validateSafeRegexSource('a'.repeat(300)).reason, 'tooLong');
    assert.equal(h.validateSafeRegexSource('(a').reason, 'syntax');
});

test('validateSafeRegexSource accepts common safe blocklist patterns', () => {
    const h = harness;
    for (const src of [
        'free.*robux',
        'v-?bucks',
        '(free robux|vbucks giveaway)',
        '^MrBeast$',
        '(abc)+',
        'sponsored?' + String.fromCharCode(92) + 's+content',
        '[0-9]{3,} subscribers',
        'shorts|reels'
    ]) {
        assert.equal(h.validateSafeRegexSource(src).ok, true, src);
    }
});

test('rejected regex lines become line-numbered invalid entries, never substring matchers', () => {
    const entries = harness.parseBlocklist('good words\n/(a+)+$/\n/free.*stuff/');
    assert.equal(entries.length, 3);
    assert.equal(entries[0].type, 'string');
    assert.equal(entries[1].type, 'invalid');
    assert.equal(entries[1].reason, 'nestedQuantifier');
    assert.equal(entries[1].line, 2);
    assert.equal(entries[2].type, 'regex');
    // The invalid line must not match as a literal string either.
    assert.equal(harness.matchesList('/(a+)+$/ is in this title', entries.slice(1, 2)), false);
});

test('malformed regex syntax is surfaced instead of silently degrading', () => {
    const entries = harness.parseBlocklist('/[unclosed/');
    assert.equal(entries[0].type, 'invalid');
    assert.equal(entries[0].reason, 'syntax');
});

test('blocklists cap active entries and matching input length', () => {
    const raw = Array.from({ length: 600 }, (_, i) => `word${i}`).join('\n');
    const entries = harness.parseBlocklist(raw);
    assert.equal(entries.length, 500);
    // Long haystacks are truncated before matching.
    const longTitle = 'x'.repeat(10000) + ' target';
    assert.equal(harness.matchesList(longTitle, harness.parseBlocklist('target')), false,
        'match input must be capped, so a suffix beyond the cap cannot match');
    assert.equal(harness.matchesList('target ' + 'x'.repeat(10000), harness.parseBlocklist('target')), true);
});

test('parsed blocklists are cached per settings revision', () => {
    const h = createTestHarness({ storage: { ytab_keyword_blocklist: '/free.*stuff/' } });
    const first = h.getParsedBlocklist('keyword_blocklist');
    const second = h.getParsedBlocklist('keyword_blocklist');
    assert.equal(first, second, 'same raw text must return the cached compiled entries');
    h.__storage.ytab_keyword_blocklist = '/free.*stuff/\nmore';
    const third = h.getParsedBlocklist('keyword_blocklist');
    assert.notEqual(second, third, 'changed raw text must recompile');
    assert.equal(third.length, 2);
});

test('safe user regex corpus matches long renderer titles within budget', () => {
    const h = harness;
    const list = h.parseBlocklist([
        '/free.*robux/', '/v-?bucks/', '/^clickbait/', '/(giveaway|scam alert)/', 'plain keyword'
    ].join('\n'));
    const titles = [];
    for (let i = 0; i < 2000; i++) {
        titles.push(('An unusually long renderer title about nothing in particular ' + i + ' ').repeat(8));
    }
    const startTime = performance.now();
    let matches = 0;
    for (const title of titles) if (h.matchesList(title, list)) matches++;
    const elapsed = performance.now() - startTime;
    assert.equal(matches, 0);
    assert.ok(elapsed < 1000, `matching took ${elapsed.toFixed(0)}ms, budget is 1000ms`);
});


// ========== settings import: versioned, preflighted, atomic, undoable ==========

function exportEnvelope(settings, overrides = {}) {
    return JSON.stringify({
        app: 'YoutubeAdblock',
        version: 1,
        appVersion: '0.5.23',
        exportedAt: '2026-08-14T00:00:00.000Z',
        settings,
        ...overrides
    });
}

test('import rejects a future settings schema version', () => {
    const h = createTestHarness({ storage: {} });
    const raw = exportEnvelope({ keyword_blocklist: 'spam' }, { version: 99 });
    const result = h.importSettingsPayload(raw, 'json');
    assert.equal(result.ok, false);
    assert.match(result.error, /schema v99/);
    assert.equal(h.__storage.ytab_keyword_blocklist, undefined, 'nothing may be written');
});

test('import rejects an export from a different application', () => {
    const h = createTestHarness({ storage: {} });
    const raw = exportEnvelope({ keyword_blocklist: 'spam' }, { app: 'SomeOtherBlocker' });
    const result = h.importSettingsPayload(raw, 'json');
    assert.equal(result.ok, false);
    assert.match(result.error, /different application/);
    assert.equal(h.__storage.ytab_keyword_blocklist, undefined);
});

test('import rejects invalid fields with a per-field reason and writes nothing', () => {
    const h = createTestHarness({ storage: { ytab_keyword_blocklist: 'original' } });
    const bad = exportEnvelope({ filter_url: 'javascript:alert(1)', keyword_blocklist: 'new' });
    const result = h.importSettingsPayload(bad, 'json');
    assert.equal(result.ok, false);
    assert.match(result.error, /filter_url/);
    assert.equal(h.__storage.ytab_keyword_blocklist, 'original', 'valid fields must not be applied');
});

test('import rejects wrong-typed enabled and feature_overrides', () => {
    const h = createTestHarness({ storage: {} });
    assert.equal(h.importSettingsPayload(exportEnvelope({ enabled: 'yes' }), 'json').ok, false);
    assert.equal(h.importSettingsPayload(exportEnvelope({ feature_overrides: [1, 2] }), 'json').ok, false);
});

test('import rejects oversized field payloads', () => {
    const h = createTestHarness({ storage: {} });
    const huge = 'x'.repeat(70000);
    const result = h.importSettingsPayload(exportEnvelope({ keyword_blocklist: huge }), 'json');
    assert.equal(result.ok, false);
    assert.match(result.error, /larger than the supported limit/);
});

test('preview reports an exact add/change/clear diff without writing', () => {
    const h = createTestHarness({ storage: { ytab_keyword_blocklist: 'old', ytab_ad_allowlist: 'keepme' } });
    const raw = exportEnvelope({ keyword_blocklist: 'new', channel_blocklist: 'added', ad_allowlist: '' });
    const preview = h.importSettingsPayload(raw, 'json-preview');
    assert.equal(preview.ok, true);
    const byKey = Object.fromEntries(preview.diff.map(d => [d.key, d.kind]));
    assert.equal(byKey.keyword_blocklist, 'change');
    assert.equal(byKey.channel_blocklist, 'add');
    assert.equal(byKey.ad_allowlist, 'remove');
    assert.equal(h.__storage.ytab_keyword_blocklist, 'old', 'preview must not write');
});

test('preview reports unknown keys instead of silently dropping them', () => {
    const h = createTestHarness({ storage: {} });
    const raw = exportEnvelope({ keyword_blocklist: 'spam', mystery_setting: true });
    const preview = h.importSettingsPayload(raw, 'json-preview');
    assert.equal(preview.ok, true);
    assert.deepEqual([...preview.unknown], ['mystery_setting']);
});

test('a confirmed import commits every field and supports one-click undo', () => {
    const h = createTestHarness({ storage: { ytab_keyword_blocklist: 'before', ytab_enabled: true } });
    const raw = exportEnvelope({
        keyword_blocklist: 'after',
        channel_blocklist: 'AddedChannel',
        enabled: false,
        feature_overrides: { keywordBlocker: true }
    });
    const result = h.importSettingsPayload(raw, 'json');
    assert.equal(result.ok, true);
    assert.equal(h.__storage.ytab_keyword_blocklist, 'after');
    assert.equal(h.__storage.ytab_channel_blocklist, 'AddedChannel');
    assert.equal(h.__storage.ytab_enabled, false);
    assert.equal(h.hasUndoableImport(), true);

    assert.equal(h.undoLastImport(), true);
    assert.equal(h.__storage.ytab_keyword_blocklist, 'before');
    assert.equal(h.__storage.ytab_channel_blocklist, '');
    assert.equal(h.__storage.ytab_enabled, true);
    assert.equal(h.hasUndoableImport(), false, 'undo is single-use per import');
});

test('a write failure part-way through rolls back every applied change', () => {
    const h = createTestHarness({ storage: { ytab_keyword_blocklist: 'before', ytab_channel_blocklist: 'before-ch' } });
    const validation = h.validateImportPayload({
        settings: { keyword_blocklist: 'after', channel_blocklist: 'after-ch', ad_allowlist: 'after-alw' }
    });
    assert.equal(validation.ok, true);
    // Fail the third write to prove the first two are reverted.
    h.__failWriteAfter(2);
    const applied = h.applyValidatedSettings(validation.values);
    assert.equal(applied.ok, false);
    assert.match(applied.error, /rolled back/);
    assert.equal(h.__storage.ytab_keyword_blocklist, 'before');
    assert.equal(h.__storage.ytab_channel_blocklist, 'before-ch');
    assert.equal(h.hasUndoableImport(), false);
});

test('a version-1 export with no envelope metadata still imports', () => {
    const h = createTestHarness({ storage: {} });
    const legacy = JSON.stringify({ keyword_blocklist: 'legacy entry' });
    const result = h.importSettingsPayload(legacy, 'json');
    assert.equal(result.ok, true);
    assert.equal(h.__storage.ytab_keyword_blocklist, 'legacy entry');
});


// ========== signed update freshness (rollback / freeze / mix-and-match) ==========

test('committed manifests are schema v2 with role, revision, expiry, and key id', () => {
    for (const [manifest, role, content] of [
        [filterManifest, 'filters', 'youtube-adblock-filters.txt'],
        [webpackSigManifest, 'webpack-signatures', 'webpack-ad-signatures.json']
    ]) {
        assert.equal(manifest.schemaVersion, 2);
        assert.equal(manifest.role, role);
        assert.equal(manifest.signedContent, content);
        assert.equal(manifest.keyId, 'ytab-2026-08');
        assert.ok(Number.isInteger(manifest.revision) && manifest.revision >= 1);
        assert.ok(Date.parse(manifest.expires) > Date.now(), 'committed manifest must not be expired');
    }
});

test('a correctly signed, fresh manifest is accepted for its own role', async () => {
    const h = createTestHarness({ storage: {} });
    const result = await h.verifySignedManifest(
        JSON.stringify(filterManifest), filterManifestSignature, 'filters');
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.manifest.revision, filterManifest.revision);
});

test('a manifest signature cannot be replayed across artifact roles', async () => {
    const h = createTestHarness({ storage: {} });
    // The filters manifest, presented where the webpack-signature one is expected.
    const crossRole = await h.verifySignedManifest(
        JSON.stringify(filterManifest), filterManifestSignature, 'webpack-signatures');
    assert.equal(crossRole.ok, false);
    assert.equal(crossRole.reason, 'invalid');
    // And the webpack manifest presented as the filters one.
    const reverse = await h.verifySignedManifest(
        JSON.stringify(webpackSigManifest), webpackSigManifestSignature, 'filters');
    assert.equal(reverse.ok, false);
});

test('a manifest whose role does not match its content file is rejected', async () => {
    const h = createTestHarness({ storage: {} });
    const mixed = { ...filterManifest, role: 'webpack-signatures' };
    const result = await h.verifySignedManifest(
        JSON.stringify(mixed), filterManifestSignature, 'webpack-signatures');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid');
});

test('tampering with any signed manifest field fails verification', async () => {
    const h = createTestHarness({ storage: {} });
    for (const patch of [{ revision: 99 }, { bytes: 1 }, { sha256: 'AAAA' }, { expires: '2099-01-01' }]) {
        const tampered = { ...filterManifest, ...patch };
        const result = await h.verifySignedManifest(
            JSON.stringify(tampered), filterManifestSignature, 'filters');
        assert.equal(result.ok, false, JSON.stringify(patch));
        assert.equal(result.reason, 'unsigned-manifest', JSON.stringify(patch));
    }
});

test('an unknown signing key id is rejected, supporting controlled rotation', async () => {
    const h = createTestHarness({ storage: {} });
    const rotated = { ...filterManifest, keyId: 'attacker-key' };
    const result = await h.verifySignedManifest(
        JSON.stringify(rotated), filterManifestSignature, 'filters');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid');
});

test('a replayed older revision is refused once a newer one was accepted', async () => {
    const h = createTestHarness({ storage: {} });
    h.recordAcceptedRevision('filters', 7);
    assert.equal(h.getHighestAcceptedRevision('filters'), 7);
    const replay = h.checkManifestFreshness({ role: 'filters', revision: 6, expiresAt: Date.now() + 100000 });
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, 'rollback');
    // The same revision is still acceptable (re-fetch of current data).
    assert.equal(h.checkManifestFreshness({ role: 'filters', revision: 7, expiresAt: Date.now() + 100000 }).ok, true);
    assert.equal(h.checkManifestFreshness({ role: 'filters', revision: 8, expiresAt: Date.now() + 100000 }).ok, true);
});

test('an expired manifest is refused even when correctly signed (freeze protection)', async () => {
    const h = createTestHarness({ storage: {} });
    const check = h.checkManifestFreshness(
        { role: 'filters', revision: 1, expiresAt: Date.parse('2020-01-01') });
    assert.equal(check.ok, false);
    assert.equal(check.reason, 'expired');
    // And through the full path, with a clock past the committed expiry.
    const future = Date.parse(filterManifest.expires) + 86400000;
    const result = await h.verifySignedManifest(
        JSON.stringify(filterManifest), filterManifestSignature, 'filters', future);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'expired');
});

test('the accepted revision floor only advances, never regresses', () => {
    const h = createTestHarness({ storage: {} });
    h.recordAcceptedRevision('filters', 5);
    h.recordAcceptedRevision('filters', 3);
    assert.equal(h.getHighestAcceptedRevision('filters'), 5);
    h.recordAcceptedRevision('filters', 9);
    assert.equal(h.getHighestAcceptedRevision('filters'), 9);
    // Roles keep independent floors.
    assert.equal(h.getHighestAcceptedRevision('webpack-signatures'), 0);
});


// ========== compliance dialog protection ==========

function fakeDialog(text, attrs = {}) {
    const store = { ...attrs };
    return {
        tagName: 'TP-YT-PAPER-DIALOG',
        textContent: text,
        hasAttribute: (k) => Object.prototype.hasOwnProperty.call(store, k),
        setAttribute: (k, v) => { store[k] = v; },
        getAttribute: (k) => (k in store ? store[k] : null),
        __store: store,
    };
}

function fakeRoot(nodesBySelector) {
    return {
        querySelectorAll: (sel) => nodesBySelector[sel] || [],
        querySelector: (sel) => (nodesBySelector[sel] || [])[0] || null,
    };
}

test('age and identity verification wording is recognized as a compliance dialog', () => {
    const h = harness;
    for (const text of [
        'We need to verify your age to continue',
        'Age verification required',
        'Please confirm that your face is visible',
        'Upload a photo ID to verify your identity',
        'Take a selfie to continue'
    ]) {
        assert.equal(h.isComplianceDialogElement(fakeDialog(text)), true, text);
    }
});

test('ordinary anti-adblock enforcement wording is not treated as a compliance dialog', () => {
    const h = harness;
    for (const text of [
        'Ad blockers are not allowed on YouTube',
        'It looks like you may be using an ad blocker',
        'Video player will be blocked after 3 videos'
    ]) {
        assert.equal(h.isComplianceDialogElement(fakeDialog(text)), false, text);
    }
});

test('scanning marks compliance dialogs once and counts them', () => {
    const h = createTestHarness({ storage: {} });
    const dialog = fakeDialog('Please verify your age to keep watching');
    const root = fakeRoot({ 'tp-yt-paper-dialog': [dialog] });
    const before = h.state.stats.complianceDialogs || 0;
    assert.equal(h.scanForComplianceDialogs(root), 1);
    assert.equal(dialog.getAttribute(h.COMPLIANCE_MARK_ATTR), '1');
    assert.equal(h.state.stats.complianceDialogs, before + 1);
    // Already-marked dialogs are not recounted on the next sweep.
    assert.equal(h.scanForComplianceDialogs(root), 0);
    assert.equal(h.state.stats.complianceDialogs, before + 1);
});

test('an enforcement popup without verification wording is left unmarked so it stays blockable', () => {
    const h = createTestHarness({ storage: {} });
    const dialog = fakeDialog('Ad blockers violate YouTube Terms of Service');
    const root = fakeRoot({ 'tp-yt-paper-dialog': [dialog] });
    assert.equal(h.scanForComplianceDialogs(root), 0);
    assert.equal(dialog.getAttribute(h.COMPLIANCE_MARK_ATTR), null);
});

test('marked compliance dialogs are reported as present without being hidden', () => {
    const h = createTestHarness({ storage: {} });
    const marked = fakeDialog('verify your age', { 'data-ytab-compliance': '1' });
    const root = fakeRoot({ '[data-ytab-compliance]': [marked] });
    assert.equal(h.hasVisibleComplianceDialog(root), true);
});

test('remote filter data can extend the compliance marker list', () => {
    const h = createTestHarness({ storage: {} });
    h.state.filters = { ...(h.state.filters || {}), complianceMarkers: ['bestätige dein alter'] };
    assert.equal(h.isComplianceDialogElement(fakeDialog('Bitte bestätige dein Alter')), true);
    // Junk entries are ignored rather than widening the match.
    h.state.filters.complianceMarkers = ['a', 12, null, 'x'.repeat(500)];
    assert.equal(h.isComplianceDialogElement(fakeDialog('a random unrelated dialog')), false);
});

test('cosmetic CSS exempts marked compliance dialogs from every hiding rule', () => {
    const h = createTestHarness({ storage: {} });
    h.state.features.cosmeticHiding = true;
    h.updateCosmeticCSS();
    const css = h.state.cosmeticStyleEl?.textContent || '';
    assert.ok(css.length > 0, 'cosmetic CSS should be generated');
    const rules = css.split('\n').filter(Boolean);
    for (const rule of rules) {
        assert.ok(rule.includes(':not([data-ytab-compliance])'),
            `every cosmetic rule must exempt compliance dialogs: ${rule}`);
    }
});
