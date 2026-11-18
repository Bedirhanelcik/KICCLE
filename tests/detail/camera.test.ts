import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS } from '../../src/data/products.ts';
import { SHOE_FRAME } from '../../src/data/frame.ts';
import { visibleBoxInFrame } from '../../src/lib/scale.ts';
import { EASE } from '../../src/lib/motion.ts';
import {
  IDENTITY,
  anchorOf,
  computeLayout,
  sceneAnchor,
  toScene,
  computeTarget,
  cubicBezier,
  dollyAt,
  dollyKeyframes,
  easingFromCss,
  mapRect,
  parseMatrix,
  isIdentity,
  remainingFraction,
  toCss,
  type RectLike,
  type ShoeGeometry,
} from '../../src/views/detail/camera.ts';

const VIEWPORTS: [number, number][] = [
  [1440, 900],
  [1920, 1080],
  [1280, 640],
  [768, 1024],
  [390, 844],
  [360, 740],
  [760, 500],
  [759, 900],
];
const navH = (vw: number) => (vw < 760 ? 60 : 72);
const maxShoe = (vw: number) => (vw <= 760 ? vw * 0.92 : vw * 0.5) * SHOE_FRAME.contentWidth;

const geo = (i: number): ShoeGeometry => ({
  visibleBox: visibleBoxInFrame(PRODUCTS[i]!.image, SHOE_FRAME),
  aspect: SHOE_FRAME.aspect,
  baseline: SHOE_FRAME.baseline,
});

/** A unit at (left, top) of width w: shoe figure on top, a platform below it. */
function unitAt(i: number, left: number, top: number, w: number, platform = 0.12): { rest: RectLike; shoe: RectLike } {
  const figH = w / SHOE_FRAME.aspect;
  const rest = { left, top, width: w, height: figH + w * platform };
  const vb = visibleBoxInFrame(PRODUCTS[i]!.image, SHOE_FRAME);
  const shoe = { left: left + vb.x * w, top: top + vb.y * figH, width: vb.w * w, height: vb.h * figH };
  return { rest, shoe };
}

const near = (a: number, b: number, eps: number, msg: string) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

test('layout: side panel on the right at >= 760px, sheet below the shoe under 760px', () => {
  for (const [vw, vh] of VIEWPORTS) {
    const l = computeLayout(vw, vh, navH(vw));
    if (vw >= 760) {
      assert.equal(l.mode, 'side');
      near(l.panel.left + l.panel.width, vw, 0.001, 'panel flush right');
      near(l.stage.left + l.stage.width, l.panel.left, 0.001, 'stage ends where the panel starts');
      assert.ok(l.panel.width >= 360 && l.panel.width <= 560);
    } else {
      assert.equal(l.mode, 'sheet');
      near(l.panel.top, l.stage.top + l.stage.height, 0.001, 'sheet starts under the stage area');
      near(l.panel.top + l.panel.height, vh, 0.001, 'sheet reaches the bottom');
      assert.ok(l.panel.height >= 200, `sheet too short at ${vw}x${vh}`);
    }
    assert.equal(l.stage.top, navH(vw), 'stage area starts below the nav');
  }
});

test('target: uniform scale only, same final size and position for every product and any start position', () => {
  for (const [vw, vh] of VIEWPORTS) {
    const layout = computeLayout(vw, vh, navH(vw));
    const starts: [number, number, number][] = [
      [20, 120, 230], // first, row 1
      [vw * 0.6, 120, 230], // middle
      [vw - 60, 480, 230], // last, partly off-screen right
      [-140, vh * 0.7, 160], // partly off-screen left (mobile scroller), smaller unit
      [vw * 0.3, vh - 40, 300], // second row, mostly below the fold
    ];
    const finals: { left: number; base: number; width: number; cx: number }[] = [];
    PRODUCTS.forEach((_, i) => {
      for (const [x, y, w] of starts) {
        const { rest, shoe } = unitAt(i, x, y, w);
        const t = computeTarget(rest, shoe, geo(i), layout, { maxShoeWidth: maxShoe(vw) });
        assert.ok(t.transform.s > 0 && Number.isFinite(t.transform.s));
        assert.match(toCss(t.transform), /^translate\(-?[\d.]+px, -?[\d.]+px\) scale\([\d.]+\)$/);
        finals.push({ left: t.shoe.left, base: t.baselineY, width: t.shoe.width, cx: t.shoe.left + t.shoe.width / 2 });
      }
    });
    const f0 = finals[0]!;
    for (const f of finals) {
      near(f.width, f0.width, 0.5, `${vw}x${vh} final width`);
      near(f.cx, f0.cx, 0.5, `${vw}x${vh} final centre`);
      near(f.base, f0.base, 0.5, `${vw}x${vh} final sole line`);
    }
  }
});

