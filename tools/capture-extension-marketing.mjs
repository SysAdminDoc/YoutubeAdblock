// Captures the real unpacked MV3 extension in a headless browser profile.
// YouTube and rule downloads are replaced with deterministic local fixtures,
// so no account, active desktop, or external request is needed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const extensionSource = path.join(repoRoot, 'extension');
const outDir = path.join(repoRoot, 'design', 'screenshots');
const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ytab-marketing-output-'));
const stagingDir = path.join(stagingRoot, 'screenshots');
const stagedFiles = new Set();
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const manifest = JSON.parse(read('extension/manifest.json'));
const version = manifest.version;

const fixtures = {
    'youtube-adblock-filters.txt': read('youtube-adblock-filters.txt'),
    'youtube-adblock-filters.manifest.json': read('youtube-adblock-filters.manifest.json'),
    'youtube-adblock-filters.txt.sig': read('youtube-adblock-filters.txt.sig'),
    'youtube-adblock-filters.manifest.json.sig': read('youtube-adblock-filters.manifest.json.sig'),
    'webpack-ad-signatures.json': read('webpack-ad-signatures.json'),
    'webpack-ad-signatures.manifest.json': read('webpack-ad-signatures.manifest.json'),
    'webpack-ad-signatures.json.sig': read('webpack-ad-signatures.json.sig'),
    'webpack-ad-signatures.manifest.json.sig': read('webpack-ad-signatures.manifest.json.sig'),
};

function fixtureHtml(theme) {
    const light = theme === 'light';
    return `<!doctype html><html${light ? '' : ' dark'}><head><meta charset="utf-8"><title>YoutubeAdblock capture</title>
<style>html{color-scheme:${light ? 'light' : 'dark'}}body{margin:0;min-height:120vh;background:${light ? '#f4f6f8' : '#0f0f0f'};color:${light ? '#17212b' : '#fff'};font-family:Arial,sans-serif}#page{padding:24px}</style>
</head><body><main id="page"><div id="owner"><div id="channel-name"><a href="/@StudioSignal">Studio Signal</a></div></div><div id="movie_player" class="html5-video-player"><video class="html5-main-video"></video></div></main></body></html>`;
}

function fixtureForRequest(requestUrl) {
    let pathname = '';
    try { pathname = new URL(requestUrl).pathname; } catch { return null; }
    const name = Object.keys(fixtures)
        .sort((a, b) => b.length - a.length)
        .find(candidate => pathname.endsWith(`/${candidate}`));
    if (!name) return null;
    const contentType = name.endsWith('.json') ? 'application/json' : 'text/plain';
    return { body: fixtures[name], contentType };
}

function removeCheckedTempTree(tempRoot) {
    const resolved = path.resolve(tempRoot);
    const expectedParent = path.resolve(os.tmpdir());
    if (path.dirname(resolved).toLowerCase() !== expectedParent.toLowerCase()) {
        throw new Error(`temporary capture path escaped the OS temp directory: ${resolved}`);
    }
    if (!/^ytab-marketing-/.test(path.basename(resolved))) {
        throw new Error(`refusing to remove unexpected temporary capture path: ${resolved}`);
    }
    fs.rmSync(resolved, { recursive: true, force: true });
}

