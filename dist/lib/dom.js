export function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)){
        if (v === false || v == null) continue;
        el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children)if (c !== null && c !== undefined && c !== false) el.append(c);
    return el;
}
export function svg(tag, attrs = {}, ...children) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)){
        if (v === false || v == null) continue;
        el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children)if (c !== null && c !== undefined && c !== false) el.append(c);
    return el;
}
export function must(selector, root = document) {
    const el = root.querySelector(selector);
    if (!el) throw new Error(`Missing required element: ${selector}`);
    return el;
}
const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
export function focusables(root) {
    return [
        ...root.querySelectorAll(FOCUSABLE)
    ].filter((el)=>!el.hasAttribute('inert') && !el.closest('[inert],[hidden]') && el.getClientRects().length > 0);
}
export function trapFocus(container, opts = {}) {
    const onKey = (e)=>{
        if (e.key === 'Escape' && opts.onEscape) {
            e.preventDefault();
            opts.onEscape();
            return;
        }
        if (e.key !== 'Tab') return;
        const items = focusables(container);
        if (items.length === 0) {
            e.preventDefault();
            container.focus();
            return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !container.contains(active))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (active === last || !container.contains(active))) {
            e.preventDefault();
            first.focus();
        }
    };
    document.addEventListener('keydown', onKey, true);
    const target = opts.initial ?? focusables(container)[0] ?? container;
    if (target === container && !container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
    target.focus({
        preventScroll: true
    });
    return ()=>document.removeEventListener('keydown', onKey, true);
}
export function transitionEnd(el, timeoutMs, prop) {
    return new Promise((resolve)=>{
        const done = ()=>{
            clearTimeout(id);
            el.removeEventListener('transitionend', onEnd);
            el.removeEventListener('transitioncancel', onEnd);
            resolve();
        };
        const onEnd = (e)=>{
            if (e.target !== el) return;
            if (prop && e.propertyName !== prop) return;
            done();
        };
        const id = setTimeout(done, timeoutMs);
        el.addEventListener('transitionend', onEnd);
        el.addEventListener('transitioncancel', onEnd);
    });
}


//# sourceURL=src\lib\dom.ts