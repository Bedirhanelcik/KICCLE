import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, SHOWROOM_ORDER, getProduct, isProductId } from '../../src/data/products.ts';
import { COLLECTIONS, getCollection } from '../../src/data/collections.ts';
import { read, walk } from './helpers.ts';

test('exactly 10 products with unique slug ids and indexes 01–10 in order', () => {
  assert.equal(PRODUCTS.length, 10);
  assert.equal(new Set(PRODUCTS.map((p) => p.id)).size, 10);
  PRODUCTS.forEach((p, i) => {
    assert.match(p.id, /^[a-z0-9][a-z0-9-]*$/);
    assert.equal(p.index, String(i + 1).padStart(2, '0'));
    assert.equal(getProduct(p.id), p);
    assert.ok(isProductId(p.id));
  });
  assert.equal(getProduct('nope'), undefined);
});

test('no price-like fields anywhere in the data (exhibition only)', () => {
  const banned = /price|cost|currency|amount|msrp|sale|discount/i;
  const visit = (v: unknown, path: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        assert.doesNotMatch(k, banned, `price-like key at ${path}.${k}`);
        visit(x, `${path}.${k}`);
      }
    } else if (typeof v === 'string') {
      assert.doesNotMatch(v, /[$€£¥]\s?\d/, `currency amount in ${path}`);
    }
  };
  visit(PRODUCTS, 'PRODUCTS');
  visit(COLLECTIONS, 'COLLECTIONS');
  // and nowhere in the shared contracts
  assert.doesNotMatch(read('src/types.ts').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''), /price/i);
});

test('every product has complete copy, materials, characteristics and EU sizes', () => {
  for (const p of PRODUCTS) {
    for (const k of ['name', 'tagline', 'description', 'colorway', 'alt'] as const) assert.ok(p[k].trim().length > 0, `${p.id}.${k}`);
    assert.ok(p.tagline.length <= 60, `${p.id} tagline too long`);
    assert.ok(p.materials.length >= 3);
    assert.ok(p.characteristics.length >= 3);
    assert.ok(p.characteristics.every((c) => c.label && c.value));
    assert.ok(p.sizes.length >= 6);
    assert.ok(p.sizes.every((s) => s.eu >= 35 && s.eu <= 50));
    assert.ok(p.sizes.some((s) => s.available), `${p.id} has no available size`);
    assert.ok(p.sizes.some((s) => !s.available), `${p.id} should show at least one unavailable size`);
    assert.match(p.alt, /right side profile/);
  }
});

test('every product is a full-resolution photograph from public/shoes/', () => {
  for (const p of PRODUCTS) {
    assert.equal(p.isPlaceholder, false, `${p.id} is still a placeholder`);
    assert.equal(p.image.kind, 'photo');
    // One file per sneaker at its native size: no srcset, so the camera
    // close-up can never land on a downscaled copy (see scripts/shoes.mjs).
    assert.equal(p.image.srcset.length, 0, `${p.id} has a srcset`);
    assert.match(p.image.src, /^(public\/shoes\/|assets\/shoes\/)/, `${p.id}: ${p.image.src}`);
    assert.ok(p.image.width >= 1200, `${p.id} source is only ${p.image.width}px wide`);
    assert.ok(p.image.height > 0);
  }
});

test('measured image metrics are sane fractions', () => {
  for (const p of PRODUCTS) {
    const b = p.image.visibleBox;
    for (const [k, v] of Object.entries(b)) assert.ok(v >= 0 && v <= 1, `${p.id}.visibleBox.${k} = ${v}`);
    assert.ok(b.x + b.w <= 1.0001, `${p.id} visible box runs off the right edge`);
    assert.ok(b.y + b.h <= 1.0001, `${p.id} visible box runs off the bottom edge`);
    assert.ok(b.w > 0.4, `${p.id} visible width ${b.w} — background probably not transparent`);
    assert.ok(p.image.baseline > b.y && p.image.baseline <= 1.0001, `${p.id} baseline ${p.image.baseline}`);
  }
});

test('image URLs are relative', () => {
  for (const p of PRODUCTS) {
    for (const src of [p.image.src, ...p.image.srcset.map((s) => s.src)]) {
      assert.doesNotMatch(src, /^(\/|[a-z]+:)/i, `${p.id}: ${src}`);
    }
  }
});

test('3–4 collections cover every product exactly once', () => {
  assert.ok(COLLECTIONS.length >= 3 && COLLECTIONS.length <= 4);
  const seen = new Map<string, string>();
  for (const c of COLLECTIONS) {
    assert.ok(c.name && c.description);
    assert.equal(getCollection(c.id), c);
    for (const id of c.productIds) {
      assert.ok(!seen.has(id), `${id} in two collections`);
      seen.set(id, c.id);
    }
  }
  for (const p of PRODUCTS) assert.equal(seen.get(p.id), p.collectionId, `${p.id} not in its collection`);
});

test('no "Commerce" wording and no prices in shipped source or markup', () => {
  const files = ['index.html', ...walk('src', (f) => /\.(ts|css)$/.test(f))];
  for (const f of files) {
    const text = read(f);
    assert.doesNotMatch(text, /\bcommerce\b/i, `${f} mentions commerce`);
    assert.doesNotMatch(text, /[$€£]\s?\d/, `${f} shows a price`);
  }
});

test('SHOWROOM_ORDER is the single source of showroom position', () => {
  // The ordering list is the contract: PRODUCTS is exactly it, in order, and
  // every id in it is a real catalog entry used exactly once.
  assert.equal(SHOWROOM_ORDER.length, 10);
  assert.equal(new Set(SHOWROOM_ORDER).size, 10);
  assert.deepEqual(
    PRODUCTS.map((p) => p.id),
    [...SHOWROOM_ORDER],
  );
  for (const id of SHOWROOM_ORDER) assert.ok(getProduct(id), `${id} is not in the catalog`);
  // Row assignment is derived, never hand-written: first five up, last five down.
  PRODUCTS.forEach((p, i) => assert.equal(p.index, String(i + 1).padStart(2, '0')));
});

test('products are addressed by stable id, never by array position', () => {
  // Reordering must not change a product's identity, only where it stands.
  const reordered = [...PRODUCTS].reverse();
  for (const p of reordered) assert.equal(getProduct(p.id), p);
});
