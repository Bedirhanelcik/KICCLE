/**
 * KICCLE shared contracts.
 *
 * This file is owned by Package A (foundation). Packages B (showroom),
 * C (detail + cart) and D (editorial pages) build ONLY against these types.
 * Read CONTRACTS.md for the behavioural rules that go with them.
 */

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/** A box expressed as fractions (0..1) of an image's intrinsic width/height. */
export interface UnitBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ImageCandidate {
  /** Relative URL (never absolute, never leading slash). */
  readonly src: string;
  /** Intrinsic pixel width, used for `srcset` `w` descriptors. */
  readonly width: number;
}

/**
 * Display image of one sneaker, plus the measurements used for scale
 * normalisation. All sneakers face right (toe pointing right).
 */
export interface ProductImage {
  /** `photo` = real product photograph (WebP display copy), `placeholder` = temporary SVG. */
  readonly kind: 'photo' | 'placeholder';
  /** Default (largest) source, relative URL. */
  readonly src: string;
  /** Intrinsic width/height of `src` (aspect ratio source of truth). */
  readonly width: number;
  readonly height: number;
  /** Raster candidates for `srcset` (empty for vector placeholders). */
  readonly srcset: readonly ImageCandidate[];
  /** Box of visible pixels (alpha >= 32) as fractions of the image. */
  readonly visibleBox: UnitBox;
  /** y of the sole contact line as a fraction of image height (0 = top). */
  readonly baseline: number;
  /** Byte-identical original upload (photos only). */
  readonly original?: {
    readonly src: string;
    readonly sha256: string;
    readonly width: number;
    readonly height: number;
  };
}

export interface ProductCharacteristic {
  readonly label: string;
  readonly value: string;
}

/** EU size, e.g. 42 or 42.5. */
export interface ProductSize {
  readonly eu: number;
  readonly available: boolean;
}

/**
 * Collections group the archive by SILHOUETTE, not by season or mood: what
 * kind of shoe it is, which is the only grouping the pieces themselves
 * actually support. Defined once in src/data/collections.ts.
 */
export type CollectionId = 'court-high-top' | 'street-lifestyle' | 'run-trail';

export interface Product {
  /** URL slug, unique, `[a-z0-9-]+`. Used in `#/product/<id>`. */
  readonly id: string;
  /** Two-digit archive number, '01'..'10'. Showroom order = index order. */
  readonly index: string;
  readonly name: string;
  /** One line, under ~60 characters. */
  readonly tagline: string;
  /** 2–3 sentences. */
  readonly description: string;
  readonly materials: readonly string[];
  readonly characteristics: readonly ProductCharacteristic[];
  readonly sizes: readonly ProductSize[];
  readonly collectionId: CollectionId;
  /** Short colourway name, e.g. 'Stone / Moss'. */
  readonly colorway: string;
  /** Accessible description of the image (right-side profile). */
  readonly alt: string;
  readonly image: ProductImage;
  /** true for temporary SVG stand-ins (products 04–10). */
  readonly isPlaceholder: boolean;
}

