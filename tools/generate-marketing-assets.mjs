// Generates the install icons and repository artwork from the approved source
// mark. Runs headless, uses no remote fonts or network resources, and keeps all
// shipped sizes reproducible.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(repoRoot, 'assets', 'youtube-adblock-mark-source.png');
const sourceUrl = `data:image/png;base64,${fs.readFileSync(sourcePath).toString('base64')}`;

const browser = await chromium.launch({
    headless: true,
    args: ['--disable-background-networking', '--no-first-run'],
});
const page = await browser.newPage();

const alphaBounds = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width;
    let top = canvas.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
            if (pixels[((y * canvas.width) + x) * 4 + 3] < 8) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
        }
    }
    if (right < left || bottom < top) throw new Error('source mark has no visible pixels');
    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}, sourceUrl);

async function renderIcon(size, target) {
    const base64 = await page.evaluate(async ({ src, bounds, outputSize }) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = outputSize;
        canvas.height = outputSize;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        const padding = Math.max(1, Math.round(outputSize * 0.055));
        const scale = Math.min(
            (outputSize - (padding * 2)) / bounds.width,
            (outputSize - (padding * 2)) / bounds.height
        );
        const width = bounds.width * scale;
        const height = bounds.height * scale;
        context.drawImage(
            image,
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
            (outputSize - width) / 2,
            (outputSize - height) / 2,
            width,
            height
        );
        return canvas.toDataURL('image/png').split(',', 2)[1];
    }, { src: sourceUrl, bounds: alphaBounds, outputSize: size });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(base64, 'base64'));
    console.log(`Wrote ${path.relative(repoRoot, target)}`);
}

function artworkMarkup(width, height, social = false) {
    const scale = social ? 1.18 : 1;
    return `<!doctype html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}
body{font-family:"Segoe UI Variable Display","Segoe UI",Arial,sans-serif;background:#07100f;color:#f7fbfa}
.card{position:relative;width:100%;height:100%;overflow:hidden;background:
radial-gradient(circle at 82% 18%,rgba(108,240,196,.18),transparent 28%),
radial-gradient(circle at 18% 98%,rgba(255,97,91,.16),transparent 36%),
linear-gradient(135deg,#07100f 0%,#0b1917 54%,#102522 100%)}
.grid{position:absolute;inset:0;opacity:.16;background-image:linear-gradient(rgba(150,255,220,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(150,255,220,.12) 1px,transparent 1px);background-size:38px 38px;mask-image:linear-gradient(90deg,#000,transparent 74%)}
.edge{position:absolute;inset:0;border:${social ? 3 : 2}px solid rgba(134,255,216,.22)}
.copy{position:absolute;left:${social ? 74 : 68}px;top:50%;width:${social ? 750 : 930}px;transform:translateY(-50%);z-index:2}
.eyebrow{display:flex;align-items:center;gap:14px;margin-bottom:${social ? 22 : 14}px;color:#8cf4d3;font-size:${Math.round(18 * scale)}px;font-weight:760;letter-spacing:.18em;text-transform:uppercase}
.eyebrow:before{content:"";width:${social ? 48 : 40}px;height:3px;border-radius:9px;background:#ff675f;box-shadow:0 0 22px rgba(255,103,95,.45)}
h1{margin:0;font-size:${Math.round((social ? 64 : 56) * scale)}px;line-height:.98;letter-spacing:-.052em;font-weight:790;max-width:${social ? 720 : 900}px}
h1 span{color:#ff7169}
.sub{margin:${social ? 27 : 18}px 0 0;max-width:${social ? 680 : 860}px;color:#c5d8d3;font-size:${Math.round((social ? 23 : 20) * scale)}px;line-height:1.36;font-weight:450}
.pills{display:flex;gap:10px;flex-wrap:wrap;margin-top:${social ? 29 : 20}px}
.pill{padding:${social ? '10px 14px' : '8px 12px'};border:1px solid rgba(140,244,211,.29);border-radius:999px;background:rgba(9,26,23,.72);color:#bff7e5;font-size:${Math.round((social ? 13 : 12) * scale)}px;font-weight:700;letter-spacing:.095em}
.mark-wrap{position:absolute;right:${social ? 66 : 58}px;top:50%;width:${social ? 360 : 318}px;height:${social ? 360 : 318}px;transform:translateY(-50%);display:grid;place-items:center;z-index:2}
.halo{position:absolute;width:94%;height:94%;border-radius:50%;background:radial-gradient(circle,rgba(108,240,196,.18),rgba(108,240,196,.03) 54%,transparent 72%);filter:blur(3px)}
.mark{position:relative;width:94%;height:94%;object-fit:contain;filter:drop-shadow(0 24px 36px rgba(0,0,0,.5))}
</style></head><body><main class="card"><div class="grid"></div><div class="copy">
<div class="eyebrow">YoutubeAdblock</div>
<h1>Keep the video.<br><span>Cut the interruptions.</span></h1>
<p class="sub">Local blocking with signed rules. Every decision stays visible in the Control Center.</p>
<div class="pills"><span class="pill">LOCAL FIRST</span><span class="pill">SIGNED RULES</span><span class="pill">MV3 + USERSCRIPT</span><span class="pill">V0.8.1</span></div>
</div><div class="mark-wrap"><div class="halo"></div><img class="mark" src="${sourceUrl}" alt=""></div><div class="edge"></div></main></body></html>`;
}

async function renderArtwork(width, height, target, social = false) {
    await page.setViewportSize({ width, height });
    await page.setContent(artworkMarkup(width, height, social), { waitUntil: 'load' });
    await page.locator('.mark').evaluate(image => image.decode());
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await page.screenshot({ path: target });
    console.log(`Wrote ${path.relative(repoRoot, target)}`);
}

await renderIcon(1024, path.join(repoRoot, 'icon.png'));
for (const size of [16, 32, 48, 128]) {
    await renderIcon(size, path.join(repoRoot, 'extension', 'icons', `icon${size}.png`));
}
await renderArtwork(1536, 448, path.join(repoRoot, 'banner.png'));
await renderArtwork(1280, 640, path.join(repoRoot, '.github', 'social-preview.png'), true);

await browser.close();
