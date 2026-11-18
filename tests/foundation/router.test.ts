import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRAND_TITLE, parseHash, productPath, routeTitle, sameRoute, surfaceOf } from '../../src/router.ts';

test('parses the static routes', () => {
  for (const h of ['', '#', '#/', '#//', '/', '#/home', '#/?x=1']) assert.deepEqual(parseHash(h), { name: 'home', path: '#/' }, h);
  assert.deepEqual(parseHash('#/about'), { name: 'about', path: '#/about' });
  assert.deepEqual(parseHash('#/about/'), { name: 'about', path: '#/about' });
  assert.deepEqual(parseHash('#/FAQ'), { name: 'faq', path: '#/faq' });
  assert.deepEqual(parseHash('collections'), { name: 'collections', path: '#/collections' });
});

test('parses product routes and normalises ids', () => {
  assert.deepEqual(parseHash('#/product/loam'), { name: 'product', path: '#/product/loam', productId: 'loam' });
  assert.deepEqual(parseHash('#/product/Loam/'), { name: 'product', path: '#/product/loam', productId: 'loam' });
  assert.deepEqual(parseHash('#/product/mass-and-volume-2'), { name: 'product', path: '#/product/mass-and-volume-2', productId: 'mass-and-volume-2' });
});

test('rejects unknown and malformed paths', () => {
  for (const h of ['#/nope', '#/product', '#/product/', '#/product/a/b', '#/product/%E0%A4%A', '#/product/<script>', '#/about/x', '#k-main']) {
    assert.equal(parseHash(h).name, 'notfound', h);
  }
});

test('productPath round-trips', () => {
  assert.equal(productPath('loam'), '#/product/loam');
  const r = parseHash(productPath('strata'));
  assert.equal(r.name, 'product');
  assert.equal(r.name === 'product' && r.productId, 'strata');
});

test('surfaces, titles and equality', () => {
  assert.equal(surfaceOf({ name: 'home', path: '#/' }), 'stage');
  assert.equal(surfaceOf({ name: 'product', path: '#/product/x', productId: 'x' }), 'stage');
  assert.equal(surfaceOf({ name: 'about', path: '#/about' }), 'page');
  assert.equal(BRAND_TITLE, 'KICCLE — FOOTWEAR ARCHIVE');
  assert.equal(routeTitle({ name: 'home', path: '#/' }), BRAND_TITLE);
  assert.equal(routeTitle({ name: 'faq', path: '#/faq' }), `FAQ | ${BRAND_TITLE}`);
  assert.equal(routeTitle({ name: 'product', path: '#/product/loam', productId: 'loam' }, 'Loam'), `Loam | ${BRAND_TITLE}`);
  assert.ok(sameRoute({ name: 'faq', path: '#/faq' }, { name: 'faq', path: '#/faq' }));
  assert.ok(!sameRoute(null, { name: 'faq', path: '#/faq' }));
});
