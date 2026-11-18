// KICCLE shoe-asset measurement (run with `npm run shoes`).
//
// The real pipeline (scripts/assets.mjs) needs `sharp`, which is not installed
// on every machine this project is worked on. This one needs nothing: it
// decodes the PNGs in public/shoes/ with Node's own zlib and measures the two
// numbers the scale maths needs from every sneaker —
//
//   visibleBox  bbox of pixels with alpha >= VISIBLE_ALPHA, as fractions
//   baseline    the sole line: the lowest row that still has a solid run of
//               pixels, as a fraction of the image height
//
// — then writes src/data/images.generated.ts. Nothing is resized, re-encoded or
// cropped: the full-resolution PNG the designer put in public/shoes/ is the
// file the browser loads, which is what keeps the camera close-up sharp.
//
// Add a sneaker by dropping its PNG in public/shoes/ and naming it in SHOES
// below; the file name on disk is the source of truth for the product name.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'public/shoes';
/** Below this alpha a pixel is haze, not shoe. Matches scripts/assets.mjs. */
const VISIBLE_ALPHA = 32;
const SOLID_ALPHA = 128;
/** A sole has to be at least this wide (fraction of the visible width) to count. */
const SOLE_RUN = 0.12;

/**
 * Showroom order. The key is the product id used in src/data/products.ts; the
 * file is the name on disk. Row one is the first five, row two the last five.
 */
export const SHOES = [
  { key: 'adora', file: 'KICCLE ADORA.png' },
  { key: 'aurel', file: 'KICCLE AUREL.png' },
  { key: 'cosmos', file: 'KICCLE COSMOS.png' },
  { key: 'crater', file: 'KICCLE CRATER.png' },
  { key: 'dorea', file: 'KICCLE DOREA.png' },
  { key: 'glacier', file: 'KICCLE GLACIER.png' },
  { key: 'neontrail', file: 'KICCLE Neon Trail Runner.png' },
  { key: 'ruston', file: 'KICCLE RUSTON.png' },
  { key: 'volt', file: 'KICCLE VOLT.png' },
  { key: 'zoomx', file: 'KICCLE ZOOMX.png' },
];

/** Minimal PNG reader: 8-bit, non-interlaced, colour type 2 (RGB) or 6 (RGBA). */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colour = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG is not supported');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || (colour !== 2 && colour !== 6)) {
    throw new Error(`unsupported PNG: depth ${depth}, colour type ${colour}`);
  }
  const channels = colour === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 255;
    }
  }
  return { width, height, channels, stride, data: out };
}

const round = (v) => Math.round(v * 100000) / 100000;

/**
 * Derive an alpha channel for a sneaker that was exported without one.
 *
 * A flat colour key is wrong here: these shoes have black soles and black
 * overlays, and keying "every dark pixel" punches holes through the product.
 * This floods inward from the border instead, so only background that is
 * actually CONNECTED to the edge is removed and anything enclosed by the shoe
 * survives. Edge pixels are feathered by luminance so the cut-out does not get
 * a hard dark fringe.
 *
 * It is a fallback, not a pipeline: a properly exported RGBA file is always
 * better, and measure() reports which files needed it.
 */
export function deriveAlpha(img, { cut = 26, keep = 64 } = {}) {
  const { width: w, height: h, channels, stride, data } = img;
  const lum = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * stride + x * channels;
      lum[y * w + x] = Math.max(data[i], data[i + 1], data[i + 2]);
    }
  }
  const bg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const push = (x, y) => {
    const k = y * w + x;
    if (bg[k] || lum[k] > cut) return;
    bg[k] = 1;
    queue[tail++] = k;
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (head < tail) {
    const k = queue[head++];
    const x = k % w;
    const y = (k / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  const out = Buffer.alloc(w * h * 4);
  for (let k = 0; k < w * h; k++) {
    const x = k % w;
    const y = (k / w) | 0;
    const i = y * stride + x * channels;
    out[k * 4] = data[i];
    out[k * 4 + 1] = data[i + 1];
    out[k * 4 + 2] = data[i + 2];
    if (bg[k]) {
      out[k * 4 + 3] = 0;
      continue;
    }
    // Feather: a kept pixel touching the background fades in with its own
    // brightness, which is what an anti-aliased edge against black looks like.
    let touches = false;
    if (x > 0 && bg[k - 1]) touches = true;
    else if (x < w - 1 && bg[k + 1]) touches = true;
    else if (y > 0 && bg[k - w]) touches = true;
    else if (y < h - 1 && bg[k + w]) touches = true;
    out[k * 4 + 3] = touches ? Math.min(255, Math.round((lum[k] / keep) * 255)) : 255;
  }
  return { width: w, height: h, channels: 4, stride: w * 4, data: out };
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length, 0);
  const tag = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, body])), 0);
  return Buffer.concat([len, tag, body, crc]);
}

