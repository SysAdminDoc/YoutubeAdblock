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
const workflow = read(path.join('.github', 'workflows', 'build.yml'));
const background = read(path.join('extension', 'background.js'));
const extensionReadme = read(path.join('extension', 'README.md'));

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

test('release workflow can package and upload CRX assets when a signing key secret is configured', () => {
    assert.match(workflow, /CHROMIUM_EXTENSION_KEY_B64/);
    assert.match(workflow, /trap 'rm -f "YoutubeAdblock-extension\.pem"' EXIT/);
    assert.match(workflow, /npx --yes crx3@2\.0\.0/);
    assert.match(workflow, /YoutubeAdblock-extension-v\$\{VERSION\}\.crx/);
});

test('extension README does not over-promise CRX automation without a signing key secret', () => {
    assert.match(extensionReadme, /When `CHROMIUM_EXTENSION_KEY_B64` is configured/i);
});

test('extension settings sync only rebuilds the panel when mirrored settings actually changed', () => {
    assert.match(userscript, /refreshSettingsUI\(settingsChanged\)/);
});
