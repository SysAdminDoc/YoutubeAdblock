import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const backgroundSource = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');

function createBackgroundEnv(options = {}) {
    const listeners = {};
    const sentMessages = [];
    const createdMenus = [];
    const dnrMatchedRuleCalls = [];
    const activeTab = options.activeTab || {
        id: 42,
        url: 'https://www.youtube.com/watch?v=test',
        status: 'complete'
    };

    const localStore = { ...(options.localStorage || {}) };
    const syncStore = { ...(options.syncStorage || {}) };
    const storageCalls = [];

    function makeArea(store, name) {
        return {
            get(keys, cb) {
                storageCalls.push(`${name}.get`);
                const list = Array.isArray(keys) ? keys : [keys];
                const out = {};
                for (const key of list) if (key in store) out[key] = store[key];
                cb(out);
            },
            set(items, cb) {
                storageCalls.push(`${name}.set`);
                if (options.failWrites) {
                    mockChrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
                    if (cb) cb();
                    mockChrome.runtime.lastError = null;
                    return;
                }
                Object.assign(store, items);
                if (cb) cb();
            },
            remove(keys, cb) {
                storageCalls.push(`${name}.remove`);
                const list = Array.isArray(keys) ? keys : [keys];
                for (const key of list) delete store[key];
                if (cb) cb();
            }
        };
    }

    const mockChrome = {
        storage: {
            local: makeArea(localStore, 'local'),
            sync: options.syncUnavailable ? undefined : makeArea(syncStore, 'sync'),
            onChanged: { addListener() {} }
        },
        action: {
            onClicked: { addListener(fn) { listeners.actionClicked = fn; } }
        },
        commands: {
            onCommand: { addListener(fn) { listeners.command = fn; } }
        },
        contextMenus: {
            removeAll(cb) { if (cb) cb(); },
            create(item) { createdMenus.push(item); },
            onClicked: { addListener(fn) { listeners.contextClicked = fn; } }
        },
        runtime: {
            id: 'ytab-test-extension',
            lastError: null,
            onInstalled: { addListener(fn) { listeners.installed = fn; } },
            onStartup: { addListener(fn) { listeners.startup = fn; } },
            onMessage: { addListener(fn) { listeners.message = fn; } }
        },
        permissions: {
            request(perms, cb) { if (cb) cb(true); },
            contains(perms, cb) { if (cb) cb(false); }
        },
        declarativeNetRequest: options.dnrApi === false ? undefined : {
            async getMatchedRules(filter) {
                dnrMatchedRuleCalls.push(filter);
                if (options.dnrError) throw new Error(options.dnrError);
                return options.dnrResult || { rulesMatchedInfo: [] };
            }
        },
        tabs: {
            async query() { return activeTab ? [activeTab] : []; },
            async sendMessage(tabId, payload) {
                sentMessages.push({ tabId, payload });
                return true;
            },
            async create(createOptions) {
                const created = {
                    id: 99,
                    url: createOptions.url,
                    status: 'complete'
                };
                return created;
            },
            async reload() { return true; },
            get(tabId, cb) {
                cb(activeTab && activeTab.id === tabId ? activeTab : { id: tabId, status: 'complete' });
            },
            onUpdated: {
                addListener(fn) { listeners.updated = fn; },
                removeListener() { listeners.updated = null; }
            }
        }
    };

    const sandbox = vm.createContext({
        chrome: mockChrome,
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
        Promise: globalThis.Promise,
        Error: globalThis.Error,
        console: globalThis.console
    });

    vm.runInContext(backgroundSource, sandbox, { filename: 'background.js' });

    function sendSettingsMessage(message, sender) {
        return new Promise((resolve) => {
            const returned = listeners.message(message, sender, resolve);
            if (returned !== true) resolve(undefined);
        });
    }

    return {
        listeners,
        sentMessages,
        createdMenus,
        dnrMatchedRuleCalls,
        localStore,
        syncStore,
        storageCalls,
        sendSettingsMessage,
        flush: () => new Promise(resolve => setTimeout(resolve, 20))
    };
}

test('context menu rebuild includes Block This Channel action', () => {
    const env = createBackgroundEnv();

    env.listeners.installed();

    const blockMenu = env.createdMenus.find(item => item.id === 'ytab-block-channel');
    assert.ok(blockMenu, 'expected Block This Channel context menu item');
    assert.equal(blockMenu.title, 'Block This Channel');
    assert.equal(blockMenu.contexts.length, 2);
    assert.equal(blockMenu.contexts[0], 'page');
    assert.equal(blockMenu.contexts[1], 'link');
});

