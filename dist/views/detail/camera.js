export const IDENTITY = Object.freeze({
    tx: 0,
    ty: 0,
    s: 1
});
export const SIDE_PANEL_MIN_WIDTH = 760;
const clamp = (v, lo, hi)=>Math.min(hi, Math.max(lo, v));
export function computeLayout(vw, vh, navH) {
    const usableH = Math.max(0, vh - navH);
    if (vw >= SIDE_PANEL_MIN_WIDTH) {
        const panelW = Math.round(clamp(vw * 0.31, 360, 470));
        return {
            mode: 'side',
            panel: {
                left: vw - panelW,
                top: navH,
                width: panelW,
                height: usableH
            },
            stage: {
                left: 0,
                top: navH,
                width: vw - panelW,
                height: usableH
            }
        };
    }
    const stageH = Math.round(clamp(usableH * 0.4, 180, 340));
    return {
        mode: 'sheet',
        panel: {
            left: 0,
            top: navH + stageH,
            width: vw,
            height: Math.max(0, usableH - stageH)
        },
        stage: {
            left: 0,
            top: navH,
            width: vw,
            height: stageH
        }
    };
}
export function computeTarget(rest, shoe, geo, layout, opts = {}) {
    const area = layout.stage;
    const side = layout.mode === 'side';
    const fillX = opts.fillX ?? (side ? 0.72 : 0.84);
    const padY = opts.padY ?? Math.round(clamp(area.height * 0.06, 12, 56));
    const padX = opts.padX ?? Math.round(clamp(area.width * 0.04, 12, 48));
    const sw = Math.max(1e-6, shoe.width);
    const frameW = sw / geo.visibleBox.w;
    const frameH = frameW / geo.aspect;
    const frameTop = shoe.top - geo.visibleBox.y * frameH;
    const baseRest = frameTop + geo.baseline * frameH;
    const above = (baseRest - frameTop) / sw;
    const restBottom = rest.top + rest.height;
    const below = clamp((restBottom - baseRest) / sw, 0.08, 0.4);
    const availH = Math.max(1, area.height - 2 * padY);
    const availW = Math.max(1, area.width - 2 * padX);
    let w = area.width * fillX;
    w = Math.min(w, availH / (above + below));
    w = Math.min(w, availW * sw / Math.max(rest.width, sw));
    if (opts.maxShoeWidth && opts.maxShoeWidth > 0) w = Math.min(w, opts.maxShoeWidth);
    w = Math.max(w, 1);
    const s = w / sw;
    const blockH = w * (above + below);
    const blockTop = area.top + padY + Math.max(0, (availH - blockH) * 0.46);
    const baseY = blockTop + w * above;
    const cx = area.left + area.width / 2;
    const anchorX = shoe.left + shoe.width / 2;
    const tx = cx - rest.left - s * (anchorX - rest.left);
    const ty = baseY - rest.top - s * (baseRest - rest.top);
    const transform = {
        tx,
        ty,
        s
    };
    return {
        transform,
        shoe: mapRect(shoe, rest, transform),
        unit: mapRect(rest, rest, transform),
        baselineY: baseY
    };
}
export function toScene(t, rest) {
    return {
        tx: t.tx + rest.left * (1 - t.s),
        ty: t.ty + rest.top * (1 - t.s),
        s: t.s
    };
}
export function sceneAnchor(rest, shoe, geo) {
    const a = anchorOf(rest, shoe, geo);
    return {
        x: a.x + rest.left,
        y: a.y + rest.top
    };
}
export function anchorOf(rest, shoe, geo) {
    const frameW = shoe.width / geo.visibleBox.w;
    const frameH = frameW / geo.aspect;
    const frameTop = shoe.top - geo.visibleBox.y * frameH;
    return {
        x: shoe.left + shoe.width / 2 - rest.left,
        y: frameTop + geo.baseline * frameH - rest.top
    };
}
export function mapRect(r, rest, t) {
    return {
        left: rest.left + t.tx + t.s * (r.left - rest.left),
        top: rest.top + t.ty + t.s * (r.top - rest.top),
        width: r.width * t.s,
        height: r.height * t.s
    };
}
export function toCss(t) {
    return `translate(${round(t.tx, 3)}px, ${round(t.ty, 3)}px) scale(${round(t.s, 5)})`;
}
export function parseMatrix(css) {
    const v = css.trim();
    if (v === '' || v === 'none') return IDENTITY;
    const m = /^matrix(3d)?\(([^)]+)\)$/.exec(v);
    if (!m) return null;
    const n = m[2].split(',').map((x)=>Number(x.trim()));
    if (n.some((x)=>!Number.isFinite(x))) return null;
    let a, b, c, d, e, f;
    if (m[1]) {
        if (n.length !== 16) return null;
        [a, b, c, d, e, f] = [
            n[0],
            n[1],
            n[4],
            n[5],
            n[12],
            n[13]
        ];
    } else {
        if (n.length !== 6) return null;
        [a, b, c, d, e, f] = n;
    }
    if (Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6 || Math.abs(a - d) > 1e-6 || a <= 0) return null;
    return {
        tx: e,
        ty: f,
        s: a
    };
}
export function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sx = (u)=>((ax * u + bx) * u + cx) * u;
    const sy = (u)=>((ay * u + by) * u + cy) * u;
    const dsx = (u)=>(3 * ax * u + 2 * bx) * u + cx;
    return (t)=>{
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        let u = t;
        for(let i = 0; i < 8; i++){
            const err = sx(u) - t;
            if (Math.abs(err) < 1e-7) return sy(u);
            const d = dsx(u);
            if (Math.abs(d) < 1e-6) break;
            u -= err / d;
        }
        let lo = 0;
        let hi = 1;
        u = t;
        for(let i = 0; i < 40; i++){
            const x = sx(u);
            if (Math.abs(x - t) < 1e-7) break;
            if (x < t) lo = u;
            else hi = u;
            u = (lo + hi) / 2;
        }
        return sy(u);
    };
}
export function easingFromCss(css) {
    const m = /cubic-bezier\(([^)]+)\)/.exec(css);
    const n = m ? m[1].split(',').map((x)=>Number(x.trim())) : [];
    if (n.length !== 4 || n.some((x)=>!Number.isFinite(x))) return (t)=>t;
    return cubicBezier(n[0], n[1], n[2], n[3]);
}
export function dollyAt(from, to, anchor, p) {
    const s = Math.exp(Math.log(from.s) * (1 - p) + Math.log(to.s) * p);
    const ax = from.tx + from.s * anchor.x;
    const ay = from.ty + from.s * anchor.y;
    const bx = to.tx + to.s * anchor.x;
    const by = to.ty + to.s * anchor.y;
    const qx = ax + (bx - ax) * p;
    const qy = ay + (by - ay) * p;
    return {
        tx: qx - s * anchor.x,
        ty: qy - s * anchor.y,
        s
    };
}
export function dollyKeyframes(from, to, anchor, ease, steps = 36) {
    const n = Math.max(2, Math.round(steps));
    const out = [];
    for(let i = 0; i <= n; i++){
        const t = i / n;
        const p = i === 0 ? 0 : i === n ? 1 : ease(t);
        const k = i === 0 ? from : i === n ? to : dollyAt(from, to, anchor, p);
        out.push({
            offset: t,
            transform: toCss(k)
        });
    }
    return out;
}
export function remainingFraction(current, to, full) {
    const total = Math.abs(Math.log(full.s / to.s));
    if (total < 1e-6) return 1;
    return clamp(Math.abs(Math.log(current.s / to.s)) / total, 0, 1);
}
export function isIdentity(t, eps = 1e-3) {
    return Math.abs(t.s - 1) < eps && Math.abs(t.tx) < eps * 100 && Math.abs(t.ty) < eps * 100;
}
function round(v, d) {
    const f = 10 ** d;
    return Math.round(v * f) / f;
}


//# sourceURL=src\views\detail\camera.ts