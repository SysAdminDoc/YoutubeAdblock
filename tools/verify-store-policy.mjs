#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function argValue(name, fallback = null) {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const repoRoot = path.resolve(argValue('--repo-root', process.cwd()));
const errors = [];

function fail(message) {
    errors.push(message);
}

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const manifest = JSON.parse(read(path.join('extension', 'manifest.json')));
const generatedMain = read(path.join('extension', 'main.js'));
const background = read(path.join('extension', 'background.js'));
const bridge = read(path.join('extension', 'bridge.js'));
const expectedIdPath = path.join(repoRoot, 'extension', 'extension-id.txt');

const REMOTE_EXECUTABLE_RE = /(?:new\s+Function|eval\s*\(|document\.write\s*\(|\.innerHTML\s*=\s*(?:fetch|await|response))\s*[^;]*https?:\/\//gi;
const BROAD_HOST_RE = /^(?:\*:\/\/\*\/|<all_urls>|https?:\/\/\*\/)$/;
const EXTENSION_CODE = [
    { name: 'extension/main.js', content: generatedMain },
    { name: 'extension/background.js', content: background },
    { name: 'extension/bridge.js', content: bridge },
];

for (const file of EXTENSION_CODE) {
    const remoteExecMatches = file.content.match(REMOTE_EXECUTABLE_RE);
    if (remoteExecMatches) {
        fail(`${file.name} contains a remote executable URL pattern: ${remoteExecMatches[0].slice(0, 120)}`);
    }
}

for (const url of (manifest.host_permissions || [])) {
    if (BROAD_HOST_RE.test(url)) {
        fail(`manifest.json host_permissions contains a broad pattern: ${url}`);
    }
}
for (const url of (manifest.optional_host_permissions || [])) {
    if (BROAD_HOST_RE.test(url)) {
        fail(`manifest.json optional_host_permissions contains a broad pattern: ${url}`);
    }
}

if (manifest.background) {
    if (manifest.background.service_worker && manifest.background.scripts) {
        const sw = manifest.background.service_worker;
        const scripts = manifest.background.scripts;
        if (!scripts.includes(sw)) {
            fail(`background.scripts does not include service_worker "${sw}" — compat may break.`);
        }
    }
}

if (manifest.manifest_version !== 3) {
    fail(`manifest_version must be 3, got ${manifest.manifest_version}.`);
}

if (!manifest.browser_specific_settings?.gecko?.id) {
    fail('manifest.json missing browser_specific_settings.gecko.id for AMO submission.');
}

if (fs.existsSync(expectedIdPath)) {
    const expectedId = fs.readFileSync(expectedIdPath, 'utf8').trim();
    if (!/^[a-p]{32}$/.test(expectedId)) {
        fail(`extension-id.txt contains an invalid extension ID: ${expectedId}`);
    }
} else {
    fail('extension/extension-id.txt is missing — CRX ID pinning will fail.');
}

const distDir = path.join(repoRoot, 'dist');
if (fs.existsSync(distDir)) {
    const xpiFiles = fs.readdirSync(distDir).filter(name => name.toLowerCase().endsWith('.xpi'));
    for (const name of xpiFiles) {
        if (!name.endsWith('.unsigned.xpi')) {
            fail(`XPI artifact must be explicitly unsigned: dist/${name}`);
        }
    }
}

for (const file of EXTENSION_CODE) {
    if (/\bchrome\.scripting\.executeScript\b/.test(file.content)) {
        fail(`${file.name} uses chrome.scripting.executeScript — remote code execution risk.`);
    }
    if (/\bnew\s+Function\s*\(/g.test(file.content)) {
        fail(`${file.name} uses new Function() — code generation from strings.`);
    }
    if (/\beval\s*\(/g.test(file.content)) {
        fail(`${file.name} uses eval() — code generation from strings.`);
    }
}

if (errors.length) {
    for (const error of errors) {
        console.error(`FAIL: ${error}`);
    }
    process.exit(1);
} else {
    console.log('Store-policy preflight passed.');
}
