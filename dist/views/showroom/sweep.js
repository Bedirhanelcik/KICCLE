export const REST = -1;
export function sweepSequence(cfg) {
    const seq = [];
    for(let c = 0; c < cfg.columns; c++)seq.push(c);
    for(let i = 0; i < (cfg.restSteps ?? 1); i++)seq.push(REST);
    return seq;
}
export function nextStep(step, length) {
    if (length <= 0) return 0;
    return ((step + 1) % length + length) % length;
}
export function columnAt(seq, step) {
    if (seq.length === 0) return REST;
    const i = (step % seq.length + seq.length) % seq.length;
    return seq[i] ?? REST;
}
export function levelsAt(seq, step, columns) {
    const lit = columnAt(seq, step);
    return Array.from({
        length: columns
    }, (_, c)=>c === lit ? 1 : 0);
}
export function stepInterval(sweepMs) {
    return Math.round(sweepMs * 1.55);
}
export class PauseGate {
    reasons = new Set();
    apiCount = 0;
    set(reason, on) {
        const before = this.running;
        if (on) this.reasons.add(reason);
        else this.reasons.delete(reason);
        return before !== this.running;
    }
    pauseApi() {
        const before = this.running;
        this.apiCount += 1;
        return before !== this.running;
    }
    resumeApi() {
        const before = this.running;
        this.apiCount = Math.max(0, this.apiCount - 1);
        return before !== this.running;
    }
    has(reason) {
        return reason === 'api' ? this.apiCount > 0 : this.reasons.has(reason);
    }
    get running() {
        return this.reasons.size === 0 && this.apiCount === 0;
    }
}
export function encodeExtra(step) {
    return {
        kind: 'kiccle.showroom.v1',
        step
    };
}
export function decodeExtra(extra, length) {
    if (!extra || typeof extra !== 'object') return null;
    const e = extra;
    if (e.kind !== 'kiccle.showroom.v1') return null;
    if (typeof e.step !== 'number' || !Number.isInteger(e.step)) return null;
    if (e.step < 0 || e.step >= length) return null;
    return e.step;
}


//# sourceURL=src\views\showroom\sweep.ts