test('target: zoomed shoe stays below the nav, inside the stage area and clear of the panel', () => {
  for (const [vw, vh] of VIEWPORTS) {
    const layout = computeLayout(vw, vh, navH(vw));
    PRODUCTS.forEach((_, i) => {
      const { rest, shoe } = unitAt(i, vw * 0.4, vh * 0.5, Math.min(240, vw * 0.4));
      const t = computeTarget(rest, shoe, geo(i), layout, { maxShoeWidth: maxShoe(vw) });
      const s = t.shoe;
      assert.ok(s.top >= navH(vw), `${vw}x${vh} ${PRODUCTS[i]!.id}: shoe top ${s.top} under the nav`);
      assert.ok(s.left >= layout.stage.left - 0.01, 'inside stage left');
      assert.ok(s.left + s.width <= layout.stage.left + layout.stage.width + 0.01, 'clear of the panel horizontally');
      assert.ok(s.top + s.height <= layout.stage.top + layout.stage.height + 0.01, 'inside stage bottom (clear of the sheet)');
      // the whole unit (platform included) fits the stage area too
      const u = t.unit;
      assert.ok(u.left + u.width <= layout.stage.left + layout.stage.width + 0.01, `${vw}x${vh} unit clear of panel`);
      assert.ok(u.top + u.height <= layout.stage.top + layout.stage.height + 0.01, `${vw}x${vh} unit inside stage`);
      // and it got significantly bigger
      assert.ok(t.transform.s > 1.15 || vw < 400, `${vw}x${vh} scale ${t.transform.s} is a real zoom`);
      // never larger than the source the foundation's sizes picked
      assert.ok(s.width <= maxShoe(vw) + 0.01);
    });
  }
});

test('mapRect + anchorOf: the anchor (sole centre) lands where the target says', () => {
  const layout = computeLayout(1440, 900, 72);
  const { rest, shoe } = unitAt(2, 300, 500, 220);
  const g = geo(2);
  const t = computeTarget(rest, shoe, g, layout);
  const a = anchorOf(rest, shoe, g);
  const ax = rest.left + t.transform.tx + t.transform.s * a.x;
  const ay = rest.top + t.transform.ty + t.transform.s * a.y;
  near(ax, layout.stage.left + layout.stage.width / 2, 1e-6, 'anchor x');
  near(ay, t.baselineY, 1e-6, 'anchor y');
  const m = mapRect(shoe, rest, IDENTITY);
  assert.deepEqual(m, { left: shoe.left, top: shoe.top, width: shoe.width, height: shoe.height });
});

test('parseMatrix accepts translate + uniform scale only', () => {
  assert.deepEqual(parseMatrix('none'), IDENTITY);
  assert.deepEqual(parseMatrix('matrix(2.5, 0, 0, 2.5, 10, -20)'), { tx: 10, ty: -20, s: 2.5 });
  assert.deepEqual(parseMatrix('matrix3d(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 5, 6, 0, 1)'), { tx: 5, ty: 6, s: 2 });
  assert.equal(parseMatrix('matrix(2, 0, 0, 3, 0, 0)'), null, 'non-uniform');
  assert.equal(parseMatrix('matrix(0.7, 0.7, -0.7, 0.7, 0, 0)'), null, 'rotation');
  assert.equal(parseMatrix('matrix(-1, 0, 0, -1, 0, 0)'), null, 'flip');
});

test('cubicBezier matches the endpoints and is monotonic for the camera ease', () => {
  const e = easingFromCss(EASE.camera);
  assert.equal(e(0), 0);
  assert.equal(e(1), 1);
  let prev = 0;
  for (let i = 1; i <= 100; i++) {
    const v = e(i / 100);
    assert.ok(v >= prev - 1e-9, 'monotonic');
    prev = v;
  }
  // slow lift-off, long settle
  assert.ok(e(0.2) < 0.1);
  assert.ok(e(0.8) > 0.95);
  near(cubicBezier(0, 0, 1, 1)(0.37), 0.37, 1e-5, 'linear bezier');
});

