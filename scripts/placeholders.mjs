// KICCLE placeholder sneaker generator (archive entries 04–10).
//
// ORIGINAL, brand-free artwork drawn for KICCLE: no logos, stripes, checks,
// stars, text or other trade dress. Right-side profile, toe pointing right.
// Temporary stand-ins until real photography exists.
//
// Rendering model (pure vector, crisp at any zoom):
//  - light from above (overhead spotlights): every surface has a top-lit
//    vertical gradient, rounded forms get a form-shadow toward heel and toe, a
//    specular highlight on the toe box and heel counter, and ambient occlusion
//    where the upper meets the midsole (one small blur, always clipped);
//  - construction: panels with creased seams and inset stitching computed as
//    true offset curves, eyestay with ringed eyelets, crossing laces with
//    thickness and cast shadow, padded collar and lining, tongue, pull loop;
//  - materials as subtle vector patterns: knit, mesh, suede nap, canvas weave,
//    leather sheen and creases;
//  - soles: sculpted midsole (toe spring, heel bevel, embossed sidewall lines,
//    speckle or stacked layers), distinct rubber outsole with tread or lugs.
//
// Coordinates: ~1000 units long, ground at y = G. The viewBox written here is
// provisional; it is tightened to the measured opaque bounds afterwards.
//
// Usage:
//   node scripts/placeholders.mjs [outDir]   write the SVGs only
//   node scripts/placeholders.mjs --refresh  write SVGs into assets/placeholders,
//        tighten viewBoxes, measure, and patch ONLY the placeholder entries of
//        src/data/images.generated.ts (needs sharp on NODE_PATH). The full
//        pipeline (npm run assets) does the same plus the photo copies.

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const G = 470; // ground line

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const f1 = (v) => +v.toFixed(1);

/** Catmull-Rom control points for segment p1->p2. Points: [x, y] or [x, y, 'c'] (corner). */
function ctrl(p0, p1, p2, p3, tension) {
  const k1 = p1[2] === 'c' ? 0 : tension / 3;
  const k2 = p2[2] === 'c' ? 0 : tension / 3;
  return [
    [p1[0] + (p2[0] - p0[0]) * k1, p1[1] + (p2[1] - p0[1]) * k1],
    [p2[0] - (p3[0] - p1[0]) * k2, p2[1] - (p3[1] - p1[1]) * k2],
  ];
}

function segments(points, closed) {
  const n = points.length;
  const at = (i) => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  const segs = [];
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) segs.push([at(i - 1), at(i), at(i + 1), at(i + 2)]);
  return segs;
}

