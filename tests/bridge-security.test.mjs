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
const EVT_REQ = 'ytab:page-request';
const EVT_RES = 'ytab:page-response';
const EVT_SYNC = 'ytab:settings-changed';

function createBridgeEnv() {
    const storageData = {};
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
                    const result = {};
                    for (const k of keys) {
                        if (k in storageData) result[k] = storageData[k];
                    }
                    cb(result);
                },
                set(items, cb) {
                    Object.assign(storageData, items);
                    if (cb) cb();
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
        localStorageData,
        mockChrome,
        messageListener,
        storageChangedCb,
        pagehideListener,
        flush: () => new Promise(r => setTimeout(r, 200))
    };
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

test('service-worker message relay dispatches correct event types', () => {
    const env = createBridgeEnv();
    const types = [];
    for (const t of ['ytab:open-panel', 'ytab:toggle-protection', 'ytab:refresh-rules']) {
        env.messageListener({ type: t });
    }
    const relayed = env.dispatched.filter(d =>
        ['ytab:open-panel', 'ytab:toggle-protection', 'ytab:refresh-rules'].includes(d.type)
    );
    assert.equal(relayed.length, 3);
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
