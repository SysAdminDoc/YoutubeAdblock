#!/usr/bin/env node
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function argValue(name, fallback = null) {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const repoRoot = path.resolve(argValue('--repo-root', process.cwd()));
const outputDir = path.resolve(repoRoot, argValue('--output-dir', 'dist'));
const sourcePath = path.join(repoRoot, 'YoutubeAdblock.user.js');
const expectedIdPath = path.join(repoRoot, 'extension', 'extension-id.txt');
const knownArtifactTypes = new Set(['userscript', 'zip', 'crx', 'xpi']);

function requestedArtifactTypes() {
    const raw = argValue('--artifacts', 'Userscript,Zip,Crx');
    const values = raw.split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    if (!values.length) fail('At least one artifact type must be requested.');
    for (const value of values) {
        if (!knownArtifactTypes.has(value)) fail(`Unknown artifact type: ${value}`);
    }
    return new Set(values);
}

function fail(message) {
    throw new Error(message);
}

function readRequired(filePath) {
    if (!fs.existsSync(filePath)) fail(`Missing required artifact: ${filePath}`);
    return fs.readFileSync(filePath);
}

function getVersion() {
    const source = fs.readFileSync(sourcePath, 'utf8');
    const match = source.match(/^\/\/\s*@version\s+(\S+)/m);
    if (!match) fail('Userscript @version missing.');
    const version = match[1];
    if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.]+)?$/.test(version)) {
        fail(`Userscript @version contains unsafe characters: ${version}`);
    }
    return version;
}

function normalizeZipName(name) {
    return name.replace(/^\.\//, '');
}

function findEndOfCentralDirectory(buffer) {
    const minOffset = Math.max(0, buffer.length - 0xffff - 22);
    for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
    }
    fail('ZIP end-of-central-directory record not found.');
}

function listZipEntries(buffer) {
    const eocd = findEndOfCentralDirectory(buffer);
    const count = buffer.readUInt16LE(eocd + 10);
    const centralOffset = buffer.readUInt32LE(eocd + 16);
    const entries = [];
    let offset = centralOffset;
    for (let i = 0; i < count; i += 1) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) {
            fail(`ZIP central directory entry ${i + 1} has an invalid header.`);
        }
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
        entries.push(normalizeZipName(name));
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

function verifyZipPayload(zipBuffer, label) {
    if (zipBuffer.subarray(0, 2).toString('ascii') !== 'PK') {
        fail(`${label} ZIP payload does not start with PK.`);
    }
    const entries = listZipEntries(zipBuffer);
    const entrySet = new Set(entries);
    for (const entry of entries) {
        if (entry.includes('\\')) fail(`${label} has Windows-style ZIP entry path: ${entry}`);
        if (entry.startsWith('/') || /^[A-Za-z]:/.test(entry) || entry.split('/').includes('..')) {
            fail(`${label} has unsafe ZIP entry path: ${entry}`);
        }
    }
    for (const required of ['manifest.json', 'main.js', 'bridge.js', 'background.js', 'rules/network-blocks.json']) {
        if (!entrySet.has(required)) fail(`${label} missing required ZIP entry: ${required}`);
    }
    if (entrySet.has('README.md')) fail(`${label} should not include extension/README.md.`);
    return entries;
}

function readVarint(buffer, offset) {
    let value = 0;
    let shift = 0;
    let cursor = offset;
    while (cursor < buffer.length) {
        const byte = buffer[cursor];
        value += (byte & 0x7f) * (2 ** shift);
        cursor += 1;
        if ((byte & 0x80) === 0) return { value, offset: cursor };
        shift += 7;
        if (shift > 56) fail('Invalid protobuf varint.');
    }
    fail('Truncated protobuf varint.');
}

function parseLengthDelimitedFields(buffer) {
    const fields = [];
    let offset = 0;
    while (offset < buffer.length) {
        const key = readVarint(buffer, offset);
        offset = key.offset;
        const fieldNumber = Math.floor(key.value / 8);
        const wireType = key.value % 8;
        if (wireType !== 2) fail(`Unsupported protobuf wire type ${wireType} for field ${fieldNumber}.`);
        const length = readVarint(buffer, offset);
        offset = length.offset;
        const end = offset + length.value;
        if (end > buffer.length) fail(`Truncated protobuf field ${fieldNumber}.`);
        fields.push({ fieldNumber, value: buffer.subarray(offset, end) });
        offset = end;
    }
    return fields;
}

function parseProof(proofBuffer) {
    const proof = {};
    for (const field of parseLengthDelimitedFields(proofBuffer)) {
        if (field.fieldNumber === 1) proof.publicKey = field.value;
        if (field.fieldNumber === 2) proof.signature = field.value;
    }
    return proof;
}

function parseCrxHeader(headerBuffer) {
    const header = { proofs: [] };
    for (const field of parseLengthDelimitedFields(headerBuffer)) {
        if (field.fieldNumber === 2) header.proofs.push(parseProof(field.value));
        if (field.fieldNumber === 10000) header.signedHeaderData = field.value;
    }
    if (!header.proofs.length) fail('CRX3 header has no RSA proof.');
    if (!header.signedHeaderData) fail('CRX3 header missing signed_header_data.');
    return header;
}

