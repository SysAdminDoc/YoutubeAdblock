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
 *        flood chrome.storage quota, and
 *     d) expose DNR diagnostics as bounded rule IDs/counts only. Request
 *        URLs and raw browser errors never cross into the page world.
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
    const EVT_DNR_DIAGNOSTICS_REQUEST = 'ytab:dnr-diagnostics-request';
    const EVT_DNR_DIAGNOSTICS_RESPONSE = 'ytab:dnr-diagnostics-response';

    // Only the main-world script is allowed to write to this single key.
    // Any other key passed through EVT_PAGE_REQUEST is silently dropped.
    const ALLOWED_STORAGE_KEY = '__ytab_ext_settings__';
    const SYNC_META_KEY = '__ytab_ext_settings_sync_meta__';
    // 512 KB is an order of magnitude more than the real settings need
    // (they measure in the low single-digit KB) but still well under the
    // chrome.storage.local per-item quota.
    const MAX_PAYLOAD_BYTES = 512 * 1024;
    // Collapse rapid-fire writes into a single storage.local.set. Most
    // realistic workloads (toggle a few switches) coalesce nicely at 150 ms.
    const WRITE_DEBOUNCE_MS = 150;

    let pendingWrite = null;
    let pendingTimer = null;

    const inflight = new Set();
    let pendingGetIds = null;
    let pendingGetTimer = null;
    const GET_COALESCE_MS = 16;
    const RATE_WINDOW_MS = 1000;
    const RATE_MAX_OPS = 30;
    const DNR_DIAGNOSTICS_CACHE_MS = 30 * 1000;
    const DNR_DIAGNOSTICS_TIMEOUT_MS = 2000;
    const DNR_DIAGNOSTICS_WINDOW_MS = 5 * 60 * 1000;
    const DNR_DIAGNOSTICS_MAX_MATCHES = 128;
    const DNR_DIAGNOSTICS_MAX_COUNT = 1000000;
    const DNR_DIAGNOSTICS_REASONS = new Set([
        'api-unavailable',
        'permission-required',
        'quota-exceeded',
        'cooldown',
        'invalid-context',
        'query-failed'
    ]);
    let rateWindowStart = 0;
    let rateWindowCount = 0;
    let dnrDiagnosticsCache = null;
    let dnrDiagnosticsCacheAt = 0;
    let dnrDiagnosticsInFlight = false;

    function lastErrorText() {
        try {
            const err = chrome.runtime && chrome.runtime.lastError;
            return err ? String(err.message || err) : '';
        } catch (e) {
            return '';
        }
    }

    // The service worker owns chrome.storage for settings. The bridge only
    // relays a two-verb protocol on the page's behalf, so nothing reachable
    // from the page world can write persistence directly.
    function sendToBroker(message) {
        return new Promise((resolve) => {
            let settled = false;
            const finish = (response) => {
                if (settled) return;
                settled = true;
                resolve(response && typeof response === 'object'
                    ? response
                    : { ok: false, error: 'broker unavailable' });
            };
            try {
                const maybePromise = chrome.runtime.sendMessage(message, (response) => {
                    if (lastErrorText()) { finish(null); return; }
                    finish(response);
                });
                if (maybePromise && typeof maybePromise.then === 'function') {
                    maybePromise.then(finish, () => finish(null));
                }
            } catch (e) {
                finish(null);
            }
        });
    }

    function flushPendingWrite() {
        if (!pendingWrite) return;
        const { value, ids } = pendingWrite;
        pendingWrite = null;
        pendingTimer = null;
        const snapshotIds = ids.slice();
        sendToBroker({ type: 'ytab:settings-write', value }).then((response) => {
            const err = response.ok ? '' : (response.error || 'settings write failed');
            for (const id of snapshotIds) {
                inflight.delete(id);
                document.dispatchEvent(new CustomEvent(EVT_PAGE_RESPONSE, {
                    detail: err ? { id, error: err } : { id, ok: true }
                }));
            }
        });
    }

    function scheduleWrite(id, value) {
        pendingWrite = {
            value,
            ids: pendingWrite ? pendingWrite.ids.concat(id) : [id]
        };
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(flushPendingWrite, WRITE_DEBOUNCE_MS);
    }

    function pushSettingsSnapshot(value) {
        try {
            if (typeof localStorage !== 'undefined') {
                if (value && typeof value === 'object') {
                    localStorage.setItem(ALLOWED_STORAGE_KEY, JSON.stringify(value));
                } else {
                    localStorage.removeItem(ALLOWED_STORAGE_KEY);
                }
            }
        } catch (e) { /* ignore */ }
        document.dispatchEvent(new CustomEvent(EVT_SETTINGS_CHANGED, {
            detail: { [ALLOWED_STORAGE_KEY]: value }
        }));
    }

    function serializedSize(value) {
        try { return JSON.stringify(value).length; } catch (e) { return Infinity; }
    }

    function unavailableDnrDiagnostics(reason = 'query-failed') {
        return {
            status: 'unavailable',
            reason: DNR_DIAGNOSTICS_REASONS.has(reason) ? reason : 'query-failed',
            windowMinutes: 5,
            total: 0,
            matches: [],
            lastMatchedAt: 0
        };
    }

    function sanitizeDnrDiagnostics(value) {
        if (!value || typeof value !== 'object' || value.status !== 'available') {
            return unavailableDnrDiagnostics(value && value.reason);
        }

        const counts = new Map();
        const sourceMatches = Array.isArray(value.matches)
            ? value.matches.slice(0, DNR_DIAGNOSTICS_MAX_MATCHES)
            : [];
        for (const match of sourceMatches) {
            const ruleId = Number(match && match.ruleId);
            const count = Number(match && match.count);
            if (!Number.isSafeInteger(ruleId) || ruleId <= 0) continue;
            if (!Number.isSafeInteger(count) || count <= 0) continue;
            const previous = counts.get(ruleId) || 0;
            counts.set(ruleId, Math.min(DNR_DIAGNOSTICS_MAX_COUNT, previous + count));
        }

        const matches = [...counts.entries()]
            .sort(([left], [right]) => left - right)
            .map(([ruleId, count]) => ({ ruleId, count }));
        const lastMatchedAt = Number(value.lastMatchedAt);
        const now = Date.now();
        return {
            status: 'available',
            reason: '',
            windowMinutes: 5,
            total: matches.reduce((sum, match) => sum + match.count, 0),
            matches,
            lastMatchedAt: Number.isFinite(lastMatchedAt) &&
                lastMatchedAt >= now - DNR_DIAGNOSTICS_WINDOW_MS - 60000 &&
                lastMatchedAt <= now + 60000
                ? Math.trunc(lastMatchedAt)
                : 0
        };
    }

    function dispatchDnrDiagnostics(value) {
        document.dispatchEvent(new CustomEvent(EVT_DNR_DIAGNOSTICS_RESPONSE, {
            detail: value
        }));
    }

    function requestDnrDiagnostics() {
        const now = Date.now();
        if (dnrDiagnosticsCache && now - dnrDiagnosticsCacheAt < DNR_DIAGNOSTICS_CACHE_MS) {
            dispatchDnrDiagnostics(dnrDiagnosticsCache);
            return;
        }
        if (dnrDiagnosticsInFlight) return;
        dnrDiagnosticsInFlight = true;
        let settled = false;
        let timer = null;

        function finish(response) {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            dnrDiagnosticsInFlight = false;
            dnrDiagnosticsCache = sanitizeDnrDiagnostics(response);
            dnrDiagnosticsCacheAt = Date.now();
            dispatchDnrDiagnostics(dnrDiagnosticsCache);
        }

        try {
            timer = setTimeout(
                () => finish(unavailableDnrDiagnostics('query-failed')),
                DNR_DIAGNOSTICS_TIMEOUT_MS
            );
            const maybePromise = chrome.runtime.sendMessage(
                { type: 'ytab:get-dnr-diagnostics' },
                (response) => {
                    if (lastErrorText()) {
                        finish(unavailableDnrDiagnostics('query-failed'));
                        return;
                    }
                    finish(response);
                }
            );
            if (maybePromise && typeof maybePromise.then === 'function') {
                maybePromise.then(finish, () => finish(unavailableDnrDiagnostics('query-failed')));
            }
        } catch (e) {
            finish(unavailableDnrDiagnostics('query-failed'));
        }
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
                case 'ytab:block-channel':
                    document.dispatchEvent(new CustomEvent('ytab:block-channel'));
                    break;
                case 'ytab:api-permissions-changed':
                    document.dispatchEvent(new CustomEvent('ytab:api-permissions-status', {
                        detail: { granted: !!msg.granted }
                    }));
                    break;
            }
        });
    } catch (e) { /* extension context gone, harmless */ }

    function flushPendingGet() {
        if (!pendingGetIds) return;
        const ids = pendingGetIds;
        pendingGetIds = null;
        pendingGetTimer = null;
        sendToBroker({ type: 'ytab:settings-read' }).then((response) => {
            const err = response.ok ? '' : (response.error || 'settings read failed');
            for (const rid of ids) {
                inflight.delete(rid);
                document.dispatchEvent(new CustomEvent(EVT_PAGE_RESPONSE, {
                    detail: err ? { id: rid, error: err } : { id: rid, value: response.value }
                }));
            }
        });
    }

    function isRateLimited() {
        const now = Date.now();
        if (now - rateWindowStart > RATE_WINDOW_MS) {
            rateWindowStart = now;
            rateWindowCount = 0;
        }
        if (rateWindowCount >= RATE_MAX_OPS) return true;
        rateWindowCount++;
        return false;
    }

    document.addEventListener(EVT_PAGE_REQUEST, (event) => {
        const detail = event && event.detail;
        if (!detail || typeof detail !== 'object') return;
        const { id, op, key, value } = detail;
        if (typeof id !== 'string' || !id || id.length > 64) return;
        if (inflight.has(id)) return;
        if (key !== ALLOWED_STORAGE_KEY) {
            document.dispatchEvent(new CustomEvent(EVT_PAGE_RESPONSE, {
                detail: { id, error: 'storage key not allowed' }
            }));
            return;
        }
        if (isRateLimited()) {
            document.dispatchEvent(new CustomEvent(EVT_PAGE_RESPONSE, {
                detail: { id, error: 'rate limited' }
            }));
            return;
        }
        inflight.add(id);
        try {
            if (op === 'get') {
                pendingGetIds = pendingGetIds ? pendingGetIds.concat(id) : [id];
                if (pendingGetTimer) clearTimeout(pendingGetTimer);
                pendingGetTimer = setTimeout(flushPendingGet, GET_COALESCE_MS);
            } else if (op === 'set') {
                if (serializedSize(value) > MAX_PAYLOAD_BYTES) {
                    inflight.delete(id);
                    document.dispatchEvent(new CustomEvent(EVT_PAGE_RESPONSE, {
                        detail: { id, error: 'payload too large' }
                    }));
                    return;
                }
                scheduleWrite(id, value);
            } else {
                inflight.delete(id);
                document.dispatchEvent(new CustomEvent(EVT_PAGE_RESPONSE, {
                    detail: { id, error: 'unknown op' }
                }));
            }
        } catch (e) {
            inflight.delete(id);
            document.dispatchEvent(new CustomEvent(EVT_PAGE_RESPONSE, {
                detail: { id, error: String(e && e.message || e) }
            }));
        }
    });

    document.addEventListener(EVT_DNR_DIAGNOSTICS_REQUEST, requestDnrDiagnostics);

    // Push cross-subdomain setting changes down into the page world.
    // Only forward the allowlisted key to avoid leaking any unrelated
    // extension storage shape into untrusted MAIN-world code.
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (!changes) return;
            // Only the allowlisted key is forwarded, so no unrelated
            // extension storage shape can leak into MAIN-world code.
            if (area === 'local' && (ALLOWED_STORAGE_KEY in changes)) {
                pushSettingsSnapshot(changes[ALLOWED_STORAGE_KEY].newValue);
                return;
            }
            // A sync change means another device published a snapshot. The
            // broker decides whether it wins; the bridge just asks again.
            if (area === 'sync' && (SYNC_META_KEY in changes)) {
                hydrateFromBroker();
            }
        });
    } catch (e) { /* ignore */ }

    function hydrateFromBroker() {
        sendToBroker({ type: 'ytab:settings-read' }).then((response) => {
            if (response.ok && response.value && typeof response.value === 'object') {
                pushSettingsSnapshot(response.value);
            }
        });
    }

    function checkApiPermissions() {
        try {
            chrome.runtime.sendMessage({ type: 'ytab:check-api-permissions' }, (response) => {
                if (chrome.runtime.lastError || !response) return;
                document.dispatchEvent(new CustomEvent('ytab:api-permissions-status', {
                    detail: { granted: !!response.granted }
                }));
            });
        } catch (e) { /* ignore */ }
    }

    // Best-effort early hydration on each load. The main-world script uses
    // localStorage as its synchronous read path, so we copy the mirrored
    // settings into localStorage immediately, then apply a newer
    // chrome.storage.sync snapshot if another signed-in browser wrote one.
    hydrateFromBroker();
    checkApiPermissions();

    try {
        window.addEventListener('pagehide', flushPendingWrite, { capture: true });
    } catch (e) { /* ignore */ }
})();
