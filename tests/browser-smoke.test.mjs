import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const userscriptSource = fs.readFileSync(path.join(repoRoot, 'YoutubeAdblock.user.js'), 'utf8');
const extensionSource = fs.readFileSync(path.join(repoRoot, 'extension', 'main.js'), 'utf8');
const filterText = fs.readFileSync(path.join(repoRoot, 'youtube-adblock-filters.txt'), 'utf8').replace(/\r\n?/g, '\n');
const filterManifest = fs.readFileSync(path.join(repoRoot, 'youtube-adblock-filters.manifest.json'), 'utf8');
const filterSignature = fs.readFileSync(path.join(repoRoot, 'youtube-adblock-filters.txt.sig'), 'utf8');
const filterManifestSignature = fs.readFileSync(path.join(repoRoot, 'youtube-adblock-filters.manifest.json.sig'), 'utf8');
const webpackSigManifest = fs.readFileSync(path.join(repoRoot, 'webpack-ad-signatures.manifest.json'), 'utf8');
const webpackSigManifestSignature = fs.readFileSync(path.join(repoRoot, 'webpack-ad-signatures.manifest.json.sig'), 'utf8');
const webpackSignatureSig = fs.readFileSync(path.join(repoRoot, 'webpack-ad-signatures.json.sig'), 'utf8');
const webpackSignatureJson = fs.readFileSync(path.join(repoRoot, 'webpack-ad-signatures.json'), 'utf8');

const surfaces = [
    { name: 'www-watch-dark', url: 'https://www.youtube.com/watch?v=smoketest01', width: 1440, height: 900, theme: 'dark' },
    { name: 'www-watch-light', url: 'https://www.youtube.com/watch?v=smoketest02&theme=light', width: 1440, height: 900, theme: 'light' },
    { name: 'www-watch-wide', url: 'https://www.youtube.com/watch?v=smoketest03', width: 1920, height: 1080, theme: 'dark' },
    { name: 'music-watch-dark', url: 'https://music.youtube.com/watch?v=smoketest04', width: 1440, height: 900, theme: 'dark' },
    { name: 'tv-home-dark', url: 'https://tv.youtube.com/', width: 1440, height: 900, theme: 'dark' },
    { name: 'kids-setup-dark', url: 'https://www.youtubekids.com/', width: 1440, height: 900, theme: 'dark' },
];

