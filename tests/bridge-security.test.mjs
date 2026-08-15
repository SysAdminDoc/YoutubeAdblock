import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const bridgeSource = fs.readFileSync(path.join(repoRoot, 'extension', 'bridge.js'), 'utf8');

const ALLOWED_KEY = '__ytab_ext_settings__';
const LOCAL_META_KEY = '__ytab_ext_settings_meta__';
const SYNC_META_KEY = '__ytab_ext_settings_sync_meta__';
const SYNC_CHUNK_PREFIX = '__ytab_ext_settings_sync_chunk_';
const EVT_REQ = 'ytab:page-request';
const EVT_RES = 'ytab:page-response';
const EVT_SYNC = 'ytab:settings-changed';
const EVT_DNR_REQ = 'ytab:dnr-diagnostics-request';
const EVT_DNR_RES = 'ytab:dnr-diagnostics-response';

function createBridgeEnv(options = {}) {
    const storageData = { ...(options.localStorage || {}) };
    const syncStorageData = { ...(options.syncStorage || {}) };
    const responses = [];
    const dispatched = [];
    const runtimeMessages = [];
    const listeners = {};
    let storageChangedCb = null;
    let messageListener = null;
    let pagehideListener = null;

    const mockDocument = {
        addEventListener(type, fn) {
            if (!listeners[type]) listeners[type] = [];
            listeners[type].push(fn);
        },
        dispatchEvent(event) {
            dispatched.push({ type: event.type, detail: event.detail });
            if (event.type === EVT_RES && event.detail) {
                responses.push(event.detail);
            }
            const fns = listeners[event.type];
            if (fns) fns.forEach(fn => fn(event));
        }
    };

    function storageGet(area, keys, cb) {
        const result = {};
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) {
            if (k in area) result[k] = area[k];
        }
        cb(result);
    }

    function storageSet(area, items, cb) {
        Object.assign(area, items);
        if (cb) cb();
    }

    function storageRemove(area, keys, cb) {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const key of list) {
            delete area[key];
        }
        if (cb) cb();
    }

    const mockChrome = {
        runtime: {
            lastError: null,
            onMessage: {
                addListener(fn) { messageListener = fn; }
            },
            sendMessage(message, cb) {
                runtimeMessages.push(message);
                let response;
                if (message?.type === 'ytab:get-dnr-diagnostics') {
                    response = options.dnrResponse || {
                        status: 'unavailable',
                        reason: 'api-unavailable',
                        windowMinutes: 5,
                        total: 0,
                        matches: [],
                        lastMatchedAt: 0
                    };
                } else if (message?.type === 'ytab:settings-read') {
                    response = options.brokerReadError
                        ? { ok: false, error: options.brokerReadError }
                        : { ok: true, value: storageData[ALLOWED_KEY] };
                } else if (message?.type === 'ytab:settings-write') {
                    if (options.brokerWriteError) {
                        response = { ok: false, error: options.brokerWriteError };
                    } else {
                        storageData[ALLOWED_KEY] = message.value;
                        response = { ok: true };
                    }
                } else {
                    response = { granted: false };
                }
                if (cb) cb(response);
            }
        },
        storage: {
            local: {
                get(keys, cb) {
                    storageGet(storageData, keys, cb);
                },
                set(items, cb) {
                    storageSet(storageData, items, cb);
                }
            },
            sync: {
                get(keys, cb) {
                    storageGet(syncStorageData, keys, cb);
                },
                set(items, cb) {
                    storageSet(syncStorageData, items, cb);
                },
                remove(keys, cb) {
                    storageRemove(syncStorageData, keys, cb);
                }
            },
            onChanged: {
                addListener(fn) { storageChangedCb = fn; }
            }
        }
    };

    const localStorageData = {};
    const mockLocalStorage = {
        getItem(k) { return localStorageData[k] || null; },
        setItem(k, v) { localStorageData[k] = v; },
        removeItem(k) { delete localStorageData[k]; }
    };

    const mockWindow = {
        addEventListener(type, fn, opts) {
            if (type === 'pagehide') pagehideListener = fn;
        }
    };

    const sandbox = vm.createContext({
        document: mockDocument,
        chrome: mockChrome,
        localStorage: mockLocalStorage,
        window: mockWindow,
        CustomEvent: class CustomEvent {
            constructor(type, opts) {
                this.type = type;
                this.detail = opts && opts.detail;
            }
        },
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
        Date: globalThis.Date,
        JSON: globalThis.JSON,
        Math: globalThis.Math,
        console: globalThis.console,
        Infinity: globalThis.Infinity
    });

    vm.runInContext(bridgeSource, sandbox);

    function sendRequest(detail) {
        const event = new sandbox.CustomEvent(EVT_REQ, { detail });
        mockDocument.dispatchEvent(event);
    }

    function requestDnrDiagnostics() {
        const event = new sandbox.CustomEvent(EVT_DNR_REQ);
        mockDocument.dispatchEvent(event);
    }

    return {
        sendRequest,
        requestDnrDiagnostics,
        responses,
        dispatched,
        runtimeMessages,
        storageData,
        syncStorageData,
        localStorageData,
        mockChrome,
        messageListener,
        storageChangedCb,
        pagehideListener,
        flush: () => new Promise(r => setTimeout(r, 200))
    };
}