async function openInstalledExtension({ theme = 'dark', development = false }) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ytab-marketing-'));
    const loadedExtensionPath = path.join(tempRoot, 'extension');
    const profileDir = path.join(tempRoot, 'profile');
    fs.cpSync(extensionSource, loadedExtensionPath, { recursive: true });
    fs.mkdirSync(profileDir);
    if (development) {
        fs.copyFileSync(
            path.join(loadedExtensionPath, 'manifest.dev.json'),
            path.join(loadedExtensionPath, 'manifest.json')
        );
    }

    const context = await chromium.launchPersistentContext(profileDir, {
        executablePath: chromium.executablePath(),
        headless: true,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        args: [
            `--disable-extensions-except=${loadedExtensionPath}`,
            `--load-extension=${loadedExtensionPath}`,
            '--no-first-run',
            '--disable-sync',
            '--disable-component-update',
            '--disable-background-networking',
        ],
    });

    await context.route('**/*', async route => {
        const requestUrl = route.request().url();
        let parsed;
        try { parsed = new URL(requestUrl); } catch {
            await route.abort();
            return;
        }
        if (/(^|\.)youtube\.com$|(^|\.)youtube-nocookie\.com$|(^|\.)youtubekids\.com$/i.test(parsed.hostname) &&
            route.request().resourceType() === 'document') {
            await route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml(theme) });
            return;
        }
        const fixture = fixtureForRequest(requestUrl);
        if (fixture) {
            await route.fulfill({ status: 200, ...fixture });
            return;
        }
        // Let the packaged DNR rules handle this development-profile probe.
        if (/^https:\/\/www\.google\.com\/pagead\/lvz/i.test(requestUrl)) {
            await route.continue();
            return;
        }
        await route.fulfill({ status: 204, body: '' });
    });

    const worker = context.serviceWorkers()[0] ||
        await context.waitForEvent('serviceworker', { timeout: 15_000 });
    const extensionId = new URL(worker.url()).hostname;
    if (!/^[a-p]{32}$/.test(extensionId)) throw new Error('unpacked extension did not receive a valid ID');

    const page = context.pages()[0] || await context.newPage();
    await page.goto(`https://www.youtube.com/watch?v=product-capture&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(() => document.body?.classList.contains('ytab-ready'), null, {
        timeout: 20_000,
    });

    return { context, worker, page, tempRoot, extensionId };
}

async function openControlCenter(worker, page) {
    const tabId = await worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        return tabs.find(tab => /^https:\/\/(?:[^/]+\.)?youtube\.com\//i.test(tab.url || ''))?.id;
    });
    if (!Number.isInteger(tabId)) throw new Error('could not resolve the capture tab');
    await worker.evaluate(async ({ id }) => chrome.tabs.sendMessage(id, { type: 'ytab:open-panel' }), { id: tabId });
    await page.waitForSelector('.ytab-overlay.ytab-active .ytab-panel', { timeout: 10_000 });
    await page.waitForFunction(() => {
        const overlay = document.querySelector('.ytab-overlay.ytab-active');
        return overlay && Number(getComputedStyle(overlay).opacity) >= 0.99;
    });
    await page.addStyleTag({ content: '.ytab-panel,.ytab-panel *{animation:none!important;transition:none!important}' });
}

async function waitForRules(page) {
    await page.waitForFunction(() => {
        const button = document.querySelector('#ytab-quick-refresh');
        const content = document.querySelector('#ytab-content')?.textContent || '';
        return button && !button.disabled && /Signature verified|Recommended source active/i.test(content);
    }, null, { timeout: 20_000 });
}

async function capturePanel(page, filename) {
    const target = path.join(stagingDir, filename);
    fs.mkdirSync(stagingDir, { recursive: true });
    await page.locator('.ytab-panel').screenshot({ path: target });
    stagedFiles.add(filename);
    console.log(`Captured ${filename}`);
}

async function exerciseBlocking(page) {
    const result = await page.evaluate(async () => {
        const sample = JSON.stringify({
            videoDetails: { videoId: 'capture' },
            adPlacements: [{ adPlacementRenderer: {} }],
            playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
        });
        for (let i = 0; i < 18; i += 1) JSON.parse(sample);
        for (let i = 0; i < 7; i += 1) {
            const response = await fetch(`/pagead/capture-${i}`);
            if (!response.ok) throw new Error('local ad guard did not return a successful empty response');
        }
        return {
            adPlacementsRemoved: !('adPlacements' in JSON.parse(sample)),
            pageReady: document.body.classList.contains('ytab-ready'),
        };
    });
    if (!result.adPlacementsRemoved || !result.pageReady) {
        throw new Error('the installed extension did not exercise its page-world blocking engine');
    }
}

async function captureProduction(theme, extraSection = false) {
    const run = await openInstalledExtension({ theme });
    try {
        await openControlCenter(run.worker, run.page);
        await waitForRules(run.page);
        await run.page.waitForTimeout(750);
        // Hydration and the signed-rule refresh are settled before generating
        // activity, so the counters shown here come from this exact run.
        await exerciseBlocking(run.page);
        // Reopening rebuilds the overview immediately from the live state. It
        // avoids waiting for the five-second passive repaint interval.
        await run.page.locator('#ytab-close-btn').click();
        await run.page.waitForSelector('.ytab-overlay:not(.ytab-active)', { timeout: 10_000 });
        await openControlCenter(run.worker, run.page);
        await run.page.waitForFunction(() =>
            Number(document.querySelector('#ytab-metric-blocked')?.textContent || 0) === 26 &&
            Number(document.querySelector('#ytab-metric-pruned')?.textContent || 0) === 19
        );
        await run.page.waitForTimeout(150);
        await capturePanel(run.page, `control-center-overview-${theme}-v${version}.png`);
        if (extraSection) {
            await run.page.locator('.ytab-nav-button[data-section-id="ytab-section-blocklist"]').click();
            await run.page.waitForFunction(() =>
                document.querySelector('#ytab-section-blocklist')?.getBoundingClientRect().top < 280
            );
            await capturePanel(run.page, `control-center-focus-filters-${theme}-v${version}.png`);
        }
    } finally {
        await run.context.close();
        removeCheckedTempTree(run.tempRoot);
    }
}

async function captureNetworkEvidence() {
    const run = await openInstalledExtension({ theme: 'dark', development: true });
    try {
        const probe = await run.page.evaluate(probeUrl => new Promise(resolve => {
            const image = new Image();
            const done = outcome => { image.remove(); resolve(outcome); };
            image.addEventListener('load', () => done('load'), { once: true });
            image.addEventListener('error', () => done('error'), { once: true });
            setTimeout(() => done('timeout'), 10_000);
            image.src = probeUrl;
            document.body.appendChild(image);
        }), `https://www.google.com/pagead/lvz?capture=${Date.now()}`);
        if (probe !== 'error') throw new Error(`packaged DNR probe returned ${probe}`);

        await openControlCenter(run.worker, run.page);
        await waitForRules(run.page);
        await run.page.locator('.ytab-nav-button[data-section-id="ytab-section-diagnostics"]').click();
        await run.page.locator('#ytab-section-diagnostics').evaluate(section =>
            section.scrollIntoView({ behavior: 'auto', block: 'start' })
        );
        await run.page.waitForFunction(() => {
            const title = document.querySelector('#ytab-dnr-diagnostics .ytab-note-title')?.textContent || '';
            return /^1 recent network match$/i.test(title.trim());
        }, null, { timeout: 15_000 });
        await run.page.waitForTimeout(150);
        await capturePanel(run.page, `control-center-network-evidence-dark-v${version}.png`);
    } finally {
        await run.context.close();
        removeCheckedTempTree(run.tempRoot);
    }
}

try {
    await captureProduction('dark', true);
    await captureProduction('light');
    await captureNetworkEvidence();
    fs.mkdirSync(outDir, { recursive: true });
    for (const filename of stagedFiles) {
        const target = path.join(outDir, filename);
        fs.copyFileSync(path.join(stagingDir, filename), target);
        console.log(`Wrote ${path.relative(repoRoot, target)}`);
    }
} finally {
    removeCheckedTempTree(stagingRoot);
}
