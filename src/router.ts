/**
 * Hash router + view lifecycle orchestration.
 *
 * Routes: '#/' home, '#/about', '#/faq', '#/collections', '#/product/<id>'.
 * Pure helpers (parseHash, productPath, surfaceOf, routeTitle) are DOM-free
 * and unit-tested. `createRouter` wires them to history + the views.
 */
import type {
  AppEvents,
  EventBus,
  ParsedRoute,
  Route,
  RoutePath,
  Surface,
  View,
  ViewTransition,
} from './types.js';
import { DURATION, prefersReducedMotion, settleWithin } from './lib/motion.js';

export const BRAND_TITLE = 'KICCLE — FOOTWEAR ARCHIVE';
/** Each lifecycle hook is time-boxed so a faulty view can never lock navigation. */
export const HOOK_TIMEOUT_MS = 4000;

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export const HOME: Route = { name: 'home', path: '#/' };

export function productPath(id: string): RoutePath {
  return `#/product/${encodeURIComponent(id)}`;
}

/**
 * Parse `location.hash`-style input. Tolerates a missing '#', missing leading
 * slash, trailing slashes, query strings and case in static segments.
 * Unknown paths -> { name: 'notfound' }. Product ids are NOT validated
 * against data here (the router does that).
 */
export function parseHash(hash: string): ParsedRoute {
  let raw = hash.trim();
  if (raw.startsWith('#')) raw = raw.slice(1);
  const q = raw.indexOf('?');
  if (q >= 0) raw = raw.slice(0, q);
  const segments = raw.split('/').filter(Boolean);
  if (segments.length === 0) return HOME;
  const [first, second, ...rest] = segments;
  const head = first!.toLowerCase();
  if (segments.length === 1) {
    if (head === 'home') return HOME;
    if (head === 'about') return { name: 'about', path: '#/about' };
    if (head === 'faq') return { name: 'faq', path: '#/faq' };
    if (head === 'collections') return { name: 'collections', path: '#/collections' };
  }
  if (head === 'product' && second && rest.length === 0) {
    let id: string;
    try {
      id = decodeURIComponent(second).toLowerCase();
    } catch {
      return { name: 'notfound', path: `#${raw}` };
    }
    if (ID_RE.test(id)) return { name: 'product', path: `#/product/${id}`, productId: id };
  }
  return { name: 'notfound', path: `#${raw}` };
}

export function surfaceOf(route: Route): Surface {
  return route.name === 'home' || route.name === 'product' ? 'stage' : 'page';
}

