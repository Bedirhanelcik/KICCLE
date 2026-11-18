/**
 * Showroom layout maths (pure, DOM-free, unit-tested in tests/showroom).
 *
 * The room is a gallery wall: a ceiling track with one spot head per column,
 * two tiers of floating acrylic shelves (row 1 = 01–05, row 2 = 06–10) and a
 * floor plane. Every unit has the same width `u`, so every shoe has the same
 * perceived size (createShoeFigure fills the unit's width).
 *
 * Two modes:
 *  - `wall`: the whole wall fits the viewport (wide screens).
 *  - `pan`:  narrow screens. Same 5×2 wall at a readable size; the wall pans
 *            horizontally inside #k-stage, one column centred at a time.
 *
 * All vertical proportions of a unit are expressed in units of `u` so CSS and
 * this module agree (see UNIT_RATIOS and showroom.css).
 */

export const COLUMNS = 5;
export const ROWS = 2;

/** Vertical anatomy of a unit, as fractions of the unit width `u` (CSS mirrors these). */
export const UNIT_RATIOS = {
  /** Plinth front face thickness. */
  slab: 0.03,
  /** Half-depth of the visible top face of the plinth (above and below the sole line). */
  topFace: 0.011,
} as const;

/**
 * Reserved label block below the plinth, px (CSS: --sr-label-h).
 *
 * Zero by design. In the reference composition a pair is named only while it
 * is being looked at, and the caption then sits ON the dark wall just under
 * the lit shelf — so the label is an overlay (showroom.css: .sr-unit__label is
 * positioned below the unit box and does not participate in layout). Keeping
 * the constant means the vertical anatomy below still reads as one formula,
 * and a future design that wants standing labels only has to change this.
 */
export const LABEL_H = 0;

export interface LayoutInput {
  /** Viewport width / height, CSS px. */
  readonly vw: number;
  readonly vh: number;
  /** Nav height, CSS px (72 or 60). */
  readonly navH: number;
  /** SHOE_FRAME.aspect (width / height of the figure). */
  readonly aspect: number;
  /** SHOE_FRAME.baseline (fraction of figure height). */
  readonly baseline: number;
  /**
   * Y of the wall/floor junction in the room photograph, px from the stage
   * top. The two tiers are composed inside the wall band above it so the
   * shelves read as mounted on a real wall with the floor visible below.
   * Defaults to the viewport height (no photo: the old full-viewport behaviour).
   */
  readonly wallBottom?: number;
}

