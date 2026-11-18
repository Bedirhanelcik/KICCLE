/**
 * Camera maths for the product detail (pure, DOM-free, unit-tested).
 *
 * The selected showroom unit is moved with ONE transform on the unit itself:
 *
 *   transform-origin: 0 0;  transform: translate(tx px, ty px) scale(s)
 *
 * so the computed matrix is always matrix(s, 0, 0, s, tx, ty): uniform scale,
 * no rotation, no skew, no flip. Everything here works in viewport pixels from
 * the rects the Stage API returns, so it is independent of where (or whether)
 * the unit sits on screen at rest.
 */

export interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** translate(tx, ty) scale(s) with transform-origin 0 0. */
export interface CameraTransform {
  readonly tx: number;
  readonly ty: number;
  readonly s: number;
}

export const IDENTITY: CameraTransform = Object.freeze({ tx: 0, ty: 0, s: 1 });

/** Breakpoint between the stacked (sheet) and side-panel detail layouts. */
export const SIDE_PANEL_MIN_WIDTH = 760;

export interface DetailLayout {
  readonly mode: 'side' | 'sheet';
  /** Viewport rect of the information panel. */
  readonly panel: RectLike;
  /** Viewport rect the zoomed sneaker (and its platform) must stay inside. */
  readonly stage: RectLike;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Where the panel and the zoomed shoe go for a viewport. CSS reads the panel
 * geometry from custom properties set from this result, so the maths and the
 * rendered panel can never disagree.
 */
export function computeLayout(vw: number, vh: number, navH: number): DetailLayout {
  const usableH = Math.max(0, vh - navH);
  if (vw >= SIDE_PANEL_MIN_WIDTH) {
    const panelW = Math.round(clamp(vw * 0.31, 360, 470));
    return {
      mode: 'side',
      panel: { left: vw - panelW, top: navH, width: panelW, height: usableH },
      stage: { left: 0, top: navH, width: vw - panelW, height: usableH },
    };
  }
  const stageH = Math.round(clamp(usableH * 0.4, 180, 340));
  return {
    mode: 'sheet',
    panel: { left: 0, top: navH + stageH, width: vw, height: Math.max(0, usableH - stageH) },
    stage: { left: 0, top: navH, width: vw, height: stageH },
  };
}

/** Normalised geometry of the shared shoe frame for one product. */
export interface ShoeGeometry {
  /** Visible-pixel box of this product inside the frame (fractions). */
  readonly visibleBox: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** Frame width / height (SHOE_FRAME.aspect). */
  readonly aspect: number;
  /** Sole line as a fraction of frame height (SHOE_FRAME.baseline). */
  readonly baseline: number;
}

export interface TargetOptions {
  /** Largest visible shoe width in px (keeps the image at or below 1:1 with the loaded source). */
  readonly maxShoeWidth?: number;
  /** Share of the stage width the visible shoe may take. */
  readonly fillX?: number;
  /** Space kept free at the top and bottom of the stage area, px. */
  readonly padY?: number;
  /** Space kept free at the left and right of the stage area, px. */
  readonly padX?: number;
}

export interface CameraTarget {
  readonly transform: CameraTransform;
  /** Where the visible shoe pixels end up (viewport). */
  readonly shoe: RectLike;
  /** Where the whole unit box ends up (viewport). */
  readonly unit: RectLike;
  /** Final sole line y (viewport). */
  readonly baselineY: number;
}

/**
 * Aim the camera: scale the unit so the visible shoe has the same width for
 * every product, centre it horizontally in the stage area and put the sole
 * line at the same height, leaving room below for the lit platform.
 *
 * `rest`  untransformed unit rect (StageAPI.getRestRect)
 * `shoe`  visible shoe pixels at rest (StageAPI.getShoeRect)
 */
export function computeTarget(
  rest: RectLike,
  shoe: RectLike,
  geo: ShoeGeometry,
  layout: DetailLayout,
  opts: TargetOptions = {},
): CameraTarget {
  const area = layout.stage;
  const side = layout.mode === 'side';
  const fillX = opts.fillX ?? (side ? 0.72 : 0.84);
  const padY = opts.padY ?? Math.round(clamp(area.height * 0.06, 12, 56));
  const padX = opts.padX ?? Math.round(clamp(area.width * 0.04, 12, 48));

  // Rebuild the frame (identical for every product) from the visible rect.
  const sw = Math.max(1e-6, shoe.width);
  const frameW = sw / geo.visibleBox.w;
  const frameH = frameW / geo.aspect;
  const frameTop = shoe.top - geo.visibleBox.y * frameH;
  const baseRest = frameTop + geo.baseline * frameH;

  // Vertical block in visible-shoe-width units: frame top -> sole, then sole -> platform.
  const above = (baseRest - frameTop) / sw;
  const restBottom = rest.top + rest.height;
  const below = clamp((restBottom - baseRest) / sw, 0.08, 0.4);

  const availH = Math.max(1, area.height - 2 * padY);
  const availW = Math.max(1, area.width - 2 * padX);
  let w = area.width * fillX;
  w = Math.min(w, availH / (above + below));
  w = Math.min(w, (availW * sw) / Math.max(rest.width, sw)); // whole unit stays clear of the panel
  if (opts.maxShoeWidth && opts.maxShoeWidth > 0) w = Math.min(w, opts.maxShoeWidth);
  w = Math.max(w, 1);

  const s = w / sw;
  const blockH = w * (above + below);
  // Optical centre: a touch above the geometric middle of the free space.
  const blockTop = area.top + padY + Math.max(0, (availH - blockH) * 0.46);
  const baseY = blockTop + w * above;
  // Every product lands on the same presentation point. That is not an
  // arbitrary centre: it is what the shared shoe frame exists for, so a trail
  // shoe and a court shoe are read at the same size on the same line. The
  // sense of the camera TRAVELLING comes from the room itself pushing in
  // behind the pair (see applyRoomCamera in the showroom), not from letting
  // each product settle somewhere different.
  const cx = area.left + area.width / 2;

  const anchorX = shoe.left + shoe.width / 2;
  const tx = cx - rest.left - s * (anchorX - rest.left);
  const ty = baseY - rest.top - s * (baseRest - rest.top);
  const transform = { tx, ty, s };
  return {
    transform,
    shoe: mapRect(shoe, rest, transform),
    unit: mapRect(rest, rest, transform),
    baselineY: baseY,
  };
}

/**
 * Re-express a transform computed against a UNIT's own box for the CAMERA
 * layer, whose origin is the viewport's top-left.
 *
 * `computeTarget` works out where a pair has to end up by mapping its rest box
 * with the origin at that box's own top-left. The camera applies one transform
 * to the whole scene from the viewport origin instead, so the same visible
 * result needs the translation shifted by how far the origin moved:
 *
 *   unit space:   x' = rest.left + tx + s (x - rest.left)
 *   scene space:  x' = tx' + s x
 *   =>            tx' = tx + rest.left (1 - s)
 *
 * Without this the pair lands rest.top (1 - s) px off vertically — at a 3.4x
 * close-up that is most of the viewport, and the shoe drops out of frame.
 */
export function toScene(t: CameraTransform, rest: RectLike): CameraTransform {
  return { tx: t.tx + rest.left * (1 - t.s), ty: t.ty + rest.top * (1 - t.s), s: t.s };
}

/** The dolly anchor in SCENE space (viewport px), for a camera-layer move. */
export function sceneAnchor(rest: RectLike, shoe: RectLike, geo: ShoeGeometry): { x: number; y: number } {
  const a = anchorOf(rest, shoe, geo);
  return { x: a.x + rest.left, y: a.y + rest.top };
}

/** Unit-local point (px from the unit's top-left) at the centre of the sole line: the dolly's anchor. */
export function anchorOf(rest: RectLike, shoe: RectLike, geo: ShoeGeometry): { x: number; y: number } {
  const frameW = shoe.width / geo.visibleBox.w;
  const frameH = frameW / geo.aspect;
  const frameTop = shoe.top - geo.visibleBox.y * frameH;
  return { x: shoe.left + shoe.width / 2 - rest.left, y: frameTop + geo.baseline * frameH - rest.top };
}

/** Viewport rect of `r` (given at rest) after applying `t` to a unit whose rest box is `rest`. */
export function mapRect(r: RectLike, rest: RectLike, t: CameraTransform): RectLike {
  return {
    left: rest.left + t.tx + t.s * (r.left - rest.left),
    top: rest.top + t.ty + t.s * (r.top - rest.top),
    width: r.width * t.s,
    height: r.height * t.s,
  };
}

/** CSS transform string. Always the same function list, so WAAPI interpolates per function. */
export function toCss(t: CameraTransform): string {
  return `translate(${round(t.tx, 3)}px, ${round(t.ty, 3)}px) scale(${round(t.s, 5)})`;
}

/**
 * Parse a computed `transform` ('none' | 'matrix(a, b, c, d, e, f)' | 'matrix3d(...)').
 * Returns null if it is not a pure translate + uniform scale (never expected).
 */
export function parseMatrix(css: string): CameraTransform | null {
  const v = css.trim();
  if (v === '' || v === 'none') return IDENTITY;
  const m = /^matrix(3d)?\(([^)]+)\)$/.exec(v);
  if (!m) return null;
  const n = m[2]!.split(',').map((x) => Number(x.trim()));
  if (n.some((x) => !Number.isFinite(x))) return null;
  let a: number, b: number, c: number, d: number, e: number, f: number;
  if (m[1]) {
    if (n.length !== 16) return null;
    [a, b, c, d, e, f] = [n[0]!, n[1]!, n[4]!, n[5]!, n[12]!, n[13]!];
  } else {
    if (n.length !== 6) return null;
    [a, b, c, d, e, f] = n as [number, number, number, number, number, number];
  }
  if (Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6 || Math.abs(a - d) > 1e-6 || a <= 0) return null;
  return { tx: e, ty: f, s: a };
}

