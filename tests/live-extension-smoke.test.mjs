import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const extensionPath = path.join(repoRoot, 'extension');
const liveEnabled = process.env.YTAB_LIVE_EXTENSION === '1';
const chromiumPath = chromium.executablePath();
const canLaunch = fs.existsSync(chromiumPath);

function redactEvidenceUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        const pathname = parsed.pathname
            .replace(/\/(shorts|embed|live)\/[^/]+/i, '/$1/[video-id]')
            .replace(/(\/pagead\/1p-user-list\/)[^/]+/i, '$1[redacted]');
        return `${parsed.origin}${pathname}`;
    } catch {
        return String(rawUrl).split(/[?#]/, 1)[0];
    }
}

const AD_SELECTOR = [
    'ytd-ad-slot-renderer',
    'ytd-display-ad-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-player-legacy-desktop-watch-ads-renderer',
    '.video-ads',
    '.ytp-ad-module',
    'ytu-ads-title-tray',
].join(',');

test('live evidence URLs remove query strings and media identifiers', () => {
    assert.equal(
        redactEvidenceUrl('https://www.youtube.com/watch?v=private-video&list=private-list'),
        'https://www.youtube.com/watch'
    );
    assert.equal(
        redactEvidenceUrl('https://www.youtube.com/shorts/private-video?feature=share'),
        'https://www.youtube.com/shorts/[video-id]'
    );
    assert.equal(
        redactEvidenceUrl('https://www.google.com/pagead/lvz?event=private-token'),
        'https://www.google.com/pagead/lvz'
    );
    assert.equal(
        redactEvidenceUrl('https://www.google.com/pagead/1p-user-list/123456/?data=private-token'),
        'https://www.google.com/pagead/1p-user-list/[redacted]/'
    );
});

test('live unpacked extension blocks an ad-only image request on desktop YouTube', {
    skip: !liveEnabled
        ? 'Set YTAB_LIVE_EXTENSION=1 to run the isolated live-network smoke.'
        : (!canLaunch ? `Playwright Chromium not found at ${chromiumPath}` : false),
    timeout: 120_000,
}, async (t) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ytab-live-extension-'));
    const profileDir = path.join(tempRoot, 'profile');
    const loadedExtensionPath = path.join(tempRoot, 'extension');
    fs.mkdirSync(profileDir);
    fs.cpSync(extensionPath, loadedExtensionPath, { recursive: true });
    let context;
    t.after(async () => {
        await context?.close();
        const expectedParent = path.resolve(os.tmpdir()).toLowerCase();
        const actualParent = path.resolve(path.dirname(tempRoot)).toLowerCase();
        assert.equal(actualParent, expectedParent, 'temporary profile escaped the OS temp directory');
        assert.match(path.basename(tempRoot), /^ytab-live-extension-/);
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    context = await chromium.launchPersistentContext(profileDir, {
        executablePath: chromiumPath,
        headless: true,
        viewport: { width: 1440, height: 900 },
        args: [
            `--disable-extensions-except=${loadedExtensionPath}`,
            `--load-extension=${loadedExtensionPath}`,
            '--no-first-run',
            '--disable-sync',
            '--disable-component-update',
        ],
    });

    const serviceWorker = context.serviceWorkers()[0] ||
        await context.waitForEvent('serviceworker', { timeout: 15_000 });
    const extensionId = new URL(serviceWorker.url()).hostname;
    assert.match(extensionId, /^[a-p]{32}$/);
    const enabledRulesets = await serviceWorker.evaluate(() =>
        chrome.declarativeNetRequest.getEnabledRulesets()
    );
    assert.ok(enabledRulesets.includes('ytab-network-blocks'));

    const page = context.pages()[0] || await context.newPage();
    const failedRequests = [];
    const adRequests = [];
    page.on('request', request => {
        if (/(?:doubleclick\.net|google\.com\/pagead\/|youtube\.com\/pagead\/)/i.test(request.url())) {
            adRequests.push(request.url());
        }
    });
    page.on('requestfailed', request => {
        failedRequests.push({
            url: request.url(),
            errorText: request.failure()?.errorText || '',
        });
    });

    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ&hl=en', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
    });
    await page.waitForFunction(() => document.body?.classList.contains('ytab-ready'), null, {
        timeout: 20_000,
    });
    await page.waitForSelector('ytd-app, #movie_player', { timeout: 20_000 });
    await page.waitForTimeout(1_500);

    const pageadProbeUrl = `https://www.google.com/pagead/lvz?ytab-live=${Date.now()}`;
    const pageadProbe = await page.evaluate(probeUrl => new Promise(resolve => {
        const image = new Image();
        const finish = outcome => {
            image.remove();
            resolve(outcome);
        };
        image.addEventListener('load', () => finish('load'), { once: true });
        image.addEventListener('error', () => finish('error'), { once: true });
        setTimeout(() => finish('timeout'), 10_000);
        image.src = probeUrl;
        document.body.appendChild(image);
    }), pageadProbeUrl);
    assert.equal(pageadProbe, 'error');
    await page.waitForTimeout(500);
    const probeFailure = failedRequests.find(entry => entry.url === pageadProbeUrl);
    assert.ok(probeFailure, 'the pagead probe should be rejected before loading');
    assert.match(probeFailure.errorText, /ERR_BLOCKED_BY_CLIENT/);

    await page.evaluate(() => document.dispatchEvent(new CustomEvent('ytab:open-panel')));
    await page.waitForSelector('.ytab-overlay.ytab-active .ytab-panel', { timeout: 10_000 });
    await page.waitForFunction(() => {
        const overlay = document.querySelector('.ytab-overlay.ytab-active');
        return overlay && Number(getComputedStyle(overlay).opacity) >= 0.99;
    });
    assert.match(await page.locator('#ytab-dialog-title').textContent(), /YoutubeAdblock/);

    await page.click('.ytab-nav-button[data-section-id="ytab-section-diagnostics"]');
    await page.waitForFunction(() => {
        const title = document.querySelector('#ytab-dnr-diagnostics .ytab-note-title')?.textContent || '';
        return title && title !== 'Checking packaged rules';
    }, null, { timeout: 10_000 });
    const dnrDiagnostics = await page.locator('#ytab-dnr-diagnostics').evaluate(note => ({
        title: note.querySelector('.ytab-note-title')?.textContent || '',
        body: note.querySelector('.ytab-note-text')?.textContent || '',
        tone: note.dataset.tone || ''
    }));
    assert.match(dnrDiagnostics.title, /[1-9][0-9]* recent network match/);
    assert.match(dnrDiagnostics.body, /packaged rules? matched in the last 5 minutes/);
    assert.equal(dnrDiagnostics.tone, 'success');

    const visibleAdSelectors = await page.locator(AD_SELECTOR).evaluateAll(elements =>
        elements.filter(element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
                style.visibility !== 'hidden' && Number(style.opacity) > 0;
        }).map(element => element.localName + (element.id ? `#${element.id}` : ''))
    );
    assert.deepEqual(visibleAdSelectors, []);
    const audibleAd = await page.evaluate(() => {
        const player = document.querySelector('.ad-showing, .ytp-ad-player-overlay');
        const video = document.querySelector('video');
        return !!(player && video && !video.paused && !video.muted && video.volume > 0);
    });
    assert.equal(audibleAd, false);

    const outputDir = path.join(repoRoot, 'dist');
    fs.mkdirSync(outputDir, { recursive: true });
    assert.equal(await page.locator('.ytab-overlay.ytab-active .ytab-panel').count(), 1,
        'Control Center should survive live YouTube hydration');
    await page.locator('#ytab-section-diagnostics').evaluate(section => {
        section.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
    await page.waitForTimeout(100);
    await page.screenshot({
        path: path.join(outputDir, 'live-extension-smoke.png'),
        fullPage: false,
    });
    const report = {
        timestamp: new Date().toISOString(),
        browserVersion: await context.browser()?.version(),
        extensionId,
        enabledRulesets,
        pageUrl: redactEvidenceUrl(page.url()),
        pageadProbe: {
            url: redactEvidenceUrl(pageadProbeUrl),
            outcome: pageadProbe,
            failure: probeFailure.errorText,
        },
        visibleAdSelectors,
        audibleAd,
        dnrDiagnostics,
        observedAdRequestCount: adRequests.length,
        failedAdRequests: failedRequests
            .filter(entry =>
                /(?:doubleclick\.net|google\.com\/pagead\/|youtube\.com\/pagead\/)/i.test(entry.url)
            )
            .map(entry => ({ ...entry, url: redactEvidenceUrl(entry.url) })),
    };
    fs.writeFileSync(
        path.join(outputDir, 'live-extension-smoke.json'),
        `${JSON.stringify(report, null, 2)}\n`,
        'utf8'
    );
});
