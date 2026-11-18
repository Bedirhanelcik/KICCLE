/**
 * Scale normalisation maths (pure, DOM-free, unit-tested).
 *
 * Every sneaker is drawn inside a FRAME: a box of fixed aspect ratio shared by
 * all products. Inside the frame each image is positioned so that
 *   1. the width of its VISIBLE pixels equals `frame.contentWidth` (same for all),
 *   2. its visible pixels are horizontally centred,
 *   3. its sole baseline sits exactly on `frame.baseline`.
 * Transparent padding therefore comes from layout, never from editing images.
 */

import type { ProductImage, UnitBox } from '../types.js';

export type ShoeMetrics = Pick<ProductImage, 'width' | 'height' | 'visibleBox' | 'baseline'>;

export interface ShoeFrame {
  /** Frame width / height. */
  readonly aspect: number;
  /** Visible shoe width as a fraction of frame width (identical for every shoe). */
  readonly contentWidth: number;
  /** Sole line as a fraction of frame height from the top. */
  readonly baseline: number;
}

/** Image box inside the frame, as fractions of frame width (x, w) and height (y, h). */
export interface ShoePlacement {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameOptions {
  /** Visible width / frame width. Default 0.9. */
  contentWidth?: number;
  /** Air above the tallest shoe, in frame-width units. Default 0.03. */
  headroom?: number;
  /** Air below the baseline, in frame-width units. Default 0.03. */
  footroom?: number;
}

/** Height of the image box in frame-WIDTH units when its visible width is `contentWidth`. */
function imageHeightInWidthUnits(m: ShoeMetrics, contentWidth: number): number {
  const imgW = contentWidth / m.visibleBox.w;
  return imgW * (m.height / m.width);
}

/**
 * Computes the shared frame so the tallest shoe (measured from its visible top
 * down to its baseline) fits under `headroom`, and anything hanging below a
 * baseline fits in `footroom`.
 */
export function computeFrame(images: readonly ShoeMetrics[], opts: FrameOptions = {}): ShoeFrame {
  const contentWidth = opts.contentWidth ?? 0.9;
  const headroom = opts.headroom ?? 0.03;
  const footroom = opts.footroom ?? 0.03;
  if (images.length === 0) throw new Error('computeFrame: no images');
  let above = 0;
  let below = 0;
  for (const m of images) {
    const h = imageHeightInWidthUnits(m, contentWidth);
    above = Math.max(above, (m.baseline - m.visibleBox.y) * h);
    below = Math.max(below, Math.max(0, m.visibleBox.y + m.visibleBox.h - m.baseline) * h);
  }
  const heightInWidthUnits = headroom + above + Math.max(footroom, below + 0.005);
  return {
    aspect: round(1 / heightInWidthUnits),
    contentWidth,
    baseline: round((headroom + above) / heightInWidthUnits),
  };
}

/** Where to put the image box inside the frame. */
export function placeShoe(m: ShoeMetrics, frame: ShoeFrame): ShoePlacement {
  const width = frame.contentWidth / m.visibleBox.w;
  const heightW = width * (m.height / m.width); // frame-width units
  const height = heightW * frame.aspect; // frame-height fraction
  const left = 0.5 - (m.visibleBox.x + m.visibleBox.w / 2) * width;
  const top = frame.baseline - m.baseline * height;
  return { left: round(left), top: round(top), width: round(width), height: round(height) };
}

/** Visible-pixel box of a placed shoe, as fractions of the frame. */
export function visibleBoxInFrame(m: ShoeMetrics, frame: ShoeFrame): UnitBox {
  const p = placeShoe(m, frame);
  return {
    x: p.left + m.visibleBox.x * p.width,
    y: p.top + m.visibleBox.y * p.height,
    w: m.visibleBox.w * p.width,
    h: m.visibleBox.h * p.height,
  };
}

/** Sole line of a placed shoe, as a fraction of frame height. */
export function baselineInFrame(m: ShoeMetrics, frame: ShoeFrame): number {
  const p = placeShoe(m, frame);
  return p.top + m.baseline * p.height;
}

/**
 * Map a frame-relative box to a concrete rect given the frame's rendered rect
 * (e.g. from getBoundingClientRect at rest). Works with any DOMRect-like.
 */
export function boxToRect(
  box: UnitBox,
  frameRect: { left: number; top: number; width: number; height: number },
): { left: number; top: number; width: number; height: number } {
  return {
    left: frameRect.left + box.x * frameRect.width,
    top: frameRect.top + box.y * frameRect.height,
    width: box.w * frameRect.width,
    height: box.h * frameRect.height,
  };
}

/** `"1600w"`-style srcset string from candidates. */
export function srcsetOf(candidates: readonly { src: string; width: number }[]): string {
  return candidates.map((c) => `${c.src} ${c.width}w`).join(', ');
}

/** Percentage string for inline styles, 4 decimals. */
export function pct(v: number): string {
  return `${(v * 100).toFixed(4)}%`;
}

function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