function findBrowserPath() {
    if (process.env.YTAB_BROWSER_PATH && fs.existsSync(process.env.YTAB_BROWSER_PATH)) {
        return process.env.YTAB_BROWSER_PATH;
    }
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function fixtureHtml(label) {
    const light = /[?&]theme=light(?:&|$)/.test(label);
    return `<!doctype html>
<html${light ? '' : ' dark'}>
<head>
  <meta charset="utf-8">
  <title>${label}</title>
  <style>
    body { margin: 0; min-height: 120vh; background: ${light ? '#f4f6f8' : '#0f0f0f'}; color: ${light ? '#17212b' : '#fff'}; font-family: Arial, sans-serif; }
    #page { padding: 24px; }
    ytd-rich-grid-renderer { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
    ytd-rich-item-renderer { min-height: 120px; background: ${light ? '#fff' : '#202020'}; border-radius: 8px; padding: 12px; }
    .fixture-hidden { display: none !important; }
  </style>
</head>
<body>
  <div id="page">
    <div id="owner"><div id="channel-name"><a href="/@SmokeChannel">Smoke Channel</a></div></div>
    <div id="upload-info"><div id="channel-name"><a href="/@SmokeChannel">Smoke Channel</a></div></div>
    <div id="movie_player"><video class="html5-main-video"></video></div>
    <segmented-like-dislike-button-view-model>
      <dislike-button-view-model class="fixture-hidden"><button aria-label="Dislike this video"></button></dislike-button-view-model>
      <dislike-button-view-model><button aria-label="Dislike this video"></button></dislike-button-view-model>
      <dislike-button-view-model class="fixture-hidden"><button aria-label="Dislike this video"></button></dislike-button-view-model>
    </segmented-like-dislike-button-view-model>
    <ytmusic-player-bar><div id="right-controls"><tp-yt-paper-slider id="volume-slider" role="slider" aria-label="Volume"></tp-yt-paper-slider></div></ytmusic-player-bar>
    <ytu-ads-title-tray class="fixture-hidden"></ytu-ads-title-tray>
    <ytd-rich-grid-renderer>
      <ytd-rich-item-renderer><a href="/watch?v=one">Fixture video</a></ytd-rich-item-renderer>
      <ytd-rich-item-renderer><a href="/watch?v=two">Another fixture video</a></ytd-rich-item-renderer>
    </ytd-rich-grid-renderer>
  </div>
  <script>
    const player = document.getElementById('movie_player');
    const tracks = [
      { id: 'en-auto', audioTrack: { name: 'English translated' } },
      { id: 'ja-original', audioTrack: { name: 'Japanese Original' } }
    ];
    player.getAvailableAudioTracks = () => tracks;
    player.getAudioTrack = () => tracks[0];
    player.setAudioTrack = (track) => { window.__selectedAudioTrack = track && track.id; };
  </script>
</body>
</html>`;
}

async function installRoutes(context, requestLog = []) {
    await context.route('**/*', async route => {
        const requestUrl = route.request().url();
        requestLog.push(requestUrl);
        if (requestUrl.includes('youtube-adblock-filters.manifest.json.sig')) {
            await route.fulfill({ status: 200, contentType: 'text/plain', body: filterManifestSignature });
            return;
        }
        if (requestUrl.includes('webpack-ad-signatures.manifest.json.sig')) {
            await route.fulfill({ status: 200, contentType: 'text/plain', body: webpackSigManifestSignature });
            return;
        }
        if (requestUrl.includes('webpack-ad-signatures.manifest.json')) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: webpackSigManifest });
            return;
        }
        if (requestUrl.includes('webpack-ad-signatures.json.sig')) {
            await route.fulfill({ status: 200, contentType: 'text/plain', body: webpackSignatureSig });
            return;
        }
        if (requestUrl.includes('youtube-adblock-filters.manifest.json')) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: filterManifest });
            return;
        }
        if (requestUrl.includes('youtube-adblock-filters.txt.sig')) {
            await route.fulfill({ status: 200, contentType: 'text/plain', body: filterSignature });
            return;
        }
        if (requestUrl.includes('youtube-adblock-filters.txt')) {
            await route.fulfill({ status: 200, contentType: 'text/plain', body: filterText });
            return;
        }
        if (requestUrl.includes('webpack-ad-signatures.json')) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: webpackSignatureJson });
            return;
        }
        if (requestUrl.includes('returnyoutubedislikeapi.com/votes')) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ dislikes: 1234 }) });
            return;
        }
        if (/^https:\/\/([^/]+\.)?(youtube\.com|youtube-nocookie\.com|youtubekids\.com)\//i.test(requestUrl)) {
            await route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml(requestUrl) });
            return;
        }
        await route.fulfill({ status: 204, body: '' });
    });
}