function buildSyncStorage(value, updatedAt = 1000) {
    const serialized = JSON.stringify(value);
    const out = {
        [SYNC_META_KEY]: {
            version: 1,
            updatedAt,
            chunkCount: Math.ceil(serialized.length / (7 * 1024)),
            byteLength: serialized.length,
            oversized: false
        }
    };
    for (let i = 0; i < out[SYNC_META_KEY].chunkCount; i++) {
        out[`${SYNC_CHUNK_PREFIX}${i}`] = serialized.slice(i * 7 * 1024, (i + 1) * 7 * 1024);
    }
    return out;
}

function readSyncedPayload(env) {
    const meta = env.syncStorageData[SYNC_META_KEY];
    if (!meta || meta.oversized) return null;
    let serialized = '';
    for (let i = 0; i < meta.chunkCount; i++) {
        serialized += env.syncStorageData[`${SYNC_CHUNK_PREFIX}${i}`];
    }
    return JSON.parse(serialized);
}

test('rejects requests with non-allowlisted storage key', () => {
    const env = createBridgeEnv();
    env.sendRequest({ id: 'r1', op: 'get', key: 'secret_key' });
    assert.equal(env.responses.length, 1);
    assert.equal(env.responses[0].id, 'r1');
    assert.match(env.responses[0].error, /not allowed/);
});

test('rejects requests with missing id', () => {
    const env = createBridgeEnv();
    env.sendRequest({ op: 'get', key: ALLOWED_KEY });
    assert.equal(env.responses.length, 0);
});

test('rejects requests with id over 64 chars', () => {
    const env = createBridgeEnv();
    env.sendRequest({ id: 'x'.repeat(65), op: 'get', key: ALLOWED_KEY });
    assert.equal(env.responses.length, 0);
});

test('rejects requests with unknown op', async () => {
    const env = createBridgeEnv();
    env.sendRequest({ id: 'r1', op: 'delete', key: ALLOWED_KEY });
    await env.flush();
    const r = env.responses.find(r => r.id === 'r1');
    assert.ok(r);
    assert.match(r.error, /unknown op/);
});

test('rejects oversized set payloads', () => {
    const env = createBridgeEnv();
    const bigValue = 'x'.repeat(600 * 1024);
    env.sendRequest({ id: 'r1', op: 'set', key: ALLOWED_KEY, value: bigValue });
    const r = env.responses.find(r => r.id === 'r1');
    assert.ok(r);
    assert.match(r.error, /too large/);
});

test('accepts valid set within size limit', async () => {
    const env = createBridgeEnv();
    env.sendRequest({ id: 'r1', op: 'set', key: ALLOWED_KEY, value: { enabled: true } });
    await env.flush();
    const r = env.responses.find(r => r.id === 'r1');
    assert.ok(r);
    assert.equal(r.ok, true);
    assert.deepEqual(env.storageData[ALLOWED_KEY], { enabled: true });
});

test('GET coalescing: multiple GETs produce one broker read', async () => {
    const env = createBridgeEnv();
    env.storageData[ALLOWED_KEY] = { test: true };

    env.sendRequest({ id: 'g1', op: 'get', key: ALLOWED_KEY });
    env.sendRequest({ id: 'g2', op: 'get', key: ALLOWED_KEY });
    env.sendRequest({ id: 'g3', op: 'get', key: ALLOWED_KEY });

    await env.flush();

    const reads = env.runtimeMessages.filter(m => m.type === 'ytab:settings-read');
    // One hydration read at startup plus exactly one coalesced read.
    assert.equal(reads.length, 2, 'three page GETs must coalesce into a single broker read');
    for (const id of ['g1', 'g2', 'g3']) {
        const response = env.responses.find(r => r.id === id);
        assert.ok(response, `missing response for ${id}`);
        assert.deepEqual(response.value, { test: true });
    }
});