function parseSignedData(signedHeaderData) {
    for (const field of parseLengthDelimitedFields(signedHeaderData)) {
        if (field.fieldNumber === 1) return { crxId: field.value };
    }
    fail('CRX3 SignedData missing crx_id.');
}

function crxIdBytesToExtensionId(bytes) {
    if (bytes.length !== 16) fail(`CRX ID must be 16 bytes, got ${bytes.length}.`);
    const alphabet = 'abcdefghijklmnop';
    let id = '';
    for (const byte of bytes) {
        id += alphabet[(byte >> 4) & 0x0f] + alphabet[byte & 0x0f];
    }
    return id;
}

function verifyCrx(crxPath) {
    const buffer = readRequired(crxPath);
    if (buffer.subarray(0, 4).toString('ascii') !== 'Cr24') fail('CRX magic must be Cr24.');
    if (buffer.readUInt32LE(4) !== 3) fail('CRX version must be 3.');
    const headerLength = buffer.readUInt32LE(8);
    if (headerLength <= 0 || headerLength > 1024 * 1024) fail(`Suspicious CRX header length: ${headerLength}.`);
    const headerBuffer = buffer.subarray(12, 12 + headerLength);
    const zipPayload = buffer.subarray(12 + headerLength);
    verifyZipPayload(zipPayload, path.basename(crxPath));

    const header = parseCrxHeader(headerBuffer);
    const signed = parseSignedData(header.signedHeaderData);
    const extensionId = crxIdBytesToExtensionId(signed.crxId);
    const size = Buffer.alloc(4);
    size.writeUInt32LE(header.signedHeaderData.length, 0);
    const signedPayload = Buffer.concat([
        Buffer.from('CRX3 SignedData\0', 'utf8'),
        size,
        header.signedHeaderData,
        zipPayload
    ]);

    const proof = header.proofs.find(item => item.publicKey && item.signature);
    if (!proof) fail('CRX3 header has no complete RSA proof.');
    const key = crypto.createPublicKey({ key: proof.publicKey, format: 'der', type: 'spki' });
    const verified = crypto.verify('sha256', signedPayload, {
        key,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
    }, proof.signature) || crypto.verify('sha256', signedPayload, {
        key,
        padding: crypto.constants.RSA_PKCS1_PADDING
    }, proof.signature);
    if (!verified) fail('CRX3 RSA signature verification failed.');

    const publicKeyId = crxIdBytesToExtensionId(crypto.createHash('sha256').update(proof.publicKey).digest().subarray(0, 16));
    if (publicKeyId !== extensionId) fail(`CRX ID ${extensionId} does not match public key ID ${publicKeyId}.`);
    return extensionId;
}

