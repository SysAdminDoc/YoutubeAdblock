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
