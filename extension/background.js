/*
 * YoutubeAdblock - MV3 service worker.
 *
 * Owns: action button clicks, keyboard commands, right-click context menu,
 * and message routing between the popup/menu UI and the active tab's content
 * scripts. The actual ad-blocking engine lives in the page-world content
 * script (main.js); this file is purely a control-plane relay.
 */

'use strict';

const YT_ORIGIN_MATCH = /^https?:\/\/([^/]*\.)?(youtube\.com|youtube-nocookie\.com|youtubekids\.com)\//i;

function isYouTubeUrl(url) {
    return typeof url === 'string' && YT_ORIGIN_MATCH.test(url);
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
    }
});

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
                    '*://youtubekids.com/*'
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
    }
});