export interface Collection {
  readonly id: CollectionId;
  readonly name: string;
  /** One or two sentences. */
  readonly description: string;
  /** Product ids in display order. Every product belongs to exactly one collection. */
  readonly productIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export type RouteName = 'home' | 'about' | 'faq' | 'collections' | 'product';

export type Route =
  | { readonly name: 'home'; readonly path: '#/' }
  | { readonly name: 'about'; readonly path: '#/about' }
  | { readonly name: 'faq'; readonly path: '#/faq' }
  | { readonly name: 'collections'; readonly path: '#/collections' }
  | { readonly name: 'product'; readonly path: `#/product/${string}`; readonly productId: string };

/** Result of parsing an arbitrary hash; `notfound` is redirected to home by the router. */
export type ParsedRoute = Route | { readonly name: 'notfound'; readonly path: string };

/** Hash path accepted by `navigate()`, e.g. '#/about' or productPath(id). */
export type RoutePath = Route['path'];

/** Which top-level surface a route shows. */
export type Surface = 'stage' | 'page';

// ---------------------------------------------------------------------------
// View lifecycle
// ---------------------------------------------------------------------------

/**
 * Passed to enter/leave. `from` is null on the first route after page load.
 * `signal` aborts when a newer navigation is queued: views SHOULD then finish
 * (or jump to the end of) their animation quickly. Hooks must always settle.
 */
export interface ViewTransition {
  readonly from: Route | null;
  readonly to: Route;
  /** true only for the first route after load (intro just finished). */
  readonly initial: boolean;
  readonly reducedMotion: boolean;
  readonly signal: AbortSignal;
}

/**
 * Every view (showroom stage, detail, about, faq, collections).
 *
 * Router guarantees, per view instance:
 *  - `mount(root)` exactly once, before the first `enter`. Stage + detail are
 *    mounted at boot; pages are mounted lazily on first visit. Roots persist.
 *  - `enter` / `leave` strictly alternate (enter, leave, enter, ...).
 *  - Navigations are serialised: the next transition starts only after the
 *    previous hooks resolved (each hook is time-boxed at HOOK_TIMEOUT_MS).
 *  - `unmount` is never called in the current app (views live for the page
 *    lifetime); implement it anyway for tests/hot paths if cheap.
 */
export interface View {
  mount(root: HTMLElement): void | Promise<void>;
  enter(t: ViewTransition): void | Promise<void>;
  leave(t: ViewTransition): void | Promise<void>;
  unmount?(): void;
}

// ---------------------------------------------------------------------------
// Stage API (implemented by B / showroom, consumed by C / detail)
// ---------------------------------------------------------------------------

/** Opaque snapshot of showroom state (B decides what goes in it). */
export interface StageSnapshot {
  readonly focusedId: string | null;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  /** B-private extra state (spotlight phase, etc.). */
  readonly extra?: unknown;
}

export interface StageAPI {
  /**
   * Resolves once the room can be SHOWN: every unit is in the DOM and laid
   * out, and the images the opening needs first (column 0) have decoded or
   * failed. The remaining columns are still in flight and arrive before their
   * own light strikes. Never rejects. The intro waits for it (time-boxed).
   */
  readonly ready: Promise<void>;
  /**
   * THE CAMERA. A full-viewport layer, anchored at the stage's top-left with
   * transform-origin 0 0, that contains the entire scene: the room photograph,
   * the overhead lights, the shelves and all ten pairs.
   *
   * C flies the camera by writing ONE transform here — translate + uniform
   * scale, nothing else. Because every object in the room is inside this
   * layer, they all move and grow together and keep their relative positions:
   * the pair being approached fills the frame, its neighbours slide out past
   * the edges, and the room never changes. Nothing inside is ever transformed
   * on its own, and nothing is duplicated, reflowed or faded out and back in.
   */
  readonly camera: HTMLElement;
  /**
   * The persistent product UNIT for `id`: the element that holds the shoe
   * figure AND its acrylic platform/LED. Never transformed by anyone — it is
   * the camera that moves. Same node for the page lifetime. null if unknown id.
   */
  getUnit(id: string): HTMLElement | null;
  /** The `.k-shoe` figure (created by createShoeFigure) inside the unit. */
  getFigure(id: string): HTMLElement | null;
  /**
   * Viewport rect (getBoundingClientRect space) of the unit's UNTRANSFORMED
   * layout box at rest, independent of any transform C has applied.
   */
  getRestRect(id: string): DOMRect | null;
  /**
   * Viewport rect of the shoe's visible pixels inside the unit at rest
   * (excludes transparent padding and the platform). C uses it to aim the zoom.
   */
  getShoeRect(id: string): DOMRect | null;
  /**
   * Focus mode. `id`: quiet every other unit (dim, desaturate, disable hover,
   * pointer-events none), keep the focused unit's LED lit at full strength,
   * pause the spotlight sweep. `null`: return to normal. Idempotent. Resolves
   * when B's own focus transition has finished. Emits `stage:focus`.
   */
  setFocus(id: string | null): Promise<void>;
  /** Pause / resume the overhead spotlight sweep (ref-counted by B is fine). */
  pauseSpotlights(): void;
  resumeSpotlights(): void;
  /** Capture/restore the exact showroom state (scroll, focus, spotlight phase). */
  snapshot(): StageSnapshot;
  restore(snapshot: StageSnapshot): void;
  /** Root element of the stage layer (`#k-stage`). */
  readonly root: HTMLElement;
}

/** What showroom/index.ts must return. */
export interface ShowroomModule extends View, StageAPI {}

// ---------------------------------------------------------------------------
// Cart API (implemented by C, consumed by A's nav badge and by C's detail)
// ---------------------------------------------------------------------------

export interface CartItem {
  readonly productId: string;
  /** EU size. */
  readonly size: number;
  /** >= 1. Adding the same productId+size again increments qty. */
  readonly qty: number;
}

export interface CartState {
  readonly items: readonly CartItem[];
  /** Sum of qty. */
  readonly count: number;
  readonly isOpen: boolean;
}

export type CartListener = (state: CartState) => void;

export interface CartStore {
  add(productId: string, size: number): void;
  /** Removes the line (all qty) for productId+size. No-op if absent. */
  remove(productId: string, size: number): void;
  clear(): void;
  items(): readonly CartItem[];
  count(): number;
  isOpen(): boolean;
  /**
   * Listener is called IMMEDIATELY with the current state, then after every
   * change (items or open state). Returns an unsubscribe function.
   */
  subscribe(listener: CartListener): () => void;
  /** Opens the cart drawer. `returnFocusTo` receives focus when it closes. */
  open(returnFocusTo?: HTMLElement | null): void;
  close(): void;
}

export interface CartModule {
  readonly store: CartStore;
  /** Called once at boot with `#k-cart` (drawer layer). */
  mount(root: HTMLElement, services: AppServices): void;
}

// ---------------------------------------------------------------------------
// Event bus
// ---------------------------------------------------------------------------

export interface AppEvents {
  /** Navigation started (before any leave hook). */
  'route:change': { readonly from: Route | null; readonly to: Route };
  /** Navigation finished (after the enter hooks resolved). */
  'route:settled': { readonly route: Route };
  /** Intro overlay began its hand-off (stage is being revealed). */
  'intro:done': { readonly skipped: boolean };
  /** Emitted by B from setFocus. */
  'stage:focus': { readonly productId: string | null };
  /** Emitted by C when the zoom-in finished / the zoom-out finished. */
  'detail:opened': { readonly productId: string };
  'detail:closed': { readonly productId: string };
}

export interface EventBus<E> {
  on<K extends keyof E>(type: K, handler: (payload: E[K]) => void): () => void;
  once<K extends keyof E>(type: K, handler: (payload: E[K]) => void): () => void;
  emit<K extends keyof E>(type: K, payload: E[K]): void;
}

// ---------------------------------------------------------------------------
// Services handed to every package
// ---------------------------------------------------------------------------

export interface DataServices {
  readonly products: readonly Product[];
  readonly collections: readonly Collection[];
  getProduct(id: string): Product | undefined;
  getCollection(id: string): Collection | undefined;
}

export interface NavServices {
  /** Hash navigation. `replace` replaces the history entry. */
  navigate(path: RoutePath, opts?: { replace?: boolean }): void;
  productPath(id: string): RoutePath;
  /** history.back() when there is an in-app entry to return to, else navigate(fallback). */
  back(fallback?: RoutePath): void;
  /** The route currently shown (or being entered). */
  current(): Route;
}

/** Services available to the showroom (it is created before the StageAPI exists). */
export interface CoreServices extends DataServices, NavServices {
  readonly bus: EventBus<AppEvents>;
  readonly cart: CartStore;
  /** Polite screen-reader announcement via the shell's live region. */
  announce(message: string): void;
}

/** Services available to detail, cart and pages. */
export interface AppServices extends CoreServices {
  readonly stage: StageAPI;
}

// ---------------------------------------------------------------------------
// Module factory signatures (each package's index.ts exports exactly these)
// ---------------------------------------------------------------------------

export type CreateShowroom = (services: CoreServices) => ShowroomModule;
export type CreateDetail = (services: AppServices) => View;
export type CreateCart = () => CartModule;
export type CreatePage = (services: AppServices) => View;