test('context menu rebuild includes Grant Community API Access action', () => {
    const env = createBackgroundEnv();
    env.listeners.installed();
    const grantMenu = env.createdMenus.find(item => item.id === 'ytab-grant-api-permissions');
    assert.ok(grantMenu, 'expected Grant Community API Access context menu item');
    assert.equal(grantMenu.title, 'Grant Community API Access');
});

test('check-api-permissions message returns permission status', () => {
    const env = createBackgroundEnv();
    let response = null;
    env.listeners.message(
        { type: 'ytab:check-api-permissions' },
        {},
        (r) => { response = r; }
    );
    assert.ok(response);
    assert.equal(typeof response.granted, 'boolean');
});

test('DNR diagnostics aggregate packaged rule IDs without exposing request URLs', async () => {
    const now = Date.now();
    const env = createBackgroundEnv({
        dnrResult: {
            rulesMatchedInfo: [
                { rule: { ruleId: 19, rulesetId: 'ytab-network-blocks' }, tabId: 42, timeStamp: now - 100, request: { url: 'https://private.example/token' } },
                { rule: { ruleId: 4, rulesetId: 'ytab-network-blocks' }, tabId: 42, timeStamp: now - 200 },
                { rule: { ruleId: 19, rulesetId: 'ytab-network-blocks' }, tabId: 42, timeStamp: now - 300 },
                { rule: { ruleId: 88, rulesetId: 'another-ruleset' }, tabId: 42, timeStamp: now - 400 },
                { rule: { ruleId: 5, rulesetId: 'ytab-network-blocks' }, tabId: 7, timeStamp: now - 500 },
                { rule: { ruleId: 6, rulesetId: 'ytab-network-blocks' }, tabId: 42, timeStamp: now - (6 * 60 * 1000) }
            ]
        }
    });
    let response = null;

    const keepAlive = env.listeners.message(
        { type: 'ytab:get-dnr-diagnostics' },
        { url: 'https://www.youtube.com/watch?v=private', tab: { id: 42, url: 'https://www.youtube.com/watch?v=private' } },
        value => { response = JSON.parse(JSON.stringify(value)); }
    );
    assert.equal(keepAlive, true);
    await env.flush();

    assert.ok(response);
    assert.equal(response.status, 'available');
    assert.equal(response.total, 3);
    assert.deepEqual(response.matches, [
        { ruleId: 4, count: 1 },
        { ruleId: 19, count: 2 }
    ]);
    assert.equal(JSON.stringify(response).includes('private'), false);
    assert.equal(env.dnrMatchedRuleCalls.length, 1);
    assert.equal(env.dnrMatchedRuleCalls[0].tabId, 42);
    assert.ok(env.dnrMatchedRuleCalls[0].minTimeStamp >= now - (5 * 60 * 1000) - 1000);

    let cachedResponse = null;
    env.listeners.message(
        { type: 'ytab:get-dnr-diagnostics' },
        { url: 'https://www.youtube.com/watch?v=other', tab: { id: 42, url: 'https://www.youtube.com/watch?v=other' } },
        value => { cachedResponse = JSON.parse(JSON.stringify(value)); }
    );
    await env.flush();
    assert.deepEqual(cachedResponse.matches, response.matches);
    assert.equal(env.dnrMatchedRuleCalls.length, 1, 'the second tab-scoped request should use the service-worker cache');
});

test('DNR diagnostics reject non-YouTube senders before querying browser feedback', () => {
    const env = createBackgroundEnv();
    let response = null;

    const keepAlive = env.listeners.message(
        { type: 'ytab:get-dnr-diagnostics' },
        { url: 'https://example.com/', tab: { id: 42, url: 'https://example.com/' } },
        value => { response = JSON.parse(JSON.stringify(value)); }
    );

    assert.equal(keepAlive, undefined);
    assert.equal(response.status, 'unavailable');
    assert.equal(response.reason, 'invalid-context');
    assert.equal(env.dnrMatchedRuleCalls.length, 0);
});

test('DNR diagnostics map raw browser failures to stable privacy-safe reasons', async () => {
    const env = createBackgroundEnv({ dnrError: 'permission denied for https://private.example/token' });
    let response = null;

    env.listeners.message(
        { type: 'ytab:get-dnr-diagnostics' },
        { url: 'https://music.youtube.com/watch?v=test', tab: { id: 42, url: 'https://music.youtube.com/watch?v=test' } },
        value => { response = JSON.parse(JSON.stringify(value)); }
    );
    await env.flush();

    assert.equal(response.status, 'unavailable');
    assert.equal(response.reason, 'permission-required');
    assert.equal(JSON.stringify(response).includes('private'), false);
});

test('Block This Channel context menu dispatches ytab:block-channel to active YouTube tab', async () => {
    const env = createBackgroundEnv();

    env.listeners.contextClicked({ menuItemId: 'ytab-block-channel' });
    await env.flush();

    assert.equal(env.sentMessages.length, 1);
    assert.equal(env.sentMessages[0].tabId, 42);
    assert.equal(env.sentMessages[0].payload.type, 'ytab:block-channel');
});