// ---------------------------------------------------------------------------
// The dolly path
// ---------------------------------------------------------------------------

/** cubic-bezier(x1, y1, x2, y2) easing as a function of t in [0, 1]. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dsx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) {
      const err = sx(u) - t;
      if (Math.abs(err) < 1e-7) return sy(u);
      const d = dsx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= err / d;
    }
    let lo = 0;
    let hi = 1;
    u = t;
    for (let i = 0; i < 40; i++) {
      const x = sx(u);
      if (Math.abs(x - t) < 1e-7) break;
      if (x < t) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return sy(u);
  };
}

/** Parse 'cubic-bezier(a, b, c, d)' into an easing function (linear fallback). */
export function easingFromCss(css: string): (t: number) => number {
  const m = /cubic-bezier\(([^)]+)\)/.exec(css);
  const n = m ? m[1]!.split(',').map((x) => Number(x.trim())) : [];
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return (t) => t;
  return cubicBezier(n[0]!, n[1]!, n[2]!, n[3]!);
}

/**
 * The camera state at progress p (already eased) between `from` and `to`.
 *
 * A camera dolly changes apparent size multiplicatively, so the scale is
 * interpolated geometrically (constant perceived zoom rate), while the anchor
 * point (the shoe's sole centre, in unit-local px) travels in a straight line
 * on screen. The result is still translate + uniform scale.
 */
