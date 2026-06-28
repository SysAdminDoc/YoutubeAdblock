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

function createBridgeEnv(options = {}) {
    const storageData = { ...(options.localStorage || {}) };
    const syncStorageData = { ...(options.syncStorage || {}) };
    const responses = [];
    const dispatched = [];
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

    return {
        sendRequest,
        responses,
        dispatched,
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

test('GET coalescing: multiple GETs produce one storage.local.get call', async () => {
    const storageGetCalls = [];
    const env = createBridgeEnv();
    const origGet = env.mockChrome.storage.local.get;
    env.mockChrome.storage.local.get = function (keys, cb) {
        storageGetCalls.push(keys);
        origGet(keys, cb);
    };
    env.storageData[ALLOWED_KEY] = { test: true };

    env.sendRequest({ id: 'g1', op: 'get', key: ALLOWED_KEY });
    env.sendRequest({ id: 'g2', op: 'get', key: ALLOWED_KEY });
    env.sendRequest({ id: 'g3', op: 'get', key: ALLOWED_KEY });

    await env.flush();

    assert.equal(storageGetCalls.length, 1);
    const g1 = env.responses.find(r => r.id === 'g1');
    const g2 = env.responses.find(r => r.id === 'g2');
    const g3 = env.responses.find(r => r.id === 'g3');
    assert.ok(g1 && g1.value);
    assert.ok(g2 && g2.value);
    assert.ok(g3 && g3.value);
    assert.deepEqual(g1.value, { test: true });
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

test('write debouncing: rapid writes coalesce into one storage.local.set call', async () => {
    const setCalls = [];
    const env = createBridgeEnv();
    const origSet = env.mockChrome.storage.local.set;
    env.mockChrome.storage.local.set = function (items, cb) {
        setCalls.push(items);
        origSet(items, cb);
    };

    env.sendRequest({ id: 'w1', op: 'set', key: ALLOWED_KEY, value: { a: 1 } });
    env.sendRequest({ id: 'w2', op: 'set', key: ALLOWED_KEY, value: { a: 2 } });

    await env.flush();

    assert.equal(setCalls.length, 1);
    assert.deepEqual(setCalls[0][ALLOWED_KEY], { a: 2 });
});

test('valid writes mirror to chrome.storage.sync using bounded chunks', async () => {
    const env = createBridgeEnv();
    const value = {
        channel_blocklist: 'Channel '.repeat(1200),
        feature_overrides: { channelBlocker: true, keywordBlocker: true }
    };

    env.sendRequest({ id: 'sync1', op: 'set', key: ALLOWED_KEY, value });

    await env.flush();

    const r = env.responses.find(r => r.id === 'sync1');
    assert.ok(r);
    assert.equal(r.ok, true);
    assert.deepEqual(env.storageData[ALLOWED_KEY], value);
    assert.ok(env.storageData[LOCAL_META_KEY].updatedAt > 0);
    const meta = env.syncStorageData[SYNC_META_KEY];
    assert.ok(meta);
    assert.equal(meta.oversized, false);
    assert.ok(meta.chunkCount >= 2, 'expected payload to span multiple sync chunks');
    assert.deepEqual(readSyncedPayload(env), value);
});

test('oversized sync payloads still save locally and write an oversized sync tombstone', async () => {
    const env = createBridgeEnv();
    const value = { channel_blocklist: 'x'.repeat(110 * 1024) };

    env.sendRequest({ id: 'big1', op: 'set', key: ALLOWED_KEY, value });

    await env.flush();

    const r = env.responses.find(r => r.id === 'big1');
    assert.ok(r);
    assert.equal(r.ok, true);
    assert.deepEqual(env.storageData[ALLOWED_KEY], value);
    const meta = env.syncStorageData[SYNC_META_KEY];
    assert.ok(meta);
    assert.equal(meta.oversized, true);
    assert.equal(meta.chunkCount, 0);
    assert.equal(env.syncStorageData[`${SYNC_CHUNK_PREFIX}0`], undefined);
});

test('startup hydration applies a newer chrome.storage.sync snapshot', async () => {
    const remote = { enabled: false, keyword_blocklist: 'promo\nsponsored' };
    const env = createBridgeEnv({
        syncStorage: buildSyncStorage(remote, 2000)
    });

    await env.flush();

    assert.deepEqual(env.storageData[ALLOWED_KEY], remote);
    assert.equal(env.storageData[LOCAL_META_KEY].updatedAt, 2000);
    assert.equal(env.localStorageData[ALLOWED_KEY], JSON.stringify(remote));
    const syncEvents = env.dispatched.filter(d => d.type === EVT_SYNC);
    assert.ok(syncEvents.some(d => d.detail[ALLOWED_KEY].keyword_blocklist === remote.keyword_blocklist));
});

test('startup hydration keeps local settings when local metadata is newer than sync', async () => {
    const localValue = { enabled: true, channel_blocklist: 'local' };
    const remote = { enabled: false, channel_blocklist: 'remote' };
    const env = createBridgeEnv({
        localStorage: {
            [ALLOWED_KEY]: localValue,
            [LOCAL_META_KEY]: { updatedAt: 3000 }
        },
        syncStorage: buildSyncStorage(remote, 2000)
    });

    await env.flush();

    assert.deepEqual(env.storageData[ALLOWED_KEY], localValue);
    assert.equal(env.localStorageData[ALLOWED_KEY], JSON.stringify(localValue));
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
