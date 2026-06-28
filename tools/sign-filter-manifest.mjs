import fs from 'node:fs';
import path from 'node:path';
import {
    createHash,
    createPrivateKey,
    createPublicKey,
    sign,
    verify,
} from 'node:crypto';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = process.argv[i + 1];
    if (next && !next.startsWith('--')) {
        args.set(key, next);
        i += 1;
    } else {
        args.set(key, true);
    }
}

const repoRoot = path.resolve(args.get('repo-root') || process.cwd());
const filterName = args.get('filter') || 'youtube-adblock-filters.txt';
const manifestName = args.get('manifest') || 'youtube-adblock-filters.manifest.json';
const signatureName = args.get('signature') || `${filterName}.sig`;
const privateKeyName = args.get('private-key') || 'YoutubeAdblock-filter-signing-private.pem';

const filterPath = path.join(repoRoot, filterName);
const manifestPath = path.join(repoRoot, manifestName);
const signaturePath = path.join(repoRoot, signatureName);
const privateKeyPath = path.join(repoRoot, privateKeyName);

function readCanonicalFilterBytes(filePath) {
    const text = fs.readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n');
    return Buffer.from(text, 'utf8');
}

function sha256Base64Url(bytes) {
    return createHash('sha256').update(bytes).digest('base64url');
}

function normalizeBase64(value) {
    return String(value || '').replace(/\s+/g, '');
}

function verifySignature(filterBytes, publicKeyBase64, signatureBase64) {
    const publicKey = createPublicKey({
        key: Buffer.from(normalizeBase64(publicKeyBase64), 'base64'),
        format: 'der',
        type: 'spki',
    });
    return verify(null, filterBytes, publicKey, Buffer.from(normalizeBase64(signatureBase64), 'base64'));
}

function writeSignedManifest(filterBytes) {
    const privatePem = fs.readFileSync(privateKeyPath, 'utf8');
    const privateKey = createPrivateKey(privatePem);
    const publicKey = createPublicKey(privateKey);
    const publicKeyBase64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    const signatureBase64 = sign(null, filterBytes, privateKey).toString('base64');
    const filterSha256 = sha256Base64Url(filterBytes);
    const manifest = {
        schemaVersion: 1,
        algorithm: 'Ed25519',
        signedContent: filterName,
        signatureFile: signatureName,
        publicKey: publicKeyBase64,
        sha256: filterSha256,
        bytes: filterBytes.length,
        updated: new Date().toISOString().slice(0, 10),
    };

    if (!verifySignature(filterBytes, publicKeyBase64, signatureBase64)) {
        throw new Error('generated Ed25519 signature did not verify');
    }

    fs.writeFileSync(signaturePath, `${signatureBase64}\n`, 'utf8');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`Signed ${filterName} -> ${path.basename(manifestPath)} + ${path.basename(signaturePath)}`);
}

function verifyCommittedManifest(filterBytes) {
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`missing filter manifest: ${manifestPath}`);
    }
    if (!fs.existsSync(signaturePath)) {
        throw new Error(`missing filter signature: ${signaturePath}`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const signatureBase64 = fs.readFileSync(signaturePath, 'utf8');
    if (manifest.schemaVersion !== 1) throw new Error('filter manifest schemaVersion must be 1');
    if (manifest.algorithm !== 'Ed25519') throw new Error('filter manifest algorithm must be Ed25519');
    if (manifest.signedContent !== filterName) throw new Error(`filter manifest signedContent must be ${filterName}`);
    if (manifest.signatureFile !== signatureName) throw new Error(`filter manifest signatureFile must be ${signatureName}`);
    if (manifest.sha256 !== sha256Base64Url(filterBytes)) throw new Error('filter manifest sha256 is stale');
    if (Number(manifest.bytes) !== filterBytes.length) throw new Error('filter manifest byte count is stale');
    if (!verifySignature(filterBytes, manifest.publicKey, signatureBase64)) {
        throw new Error('filter signature verification failed');
    }
    console.log(`Verified ${filterName} signature`);
}

if (!fs.existsSync(filterPath)) {
    throw new Error(`missing filter file: ${filterPath}`);
}

const filterBytes = readCanonicalFilterBytes(filterPath);
if (fs.existsSync(privateKeyPath)) {
    writeSignedManifest(filterBytes);
} else {
    verifyCommittedManifest(filterBytes);
}
