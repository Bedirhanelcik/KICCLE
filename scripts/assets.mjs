// KICCLE asset pipeline (run with `npm run assets`; needs `sharp` on NODE_PATH).
//
// 1. Copies the three uploaded photographs byte-for-byte to assets/original/
//    and verifies sha256 (source, if present, must equal copy).
// 2. Builds display copies for the photos: crop to the bbox of every pixel with
//    alpha >= 1 (so no visible pixel is ever removed), then resize to 1600w and
//    800w WebP with alpha. Crop + uniform resize only: no rotation, flip, colour
//    change or regeneration. Output aspect equals the crop bbox aspect (±1px
//    rounding of the height, recorded in the manifest).
// 3. Generates the seven original placeholder SVGs (scripts/placeholders.mjs),
//    rasterises them, and rewrites each viewBox to the measured tight bbox.
// 4. Measures for every image: visible box (alpha >= VISIBLE_ALPHA) as fractions
//    of the image, and the sole baseline (lowest row with a solid run of
//    pixels), then writes assets/products/manifest.json and the typed module
//    src/data/images.generated.ts consumed by src/data/products.ts.

import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePlaceholders } from './placeholders.mjs';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('sharp not found. Run via `npm run assets` (sets NODE_PATH to the global modules dir).');
  process.exit(1);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UPLOADS = '/mnt/user-data/uploads';
const VISIBLE_ALPHA = 32; // pixels below this alpha are treated as invisible haze for scale maths
const SOLID_ALPHA = 128;
const DISPLAY_WIDTHS = [1600, 800];

