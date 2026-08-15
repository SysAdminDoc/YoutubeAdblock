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
const devManifest = JSON.parse(read(path.join('extension', 'manifest.dev.json')));
const generatedRulesText = read(path.join('extension', 'rules', 'network-blocks.json'));
const rules = JSON.parse(generatedRulesText);
const networkRuleSource = JSON.parse(read(path.join('extension', 'rules', 'network-rules-source.json')));
const webpackSignatures = JSON.parse(read('webpack-ad-signatures.json'));
const webpackSigManifest = JSON.parse(read('webpack-ad-signatures.manifest.json'));
const webpackSigSignature = read('webpack-ad-signatures.json.sig').trim();
const filterManifest = JSON.parse(read('youtube-adblock-filters.manifest.json'));
const filterSignature = read('youtube-adblock-filters.txt.sig').trim();
const gitignore = read('.gitignore');
const packageJson = JSON.parse(read('package.json'));
const buildExtension = read('Build-Extension.ps1');
const buildRelease = read('Build-Release.ps1');
const buildCrx = read('Build-CRX.ps1');
const signFilterManifest = read(path.join('tools', 'sign-filter-manifest.mjs'));
const verifyReleaseArtifacts = read(path.join('tools', 'verify-release-artifacts.mjs'));
const expectedExtensionId = read(path.join('extension', 'extension-id.txt')).trim();
const background = read(path.join('extension', 'background.js'));
const bridge = read(path.join('extension', 'bridge.js'));
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
    for (const id of [4, 5, 6, 19]) {
        const initiators = ruleById.get(id)?.condition?.initiatorDomains || [];
        assert(initiators.includes('youtubekids.com'));
        assert(initiators.includes('www.youtubekids.com'));
    }
    assert.equal(ruleById.get(19)?.condition?.urlFilter, '||google.com/pagead/');
});

test('network rule source drives DNR output and userscript intercept patterns', () => {
    assert.deepEqual(rules, networkRuleSource.dnrRules);
    assert.equal(generatedRulesText.trim(), JSON.stringify(networkRuleSource.dnrRules),
        'generated DNR rules must be byte-stable across PowerShell editions');
    assert.match(buildExtension, /ConvertTo-Json -Depth 30 -Compress/);
    assert.match(buildExtension, /network-rules-source\.json/);
    for (const pattern of networkRuleSource.interceptPatterns) {
        assert(userscript.includes(`'${pattern}'`), `userscript interceptPatterns missing ${pattern}`);
    }
    assert(networkRuleSource.interceptPatterns.includes('/youtubei/v1/tenx_player'));
    assert.match(userscript, /PLAYER_ENDPOINT_RE[^\n]+tenx_player/);
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
    assert.match(buildCrx, /Refusing to generate a new extension identity/);
    assert.match(buildCrx, /--crx-path/);
    assert.match(extensionReadme, /Build-Extension\.ps1/);
    assert.match(extensionReadme, /Build-CRX\.ps1/);
    assert.doesNotMatch(extensionReadme, /\.github\/workflows|GitHub Actions|CHROMIUM_EXTENSION_KEY_B64|Actions tab/);
});

test('one-command release gate runs local checks and packages fresh artifacts', () => {
    assert.match(buildRelease, /Build-Extension\.ps1/);
    assert.match(buildRelease, /node --check/);
    assert.match(buildRelease, /node --test/);
    assert.match(buildRelease, /node_modules\\playwright-core/);
    assert.match(buildRelease, /network-blocks\.json/);
    assert.match(buildRelease, /sign-filter-manifest\.mjs/);
    assert.match(buildRelease, /YoutubeAdblock-v\$version\.user\.js/);
    assert.match(buildRelease, /YoutubeAdblock-extension-v\$version\.zip/);
    assert.match(buildRelease, /YoutubeAdblock-extension-v\$version\.unsigned\.xpi/);
    assert.match(buildRelease, /Build-CRX\.ps1/);
    assert.match(buildRelease, /Artifacts = @\('Userscript', 'Zip'\)/);
    assert.match(buildRelease, /CrxKeyPath/);
    assert.match(buildRelease, /--artifacts/);
    assert.match(readme, /Build-Release\.ps1/);
    assert.match(extensionReadme, /Build-Release\.ps1/);
});

