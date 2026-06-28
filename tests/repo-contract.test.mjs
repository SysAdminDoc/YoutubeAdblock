import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const userscript = read('YoutubeAdblock.user.js');
const manifest = JSON.parse(read(path.join('extension', 'manifest.json')));
const rules = JSON.parse(read(path.join('extension', 'rules', 'network-blocks.json')));
const buildExtension = read('Build-Extension.ps1');
const buildCrx = read('Build-CRX.ps1');
const background = read(path.join('extension', 'background.js'));
const extensionReadme = read(path.join('extension', 'README.md'));
const generatedMain = read(path.join('extension', 'main.js'));
const readme = read('README.md');

test('www.youtubekids.com is covered across userscript and extension surfaces', () => {
    assert.match(userscript, /\/\/ @match\s+https:\/\/www\.youtubekids\.com\/\*/);

    assert(manifest.host_permissions.includes('*://www.youtubekids.com/*'));
    for (const script of manifest.content_scripts) {
        assert(script.matches.includes('*://www.youtubekids.com/*'));
    }

    assert.match(background, /\*:\/\/www\.youtubekids\.com\/\*/);
});

test('network rules scope external ad domains to all supported YouTube initiators', () => {
    const ruleById = new Map(rules.map(rule => [rule.id, rule]));
    for (const id of [4, 5, 6]) {
        const initiators = ruleById.get(id)?.condition?.initiatorDomains || [];
        assert(initiators.includes('youtubekids.com'));
        assert(initiators.includes('www.youtubekids.com'));
    }
});

test('fetch and XHR fast-reject checks keep URL context for Shorts-specific pruning', () => {
    assert.match(userscript, /responseTextMightContainAds\(text,\s*url\)/);
    assert.match(userscript, /responseTextMightContainAds\(sourceText,\s*xhr\._ytab_url\)/);
});

test('local release contract uses repo scripts instead of deleted GitHub workflows', () => {
    assert.equal(fs.existsSync(path.join(repoRoot, '.github', 'workflows', 'build.yml')), false,
        'deleted GitHub Actions workflow must not be part of the release contract');
    assert.match(buildExtension, /Build-Extension\.ps1/);
    assert.match(buildCrx, /Build-Extension\.ps1/);
    assert.match(buildCrx, /YoutubeAdblock-extension-v\$version\.crx/);
    assert.match(extensionReadme, /Build-Extension\.ps1/);
    assert.match(extensionReadme, /Build-CRX\.ps1/);
    assert.doesNotMatch(extensionReadme, /\.github\/workflows|GitHub Actions|CHROMIUM_EXTENSION_KEY_B64|Actions tab/);
});

test('extension README reflects the current iconless manifest', () => {
    assert.equal('icons' in manifest, false, 'manifest should stay iconless until replacement branding ships');
    assert.equal('default_icon' in manifest.action, false,
        'browser action should stay iconless until replacement branding ships');
    assert.doesNotMatch(extensionReadme, /\|\s*`icons\/`\s*\|/);
    assert.match(extensionReadme, /default toolbar icon/i);
});

test('extension settings sync only rebuilds the panel when mirrored settings actually changed', () => {
    assert.match(userscript, /refreshSettingsUI\(settingsChanged\)/);
});

test('version strings stay in lockstep across userscript, manifest, generated build, and docs', () => {
    // Parse the canonical userscript version from the @version header.
    const versionMatch = userscript.match(/^\/\/\s*@version\s+(\S+)/m);
    assert(versionMatch, 'userscript @version header missing');
    const version = versionMatch[1];

    // Runtime constant inside the userscript IIFE must match the header so
    // Control Center, toasts, and diagnostics reflect the shipped version.
    const runtimeMatch = userscript.match(/const SCRIPT_VERSION = '([^']+)'/);
    assert(runtimeMatch, 'userscript SCRIPT_VERSION constant missing');
    assert.equal(runtimeMatch[1], version,
        `userscript @version (${version}) and SCRIPT_VERSION (${runtimeMatch[1]}) disagree`);

    // Manifest version must match so CI's tag-vs-manifest check passes and
    // so Chromium + Firefox install the same build as the userscript source.
    assert.equal(manifest.version, version,
        `extension/manifest.json version (${manifest.version}) differs from userscript (${version})`);

    // Generated extension/main.js is a copy of the userscript, so its
    // SCRIPT_VERSION must also match. If this fails, re-run Build-Extension.ps1.
    const generatedMatch = generatedMain.match(/const SCRIPT_VERSION = '([^']+)'/);
    assert(generatedMatch, 'generated extension/main.js SCRIPT_VERSION constant missing');
    assert.equal(generatedMatch[1], version,
        `extension/main.js is stale (${generatedMatch[1]} vs ${version}); re-run Build-Extension.ps1`);

    // README badge is user-facing and easy to forget on version bumps.
    const readmeBadge = readme.match(/version-([0-9][0-9A-Za-z.+-]*)-58A6FF/);
    assert(readmeBadge, 'README version badge missing');
    assert.equal(readmeBadge[1], version,
        `README version badge (${readmeBadge[1]}) differs from userscript (${version})`);
});

test('generated extension/main.js carries the required shim + command-bridge markers', () => {
    // Build-Extension.ps1 asserts these markers itself, but a test keeps the
    // contract visible in the repo and catches a regression where someone
    // checks in a hand-edited main.js that silently drops a marker.
    const requiredMarkers = [
        '__YTAB_STORAGE_KEY',
        'function GM_getValue',
        'function GM_xmlhttpRequest',
        "addEventListener('ytab:open-panel'",
        "addEventListener('ytab:toggle-protection'",
        "addEventListener('ytab:refresh-rules'"
    ];
    for (const marker of requiredMarkers) {
        assert(generatedMain.includes(marker),
            `generated extension/main.js missing required marker: ${marker}`);
    }
    // The header is the Build-Extension.ps1 provenance comment; it should be
    // the first non-blank content so it's immediately obvious the file is
    // derived, not authored.
    assert(/^\/\*!\s*\n\s*\*\s*YoutubeAdblock\s*-\s*extension build/.test(generatedMain),
        'generated extension/main.js missing provenance header');
});

test('@inject-into directive pins the userscript to the sandbox so GM_* stays available', () => {
    // Tampermonkey MV3 otherwise occasionally skipped injection when the
    // context was ambiguous, causing the script to appear absent even though
    // the match pattern was correct (see CHANGELOG 0.3.2). Keeping this
    // explicit guards against the header silently regressing.
    assert.match(userscript, /^\/\/\s*@inject-into\s+content\s*$/m);
});
