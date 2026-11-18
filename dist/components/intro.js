import { prefersReducedMotion, settleWithin, wait } from '../lib/motion.js';
import { whenFigureDecoded } from './shoe-figure.js';
export const INTRO_TIMING = {
    build: 2500,
    ignite: 420,
    leave: 600,
    reducedHold: 1850,
    reducedLeave: 320,
    maxWait: 6000
};
export function runIntro(el, opts) {
    if (!el) {
        return {
            handoff: Promise.resolve(),
            done: Promise.resolve(),
            skipped: true
        };
    }
    const reduced = prefersReducedMotion();
    const minMs = opts.minMs ?? (reduced ? INTRO_TIMING.reducedHold : INTRO_TIMING.build);
    const maxWait = opts.maxWaitMs ?? INTRO_TIMING.maxWait;
    const figures = opts.figures ?? [];
    const total = Math.max(1, figures.length);
    const countEl = el.querySelector('[data-intro-count]');
    const totalEl = el.querySelector('[data-intro-total]');
    if (totalEl) totalEl.textContent = String(figures.length || 10).padStart(2, '0');
    el.dataset.state = reduced ? 'reduced' : 'playing';
    if (!reduced) {
        const chars = [
            ...el.querySelectorAll('.k-intro__ch')
        ];
        const order = chars.map((_, i)=>i);
        for(let i = order.length - 1; i > 0; i--){
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [
                order[j],
                order[i]
            ];
        }
        chars.forEach((c, i)=>c.style.setProperty('--k-ch', String(order[i])));
    }
    let decoded = 0;
    for (const f of figures){
        void whenFigureDecoded(f, maxWait).then(()=>{
            decoded += 1;
        });
    }
    let isReady = false;
    const ready = settleWithin(opts.ready, maxWait).then(()=>{
        isReady = true;
    });
    const start = performance.now();
    let shown = 0;
    let resolveHandoff;
    const handoff = new Promise((r)=>resolveHandoff = r);
    const done = (async ()=>{
        await new Promise((finish)=>{
            const tick = (now)=>{
                const elapsed = now - start;
                const timeFrac = Math.min(1, elapsed / minMs);
                const assetFrac = isReady ? 1 : Math.min(0.92, 0.12 + 0.8 * (decoded / total));
                const target = Math.min(timeFrac, assetFrac);
                shown = reduced ? target : shown + (target - shown) * 0.14;
                if (target >= 1 && shown > 0.985) shown = 1;
                el.style.setProperty('--k-intro-p', shown.toFixed(4));
                if (countEl) countEl.textContent = String(isReady ? total : Math.min(decoded, total)).padStart(2, '0');
                const timedOut = elapsed > maxWait;
                if (shown >= 1 && isReady || timedOut) {
                    el.style.setProperty('--k-intro-p', '1');
                    if (countEl) countEl.textContent = String(total).padStart(2, '0');
                    finish();
                } else {
                    requestAnimationFrame(tick);
                }
            };
            requestAnimationFrame(tick);
        });
        await ready.catch(()=>undefined);
        if (!reduced) {
            el.dataset.state = 'ignite';
            await wait(INTRO_TIMING.ignite);
        }
        el.dataset.state = 'leaving';
        document.documentElement.classList.add('k-intro-leaving');
        resolveHandoff();
        await wait(reduced ? INTRO_TIMING.reducedLeave : INTRO_TIMING.leave);
        el.remove();
        document.documentElement.classList.remove('k-intro-active', 'k-intro-leaving');
    })();
    return {
        handoff,
        done,
        skipped: false
    };
}


//# sourceURL=src\components\intro.ts