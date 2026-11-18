import { h } from '../lib/dom.js';
export const BRAND_NAME = 'KICCLE';
export const BRAND_SIGNATURE = 'FOOTWEAR ARCHIVE';
export function wordmark(className = '') {
    const mark = h('span', {
        class: `k-wordmark ${className}`.trim()
    });
    [
        ...BRAND_NAME
    ].forEach((ch, i)=>{
        const cls = `k-wordmark__ch${ch === 'I' ? ' k-wordmark__i' : ''}`;
        mark.append(h('span', {
            class: cls,
            style: `--k-ch:${i}`
        }, ch));
    });
    return mark;
}
export function signature(className = '') {
    return h('span', {
        class: `k-signature ${className}`.trim()
    }, BRAND_SIGNATURE);
}
export function lockup(className = '') {
    return h('span', {
        class: `k-lockup ${className}`.trim()
    }, wordmark(), signature());
}


//# sourceURL=src\components\brand.ts