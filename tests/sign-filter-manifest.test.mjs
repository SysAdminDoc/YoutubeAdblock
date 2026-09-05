import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const signerPath = path.join(repoRoot, 'tools', 'sign-filter-manifest.mjs');

function runSigner(tempRoot, ...extraArgs) {
    return spawnSync(process.execPath, [
        signerPath,
        '--repo-root', tempRoot,
        ...extraArgs,
    ], { encoding: 'utf8' });
}

test('signed manifests stay byte-stable until an explicit refresh', (t) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ytab-signer-test-'));
    t.after(() => {
        assert.equal(path.resolve(path.dirname(tempRoot)).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
        assert.match(path.basename(tempRoot), /^ytab-signer-test-/);
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    const { privateKey } = generateKeyPairSync('ed25519');
    fs.writeFileSync(
        path.join(tempRoot, 'YoutubeAdblock-filter-signing-private.pem'),
        privateKey.export({ format: 'pem', type: 'pkcs8' })
    );
    fs.writeFileSync(path.join(tempRoot, 'youtube-adblock-filters.txt'), 'example rule\n', 'utf8');

    const first = runSigner(tempRoot);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const manifestPath = path.join(tempRoot, 'youtube-adblock-filters.manifest.json');
    const signaturePath = `${manifestPath}.sig`;
    const firstManifest = fs.readFileSync(manifestPath, 'utf8');
    const firstSignature = fs.readFileSync(signaturePath, 'utf8');
    assert.equal(JSON.parse(firstManifest).revision, 1);

    const second = runSigner(tempRoot);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.match(second.stdout, /Verified youtube-adblock-filters\.txt signature/);
    assert.equal(fs.readFileSync(manifestPath, 'utf8'), firstManifest);
    assert.equal(fs.readFileSync(signaturePath, 'utf8'), firstSignature);

    const refreshed = runSigner(tempRoot, '--refresh');
    assert.equal(refreshed.status, 0, refreshed.stderr || refreshed.stdout);
    assert.equal(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).revision, 2);
});