test('Firefox XPI docs do not claim unsigned local artifacts are signed releases', () => {
    assert.match(buildRelease, /unsigned development XPI/);
    assert.match(readme, /does not publish a signed XPI yet/);
    assert.match(readme, /requires AMO or `web-ext sign` signing/);
    assert.doesNotMatch(readme, /Download the latest `\.xpi` from \[Releases\]/);
    assert.match(extensionReadme, /unsigned development XPI/);
    assert.match(extensionReadme, /do not publish that file as\s+a signed install asset/);
});

test('extension build does not request inactive DeArrow thumbnail host access', () => {
    assert.equal(manifest.host_permissions.includes('https://dearrow-thumb.ajay.app/*'), false);
    assert.match(userscript, /^\/\/\s*@connect\s+dearrow-thumb\.ajay\.app\s*$/m,
        'userscript DeArrow thumbnail access should remain available');
    assert.match(extensionReadme, /does not request DeArrow thumbnail host access/);
});

test('community API hosts use optional runtime permissions instead of install-time grants', () => {
    assert.equal(manifest.host_permissions.includes('https://sponsor.ajay.app/*'), false,
        'SponsorBlock host must not be in install-time host_permissions');
    assert.equal(manifest.host_permissions.includes('https://returnyoutubedislikeapi.com/*'), false,
        'RYD host must not be in install-time host_permissions');
    assert.ok(manifest.optional_host_permissions.includes('https://sponsor.ajay.app/*'),
        'SponsorBlock host must be in optional_host_permissions');
    assert.ok(manifest.optional_host_permissions.includes('https://returnyoutubedislikeapi.com/*'),
        'RYD host must be in optional_host_permissions');
    assert.match(background, /COMMUNITY_API_ORIGINS/);
    assert.match(background, /permissions\.request/);
    assert.match(background, /check-api-permissions/);
    assert.match(userscript, /communityApiPermission/);
});

test('the production manifest stays least-privilege', () => {
    assert.equal(manifest.permissions.includes('tabs'), false,
        'tabs is not needed: matching host permissions already expose tab.url for YouTube tabs');
    assert.equal(manifest.permissions.includes('declarativeNetRequestFeedback'), false,
        'declarativeNetRequestFeedback is an unpacked-debugging permission and belongs in the development profile');
    // Everything the extension actually uses must still be present.
    for (const permission of ['storage', 'contextMenus', 'declarativeNetRequest']) {
        assert.ok(manifest.permissions.includes(permission), `missing required permission: ${permission}`);
    }
});

test('the development manifest adds only the debugging permission', () => {
    const extra = devManifest.permissions.filter(p => !manifest.permissions.includes(p));
    assert.deepEqual(extra, ['declarativeNetRequestFeedback']);
    assert.equal(devManifest.manifest_version, manifest.manifest_version);
    assert.equal(devManifest.version, manifest.version);
    assert.deepEqual(devManifest.host_permissions, manifest.host_permissions);
    assert.deepEqual(devManifest.content_scripts, manifest.content_scripts);
    assert.match(devManifest.name, /development/i,
        'the development profile must be visually distinct when loaded unpacked');
});

test('matched-rule diagnostics use privacy-bounded DNR feedback', () => {
    assert.match(background, /declarativeNetRequest\.getMatchedRules/);
    assert.match(background, /rulesetId\s*!==\s*DNR_RULESET_ID/);
    assert.match(bridge, /DNR diagnostics as bounded rule IDs\/counts only/);
    assert.match(userscript, /DNR matched rules/);
    assert.doesNotMatch(background, /onRuleMatchedDebug/);
    assert.doesNotMatch(bridge, /onRuleMatchedDebug/);
});

test('release gate verifies install artifacts before publishing', () => {
    assert.match(buildRelease, /verify-release-artifacts\.mjs/);
    assert.match(verifyReleaseArtifacts, /CRX3 SignedData/);
    assert.match(verifyReleaseArtifacts, /readUInt32LE\(4\) !== 3/);
    assert.match(verifyReleaseArtifacts, /Windows-style ZIP entry path/);
    assert.match(verifyReleaseArtifacts, /extension ID changed/i);
    assert.match(verifyReleaseArtifacts, /requestedArtifactTypes/);
    assert.match(verifyReleaseArtifacts, /--crx-path/);
    assert.match(verifyReleaseArtifacts, /checksums\.sha256/);
    assert.match(expectedExtensionId, /^[a-p]{32}$/);
    assert.match(readme, /writes SHA-256 checksums/);
    assert.match(extensionReadme, /pinned extension ID/);
});

