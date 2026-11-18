/**
 * KICCLE brand marks. The wordmark is real text ("KICCLE") so it is readable
 * by assistive tech and search; the I is styled as a lit LED filament.
 */
import { h } from '../lib/dom.js';

export const BRAND_NAME = 'KICCLE';
export const BRAND_SIGNATURE = 'FOOTWEAR ARCHIVE';

/**
 * The wordmark, one span per letter so each can be lit on its own — the sign
 * is six LED letters, not a word with a special I. The spans carry no ARIA:
 * the text content is still exactly "KICCLE" to anything that reads it.
 */
export function wordmark(className = ''): HTMLSpanElement {
  const mark = h('span', { class: `k-wordmark ${className}`.trim() });
  [...BRAND_NAME].forEach((ch, i) => {
    const cls = `k-wordmark__ch${ch === 'I' ? ' k-wordmark__i' : ''}`;
    mark.append(h('span', { class: cls, style: `--k-ch:${i}` }, ch));
  });
  return mark;
}

/** `<span class="k-signature">FOOTWEAR ARCHIVE</span>` */
export function signature(className = ''): HTMLSpanElement {
  return h('span', { class: `k-signature ${className}`.trim() }, BRAND_SIGNATURE);
}

/** Wordmark stacked over the signature, as one lockup. */
export function lockup(className = ''): HTMLSpanElement {
  return h('span', { class: `k-lockup ${className}`.trim() }, wordmark(), signature());
}
