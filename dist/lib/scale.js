function imageHeightInWidthUnits(m, contentWidth) {
    const imgW = contentWidth / m.visibleBox.w;
    return imgW * (m.height / m.width);
}
export function computeFrame(images, opts = {}) {
    const contentWidth = opts.contentWidth ?? 0.9;
    const headroom = opts.headroom ?? 0.03;
    const footroom = opts.footroom ?? 0.03;
    if (images.length === 0) throw new Error('computeFrame: no images');
    let above = 0;
    let below = 0;
    for (const m of images){
        const h = imageHeightInWidthUnits(m, contentWidth);
        above = Math.max(above, (m.baseline - m.visibleBox.y) * h);
        below = Math.max(below, Math.max(0, m.visibleBox.y + m.visibleBox.h - m.baseline) * h);
    }
    const heightInWidthUnits = headroom + above + Math.max(footroom, below + 0.005);
    return {
        aspect: round(1 / heightInWidthUnits),
        contentWidth,
        baseline: round((headroom + above) / heightInWidthUnits)
    };
}
export function placeShoe(m, frame) {
    const width = frame.contentWidth / m.visibleBox.w;
    const heightW = width * (m.height / m.width);
    const height = heightW * frame.aspect;
    const left = 0.5 - (m.visibleBox.x + m.visibleBox.w / 2) * width;
    const top = frame.baseline - m.baseline * height;
    return {
        left: round(left),
        top: round(top),
        width: round(width),
        height: round(height)
    };
}
export function visibleBoxInFrame(m, frame) {
    const p = placeShoe(m, frame);
    return {
        x: p.left + m.visibleBox.x * p.width,
        y: p.top + m.visibleBox.y * p.height,
        w: m.visibleBox.w * p.width,
        h: m.visibleBox.h * p.height
    };
}
export function baselineInFrame(m, frame) {
    const p = placeShoe(m, frame);
    return p.top + m.baseline * p.height;
}
export function boxToRect(box, frameRect) {
    return {
        left: frameRect.left + box.x * frameRect.width,
        top: frameRect.top + box.y * frameRect.height,
        width: box.w * frameRect.width,
        height: box.h * frameRect.height
    };
}
export function srcsetOf(candidates) {
    return candidates.map((c)=>`${c.src} ${c.width}w`).join(', ');
}
export function pct(v) {
    return `${(v * 100).toFixed(4)}%`;
}
function round(v) {
    return Math.round(v * 1e6) / 1e6;
}


//# sourceURL=src\lib\scale.ts