test('duplicate request IDs are silently dropped', async () => {
    const env = createBridgeEnv();
    env.storageData[ALLOWED_KEY] = { x: 1 };
    env.sendRequest({ id: 'dup1', op: 'get', key: ALLOWED_KEY });
    env.sendRequest({ id: 'dup1', op: 'get', key: ALLOWED_KEY });
    await env.flush();
    const matches = env.responses.filter(r => r.id === 'dup1');
    assert.equal(matches.length, 1);
});

test('rate limiting kicks in after 30 ops in one second', () => {
    const env = createBridgeEnv();
    for (let i = 0; i < 35; i++) {
        env.sendRequest({ id: `rl-${i}`, op: 'get', key: ALLOWED_KEY });
    }
    const rateLimited = env.responses.filter(r => r.error && r.error.includes('rate limited'));
    assert.ok(rateLimited.length > 0, 'expected some rate-limited responses');
    assert.ok(rateLimited.length <= 5);
});

test('write debouncing: rapid writes coalesce into one broker write', async () => {
    const env = createBridgeEnv();

    env.sendRequest({ id: 'w1', op: 'set', key: ALLOWED_KEY, value: { a: 1 } });
    env.sendRequest({ id: 'w2', op: 'set', key: ALLOWED_KEY, value: { a: 2 } });

    await env.flush();

    const writes = env.runtimeMessages.filter(m => m.type === 'ytab:settings-write');
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].value, { a: 2 });
});

test('the bridge never touches chrome.storage for settings', async () => {
    const env = createBridgeEnv();
    const touched = [];
    for (const area of ['local', 'sync']) {
        for (const op of ['get', 'set', 'remove']) {
            const original = env.mockChrome.storage[area][op];
            if (typeof original !== 'function') continue;
            env.mockChrome.storage[area][op] = function (...args) {
                touched.push(`${area}.${op}`);
                return original.apply(this, args);
            };
        }
    }

    env.sendRequest({ id: 'nostore1', op: 'set', key: ALLOWED_KEY, value: { a: 1 } });
    env.sendRequest({ id: 'nostore2', op: 'get', key: ALLOWED_KEY });
    await env.flush();

    assert.deepEqual(touched, [],
        `bridge must delegate storage to the broker, but called: ${touched.join(', ')}`);
    assert.ok(env.runtimeMessages.some(m => m.type === 'ytab:settings-write'));
});

test('a failing broker write surfaces an error to the page instead of silently succeeding', async () => {
    const env = createBridgeEnv({ brokerWriteError: 'untrusted context' });
    env.sendRequest({ id: 'fail1', op: 'set', key: ALLOWED_KEY, value: { a: 1 } });
    await env.flush();
    const response = env.responses.find(r => r.id === 'fail1');
    assert.ok(response);
    assert.equal(response.ok, undefined);
    assert.match(response.error, /untrusted context/);
});

test('a failing broker read surfaces an error to the page', async () => {
    const env = createBridgeEnv({ brokerReadError: 'storage unavailable' });
    env.sendRequest({ id: 'failread', op: 'get', key: ALLOWED_KEY });
    await env.flush();
    const response = env.responses.find(r => r.id === 'failread');
    assert.ok(response);
    assert.match(response.error, /storage unavailable/);
});

test('startup hydration asks the broker and projects the result to the page', async () => {
    const env = createBridgeEnv({ localStorage: { [ALLOWED_KEY]: { enabled: false, channel_blocklist: 'x' } } });
    await env.flush();
    assert.ok(env.runtimeMessages.some(m => m.type === 'ytab:settings-read'));
    assert.equal(env.localStorageData[ALLOWED_KEY], JSON.stringify({ enabled: false, channel_blocklist: 'x' }));
    const syncEvents = env.dispatched.filter(d => d.type === EVT_SYNC);
    assert.ok(syncEvents.length > 0, 'page world must be told about hydrated settings');
});

test('a sync-area change re-asks the broker rather than reconciling locally', async () => {
    const env = createBridgeEnv();
    await env.flush();
    const before = env.runtimeMessages.filter(m => m.type === 'ytab:settings-read').length;
    env.storageChangedCb({ [SYNC_META_KEY]: { newValue: { updatedAt: 9000 } } }, 'sync');
    await env.flush();
    const after = env.runtimeMessages.filter(m => m.type === 'ytab:settings-read').length;
    assert.equal(after, before + 1);
});

