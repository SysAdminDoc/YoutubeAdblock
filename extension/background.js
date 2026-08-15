/*
 * YoutubeAdblock - MV3 service worker.
 *
 * Owns: action button clicks, keyboard commands, right-click context menu,
 * message routing between the popup/menu UI and the active tab's content
 * scripts, plus privacy-bounded diagnostics for packaged DNR rules. The
 * actual page-world ad-blocking engine lives in main.js.
 */

'use strict';

const YT_ORIGIN_MATCH = /^https?:\/\/([^/]*\.)?(youtube\.com|youtube-nocookie\.com|youtubekids\.com)\//i;
const DNR_RULESET_ID = 'ytab-network-blocks';

/* =========================================================================
 * SETTINGS BROKER (trusted context)
 * =========================================================================
 * The service worker is the only component that touches chrome.storage for
 * settings. The isolated bridge relays a two-verb message protocol on
 * behalf of the page world and cannot write storage itself, so a hostile
 * page script cannot reach persistence even if it defeats the bridge's own
 * validation. Every request is re-validated here against the sender: it
 * must come from this extension, from a real tab, on a YouTube URL.
 * ===================================================================== */

const SETTINGS_KEY = '__ytab_ext_settings__';
const LOCAL_META_KEY = '__ytab_ext_settings_meta__';
const SYNC_META_KEY = '__ytab_ext_settings_sync_meta__';
const SYNC_CHUNK_PREFIX = '__ytab_ext_settings_sync_chunk_';
// Generous relative to real settings (single-digit KB) but far below the
// chrome.storage.local per-item ceiling.
const MAX_SETTINGS_BYTES = 512 * 1024;
// chrome.storage.sync allows 8 KB per item and 100 KB total; keep chunks
// under the item ceiling with headroom for keys and metadata.
const SYNC_CHUNK_BYTES = 7 * 1024;
const SYNC_TOTAL_BYTES = 95 * 1024;
const SYNC_MAX_CHUNKS = 64;

let lastWriteStamp = 0;

function nextWriteStamp() {
    const now = Date.now();
    lastWriteStamp = Math.max(now, lastWriteStamp + 1);
    return lastWriteStamp;
}

function storageArea(name) {
    try {
        return chrome && chrome.storage && chrome.storage[name];
    } catch (e) {
        return null;
    }
}

function lastErrorText() {
    try {
        const err = chrome.runtime && chrome.runtime.lastError;
        return err ? String(err.message || err) : '';
    } catch (e) {
        return '';
    }
}

function normalizeSettingsMeta(meta) {
    if (!meta || typeof meta !== 'object') return { updatedAt: 0, chunkCount: 0, byteLength: 0, oversized: false };
    const updatedAt = Number(meta.updatedAt);
    return {
        updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0,
        chunkCount: Number(meta.chunkCount) || 0,
        byteLength: Number(meta.byteLength) || 0,
        oversized: Boolean(meta.oversized)
    };
}

function syncChunkKeys(count, startAt = 0) {
    const keys = [];
    const safeCount = Math.max(0, Math.min(Number(count) || 0, SYNC_MAX_CHUNKS));
    for (let i = startAt; i < safeCount; i++) keys.push(`${SYNC_CHUNK_PREFIX}${i}`);
    return keys;
}

function splitSyncPayload(text) {
    const chunks = [];
    for (let i = 0; i < text.length; i += SYNC_CHUNK_BYTES) {
        chunks.push(text.slice(i, i + SYNC_CHUNK_BYTES));
    }
    return chunks;
}

function areaGet(area, keys) {
    return new Promise((resolve) => {
        try {
            area.get(keys, (items) => resolve(lastErrorText() ? null : (items || {})));
        } catch (e) {
            resolve(null);
        }
    });
}

function areaSet(area, items) {
    return new Promise((resolve) => {
        try {
            area.set(items, () => resolve(lastErrorText()));
        } catch (e) {
            resolve(String(e && e.message || e));
        }
    });
}

async function removeStaleSyncChunks(previousMeta, keepCount) {
    const sync = storageArea('sync');
    if (!sync || !previousMeta) return;
    const meta = normalizeSettingsMeta(previousMeta);
    if (!meta.chunkCount || meta.chunkCount <= keepCount) return;
    const staleKeys = syncChunkKeys(meta.chunkCount, keepCount);
    if (!staleKeys.length) return;
    try { sync.remove(staleKeys); } catch (e) { /* sync unavailable */ }
}