async function installUserscriptMode(page) {
    await page.addInitScript(({
        filterText,
        filterManifest,
        filterSignature,
        filterManifestSignature,
        webpackSignatureJson,
        webpackSigManifest,
        webpackSigManifestSignature,
        webpackSignatureSig,
    }) => {
        window.__ytabStore = {};
        window.__ytabMenus = [];
        window.GM_getValue = (key, def) => Object.prototype.hasOwnProperty.call(window.__ytabStore, key)
            ? window.__ytabStore[key]
            : def;
        window.GM_setValue = (key, value) => { window.__ytabStore[key] = value; };
        window.GM_registerMenuCommand = (label, fn) => {
            window.__ytabMenus.push({ label, fn });
            return label;
        };
        window.GM_unregisterMenuCommand = () => {};
        window.GM_xmlhttpRequest = (opts) => {
            setTimeout(() => {
                let body = filterText;
                let status = 200;
                if (opts.url.includes('youtube-adblock-filters.manifest.json.sig')) body = filterManifestSignature;
                else if (opts.url.includes('youtube-adblock-filters.manifest.json')) body = filterManifest;
                else if (opts.url.includes('youtube-adblock-filters.txt.sig')) body = filterSignature;
                else if (opts.url.includes('webpack-ad-signatures.manifest.json.sig')) body = webpackSigManifestSignature;
                else if (opts.url.includes('webpack-ad-signatures.manifest.json')) body = webpackSigManifest;
                else if (opts.url.includes('webpack-ad-signatures.json.sig')) body = webpackSignatureSig;
                else if (opts.url.includes('webpack-ad-signatures.json')) body = webpackSignatureJson;
                else if (opts.url.includes('returnyoutubedislikeapi.com/votes')) body = JSON.stringify({ dislikes: 1234 });
                else if (!opts.url.includes('youtube-adblock-filters.txt')) {
                    status = 404;
                    body = '';
                }
                opts.onload?.({ status, statusText: status === 200 ? 'OK' : 'Not Found', responseText: body, readyState: 4 });
            }, 0);
        };
    }, {
        filterText,
        filterManifest,
        filterSignature,
        filterManifestSignature,
        webpackSignatureJson,
        webpackSigManifest,
        webpackSigManifestSignature,
        webpackSignatureSig,
    });
    await page.addInitScript({ content: userscriptSource });
}

async function installExtensionMode(page) {
    await page.addInitScript(() => {
        document.addEventListener('ytab:dnr-diagnostics-request', () => {
            document.dispatchEvent(new CustomEvent('ytab:dnr-diagnostics-response', {
                detail: {
                    status: 'available',
                    windowMinutes: 5,
                    total: 3,
                    matches: [
                        { ruleId: 4, count: 1 },
                        { ruleId: 19, count: 2 }
                    ],
                    lastMatchedAt: Date.now()
                }
            }));
        });
    });
    await page.addInitScript({ content: extensionSource });
}

async function openControlCenter(page, mode) {
    if (mode === 'userscript') {
        await page.waitForFunction(() => Array.isArray(window.__ytabMenus) && window.__ytabMenus.some(item => /Open Control Center/.test(item.label)));
        await page.evaluate(() => {
            const item = window.__ytabMenus.find(entry => /Open Control Center/.test(entry.label));
            item.fn();
        });
    } else {
        await page.evaluate(() => {
            document.dispatchEvent(new CustomEvent('ytab:open-panel'));
        });
    }
    await page.waitForSelector('.ytab-overlay.ytab-active .ytab-panel', { timeout: 5000 });
    await page.locator('.ytab-panel').evaluate(async panel => {
        // Only settle finite animations. Looping animations (the rule-sync
        // spinner) never resolve `finished`, so awaiting them deadlocks
        // whenever a refresh is still in flight when the panel opens.
        const animations = panel.getAnimations({ subtree: true }).filter(animation => {
            const iterations = animation.effect?.getTiming?.().iterations;
            return Number.isFinite(iterations ?? 1);
        });
        await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
    });
}

async function assertPanelLayout(page, width, height) {
    const box = await page.locator('.ytab-panel').boundingBox();
    assert.ok(box, 'Control Center panel should have a bounding box');
    assert.ok(box.width <= width + 1, `panel width ${box.width} exceeds viewport ${width}`);
    assert.ok(box.height <= height + 1, `panel height ${box.height} exceeds viewport ${height}`);
    const overflow = await page.evaluate(() => {
        const panel = document.querySelector('.ytab-panel');
        return panel ? {
            x: panel.scrollWidth - panel.clientWidth,
            y: panel.scrollHeight - panel.clientHeight,
        } : { x: 0, y: 0 };
    });
    assert.ok(overflow.x <= 2, `panel has horizontal overflow: ${overflow.x}`);
}

async function assertOverviewActionsVisible(page) {
    const bounds = await page.evaluate(() => {
        const content = document.querySelector('.ytab-content');
        const actions = document.querySelector('.ytab-summary-actions');
        if (!content || !actions) return null;
        const contentRect = content.getBoundingClientRect();
        const actionsRect = actions.getBoundingClientRect();
        return {
            contentBottom: contentRect.bottom,
            actionsBottom: actionsRect.bottom,
            actionsTop: actionsRect.top,
        };
    });
    assert.ok(bounds, 'Overview content and quick actions should exist');
    assert.ok(bounds.actionsTop >= 0, 'Overview quick actions should start inside the viewport');
    assert.ok(
        bounds.actionsBottom <= bounds.contentBottom + 1,
        `Overview quick actions are clipped (${bounds.actionsBottom} > ${bounds.contentBottom})`
    );
}

