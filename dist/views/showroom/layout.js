export const COLUMNS = 5;
export const ROWS = 2;
export const UNIT_RATIOS = {
    slab: 0.03,
    topFace: 0.011
};
export const LABEL_H = 0;
const clamp = (v, lo, hi)=>Math.min(hi, Math.max(lo, v));
const r2 = (v)=>Math.round(v * 100) / 100;
export const MIN_WALL_U = 132;
export const MAX_U = 360;
const MAX_PAN_U = 300;
const GAP_RATIO = 0.075;
const GAP_RATIO_SPREAD = 0.16;
export function unitHeight(u, aspect, baseline) {
    const figH = u / aspect;
    const soleY = figH * baseline;
    const plinthBottom = soleY + u * (UNIT_RATIOS.topFace + UNIT_RATIOS.slab);
    return Math.max(figH, plinthBottom) + LABEL_H;
}
export function computeLayout(input) {
    const { vw, vh, navH, aspect, baseline } = input;
    const gutter = clamp(vw * 0.11, 20, 210);
    const wallBottom = input.wallBottom ?? vh;
    const availH = Math.max(200, wallBottom - navH);
    const per = (u)=>unitHeight(u, aspect, baseline);
    const unitPerU = per(100) / 100 - LABEL_H / 100;
    const ceilPerU = 0.34;
    const gapPerU = 0.07;
    const floorMin = clamp(availH * 0.11, 56, 120);
    const ceilMin = 54;
    const constPx = ceilMin + 2 * LABEL_H + 6 + floorMin;
    const uByH = (availH - constPx) / (ceilPerU + 2 * unitPerU + gapPerU);
    const wallMax = Math.min(vw, 2000);
    const uByW = (wallMax - 2 * gutter) / (COLUMNS + (COLUMNS - 1) * GAP_RATIO);
    const mode = uByW >= MIN_WALL_U ? 'wall' : 'pan';
    let u;
    let gx;
    let wallW;
    let gridX;
    if (mode === 'wall') {
        const uCap = Math.min(uByW, MAX_U);
        u = Math.floor(Math.min(uCap, uByH));
        const heightLimited = uByH < uCap;
        const span = Math.min(wallMax, vw) - 2 * gutter;
        const hi = u * (heightLimited ? GAP_RATIO_SPREAD : GAP_RATIO);
        gx = clamp((span - COLUMNS * u) / (COLUMNS - 1), u * GAP_RATIO, hi);
        wallW = vw;
        const gridW = COLUMNS * u + (COLUMNS - 1) * gx;
        gridX = (vw - gridW) / 2;
    } else {
        u = Math.floor(Math.min(clamp(vw * 0.6, 150, MAX_PAN_U), Math.max(150, uByH)));
        gx = Math.round(u * 0.2);
        const pad = (vw - u) / 2;
        wallW = COLUMNS * u + (COLUMNS - 1) * gx + 2 * pad;
        gridX = pad;
    }
    const figH = u / aspect;
    const soleY = figH * baseline;
    const unitH = per(u);
    const fixtureLen = clamp(u * 0.15, 20, 40);
    const trackY = navH + 12;
    const lensY = trackY + fixtureLen;
    const ceil = Math.max(ceilMin, u * ceilPerU + fixtureLen * 0.6);
    let gy = u * gapPerU + 6;
    const used = ceil + 2 * unitH + gy + floorMin;
    const extra = Math.max(0, availH - used);
    const top = navH + ceil + extra * 0.26;
    gy += extra * 0.05;
    const row0 = top;
    const row1 = top + unitH + gy;
    const horizonY = input.wallBottom !== undefined ? Math.max(row1 + unitH + 4, wallBottom) : Math.min(vh - floorMin * 0.55, row1 + unitH + Math.max(12, (vh - (row1 + unitH)) * 0.28));
    const lowerPlinth = row1 + soleY + u * UNIT_RATIOS.slab;
    const coneLen = Math.max(1, vh - lensY);
    const coneHalfDeg = Math.atan2(u * 0.6, Math.max(1, lowerPlinth - lensY)) * 180 / Math.PI;
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
        rowY: [
            r2(row0),
            r2(row1)
        ],
        trackY: r2(trackY),
        lensY: r2(lensY),
        horizonY: r2(horizonY),
        coneHalfDeg: r2(coneHalfDeg),
        coneLen: r2(coneLen)
    };
}
export function cellOf(position) {
    return {
        col: position % COLUMNS,
        row: Math.floor(position / COLUMNS)
    };
}
export function columnCenter(l, col) {
    return l.gridX + col * (l.u + l.gx) + l.u / 2;
}
export function scrollForColumn(l, col, vw) {
    const max = Math.max(0, l.wallW - vw);
    return clamp(columnCenter(l, col) - vw / 2, 0, max);
}


//# sourceURL=src\views\showroom\layout.ts