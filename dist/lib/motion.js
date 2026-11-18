export const DURATION = {
    instant: 90,
    fast: 180,
    base: 320,
    slow: 560,
    page: 420,
    camera: 1320,
    sweep: 1400,
    intro: 2600,
    introReduced: 350
};
export const EASE = {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',
    in: 'cubic-bezier(0.55, 0, 0.75, 0.2)',
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
    camera: 'cubic-bezier(0.62, 0, 0.14, 1)',
    light: 'cubic-bezier(0.3, 0, 0.1, 1)'
};
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
export function prefersReducedMotion() {
    return typeof matchMedia === 'function' && matchMedia(REDUCED_QUERY).matches;
}
export function onReducedMotionChange(cb) {
    if (typeof matchMedia !== 'function') return ()=>{};
    const mq = matchMedia(REDUCED_QUERY);
    const h = (e)=>cb(e.matches);
    mq.addEventListener('change', h);
    return ()=>mq.removeEventListener('change', h);
}
export function dur(ms, reducedMs = 0, reduced = prefersReducedMotion()) {
    return reduced ? Math.min(ms, reducedMs) : ms;
}
export function wait(ms, signal) {
    return new Promise((resolve)=>{
        if (ms <= 0 || signal?.aborted) return resolve();
        const id = setTimeout(done, ms);
        function done() {
            clearTimeout(id);
            signal?.removeEventListener('abort', done);
            resolve();
        }
        signal?.addEventListener('abort', done, {
            once: true
        });
    });
}
export function nextFrame() {
    return new Promise((r)=>requestAnimationFrame(r));
}
export async function afterPaint() {
    await nextFrame();
    await nextFrame();
}
export function settleWithin(p, ms) {
    return new Promise((resolve)=>{
        const id = setTimeout(()=>resolve(undefined), ms);
        Promise.resolve(p).then((v)=>{
            clearTimeout(id);
            resolve(v);
        }, ()=>{
            clearTimeout(id);
            resolve(undefined);
        });
    });
}
export function animate(el, keyframes, opts = {}) {
    const { signal, reduced = 'skip', ...rest } = opts;
    const isReduced = prefersReducedMotion();
    let frames = keyframes;
    let options = {
        duration: DURATION.base,
        easing: EASE.standard,
        ...rest
    };
    if (isReduced) {
        if (reduced === 'fade') {
            frames = keyframes.map((k)=>'opacity' in k ? {
                    opacity: k.opacity,
                    offset: k.offset
                } : {
                    offset: k.offset
                });
            options = {
                ...options,
                duration: Math.min(Number(options.duration) || 0, 200),
                delay: 0
            };
        } else {
            options = {
                ...options,
                duration: 0,
                delay: 0
            };
        }
    }
    if (typeof el.animate !== 'function') return Promise.resolve();
    const anim = el.animate(frames, options);
    if (signal) {
        if (signal.aborted) anim.finish();
        else signal.addEventListener('abort', ()=>anim.finish(), {
            once: true
        });
    }
    return anim.finished.then(()=>undefined, ()=>undefined);
}


//# sourceURL=src\lib\motion.ts