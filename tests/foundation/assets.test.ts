import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { IMAGES } from '../../src/data/images.generated.ts';
import { PRODUCTS } from '../../src/data/products.ts';
import { ROOT } from './helpers.ts';

/**
 * The sneakers are the ten PNGs the designer put in public/shoes/. Each one is
 * served at its native size — there is no resize step and no srcset — so the
 * camera close-up can never land on a downscaled copy. scripts/shoes.mjs
 * measures them and writes src/data/images.generated.ts.
 *
 * A file exported WITHOUT an alpha channel gets a cut-out derived into
 * assets/shoes/, and `original` records which supplied file it came from.
 */

/** PNG header: size, colour type, and therefore whether it carries alpha. */
function pngInfo(path: string): { width: number; height: number; colour: number; alpha: boolean } {
  const b = readFileSync(path);
  assert.equal(b.readUInt32BE(0), 0x89504e47, `${path} is not a PNG`);
  const colour = b[25]!;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colour, alpha: colour === 4 || colour === 6 };
}

test('every sneaker image exists and is a full-resolution PNG with alpha', () => {
  for (const [id, img] of Object.entries(IMAGES)) {
    const path = join(ROOT, decodeURIComponent(img.src));
    assert.ok(existsSync(path), `${id}: ${img.src} missing`);
    const info = pngInfo(path);
    assert.equal(info.width, img.width, `${id} width`);
    assert.equal(info.height, img.height, `${id} height`);
    assert.ok(info.alpha, `${id} has no alpha channel — it would render as a box on the wall`);
    // Landscape, right-facing profile: never rotated to portrait.
    assert.ok(info.width > info.height, `${id} is not landscape`);
    // Big enough that the ~3.4x camera close-up still has pixels to show.
    assert.ok(info.width >= 1200, `${id} is only ${info.width}px wide`);
  }
});

test('a derived cut-out records the file it was derived from', () => {
  for (const [id, img] of Object.entries(IMAGES)) {
    const derived = img.src.startsWith('assets/shoes/');
    assert.equal(
      derived,
      'original' in img && !!img.original,
      `${id}: derived cut-outs must record their source, supplied files must not`,
    );
    if (!img.original) continue;
    const src = join(ROOT, decodeURIComponent(img.original.src));
    assert.ok(existsSync(src), `${id}: original ${img.original.src} missing`);
    assert.ok(img.original.src.startsWith('public/shoes/'), `${id}: original should be the supplied file`);
    // Same canvas: the cut-out only adds alpha, it never crops or resizes.
    const a = pngInfo(src);
    assert.equal(a.width, img.width, `${id} derived width drifted`);
    assert.equal(a.height, img.height, `${id} derived height drifted`);
  }
});

test('every product points at one of the measured images, and all ten are used', () => {
  const used = new Set<string>();
  for (const p of PRODUCTS) {
    const match = Object.entries(IMAGES).find(([, img]) => img.src === p.image.src);
    assert.ok(match, `${p.id}: ${p.image.src} is not in images.generated.ts`);
    assert.ok(!used.has(match![0]), `${match![0]} used by two products`);
    used.add(match![0]);
  }
  assert.equal(used.size, Object.keys(IMAGES).length, 'every measured image should be on the wall');
});

test('generated image metadata is consistent', () => {
  for (const [id, img] of Object.entries(IMAGES)) {
    const v = img.visibleBox;
    assert.ok(v.x >= 0 && v.y >= 0 && v.x + v.w <= 1.00001 && v.y + v.h <= 1.00001, `${id} visibleBox out of range`);
    assert.ok(img.baseline > v.y && img.baseline <= v.y + v.h + 1e-6, `${id} baseline outside visible box`);
    assert.equal(img.srcset.length, 0, `${id} has a srcset; the close-up must use the native file`);
    assert.equal(img.kind, 'photo');
  }
});

test('image sources are relative and url-safe', () => {
  for (const img of Object.values(IMAGES)) {
    assert.doesNotMatch(img.src, /^(\/|[a-z]+:)/i, img.src);
    // Names with spaces have to survive being put in a URL and in CSS url().
    assert.doesNotMatch(img.src, /[ "']/, `${img.src} is not url-safe`);
  }
});

test('the measuring tool is dependency-free and reads only public/shoes', () => {
  const file = readFileSync(join(ROOT, 'scripts/shoes.mjs'), 'utf8');
  // Only the real import block: the file also EMITS an `import type ...` line
  // inside the template literal it writes into src/data/images.generated.ts.
  const tool = file.slice(0, file.indexOf('const ROOT'));
  for (const m of tool.matchAll(/^import .* from '([^']+)'/gm)) {
    assert.match(m[1]!, /^node:/, `scripts/shoes.mjs imports ${m[1]} — it must need nothing installed`);
  }
  assert.ok(statSync(join(ROOT, 'public/shoes')).isDirectory());
});