async function waitForPanelScrollSettled(page, sectionId) {
    const bounds = await page.evaluate(async (targetSectionId) => {
        const content = document.querySelector('.ytab-content');
        const section = document.getElementById(targetSectionId);
        if (!content || !section) return null;

        await new Promise(resolve => {
            let lastTop = content.scrollTop;
            let stableFrames = 0;
            let totalFrames = 0;
            const sample = () => {
                const nextTop = content.scrollTop;
                stableFrames = Math.abs(nextTop - lastTop) < 0.5 ? stableFrames + 1 : 0;
                lastTop = nextTop;
                totalFrames += 1;
                if ((totalFrames >= 12 && stableFrames >= 8) || totalFrames >= 180) {
                    resolve();
                    return;
                }
                requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
        });

        const contentRect = content.getBoundingClientRect();
        const sectionRect = section.getBoundingClientRect();

        // Being inside the scroll viewport is not the same as being
        // readable: a preceding card can paint over the destination
        // heading. Hit-test the heading and its first control so an
        // obscured destination fails instead of passing on bounds alone.
        function coverage(el) {
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return { visible: false, reason: 'zero-size' };
            const insideViewport = rect.top >= contentRect.top - 1 && rect.bottom <= contentRect.bottom + 1;
            const probes = [
                [rect.left + Math.min(8, rect.width / 4), rect.top + rect.height / 2],
                [rect.left + rect.width / 2, rect.top + rect.height / 2],
            ];
            let covered = null;
            for (const [x, y] of probes) {
                const hit = document.elementFromPoint(x, y);
                if (!hit) { covered = 'no-hit'; continue; }
                if (hit !== el && !el.contains(hit) && !hit.contains(el)) {
                    covered = hit.className || hit.tagName;
                }
            }
            return { visible: insideViewport, covered, top: rect.top, bottom: rect.bottom };
        }

        const heading = section.querySelector('.ytab-section-title, h2, h3, summary');
        const firstControl = section.querySelector('input, button, select, textarea, a[href]');
        return {
            contentTop: contentRect.top,
            contentBottom: contentRect.bottom,
            sectionTop: sectionRect.top,
            sectionBottom: sectionRect.bottom,
            heading: coverage(heading),
            firstControl: coverage(firstControl),
        };
    }, sectionId);
    assert.ok(bounds, `panel content and section should exist: ${sectionId}`);
    assert.ok(
        bounds.sectionBottom > bounds.contentTop + 1 && bounds.sectionTop < bounds.contentBottom - 1,
        `selected section is outside the content viewport: ${sectionId}`
    );
    if (bounds.heading) {
        assert.ok(bounds.heading.visible,
            `destination heading is not fully inside the content viewport: ${sectionId} (top=${bounds.heading.top}, contentTop=${bounds.contentTop})`);
        assert.equal(bounds.heading.covered, null,
            `destination heading is painted over by "${bounds.heading.covered}": ${sectionId}`);
    }
    // A control scrolled below the fold hit-tests onto whatever is painted
    // there (the footer), which is not obscuration. Only assert
    // non-obscuration for controls actually inside the content viewport.
    if (bounds.firstControl && bounds.firstControl.visible) {
        assert.equal(bounds.firstControl.covered, null,
            `first control of the destination is painted over by "${bounds.firstControl.covered}": ${sectionId}`);
    }
}

async function assertAdExclusiveRequestsShortCircuit(page, requestLog) {
    const requestStart = requestLog.length;
    const result = await page.evaluate(async () => {
        const response = await fetch('https://googleads.g.doubleclick.net/pagead/id?ytab-smoke=1');
        const fetchBody = await response.text();
        const xhr = await new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.open('GET', 'https://www.google.com/pagead/lvz?ytab-smoke=1');
            request.addEventListener('load', () => resolve({
                status: request.status,
                body: request.responseText,
            }), { once: true });
            request.addEventListener('error', () => reject(new Error('blocked ad XHR emitted an error')), { once: true });
            request.send();
        });
        return { fetchStatus: response.status, fetchBody, xhr };
    });

    assert.deepEqual(result, {
        fetchStatus: 200,
        fetchBody: '{}',
        xhr: { status: 200, body: '{}' },
    });
    const escaped = requestLog.slice(requestStart).filter(requestUrl =>
        /(?:doubleclick\.net|google\.com\/pagead\/)/i.test(requestUrl)
    );
    assert.deepEqual(escaped, [], `ad-exclusive requests escaped to the network: ${escaped.join(', ')}`);
}