/** Write an 8-bit RGBA PNG (filter 0 on every row). */
export function encodePng(img) {
  const { width: w, height: h, stride, data } = img;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}


/** visibleBox + baseline for one decoded image. */
export function measure(img) {
  const { width, height, channels, stride, data } = img;
  const alphaAt = (x, y) => (channels === 4 ? data[y * stride + x * 4 + 3] : 255);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alphaAt(x, y) >= VISIBLE_ALPHA) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('image is fully transparent');
  const visW = maxX - minX + 1;
  // The sole line: the lowest row carrying a solid horizontal run. Stray
  // semi-transparent shadow pixels below the shoe must not drag it down.
  const need = Math.max(8, Math.round(visW * SOLE_RUN));
  let baselineRow = maxY;
  for (let y = maxY; y >= minY; y--) {
    let run = 0;
    let best = 0;
    for (let x = minX; x <= maxX; x++) {
      run = alphaAt(x, y) >= SOLID_ALPHA ? run + 1 : 0;
      if (run > best) best = run;
    }
    if (best >= need) {
      baselineRow = y;
      break;
    }
  }
  return {
    width,
    height,
    visibleBox: {
      x: round(minX / width),
      y: round(minY / height),
      w: round(visW / width),
      h: round((maxY - minY + 1) / height),
    },
    baseline: round((baselineRow + 1) / height),
  };
}

/** Where a derived cut-out goes when the supplied file has no alpha. */
const DERIVED_DIR = 'assets/shoes';

function main() {
  const warnings = [];
  const entries = SHOES.map(({ key, file }) => {
    const path = `${DIR}/${file}`;
    let img = decodePng(readFileSync(resolve(ROOT, path)));
    // The src is relative to index.html and must survive in a URL.
    let src = `${DIR}/${encodeURIComponent(file)}`;
    let derivedFrom;
    if (img.channels !== 4) {
      // Supplied without an alpha channel: the shoe is baked onto a flat
      // background and would render as a box on the wall. Derive a cut-out
      // next to the project's other generated assets and leave the original
      // file in public/shoes/ untouched.
      img = deriveAlpha(img);
      mkdirSync(resolve(ROOT, DERIVED_DIR), { recursive: true });
      const out = `${DERIVED_DIR}/${key}.png`;
      writeFileSync(resolve(ROOT, out), encodePng(img));
      derivedFrom = path;
      src = out;
      warnings.push(`${key}: "${file}" has no alpha channel — cut-out derived into ${out}. Re-export it as transparent PNG for best quality.`);
    }
    const m = measure(img);
    console.log(
      `${key.padEnd(10)} ${String(m.width).padStart(5)}x${String(m.height).padEnd(5)}` +
        ` visible ${(m.visibleBox.w * 100).toFixed(1)}%x${(m.visibleBox.h * 100).toFixed(1)}%` +
        ` baseline ${(m.baseline * 100).toFixed(2)}%`,
    );
    return { key, src, derivedFrom, ...m };
  });

  const lines = entries.map(
    (e) =>
      `  ${e.key}: ${JSON.stringify({
        kind: 'photo',
        src: e.src,
        width: e.width,
        height: e.height,
        srcset: [],
        visibleBox: e.visibleBox,
        baseline: e.baseline,
        ...(e.derivedFrom ? { original: { src: e.derivedFrom, width: e.width, height: e.height } } : {}),
      })},`,
  );
  const out = `// GENERATED by scripts/shoes.mjs (npm run shoes). Do not edit by hand.
// Measured on the full-resolution PNGs in ${DIR}/ at alpha >= ${VISIBLE_ALPHA}.
//
// There is no srcset: each sneaker is ONE file, served at its native size, so
// the camera close-up can never land on a downscaled copy. The browser scales
// it down for the showroom, which costs nothing and stays sharp.
import type { ProductImage } from '../types.js';

export const IMAGES = {
${lines.join('\n')}
} as const satisfies Record<string, ProductImage>;

export type ImageKey = keyof typeof IMAGES;
`;
  writeFileSync(resolve(ROOT, 'src/data/images.generated.ts'), out);
  console.log(`\nwrote src/data/images.generated.ts (${entries.length} sneakers)`);
  for (const w of warnings) console.warn('WARNING  ' + w);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('shoes.mjs')) main();
