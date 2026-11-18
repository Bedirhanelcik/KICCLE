/**
 * createShoeFigure: THE rendering primitive for a sneaker. Every package uses
 * it (showroom plinths, detail, collections) so every shoe has the same
 * visible width and sole baseline.
 *
 * DOM produced (styles in src/styles/components.css):
 *
 *   <div class="k-shoe" data-product-id="loam" style="--k-shoe-ar:…; --k-shoe-baseline:…">
 *     <img class="k-shoe__img" src srcset sizes width height alt
 *          decoding="async" loading="eager|lazy" draggable="false" style="left/top/width/height %">
 *   </div>
 *
 * The figure is a box of fixed aspect ratio (the shared SHOE_FRAME) that fills
 * the width of its parent; size it by sizing the parent. Zero layout shift: the
 * box size never depends on the image loading.
 */
import type { Product } from '../types.js';
import { SHOE_FRAME } from '../data/frame.js';
import { boxToRect, pct, placeShoe, srcsetOf, visibleBoxInFrame, type ShoeFrame } from '../lib/scale.js';
import { settleWithin } from '../lib/motion.js';

export interface ShoeFigureOptions {
  /**
   * `sizes` attribute. Default is sized for the detail zoom target
   * (DEFAULT_SHOE_SIZES) so the same element never needs a source swap when
   * the camera moves in.
   */
  sizes?: string;
  /** Default 'eager' (showroom is above the fold). Use 'lazy' for long pages. */
  loading?: 'eager' | 'lazy';
  /** Default 'auto'. */
  fetchPriority?: 'high' | 'low' | 'auto';
  /** Shared frame; override only for special layouts. Default SHOE_FRAME. */
  frame?: ShoeFrame;
  /** Extra class names for the wrapper. */
  className?: string;
  /** Empty alt (when an adjacent label already names the shoe). Default false. */
  decorative?: boolean;
}

export const DEFAULT_SHOE_SIZES = '(max-width: 760px) 92vw, 50vw';

export interface ShoeFigureElement extends HTMLDivElement {
  readonly dataset: DOMStringMap & { productId: string };
}

export function createShoeFigure(product: Product, opts: ShoeFigureOptions = {}): ShoeFigureElement {
  const frame = opts.frame ?? SHOE_FRAME;
  const img = product.image;
  const place = placeShoe(img, frame);
  const baseline = frame.baseline;

  const fig = document.createElement('div') as ShoeFigureElement;
  fig.className = ['k-shoe', opts.className].filter(Boolean).join(' ');
  fig.dataset.productId = product.id;
  fig.dataset.kind = img.kind;
  fig.style.setProperty('--k-shoe-ar', String(frame.aspect));
  fig.style.setProperty('--k-shoe-baseline', pct(baseline));
  fig.style.setProperty('--k-shoe-content', pct(frame.contentWidth));

  const el = document.createElement('img');
  el.className = 'k-shoe__img';
  el.alt = opts.decorative ? '' : product.alt;
  el.width = Math.round(img.width);
  el.height = Math.round(img.height);
  el.decoding = 'async';
  el.loading = opts.loading ?? 'eager';
  el.draggable = false;
  el.setAttribute('fetchpriority', opts.fetchPriority ?? 'auto');
  if (img.srcset.length > 0) {
    el.srcset = srcsetOf(img.srcset);
    el.sizes = opts.sizes ?? DEFAULT_SHOE_SIZES;
  }
  el.src = img.src;
  el.style.left = pct(place.left);
  el.style.top = pct(place.top);
  el.style.width = pct(place.width);
  el.style.height = pct(place.height);
  fig.append(el);
  return fig;
}

/** The <img> inside a figure. */
export function figureImage(fig: Element): HTMLImageElement | null {
  return fig.querySelector<HTMLImageElement>('img.k-shoe__img');
}

/**
 * Resolve once the figure's image is decoded (or failed), at most `timeoutMs`.
 * Never rejects. Use before revealing a figure to avoid pop-in.
 */
export function whenFigureDecoded(fig: Element, timeoutMs = 4000): Promise<void> {
  const img = figureImage(fig);
  if (!img) return Promise.resolve();
  const p = typeof img.decode === 'function' ? img.decode() : Promise.resolve();
  return settleWithin(p, timeoutMs).then(() => undefined);
}

/**
 * Viewport rect of the visible shoe pixels given the figure's rect. Pass the
 * figure's UNTRANSFORMED rect (e.g. its rest rect) to get the rest position.
 */
export function shoeRectWithin(
  product: Product,
  figureRect: { left: number; top: number; width: number; height: number },
  frame: ShoeFrame = SHOE_FRAME,
): DOMRect {
  const r = boxToRect(visibleBoxInFrame(product.image, frame), figureRect);
  return new DOMRect(r.left, r.top, r.width, r.height);
}