export interface StageLayout {
  readonly mode: 'wall' | 'pan';
  /** Unit (= figure) width, px. Identical for all ten units. */
  readonly u: number;
  /** Figure height, px. */
  readonly figH: number;
  /** Sole line inside the unit, px from the unit top. */
  readonly soleY: number;
  /** Unit height (figure + plinth below the figure + label), px. */
  readonly unitH: number;
  /** Column gap and row gap (between unit boxes), px. */
  readonly gx: number;
  readonly gy: number;
  /** Total width of the scrolling wall (== vw in wall mode), px. */
  readonly wallW: number;
  /** Left edge of column 0 inside the wall, px. */
  readonly gridX: number;
  /** Top of row 0 / row 1, px from the stage top. */
  readonly rowY: readonly [number, number];
  /** Ceiling track y and spot lens y, px. */
  readonly trackY: number;
  readonly lensY: number;
  /** Wall/floor horizon, px. */
  readonly horizonY: number;
  /** Half-angle of the spot cone (deg) so it covers both tiers of its column. */
  readonly coneHalfDeg: number;
  /** Length of the cone from the lens, px. */
  readonly coneLen: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Smallest unit width we accept for the full wall before switching to pan mode. */
export const MIN_WALL_U = 132;
/**
 * Largest unit width. The reference puts the ten pairs across ~87% of the
 * frame with only a narrow margin either side, so the pairs have to grow with
 * the screen rather than sitting in a pool of empty wall. The cap only stops
 * a 2560-wide display from turning them into furniture.
 */
export const MAX_U = 360;
/** Largest unit width in pan mode, where one column has the screen to itself. */
const MAX_PAN_U = 300;
/**
 * Designed gap between two unit boxes, as a fraction of the unit width.
 *
 * Small on purpose. Measured off the reference: the column pitch there is
 * ~254px for a ~211px shoe at 1440, i.e. the shelves very nearly touch. A
 * loose gap is what makes a wall of products read as a catalogue grid instead
 * of a single continuous display.
 */
const GAP_RATIO = 0.075;
/**
 * Upper bound on the gap when the HEIGHT budget forced `u` below what the
 * width could carry. Only then do the bays spread; when `u` is capped by
 * MAX_U the gap stays at GAP_RATIO and the group simply centres.
 */
const GAP_RATIO_SPREAD = 0.16;

/** Unit box height for a unit width `u`: figure, plinth below the sole line, label. */
export function unitHeight(u: number, aspect: number, baseline: number): number {
  const figH = u / aspect;
  const soleY = figH * baseline;
  const plinthBottom = soleY + u * (UNIT_RATIOS.topFace + UNIT_RATIOS.slab);
  return Math.max(figH, plinthBottom) + LABEL_H;
}

export function computeLayout(input: LayoutInput): StageLayout {
  const { vw, vh, navH, aspect, baseline } = input;
  // Side margin of the display itself, and the thing that sets how far back
  // the visitor is standing. At 11% a side the ten pairs occupy ~78% of the
  // frame: enough dark wall around the group that you read it as a wall you
  // are standing in front of, rather than a shelf you have your nose against.
  // (The opening push-in closes the last of that distance; see index.ts.)
  const gutter = clamp(vw * 0.11, 20, 210);
  // The rows live in the wall band of the room photo, not the whole viewport.
  const wallBottom = input.wallBottom ?? vh;
  const availH = Math.max(200, wallBottom - navH);
  const per = (u: number) => unitHeight(u, aspect, baseline);
  // Units of u used vertically: ceiling room, two units, row gap. Constant px parts separate.
  const unitPerU = per(100) / 100 - LABEL_H / 100; // proportional part of unit height
  const ceilPerU = 0.34;
  // Tight, like the reference: the lower row's toes sit just under the upper
  // row's shelf. The two tiers are one display, not two shelves of stock.
  const gapPerU = 0.07;
  const floorMin = clamp(availH * 0.11, 56, 120);
  const ceilMin = 54; // track + fixture head minimum
  const constPx = ceilMin + 2 * LABEL_H + 6 + floorMin;
  const uByH = (availH - constPx) / (ceilPerU + 2 * unitPerU + gapPerU);

  const wallMax = Math.min(vw, 2000);
  const uByW = (wallMax - 2 * gutter) / (COLUMNS + (COLUMNS - 1) * GAP_RATIO);

  const mode: 'wall' | 'pan' = uByW >= MIN_WALL_U ? 'wall' : 'pan';
  let u: number;
  let gx: number;
  let wallW: number;
  let gridX: number;

  if (mode === 'wall') {
    const uCap = Math.min(uByW, MAX_U);
    u = Math.floor(Math.min(uCap, uByH));
    // Only a height-limited layout spreads its bays. When MAX_U (or the width)
    // set the size, the spare width goes to the margins so the ten pairs stay
    // a tight, deliberate group instead of drifting apart across the wall.
    const heightLimited = uByH < uCap;
    const span = Math.min(wallMax, vw) - 2 * gutter;
    const hi = u * (heightLimited ? GAP_RATIO_SPREAD : GAP_RATIO);
    gx = clamp((span - COLUMNS * u) / (COLUMNS - 1), u * GAP_RATIO, hi);
    wallW = vw;
    const gridW = COLUMNS * u + (COLUMNS - 1) * gx;
    gridX = (vw - gridW) / 2;
  } else {
    // Pan keeps the same object scale as the wall: a sneaker is the same size
    // whichever layout you are in, it just gets the screen to itself.
    u = Math.floor(Math.min(clamp(vw * 0.6, 150, MAX_PAN_U), Math.max(150, uByH)));
    gx = Math.round(u * 0.2);
    const pad = (vw - u) / 2; // first and last column can be centred
    wallW = COLUMNS * u + (COLUMNS - 1) * gx + 2 * pad;
    gridX = pad;
  }

  const figH = u / aspect;
  const soleY = figH * baseline;
  const unitH = per(u);

  // Vertical distribution.
  const fixtureLen = clamp(u * 0.15, 20, 40);
  const trackY = navH + 12;
  const lensY = trackY + fixtureLen;
  const ceil = Math.max(ceilMin, u * ceilPerU + fixtureLen * 0.6);
  let gy = u * gapPerU + 6;
  const used = ceil + 2 * unitH + gy + floorMin;
  const extra = Math.max(0, availH - used);
  // Spare height is NOT shared out evenly. In the reference the two tiers sit
  // high on the wall and roughly a third of the frame below them is empty,
  // unlit room — that deep negative space is most of what makes the hall feel
  // big. So the leftover goes mostly to the bottom: a quarter lifts the group
  // clear of the header, almost none opens the gap between the rows, and the
  // remaining ~70% becomes dark wall under the lower shelf.
  const top = navH + ceil + extra * 0.26;
  gy += extra * 0.05;
  const row0 = top;
  const row1 = top + unitH + gy;
  // With a room photo the junction is wherever the photograph puts it; without
  // one, fall back to the old derived line.
  const horizonY =
    input.wallBottom !== undefined
      ? Math.max(row1 + unitH + 4, wallBottom)
      : Math.min(vh - floorMin * 0.55, row1 + unitH + Math.max(12, (vh - (row1 + unitH)) * 0.28));

  // Cone widens to cover the whole lower pair and plinth: half width 0.6u at the lower plinth
  // (the feathered penumbra reaches ~0.75u).
  const lowerPlinth = row1 + soleY + u * UNIT_RATIOS.slab;
  const coneLen = Math.max(1, vh - lensY);
  const coneHalfDeg = (Math.atan2(u * 0.6, Math.max(1, lowerPlinth - lensY)) * 180) / Math.PI;

  return {
    mode,
    u,
    figH: r2(figH),
    soleY: r2(soleY),
    unitH: r2(unitH),
    gx: r2(gx),
    gy: r2(gy),
    wallW: r2(wallW),
    gridX: r2(gridX),
    rowY: [r2(row0), r2(row1)],
    trackY: r2(trackY),
    lensY: r2(lensY),
    horizonY: r2(horizonY),
    coneHalfDeg: r2(coneHalfDeg),
    coneLen: r2(coneLen),
  };
}

/** Column (0..4) and row (0..1) of a product from its showroom position (0..9). */
export function cellOf(position: number): { col: number; row: number } {
  return { col: position % COLUMNS, row: Math.floor(position / COLUMNS) };
}

/** Horizontal centre of a column inside the wall, px. */
export function columnCenter(l: StageLayout, col: number): number {
  return l.gridX + col * (l.u + l.gx) + l.u / 2;
}

/** scrollLeft that centres `col` in a viewport of width `vw` (pan mode), clamped. */
export function scrollForColumn(l: StageLayout, col: number, vw: number): number {
  const max = Math.max(0, l.wallW - vw);
  return clamp(columnCenter(l, col) - vw / 2, 0, max);
}
