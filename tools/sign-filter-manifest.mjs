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

// Schema v2: the manifest itself is signed and carries an artifact role,
// a monotonic revision, an expiry, and a key id, so an old but validly
// signed (content, signature) pair can no longer be replayed at clients.
const SCHEMA_VERSION = 2;
const SIGNING_KEY_ID = 'ytab-2026-08';
const MANIFEST_DOMAIN = 'ytab-manifest-v2';
const MANIFEST_VALIDITY_DAYS = Number(args.get('validity-days') || 180);
const forceRefresh = args.get('refresh') === true;
const ARTIFACT_ROLES = {
    'youtube-adblock-filters.txt': 'filters',
    'webpack-ad-signatures.json': 'webpack-signatures',
};
const role = ARTIFACT_ROLES[filterName];
if (!role) throw new Error(`unknown signed artifact: ${filterName}`);
const manifestSignaturePath = `${manifestPath}.sig`;

function manifestSigningInput(manifest) {
    const canonical = JSON.stringify({
        schemaVersion: manifest.schemaVersion,
        algorithm: manifest.algorithm,
        role: manifest.role,
        signedContent: manifest.signedContent,
        signatureFile: manifest.signatureFile,
        keyId: manifest.keyId,
        publicKey: manifest.publicKey,
        sha256: manifest.sha256,
        bytes: manifest.bytes,
        revision: manifest.revision,
        updated: manifest.updated,
        expires: manifest.expires,
    });
    return Buffer.from(`${MANIFEST_DOMAIN}:${manifest.role}:${canonical}`, 'utf8');
}

function nextRevision() {
    // Monotonic per role: never reuse or lower a published revision.
    if (!fs.existsSync(manifestPath)) return 1;
    try {
        const previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const current = Number(previous.revision);
        return Number.isFinite(current) && current >= 1 ? Math.floor(current) + 1 : 1;
    } catch {
        return 1;
    }
}

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
    const now = new Date();
    const expires = new Date(now.getTime() + MANIFEST_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
    const manifest = {
        schemaVersion: SCHEMA_VERSION,
        algorithm: 'Ed25519',
        role,
        signedContent: filterName,
        signatureFile: signatureName,
        keyId: SIGNING_KEY_ID,
        publicKey: publicKeyBase64,
        sha256: filterSha256,
        bytes: filterBytes.length,
        revision: nextRevision(),
        updated: now.toISOString().slice(0, 10),
        expires: expires.toISOString().slice(0, 10),
    };

    if (!verifySignature(filterBytes, publicKeyBase64, signatureBase64)) {
        throw new Error('generated Ed25519 signature did not verify');
    }
    const manifestSignatureBase64 = sign(null, manifestSigningInput(manifest), privateKey).toString('base64');
    if (!verifySignature(manifestSigningInput(manifest), publicKeyBase64, manifestSignatureBase64)) {
        throw new Error('generated manifest signature did not verify');
    }

    fs.writeFileSync(signaturePath, `${signatureBase64}\n`, 'utf8');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    fs.writeFileSync(manifestSignaturePath, `${manifestSignatureBase64}\n`, 'utf8');
    console.log(`Signed ${filterName} rev ${manifest.revision} -> ${path.basename(manifestPath)} (+ .sig) + ${path.basename(signaturePath)}`);
}

function verifyCommittedManifest(filterBytes) {
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`missing filter manifest: ${manifestPath}`);
    }
    if (!fs.existsSync(signaturePath)) {
        throw new Error(`missing filter signature: ${signaturePath}`);
    }

    if (!fs.existsSync(manifestSignaturePath)) {
        throw new Error(`missing manifest signature: ${manifestSignaturePath}`);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const signatureBase64 = fs.readFileSync(signaturePath, 'utf8');
    const manifestSignatureBase64 = fs.readFileSync(manifestSignaturePath, 'utf8');
    if (manifest.schemaVersion !== SCHEMA_VERSION) throw new Error(`filter manifest schemaVersion must be ${SCHEMA_VERSION}`);
    if (manifest.role !== role) throw new Error(`filter manifest role must be ${role}`);
    if (manifest.keyId !== SIGNING_KEY_ID) throw new Error(`filter manifest keyId must be ${SIGNING_KEY_ID}`);
    if (!Number.isInteger(manifest.revision) || manifest.revision < 1) throw new Error('filter manifest revision must be a positive integer');
    if (!manifest.expires || Number.isNaN(Date.parse(manifest.expires))) throw new Error('filter manifest expires must be a date');
    if (Date.parse(manifest.expires) <= Date.now()) throw new Error('filter manifest has expired — re-sign it');
    if (!verifySignature(manifestSigningInput(manifest), manifest.publicKey, manifestSignatureBase64)) {
        throw new Error('manifest signature verification failed');
    }
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
if (!fs.existsSync(privateKeyPath)) {
    verifyCommittedManifest(filterBytes);
} else if (forceRefresh) {
    writeSignedManifest(filterBytes);
} else {
    try {
        verifyCommittedManifest(filterBytes);
    } catch (error) {
        console.log(`Existing ${filterName} signature needs renewal: ${error.message}`);
        writeSignedManifest(filterBytes);
    }
}
