import { SHOE_FRAME } from '../data/frame.js';
import { boxToRect, pct, placeShoe, srcsetOf, visibleBoxInFrame } from '../lib/scale.js';
import { settleWithin } from '../lib/motion.js';
export const DEFAULT_SHOE_SIZES = '(max-width: 760px) 92vw, 50vw';
export function createShoeFigure(product, opts = {}) {
    const frame = opts.frame ?? SHOE_FRAME;
    const img = product.image;
    const place = placeShoe(img, frame);
    const baseline = frame.baseline;
    const fig = document.createElement('div');
    fig.className = [
        'k-shoe',
        opts.className
    ].filter(Boolean).join(' ');
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
export function figureImage(fig) {
    return fig.querySelector('img.k-shoe__img');
}
export function whenFigureDecoded(fig, timeoutMs = 4000) {
    const img = figureImage(fig);
    if (!img) return Promise.resolve();
    const p = typeof img.decode === 'function' ? img.decode() : Promise.resolve();
    return settleWithin(p, timeoutMs).then(()=>undefined);
}
export function shoeRectWithin(product, figureRect, frame = SHOE_FRAME) {
    const r = boxToRect(visibleBoxInFrame(product.image, frame), figureRect);
    return new DOMRect(r.left, r.top, r.width, r.height);
}


//# sourceURL=src\components\shoe-figure.ts