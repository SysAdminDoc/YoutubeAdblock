// Captures the current desktop Control Center in dark and light themes so
// README screenshots can be regenerated deterministically on every UI
// change. Runs headless against the same offline fixtures the browser
// smoke suite uses — no network, no signed-in session, no visible window.
//
// Usage: node tools/capture-control-center.mjs [--version 0.6.0]
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(repoRoot, f), 'utf8');

const userscriptSource = read('YoutubeAdblock.user.js');
const version = (process.argv.includes('--version')
    ? process.argv[process.argv.indexOf('--version') + 1]
    : (userscriptSource.match(/const SCRIPT_VERSION = '([^']+)'/) || [])[1]);
if (!version) throw new Error('could not resolve the script version');

const fixtures = {
    filterText: read('youtube-adblock-filters.txt').replace(/\r\n?/g, '\n'),
    filterManifest: read('youtube-adblock-filters.manifest.json'),
    filterSignature: read('youtube-adblock-filters.txt.sig'),
    filterManifestSignature: read('youtube-adblock-filters.manifest.json.sig'),
    webpackSignatureJson: read('webpack-ad-signatures.json'),
    webpackSigManifest: read('webpack-ad-signatures.manifest.json'),
    webpackSigManifestSignature: read('webpack-ad-signatures.manifest.json.sig'),
    webpackSignatureSig: read('webpack-ad-signatures.json.sig'),
};

function fixtureHtml(light) {
    return `<!doctype html><html${light ? '' : ' dark'}><head><meta charset="utf-8"><title>fixture</title>
<style>body{margin:0;min-height:120vh;background:${light ? '#f4f6f8' : '#0f0f0f'};color:${light ? '#17212b' : '#fff'};font-family:Arial,sans-serif}#page{padding:24px}</style>
</head><body><div id="page">
<div id="owner"><div id="channel-name"><a href="/@SmokeChannel">Smoke Channel</a></div></div>
<div id="movie_player"><video class="html5-main-video"></video></div>
</div></body></html>`;
}

const outDir = path.join(repoRoot, 'design', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--no-first-run'] });

for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await context.route('**/*', async route => {
        const requestUrl = route.request().url();
        if (/youtube\.com|youtubekids\.com/i.test(requestUrl)) {
            await route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml(theme === 'light') });
            return;
        }
        await route.fulfill({ status: 204, body: '' });
    });

    const page = await context.newPage();
    await page.addInitScript(d => {
        window.__ytabStore = {};
        window.GM_getValue = (key, def) => (Object.prototype.hasOwnProperty.call(window.__ytabStore, key) ? window.__ytabStore[key] : def);
        window.GM_setValue = (key, value) => { window.__ytabStore[key] = value; };
        window.__ytabMenus = [];
        window.GM_registerMenuCommand = (label, fn) => { window.__ytabMenus.push({ label, fn }); return label; };
        window.GM_unregisterMenuCommand = () => {};
        window.GM_xmlhttpRequest = (opts) => {
            setTimeout(() => {
                let body = d.filterText;
                let status = 200;
                const u = opts.url;
                if (u.includes('youtube-adblock-filters.manifest.json.sig')) body = d.filterManifestSignature;
                else if (u.includes('youtube-adblock-filters.manifest.json')) body = d.filterManifest;
                else if (u.includes('youtube-adblock-filters.txt.sig')) body = d.filterSignature;
                else if (u.includes('webpack-ad-signatures.manifest.json.sig')) body = d.webpackSigManifestSignature;
                else if (u.includes('webpack-ad-signatures.manifest.json')) body = d.webpackSigManifest;
                else if (u.includes('webpack-ad-signatures.json.sig')) body = d.webpackSignatureSig;
                else if (u.includes('webpack-ad-signatures.json')) body = d.webpackSignatureJson;
                else if (!u.includes('youtube-adblock-filters.txt')) { status = 404; body = ''; }
                opts.onload?.({ status, statusText: status === 200 ? 'OK' : 'Not Found', responseText: body, readyState: 4 });
            }, 0);
        };
    }, fixtures);
    await page.addInitScript({ content: userscriptSource });

    const target = theme === 'light'
        ? 'https://www.youtube.com/watch?v=capture&theme=light'
        : 'https://www.youtube.com/watch?v=capture';
    await page.goto(target);
    // Open the Control Center through the userscript menu command, the same
    // entry point a real Tampermonkey/Violentmonkey user uses.
    await page.waitForFunction(() =>
        Array.isArray(window.__ytabMenus) && window.__ytabMenus.some(item => /Open Control Center/.test(item.label)));
    await page.evaluate(() => {
        window.__ytabMenus.find(entry => /Open Control Center/.test(entry.label)).fn();
    });
    await page.waitForSelector('.ytab-overlay.ytab-active .ytab-panel', { timeout: 10000 });
    // Let the rule refresh settle so the footer shows a stable state.
    await page.waitForFunction(() => {
        const button = document.querySelector('#ytab-quick-refresh');
        return button && !button.disabled;
    }, { timeout: 15000 }).catch(() => {});
    await page.locator('.ytab-panel').evaluate(async panel => {
        const animations = panel.getAnimations({ subtree: true }).filter(a => {
            const iterations = a.effect?.getTiming?.().iterations;
            return Number.isFinite(iterations ?? 1);
        });
        await Promise.all(animations.map(a => a.finished.catch(() => {})));
    });

    const file = path.join(outDir, `control-center-desktop-${theme}-v${version}.png`);
    await page.locator('.ytab-panel').screenshot({ path: file });
    console.log(`Wrote ${path.relative(repoRoot, file)}`);
    await context.close();
}

await browser.close();