async function mirrorToSync(value, updatedAt) {
    const sync = storageArea('sync');
    if (!sync || !value || typeof value !== 'object') return;
    let serialized = '';
    try { serialized = JSON.stringify(value); } catch (e) { return; }

    const metaItems = await areaGet(sync, [SYNC_META_KEY]);
    if (!metaItems) return;
    const previousMeta = metaItems[SYNC_META_KEY];

    // Oversized payloads stay local-only and leave a tombstone so a stale
    // cloud snapshot can never overwrite the larger local one.
    if (serialized.length > SYNC_TOTAL_BYTES) {
        await areaSet(sync, {
            [SYNC_META_KEY]: {
                version: 1,
                updatedAt,
                chunkCount: 0,
                byteLength: serialized.length,
                oversized: true
            }
        });
        await removeStaleSyncChunks(previousMeta, 0);
        return;
    }

    const chunks = splitSyncPayload(serialized);
    const chunkItems = {};
    chunks.forEach((chunk, index) => { chunkItems[`${SYNC_CHUNK_PREFIX}${index}`] = chunk; });
    // Chunks first, metadata last: the metadata write is the commit marker,
    // so an interrupted write never publishes a half-written snapshot.
    if (await areaSet(sync, chunkItems)) return;
    if (await areaSet(sync, {
        [SYNC_META_KEY]: {
            version: 1,
            updatedAt,
            chunkCount: chunks.length,
            byteLength: serialized.length,
            oversized: false
        }
    })) return;
    await removeStaleSyncChunks(previousMeta, chunks.length);
}

async function readSyncSnapshot() {
    const sync = storageArea('sync');
    if (!sync) return null;
    const metaItems = await areaGet(sync, [SYNC_META_KEY]);
    if (!metaItems) return null;
    const meta = normalizeSettingsMeta(metaItems[SYNC_META_KEY]);
    if (!meta.updatedAt) return null;
    if (meta.oversized) return { meta, value: undefined, oversized: true };
    if (!Number.isInteger(meta.chunkCount) || meta.chunkCount < 1 || meta.chunkCount > SYNC_MAX_CHUNKS) return null;

    const keys = syncChunkKeys(meta.chunkCount);
    const chunkItems = await areaGet(sync, keys);
    if (!chunkItems) return null;
    let serialized = '';
    for (const key of keys) {
        const chunk = chunkItems[key];
        if (typeof chunk !== 'string') return null;
        serialized += chunk;
    }
    if (meta.byteLength && serialized.length !== meta.byteLength) return null;
    try {
        const value = JSON.parse(serialized);
        return value && typeof value === 'object' ? { meta, value, oversized: false } : null;
    } catch (e) {
        return null;
    }
}

function settingsByteLength(value) {
    try { return JSON.stringify(value).length; } catch (e) { return Infinity; }
}

async function readSettings() {
    const local = storageArea('local');
    if (!local) return { ok: false, error: 'storage unavailable' };
    const items = await areaGet(local, [SETTINGS_KEY, LOCAL_META_KEY]);
    if (!items) return { ok: false, error: 'storage read failed' };
    const localMeta = normalizeSettingsMeta(items[LOCAL_META_KEY]);
    let value = items[SETTINGS_KEY];

    // A newer snapshot from another signed-in device wins, and is written
    // back locally so the page world sees one consistent source.
    const remote = await readSyncSnapshot();
    if (remote && !remote.oversized && remote.value && remote.meta.updatedAt > localMeta.updatedAt) {
        const error = await areaSet(local, {
            [SETTINGS_KEY]: remote.value,
            [LOCAL_META_KEY]: { updatedAt: remote.meta.updatedAt }
        });
        if (!error) value = remote.value;
    } else if (value && typeof value === 'object' && !localMeta.updatedAt) {
        // First run after an upgrade from a pre-metadata build: stamp it so
        // conflict resolution has something to compare.
        const updatedAt = nextWriteStamp();
        if (!await areaSet(local, { [LOCAL_META_KEY]: { updatedAt } })) {
            await mirrorToSync(value, updatedAt);
        }
    }
    return { ok: true, value };
}

