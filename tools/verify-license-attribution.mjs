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

const filterText = fs.readFileSync(path.join(repoRoot, 'youtube-adblock-filters.txt'), 'utf8');
const userscript = fs.readFileSync(path.join(repoRoot, 'YoutubeAdblock.user.js'), 'utf8');
const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
const readmeLower = readme.toLowerCase();

const REQUIRED_FILTER_ATTRIBUTIONS = [
    { name: 'uBlock filters source', pattern: /uBO|uBlock/i },
    { name: 'EasyList source', pattern: /EasyList/i },
];

for (const req of REQUIRED_FILTER_ATTRIBUTIONS) {
    if (!req.pattern.test(filterText)) {
        fail(`Filter list missing attribution for: ${req.name}`);
    }
}

const REQUIRED_README_TERMS = [
    { name: 'Project license (MIT)', check: () => readmeLower.includes('mit') },
    { name: 'SponsorBlock API', check: () => readmeLower.includes('sponsorblock') },
    { name: 'DeArrow API', check: () => readmeLower.includes('dearrow') },
    { name: 'Return YouTube Dislike', check: () => readmeLower.includes('return youtube dislike') || readmeLower.includes('ryd') },
];

for (const req of REQUIRED_README_TERMS) {
    if (!req.check()) {
        fail(`README missing required term: ${req.name}`);
    }
}

const REQUIRED_UI_ATTRIBUTIONS = [
    { name: 'SponsorBlock CC BY-NC-SA attribution', pattern: /SponsorBlock.*CC BY-NC-SA|CC BY-NC-SA.*SponsorBlock/i },
    { name: 'DeArrow attribution', pattern: /DeArrow.*CC BY-NC-SA|dearrow/i },
    { name: 'Return YouTube Dislike attribution', pattern: /Return YouTube Dislike|returnyoutubedislike/i },
];

for (const req of REQUIRED_UI_ATTRIBUTIONS) {
    if (!req.pattern.test(userscript)) {
        fail(`Userscript missing UI attribution: ${req.name}`);
    }
}

if (!fs.existsSync(path.join(repoRoot, 'LICENSE'))) {
    fail('LICENSE file is missing from repository root.');
}

if (errors.length) {
    for (const error of errors) {
        console.error(`FAIL: ${error}`);
    }
    process.exit(1);
} else {
    console.log('License and attribution preflight passed.');
}
