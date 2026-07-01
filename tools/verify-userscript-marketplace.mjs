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

const sourcePath = path.join(repoRoot, 'YoutubeAdblock.user.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
const sourceBytes = Buffer.byteLength(source, 'utf8');

const GREASY_FORK_MAX_BYTES = 2 * 1024 * 1024;

if (sourceBytes > GREASY_FORK_MAX_BYTES) {
    fail(`Userscript exceeds Greasy Fork size limit: ${sourceBytes} bytes > ${GREASY_FORK_MAX_BYTES} bytes.`);
}

const headerMatch = source.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
if (!headerMatch) {
    fail('Userscript metadata block is missing or malformed.');
} else {
    const header = headerMatch[0];

    if (!/\/\/ @name\s+\S/.test(header)) fail('Missing @name in metadata block.');
    if (!/\/\/ @namespace\s+\S/.test(header)) fail('Missing @namespace in metadata block.');
    if (!/\/\/ @version\s+\S/.test(header)) fail('Missing @version in metadata block.');
    if (!/\/\/ @description\s+\S/.test(header)) fail('Missing @description in metadata block.');
    if (!/\/\/ @author\s+\S/.test(header)) fail('Missing @author in metadata block.');
    if (!/\/\/ @license\s+\S/.test(header)) fail('Missing @license in metadata block.');

    if (!/\/\/ @downloadURL\s+https:/.test(header)) fail('Missing or non-HTTPS @downloadURL.');
    if (!/\/\/ @updateURL\s+https:/.test(header)) fail('Missing or non-HTTPS @updateURL.');

    const KNOWN_SERVICE_ALIASES = {
        'sponsor.ajay.app': ['sponsorblock'],
        'dearrow-thumb.ajay.app': ['dearrow'],
        'returnyoutubedislikeapi.com': ['return youtube dislike', 'ryd'],
        'cdn.jsdelivr.net': ['jsdelivr', 'cdn mirror', 'filter'],
        'raw.githubusercontent.com': ['github'],
        'github.com': ['github'],
        'githubusercontent.com': ['github'],
    };

    const connectHosts = [...header.matchAll(/\/\/ @connect\s+(\S+)/g)].map(m => m[1]);
    const readmeLower = readme.toLowerCase();
    const disclosedInReadme = connectHosts.filter(host => {
        if (host === '*') return true;
        const h = host.toLowerCase();
        if (readmeLower.includes(h)) return true;
        const aliases = KNOWN_SERVICE_ALIASES[h] || [];
        return aliases.some(alias => readmeLower.includes(alias));
    });
    const undisclosed = connectHosts.filter(host => !disclosedInReadme.includes(host));
    if (undisclosed.length) {
        fail(`@connect hosts not disclosed in README: ${undisclosed.join(', ')}`);
    }
}

const minifiedPattern = /[;{}]\S{200,}[;{}]/;
if (minifiedPattern.test(source)) {
    fail('Userscript appears to be minified or obfuscated (long tokens without whitespace). Greasy Fork requires readable code.');
}

if (errors.length) {
    for (const error of errors) {
        console.error(`FAIL: ${error}`);
    }
    process.exit(1);
} else {
    console.log(`Userscript marketplace preflight passed (${Math.round(sourceBytes / 1024)} KB).`);
}