function sha256File(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function verifyExpectedExtensionId(actualId) {
    if (!fs.existsSync(expectedIdPath)) {
        fail(`Missing expected extension ID file: ${expectedIdPath}. Current CRX ID is ${actualId}.`);
    }
    const expectedId = fs.readFileSync(expectedIdPath, 'utf8').trim();
    if (!/^[a-p]{32}$/.test(expectedId)) fail(`Invalid expected extension ID in ${expectedIdPath}.`);
    if (actualId !== expectedId) fail(`CRX extension ID changed: expected ${expectedId}, got ${actualId}.`);
}

function verifyXpiNames() {
    const xpiFiles = fs.existsSync(outputDir)
        ? fs.readdirSync(outputDir).filter(name => name.toLowerCase().endsWith('.xpi'))
        : [];
    for (const name of xpiFiles) {
        if (!name.endsWith('.unsigned.xpi')) fail(`XPI artifact must be explicitly unsigned: ${name}`);
        verifyZipPayload(readRequired(path.join(outputDir, name)), name);
    }
    return xpiFiles.map(name => path.join(outputDir, name));
}

function verifyPublication(version, requested) {
    if (requested.has('xpi')) {
        fail('Unsigned development XPI files cannot be publication artifacts.');
    }
    const tag = `v${version}`;
    try {
        execSync(`git rev-parse --verify refs/tags/${tag}`, { cwd: repoRoot, stdio: 'pipe' });
    } catch {
        fail(`Git tag ${tag} does not exist locally. Tag the release before verifying publication.`);
    }

    let releaseJson;
    try {
        releaseJson = execSync(
            `gh release view ${tag} --repo SysAdminDoc/YoutubeAdblock --json tagName,assets`,
            { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8' }
        );
    } catch {
        fail(`GitHub release for ${tag} not found. Publish the release before verifying.`);
    }

    const release = JSON.parse(releaseJson);
    if (release.tagName !== tag) fail(`Release tag mismatch: expected ${tag}, got ${release.tagName}.`);

    const expectedNames = [`YoutubeAdblock-v${version}.checksums.sha256`];
    if (requested.has('userscript')) expectedNames.push(`YoutubeAdblock-v${version}.user.js`);
    if (requested.has('zip')) expectedNames.push(`YoutubeAdblock-extension-v${version}.zip`);
    if (requested.has('crx')) expectedNames.push(`YoutubeAdblock-extension-v${version}.crx`);
    const publishedNames = new Set(release.assets.map(a => a.name));
    const missing = expectedNames.filter(name => !publishedNames.has(name));
    if (missing.length) fail(`GitHub release ${tag} is missing assets: ${missing.join(', ')}`);

    const checksumPath = path.join(outputDir, `YoutubeAdblock-v${version}.checksums.sha256`);
    if (!fs.existsSync(checksumPath)) {
        fail(`Local checksum file missing: ${checksumPath}. Run the release gate first.`);
    }
    const localChecksums = fs.readFileSync(checksumPath, 'utf8').trim();

    const checksumAsset = release.assets.find(a => a.name === `YoutubeAdblock-v${version}.checksums.sha256`);
    let publishedChecksums;
    try {
        publishedChecksums = execSync(
            `gh release download ${tag} --repo SysAdminDoc/YoutubeAdblock --pattern "${checksumAsset.name}" --output -`,
            { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8' }
        ).trim();
    } catch {
        fail(`Failed to download published checksum file for ${tag}.`);
    }

    if (localChecksums !== publishedChecksums) {
        fail(`Published checksums do not match local checksums for ${tag}.\nLocal:\n${localChecksums}\nPublished:\n${publishedChecksums}`);
    }

    console.log(`Publication verified for ${tag}: all expected assets present, checksums match.`);
}

function main() {
    const crxOnlyPath = argValue('--crx-path');
    if (crxOnlyPath) {
        const resolvedCrxPath = path.resolve(repoRoot, crxOnlyPath);
        const extensionId = verifyCrx(resolvedCrxPath);
        verifyExpectedExtensionId(extensionId);
        console.log(`Verified CRX identity ${extensionId}: ${resolvedCrxPath}`);
        return;
    }

    const version = getVersion();
    const requested = requestedArtifactTypes();

    if (process.argv.includes('--verify-publication')) {
        verifyPublication(version, requested);
        return;
    }

    const userscriptArtifact = path.join(outputDir, `YoutubeAdblock-v${version}.user.js`);
    const zipArtifact = path.join(outputDir, `YoutubeAdblock-extension-v${version}.zip`);
    const crxArtifact = path.join(outputDir, `YoutubeAdblock-extension-v${version}.crx`);
    const artifacts = [];
    let extensionId = '';

    if (requested.has('userscript')) {
        const userscript = readRequired(userscriptArtifact).toString('utf8');
        if (!userscript.includes(`// @version      ${version}`)) fail('Userscript artifact version is stale.');
        artifacts.push(userscriptArtifact);
    }
    if (requested.has('zip')) {
        verifyZipPayload(readRequired(zipArtifact), path.basename(zipArtifact));
        artifacts.push(zipArtifact);
    }
    if (requested.has('crx')) {
        extensionId = verifyCrx(crxArtifact);
        verifyExpectedExtensionId(extensionId);
        artifacts.push(crxArtifact);
    }
    if (requested.has('xpi')) {
        const xpiArtifacts = verifyXpiNames();
        if (!xpiArtifacts.length) fail('Requested XPI artifact is missing.');
        artifacts.push(...xpiArtifacts);
    }

    const provenancePath = path.join(outputDir, `YoutubeAdblock-v${version}.provenance.json`);
    if (!fs.existsSync(provenancePath)) {
        fail(`Missing provenance artifact: ${provenancePath}`);
    } else {
        const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
        if (provenance.schemaVersion !== 1) fail('Provenance schemaVersion must be 1.');
        if (provenance.version !== version) fail(`Provenance version (${provenance.version}) does not match userscript (${version}).`);
        if (!provenance.commitSha || provenance.commitSha === 'unknown') fail('Provenance is missing commitSha.');
        if (!provenance.nodeVersion || provenance.nodeVersion === 'unknown') fail('Provenance is missing nodeVersion.');
        if (!provenance.builtAt) fail('Provenance is missing builtAt timestamp.');
        artifacts.push(provenancePath);
    }

    const checksumPath = path.join(outputDir, `YoutubeAdblock-v${version}.checksums.sha256`);
    const lines = artifacts
        .map(filePath => `${sha256File(filePath)}  ${path.basename(filePath)}`)
        .sort()
        .join('\n') + '\n';
    fs.writeFileSync(checksumPath, lines, 'utf8');
    const checksumText = fs.existsSync(checksumPath) ? fs.readFileSync(checksumPath, 'utf8') : '';
    if (!checksumText || artifacts.some(filePath => !checksumText.includes(path.basename(filePath)))) {
        fail('Checksum manifest was not written correctly.');
    }
    const identity = extensionId ? `; extension ID ${extensionId}` : '';
    console.log(`Verified ${[...requested].join(', ')} artifacts for v${version}${identity}; checksums ${checksumPath}`);
}

main();