async function exercisePanel(page, mode, surface) {
    await assert.match(await page.locator('#ytab-dialog-title').textContent(), /YoutubeAdblock/);
    await assert.equal(await page.locator('.ytab-nav-button').count(), 10);
    await assert.equal(await page.locator('.ytab-nav-button[aria-current="page"]').textContent(), 'Overview');
    await assert.equal(await page.locator('.ytab-panel').evaluate(el => getComputedStyle(el).colorScheme), surface.theme);
    if (surface.width >= 1440 && surface.height >= 900) {
        await assertOverviewActionsVisible(page);
    }
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.ytab-panel')), true);
    await page.click('#ytab-master-toggle');
    await page.waitForFunction(() => document.body.textContent.includes('Protection Paused'));
    await page.click('#ytab-master-toggle');
    await page.waitForFunction(() => document.body.textContent.includes('Protection On'));
    await page.click('#ytab-quick-refresh');
    await page.waitForFunction(() => document.body.textContent.includes('Rule refresh complete'));
    await page.waitForFunction(() => document.querySelector('.ytab-toast-region')?.parentElement?.classList.contains('ytab-toast-lane'));
    assert.equal(await page.locator('.ytab-toast-lane .ytab-toast').count(), 1);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('ytab:block-channel')));
    const blocked = await page.evaluate((mode) => {
        if (mode === 'userscript') return window.__ytabStore?.ytab_channel_blocklist || '';
        const raw = localStorage.getItem('__ytab_ext_settings__') || '{}';
        return JSON.parse(raw).ytab_channel_blocklist || '';
    }, mode);
    assert.match(blocked, /Smoke Channel|@SmokeChannel/i);

    if (surface.name === 'music-watch-dark') {
        await page.click('.ytab-nav-button[data-section-id="ytab-section-enhance"]');
        await page.waitForFunction(() => document.querySelector('#ytab-section-enhance details')?.open === true);
        await page.click('#ytab-toggle-volumeBoost');
        await page.waitForSelector('ytmusic-player-bar #right-controls > #ytab-vol-boost', { timeout: 5000 });
        await assert.equal(await page.locator('#ytab-vol-boost input[type="range"]').getAttribute('aria-label'), 'YoutubeAdblock volume boost');
    }

    if (mode === 'userscript' && surface.name === 'www-watch-dark') {
        await page.click('.ytab-nav-button[data-section-id="ytab-section-enhance"]');
        await page.waitForFunction(() => document.querySelector('#ytab-section-enhance details')?.open === true);
        // RYD is consent-gated: no request may fire until the user allows
        // the service, so the fixture must grant consent through the real
        // consent card before enabling the feature toggle.
        const rydConsentCard = '[data-consent-service="returnYoutubeDislike"]';
        await page.waitForSelector(`${rydConsentCard} .ytab-btn-row button`, { timeout: 5000 });
        assert.equal(
            await page.locator(`${rydConsentCard} .ytab-pill`).getAttribute('data-tone'),
            'warn',
            'RYD consent must start unset');
        await page.click(`${rydConsentCard} .ytab-btn-row button:first-child`);
        await page.waitForFunction((sel) =>
            document.querySelector(`${sel} .ytab-pill`)?.dataset.tone === 'success',
        rydConsentCard, { timeout: 5000 });
        await page.click('#ytab-toggle-returnYoutubeDislike');
        await page.waitForFunction(() => {
            const buttons = [...document.querySelectorAll('dislike-button-view-model button')];
            const visible = buttons.find(button => button.getBoundingClientRect().width > 0);
            return visible?.querySelector('.ytab-ryd-count')?.textContent === '1.2K';
        }, { timeout: 6000 });
        const hiddenCount = await page.locator('.fixture-hidden .ytab-ryd-count').count();
        assert.equal(hiddenCount, 0, 'RYD count must not be written into hidden duplicate controls');
    }

    if (mode === 'userscript' && surface.name === 'www-watch-dark') {
        await page.click('.ytab-nav-button[data-section-id="ytab-section-blocklist"]');
        await page.waitForFunction(() => document.querySelector('#ytab-section-blocklist details')?.open === true);
        assert.equal(await page.locator('#ytab-toggle-whitelistMode').isChecked(), false);
        assert.equal(await page.locator('#ytab-toggle-durationFilter').isChecked(), false);
        assert.equal(await page.locator('#ytab-toggle-adAllowlist').isChecked(), false);
        await page.click('#ytab-toggle-durationFilter');
        await page.waitForFunction(() => document.querySelector('#ytab-toggle-durationFilter')?.checked === true);
        // Invoke the current checkbox directly so this exercises the rebuilt
        // row's real change handler without retaining a stale element handle.
        await page.evaluate(() => document.querySelector('#ytab-toggle-keywordBlocker')?.click());
        const focusOverrides = await page.evaluate((mode) => {
            if (mode === 'userscript') return window.__ytabStore?.ytab_feature_overrides || {};
            const raw = localStorage.getItem('__ytab_ext_settings__') || '{}';
            return JSON.parse(raw).ytab_feature_overrides || {};
        }, mode);
        assert.equal(focusOverrides.durationFilter, true,
            'duration filter should survive a second feature-toggle rebuild');
        assert.equal(focusOverrides.keywordBlocker, true);
    }

    // Rail navigation is verified on every desktop main-site surface, so
    // non-obscuration is proven in both themes and at both supported
    // widths rather than only in the canonical dark journey.
    if (surface.name.startsWith('www-watch')) {
        const destinations = await page.locator('.ytab-nav-button').evaluateAll(buttons =>
            buttons.map(button => ({
                sectionId: button.dataset.sectionId,
                label: button.textContent.trim(),
            }))
        );
        for (const destination of destinations) {
            await page.click(`.ytab-nav-button[data-section-id="${destination.sectionId}"]`);
            await page.waitForFunction(({ sectionId }) => {
                const active = document.querySelector('.ytab-nav-button-active');
                const section = document.getElementById(sectionId);
                const disclosure = section?.querySelector('.ytab-section-disclosure');
                return active?.dataset.sectionId === sectionId && !!section &&
                    (!disclosure || disclosure.open);
            }, destination);
            assert.equal(
                await page.locator('.ytab-nav-button[aria-current="page"]').textContent(),
                destination.label
            );
            await waitForPanelScrollSettled(page, destination.sectionId);
            if (mode === 'userscript') {
                const sectionSlug = destination.sectionId.replace(/^ytab-section-/, '');
                await page.screenshot({
                    path: path.join(repoRoot, 'dist', 'browser-smoke', `userscript-${surface.name}-section-${sectionSlug}.png`),
                    fullPage: false,
                });
            }
        }
    }

    await page.click('.ytab-nav-button[data-section-id="ytab-section-diagnostics"]');
    await page.waitForFunction(() =>
        document.querySelector('#ytab-section-diagnostics details')?.open === true &&
        document.querySelector('.ytab-nav-button-active')?.dataset.sectionId === 'ytab-section-diagnostics'
    );
    await waitForPanelScrollSettled(page, 'ytab-section-diagnostics');
    await assert.equal(await page.locator('.ytab-nav-button[aria-current="page"]').textContent(), 'Diagnostics');
    assert.equal(await page.locator('.ytab-nav-button-active').count(), 1);
    assert.equal(await page.locator('.ytab-nav-button-active').textContent(), 'Diagnostics');
    if (mode === 'extension') {
        await page.waitForFunction(() =>
            document.querySelector('#ytab-dnr-diagnostics .ytab-note-title')?.textContent === '3 recent network matches'
        );
        assert.match(
            await page.locator('#ytab-dnr-diagnostics .ytab-note-text').textContent(),
            /2 packaged rules matched in the last 5 minutes/
        );
    } else {
        assert.equal(
            await page.locator('#ytab-dnr-diagnostics .ytab-note-title').textContent(),
            'Extension-only evidence'
        );
    }

    if (mode === 'userscript' && surface.name === 'www-watch-dark') {
        await page.click('#ytab-restore-defaults');
        assert.equal(await page.locator('#ytab-restore-defaults').textContent(), 'Confirm Restore');
        await page.click('#ytab-restore-defaults');
        await page.waitForFunction(() => document.body.textContent.includes('Recommended defaults restored'));
        assert.equal(await page.locator('#ytab-master-toggle').isChecked(), true);
        assert.equal(await page.locator('.ytab-toast-lane .ytab-toast').count(), 1);
    }
}

