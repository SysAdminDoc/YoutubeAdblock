/*
 * YoutubeAdblock - ISOLATED-world content script.
 *
 * Bridges chrome.* APIs (which MAIN world cannot see) to the page-world
 * adblock core via custom DOM events. Runs at document_start.
 *
 * SECURITY NOTES
 *   - CustomEvents on `document` are visible to any code running in the
 *     page world, including third-party scripts. We therefore:
 *     a) restrict writes to a single allowlisted storage key,
 *     b) cap the serialized value size,
 *     c) debounce writes so a misbehaving (or hostile) page script can't
 *        flood chrome.storage.local quota.
 *   - Incoming `chrome.runtime.onMessage` events come only from the
 *     extension itself (Chrome enforces this), so we trust their shape
 *     after a basic type check.
 */

(function () {
    'use strict';

    const EVT_OPEN_PANEL = 'ytab:open-panel';
    const EVT_TOGGLE_PROTECTION = 'ytab:toggle-protection';
    const EVT_REFRESH_RULES = 'ytab:refresh-rules';
    const EVT_SETTINGS_CHANGED = 'ytab:settings-changed';
    const EVT_PAGE_REQUEST = 'ytab:page-request';
    const EVT_PAGE_RESPONSE = 'ytab:page-response';

    // Only the main-world script is allowed to write to this single key.
    // Any other key passed through EVT_PAGE_REQUEST is silently dropped.
    const ALLOWED_STORAGE_KEY = '__ytab_ext_settings__';
    // 512 KB is an order of magnitude more than the real settings need
    // (they measure in the low single-digit KB) but still well under the
    // chrome.storage.local per-item quota.
    const MAX_PAYLOAD_BYTES = 512 * 1024;
    // Collapse rapid-fire writes into a single storage.local.set. Most
    // realistic workloads (toggle a few switches) coalesce nicely at 150 ms.
    const WRITE_DEBOUNCE_MS = 150;

    let pendingWrite = null;
    let pendingTimer = null;

    function flushPendingWrite() {
        if (!pendingWrite) return;
        const { value, ids } = pendingWrite;
        pendingWrite = null;
        pendingTimer = null;
        const snapshotIds = ids.slice();
        try {
            chrome.storage.local.set({ [ALLOWED_STORAGE_KEY]: value }, () => {
                const err = chrome.runtime && chrome.runtime.lastError;
                for (const id of snapshotIds) {
                    document.dispatchEvent(new CustomEvent(EVT_PAGE_RESPONSE, {
                        detail: err
                            ? { id, error: String(err.message || err) }
                            : { id, ok: true }
                    }));
                }
            });
        } catch (e) {
            for (const id of snapshotIds) {
                document.dispatchEvent(new CustomEvent(EVT_PAGE_RESPONSE, {
                    detail: { id, error: String(e && e.message || e) }
                }));
            }
        }
    }

    function scheduleWrite(id, value) {
        pendingWrite = { value, ids: pendingWrite ? pendingWrite.ids.concat(id) : [id] };
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(flushPendingWrite, WRITE_DEBOUNCE_MS);
    }

    function serializedSize(value) {
        try { return JSON.stringify(value).length; } catch (e) { return Infinity; }
    }

    // Relay service-worker messages into the page-world as DOM events.
    try {
        chrome.runtime.onMessage.addListener((msg) => {
            if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
            switch (msg.type) {
                case 'ytab:open-panel':
                    document.dispatchEvent(new CustomEvent(EVT_OPEN_PANEL));
                    break;
                case 'ytab:toggle-protection':
                    document.dispatchEvent(new CustomEvent(EVT_TOGGLE_PROTECTION));
                    break;
                case 'ytab:refresh-rules':
                    document.dispatchEvent(new CustomEvent(EVT_REFRESH_RULES));
                    break;
            }
        });
    } catch (e) { /* extension context gone, harmless */ }

    // Accept storage requests from the page-world. Hardened:
    //   - only one allowlisted key;
    //   - serialized payloads over MAX_PAYLOAD_BYTES are rejected;
    //   - writes are debounced so a flood of events can't exhaust quota.
    document.addEventListener(EVT_PAGE_REQUEST, (event) => {
        const detail = event && event.detail;
        if (!detail || typeof detail !== 'object') return;
        const { id, op, key, value } = detail;
        if (typeof id !== 'string' || !id || id.length > 64) return;
        if (key !== ALLOWED_STORAGE_KEY) {
            document.dispatchEvent(new CustomEvent(EVT_PAGE_RESPONSE, {
                detail: { id, error: 'storage key not allowed' }
            }));
            return;
        }
        try {
            if (op === 'get') {
                chrome.storage.local.get([key], (items) => {
                    const err = chrome.runtime && chrome.runtime.lastError;
                    document.dispatchEvent(new CustomEvent(EVT_PAGE_RESPONSE, {
                        detail: err
                            ? { id, error: String(err.message || err) }
                            : { id, value: items ? items[key] : undefined }
                    }));
                });
            } else if (op === 'set') {
                if (serializedSize(value) > MAX_PAYLOAD_BYTES) {
                    document.dispatchEvent(new CustomEvent(EVT_PAGE_RESPONSE, {
                        detail: { id, error: 'payload too large' }
                    }));
                    return;
                }
                scheduleWrite(id, value);
            } else {
                document.dispatchEvent(new CustomEvent(EVT_PAGE_RESPONSE, {
                    detail: { id, error: 'unknown op' }
                }));
            }
        } catch (e) {
            document.dispatchEvent(new CustomEvent(EVT_PAGE_RESPONSE, {
                detail: { id, error: String(e && e.message || e) }
            }));
        }
    });

    // Push cross-subdomain setting changes down into the page world.
    // Only forward the allowlisted key to avoid leaking any unrelated
    // extension storage shape into untrusted MAIN-world code.
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (!changes || !(ALLOWED_STORAGE_KEY in changes)) return;
            const payload = { [ALLOWED_STORAGE_KEY]: changes[ALLOWED_STORAGE_KEY].newValue };
            document.dispatchEvent(new CustomEvent(EVT_SETTINGS_CHANGED, { detail: payload }));
        });
    } catch (e) { /* ignore */ }
})();