test('service-worker message relay dispatches correct event types', () => {
    const env = createBridgeEnv();
    const types = [];
    for (const t of ['ytab:open-panel', 'ytab:toggle-protection', 'ytab:refresh-rules', 'ytab:block-channel']) {
        env.messageListener({ type: t });
    }
    const relayed = env.dispatched.filter(d =>
        ['ytab:open-panel', 'ytab:toggle-protection', 'ytab:refresh-rules', 'ytab:block-channel'].includes(d.type)
    );
    assert.equal(relayed.length, 4);
});

test('service-worker message relay ignores malformed messages', () => {
    const env = createBridgeEnv();
    const before = env.dispatched.length;
    env.messageListener(null);
    env.messageListener('string');
    env.messageListener({ notType: true });
    env.messageListener({ type: 123 });
    assert.equal(env.dispatched.length, before);
});

test('DNR diagnostics bridge exposes only bounded rule IDs and counts', () => {
    const env = createBridgeEnv({
        dnrResponse: {
            status: 'available',
            total: 999,
            matches: [
                { ruleId: 19, count: 2, url: 'https://private.example/one' },
                { ruleId: 4, count: 1 },
                { ruleId: 19, count: 3 },
                { ruleId: -1, count: 100 },
                { ruleId: 5, count: 'not-a-count' }
            ],
            lastMatchedAt: Date.now(),
            requestUrl: 'https://private.example/two',
            rawError: 'private browser error'
        }
    });

    env.requestDnrDiagnostics();
    env.requestDnrDiagnostics();

    const runtimeQueries = env.runtimeMessages.filter(message => message.type === 'ytab:get-dnr-diagnostics');
    assert.equal(runtimeQueries.length, 1, 'the second request should use the short-lived bridge cache');
    const responses = env.dispatched.filter(event => event.type === EVT_DNR_RES);
    assert.equal(responses.length, 2);
    const detail = JSON.parse(JSON.stringify(responses.at(-1).detail));
    assert.equal(detail.status, 'available');
    assert.equal(detail.total, 6);
    assert.deepEqual(detail.matches, [
        { ruleId: 4, count: 1 },
        { ruleId: 19, count: 5 }
    ]);
    assert.equal(JSON.stringify(detail).includes('private'), false);
});

test('DNR diagnostics bridge replaces unknown failures with a stable reason', () => {
    const env = createBridgeEnv({
        dnrResponse: {
            status: 'unavailable',
            reason: 'https://private.example/raw-error',
            error: 'secret'
        }
    });

    env.requestDnrDiagnostics();

    const detail = env.dispatched.find(event => event.type === EVT_DNR_RES)?.detail;
    assert.ok(detail);
    assert.equal(detail.status, 'unavailable');
    assert.equal(detail.reason, 'query-failed');
    assert.equal(JSON.stringify(detail).includes('private'), false);
    assert.equal(JSON.stringify(detail).includes('secret'), false);
});

test('storage.onChanged only forwards the allowlisted key', () => {
    const env = createBridgeEnv();
    const syncEvents = [];
    const origDispatch = env.dispatched;

    env.storageChangedCb(
        { [ALLOWED_KEY]: { newValue: { setting: true } } },
        'local'
    );
    const syncs = origDispatch.filter(d => d.type === EVT_SYNC);
    assert.equal(syncs.length, 1);
    assert.deepEqual(syncs[0].detail[ALLOWED_KEY], { setting: true });
});

test('storage.onChanged ignores non-local area', () => {
    const env = createBridgeEnv();
    const before = env.dispatched.length;
    env.storageChangedCb(
        { [ALLOWED_KEY]: { newValue: { x: 1 } } },
        'sync'
    );
    const syncs = env.dispatched.slice(before).filter(d => d.type === EVT_SYNC);
    assert.equal(syncs.length, 0);
});

test('storage.onChanged ignores changes to non-allowlisted keys', () => {
    const env = createBridgeEnv();
    const before = env.dispatched.length;
    env.storageChangedCb({ other_key: { newValue: 'x' } }, 'local');
    const syncs = env.dispatched.slice(before).filter(d => d.type === EVT_SYNC);
    assert.equal(syncs.length, 0);
});
