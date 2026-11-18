import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS } from '../../src/data/products.ts';
import { SHOE_FRAME } from '../../src/data/frame.ts';
import { baselineInFrame, computeFrame, placeShoe, visibleBoxInFrame, type ShoeMetrics } from '../../src/lib/scale.ts';

test('all 10 products share the same perceived (visible) width within ±2%', () => {
  const widths = PRODUCTS.map((p) => visibleBoxInFrame(p.image, SHOE_FRAME).w);
  const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
  for (const [i, w] of widths.entries()) {
    assert.ok(Math.abs(w - mean) / mean <= 0.02, `${PRODUCTS[i]!.id} visible width ${w} vs mean ${mean}`);
    assert.ok(Math.abs(w - SHOE_FRAME.contentWidth) < 1e-4, `${PRODUCTS[i]!.id} not at contentWidth`);
  }
});

test('all soles rest on one common baseline', () => {
  for (const p of PRODUCTS) {
    const b = baselineInFrame(p.image, SHOE_FRAME);
    assert.ok(Math.abs(b - SHOE_FRAME.baseline) < 1e-4, `${p.id} baseline ${b} != ${SHOE_FRAME.baseline}`);
  }
});

test('every visible shoe fits inside the frame and is horizontally centred', () => {
  for (const p of PRODUCTS) {
    const v = visibleBoxInFrame(p.image, SHOE_FRAME);
    assert.ok(v.x >= -1e-6 && v.x + v.w <= 1 + 1e-6, `${p.id} overflows horizontally`);
    assert.ok(v.y >= -1e-6 && v.y + v.h <= 1 + 1e-6, `${p.id} overflows vertically (${v.y}, ${v.h})`);
    assert.ok(Math.abs(v.x + v.w / 2 - 0.5) < 1e-4, `${p.id} not centred`);
  }
});

test('placement keeps the image aspect ratio (no distortion)', () => {
  for (const p of PRODUCTS) {
    const pl = placeShoe(p.image, SHOE_FRAME);
    const renderedAspect = (pl.width * SHOE_FRAME.aspect) / pl.height; // frame-width units / frame-width units
    const imageAspect = p.image.width / p.image.height;
    assert.ok(Math.abs(renderedAspect - imageAspect) / imageAspect < 1e-4, `${p.id} distorted`);
  }
});

test('computeFrame handles tall, offset and hanging images (synthetic)', () => {
  const tall: ShoeMetrics = { width: 1000, height: 800, visibleBox: { x: 0.1, y: 0.05, w: 0.8, h: 0.9 }, baseline: 0.95 };
  const flat: ShoeMetrics = { width: 1000, height: 250, visibleBox: { x: 0, y: 0, w: 1, h: 1 }, baseline: 0.9 }; // 10% below baseline
  const frame = computeFrame([tall, flat], { contentWidth: 0.8, headroom: 0.02, footroom: 0.02 });
  for (const m of [tall, flat]) {
    const v = visibleBoxInFrame(m, frame);
    assert.ok(Math.abs(v.w - 0.8) < 1e-6);
    assert.ok(v.y >= -1e-6 && v.y + v.h <= 1 + 1e-6, 'fits vertically');
    assert.ok(Math.abs(baselineInFrame(m, frame) - frame.baseline) < 1e-6);
  }
  assert.throws(() => computeFrame([]));
});

test('frame is sane for the showroom', () => {
  assert.ok(SHOE_FRAME.aspect > 1.4 && SHOE_FRAME.aspect < 3.2, `aspect ${SHOE_FRAME.aspect}`);
  assert.ok(SHOE_FRAME.baseline > 0.8 && SHOE_FRAME.baseline < 1, `baseline ${SHOE_FRAME.baseline}`);
});
