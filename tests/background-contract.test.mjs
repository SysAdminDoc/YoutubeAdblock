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

    const mockChrome = {
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

    return {
        listeners,
        sentMessages,
        createdMenus,
        dnrMatchedRuleCalls,
        flush: () => new Promise(resolve => setTimeout(resolve, 0))
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
