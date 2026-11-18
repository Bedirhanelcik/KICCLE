import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHOE_FRAME } from '../../src/data/frame.ts';
import {
  COLUMNS,
  LABEL_H,
  MAX_U,
  MIN_WALL_U,
  UNIT_RATIOS,
  cellOf,
  columnCenter,
  computeLayout,
  scrollForColumn,
  unitHeight,
} from '../../src/views/showroom/layout.ts';

const frame = { aspect: SHOE_FRAME.aspect, baseline: SHOE_FRAME.baseline };
const VIEWPORTS = [
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
  [1280, 640],
  [1280, 560],
  [1080, 720],
  [768, 1024],
  [390, 844],
  [360, 740],
  [360, 560],
] as const;
const navFor = (vw: number) => (vw < 760 ? 60 : 72);

test('wide screens use the wall (two rows of five), narrow screens pan', () => {
  assert.equal(computeLayout({ vw: 1440, vh: 900, navH: 72, ...frame }).mode, 'wall');
  assert.equal(computeLayout({ vw: 1920, vh: 1080, navH: 72, ...frame }).mode, 'wall');
  assert.equal(computeLayout({ vw: 1280, vh: 640, navH: 72, ...frame }).mode, 'wall');
  assert.equal(computeLayout({ vw: 390, vh: 844, navH: 60, ...frame }).mode, 'pan');
  assert.equal(computeLayout({ vw: 360, vh: 740, navH: 60, ...frame }).mode, 'pan');
});

for (const [vw, vh] of VIEWPORTS) {
  test(`layout ${vw}x${vh}: fits below the nav, inside the viewport, rows ordered`, () => {
    const navH = navFor(vw);
    const l = computeLayout({ vw, vh, navH, ...frame });
    assert.ok(l.u > 0 && l.u <= MAX_U, `u ${l.u}`);
    if (l.mode === 'wall') {
      assert.ok(l.u >= Math.min(MIN_WALL_U, l.u), 'wall u');
      // whole grid inside the viewport horizontally
      const gridW = COLUMNS * l.u + (COLUMNS - 1) * l.gx;
      assert.ok(l.gridX >= 0 && l.gridX + gridW <= vw + 0.01, `grid ${l.gridX}+${gridW} > ${vw}`);
      assert.equal(l.wallW, vw);
    } else {
      // first and last columns can be centred
      assert.ok(Math.abs(columnCenter(l, 0) - vw / 2) < 0.6);
      assert.ok(Math.abs(columnCenter(l, COLUMNS - 1) - (l.wallW - vw / 2)) < 0.6);
    }
    assert.ok(l.rowY[0] > l.lensY, 'row 1 below the spot heads');
    assert.ok(l.lensY > l.trackY && l.trackY > navH, 'track below the nav');
    assert.ok(l.rowY[1] >= l.rowY[0] + l.unitH, 'rows do not overlap');
    assert.ok(l.rowY[1] + l.unitH <= vh, `row 2 bottom ${l.rowY[1] + l.unitH} > ${vh}`);
    assert.ok(l.horizonY > l.rowY[1] + l.unitH - 0.01, 'horizon below row 2');
    assert.ok(l.coneHalfDeg > 3 && l.coneHalfDeg < 45, `cone ${l.coneHalfDeg}`);
  });
}

test('unit anatomy: sole line and plinth from the shared frame', () => {
  const l = computeLayout({ vw: 1440, vh: 900, navH: 72, ...frame });
  assert.ok(Math.abs(l.figH - l.u / SHOE_FRAME.aspect) < 0.01);
  assert.ok(Math.abs(l.soleY - l.figH * SHOE_FRAME.baseline) < 0.01);
  const plinthBottom = l.soleY + l.u * (UNIT_RATIOS.topFace + UNIT_RATIOS.slab);
  assert.ok(Math.abs(l.unitH - (Math.max(l.figH, plinthBottom) + LABEL_H)) < 0.01);
  assert.ok(Math.abs(unitHeight(l.u, frame.aspect, frame.baseline) - l.unitH) < 0.01);
});

test('every unit has the same width (identical perceived shoe size)', () => {
  // One u per layout by construction; check the grid maths places 5 equal columns.
  const l = computeLayout({ vw: 1440, vh: 900, navH: 72, ...frame });
  const centers = Array.from({ length: COLUMNS }, (_, c) => columnCenter(l, c));
  const steps = centers.slice(1).map((c, i) => c - centers[i]!);
  for (const s of steps) assert.ok(Math.abs(s - (l.u + l.gx)) < 1e-9);
});

test('short wide screens spread the bays instead of shrinking below the height budget', () => {
  // 1280x560 used to be the short case. With the labels out of the unit box,
  // the tiers packed tight and the group standing further back, two full rows
  // now fit there on width alone, so the height budget only binds lower down.
  const tall = computeLayout({ vw: 1280, vh: 1000, navH: 72, ...frame });
  const short = computeLayout({ vw: 1280, vh: 440, navH: 72, ...frame });
  assert.ok(short.u < tall.u);
  assert.ok(short.gx > tall.gx);
});

test('cellOf maps showroom order to 2 rows of 5', () => {
  assert.deepEqual(cellOf(0), { col: 0, row: 0 });
  assert.deepEqual(cellOf(4), { col: 4, row: 0 });
  assert.deepEqual(cellOf(5), { col: 0, row: 1 });
  assert.deepEqual(cellOf(9), { col: 4, row: 1 });
});

test('scrollForColumn is clamped to the pan range', () => {
  const l = computeLayout({ vw: 390, vh: 844, navH: 60, ...frame });
  assert.equal(scrollForColumn(l, 0, 390), 0);
  assert.ok(Math.abs(scrollForColumn(l, COLUMNS - 1, 390) - (l.wallW - 390)) < 0.6);
  assert.ok(scrollForColumn(l, 2, 390) > 0);
});