async function writeSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, error: 'invalid settings payload' };
    }
    if (settingsByteLength(value) > MAX_SETTINGS_BYTES) {
        return { ok: false, error: 'payload too large' };
    }
    const local = storageArea('local');
    if (!local) return { ok: false, error: 'storage unavailable' };
    const updatedAt = nextWriteStamp();
    const error = await areaSet(local, {
        [SETTINGS_KEY]: value,
        [LOCAL_META_KEY]: { updatedAt }
    });
    if (error) return { ok: false, error };
    await mirrorToSync(value, updatedAt);
    return { ok: true };
}

// A settings message is only honored when it comes from this extension's
// own content script running in a real YouTube tab.
function isTrustedSettingsSender(sender) {
    if (!sender || typeof sender !== 'object') return false;
    try {
        if (sender.id && chrome.runtime && chrome.runtime.id && sender.id !== chrome.runtime.id) return false;
    } catch (e) {
        return false;
    }
    const tabId = Number(sender.tab && sender.tab.id);
    if (!Number.isSafeInteger(tabId) || tabId < 0) return false;
    return isYouTubeUrl(sender.url || (sender.tab && sender.tab.url));
}
const DNR_DIAGNOSTICS_WINDOW_MS = 5 * 60 * 1000;
const DNR_DIAGNOSTICS_CACHE_MS = 30 * 1000;
const DNR_DIAGNOSTICS_MAX_CACHE_TABS = 32;
const dnrDiagnosticsCache = new Map();
let dnrLastQueryAt = 0;

function isYouTubeUrl(url) {
    return typeof url === 'string' && YT_ORIGIN_MATCH.test(url);
}

function unavailableDnrDiagnostics(reason) {
    return {
        status: 'unavailable',
        reason,
        windowMinutes: DNR_DIAGNOSTICS_WINDOW_MS / 60000,
        total: 0,
        matches: [],
        lastMatchedAt: 0
    };
}

function classifyDnrDiagnosticsError(error) {
    const message = String(error && error.message || error || '').toLowerCase();
    if (/quota|too many|max(?:imum)? number/.test(message)) return 'quota-exceeded';
    if (/permission|declarativenetrequestfeedback|active.?tab/.test(message)) return 'permission-required';
    return 'query-failed';
}

function cacheDnrDiagnostics(tabId, value, capturedAt) {
    if (dnrDiagnosticsCache.size >= DNR_DIAGNOSTICS_MAX_CACHE_TABS && !dnrDiagnosticsCache.has(tabId)) {
        const oldestTabId = dnrDiagnosticsCache.keys().next().value;
        dnrDiagnosticsCache.delete(oldestTabId);
    }
    dnrDiagnosticsCache.delete(tabId);
    dnrDiagnosticsCache.set(tabId, { capturedAt, value });
}

async function getDnrDiagnostics(tabId) {
    const now = Date.now();
    const cached = dnrDiagnosticsCache.get(tabId);
    if (cached && now - cached.capturedAt < DNR_DIAGNOSTICS_CACHE_MS) {
        return cached.value;
    }

    if (!chrome.declarativeNetRequest || typeof chrome.declarativeNetRequest.getMatchedRules !== 'function') {
        return unavailableDnrDiagnostics('api-unavailable');
    }

    // Chrome limits non-user-gesture getMatchedRules calls. A short global
    // cooldown plus the per-tab cache keeps the extension comfortably inside
    // that quota even if page code repeatedly dispatches the bridge event.
    if (dnrLastQueryAt && now - dnrLastQueryAt < DNR_DIAGNOSTICS_CACHE_MS) {
        return unavailableDnrDiagnostics('cooldown');
    }
    dnrLastQueryAt = now;

    try {
        const minTimeStamp = now - DNR_DIAGNOSTICS_WINDOW_MS;
        const result = await chrome.declarativeNetRequest.getMatchedRules({ tabId, minTimeStamp });
        const counts = new Map();
        let lastMatchedAt = 0;
        const entries = Array.isArray(result && result.rulesMatchedInfo)
            ? result.rulesMatchedInfo
            : [];

        for (const entry of entries) {
            if (!entry || entry.tabId !== tabId || entry.rule?.rulesetId !== DNR_RULESET_ID) continue;
            const ruleId = Number(entry.rule.ruleId);
            const timeStamp = Number(entry.timeStamp);
            if (!Number.isSafeInteger(ruleId) || ruleId <= 0) continue;
            if (!Number.isFinite(timeStamp) || timeStamp < minTimeStamp || timeStamp > now + 60000) continue;
            counts.set(ruleId, (counts.get(ruleId) || 0) + 1);
            lastMatchedAt = Math.max(lastMatchedAt, timeStamp);
        }

        const matches = [...counts.entries()]
            .sort(([left], [right]) => left - right)
            .map(([ruleId, count]) => ({ ruleId, count }));
        const value = {
            status: 'available',
            reason: '',
            windowMinutes: DNR_DIAGNOSTICS_WINDOW_MS / 60000,
            total: matches.reduce((sum, match) => sum + match.count, 0),
            matches,
            lastMatchedAt
        };
        cacheDnrDiagnostics(tabId, value, now);
        return value;
    } catch (error) {
        const value = unavailableDnrDiagnostics(classifyDnrDiagnosticsError(error));
        cacheDnrDiagnostics(tabId, value, now);
        return value;
    }
}

