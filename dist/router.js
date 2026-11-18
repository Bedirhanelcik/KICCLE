import { DURATION, prefersReducedMotion, settleWithin } from './lib/motion.js';
export const BRAND_TITLE = 'KICCLE — FOOTWEAR ARCHIVE';
export const HOOK_TIMEOUT_MS = 4000;
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
export const HOME = {
    name: 'home',
    path: '#/'
};
export function productPath(id) {
    return `#/product/${encodeURIComponent(id)}`;
}
export function parseHash(hash) {
    let raw = hash.trim();
    if (raw.startsWith('#')) raw = raw.slice(1);
    const q = raw.indexOf('?');
    if (q >= 0) raw = raw.slice(0, q);
    const segments = raw.split('/').filter(Boolean);
    if (segments.length === 0) return HOME;
    const [first, second, ...rest] = segments;
    const head = first.toLowerCase();
    if (segments.length === 1) {
        if (head === 'home') return HOME;
        if (head === 'about') return {
            name: 'about',
            path: '#/about'
        };
        if (head === 'faq') return {
            name: 'faq',
            path: '#/faq'
        };
        if (head === 'collections') return {
            name: 'collections',
            path: '#/collections'
        };
    }
    if (head === 'product' && second && rest.length === 0) {
        let id;
        try {
            id = decodeURIComponent(second).toLowerCase();
        } catch  {
            return {
                name: 'notfound',
                path: `#${raw}`
            };
        }
        if (ID_RE.test(id)) return {
            name: 'product',
            path: `#/product/${id}`,
            productId: id
        };
    }
    return {
        name: 'notfound',
        path: `#${raw}`
    };
}
export function surfaceOf(route) {
    return route.name === 'home' || route.name === 'product' ? 'stage' : 'page';
}
export function routeTitle(route, productName) {
    switch(route.name){
        case 'home':
            return BRAND_TITLE;
        case 'about':
            return `About | ${BRAND_TITLE}`;
        case 'faq':
            return `FAQ | ${BRAND_TITLE}`;
        case 'collections':
            return `Collections | ${BRAND_TITLE}`;
        case 'product':
            return `${productName ?? 'Archive piece'} | ${BRAND_TITLE}`;
    }
}
export function sameRoute(a, b) {
    return !!a && !!b && a.path === b.path;
}
function readIdx() {
    const s = history.state;
    return s && typeof s.kIdx === 'number' ? s.kIdx : null;
}
export function createRouter(cfg) {
    let current = null;
    let running = null;
    let pending = null;
    let activeAbort = null;
    const mountedPages = new Set();
    let stageMounted = false;
    let detailMounted = false;
    let idleWaiters = [];
    let lastIdx = 0;
    let started = false;
    const hook = (p)=>settleWithin(p, HOOK_TIMEOUT_MS).then(()=>undefined);
    const resolve = (parsed)=>{
        if (parsed.name === 'notfound') return HOME;
        if (parsed.name === 'product' && !cfg.isKnownProduct(parsed.productId)) return HOME;
        return parsed;
    };
    async function ensureMounted(name) {
        if (mountedPages.has(name)) return;
        mountedPages.add(name);
        await hook(cfg.pages[name].view.mount(cfg.pages[name].root));
    }
    async function transition(from, to, signal) {
        const t = {
            from,
            to,
            initial: from === null,
            reducedMotion: prefersReducedMotion(),
            signal
        };
        cfg.bus.emit('route:change', {
            from,
            to
        });
        cfg.shell.onChange(from, to);
        const fromSurface = from ? surfaceOf(from) : null;
        const toSurface = surfaceOf(to);
        if (from?.name === 'product' && !sameRoute(from, to)) {
            await hook(cfg.detail.view.leave(t));
        }
        if (from && fromSurface === 'page' && !sameRoute(from, to)) {
            const slot = cfg.pages[from.name];
            await Promise.all([
                hook(slot.view.leave(t)),
                cfg.shell.fadeOut(slot.root, t)
            ]);
        }
        if (from && fromSurface === 'stage' && toSurface === 'page') {
            await Promise.all([
                hook(cfg.stage.view.leave(t)),
                cfg.shell.fadeOut(cfg.stage.root, t)
            ]);
        }
        cfg.shell.onSwap(from, to);
        if (toSurface === 'page') {
            const name = to.name;
            await ensureMounted(name);
            await Promise.all([
                hook(cfg.pages[name].view.enter(t)),
                cfg.shell.fadeIn(cfg.pages[name].root, t)
            ]);
        } else {
            if (fromSurface !== 'stage') {
                await Promise.all([
                    hook(cfg.stage.view.enter(t)),
                    cfg.shell.fadeIn(cfg.stage.root, t)
                ]);
            }
            if (to.name === 'product' && !sameRoute(from, to)) {
                await settleWithin(cfg.stage.ready, HOOK_TIMEOUT_MS);
                await hook(cfg.detail.view.enter(t));
            }
        }
        cfg.shell.onSettled(to);
        cfg.bus.emit('route:settled', {
            route: to
        });
    }
    function schedule(to) {
        if (!running && sameRoute(current, to)) return;
        if (running && pending === null && sameRoute(current, to)) return;
        pending = to;
        activeAbort?.abort();
        if (!running) running = pump();
    }
    async function pump() {
        while(pending){
            const to = pending;
            pending = null;
            if (sameRoute(current, to)) continue;
            const from = current;
            current = to;
            activeAbort = new AbortController();
            try {
                await transition(from, to, activeAbort.signal);
            } catch (err) {
                console.error('[router] transition failed', err);
            }
        }
        activeAbort = null;
        running = null;
        const waiters = idleWaiters;
        idleWaiters = [];
        waiters.forEach((w)=>w());
    }
    let backPending = false;
    let backTimer = 0;
    const trail = {};
    let queued = null;
    function releaseBack() {
        if (!backPending) return;
        backPending = false;
        clearTimeout(backTimer);
        const next = queued;
        queued = null;
        if (next) router.navigate(next.path, next.opts);
    }
    function sync() {
        const parsed = parseHash(location.hash);
        const route = resolve(parsed);
        if (readIdx() === null) {
            history.replaceState({
                kIdx: lastIdx + 1
            }, '');
        }
        lastIdx = readIdx() ?? 0;
        if (route.path !== parsed.path || location.hash !== route.path) {
            history.replaceState({
                kIdx: lastIdx
            }, '', route.path);
        }
        trail[lastIdx] = route.path;
        schedule(route);
        releaseBack();
    }
    const router = {
        async prepare () {
            if (!stageMounted) {
                stageMounted = true;
                await hook(cfg.stage.view.mount(cfg.stage.root));
            }
            if (!detailMounted) {
                detailMounted = true;
                await hook(cfg.detail.view.mount(cfg.detail.root));
            }
        },
        async start () {
            if (started) return;
            started = true;
            if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
            await router.prepare();
            if (readIdx() === null) history.replaceState({
                kIdx: 0
            }, '');
            lastIdx = readIdx() ?? 0;
            window.addEventListener('popstate', sync);
            window.addEventListener('hashchange', sync);
            sync();
            await router.idle();
        },
        navigate (path, opts = {}) {
            if (backPending) {
                queued = {
                    path,
                    opts
                };
                return;
            }
            const route = resolve(parseHash(path));
            const from = pending ?? current ?? HOME;
            const swap = from.name === 'product' && route.name === 'product';
            if (opts.replace || swap) {
                if (location.hash === route.path) return;
                history.replaceState({
                    kIdx: lastIdx
                }, '', route.path);
            } else {
                if (location.hash === route.path) return;
                lastIdx += 1;
                history.pushState({
                    kIdx: lastIdx
                }, '', route.path);
            }
            trail[lastIdx] = route.path;
            schedule(route);
        },
        back (fallback = '#/') {
            if (backPending) return;
            const idx = readIdx() ?? 0;
            if (idx > 0 && trail[idx - 1] === fallback) {
                backPending = true;
                clearTimeout(backTimer);
                backTimer = window.setTimeout(releaseBack, 600);
                history.back();
            } else {
                router.navigate(fallback, {
                    replace: true
                });
            }
        },
        current () {
            return pending ?? current ?? HOME;
        },
        idle () {
            if (!running) return Promise.resolve();
            return new Promise((r)=>idleWaiters.push(r));
        }
    };
    return router;
}
export const PAGE_FADE_MS = DURATION.page;


//# sourceURL=src\router.ts