test('webpack ad signatures are tracked as a refreshable JSON source', () => {
    assert.match(userscript, /WEBPACK_SIGNATURE_URL_DEFAULT/);
    assert.match(userscript, /webpack-ad-signatures\.json/);
    assert.match(userscript, /fetchWebpackSignatureDatabase\(\)/);
    assert.ok(Array.isArray(webpackSignatures.tokens));
    assert.ok(webpackSignatures.tokens.includes('adPlacements'));
    assert.ok(webpackSignatures.tokens.includes('playerLegacyDesktopWatchAdsRenderer'));
    assert.equal(Number.isInteger(webpackSignatures.maxFactoryBytes), true);
});

test('Control Center user-visible strings resolve through the STRINGS table', () => {
    const normalizedUserscript = userscript.replace(/\r\n/g, '\n');
    assert.match(normalizedUserscript, /const STRINGS = \{/);
    assert.match(normalizedUserscript, /const FEATURE_COPY = STRINGS\.featureGroups/);
    assert.match(normalizedUserscript, /function featureCopy\(groupKey, featureKey\)/);

    const featureBlockStart = normalizedUserscript.indexOf('const FEATURE_GROUPS = [');
    const stateBlockStart = normalizedUserscript.indexOf('/* =========================================================================\n     * STATE', featureBlockStart);
    assert.notEqual(featureBlockStart, -1, 'FEATURE_GROUPS block missing');
    assert.notEqual(stateBlockStart, -1, 'STATE block marker missing after FEATURE_GROUPS');
    const featureBlock = normalizedUserscript.slice(featureBlockStart, stateBlockStart);
    assert.doesNotMatch(featureBlock, /\b(?:title|description|label|desc):\s*['"`][A-Z]/,
        'FEATURE_GROUPS should reference STRINGS.featureGroups instead of owning display copy');

    const stringsStart = normalizedUserscript.indexOf('const STRINGS = {');
    const defaultFiltersStart = normalizedUserscript.indexOf('/* =========================================================================\n     * DEFAULT FILTERS', stringsStart);
    assert.notEqual(stringsStart, -1, 'STRINGS table missing');
    assert.notEqual(defaultFiltersStart, -1, 'DEFAULT FILTERS marker missing after STRINGS');
    const sourceOutsideStrings = normalizedUserscript.slice(0, stringsStart) + normalizedUserscript.slice(defaultFiltersStart);
    const visibleSinkPatterns = [
        /textContent\s*=\s*['"`][A-Z]/,
        /placeholder\s*=\s*['"`][A-Z]/,
        /\.title\s*=\s*['"`][A-Z]/,
        /setAttribute\('aria-label',\s*['"`][A-Z]/,
        /showToast\(\s*['"`][A-Z]/,
        /createNote\(\s*['"`][A-Z]/,
        /createSection\(\s*['"`][A-Z]/,
        /createActionGroup\(\s*['"`][A-Z]/,
        /createGlanceItem\(\s*['"`][A-Z]/,
        /createMetricTile\(\s*['"`][A-Z]/,
        /createJumpButton\(\s*['"`][A-Z]/,
        /throw new Error\(\s*['"`][A-Z]/,
        /\berror:\s*['"`][A-Z]/,
        /\bmessage:\s*['"`][A-Z]/
    ];
    for (const pattern of visibleSinkPatterns) {
        assert.doesNotMatch(sourceOutsideStrings, pattern,
            `visible UI copy should come from STRINGS table, matched ${pattern}`);
    }
});

test('every Control Center feature toggle has an explicit runtime default', () => {
    const normalizedUserscript = userscript.replace(/\r\n/g, '\n');
    const featureBlockStart = normalizedUserscript.indexOf('const FEATURE_GROUPS = [');
    const stateBlockStart = normalizedUserscript.indexOf('/* =========================================================================\n     * STATE', featureBlockStart);
    const defaultsStart = normalizedUserscript.indexOf('features: {', normalizedUserscript.indexOf('const DEFAULT_FILTERS = {'));
    const defaultsEnd = normalizedUserscript.indexOf('\n        }\n    };', defaultsStart);
    assert.notEqual(featureBlockStart, -1);
    assert.notEqual(stateBlockStart, -1);
    assert.notEqual(defaultsStart, -1);
    assert.notEqual(defaultsEnd, -1);

    const exposedKeys = [...normalizedUserscript.slice(featureBlockStart, stateBlockStart)
        .matchAll(/\{\s*key:\s*'([^']+)'/g)]
        .map(match => match[1]);
    const defaultBlock = normalizedUserscript.slice(defaultsStart, defaultsEnd);
    for (const key of exposedKeys) {
        assert.match(
            defaultBlock,
            new RegExp(`\\b${key}:\\s*(?:true|false)\\b`),
            `Control Center toggle ${key} is missing an explicit DEFAULT_FILTERS.features value`
        );
    }
});

test('browser smoke matrix is wired into the local test suite', () => {
    assert.equal(packageJson.private, true);
    assert.equal(packageJson.scripts.test, 'node --test tests/*.mjs');
    assert.equal(packageJson.scripts['test:browser'], 'node --test tests/browser-smoke.test.mjs');
    assert.ok(packageJson.devDependencies['playwright-core']);
    assert.match(read(path.join('tests', 'browser-smoke.test.mjs')), /browser smoke matrix opens Control Center/);
});

test('filter manifest signer keeps remote rules signed without committing private keys', () => {
    assert.match(signFilterManifest, /Ed25519/);
    assert.match(signFilterManifest, /YoutubeAdblock-filter-signing-private\.pem/);
    assert.match(signFilterManifest, /verifyCommittedManifest/);
    assert.equal(filterManifest.algorithm, 'Ed25519');
    assert.equal(filterManifest.signedContent, 'youtube-adblock-filters.txt');
    assert.match(filterSignature, /^[A-Za-z0-9+/]+={0,2}$/);
    assert(userscript.includes(filterManifest.publicKey), 'userscript must embed the trusted filter public key');
    assert.match(gitignore, /\*\.pem/);
});

test('webpack signature database is signed with the same key as the filter list', () => {
    assert.equal(webpackSigManifest.algorithm, 'Ed25519');
    assert.equal(webpackSigManifest.signedContent, 'webpack-ad-signatures.json');
    assert.equal(webpackSigManifest.publicKey, filterManifest.publicKey);
    assert.match(webpackSigSignature, /^[A-Za-z0-9+/]+={0,2}$/);
    assert.match(userscript, /WEBPACK_SIGNATURE_MANIFEST_URL_DEFAULT/);
    assert.match(userscript, /WEBPACK_SIGNATURE_SIG_URL_DEFAULT/);
    assert.match(userscript, /verifyWebpackSignatureIntegrity/);
    assert.match(userscript, /webpackSignatureIntegrity/);
    assert.match(buildRelease, /webpack-ad-signatures\.json/);
    assert.match(buildRelease, /webpack-ad-signatures\.manifest\.json/);
});

test('extension README reflects the current iconless manifest', () => {
    assert.equal('icons' in manifest, false, 'manifest should stay iconless until replacement branding ships');
    assert.equal('default_icon' in manifest.action, false,
        'browser action should stay iconless until replacement branding ships');
    assert.doesNotMatch(extensionReadme, /\|\s*`icons\/`\s*\|/);
    assert.match(extensionReadme, /default toolbar icon/i);
});

test('extension keyboard commands are opt-in with no default shortcuts', () => {
    for (const [name, command] of Object.entries(manifest.commands || {})) {
        assert.equal('suggested_key' in command, false,
            `${name} should not ship a default suggested_key`);
    }
    assert.doesNotMatch(readme, /Ctrl\+Shift\+Y|Command\+Shift\+Y|Cmd\+Shift\+Y/);
    assert.doesNotMatch(extensionReadme, /Ctrl\+Shift\+Y|Command\+Shift\+Y|Cmd\+Shift\+Y/);
    assert.doesNotMatch(userscript, /Ctrl\s*\+\s*Shift\s*\+\s*Y|Command\s*\+\s*Shift\s*\+\s*Y|Cmd\s*\+\s*Shift\s*\+\s*Y/);
    assert.match(readme, /chrome:\/\/extensions\/shortcuts/);
    assert.match(extensionReadme, /chrome:\/\/extensions\/shortcuts/);
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

    const screenshotMatch = readme.match(/design\/screenshots\/control-center-desktop-dark-v([0-9][0-9A-Za-z.+-]*)\.png/);
    assert(screenshotMatch, 'README current Control Center screenshot is missing');
    assert.equal(screenshotMatch[1], version,
        `README screenshot (${screenshotMatch[1]}) differs from userscript (${version})`);
    assert.equal(fs.existsSync(path.join(repoRoot, screenshotMatch[0])), true,
        `README screenshot file is missing: ${screenshotMatch[0]}`);
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

test('third-party filter and API license attribution is verified at release', () => {
    const licenseVerifier = read(path.join('tools', 'verify-license-attribution.mjs'));
    assert.match(licenseVerifier, /uBlock|uBO/);
    assert.match(licenseVerifier, /EasyList/);
    assert.match(licenseVerifier, /SponsorBlock/);
    assert.match(licenseVerifier, /DeArrow/);
    assert.match(licenseVerifier, /Return YouTube Dislike/);
    assert.match(licenseVerifier, /CC BY-NC-SA/);
    assert.match(licenseVerifier, /LICENSE/);
    assert.match(buildRelease, /verify-license-attribution\.mjs/);
});

test('userscript marketplace preflight validates metadata and disclosure', () => {
    const marketplace = read(path.join('tools', 'verify-userscript-marketplace.mjs'));
    assert.match(marketplace, /@name/);
    assert.match(marketplace, /@version/);
    assert.match(marketplace, /@downloadURL/);
    assert.match(marketplace, /@connect/);
    assert.match(marketplace, /minified|obfuscated/i);
    assert.match(marketplace, /size limit/i);
    assert.match(buildRelease, /verify-userscript-marketplace\.mjs/);
});

test('release provenance metadata is emitted and verified', () => {
    assert.match(buildRelease, /provenance\.json/);
    assert.match(buildRelease, /commitSha/);
    assert.match(buildRelease, /nodeVersion/);
    assert.match(buildRelease, /playwrightVersion/);
    assert.match(buildRelease, /builtAt/);
    assert.match(buildRelease, /UTF8Encoding\]::new\(\$false\)/,
        'Windows PowerShell must emit provenance as UTF-8 without a BOM');
    assert.match(verifyReleaseArtifacts, /provenance/);
    assert.match(verifyReleaseArtifacts, /schemaVersion/);
    assert.match(verifyReleaseArtifacts, /commitSha/);
});

test('store-policy preflight catches remote code and broad permissions', () => {
    const storePolicy = read(path.join('tools', 'verify-store-policy.mjs'));
    assert.match(storePolicy, /remote executable URL/i);
    assert.match(storePolicy, /broad.*pattern/i);
    assert.match(storePolicy, /unsigned.*xpi/i);
    assert.match(storePolicy, /extension-id\.txt/);
    assert.match(storePolicy, /eval\b/);
    assert.match(storePolicy, /new\s+Function/);
    assert.match(buildRelease, /verify-store-policy\.mjs/);
});

test('remote-rule capability denylist rejects dangerous scriptlets', () => {
    assert.match(userscript, /DANGEROUS_SCRIPTLET_RE/);
    assert.match(userscript, /isDangerousScriptlet/);
    assert.match(userscript, /rejectedDangerousScriptlets/);
    assert.match(userscript, /Rejected dangerous scriptlets/i);
});

test('release publication guard verifies GitHub release assets and checksums', () => {
    assert.match(verifyReleaseArtifacts, /--verify-publication/);
    assert.match(verifyReleaseArtifacts, /verifyPublication/);
    assert.match(verifyReleaseArtifacts, /gh release view/);
    assert.match(verifyReleaseArtifacts, /checksums do not match/i);
    assert.match(verifyReleaseArtifacts, /missing assets/i);
    assert.match(buildRelease, /VerifyPublication/);
    assert.match(buildRelease, /--verify-publication/);
});