// Returns a Promise that resolves when the tab finishes loading (or
// immediately if it is already complete). Rejects after the timeout.
function waitForTabComplete(tabId, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            chrome.tabs.onUpdated.removeListener(onUpdated);
            reject(new Error('tab load timed out'));
        }, timeoutMs);

        function onUpdated(updatedId, info) {
            if (updatedId !== tabId || info.status !== 'complete') return;
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            chrome.tabs.onUpdated.removeListener(onUpdated);
            resolve();
        }
        chrome.tabs.onUpdated.addListener(onUpdated);

        // Check current state in case the tab already finished loading
        // between tab creation and this listener attaching.
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError || !tab) return;
            if (tab.status === 'complete' && !settled) {
                settled = true;
                clearTimeout(timer);
                chrome.tabs.onUpdated.removeListener(onUpdated);
                resolve();
            }
        });
    });
}

async function dispatchToTab(tabId, payload, { allowReload = false } = {}) {
    try {
        await chrome.tabs.sendMessage(tabId, payload);
        return true;
    } catch (e) { /* content script may not be ready yet */ }

    try {
        await waitForTabComplete(tabId, 15000);
        await chrome.tabs.sendMessage(tabId, payload);
        return true;
    } catch (e) { /* still not ready */ }

    if (!allowReload) return false;

    try {
        await chrome.tabs.reload(tabId);
        await waitForTabComplete(tabId, 30000);
        await chrome.tabs.sendMessage(tabId, payload);
        return true;
    } catch (e) {
        return false;
    }
}

