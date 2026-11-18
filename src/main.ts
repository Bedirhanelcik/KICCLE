/**
 * KICCLE entry point. Wires data, services, every package module, the shell
 * (nav, footer, intro) and the router. Owned by Package A: packages B/C/D do
 * not edit this file; they only implement the factories imported below.
 */
import type { AppEvents, AppServices, CoreServices, Route, ViewTransition } from './types.js';
import type { PageName, ShellHooks } from './router.js';
import { createRouter, productPath, routeTitle, surfaceOf, type Router } from './router.js';
import { COLLECTIONS, PRODUCTS, getCollection, getProduct, isProductId } from './data/index.js';
import { createBus } from './lib/bus.js';
import { must } from './lib/dom.js';
import { DURATION, afterPaint, dur, settleWithin, wait } from './lib/motion.js';
import { createNav } from './components/nav.js';
import { createFooter } from './components/footer.js';
import { createLogoLoop } from './components/logo-loop.js';
import { runIntro } from './components/intro.js';

// Package B
import { createShowroom } from './views/showroom/index.js';
// Package C
import { createDetail } from './views/detail/index.js';
import { createCart } from './cart/index.js';
// Package D
import { createAboutPage } from './views/about/index.js';
import { createFaqPage } from './views/faq/index.js';
import { createCollectionsPage } from './views/collections/index.js';