// ========== settings broker (trusted context) ==========

const SETTINGS_KEY = '__ytab_ext_settings__';
const LOCAL_META_KEY = '__ytab_ext_settings_meta__';
const SYNC_META_KEY = '__ytab_ext_settings_sync_meta__';
const SYNC_CHUNK_PREFIX = '__ytab_ext_settings_sync_chunk_';

const trustedSender = {
    id: 'ytab-test-extension',
    url: 'https://www.youtube.com/watch?v=test',
    tab: { id: 7, url: 'https://www.youtube.com/watch?v=test' }
};

function buildSyncStore(value, updatedAt) {
    const serialized = JSON.stringify(value);
    const chunkCount = Math.ceil(serialized.length / (7 * 1024));
    const store = {
        [SYNC_META_KEY]: { version: 1, updatedAt, chunkCount, byteLength: serialized.length, oversized: false }
    };
    for (let i = 0; i < chunkCount; i++) {
        store[`${SYNC_CHUNK_PREFIX}${i}`] = serialized.slice(i * 7 * 1024, (i + 1) * 7 * 1024);
    }
    return store;
}

function readSyncedValue(env) {
    const meta = env.syncStore[SYNC_META_KEY];
    if (!meta || meta.oversized) return null;
    let serialized = '';
    for (let i = 0; i < meta.chunkCount; i++) serialized += env.syncStore[`${SYNC_CHUNK_PREFIX}${i}`];
    return JSON.parse(serialized);
}

test('broker rejects settings messages from an untrusted sender', async () => {
    const env = createBackgroundEnv();
    for (const sender of [
        undefined,
        {},
        { id: 'ytab-test-extension', url: 'https://evil.example/' },
        { id: 'ytab-test-extension', url: 'https://www.youtube.com/', tab: undefined },
        { id: 'some-other-extension', url: 'https://www.youtube.com/', tab: { id: 3 } },
        { id: 'ytab-test-extension', url: 'https://notyoutube.com/watch', tab: { id: 3 } }
    ]) {
        const response = await env.sendSettingsMessage(
            { type: 'ytab:settings-write', value: { enabled: false } }, sender);
        assert.equal(response.ok, false, JSON.stringify(sender));
        assert.match(response.error, /untrusted context/);
    }
    assert.equal(env.localStore[SETTINGS_KEY], undefined, 'no untrusted write may reach storage');
});

test('broker writes settings locally and stamps monotonic metadata', async () => {
    const env = createBackgroundEnv();
    const first = await env.sendSettingsMessage(
        { type: 'ytab:settings-write', value: { enabled: true } }, trustedSender);
    assert.equal(first.ok, true);
    assert.deepEqual(env.localStore[SETTINGS_KEY], { enabled: true });
    const firstStamp = env.localStore[LOCAL_META_KEY].updatedAt;
    assert.ok(firstStamp > 0);

    const second = await env.sendSettingsMessage(
        { type: 'ytab:settings-write', value: { enabled: false } }, trustedSender);
    assert.equal(second.ok, true);
    assert.ok(env.localStore[LOCAL_META_KEY].updatedAt > firstStamp,
        'each accepted write must advance the stamp so conflict resolution is deterministic');
});

test('broker rejects malformed and oversized payloads before touching storage', async () => {
    const env = createBackgroundEnv();
    for (const value of [null, 'string', 42, ['array']]) {
        const response = await env.sendSettingsMessage({ type: 'ytab:settings-write', value }, trustedSender);
        assert.equal(response.ok, false);
        assert.match(response.error, /invalid settings payload/);
    }
    const huge = { channel_blocklist: 'x'.repeat(600 * 1024) };
    const response = await env.sendSettingsMessage({ type: 'ytab:settings-write', value: huge }, trustedSender);
    assert.equal(response.ok, false);
    assert.match(response.error, /payload too large/);
    assert.equal(env.localStore[SETTINGS_KEY], undefined);
});

test('broker mirrors accepted writes to sync in bounded chunks, metadata last', async () => {
    const env = createBackgroundEnv();
    const value = {
        channel_blocklist: 'Channel '.repeat(1200),
        feature_overrides: { channelBlocker: true }
    };
    const response = await env.sendSettingsMessage({ type: 'ytab:settings-write', value }, trustedSender);
    assert.equal(response.ok, true);
    await env.flush();

    const meta = env.syncStore[SYNC_META_KEY];
    assert.ok(meta, 'sync metadata should be published');
    assert.equal(meta.oversized, false);
    assert.ok(meta.chunkCount >= 2, 'payload should span multiple chunks');
    assert.deepEqual(readSyncedValue(env), value);
    const syncSets = env.storageCalls.filter(c => c === 'sync.set');
    assert.ok(syncSets.length >= 2, 'chunks and metadata are separate writes');
});