async function sendToActiveTab(payload) {
    let tab;
    try {
        [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch (e) {
        return;
    }

    if (tab && tab.id && isYouTubeUrl(tab.url)) {
        // Try the current tab first. If the content script is not ready,
        // wait for load completion and, as a last resort, reload once so
        // the requested action is actually delivered instead of being
        // silently dropped.
        await dispatchToTab(tab.id, payload, { allowReload: true });
        return;
    }

    // Not on a YouTube tab. Open a new one and deliver the message once
    // it's ready. We cap waits so a never-completing load doesn't leak a
    // listener.
    let created;
    try {
        created = await chrome.tabs.create({ url: 'https://www.youtube.com/' });
    } catch (e) {
        return;
    }
    if (!created || !created.id) return;
    // A brand-new YouTube tab only needs load-aware retries, not a reload.
    await dispatchToTab(created.id, payload);
}

chrome.action.onClicked.addListener(() => {
    sendToActiveTab({ type: 'ytab:open-panel' });
});

chrome.commands.onCommand.addListener((name) => {
    switch (name) {
        case 'ytab-open-panel':
            sendToActiveTab({ type: 'ytab:open-panel' });
            break;
        case 'ytab-toggle-protection':
            sendToActiveTab({ type: 'ytab:toggle-protection' });
            break;
        case 'ytab-refresh-rules':
            sendToActiveTab({ type: 'ytab:refresh-rules' });
            break;
        case 'ytab-block-channel':
            sendToActiveTab({ type: 'ytab:block-channel' });
            break;
    }
});

const COMMUNITY_API_ORIGINS = [
    'https://sponsor.ajay.app/*',
    'https://returnyoutubedislikeapi.com/*'
];

const CONTEXT_MENU_ROOT = 'ytab-root';

function rebuildContextMenu() {
    try {
        chrome.contextMenus.removeAll(() => {
            // chrome.runtime.lastError is already swallowed inside the
            // callback; we keep going regardless so a single failure
            // doesn't leave the user with a half-built menu.
            chrome.contextMenus.create({
                id: CONTEXT_MENU_ROOT,
                title: 'YoutubeAdblock',
                contexts: ['action', 'page'],
                documentUrlPatterns: [
                    '*://*.youtube.com/*',
                    '*://www.youtube-nocookie.com/*',
                    '*://youtubekids.com/*',
                    '*://www.youtubekids.com/*'
                ]
            });
            chrome.contextMenus.create({
                id: 'ytab-open-panel',
                parentId: CONTEXT_MENU_ROOT,
                title: 'Open Control Center',
                contexts: ['action', 'page']
            });
            chrome.contextMenus.create({
                id: 'ytab-toggle-protection',
                parentId: CONTEXT_MENU_ROOT,
                title: 'Pause or Resume Protection',
                contexts: ['action', 'page']
            });
            chrome.contextMenus.create({
                id: 'ytab-refresh-rules',
                parentId: CONTEXT_MENU_ROOT,
                title: 'Refresh Rules',
                contexts: ['action', 'page']
            });
            chrome.contextMenus.create({
                id: 'ytab-block-channel',
                parentId: CONTEXT_MENU_ROOT,
                title: 'Block This Channel',
                contexts: ['page', 'link']
            });
            chrome.contextMenus.create({
                id: 'ytab-grant-api-permissions',
                parentId: CONTEXT_MENU_ROOT,
                title: 'Grant Community API Access',
                contexts: ['action', 'page']
            });
        });
    } catch (e) { /* API may not be available on all channels */ }
}

// The context menu lives in persistent storage (chrome.contextMenus
// entries survive SW restarts), so `rebuildContextMenu` only needs to
// run when install/update/startup actually happens. Listening on both
// events covers the common lifecycle: fresh install, manual update,
// and browser launch.
chrome.runtime.onInstalled.addListener(rebuildContextMenu);
chrome.runtime.onStartup.addListener(rebuildContextMenu);

chrome.contextMenus.onClicked.addListener((info) => {
    switch (info.menuItemId) {
        case 'ytab-open-panel':
            sendToActiveTab({ type: 'ytab:open-panel' });
            break;
        case 'ytab-toggle-protection':
            sendToActiveTab({ type: 'ytab:toggle-protection' });
            break;
        case 'ytab-refresh-rules':
            sendToActiveTab({ type: 'ytab:refresh-rules' });
            break;
        case 'ytab-block-channel':
            sendToActiveTab({ type: 'ytab:block-channel' });
            break;
        case 'ytab-grant-api-permissions':
            chrome.permissions.request({ origins: COMMUNITY_API_ORIGINS }, (granted) => {
                sendToActiveTab({ type: 'ytab:api-permissions-changed', granted: !!granted });
            });
            break;
    }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ytab:check-api-permissions') {
        chrome.permissions.contains({ origins: COMMUNITY_API_ORIGINS }, (result) => {
            sendResponse({ granted: !!result });
        });
        return true;
    }
    if (msg.type === 'ytab:settings-read' || msg.type === 'ytab:settings-write') {
        if (!isTrustedSettingsSender(sender)) {
            sendResponse({ ok: false, error: 'untrusted context' });
            return;
        }
        const work = msg.type === 'ytab:settings-read'
            ? readSettings()
            : writeSettings(msg.value);
        work.then(sendResponse, (e) => {
            sendResponse({ ok: false, error: String(e && e.message || e) });
        });
        return true;
    }
    if (msg.type === 'ytab:get-dnr-diagnostics') {
        const tabId = Number(sender?.tab?.id);
        const senderUrl = sender?.url || sender?.tab?.url;
        if (!Number.isSafeInteger(tabId) || tabId < 0 || !isYouTubeUrl(senderUrl)) {
            sendResponse(unavailableDnrDiagnostics('invalid-context'));
            return;
        }
        getDnrDiagnostics(tabId).then(sendResponse, () => {
            sendResponse(unavailableDnrDiagnostics('query-failed'));
        });
        return true;
    }
});