export function routeTitle(route: Route, productName?: string): string {
  switch (route.name) {
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

export function sameRoute(a: Route | null, b: Route | null): boolean {
  return !!a && !!b && a.path === b.path;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export type PageName = 'about' | 'faq' | 'collections';

export interface PageSlot {
  readonly view: View;
  readonly root: HTMLElement;
}

export interface ShellHooks {
  /** Navigation started: update nav active state, title, announce, etc. */
  onChange(from: Route | null, to: Route): void;
  /** Leave phase done, before enter: swap surfaces (show/hide layers, footer, scroll). */
  onSwap(from: Route | null, to: Route): void;
  /** Enter phase done. */
  onSettled(route: Route): void;
  /** Cross-fade a surface root out/in (shell-owned CSS), resolves when done. */
  fadeOut(root: HTMLElement, t: ViewTransition): Promise<void>;
  fadeIn(root: HTMLElement, t: ViewTransition): Promise<void>;
}

export interface RouterConfig {
  readonly bus: EventBus<AppEvents>;
  readonly stage: { readonly view: View; readonly root: HTMLElement; readonly ready: Promise<void> };
  readonly detail: { readonly view: View; readonly root: HTMLElement };
  readonly pages: Readonly<Record<PageName, PageSlot>>;
  readonly isKnownProduct: (id: string) => boolean;
  readonly shell: ShellHooks;
}

export interface Router {
  /** Mount the stage and detail views (idempotent). Call before the intro so images load under it. */
  prepare(): Promise<void>;
  /** Resolve the current hash and run the initial transition (calls prepare). Call once. */
  start(): Promise<void>;
  navigate(path: RoutePath, opts?: { replace?: boolean }): void;
  back(fallback?: RoutePath): void;
  current(): Route;
  /** Resolves when no navigation is running or queued. */
  idle(): Promise<void>;
}

interface HistoryState {
  kIdx: number;
}

function readIdx(): number | null {
  const s = history.state as Partial<HistoryState> | null;
  return s && typeof s.kIdx === 'number' ? s.kIdx : null;
}

export function createRouter(cfg: RouterConfig): Router {
  let current: Route | null = null; // last route whose transition started
  let running: Promise<void> | null = null;
  let pending: Route | null = null;
  let activeAbort: AbortController | null = null;
  const mountedPages = new Set<PageName>();
  let stageMounted = false;
  let detailMounted = false;
  let idleWaiters: (() => void)[] = [];
  let lastIdx = 0;
  let started = false;

  const hook = (p: void | Promise<void>) => settleWithin(p, HOOK_TIMEOUT_MS).then(() => undefined);

  const resolve = (parsed: ParsedRoute): Route => {
    if (parsed.name === 'notfound') return HOME;
    if (parsed.name === 'product' && !cfg.isKnownProduct(parsed.productId)) return HOME;
    return parsed;
  };

  async function ensureMounted(name: PageName): Promise<void> {
    if (mountedPages.has(name)) return;
    mountedPages.add(name);
    await hook(cfg.pages[name].view.mount(cfg.pages[name].root));
  }

  async function transition(from: Route | null, to: Route, signal: AbortSignal): Promise<void> {
    const t: ViewTransition = { from, to, initial: from === null, reducedMotion: prefersReducedMotion(), signal };
    cfg.bus.emit('route:change', { from, to });
    cfg.shell.onChange(from, to);

    const fromSurface = from ? surfaceOf(from) : null;
    const toSurface = surfaceOf(to);

    // ---- leave phase
    if (from?.name === 'product' && !sameRoute(from, to)) {
      await hook(cfg.detail.view.leave(t));
    }
    if (from && fromSurface === 'page' && !sameRoute(from, to)) {
      const slot = cfg.pages[from.name as PageName];
      await Promise.all([hook(slot.view.leave(t)), cfg.shell.fadeOut(slot.root, t)]);
    }
    if (from && fromSurface === 'stage' && toSurface === 'page') {
      await Promise.all([hook(cfg.stage.view.leave(t)), cfg.shell.fadeOut(cfg.stage.root, t)]);
    }

    // ---- swap
    cfg.shell.onSwap(from, to);

    // ---- enter phase
    if (toSurface === 'page') {
      const name = to.name as PageName;
      await ensureMounted(name);
      await Promise.all([hook(cfg.pages[name].view.enter(t)), cfg.shell.fadeIn(cfg.pages[name].root, t)]);
    } else {
      if (fromSurface !== 'stage') {
        await Promise.all([hook(cfg.stage.view.enter(t)), cfg.shell.fadeIn(cfg.stage.root, t)]);
      }
      if (to.name === 'product' && !sameRoute(from, to)) {
        await settleWithin(cfg.stage.ready, HOOK_TIMEOUT_MS);
        await hook(cfg.detail.view.enter(t));
      }
    }
    cfg.shell.onSettled(to);
    cfg.bus.emit('route:settled', { route: to });
  }

  function schedule(to: Route): void {
    if (!running && sameRoute(current, to)) return;
    if (running && pending === null && sameRoute(current, to)) return;
    pending = to;
    activeAbort?.abort();
    if (!running) running = pump();
  }

  async function pump(): Promise<void> {
    while (pending) {
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
    waiters.forEach((w) => w());
  }

  /* --------------------------------------------------------------- history
     `history.back()` is asynchronous: the hash, and therefore the route, does
     not change until the popstate arrives. Every interaction that happens in
     that window used to act on a stack top that was already on its way out --
     a second tap on BACK TO SHOWROOM popped a second entry and landed on
     whichever product was opened before it, and a sneaker tapped right after
     Back pushed an entry that the in-flight traversal then undid. Both showed
     up as the camera and the open product disagreeing.

     So a back is tracked while it is in flight: further backs are dropped, and
     a navigation that arrives meanwhile is held and replayed once the pop has
     landed. The pop still plays out normally and the held route then supersedes
     it through the usual `schedule`, which is the controlled retarget rather
     than two transitions fighting over the camera. */
  let backPending = false;
  let backTimer = 0;
  /* What lives at each history index. The browser will not let us read the
     entry behind the current one, and BACK TO SHOWROOM has to know whether
     stepping back actually reaches the showroom or merely an earlier pair. */
  const trail: Record<number, RoutePath> = {};
  let queued: { path: RoutePath; opts: { replace?: boolean } } | null = null;

  function releaseBack(): void {
    if (!backPending) return;
    backPending = false;
    clearTimeout(backTimer);
    const next = queued;
    queued = null;
    if (next) router.navigate(next.path, next.opts);
  }

  function sync(): void {
    const parsed = parseHash(location.hash);
    const route = resolve(parsed);
    if (readIdx() === null) {
      // Entry created by a plain <a href="#/..."> click or manual edit: tag it.
      history.replaceState({ kIdx: lastIdx + 1 } satisfies HistoryState, '');
    }
    lastIdx = readIdx() ?? 0;
    if (route.path !== parsed.path || location.hash !== route.path) {
      history.replaceState({ kIdx: lastIdx } satisfies HistoryState, '', route.path);
    }
    trail[lastIdx] = route.path;
    schedule(route);
    // After the pop's own route is scheduled, so a held route supersedes it.
    releaseBack();
  }

  const router: Router = {
    async prepare() {
      if (!stageMounted) {
        stageMounted = true;
        await hook(cfg.stage.view.mount(cfg.stage.root));
      }
      if (!detailMounted) {
        detailMounted = true;
        await hook(cfg.detail.view.mount(cfg.detail.root));
      }
    },
    async start() {
      if (started) return;
      started = true;
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      await router.prepare();
      if (readIdx() === null) history.replaceState({ kIdx: 0 } satisfies HistoryState, '');
      lastIdx = readIdx() ?? 0;
      window.addEventListener('popstate', sync);
      window.addEventListener('hashchange', sync);
      sync();
      await router.idle();
    },
    navigate(path, opts = {}) {
      // Held until the in-flight traversal lands; see the history note above.
      if (backPending) {
        queued = { path, opts };
        return;
      }
      const route = resolve(parseHash(path));
      /* Opening a second pair from an already-open one swaps the exhibit
         rather than stacking it. Ten rapid taps used to leave ten entries
         behind, so Back walked backwards through the pairs one at a time;
         the stack now stays [showroom, pair], which is what both this
         button and the browser's own back button promise. */
      const from = pending ?? current ?? HOME;
      const swap = from.name === 'product' && route.name === 'product';
      if (opts.replace || swap) {
        if (location.hash === route.path) return;
        history.replaceState({ kIdx: lastIdx } satisfies HistoryState, '', route.path);
      } else {
        if (location.hash === route.path) return;
        lastIdx += 1;
        history.pushState({ kIdx: lastIdx } satisfies HistoryState, '', route.path);
      }
      trail[lastIdx] = route.path;
      schedule(route);
    },
    back(fallback = '#/') {
      if (backPending) return;
      const idx = readIdx() ?? 0;
      if (idx > 0 && trail[idx - 1] === fallback) {
        backPending = true;
        // Safety net: if no popstate arrives (a traversal the browser refuses)
        // the flag would otherwise wedge every later navigation.
        clearTimeout(backTimer);
        backTimer = window.setTimeout(releaseBack, 600);
        history.back();
      } else {
        router.navigate(fallback, { replace: true });
      }
    },
    current() {
      return pending ?? current ?? HOME;
    },
    idle() {
      if (!running) return Promise.resolve();
      return new Promise((r) => idleWaiters.push(r));
    },
  };
  return router;
}

/** Durations the shell uses for its own cross-fades (mirrors tokens). */
export const PAGE_FADE_MS = DURATION.page;