export function dollyAt(from: CameraTransform, to: CameraTransform, anchor: { x: number; y: number }, p: number): CameraTransform {
  const s = Math.exp(Math.log(from.s) * (1 - p) + Math.log(to.s) * p);
  const ax = from.tx + from.s * anchor.x;
  const ay = from.ty + from.s * anchor.y;
  const bx = to.tx + to.s * anchor.x;
  const by = to.ty + to.s * anchor.y;
  const qx = ax + (bx - ax) * p;
  const qy = ay + (by - ay) * p;
  return { tx: qx - s * anchor.x, ty: qy - s * anchor.y, s };
}

/**
 * Keyframes for the dolly (linear between keyframes; the easing is baked in),
 * first = `from`, last = `to` exactly.
 */
export function dollyKeyframes(
  from: CameraTransform,
  to: CameraTransform,
  anchor: { x: number; y: number },
  ease: (t: number) => number,
  steps = 36,
): { offset: number; transform: string }[] {
  const n = Math.max(2, Math.round(steps));
  const out: { offset: number; transform: string }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = i === 0 ? 0 : i === n ? 1 : ease(t);
    const k = i === 0 ? from : i === n ? to : dollyAt(from, to, anchor, p);
    out.push({ offset: t, transform: toCss(k) });
  }
  return out;
}

/**
 * How much of a full move remains between `current` and `to`, as a fraction of
 * the move between `full` and `to` (used to shorten interrupted moves).
 */
export function remainingFraction(current: CameraTransform, to: CameraTransform, full: CameraTransform): number {
  const total = Math.abs(Math.log(full.s / to.s));
  if (total < 1e-6) return 1;
  return clamp(Math.abs(Math.log(current.s / to.s)) / total, 0, 1);
}

export function isIdentity(t: CameraTransform, eps = 1e-3): boolean {
  return Math.abs(t.s - 1) < eps && Math.abs(t.tx) < eps * 100 && Math.abs(t.ty) < eps * 100;
}

function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