function boot(): void {
  const app = must<HTMLElement>('#k-app');
  const stageRoot = must<HTMLElement>('#k-stage');
  const pagesRoot = must<HTMLElement>('#k-pages');
  const detailRoot = must<HTMLElement>('#k-detail');
  const cartRoot = must<HTMLElement>('#k-cart');
  const live = must<HTMLElement>('#k-live');
  const footerRoot = must<HTMLElement>('#k-footer');
  const pageRoots: Record<PageName, HTMLElement> = {
    about: must<HTMLElement>('#k-page-about'),
    faq: must<HTMLElement>('#k-page-faq'),
    collections: must<HTMLElement>('#k-page-collections'),
  };
  for (const el of Object.values(pageRoots)) el.classList.add('k-surface');

  // Keep the app out of the tab order while the intro covers it.
  app.inert = true;

  const bus = createBus<AppEvents>();
  let router!: Router;

  let liveTimer = 0;
  const announce = (message: string) => {
    live.textContent = '';
    clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => (live.textContent = message), 60);
  };

  const cart = createCart();
  const core: CoreServices = {
    products: PRODUCTS,
    collections: COLLECTIONS,
    getProduct,
    getCollection,
    navigate: (path, opts) => router.navigate(path, opts),
    productPath,
    back: (fallback) => router.back(fallback),
    current: () => router.current(),
    bus,
    cart: cart.store,
    announce,
  };

  const showroom = createShowroom(core);
  const services: AppServices = { ...core, stage: showroom };
  const detail = createDetail(services);
  const pages = {
    about: { view: createAboutPage(services), root: pageRoots.about },
    faq: { view: createFaqPage(services), root: pageRoots.faq },
    collections: { view: createCollectionsPage(services), root: pageRoots.collections },
  };

  const navRoot = must<HTMLElement>('#k-nav');
  const nav = createNav(navRoot, cart.store);
  /**
   * The sign over the showroom. It runs only while the room is the surface
   * you are looking at: not on the editorial pages, and not while the camera
   * is inside a product, where the whole header is out of the way anyway.
   */
  const logoLoop = createLogoLoop(navRoot.querySelector<HTMLElement>('.k-nav__mark'));
  createFooter(footerRoot);
  cart.mount(cartRoot, services);

  // ---- shell hooks: surfaces, titles, focus
  const fadeMs = (t: ViewTransition) => dur(DURATION.page, 160, t.reducedMotion);

  /**
   * Where each editorial page was scrolled to when we last left it.
   * Opening a product hides #k-pages, which collapses the document height and
   * drops window.scrollY; without this the Back out of a product would always
   * land at the top of Collections. Matters most on mobile, where the detail
   * is a full sheet and the pages are long.
   */
  const pageScroll = new Map<string, number>();

  const shell: ShellHooks = {
    onChange(_from, to) {
      nav.setActive(to);
      nav.closeMenu();
      document.title = routeTitle(to, to.name === 'product' ? getProduct(to.productId)?.name : undefined);
      document.body.dataset.route = to.name;
      if (to.name === 'home') logoLoop.start();
      else logoLoop.stop();
    },
    onSwap(from, to) {
      const surface = surfaceOf(to);
      if (from && surfaceOf(from) === 'page') pageScroll.set(from.name, window.scrollY);
      document.body.dataset.surface = surface;
      if (surface === 'page') {
        stageRoot.dataset.surfaceState = 'hidden';
        stageRoot.setAttribute('aria-hidden', 'true');
        pagesRoot.dataset.surfaceState = 'in';
        for (const [name, el] of Object.entries(pageRoots)) {
          const active = name === to.name;
          el.hidden = !active;
          if (active && el.dataset.surfaceState !== 'in') el.dataset.surfaceState = 'out';
        }
        if (from?.name !== to.name) {
          // Coming back out of a product: land exactly where the page was left.
          const keep = from?.name === 'product' ? (pageScroll.get(to.name) ?? 0) : 0;
          // The page was display:none a statement ago; force layout so the
          // document is tall enough for the scroll to land instead of clamping.
          void pagesRoot.scrollHeight;
          window.scrollTo(0, keep);
        }
      } else {
        stageRoot.removeAttribute('aria-hidden');
        if (stageRoot.dataset.surfaceState === 'hidden') stageRoot.dataset.surfaceState = 'out';
        pagesRoot.dataset.surfaceState = 'hidden';
        for (const el of Object.values(pageRoots)) el.hidden = true;
      }
    },
    onSettled(route: Route) {
      if (surfaceOf(route) === 'page') {
        const root = pageRoots[route.name as PageName];
        if (document.activeElement === document.body || !root.contains(document.activeElement)) {
          root.focus({ preventScroll: true });
        }
      }
    },
    async fadeOut(root, t) {
      if (t.initial) return;
      root.dataset.surfaceState = 'out';
      await wait(fadeMs(t), t.signal);
    },
    async fadeIn(root, t) {
      if (t.initial) {
        root.dataset.surfaceState = 'in';
        return;
      }
      root.dataset.surfaceState = 'out';
      await afterPaint();
      root.dataset.surfaceState = 'in';
      await wait(fadeMs(t), t.signal);
    },
  };

  router = createRouter({
    bus,
    stage: { view: showroom, root: stageRoot, ready: showroom.ready },
    detail: { view: detail, root: detailRoot },
    pages,
    isKnownProduct: isProductId,
    shell,
  });

  bus.on('route:settled', ({ route }) => {
    if (route.name !== 'home') announce(document.title.split(' | ')[0] ?? document.title);
  });

  // Skip link: hash routing owns the fragment, so move focus by script.
  document.querySelector('[data-skip-link]')?.addEventListener('click', (e) => {
    e.preventDefault();
    const route = router.current();
    const target = surfaceOf(route) === 'page' ? pageRoots[route.name as PageName] : stageRoot;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
  });

  void (async () => {
    await router.prepare();
    const intro = runIntro(document.getElementById('k-intro'), {
      ready: Promise.all([showroom.ready, settleWithin(document.fonts?.ready, 3000)]),
      figures: [...stageRoot.querySelectorAll('.k-shoe')],
    });
    await intro.handoff;
    app.inert = false;
    app.removeAttribute('aria-busy');
    bus.emit('intro:done', { skipped: intro.skipped });
    await router.start();
  })().catch((err) => {
    console.error('[kiccle] boot failed', err);
    document.getElementById('k-intro')?.remove();
    app.inert = false;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
