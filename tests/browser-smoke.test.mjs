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

const surfaces = [
    { name: 'www-watch', url: 'https://www.youtube.com/watch?v=smoketest01', width: 1366, height: 820 },
    { name: 'mobile-watch', url: 'https://m.youtube.com/watch?v=smoketest02', width: 390, height: 844 },
    { name: 'music-watch', url: 'https://music.youtube.com/watch?v=smoketest03', width: 1280, height: 760 },
    { name: 'kids-watch', url: 'https://www.youtubekids.com/watch?v=smoketest04', width: 1024, height: 768 },
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
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${label}</title>
  <style>
    body { margin: 0; min-height: 120vh; background: #0f0f0f; color: #fff; font-family: Arial, sans-serif; }
    #page { padding: 24px; }
    ytd-rich-grid-renderer { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
    ytd-rich-item-renderer { min-height: 120px; background: #202020; border-radius: 8px; padding: 12px; }
  </style>
</head>
<body>
  <div id="page">
    <div id="owner"><div id="channel-name"><a href="/@SmokeChannel">Smoke Channel</a></div></div>
    <div id="upload-info"><div id="channel-name"><a href="/@SmokeChannel">Smoke Channel</a></div></div>
    <div id="movie_player"></div>
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

async function installRoutes(context) {
    await context.route('**/*', async route => {
        const requestUrl = route.request().url();
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
        if (/^https:\/\/([^/]+\.)?(youtube\.com|youtube-nocookie\.com|youtubekids\.com)\//i.test(requestUrl)) {
            await route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml(requestUrl) });
            return;
        }
        await route.fulfill({ status: 204, body: '' });
    });
}

async function installUserscriptMode(page) {
    await page.addInitScript(({ filterText, filterManifest, filterSignature }) => {
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
                if (opts.url.includes('youtube-adblock-filters.manifest.json')) body = filterManifest;
                else if (opts.url.includes('youtube-adblock-filters.txt.sig')) body = filterSignature;
                else if (!opts.url.includes('youtube-adblock-filters.txt')) {
                    status = 404;
                    body = '';
                }
                opts.onload?.({ status, statusText: status === 200 ? 'OK' : 'Not Found', responseText: body, readyState: 4 });
            }, 0);
        };
    }, { filterText, filterManifest, filterSignature });
    await page.addInitScript({ content: userscriptSource });
}

async function installExtensionMode(page) {
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

async function exercisePanel(page, mode) {
    await assert.match(await page.locator('#ytab-dialog-title').textContent(), /YoutubeAdblock/);
    await page.click('#ytab-master-toggle');
    await page.waitForFunction(() => document.body.textContent.includes('Protection Paused'));
    await page.click('#ytab-master-toggle');
    await page.waitForFunction(() => document.body.textContent.includes('Protection On'));
    await page.click('#ytab-quick-refresh');
    await page.waitForFunction(() => document.body.textContent.includes('Rule refresh complete'));
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('ytab:block-channel')));
    const blocked = await page.evaluate((mode) => {
        if (mode === 'userscript') return window.__ytabStore?.ytab_channel_blocklist || '';
        const raw = localStorage.getItem('__ytab_ext_settings__') || '{}';
        return JSON.parse(raw).ytab_channel_blocklist || '';
    }, mode);
    assert.match(blocked, /Smoke Channel|@SmokeChannel/i);
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

    for (const mode of ['userscript', 'extension']) {
        for (const surface of surfaces) {
            await t.test(`${mode} ${surface.name}`, async () => {
                const context = await browser.newContext({
                    viewport: { width: surface.width, height: surface.height },
                    deviceScaleFactor: 1,
                });
                await installRoutes(context);
                const page = await context.newPage();
                const consoleErrors = [];
                page.on('console', msg => {
                    if (msg.type() === 'error') consoleErrors.push(msg.text());
                });
                page.on('pageerror', err => consoleErrors.push(err.message));

                if (mode === 'userscript') await installUserscriptMode(page);
                else await installExtensionMode(page);

                await page.goto(surface.url, { waitUntil: 'domcontentloaded' });
                await openControlCenter(page, mode);
                await assertPanelLayout(page, surface.width, surface.height);
                await exercisePanel(page, mode);
                await page.screenshot({
                    path: path.join(screenshotDir, `${mode}-${surface.name}.png`),
                    fullPage: false,
                });
                assert.deepEqual(consoleErrors, []);
                await context.close();
            });
        }
    }
});
