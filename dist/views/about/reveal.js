export function createRevealer(targets, opts = {}) {
    let io = null;
    const pending = ()=>targets.filter((el)=>!el.classList.contains('is-in'));
    const reveal = (el)=>{
        if (el.classList.contains('is-in')) return;
        el.classList.add('is-in');
        opts.onReveal?.(el);
    };
    return {
        connect () {
            const left = pending();
            if (left.length === 0) return;
            if (typeof IntersectionObserver !== 'function') {
                left.forEach(reveal);
                return;
            }
            io?.disconnect();
            io = new IntersectionObserver((entries)=>{
                for (const e of entries){
                    if (!e.isIntersecting) continue;
                    reveal(e.target);
                    io?.unobserve(e.target);
                }
                if (pending().length === 0) {
                    io?.disconnect();
                    io = null;
                }
            }, {
                rootMargin: opts.rootMargin ?? '0px 0px -12% 0px',
                threshold: opts.threshold ?? 0.15
            });
            left.forEach((el)=>io.observe(el));
        },
        disconnect () {
            io?.disconnect();
            io = null;
        },
        revealAll () {
            targets.forEach(reveal);
        }
    };
}


//# sourceURL=src\views\about\reveal.ts