test('dolly keyframes: exact endpoints, every frame translate + uniform scale, geometric zoom, straight anchor path', () => {
  const from = IDENTITY;
  const to = { tx: 400, ty: -150, s: 3.2 };
  const anchor = { x: 110, y: 90 };
  const frames = dollyKeyframes(from, to, anchor, easingFromCss(EASE.camera), 36);
  assert.equal(frames.length, 37);
  assert.equal(frames[0]!.offset, 0);
  assert.equal(frames.at(-1)!.offset, 1);
  assert.equal(frames[0]!.transform, toCss(from));
  assert.equal(frames.at(-1)!.transform, toCss(to));
  const re = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)$/;
  let prevS = 0;
  for (const f of frames) {
    const m = re.exec(f.transform);
    assert.ok(m, `bad frame ${f.transform}`);
    const s = Number(m[3]);
    assert.ok(s >= prevS - 1e-9, 'scale grows monotonically');
    prevS = s;
  }
  // midpoint of progress: geometric mean of scales; anchor exactly halfway on a straight line
  const mid = dollyAt(from, to, anchor, 0.5);
  near(mid.s, Math.sqrt(3.2), 1e-9, 'geometric scale');
  const ax = mid.tx + mid.s * anchor.x;
  const ay = mid.ty + mid.s * anchor.y;
  near(ax, (anchor.x + to.tx + to.s * anchor.x) / 2, 1e-9, 'anchor x halfway');
  near(ay, (anchor.y + to.ty + to.s * anchor.y) / 2, 1e-9, 'anchor y halfway');
});

test('reverse path from any interrupted state ends exactly at rest', () => {
  const to = { tx: 400, ty: -150, s: 3.2 };
  const anchor = { x: 110, y: 90 };
  const mid = dollyAt(IDENTITY, to, anchor, 0.37);
  const back = dollyKeyframes(mid, IDENTITY, anchor, easingFromCss(EASE.camera), 20);
  assert.equal(back[0]!.transform, toCss(mid));
  assert.equal(back.at(-1)!.transform, toCss(IDENTITY));
  const frac = remainingFraction(mid, IDENTITY, to);
  assert.ok(frac > 0 && frac < 1, `remaining ${frac}`);
  assert.equal(remainingFraction(to, IDENTITY, to), 1);
  assert.equal(remainingFraction(IDENTITY, IDENTITY, to), 0);
});

test('toScene re-expresses a unit-space transform for the viewport-origin camera', () => {
  // A pair sitting well down the wall is the case that breaks if the origin
  // shift is skipped: at a 3.4x close-up the error is rest.top * 2.4 px.
  const rest = { left: 320, top: 240, width: 200, height: 108 };
  const unitSpace = { tx: -140, ty: -60, s: 3.4 };
  const scene = toScene(unitSpace, rest);
  // Both must map the SAME viewport point to the same place.
  const mapUnit = (x: number, y: number) => ({
    x: rest.left + unitSpace.tx + unitSpace.s * (x - rest.left),
    y: rest.top + unitSpace.ty + unitSpace.s * (y - rest.top),
  });
  const mapScene = (x: number, y: number) => ({ x: scene.tx + scene.s * x, y: scene.ty + scene.s * y });
  for (const [x, y] of [[320, 240], [420, 300], [0, 0], [1440, 800]] as const) {
    const a = mapUnit(x, y);
    const b = mapScene(x, y);
    assert.ok(Math.abs(a.x - b.x) < 1e-9, `x ${a.x} vs ${b.x}`);
    assert.ok(Math.abs(a.y - b.y) < 1e-9, `y ${a.y} vs ${b.y}`);
  }
  assert.equal(scene.s, unitSpace.s);
});

test('toScene leaves identity alone, so returning home clears the camera', () => {
  const rest = { left: 320, top: 240, width: 200, height: 108 };
  const back = toScene(IDENTITY, rest);
  assert.ok(isIdentity(back), JSON.stringify(back));
});

test('sceneAnchor is the unit anchor moved into viewport coordinates', () => {
  const rest = { left: 320, top: 240, width: 200, height: 108 };
  const shoe = { left: 330, top: 250, width: 180, height: 80 };
  const geo = { visibleBox: { x: 0.05, y: 0.09, w: 0.9, h: 0.74 }, aspect: 1.896053, baseline: 0.943118 };
  const a = anchorOf(rest, shoe, geo);
  const b = sceneAnchor(rest, shoe, geo);
  assert.ok(Math.abs(b.x - (a.x + rest.left)) < 1e-9);
  assert.ok(Math.abs(b.y - (a.y + rest.top)) < 1e-9);
});
