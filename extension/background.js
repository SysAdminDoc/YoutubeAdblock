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

async function sendToActiveTab(payload) {
    let tab;
    try {
        [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch (e) {
        return;
    }

    if (tab && tab.id && isYouTubeUrl(tab.url)) {
        try {
            await chrome.tabs.sendMessage(tab.id, payload);
        } catch (e) {
            // The content script may not yet be loaded (e.g. the user
            // clicked the action button before document-start ran, or
            // during an SPA nav). A tab reload restarts content scripts
            // and carries the intent forward as a query-string hint.
            try {
                await chrome.tabs.reload(tab.id);
            } catch (reloadErr) { /* tab disappeared */ }
        }
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
    try {
        await waitForTabComplete(created.id);
        await chrome.tabs.sendMessage(created.id, payload);
    } catch (e) {
        // Harmless — opener closed the tab, or the content script is
        // still initializing. The default YouTube home load is not
        // strictly action-triggered anyway, so failing silently is
        // acceptable here.
    }
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
                title: 'Open control center',
                contexts: ['action', 'page']
            });
            chrome.contextMenus.create({
                id: 'ytab-toggle-protection',
                parentId: CONTEXT_MENU_ROOT,
                title: 'Pause / resume protection',
                contexts: ['action', 'page']
            });
            chrome.contextMenus.create({
                id: 'ytab-refresh-rules',
                parentId: CONTEXT_MENU_ROOT,
                title: 'Refresh rules',
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