test('broker keeps oversized payloads local-only and publishes a tombstone', async () => {
    const env = createBackgroundEnv();
    const value = { channel_blocklist: 'x'.repeat(110 * 1024) };
    const response = await env.sendSettingsMessage({ type: 'ytab:settings-write', value }, trustedSender);
    assert.equal(response.ok, true);
    await env.flush();

    assert.deepEqual(env.localStore[SETTINGS_KEY], value, 'oversized settings still persist locally');
    const meta = env.syncStore[SYNC_META_KEY];
    assert.equal(meta.oversized, true);
    assert.equal(meta.chunkCount, 0);
    assert.equal(env.syncStore[`${SYNC_CHUNK_PREFIX}0`], undefined);
});

test('broker read adopts a newer snapshot from another device', async () => {
    const remote = { enabled: false, keyword_blocklist: 'promo' };
    const env = createBackgroundEnv({
        localStorage: { [SETTINGS_KEY]: { enabled: true }, [LOCAL_META_KEY]: { updatedAt: 1000 } },
        syncStorage: buildSyncStore(remote, 2000)
    });
    const response = await env.sendSettingsMessage({ type: 'ytab:settings-read' }, trustedSender);
    assert.equal(response.ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(response.value)), remote);
    assert.deepEqual(JSON.parse(JSON.stringify(env.localStore[SETTINGS_KEY])), remote,
        'the winning snapshot is written back locally');
    assert.equal(env.localStore[LOCAL_META_KEY].updatedAt, 2000);
});

test('broker read keeps local settings when the local stamp is newer', async () => {
    const local = { enabled: true, channel_blocklist: 'local' };
    const env = createBackgroundEnv({
        localStorage: { [SETTINGS_KEY]: local, [LOCAL_META_KEY]: { updatedAt: 3000 } },
        syncStorage: buildSyncStore({ enabled: false, channel_blocklist: 'remote' }, 2000)
    });
    const response = await env.sendSettingsMessage({ type: 'ytab:settings-read' }, trustedSender);
    assert.deepEqual(response.value, local);
    assert.deepEqual(env.localStore[SETTINGS_KEY], local);
});

test('broker read ignores an oversized remote tombstone', async () => {
    const local = { enabled: true, channel_blocklist: 'local' };
    const env = createBackgroundEnv({
        localStorage: { [SETTINGS_KEY]: local, [LOCAL_META_KEY]: { updatedAt: 1000 } },
        syncStorage: { [SYNC_META_KEY]: { version: 1, updatedAt: 5000, chunkCount: 0, byteLength: 999999, oversized: true } }
    });
    const response = await env.sendSettingsMessage({ type: 'ytab:settings-read' }, trustedSender);
    assert.deepEqual(response.value, local, 'a tombstone must never replace richer local settings');
});

test('broker read rejects a partially written remote snapshot', async () => {
    const local = { enabled: true };
    const partial = buildSyncStore({ enabled: false, channel_blocklist: 'y'.repeat(9000) }, 4000);
    delete partial[`${SYNC_CHUNK_PREFIX}1`];
    const env = createBackgroundEnv({
        localStorage: { [SETTINGS_KEY]: local, [LOCAL_META_KEY]: { updatedAt: 1000 } },
        syncStorage: partial
    });
    const response = await env.sendSettingsMessage({ type: 'ytab:settings-read' }, trustedSender);
    assert.deepEqual(response.value, local, 'an incomplete chunk set must be discarded, not partially applied');
});

test('broker still serves settings when sync is unavailable', async () => {
    const env = createBackgroundEnv({
        syncUnavailable: true,
        localStorage: { [SETTINGS_KEY]: { enabled: true }, [LOCAL_META_KEY]: { updatedAt: 10 } }
    });
    const read = await env.sendSettingsMessage({ type: 'ytab:settings-read' }, trustedSender);
    assert.equal(read.ok, true);
    assert.deepEqual(read.value, { enabled: true });
    const write = await env.sendSettingsMessage(
        { type: 'ytab:settings-write', value: { enabled: false } }, trustedSender);
    assert.equal(write.ok, true, 'sync being unavailable must not fail a local save');
});

test('broker reports a failed local write instead of claiming success', async () => {
    const env = createBackgroundEnv({ failWrites: true });
    const response = await env.sendSettingsMessage(
        { type: 'ytab:settings-write', value: { enabled: true } }, trustedSender);
    assert.equal(response.ok, false);
    assert.match(response.error, /quota/i);
});