export const PHOTOS = [
  { id: 'a1', upload: '831e1cec-image.png', label: 'A1 tan/olive' },
  { id: 'a2', upload: '92adb170-image.png', label: 'A2 green' },
  { id: 'a3', upload: '04c22552-image.png', label: 'A3 green with neon' },
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const round = (v, d = 5) => Math.round(v * 10 ** d) / 10 ** d;

async function rawAlpha(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function bbox(img, threshold) {
  const { data, width: W, height: H, channels: C } = img;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * C + 3] >= threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('image is fully transparent');
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Lowest row (exclusive bottom edge, px) holding a solid run of sole pixels. */
function soleBaseline(img, box) {
  const { data, width: W, channels: C } = img;
  const need = Math.max(3, Math.round(box.w * 0.015));
  for (let y = box.y + box.h - 1; y >= box.y; y--) {
    let count = 0;
    for (let x = box.x; x < box.x + box.w; x++) if (data[(y * W + x) * C + 3] >= SOLID_ALPHA) count++;
    if (count >= need) return y + 1;
  }
  return box.y + box.h;
}

function measure(img) {
  const vis = bbox(img, VISIBLE_ALPHA);
  const base = soleBaseline(img, vis);
  return {
    visibleBox: {
      x: round(vis.x / img.width),
      y: round(vis.y / img.height),
      // edges rounded first so x + w / y + h land exactly on the rounded far edge
      w: round(round((vis.x + vis.w) / img.width) - round(vis.x / img.width)),
      h: round(round((vis.y + vis.h) / img.height) - round(vis.y / img.height)),
    },
    baseline: round(base / img.height),
    visiblePx: vis,
  };
}

async function processPhoto(p) {
  const origDir = join(ROOT, 'assets/original');
  const outDir = join(ROOT, 'assets/products');
  mkdirSync(origDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const dest = join(origDir, `${p.id}.png`);
  const src = join(UPLOADS, p.upload);
  if (existsSync(src)) {
    copyFileSync(src, dest);
    const a = sha256(readFileSync(src));
    const b = sha256(readFileSync(dest));
    if (a !== b) throw new Error(`hash mismatch after copy for ${p.id}`);
  } else if (!existsSync(dest)) {
    throw new Error(`missing original ${p.id}: neither ${src} nor ${dest} exists`);
  }
  const origBuf = readFileSync(dest);
  const hash = sha256(origBuf);
  const full = await rawAlpha(origBuf);
  const crop = bbox(full, 1); // every non-transparent pixel kept

  const variants = [];
  for (const w of DISPLAY_WIDTHS) {
    const width = Math.min(w, crop.w);
    const height = Math.round((crop.h * width) / crop.w);
    const file = `${p.id}-${width}.webp`;
    await sharp(origBuf)
      .extract({ left: crop.x, top: crop.y, width: crop.w, height: crop.h })
      .resize({ width, height, fit: 'fill', kernel: 'lanczos3' })
      .webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true })
      .toFile(join(outDir, file));
    variants.push({ src: `assets/products/${file}`, width, height, bytes: statSync(join(outDir, file)).size });
  }
  // Measure on the largest display copy (what the browser actually paints).
  const largest = variants[0];
  const m = measure(await rawAlpha(join(ROOT, largest.src)));
  return {
    id: p.id,
    kind: 'photo',
    src: largest.src,
    width: largest.width,
    height: largest.height,
    srcset: variants.map(({ src, width }) => ({ src, width })),
    visibleBox: m.visibleBox,
    baseline: m.baseline,
    original: {
      src: `assets/original/${p.id}.png`,
      upload: p.upload,
      sha256: hash,
      width: full.width,
      height: full.height,
      cropBox: crop,
      cropAspect: round(crop.w / crop.h, 6),
    },
    variants,
  };
}

async function processPlaceholder({ id, file }) {
  let svg = readFileSync(file, 'utf8');
  const vb = svg.match(/viewBox="([\d.\s-]+)"/)[1].split(/\s+/).map(Number);
  const scale = 2; // rasterise at 2 px per SVG unit for measurement
  const raster = async (text) => rawAlpha(await sharp(Buffer.from(text), { density: 72 * scale }).png().toBuffer());
  const img = await raster(svg);
  // svg width attr == viewBox width, so 1 unit == `scale` px
  const b = bbox(img, 1);
  const pad = 0.5; // half a unit of air so anti-aliased edges never clip
  const tight = [
    round(vb[0] + b.x / scale - pad, 2),
    round(vb[1] + b.y / scale - pad, 2),
    round(b.w / scale + 2 * pad, 2),
    round(b.h / scale + 2 * pad, 2),
  ];
  const [W, H] = [tight[2], tight[3]];
  svg = svg
    .replace(/viewBox="[^"]+"/, `viewBox="${tight.join(' ')}"`)
    .replace(/ width="[\d.]+" height="[\d.]+"/, ` width="${W}" height="${H}"`);
  writeFileSync(file, svg);
  const m = measure(await raster(svg));
  return {
    id,
    kind: 'placeholder',
    src: `assets/placeholders/${id}.svg`,
    width: W,
    height: H,
    srcset: [],
    visibleBox: m.visibleBox,
    baseline: m.baseline,
    viewBox: tight,
  };
}

async function main() {
  const entries = [];
  for (const p of PHOTOS) {
    const e = await processPhoto(p);
    entries.push(e);
    console.log(`${p.id}: sha256 ${e.original.sha256} crop ${e.original.cropBox.w}x${e.original.cropBox.h} -> ${e.variants.map((v) => `${v.width}x${v.height} (${(v.bytes / 1024).toFixed(0)}KB)`).join(', ')}`);
  }
  for (const f of writePlaceholders(join(ROOT, 'assets/placeholders'))) {
    const e = await processPlaceholder(f);
    entries.push(e);
    console.log(`${f.id}: ${e.width}x${e.height} viewBox ${e.viewBox.join(' ')}`);
  }
  for (const e of entries) {
    console.log(`  ${e.id} visible ${JSON.stringify(e.visibleBox)} baseline ${e.baseline}`);
  }

  const manifest = { generatedBy: 'scripts/assets.mjs', visibleAlpha: VISIBLE_ALPHA, images: entries };
  writeFileSync(join(ROOT, 'assets/products/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const ts = `// GENERATED by scripts/assets.mjs (npm run assets). Do not edit by hand.
// Visible box / baseline measured at alpha >= ${VISIBLE_ALPHA} on the served file.
import type { ProductImage } from '../types.js';

export const IMAGES = {
${entries
  .map((e) => {
    const img = {
      kind: e.kind,
      src: e.src,
      width: e.width,
      height: e.height,
      srcset: e.srcset,
      visibleBox: e.visibleBox,
      baseline: e.baseline,
      ...(e.original ? { original: { src: e.original.src, sha256: e.original.sha256, width: e.original.width, height: e.original.height } } : {}),
    };
    return `  ${e.id}: ${JSON.stringify(img)},`;
  })
  .join('\n')}
} as const satisfies Record<string, ProductImage>;

export type ImageKey = keyof typeof IMAGES;
`;
  writeFileSync(join(ROOT, 'src/data/images.generated.ts'), ts);
  console.log('wrote assets/products/manifest.json and src/data/images.generated.ts');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