const browserPath = findBrowserPath();

test('browser smoke matrix opens Control Center across modes and surfaces', { skip: browserPath ? false : 'Chrome or Edge not found; set YTAB_BROWSER_PATH.' }, async (t) => {
    const browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
        args: ['--disable-background-networking', '--no-first-run'],
    });
    t.after(async () => { await browser.close(); });

    const screenshotDir = path.join(repoRoot, 'dist', 'browser-smoke');
    fs.mkdirSync(screenshotDir, { recursive: true });

    const requestedMode = process.env.YTAB_SMOKE_MODE;
    const requestedSurface = process.env.YTAB_SMOKE_SURFACE;
    const modes = requestedMode ? [requestedMode] : ['userscript', 'extension'];
    const selectedSurfaces = requestedSurface
        ? surfaces.filter(surface => surface.name === requestedSurface)
        : surfaces;
    assert.ok(modes.every(mode => mode === 'userscript' || mode === 'extension'),
        `unknown YTAB_SMOKE_MODE: ${requestedMode}`);
    assert.ok(selectedSurfaces.length > 0, `unknown YTAB_SMOKE_SURFACE: ${requestedSurface}`);

    for (const mode of modes) {
        for (const surface of selectedSurfaces) {
            await t.test(`${mode} ${surface.name}`, async () => {
                const context = await browser.newContext({
                    viewport: { width: surface.width, height: surface.height },
                    deviceScaleFactor: 1,
                });
                const requestLog = [];
                await installRoutes(context, requestLog);
                const page = await context.newPage();
                const consoleErrors = [];
                page.on('console', msg => {
                    if (process.env.YTAB_SMOKE_ECHO) console.log('PAGE:' + msg.type() + ': ' + msg.text());
                    if (msg.type() === 'error') consoleErrors.push(msg.text());
                });
                page.on('pageerror', err => consoleErrors.push(err.message));

                if (mode === 'userscript') await installUserscriptMode(page);
                else await installExtensionMode(page);

                await page.goto(surface.url, { waitUntil: 'domcontentloaded' });
                await openControlCenter(page, mode);
                await assertPanelLayout(page, surface.width, surface.height);
                if (surface.name === 'www-watch-dark' || surface.name === 'www-watch-light') {
                    await page.screenshot({
                        path: path.join(screenshotDir, `${mode}-${surface.name}-initial.png`),
                        fullPage: false,
                    });
                }
                if (surface.name === 'www-watch-dark') {
                    await assertAdExclusiveRequestsShortCircuit(page, requestLog);
                }
                await exercisePanel(page, mode, surface);
                await page.screenshot({
                    path: path.join(screenshotDir, `${mode}-${surface.name}.png`),
                    fullPage: false,
                });
                assert.deepEqual(consoleErrors, []);
                await page.keyboard.press('Escape');
                await page.waitForFunction(() => !document.querySelector('.ytab-overlay')?.classList.contains('ytab-active'));
                await assert.equal(await page.locator('.ytab-toast-region').evaluate(el => el.parentElement === document.body), true);
                await context.close();
            });
        }
    }
});
