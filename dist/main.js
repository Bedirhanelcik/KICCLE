import { createRouter, productPath, routeTitle, surfaceOf } from './router.js';
import { COLLECTIONS, PRODUCTS, getCollection, getProduct, isProductId } from './data/index.js';
import { createBus } from './lib/bus.js';
import { must } from './lib/dom.js';
import { DURATION, afterPaint, dur, settleWithin, wait } from './lib/motion.js';
import { createNav } from './components/nav.js';
import { createFooter } from './components/footer.js';
import { createLogoLoop } from './components/logo-loop.js';
import { runIntro } from './components/intro.js';
import { createShowroom } from './views/showroom/index.js';
import { createDetail } from './views/detail/index.js';
import { createCart } from './cart/index.js';
import { createAboutPage } from './views/about/index.js';
import { createFaqPage } from './views/faq/index.js';
import { createCollectionsPage } from './views/collections/index.js';
function boot() {
    const app = must('#k-app');
    const stageRoot = must('#k-stage');
    const pagesRoot = must('#k-pages');
    const detailRoot = must('#k-detail');
    const cartRoot = must('#k-cart');
    const live = must('#k-live');
    const footerRoot = must('#k-footer');
    const pageRoots = {
        about: must('#k-page-about'),
        faq: must('#k-page-faq'),
        collections: must('#k-page-collections')
    };
    for (const el of Object.values(pageRoots))el.classList.add('k-surface');
    app.inert = true;
    const bus = createBus();
    let router;
    let liveTimer = 0;
    const announce = (message)=>{
        live.textContent = '';
        clearTimeout(liveTimer);
        liveTimer = window.setTimeout(()=>live.textContent = message, 60);
    };
    const cart = createCart();
    const core = {
        products: PRODUCTS,
        collections: COLLECTIONS,
        getProduct,
        getCollection,
        navigate: (path, opts)=>router.navigate(path, opts),
        productPath,
        back: (fallback)=>router.back(fallback),
        current: ()=>router.current(),
        bus,
        cart: cart.store,
        announce
    };
    const showroom = createShowroom(core);
    const services = {
        ...core,
        stage: showroom
    };
    const detail = createDetail(services);
    const pages = {
        about: {
            view: createAboutPage(services),
            root: pageRoots.about
        },
        faq: {
            view: createFaqPage(services),
            root: pageRoots.faq
        },
        collections: {
            view: createCollectionsPage(services),
            root: pageRoots.collections
        }
    };
    const navRoot = must('#k-nav');
    const nav = createNav(navRoot, cart.store);
    const logoLoop = createLogoLoop(navRoot.querySelector('.k-nav__mark'));
    createFooter(footerRoot);
    cart.mount(cartRoot, services);
    const fadeMs = (t)=>dur(DURATION.page, 160, t.reducedMotion);
    const pageScroll = new Map();
    const shell = {
        onChange (_from, to) {
            nav.setActive(to);
            nav.closeMenu();
            document.title = routeTitle(to, to.name === 'product' ? getProduct(to.productId)?.name : undefined);
            document.body.dataset.route = to.name;
            if (to.name === 'home') logoLoop.start();
            else logoLoop.stop();
        },
        onSwap (from, to) {
            const surface = surfaceOf(to);
            if (from && surfaceOf(from) === 'page') pageScroll.set(from.name, window.scrollY);
            document.body.dataset.surface = surface;
            if (surface === 'page') {
                stageRoot.dataset.surfaceState = 'hidden';
                stageRoot.setAttribute('aria-hidden', 'true');
                pagesRoot.dataset.surfaceState = 'in';
                for (const [name, el] of Object.entries(pageRoots)){
                    const active = name === to.name;
                    el.hidden = !active;
                    if (active && el.dataset.surfaceState !== 'in') el.dataset.surfaceState = 'out';
                }
                if (from?.name !== to.name) {
                    const keep = from?.name === 'product' ? pageScroll.get(to.name) ?? 0 : 0;
                    void pagesRoot.scrollHeight;
                    window.scrollTo(0, keep);
                }
            } else {
                stageRoot.removeAttribute('aria-hidden');
                if (stageRoot.dataset.surfaceState === 'hidden') stageRoot.dataset.surfaceState = 'out';
                pagesRoot.dataset.surfaceState = 'hidden';
                for (const el of Object.values(pageRoots))el.hidden = true;
            }
        },
        onSettled (route) {
            if (surfaceOf(route) === 'page') {
                const root = pageRoots[route.name];
                if (document.activeElement === document.body || !root.contains(document.activeElement)) {
                    root.focus({
                        preventScroll: true
                    });
                }
            }
        },
        async fadeOut (root, t) {
            if (t.initial) return;
            root.dataset.surfaceState = 'out';
            await wait(fadeMs(t), t.signal);
        },
        async fadeIn (root, t) {
            if (t.initial) {
                root.dataset.surfaceState = 'in';
                return;
            }
            root.dataset.surfaceState = 'out';
            await afterPaint();
            root.dataset.surfaceState = 'in';
            await wait(fadeMs(t), t.signal);
        }
    };
    router = createRouter({
        bus,
        stage: {
            view: showroom,
            root: stageRoot,
            ready: showroom.ready
        },
        detail: {
            view: detail,
            root: detailRoot
        },
        pages,
        isKnownProduct: isProductId,
        shell
    });
    bus.on('route:settled', ({ route })=>{
        if (route.name !== 'home') announce(document.title.split(' | ')[0] ?? document.title);
    });
    document.querySelector('[data-skip-link]')?.addEventListener('click', (e)=>{
        e.preventDefault();
        const route = router.current();
        const target = surfaceOf(route) === 'page' ? pageRoots[route.name] : stageRoot;
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus();
    });
    void (async ()=>{
        await router.prepare();
        const intro = runIntro(document.getElementById('k-intro'), {
            ready: Promise.all([
                showroom.ready,
                settleWithin(document.fonts?.ready, 3000)
            ]),
            figures: [
                ...stageRoot.querySelectorAll('.k-shoe')
            ]
        });
        await intro.handoff;
        app.inert = false;
        app.removeAttribute('aria-busy');
        bus.emit('intro:done', {
            skipped: intro.skipped
        });
        await router.start();
    })().catch((err)=>{
        console.error('[kiccle] boot failed', err);
        document.getElementById('k-intro')?.remove();
        app.inert = false;
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {
        once: true
    });
} else {
    boot();
}


//# sourceURL=src\main.ts