/** Smooth SVG path through points. */
function path(points, closed = true, tension = 0.5) {
  let d = `M${f1(points[0][0])} ${f1(points[0][1])}`;
  for (const [p0, p1, p2, p3] of segments(points, closed)) {
    const [c1, c2] = ctrl(p0, p1, p2, p3, tension);
    d += `C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

/** Dense polyline of the same spline. */
function sample(points, closed = true, perSeg = 14, tension = 0.5) {
  const out = [];
  for (const [p0, p1, p2, p3] of segments(points, closed)) {
    const [c1, c2] = ctrl(p0, p1, p2, p3, tension);
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg;
      const u = 1 - t;
      out.push([
        u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
        u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1],
      ]);
    }
  }
  if (!closed) out.push(points[points.length - 1].slice(0, 2));
  return out;
}

const area = (pl) => {
  let a = 0;
  for (let i = 0; i < pl.length; i++) {
    const [x1, y1] = pl[i];
    const [x2, y2] = pl[(i + 1) % pl.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};

/** Offset a dense polyline by d along its normals. Closed: d > 0 goes inward. Open: +d = left of travel. */
function offset(pl, d, closed = true) {
  const n = pl.length;
  const shift = (sign) =>
    pl.map((p, i) => {
      const a = pl[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
      const b = pl[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      return [p[0] + (sign * d * dy) / len, p[1] - (sign * d * dx) / len];
    });
  if (!closed) return shift(1);
  const A = shift(1);
  const B = shift(-1);
  return Math.abs(area(A)) < Math.abs(area(B)) ? A : B;
}

const poly = (pts, closed = false) => 'M' + pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join('L') + (closed ? 'Z' : '');

/** Point at fraction t along a polyline (by length). */
function along(pts, t) {
  const lens = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    lens.push(l);
    total += l;
  }
  let target = t * total;
  for (let i = 1; i < pts.length; i++) {
    const l = lens[i - 1];
    if (target <= l || i === pts.length - 1) {
      const u = l === 0 ? 0 : Math.min(1, target / l);
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u];
    }
    target -= l;
  }
  return pts[pts.length - 1];
}

/** y of a dense polyline at x (linear interpolation, clamped). */
function yAt(pl, x) {
  if (x <= pl[0][0]) return pl[0][1];
  for (let i = 1; i < pl.length; i++) {
    if (pl[i][0] >= x) {
      const [x0, y0] = pl[i - 1];
      const [x1, y1] = pl[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return pl[pl.length - 1][1];
}

const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ---------------------------------------------------------------------------
// Sole geometry
// ---------------------------------------------------------------------------

/**
 * heel / fore: midsole-top height above ground; toeLift: toe spring;
 * heelLift: heel bevel; out: outsole thickness; lugH: lugs below the outsole;
 * wrapToe / wrapHeel: how far the rubber climbs at the ends.
 */
function sole(s) {
  const x0 = s.x0 ?? 18;
  const x1 = s.x1 ?? 986;
  const B = G - (s.lugH ?? 0); // bottom of the rubber body
  const top = [
    [x0 + 6, G - s.heel + 6],
    [x0 + 40, G - s.heel],
    [220, G - s.heel + 2],
    [440, G - (s.heel * 0.5 + s.fore * 0.5)],
    [650, G - s.fore - 1],
    [800, G - s.fore - 3 - s.toeLift * 0.08],
    [905, G - s.fore - s.toeLift * 0.42],
    [x1 - 14, G - s.fore - s.toeLift * 0.86],
  ];
  const bottom = [
    [x0 + 4, B - s.heelLift],
    [x0 + 34, B - s.heelLift * 0.25],
    [120, B],
    [460, B],
    [720, B],
    [830, B - s.toeLift * 0.16],
    [925, B - s.toeLift * 0.55],
    [x1 - 8, B - s.toeLift],
  ];
  const tE = top[top.length - 1];
  const bE = bottom[bottom.length - 1];
  const nose = [x1, (tE[1] + bE[1]) / 2 + 2];
  const heelBack = [x0, (top[0][1] + bottom[0][1]) / 2];
  const outline = [heelBack, ...top, nose, ...[...bottom].reverse()];
  const topLine = sample(top, false, 16);
  const bottomLine = sample(bottom, false, 16);
  const outTop = bottomLine.map(([x, y]) => {
    const t = s.out + (s.wrapToe ?? 0) * smooth(840, x1 - 10, x) + (s.wrapHeel ?? 0) * (1 - smooth(x0 + 10, 150, x));
    return [x, Math.max(y - t, yAt(topLine, x) + 4)];
  });
  return { x0, x1, top, bottom, outline, topLine, bottomLine, outTop, B };
}


// ---------------------------------------------------------------------------
// Construction pieces (clipped by the upper, so they may overshoot freely)
// ---------------------------------------------------------------------------

const clampX = (x) => Math.max(20, Math.min(984, x));

/** Band along the bottom of the upper; h(x) = height above the midsole top. */
function mudguard(S, h, step = 60) {
  const pts = [];
  for (let x = -10; x <= 1010; x += step) pts.push([x, yAt(S.topLine, clampX(x)) - h(x)]);
  return [[1010, G + 30, 'c'], [-10, G + 30, 'c'], ...pts];
}

/** Heel counter: from the back of the shoe forward to frontX, up to topY. */
function heelCounter(S, frontX, topY, bulge = 0.5) {
  const base = yAt(S.topLine, frontX + 40);
  return [[-10, G + 30, 'c'], [-10, topY - 10], [frontX * 0.55, topY], [frontX, topY + (base - topY) * bulge], [frontX + 40 + 30 * bulge, base + 10], [frontX + 60, G + 30, 'c']];
}

/** Toe cap: from backX to the toe, top edge at topY (curved down at the back). */
function toeCap(S, backX, topY) {
  const base = yAt(S.topLine, backX);
  return [[backX + 10, G + 30, 'c'], [backX, base - 6], [backX + 24, topY + (base - topY) * 0.45], [backX + 90, topY], [1010, topY - 30], [1010, G + 30, 'c']];
}

/** Saddle: one broad midfoot overlay from the eyestay to the sole, with curved edges. */
function saddle(S, topX0, topX1, botX0, botX1, topY = 60) {
  const midY = (topY + yAt(S.topLine, (botX0 + botX1) / 2)) / 2 + 30;
  return [
    [botX0, G + 30, 'c'],
    [botX0 + (topX0 - botX0) * 0.35 - 26, midY + 40],
    [topX0 - 10, midY - 40],
    [topX0, topY],
    [topX1, topY],
    [topX1 + 6, midY - 30],
    [botX1 - (botX1 - topX1) * 0.45 + 20, midY + 50],
    [botX1, G + 30, 'c'],
  ];
}

// ---------------------------------------------------------------------------
// SVG builder
// ---------------------------------------------------------------------------

function build(m) {
  const id = m.id;
  const u = (n) => `${id}-${n}`;
  const c = m.colors;
  const S = sole(m.sole);
  const defs = [];
  const body = [];
  const add = (s) => body.push(s);

  const under = S.topLine.map(([x, y]) => [x, y + 24]).filter(([x]) => x > S.x0 + 14 && x < S.x1 - 12);
  const upperPts = [...m.heelBack, ...m.collar, ...m.throat, ...m.toe, ...under.reverse().filter((_, i) => i % 6 === 0)];
  const upperD = path(upperPts, true);
  const panels = typeof m.panels === 'function' ? m.panels(S) : m.panels ?? [];
  const midD = path(S.outline, true);

  const stopList = (stops) => stops.map(([o, col, op = 1]) => `<stop offset="${o}" stop-color="${col}"${op !== 1 ? ` stop-opacity="${op}"` : ''}/>`).join('');
  const yGrad = (name, y1, y2, stops) =>
    defs.push(`<linearGradient id="${u(name)}" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(y1)}" x2="0" y2="${f1(y2)}">${stopList(stops)}</linearGradient>`);
  const xGrad = (name, x1, x2, stops) =>
    defs.push(`<linearGradient id="${u(name)}" gradientUnits="userSpaceOnUse" x1="${f1(x1)}" y1="0" x2="${f1(x2)}" y2="0">${stopList(stops)}</linearGradient>`);

  const upperTop = Math.min(...upperPts.map((p) => p[1]));
  const midTop = Math.min(...S.topLine.map((p) => p[1]));
  yGrad('upper', upperTop, midTop + 20, [[0, c.upperHi], [0.45, c.upper], [1, c.upperLo]]);
  xGrad('form', S.x0, S.x1, [[0, '#05070c', 0.42], [0.12, '#05070c', 0.1], [0.3, '#05070c', 0], [0.82, '#05070c', 0], [0.95, '#05070c', 0.16], [1, '#05070c', 0.32]]);
  defs.push(`<radialGradient id="${u('toeHi')}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff" stop-opacity="${m.sheen ?? 0.3}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`);
  defs.push(`<radialGradient id="${u('heelHi')}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff" stop-opacity="${((m.sheen ?? 0.3) * 0.7).toFixed(2)}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`);
  yGrad('mid', midTop, G, [[0, c.midHi], [0.35, c.mid], [1, c.midLo]]);
  xGrad('midForm', S.x0, S.x1, [[0, '#0a0d14', 0.3], [0.08, '#0a0d14', 0.05], [0.9, '#0a0d14', 0], [1, '#0a0d14', 0.28]]);
  yGrad('out', G - (m.sole.out + (m.sole.lugH ?? 0)) - 8, G, [[0, c.outHi], [1, c.out]]);
  yGrad('lining', upperTop, upperTop + 140, [[0, c.liningHi ?? c.lining], [1, c.lining]]);
  defs.push(`<linearGradient id="${u('laceG')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.laceHi}"/><stop offset="1" stop-color="${c.lace}"/></linearGradient>`);
  defs.push(`<clipPath id="${u('cu')}"><path d="${upperD}"/></clipPath>`);
  defs.push(`<clipPath id="${u('cm')}"><path d="${midD}"/></clipPath>`);
  const outRegion = poly([[S.x0 - 20, G + 40], ...S.outTop, [S.x1 + 20, S.outTop[S.outTop.length - 1][1]], [S.x1 + 20, G + 40]], true);
  defs.push(`<clipPath id="${u('co')}"><path d="${outRegion}"/></clipPath>`);
  defs.push(`<filter id="${u('soft')}" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="${m.aoBlur ?? 7}"/></filter>`);

  const tex = m.texture;
  if (tex === 'knit') {
    defs.push(`<pattern id="${u('tex')}" width="6" height="5" patternUnits="userSpaceOnUse"><path d="M0.4 1L1.5 3.4L2.6 1M3.4 1L4.5 3.4L5.6 1" fill="none" stroke="#fff" stroke-opacity="0.09" stroke-width="0.8" stroke-linecap="round"/><path d="M0 4.4H6" stroke="#000" stroke-opacity="0.12" stroke-width="0.7"/></pattern>`);
  } else if (tex === 'mesh') {
    defs.push(`<pattern id="${u('tex')}" width="9" height="7.8" patternUnits="userSpaceOnUse"><g fill="#000" fill-opacity="0.26"><ellipse cx="2.25" cy="1.95" rx="1.5" ry="1.25"/><ellipse cx="6.75" cy="5.85" rx="1.5" ry="1.25"/></g><g fill="#fff" fill-opacity="0.08"><ellipse cx="2.25" cy="0.9" rx="1.4" ry="0.5"/><ellipse cx="6.75" cy="4.8" rx="1.4" ry="0.5"/></g></pattern>`);
  } else if (tex === 'canvas') {
    defs.push(`<pattern id="${u('tex')}" width="3.2" height="3.2" patternUnits="userSpaceOnUse"><path d="M0 0.8H3.2M0 2.4H3.2" stroke="#000" stroke-opacity="0.12" stroke-width="0.7"/><path d="M0.8 0V3.2M2.4 0V3.2" stroke="#fff" stroke-opacity="0.07" stroke-width="0.7"/></pattern>`);
  }
  const needsSuede = tex === 'suede' || m.collarMaterial === 'suede' || m.eyestayMaterial === 'suede' || panels.some((p) => p.material === 'suede');
  if (needsSuede) {
    const r = rng(m.seed ?? 11);
    let dots = '';
    for (let i = 0; i < 46; i++) {
      const light = r() > 0.55;
      dots += `<circle cx="${f1(r() * 14)}" cy="${f1(r() * 14)}" r="${(0.35 + r() * 0.55).toFixed(2)}" fill="${light ? '#fff' : '#000'}" fill-opacity="${(light ? 0.06 + r() * 0.07 : 0.08 + r() * 0.1).toFixed(2)}"/>`;
    }
    defs.push(`<pattern id="${u('suede')}" width="14" height="14" patternUnits="userSpaceOnUse">${dots}</pattern>`);
  }
  if (panels.some((p) => p.material === 'mesh') && tex !== 'mesh') {
    defs.push(`<pattern id="${u('mesh2')}" width="8" height="7" patternUnits="userSpaceOnUse"><g fill="#000" fill-opacity="0.24"><ellipse cx="2" cy="1.75" rx="1.35" ry="1.1"/><ellipse cx="6" cy="5.25" rx="1.35" ry="1.1"/></g></pattern>`);
  }
  const hasTex = tex === 'knit' || tex === 'mesh' || tex === 'canvas';

  // ===== 1. lining (inside of the far collar wall) and tongue, behind the upper
  if (m.lining) {
    add(`<path d="${path(m.lining)}" fill="url(#${u('lining')})"/>`);
    add(`<path d="${path(m.lining)}" fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="2"/>`);
  }
  if (m.tongue) {
    const tg = m.tongue;
    const tTop = Math.min(...tg.map((p) => p[1]));
    yGrad('tongue', tTop, tTop + 160, [[0, c.tongueHi ?? c.upperHi], [1, c.tongue ?? c.upper]]);
    add(`<path d="${path(tg)}" fill="url(#${u('tongue')})"/>`);
    if (hasTex) add(`<path d="${path(tg)}" fill="url(#${u('tex')})"/>`);
    if (tex === 'suede') add(`<path d="${path(tg)}" fill="url(#${u('suede')})"/>`);
    const tp = sample(tg, true, 10);
    add(`<path d="${poly(offset(tp, 4), true)}" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="1.6"/>`);
    add(`<path d="${poly(offset(tp, 9), true)}" fill="none" stroke="${c.stitch}" stroke-opacity="0.45" stroke-width="1.3" stroke-dasharray="4.5 3.5"/>`);
    add(`<path d="${path(tg)}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="1.4"/>`);
    if (m.tongueTab) {
      add(`<path d="${path(m.tongueTab)}" fill="${c.tab}"/>`);
      add(`<path d="${path(m.tongueTab)}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="1.2"/>`);
    }
  }

  // ===== 2. upper body
  add(`<path d="${upperD}" fill="url(#${u('upper')})"/>`);
  add(`<g clip-path="url(#${u('cu')})">`);
  if (hasTex) add(`<path d="${upperD}" fill="url(#${u('tex')})"/>`);
  if (tex === 'suede') add(`<path d="${upperD}" fill="url(#${u('suede')})"/>`);
  for (const cr of m.creases ?? []) {
    add(`<path d="${path(cr, false)}" fill="none" stroke="#000" stroke-opacity="0.14" stroke-width="2.2" stroke-linecap="round"/><path d="${path(cr.map(([x, y]) => [x + 1, y + 2]), false)}" fill="none" stroke="#fff" stroke-opacity="0.2" stroke-width="1.4" stroke-linecap="round"/>`);
  }

  panels.forEach((p, i) => {
    const d = path(p.pts, true, p.tension ?? 0.5);
    const pp = sample(p.pts, true, 12, p.tension ?? 0.5);
    const pTop = Math.min(...p.pts.map((q) => q[1]));
    yGrad(`p${i}`, Math.max(pTop, upperTop), midTop + 10, [[0, p.hi ?? p.fill], [0.55, p.fill], [1, p.lo ?? p.fill]]);
    add(`<path d="${d}" fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="5" transform="translate(1.5 3)" filter="url(#${u('soft')})"/>`);
    add(`<path d="${d}" fill="url(#${u(`p${i}`)})"${p.opacity != null ? ` opacity="${p.opacity}"` : ''}/>`);
    if (p.material === 'suede') add(`<path d="${d}" fill="url(#${u('suede')})"/>`);
    if (p.material === 'mesh') add(`<path d="${d}" fill="url(#${u(tex === 'mesh' ? 'tex' : 'mesh2')})"/>`);
    if (p.material === 'gloss') add(`<path d="${poly(offset(pp, 4), true)}" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="2"/>`);
    add(`<path d="${d}" fill="none" stroke="#000" stroke-opacity="0.42" stroke-width="1.6"/>`);
    add(`<path d="${poly(offset(pp, 1.6), true)}" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="1"/>`);
    if (p.stitch !== false) {
      const st = p.stitchColor ?? c.stitch;
      add(`<path d="${poly(offset(pp, p.inset ?? 6), true)}" fill="none" stroke="${st}" stroke-opacity="0.75" stroke-width="1.35" stroke-dasharray="5 3.6" stroke-linecap="round"/>`);
      if (p.double) add(`<path d="${poly(offset(pp, (p.inset ?? 6) + 5), true)}" fill="none" stroke="${st}" stroke-opacity="0.6" stroke-width="1.2" stroke-dasharray="5 3.6" stroke-linecap="round"/>`);
    }
  });
  for (const dots of m.perforations ?? []) {
    const r = dots.r ?? 2.6;
    for (let i = 0; i < dots.n; i++) {
      const [x, y] = along(dots.line, dots.n === 1 ? 0.5 : i / (dots.n - 1));
      add(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="#0b0d12" fill-opacity="0.55"/><path d="M${f1(x - r)} ${f1(y + 0.6)}a${r} ${r} 0 0 0 ${2 * r} 0" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="0.8"/>`);
    }
  }

  // extra construction seams on the base material: crease + light lip + stitch
  for (const seam of m.seams ?? []) {
    const sp = sample(seam, false, 12);
    add(`<path d="${poly(sp)}" fill="none" stroke="#000" stroke-opacity="0.4" stroke-width="1.6"/>`);
    add(`<path d="${poly(sp.map(([x, y]) => [x + 0.6, y + 1.6]))}" fill="none" stroke="#fff" stroke-opacity="0.16" stroke-width="1"/>`);
    add(`<path d="${poly(offset(sp, -5, false))}" fill="none" stroke="${c.stitch}" stroke-opacity="0.6" stroke-width="1.3" stroke-dasharray="5 3.6"/>`);
  }
  // padded collar roll
  const collarLine = sample(m.collar, false, 10);
  const pad = m.collarPad ?? 20;
  const collarIn = collarLine.map(([x, y]) => [x, y + pad]);
  const collarBand = [...collarLine.map(([x, y]) => [x, y - 6]), ...[...collarIn].reverse()];
  yGrad('collar', upperTop, upperTop + 90, [[0, c.collarHi ?? c.upperHi], [1, c.collar ?? c.upper]]);
  add(`<path d="${poly(collarIn.map(([x, y]) => [x + 1, y + 3]))}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="5" filter="url(#${u('soft')})"/>`);
  add(`<path d="${poly(collarBand, true)}" fill="url(#${u('collar')})"/>`);
  if (tex === 'suede' || m.collarMaterial === 'suede') add(`<path d="${poly(collarBand, true)}" fill="url(#${u('suede')})"/>`);
  add(`<path d="${poly(collarIn)}" fill="none" stroke="#000" stroke-opacity="0.4" stroke-width="1.8"/>`);
  add(`<path d="${poly(collarIn.map(([x, y]) => [x, y - 6]))}" fill="none" stroke="${c.stitch}" stroke-opacity="0.55" stroke-width="1.3" stroke-dasharray="5 3.6"/>`);

  // eyestay band with stitching
  const eyeletPts = [];
  if (m.eyelets) {
    const e = m.eyelets;
    const line = sample(e.line, false, 12);
    const hw = e.stay ?? 16;
    const lowerEdge = line.map(([x, y]) => [x, y + hw]);
    const stayPts = [...line.map(([x, y]) => [x, y - hw - 40]), ...[...lowerEdge].reverse()];
    add(`<path d="${poly(lowerEdge.map(([x, y]) => [x + 1.5, y + 3]))}" fill="none" stroke="#000" stroke-opacity="0.32" stroke-width="5" filter="url(#${u('soft')})"/>`);
    add(`<path d="${poly(stayPts, true)}" fill="${c.eyestay ?? c.upperLo}"/>`);
    if (m.eyestayMaterial === 'suede') add(`<path d="${poly(stayPts, true)}" fill="url(#${u('suede')})"/>`);
    add(`<path d="${poly(lowerEdge)}" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="1.6"/>`);
    add(`<path d="${poly(lowerEdge.map(([x, y]) => [x, y + 1.6]))}" fill="none" stroke="#fff" stroke-opacity="0.15" stroke-width="1"/>`);
    add(`<path d="${poly(lowerEdge.map(([x, y]) => [x, y - 5]))}" fill="none" stroke="${c.stitch}" stroke-opacity="0.7" stroke-width="1.3" stroke-dasharray="5 3.6"/>`);
    add(`<path d="${poly(line.map(([x, y]) => [x, y - hw + 5]))}" fill="none" stroke="${c.stitch}" stroke-opacity="0.45" stroke-width="1.2" stroke-dasharray="5 3.6"/>`);
    for (let i = 0; i < e.n; i++) eyeletPts.push(along(e.line, i / (e.n - 1)));
  }

  // form shading, highlights, ambient occlusion
  add(`<path d="${upperD}" fill="url(#${u('form')})"/>`);
  // shoulder light: where the side wall turns over toward the top, under the spotlights
  const shoulder = [...m.collar, ...m.throat, ...m.toe].map(([x, y]) => [x, y + (m.shoulderDrop ?? 34)]);
  add(`<path d="${path(shoulder, false)}" fill="none" stroke="#fff" stroke-opacity="${m.shoulder ?? 0.16}" stroke-width="34" stroke-linecap="round" filter="url(#${u('soft')})"/>`);
  // lower wall falls into shadow
  yGrad('fall', midTop - 120, midTop + 10, [[0, '#04060a', 0], [1, '#04060a', m.fall ?? 0.24]]);
  add(`<path d="${upperD}" fill="url(#${u('fall')})"/>`);
  if (m.toeHi) add(`<ellipse cx="${m.toeHi[0]}" cy="${m.toeHi[1]}" rx="${m.toeHi[2]}" ry="${m.toeHi[3]}" fill="url(#${u('toeHi')})" transform="rotate(${m.toeHi[4] ?? 14} ${m.toeHi[0]} ${m.toeHi[1]})"/>`);
  if (m.heelHi) add(`<ellipse cx="${m.heelHi[0]}" cy="${m.heelHi[1]}" rx="${m.heelHi[2]}" ry="${m.heelHi[3]}" fill="url(#${u('heelHi')})"/>`);
  add(`<path d="${poly(S.topLine.map(([x, y]) => [x, y - 4]))}" fill="none" stroke="#04060a" stroke-opacity="${m.ao ?? 0.38}" stroke-width="22" filter="url(#${u('soft')})"/>`);
  // rim light: the spotlight catching the top edge of the throat and toe box
  add(`<path d="${path([...m.throat, ...m.toe], false)}" fill="none" stroke="#fff" stroke-opacity="${m.rim ?? 0.26}" stroke-width="3" transform="translate(0 2.5)"/>`);
  add(`</g>`);
  add(`<path d="${poly(collarLine.map(([x, y]) => [x, y + 2]))}" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="2.2" stroke-linecap="round"/>`);

  if (c.piping) {
    const edge = collarLine.map(([x, y]) => [x, y + 3]);
    add(`<path d="${poly(edge)}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="7" stroke-linecap="round" transform="translate(0 2)"/>`);
    add(`<path d="${poly(edge)}" fill="none" stroke="${c.piping}" stroke-width="5.5" stroke-linecap="round"/>`);
    add(`<path d="${poly(edge.map(([x, y]) => [x, y - 1.4]))}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="1.4" stroke-linecap="round"/>`);
  }
  // elastic gore (slip-on)
  if (m.gore) {
    const gd = path(m.gore);
    const gp = sample(m.gore, true, 10);
    const xs = gp.map((p) => p[0]);
    defs.push(`<clipPath id="${u('cg')}"><path d="${gd}"/></clipPath>`);
    let ribs = '';
    for (let x = Math.min(...xs) - 20; x < Math.max(...xs) + 20; x += 4.2) ribs += `M${f1(x)} ${f1(upperTop)}L${f1(x - 12)} ${f1(midTop)}`;
    add(`<path d="${gd}" fill="${c.gore}"/>`);
    add(`<g clip-path="url(#${u('cg')})"><path d="${ribs}" stroke="#000" stroke-opacity="0.32" stroke-width="1.6"/><path d="${gd}" fill="url(#${u('form')})"/></g>`);
    add(`<path d="${gd}" fill="none" stroke="#000" stroke-opacity="0.5" stroke-width="1.6"/>`);
    add(`<path d="${poly(offset(gp, -4), true)}" fill="none" stroke="${c.stitch}" stroke-opacity="0.6" stroke-width="1.3" stroke-dasharray="5 3.6"/>`);
  }

  // ===== 3. laces + eyelets
  if (m.eyelets) {
    const e = m.eyelets;
    const w = e.w ?? 8;
    const crest = (i) => {
      const a = along(e.line, Math.max(0, Math.min(1, i / (e.n - 1))));
      const ext = i < 0 ? i * 26 : 0;
      return [a[0] + e.reach[0] + ext, a[1] + e.reach[1] + ext * 0.45];
    };
    const lace = (a, b, behind) => {
      const mid = [(a[0] + b[0]) / 2 + 4, (a[1] + b[1]) / 2 - 7];
      const d = `M${f1(a[0])} ${f1(a[1])}Q${f1(mid[0])} ${f1(mid[1])} ${f1(b[0])} ${f1(b[1])}`;
      let s = `<path d="${d}" fill="none" stroke="#05070b" stroke-opacity="0.35" stroke-width="${w + 3}" stroke-linecap="round" transform="translate(1.5 3.5)"/>`;
      s += `<path d="${d}" fill="none" stroke="${c.laceLo}" stroke-width="${w + 1.8}" stroke-linecap="round"/>`;
      s += `<path d="${d}" fill="none" stroke="${behind ? c.lace : `url(#${u('laceG')})`}" stroke-width="${w}" stroke-linecap="round"${behind ? ' stroke-opacity="0.85"' : ''}/>`;
      if (!behind) {
        s += `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="0.32" stroke-width="${(w * 0.28).toFixed(1)}" stroke-linecap="round" transform="translate(-0.6 -${(w * 0.22).toFixed(1)})"/>`;
        s += `<path d="${d}" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="${w}" stroke-dasharray="1.2 2.4"/>`;
      }
      return s;
    };
    // far-side lace runs (seen over the tongue, behind), then near-side bars on top
    for (let i = 0; i < e.n; i++) add(lace(crest(i - 0.15), crest(i - 1.05), true));
    for (let i = 0; i < e.n; i++) add(lace(eyeletPts[i], crest(i - 0.85), false));
    for (const [x, y] of eyeletPts) {
      const r = e.r ?? 5;
      add(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${r + 1.8}" fill="${c.eyelet}"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${r + 1.2}" fill="none" stroke="#fff" stroke-opacity="0.38" stroke-width="0.9" stroke-dasharray="${f1(r * 3)} 60" transform="rotate(200 ${f1(x)} ${f1(y)})"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.55)}" fill="#07090d" fill-opacity="0.8"/>`);
    }
  }

  // heel pull loop
  if (m.pullLoop) {
    const pl = m.pullLoop;
    add(`<path d="${path(pl.outer)}" fill="${c.tab}"/>`);
    add(`<path d="${path(pl.outer)}" fill="url(#${u('form')})"/>`);
    if (pl.hole) add(`<path d="${path(pl.hole)}" fill="${c.lining}"/>`);
    add(`<path d="${path(pl.outer)}" fill="none" stroke="#000" stroke-opacity="0.4" stroke-width="1.4"/>`);
    add(`<path d="${poly(offset(sample(pl.outer, true, 10), 3.5), true)}" fill="none" stroke="${c.stitch}" stroke-opacity="0.55" stroke-width="1.1" stroke-dasharray="3.5 2.8"/>`);
  }

  // ===== 4. midsole
  add(`<path d="${midD}" fill="url(#${u('mid')})"/>`);
  add(`<g clip-path="url(#${u('cm')})">`);
  for (const L of m.midLayers ?? []) {
    const at = (fr) => S.topLine.map(([x, y]) => [x, y + (yAt(S.bottomLine, x) - y) * fr]);
    const a = at(L.from);
    const b = at(L.to);
    add(`<path d="${poly([...a, ...[...b].reverse()], true)}" fill="${L.fill}"${L.opacity != null ? ` opacity="${L.opacity}"` : ''}/>`);
    add(`<path d="${poly(a)}" fill="none" stroke="#000" stroke-opacity="0.24" stroke-width="1.4"/>`);
    add(`<path d="${poly(a.map(([x, y]) => [x, y + 1.6]))}" fill="none" stroke="#fff" stroke-opacity="0.32" stroke-width="1"/>`);
  }
  if (m.speckle) {
    const r = rng(m.seed ?? 7);
    let sp = '';
    for (let i = 0; i < m.speckle; i++) {
      const x = S.x0 + r() * (S.x1 - S.x0);
      const y0 = yAt(S.topLine, x);
      const y1 = yAt(S.outTop, x);
      sp += `<circle cx="${f1(x)}" cy="${f1(y0 + r() * (y1 - y0))}" r="${(0.7 + r() * 1.5).toFixed(1)}" fill-opacity="${(0.35 + r() * 0.45).toFixed(2)}"/>`;
    }
    add(`<g fill="#24262a">${sp}</g>`);
  }
  if (m.carve) {
    // a concave carved window in the foam: shaded on its upper lip, lit on its lower edge
    const K = m.carve;
    const xs = S.topLine.filter(([x]) => x >= K.x0 && x <= K.x1);
    const taper = (x) => smooth(K.x0, K.x0 + 140, x) * (1 - smooth(K.x1 - 140, K.x1, x));
    const upperEdge = xs.map(([x, y]) => {
      const fr = K.top + K.wave * Math.sin((x - K.x0) / K.period);
      return [x, y + (yAt(S.outTop, x) - y) * (K.bottom - (K.bottom - fr) * taper(x))];
    });
    const lowerEdge = xs.map(([x, y]) => [x, y + (yAt(S.outTop, x) - y) * K.bottom]);
    const shape = [...upperEdge, ...[...lowerEdge].reverse()];
    yGrad('carve', midTop, G, [[0, '#000', 0.2], [1, '#000', 0.02]]);
    add(`<path d="${poly(shape, true)}" fill="url(#${u('carve')})"/>`);
    add(`<path d="${poly(upperEdge)}" fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="2.4" filter="url(#${u('soft')})"/>`);
    add(`<path d="${poly(upperEdge.map(([x, y]) => [x, y - 1.5]))}" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="1.4"/>`);
  }
  for (const g of m.grooves ?? []) {
    const line = S.topLine
      .filter(([x]) => x >= (g.x0 ?? S.x0 + 30) && x <= (g.x1 ?? S.x1 - 30))
      .map(([x, y]) => [x, y + (yAt(S.outTop, x) - y) * g.at + (g.wave ? Math.sin(x / g.wave[0]) * g.wave[1] : 0)]);
    add(`<path d="${poly(line)}" fill="none" stroke="#000" stroke-opacity="${g.depth ?? 0.24}" stroke-width="${g.w ?? 2}" stroke-linecap="round"/>`);
    add(`<path d="${poly(line.map(([x, y]) => [x, y + 1.7]))}" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="1.1" stroke-linecap="round"/>`);
  }
  if (m.midStitch) {
    const line = S.topLine.filter(([x]) => x > S.x0 + 14 && x < S.x1 - 16).map(([x, y]) => [x, y + (yAt(S.outTop, x) - y) * m.midStitch]);
    add(`<path d="${poly(line)}" fill="none" stroke="${c.midStitch ?? '#6b5c46'}" stroke-opacity="0.85" stroke-width="1.5" stroke-dasharray="6 4"/>`);
  }
  add(`<path d="${midD}" fill="url(#${u('midForm')})"/>`);
  add(`<path d="${poly(S.outTop.map(([x, y]) => [x, y - 3]))}" fill="none" stroke="#000" stroke-opacity="0.22" stroke-width="10" filter="url(#${u('soft')})"/>`);
  add(`</g>`);
  add(`<path d="${poly(S.topLine.filter(([x]) => x > S.x0 + 20 && x < S.x1 - 20).map(([x, y]) => [x, y + 1.6]))}" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1.8" stroke-linecap="round"/>`);

  // ===== 5. outsole, tread, lugs
  if (m.sole.lugH) {
    const L = m.lugs;
    const r = rng(m.seed ?? 3);
    let lugs = '';
    let caps = '';
    for (let i = 0; i < L.n; i++) {
      const x = S.x0 + 40 + ((S.x1 - S.x0 - 90) * i) / (L.n - 1);
      const yb = yAt(S.bottomLine, x);
      const h = m.sole.lugH * (1 - 0.35 * smooth(820, S.x1, x));
      const w = L.w * (0.85 + r() * 0.3);
      lugs += `M${f1(x - w / 2)} ${f1(yb - 4)}L${f1(x - w / 2 + 3)} ${f1(yb + h)}L${f1(x + w / 2 - 3)} ${f1(yb + h)}L${f1(x + w / 2)} ${f1(yb - 4)}Z`;
      caps += `M${f1(x - w / 2 + 2)} ${f1(yb + 1)}L${f1(x + w / 2 - 2)} ${f1(yb + 1)}`;
    }
    add(`<path d="${lugs}" fill="${c.out}"/>`);
    add(`<path d="${caps}" stroke="#fff" stroke-opacity="0.14" stroke-width="2"/>`);
  }
  add(`<g clip-path="url(#${u('co')})"><path d="${midD}" fill="url(#${u('out')})"/>`);
  if (m.tread) {
    const T = m.tread;
    let t = '';
    for (let x = S.x0 + 30; x < S.x1 - 20; x += T.step) {
      const yTop = yAt(S.outTop, x);
      const yBot = yAt(S.bottomLine, x);
      if (T.kind === 'blocks') t += `M${f1(x)} ${f1(yTop + (yBot - yTop) * 0.35)}L${f1(x)} ${f1(yBot)}`;
      else t += `M${f1(x)} ${f1(yTop + 2)}L${f1(x + (T.slant ?? 0))} ${f1(yBot)}`;
    }
    add(`<path d="${t}" stroke="#000" stroke-opacity="0.38" stroke-width="${T.w ?? 1.6}"/>`);
  }
  add(`<path d="${poly(S.outTop.map(([x, y]) => [x, y + 1.4]))}" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="1.2"/>`);
  add(`<path d="${midD}" fill="url(#${u('midForm')})"/>`);
  add(`</g>`);
  add(`<path d="${poly(S.outTop)}" fill="none" stroke="#000" stroke-opacity="0.4" stroke-width="1.4"/>`);
  if (m.foxing) {
    const line = S.topLine.filter(([x]) => x > S.x0 + 12 && x < S.x1 - 14).map(([x, y]) => [x, y + (yAt(S.outTop, x) - y) * m.foxing.at]);
    add(`<path d="${poly(line)}" fill="none" stroke="${m.foxing.color}" stroke-width="${m.foxing.w}" stroke-linecap="round"/>`);
  }
  for (const extra of m.extras?.(u, S) ?? []) add(extra);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- KICCLE archive placeholder ${m.index} "${m.title}". Original artwork, temporary stand-in. Not a real product. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -60 1000 ${G + 64}" width="1000" height="${G + 64}" role="img" aria-label="${m.title} placeholder sneaker, right side profile">
<defs>${defs.join('')}</defs>
${body.join('\n')}
</svg>
`;
}

// ---------------------------------------------------------------------------
// The seven models
// ---------------------------------------------------------------------------

/** 04 DRIFT: knit road runner, tall rockered foam, slate knit with ice heel clip. */
const drift = {
  id: 'p04', index: '04', title: 'Drift', texture: 'knit', sheen: 0.34, seed: 4,
  sole: { heel: 104, fore: 62, toeLift: 50, heelLift: 22, out: 11, wrapToe: 8, wrapHeel: 4 },
  colors: {
    upperHi: '#93a4bb', upper: '#5b6c84', upperLo: '#2e3a4f', collarHi: '#71839c', collar: '#46566d',
    mid: '#e6e3dc', midHi: '#fbfaf6', midLo: '#b3ada1', out: '#2a2e35', outHi: '#454a54',
    lace: '#d4dbe4', laceHi: '#f7f9fb', laceLo: '#5f6878', lining: '#1e2430', liningHi: '#3a4456',
    tongue: '#4a5b73', tongueHi: '#7d8fa8', tab: '#c6d6e8', stitch: '#e3ebf4', eyelet: '#2b313b', eyestay: '#3a475c', piping: '#c6d6e8',
  },
  heelBack: [[34, 392], [20, 336], [18, 262], [28, 196], [44, 150]],
  collar: [[64, 124], [104, 116], [156, 138], [214, 168], [266, 178], [306, 168]],
  throat: [[344, 132], [384, 108], [436, 108], [530, 146], [632, 194], [730, 238]],
  toe: [[812, 264], [880, 280], [936, 302], [970, 334], [984, 376]],
  lining: [[58, 130], [70, 98], [124, 90], [200, 114], [270, 138], [314, 148], [308, 172], [264, 182], [212, 172], [152, 142], [104, 120]],
  tongue: [[296, 184], [300, 116], [322, 66], [352, 44], [388, 40], [408, 56], [424, 104], [404, 160], [366, 200]],
  tongueTab: [[356, 52], [388, 48], [392, 64], [360, 68]],
  eyelets: { line: [[402, 126], [560, 178], [716, 240]], n: 7, reach: [-30, -34], w: 9, r: 4.4, stay: 15 },
  seams: [[[742, 236], [780, 290], [806, 350], [814, 420]], [[200, 168], [214, 250], [236, 330], [246, 420]]],
  panels: (S) => [
    { pts: heelCounter(S, 120, 150, 0.6), fill: '#b9cadd', hi: '#e8f0f8', lo: '#7a8ca2', material: 'gloss', stitch: false },
    { pts: mudguard(S, (x) => 8 + 34 * smooth(820, 990, x)), fill: '#3c4657', hi: '#5a6679', lo: '#2b3341', inset: 5 },
  ],
  pullLoop: { outer: [[40, 148], [26, 98], [36, 82], [58, 84], [72, 130]], hole: [[44, 114], [40, 98], [50, 94], [56, 110]] },
  toeHi: [890, 292, 110, 30, 16],
  heelHi: [74, 210, 46, 80],
  carve: { x0: 120, x1: 860, top: 0.42, bottom: 1.2, wave: 0.12, period: 90 },
  tread: { step: 13, slant: 0 },
};

/** 05 LEDGER: stitched cupsole court shoe, bone leather, ink toe and heel, gum rubber. */
const ledger = {
  id: 'p05', index: '05', title: 'Ledger', texture: 'leather', sheen: 0.46, seed: 5,
  sole: { heel: 78, fore: 70, toeLift: 26, heelLift: 8, out: 18, wrapToe: 6, wrapHeel: 6 },
  colors: {
    upperHi: '#fbf9f4', upper: '#e6e0d2', upperLo: '#b1a690', collarHi: '#f1ece1', collar: '#d3c9b6',
    mid: '#f1ece2', midHi: '#fdfbf6', midLo: '#cbc1ae', out: '#93653c', outHi: '#c08f5e',
    lace: '#ebe6dc', laceHi: '#ffffff', laceLo: '#8a7f6b', lining: '#1f2c42', liningHi: '#33445f',
    tongue: '#ddd5c5', tongueHi: '#f6f2ea', tab: '#2b3a55', stitch: '#9e927c', eyelet: '#d8d0c0', eyestay: '#e2dbcd', midStitch: '#7a6a52',
  },
  heelBack: [[32, 398], [20, 340], [18, 262], [30, 196], [48, 158]],
  collar: [[70, 136], [112, 130], [166, 148], [226, 174], [274, 182], [312, 174]],
  throat: [[346, 140], [386, 120], [436, 122], [530, 162], [640, 212], [740, 250]],
  toe: [[820, 274], [888, 288], [940, 308], [972, 338], [984, 380]],
  lining: [[62, 142], [74, 114], [130, 106], [206, 128], [276, 148], [318, 156], [312, 178], [272, 186], [224, 176], [164, 152], [110, 134]],
  tongue: [[300, 188], [304, 122], [326, 80], [356, 62], [392, 58], [412, 74], [428, 120], [406, 170], [368, 208]],
  eyelets: { line: [[404, 138], [560, 196], [718, 252]], n: 6, reach: [-30, -34], w: 9, r: 4.8, stay: 17 },
  panels: (S) => [
    { pts: heelCounter(S, 150, 156, 0.55), fill: '#2b3a55', hi: '#4a5e88', lo: '#18223a', material: 'gloss', double: true, stitchColor: '#cdbfa6' },
    { pts: toeCap(S, 800, 282), fill: '#2b3a55', hi: '#4a5e88', lo: '#18223a', material: 'gloss', double: true, stitchColor: '#cdbfa6' },
    { pts: saddle(S, 430, 650, 380, 700, 90), fill: '#ddd5c4', hi: '#f4f0e8', lo: '#b2a790', material: 'gloss', inset: 6 },
  ],
  perforations: [
    { line: [[884, 318], [948, 328]], n: 5, r: 2.3 },
    { line: [[876, 340], [956, 352]], n: 6, r: 2.3 },
    { line: [[870, 362], [962, 376]], n: 7, r: 2.3 },
  ],
  seams: [[[250, 180], [262, 260], [282, 340], [292, 420]]],
  creases: [[[742, 286], [770, 300], [790, 330]], [[758, 280], [790, 296], [812, 326]]],
  pullLoop: { outer: [[44, 164], [36, 108], [50, 96], [72, 102], [80, 152]] },
  toeHi: [880, 300, 110, 28, 14],
  heelHi: [100, 240, 56, 80],
  midStitch: 0.42,
  tread: { step: 7, kind: 'blocks', w: 1.4 },
  ao: 0.45,
  fall: 0.3,
};

/** 06 MONOLITH: high-top in charcoal suede with bone leather overlays, oxblood accents. */
const monolith = {
  id: 'p06', index: '06', title: 'Monolith', texture: 'suede', sheen: 0.2, seed: 6,
  sole: { heel: 78, fore: 70, toeLift: 26, heelLift: 8, out: 20, wrapToe: 8, wrapHeel: 6 },
  colors: {
    upperHi: '#646873', upper: '#3d4048', upperLo: '#202227', collarHi: '#555963', collar: '#33363d',
    mid: '#ece8e0', midHi: '#fbfaf6', midLo: '#c6bfb0', out: '#7f725e', outHi: '#a49681',
    lace: '#d6d0c3', laceHi: '#f5f2ea', laceLo: '#55514a', lining: '#4f1b22', liningHi: '#7a2e35',
    tongue: '#3b3e46', tongueHi: '#5b5f69', tab: '#7a2e35', stitch: '#d8d2c4', eyelet: '#1e2025', eyestay: '#d6cfc1', piping: '#7a2e35',
  },
  heelBack: [[32, 398], [20, 330], [18, 220], [24, 110], [40, 36]],
  collar: [[70, 20], [118, 22], [180, 44], [238, 64], [284, 66]],
  throat: [[318, 48], [342, 46], [380, 96], [440, 160], [540, 206], [650, 240], [748, 264]],
  toe: [[826, 280], [892, 294], [942, 314], [972, 344], [984, 384]],
  lining: [[56, 26], [74, -4], [140, -6], [214, 18], [278, 40], [322, 48], [316, 70], [278, 74], [234, 70], [178, 50], [116, 28]],
  tongue: [[276, 80], [280, 8], [302, -22], [332, -32], [362, -26], [376, 2], [370, 60], [350, 120]],
  eyelets: { line: [[334, 62], [400, 136], [500, 194], [640, 242]], n: 8, reach: [-32, -30], w: 9, r: 4.8, stay: 18 },
  panels: (S) => [
    { pts: [[-10, 140], [50, 70], [130, 66], [220, 90], [290, 96], [280, 140], [130, 150]], fill: '#2a2c31', hi: '#3a3d44', lo: '#1e2024', material: 'suede', inset: 6 },
    { pts: heelCounter(S, 170, 200, 0.5), fill: '#d6cfc1', hi: '#f1ece3', lo: '#a39b8b', double: true, stitchColor: '#6b665d' },
    { pts: toeCap(S, 790, 290), fill: '#d6cfc1', hi: '#f1ece3', lo: '#a39b8b', stitchColor: '#6b665d' },
    { pts: saddle(S, 380, 600, 330, 640, 100), fill: '#d6cfc1', hi: '#f1ece3', lo: '#a39b8b', stitchColor: '#6b665d' },
  ],
  collarPad: 26,
  collarMaterial: 'suede',
  pullLoop: { outer: [[34, 44], [28, -14], [44, -30], [66, -24], [72, 32]], hole: [[42, 8], [40, -10], [52, -16], [58, 2]] },
  toeHi: [886, 304, 96, 24, 14],
  heelHi: [80, 160, 54, 110],
  shoulderDrop: 40,
  midLayers: [{ from: 0.66, to: 0.86, fill: '#7a2e35' }],
  tread: { step: 8, kind: 'blocks', w: 1.4 },
};

/** 07 CANYON: trail runner, rust mesh with sand welded overlays, toe bumper, deep lugs. */
const canyon = {
  id: 'p07', index: '07', title: 'Canyon', texture: 'mesh', sheen: 0.26, seed: 7,
  sole: { heel: 96, fore: 64, toeLift: 46, heelLift: 18, out: 14, lugH: 13, wrapToe: 34, wrapHeel: 12 },
  lugs: { n: 15, w: 44 },
  colors: {
    upperHi: '#c97350', upper: '#9b4a2b', upperLo: '#5a2a18', collarHi: '#ad5f40', collar: '#7c3a22',
    mid: '#d9cdb7', midHi: '#efe7d8', midLo: '#a3937a', out: '#2a2c30', outHi: '#474a52',
    lace: '#34353b', laceHi: '#6a6b74', laceLo: '#0f1013', lining: '#2a1f1a', liningHi: '#4a3528',
    tongue: '#86401f', tongueHi: '#b0623c', tab: '#cbb48b', stitch: '#ead9b9', eyelet: '#1d1e22', eyestay: '#c2ad86', piping: '#cbb48b',
  },
  heelBack: [[34, 380], [20, 326], [18, 256], [28, 190], [46, 148]],
  collar: [[66, 124], [106, 118], [160, 142], [218, 170], [268, 178], [306, 168]],
  throat: [[342, 132], [384, 108], [436, 110], [530, 150], [636, 198], [732, 240]],
  toe: [[810, 264], [878, 280], [934, 302], [970, 332], [984, 370]],
  lining: [[60, 130], [72, 100], [126, 92], [202, 116], [272, 140], [314, 150], [308, 172], [266, 182], [214, 174], [156, 146], [106, 122]],
  tongue: [[296, 182], [300, 114], [322, 68], [352, 48], [388, 44], [408, 60], [424, 106], [404, 160], [366, 198]],
  eyelets: { line: [[402, 128], [560, 184], [716, 244]], n: 6, reach: [-30, -34], w: 8, r: 4.6, stay: 16 },
  seams: [[[752, 246], [786, 300], [800, 360]], [[208, 170], [222, 250], [240, 330]]],
  panels: (S) => [
    { pts: heelCounter(S, 130, 170, 0.6), fill: '#c9b48e', hi: '#e6d8b9', lo: '#93805c', inset: 5 },
    { pts: saddle(S, 430, 660, 330, 710, 90), fill: '#c9b48e', hi: '#e6d8b9', lo: '#93805c', inset: 5, double: true },
    { pts: mudguard(S, (x) => 18 + 8 * Math.sin(x / 70) + 56 * smooth(800, 960, x) + 26 * (1 - smooth(20, 160, x))), fill: '#4d5159', hi: '#6c717c', lo: '#363940', material: 'gloss', inset: 5, stitchColor: '#9a9ca3' },
  ],
  pullLoop: { outer: [[40, 150], [26, 102], [38, 86], [60, 88], [72, 134]], hole: [[45, 118], [40, 102], [51, 97], [58, 114]] },
  toeHi: [880, 290, 100, 26, 16],
  heelHi: [80, 220, 46, 70],
  speckle: 180,
  carve: { x0: 160, x1: 820, top: 0.5, bottom: 1.2, wave: 0.14, period: 70 },
  tread: { step: 18, slant: -4, w: 2 },
};

/** 08 HUSH: laceless canvas slip-on, elastic side gore, vulcanised sole with foxing line. */
const hush = {
  id: 'p08', index: '08', title: 'Hush', texture: 'canvas', sheen: 0.24, seed: 8,
  sole: { heel: 66, fore: 60, toeLift: 20, heelLift: 6, out: 12, wrapToe: 4, wrapHeel: 4 },
  colors: {
    upperHi: '#aebda6', upper: '#7d8f77', upperLo: '#4b5946', collarHi: '#93a38c', collar: '#66765f',
    mid: '#eeebe3', midHi: '#fcfbf7', midLo: '#c9c3b5', out: '#2e3a2e', outHi: '#4b584b',
    lace: '#ccc', laceHi: '#eee', laceLo: '#555', lining: '#353a30', liningHi: '#585e50', gore: '#434f3c',
    tab: '#2e3a2e', stitch: '#eef0e4', eyelet: '#222', piping: '#2e3a2e',
  },
  heelBack: [[32, 406], [20, 350], [18, 280], [30, 210], [50, 168]],
  collar: [[76, 146], [124, 140], [190, 160], [260, 176], [330, 170], [390, 152]],
  throat: [[440, 138], [500, 138], [590, 164], [690, 206], [780, 244]],
  toe: [[852, 270], [910, 286], [950, 308], [974, 340], [984, 386]],
  lining: [[66, 152], [80, 120], [144, 112], [230, 130], [320, 142], [400, 136], [394, 156], [330, 174], [258, 180], [188, 166], [122, 146]],
  gore: [[384, 156], [416, 146], [448, 144], [468, 172], [454, 236], [422, 262], [392, 240], [380, 196]],
  panels: (S) => [
    { pts: toeCap(S, 600, 236), fill: '#76896f', hi: '#93a68c', lo: '#4b5946', double: true },
    { pts: heelCounter(S, 120, 172, 0.55), fill: '#71836a', hi: '#8ea087', lo: '#475444', double: true },
  ],
  collarPad: 14,
  seams: [[[470, 150], [590, 176], [700, 216], [800, 254]], [[210, 168], [230, 260], [250, 350], [256, 430]]],
  pullLoop: { outer: [[44, 178], [34, 136], [48, 126], [68, 130], [78, 170]], hole: [[48, 156], [45, 140], [55, 136], [60, 152]] },
  toeHi: [880, 292, 110, 28, 14],
  heelHi: [86, 260, 46, 66],
  foxing: { at: 0.5, color: '#2e3a2e', w: 5 },
  tread: { step: 6, kind: 'blocks', w: 1.2 },
  extras: (u, S) => {
    const line = S.topLine.filter(([x]) => x > S.x0 + 14 && x < S.x1 - 16).map(([x, y]) => [x, y + (yAt(S.outTop, x) - y) * 0.72]);
    return [`<path d="${poly(line)}" fill="none" stroke="#2e3a2e" stroke-opacity="0.55" stroke-width="1.6"/>`];
  },
};

/** 09 TRACE: low-profile track flat, cobalt mesh, silver eyestay saddle, thin firm sole. */
const trace = {
  id: 'p09', index: '09', title: 'Trace', texture: 'mesh', sheen: 0.32, seed: 9,
  sole: { heel: 50, fore: 38, toeLift: 34, heelLift: 10, out: 9, wrapToe: 10, wrapHeel: 2 },
  colors: {
    upperHi: '#6a8be0', upper: '#2f4fa8', upperLo: '#17265a', collarHi: '#4767c0', collar: '#22397d',
    mid: '#f2f0ea', midHi: '#ffffff', midLo: '#c8c5bb', out: '#1c1f26', outHi: '#3b404c',
    lace: '#dfe5ef', laceHi: '#ffffff', laceLo: '#5d6880', lining: '#121a36', liningHi: '#26336a',
    tongue: '#284390', tongueHi: '#5373cc', tab: '#c9d0db', stitch: '#d9e0ec', eyelet: '#1b1f28', eyestay: '#c3cad6', piping: '#c9d0db',
  },
  heelBack: [[32, 420], [20, 372], [20, 304], [32, 238], [52, 196]],
  collar: [[72, 172], [112, 166], [166, 188], [224, 212], [274, 218], [312, 208]],
  throat: [[348, 172], [388, 150], [438, 152], [534, 190], [640, 236], [740, 276]],
  toe: [[818, 300], [886, 316], [936, 336], [968, 364], [982, 404]],
  lining: [[64, 178], [76, 146], [130, 138], [206, 160], [276, 180], [318, 188], [312, 212], [272, 222], [222, 214], [164, 192], [110, 172]],
  tongue: [[300, 222], [304, 156], [324, 112], [354, 92], [388, 88], [408, 102], [422, 146], [402, 196], [366, 236]],
  eyelets: { line: [[406, 166], [560, 222], [718, 282]], n: 7, reach: [-28, -30], w: 7, r: 4, stay: 14 },
  panels: (S) => [
    { pts: saddle(S, 420, 700, 360, 760, 130), fill: '#c9d0db', hi: '#f3f6fa', lo: '#7f8a9e', material: 'gloss', inset: 6 },
    { pts: heelCounter(S, 110, 200, 0.6), fill: '#1f3474', hi: '#2f4b9f', lo: '#121f48', inset: 5 },
    { pts: mudguard(S, (x) => 6 + 34 * smooth(840, 990, x)), fill: '#c9d0db', hi: '#eef2f8', lo: '#8c97aa', inset: 4, stitch: false },
  ],
  pullLoop: { outer: [[44, 200], [32, 154], [44, 140], [64, 144], [74, 190]], hole: [[48, 172], [44, 156], [55, 152], [60, 168]] },
  toeHi: [880, 330, 104, 24, 16],
  heelHi: [80, 290, 44, 56],
  grooves: [{ at: 0.5, x0: 60, x1: 920, depth: 0.16, w: 1.6 }],
  tread: { step: 9, kind: 'blocks', w: 1.4 },
  ao: 0.5,
};

/** 10 STRATA: chunky layered trainer, lilac suede, graphite overlays, stacked midsole. */
const strata = {
  id: 'p10', index: '10', title: 'Strata', texture: 'suede', sheen: 0.26, seed: 10,
  sole: { heel: 136, fore: 104, toeLift: 40, heelLift: 26, out: 18, wrapToe: 12, wrapHeel: 10 },
  colors: {
    upperHi: '#cfc6db', upper: '#a69cb4', upperLo: '#6d6479', collarHi: '#bab1c8', collar: '#8b819a',
    mid: '#ebe7ef', midHi: '#fbfafd', midLo: '#c1bacb', out: '#363943', outHi: '#565a66',
    lace: '#eae8ef', laceHi: '#ffffff', laceLo: '#77728a', lining: '#36313f', liningHi: '#585166',
    tongue: '#958da3', tongueHi: '#c3bacf', tab: '#3a3d46', stitch: '#f2eff7', eyelet: '#2c2e35', eyestay: '#7b7f8a', piping: '#3a3d46',
  },
  heelBack: [[34, 352], [20, 300], [18, 226], [28, 156], [46, 110]],
  collar: [[68, 86], [110, 80], [162, 104], [222, 132], [272, 140], [310, 130]],
  throat: [[346, 94], [386, 72], [438, 74], [534, 114], [640, 164], [736, 210]],
  toe: [[812, 236], [882, 252], [936, 274], [970, 306], [984, 348]],
  lining: [[60, 92], [72, 60], [128, 54], [204, 78], [274, 102], [316, 112], [310, 134], [270, 144], [220, 136], [160, 108], [108, 86]],
  tongue: [[298, 146], [302, 76], [324, 32], [354, 12], [390, 8], [410, 24], [426, 70], [406, 120], [368, 164]],
  eyelets: { line: [[404, 92], [560, 150], [718, 214]], n: 6, reach: [-30, -34], w: 9.5, r: 5, stay: 18 },
  eyestayMaterial: 'suede',
  seams: [[[740, 214], [770, 270], [786, 330]]],
  panels: (S) => [
    { pts: heelCounter(S, 190, 120, 0.5), fill: '#7b7f8a', hi: '#9ba0ad', lo: '#50545e', material: 'suede', double: true },
    { pts: saddle(S, 440, 660, 330, 700, 70), fill: '#7b7f8a', hi: '#9ba0ad', lo: '#50545e', material: 'suede', double: true },
    { pts: toeCap(S, 760, 250), fill: '#7b7f8a', hi: '#9ba0ad', lo: '#50545e', material: 'suede' },
    { pts: mudguard(S, (x) => 22 + 8 * Math.sin(x / 90)), fill: '#6e727d', hi: '#8a8f9b', lo: '#4a4e57', material: 'suede', inset: 5 },
  ],
  collarPad: 22,
  pullLoop: { outer: [[38, 116], [26, 64], [40, 48], [62, 52], [72, 102]], hole: [[44, 86], [40, 68], [52, 62], [58, 80]] },
  toeHi: [884, 268, 104, 28, 16],
  heelHi: [96, 190, 56, 80],
  midLayers: [
    { from: 0.38, to: 0.7, fill: '#cfc8d8' },
    { from: 0.7, to: 1.05, fill: '#a99fb8' },
  ],
  carve: { x0: 140, x1: 860, top: 0.12, bottom: 0.34, wave: 0.05, period: 110 },
  tread: { step: 16, slant: 0, w: 2 },
};

export const PLACEHOLDER_SPECS = [drift, ledger, monolith, canyon, hush, trace, strata];

export function writePlaceholders(outDir) {
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const spec of PLACEHOLDER_SPECS) {
    const file = join(outDir, `${spec.id}.svg`);
    writeFileSync(file, build(spec));
    files.push({ id: spec.id, file });
  }
  return files;
}

// ---------------------------------------------------------------------------
// --refresh: tighten + measure + patch placeholder metadata only
// ---------------------------------------------------------------------------

async function refresh() {
  const require = createRequire(import.meta.url);
  const sharp = require('sharp');
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const VISIBLE_ALPHA = 32; // same thresholds as scripts/assets.mjs
  const SOLID_ALPHA = 128;
  const round = (v, d = 5) => Math.round(v * 10 ** d) / 10 ** d;
  const raw = async (svg, scale) => {
    const { data, info } = await sharp(Buffer.from(svg), { density: 72 * scale }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, W: info.width, H: info.height };
  };
  const bbox = ({ data, W, H }, th) => {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] >= th) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };
  const genPath = join(ROOT, 'src/data/images.generated.ts');
  let ts = readFileSync(genPath, 'utf8');
  for (const { id, file } of writePlaceholders(join(ROOT, 'assets/placeholders'))) {
    let svg = readFileSync(file, 'utf8');
    const vb = svg.match(/viewBox="([\d.\s-]+)"/)[1].split(/\s+/).map(Number);
    const scale = 2;
    const b = bbox(await raw(svg, scale), 1);
    const pad = 0.5;
    const tight = [round(vb[0] + b.x / scale - pad, 2), round(vb[1] + b.y / scale - pad, 2), round(b.w / scale + 2 * pad, 2), round(b.h / scale + 2 * pad, 2)];
    svg = svg.replace(/viewBox="[^"]+"/, `viewBox="${tight.join(' ')}"`).replace(/ width="[\d.]+" height="[\d.]+"/, ` width="${tight[2]}" height="${tight[3]}"`);
    writeFileSync(file, svg);
    const img = await raw(svg, scale);
    const vis = bbox(img, VISIBLE_ALPHA);
    const need = Math.max(3, Math.round(vis.w * 0.015));
    let base = vis.y + vis.h;
    for (let y = vis.y + vis.h - 1; y >= vis.y; y--) {
      let n = 0;
      for (let x = vis.x; x < vis.x + vis.w; x++) if (img.data[(y * img.W + x) * 4 + 3] >= SOLID_ALPHA) n++;
      if (n >= need) {
        base = y + 1;
        break;
      }
    }
    const entry = {
      kind: 'placeholder',
      src: `assets/placeholders/${id}.svg`,
      width: tight[2],
      height: tight[3],
      srcset: [],
      // edges rounded first, so y + h lands exactly on the rounded bottom edge (no 1e-5 drift)
      visibleBox: { x: round(vis.x / img.W), y: round(vis.y / img.H), w: round(round((vis.x + vis.w) / img.W) - round(vis.x / img.W)), h: round(round((vis.y + vis.h) / img.H) - round(vis.y / img.H)) },
      baseline: round(base / img.H),
    };
    const re = new RegExp(`^  ${id}: .*,$`, 'm');
    if (!re.test(ts)) throw new Error(`no ${id} entry in images.generated.ts`);
    ts = ts.replace(re, `  ${id}: ${JSON.stringify(entry)},`);
    const kb = (Buffer.byteLength(svg) / 1024).toFixed(0);
    console.log(`${id}: ${tight[2]}x${tight[3]} visible aspect ${((entry.width * entry.visibleBox.w) / (entry.height * entry.visibleBox.h)).toFixed(2)} baseline ${entry.baseline} ${kb}KB`);
  }
  writeFileSync(genPath, ts);
  console.log('patched placeholder entries in src/data/images.generated.ts');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === '--refresh') {
    await refresh();
  } else {
    const out = resolve(process.argv[2] ?? 'assets/placeholders');
    for (const f of writePlaceholders(out)) console.log('wrote', f.file);
  }
}
