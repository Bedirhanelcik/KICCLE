# KICCLE contracts

The rules every package builds against. Types live in `src/types.ts`; this file
gives the behaviour that goes with them. If the two ever disagree, raise it with
Package A instead of working around it.

| Package | Owns | Entry module(s) | CSS entry (already linked in `index.html`) | Class / var prefix |
| --- | --- | --- | --- | --- |
| A Foundation | shell, data, tokens, router, nav, footer, intro, shared helpers | `src/main.ts` | `src/styles/*.css` | `k-`, `--k-` |
| B Showroom | the stage | `src/views/showroom/index.ts` | `src/views/showroom/showroom.css` | `sr-`, `--sr-` |
| C Detail + Cart | product detail, cart store + drawer | `src/views/detail/index.ts`, `src/cart/index.ts` | `src/views/detail/detail.css`, `src/cart/cart.css` | `dt-` / `ct-`, `--dt-` / `--ct-` |
| D Pages | About, FAQ, Collections | `src/views/{about,faq,collections}/index.ts` | `src/views/{about,faq,collections}/*.css` | `ab-`, `fq-`, `cl-` |

Each package may add any files **inside its own directories**. Import them from
your `index.ts`, and `@import` extra CSS from your own CSS entry (relative URLs).
Do not edit `index.html`, `src/main.ts`, `src/router.ts`, `src/types.ts`, tokens,
data, `src/lib/**` or `src/components/**`. If you need something there, ask A.

---

## 1. Global rules

- **Relative URLs only.** No leading `/`, no `http(s)://`, no CDN, no web fonts from
  the network. Asset paths are relative to `index.html` (e.g. `assets/...`). CSS
  `url()` is relative to the CSS file. Inline `data:` URLs (e.g. noise or grain textures) are permitted.
- **Hash routing owns the fragment.** Never use `href="#some-id"` for in-page anchors;
  it would be parsed as a route and redirected home. Use buttons + `el.scrollIntoView()`.
- **No prices, no payments, no "Commerce"** wording anywhere.
- **Reduced motion.** Check `prefersReducedMotion()` (or `t.reducedMotion` in
  lifecycle hooks). Under reduced motion: no movement, no parallax, no camera move;
  opacity fades of at most 200 ms are fine. Token durations already collapse under
  `@media (prefers-reduced-motion: reduce)`, and `base.css` clamps every CSS
  animation/transition globally, so prefer token-driven CSS.
- **Focus.** `:focus-visible` gets a 2px LED-orange outline globally. Do not remove
  outlines; if you restyle focus, keep it at least as visible. Interactive targets
  are at least 44×44 px.
- **No console errors**, no unhandled rejections. Lifecycle hooks must always settle
  (they are time-boxed at `HOOK_TIMEOUT_MS = 4000`, after which the router moves on).
- **Naming.** BEM-like with your prefix: `sr-plinth`, `sr-plinth__led`,
  `sr-plinth--lit`. States: `is-*` classes or `data-*` attributes. Private custom
  properties must use your prefix (`--sr-spot-x`). Never restyle another package's
  classes; never redefine global tokens.
- **Orange is light, never paint.** Use the LED tokens for things that glow (LED
  strips, the lit badge, focus). Do not use orange as a flat fill for large surfaces
  or body text.

## 2. Data (`src/data`)

```ts
import { PRODUCTS, COLLECTIONS, getProduct, getCollection, SHOE_FRAME } from '../../data/index.js';
```

- `Product` (10 items, showroom order = `index` '01'…'10', row 1 = 01–05, row 2 = 06–10):
  `id, index, name, tagline, description, materials[], characteristics[{label,value}],
  sizes[{eu, available}], collectionId, colorway, alt, image, isPlaceholder`.
- `Collection` (4 items): `id, name, description, productIds[]`. Every product is in
  exactly one collection.
- `image: ProductImage`: `kind ('photo'|'placeholder'), src, width, height,
  srcset[{src,width}], visibleBox {x,y,w,h} (fractions), baseline (fraction from top),
  original? {src, sha256, width, height}`. Products 01–03 are the real photos
  (WebP display copies of the untouched originals in `assets/original/`); 04–10 are
  temporary original SVG placeholders.
- Prefer `services.products` / `services.getProduct()` in views (same data).
- Data is frozen. Never mutate it.

## 3. Rendering a sneaker: `createShoeFigure`

**Every** sneaker image on the site is rendered with this one primitive. It is what
guarantees the same perceived size everywhere.

```ts
import { createShoeFigure, whenFigureDecoded, shoeRectWithin } from '../../components/shoe-figure.js';

const fig = createShoeFigure(product, {
  sizes: '(max-width: 760px) 92vw, 50vw', // default; sized for the detail zoom
  loading: 'eager',                       // 'lazy' for long pages (Collections)
  fetchPriority: 'auto',
  decorative: false,                      // true -> alt="" when a visible label names the shoe
});
parent.append(fig); // fig fills parent's width; its height comes from aspect-ratio
await whenFigureDecoded(fig); // never rejects, time-boxed
```

- Output: `div.k-shoe[data-product-id]` with a fixed `aspect-ratio` (the shared
  `SHOE_FRAME`) containing one `img.k-shoe__img` positioned by percentages.
  **Size the parent, never the image.** All shoes then have identical visible width
  (`SHOE_FRAME.contentWidth`, 90% of the figure) and sit on the same sole line
  (`SHOE_FRAME.baseline`, a fraction of the figure height from the top; also exposed
  on the figure as `--k-shoe-baseline`).
- Zero layout shift: the figure's size never depends on the image loading.
- Never change how `.k-shoe__img` is positioned or sized (`left/top/width/height`,
  `transform`, `object-fit`, `max-width`). Style the figure or a wrapper instead;
  `filter`, `opacity` and shadows on a wrapper are fine.
- To align a platform with the sole line: put the platform's top at
  `SHOE_FRAME.baseline × figureHeight` (or `top: var(--k-shoe-baseline)` on an
  element positioned inside the figure's own box).
- `shoeRectWithin(product, figureRect)` → viewport `DOMRect` of the visible pixels.

## 4. Routing and the view lifecycle

Routes: `#/` home · `#/about` · `#/faq` · `#/collections` · `#/product/<id>`.
Unknown paths and unknown product ids are replaced by `#/`.

```ts
services.navigate('#/faq');                       // pushes a history entry
services.navigate(services.productPath('loam'));  // '#/product/loam'
services.navigate('#/', { replace: true });
services.back('#/');   // history.back() if there is an in-app entry, else navigate(fallback, replace)
services.current();    // Route being shown or entered
```

Plain links work too: `<a href="#/about">` and `<a href="${services.productPath(id)}">`.

Surfaces: `home` and `product` show the **stage** (`#k-stage`); `about`, `faq`,
`collections` show a **page** (`#k-page-<name>` inside `#k-pages`, followed by the
footer). The showroom stays mounted and visible for `#/product/<id>`.

### View interface

```ts
interface View {
  mount(root: HTMLElement): void | Promise<void>;   // once
  enter(t: ViewTransition): void | Promise<void>;   // each activation
  leave(t: ViewTransition): void | Promise<void>;   // each deactivation
  unmount?(): void;                                 // never called today
}
interface ViewTransition { from: Route | null; to: Route; initial: boolean; reducedMotion: boolean; signal: AbortSignal }
```

Guarantees: `mount` once before the first `enter`; `enter`/`leave` alternate;
navigations are serialised (the next starts after the previous hooks settle);
`signal` aborts when a newer navigation is queued (finish fast when it does).
Stage and detail are mounted at boot (under the intro); pages are mounted lazily on
first visit; roots persist for the page lifetime (keep your DOM, do not rebuild on
every `enter`).

### What the router does, in order

```
route:change emitted; shell updates nav active state + document.title
LEAVE
  from product (and to != from)  -> await detail.leave(t)
  from a page (to != from)       -> await page.leave(t)  ‖ shell fades the page root out
  from stage to a page           -> await stage.leave(t) ‖ shell fades #k-stage out
SWAP   shell shows/hides surfaces, footer, scrolls pages to top
ENTER
  to a page                      -> mount once; await page.enter(t) ‖ shell fades page root in
  to stage from a page / initial -> await stage.enter(t) ‖ shell fades #k-stage in
  to product                     -> await stage.ready; await detail.enter(t)
route:settled emitted; pages get focus on their root (tabindex=-1); title announced
```

Consequences:

- `home → product`: only `detail.enter` runs (stage is already showing).
- `product → home`: only `detail.leave` runs.
- `product A → product B`: `detail.leave(A)` then `detail.enter(B)`.
- `collections → product`: page fades out, stage fades in, `stage.ready`, then the
  **same** `detail.enter` as from the showroom. Direct load of `#/product/<id>`:
  intro, stage revealed, then `detail.enter` with `t.initial === true`.
- `product → about`: `detail.leave` (reverse the zoom), then stage fades out.
- `stage.enter` must resolve as soon as the room is visible and interactive
  (≤ ~600 ms). Do decorative work (spotlight sweeps) without awaiting it.
- Initial route (`t.initial`): the intro is lifting off over the app as `enter` runs.
  The shell does not fade the surface in; your own entrance should be quick and
  should not move content (the intro hand-off must be seamless).

## 5. Stage API (B implements, C consumes)

`createShowroom(services: CoreServices): ShowroomModule` where
`ShowroomModule = View & StageAPI`.

```ts
interface StageAPI {
  readonly ready: Promise<void>;          // room showable: units in DOM + first column decoded
  readonly root: HTMLElement;             // #k-stage
  readonly camera: HTMLElement;           // the scene layer C flies (see below)
  getUnit(id): HTMLElement | null;        // persistent element: platform + LED + shoe figure
  getFigure(id): HTMLElement | null;      // the .k-shoe inside the unit
  getRestRect(id): DOMRect | null;        // viewport rect of the unit's UNTRANSFORMED box
  getShoeRect(id): DOMRect | null;        // viewport rect of the visible shoe pixels at rest
  setFocus(id | null): Promise<void>;     // focus mode on/off; resolves when B's transition ends
  pauseSpotlights(): void; resumeSpotlights(): void;
  snapshot(): StageSnapshot;              // { focusedId, scrollLeft, scrollTop, extra? }
  restore(s: StageSnapshot): void;
}
```

### B guarantees

1. **One persistent unit per product** for the page lifetime (never re-created,
   never cloned, never swapped). The unit contains the acrylic platform with its LED
   and the `createShoeFigure` figure. The image the visitor sees in the showroom is the
   image that zooms.
2. **THE CAMERA MOVES; NOTHING IN THE ROOM DOES.** `stage.camera` is a
   full-viewport layer, anchored at `#k-stage`'s top-left with
   `transform-origin: 0 0`, that contains the entire scene: the room
   photograph, the overhead lights, the shelves and all ten pairs. **C owns
   `transform`, `transform-origin` and `will-change` on that layer** while
   `#/product/<id>` is active, and writes one `translate(x, y) scale(s)` there —
   uniform scale, never rotate, flip or skew.

   **Nobody ever transforms a unit, a slot or the grid.** Because every object
   is inside the camera layer they all map by the same matrix: the pair being
   approached fills the frame, its neighbours slide out past the edges with
   their relative positions intact, and the room is never swapped, re-lit,
   faded or reflowed. A unit that moved on its own — or a neighbour that was
   dimmed, hidden or ghosted — would give the whole thing away as a card
   expanding rather than a lens travelling.

   B has its own nested layer inside the camera (`.sr-camera__dolly`) for the
   opening push-in. It is identity at rest, so C's geometry is never affected.
3. Nothing between the camera layer and `#k-stage` clips the scene (no
   `overflow: hidden|clip|auto`, `contain: paint`, `clip-path`, `mask`) inside the
   region from `top: var(--nav-h)` to the bottom of the viewport. If B uses an inner
   scroller, it must cover at least that region (e.g. `inset: 0`) or switch to
   `overflow: visible` in focus mode.
4. `getRestRect(id)` and `getShoeRect(id)` are derived from B's **layout model**,
   not from `getBoundingClientRect()`. They report where the pair sits with the
   camera at rest, which is what C's target maths needs — a measured rect would
   come back already flown.
5. `setFocus(id)`: quiets every other unit — `pointer-events: none`, no hover
   glow, no wall label — but **does not dim or move them**: they stay lit and in
   place, because the camera framing is what takes them out of the shot. Raises
   the focused unit above its siblings (`z-index`), keeps the focused platform's
   **orange LED fully lit** and hides its own wall label. `setFocus(null)`
   reverses it.
   Idempotent. Emits `stage:focus`.
6. Units are activated by **plain links** `href = services.productPath(id)` (keyboard
   and middle-click friendly). B never calls C.
7. `leave(t)` pauses spotlights and any rAF loop; `enter(t)` resumes them. While the
   stage is hidden it costs nothing.
8. Layout: two rows of five on wide screens; B decides the small-screen arrangement
   (e.g. a horizontal scroller per row). Any scrolling happens **inside** `#k-stage`
   (the document does not scroll on the stage surface).

### C rules for the camera move

```ts
// detail enter (sketch)
const { stage } = services;
const id = t.to.productId;
const snap = stage.snapshot();
const cam = stage.camera;                // THE SCENE, not the product
const rest = stage.getRestRect(id)!;     // where this pair sits at rest
const shoe = stage.getShoeRect(id)!;     // aim at the visible pixels, not the padding
const focusDone = stage.setFocus(id);
cam.style.transformOrigin = '0 0';
// Computed from THIS pair's rest box, so the move is different for all ten.
const to = computeTransform(rest, shoe, targetArea); // translate(...) scale(...), NO rotate/flip
cam.style.transform = to;               // commit end state first: no end-of-animation flicker
await Promise.all([
  animate(cam, [{ transform: 'none' }, { transform: to }], { duration: DURATION.camera, easing: EASE.camera, signal: t.signal }),
  focusDone,
]);
// leave: animate back to 'none', clear the three properties, setFocus(null), stage.restore(snap)
```

- Use `DURATION.camera` / `EASE.camera` (`--dur-camera` / `--ease-camera`). Under
  reduced motion apply the end state with no movement (fade the panel only).
- Only `translate` + uniform `scale`. Never rotate, flip or swap the image.
- Recompute on `resize` while open (call `getRestRect`/`getShoeRect` again).
- Keep the zoomed shoe below the nav (`--nav-h`) and clear of the panel.
- On leave, restore focus to the unit link when returning to `#/`.
- Escape while the detail is open → `services.back('#/')`.
- Back button → `services.back('#/')` (returns to Collections if that is where the
  visitor came from).

## 6. Detail layer (C)

- `createDetail(services: AppServices): View`, mounted into `#k-detail`.
- `#k-detail` is `position: fixed; inset: 0; z-index: var(--z-detail); pointer-events: none`.
  Set `pointer-events: auto` on your panel and controls only, so the stage stays
  clickable where you have nothing.
- Panel on the right ≥ 760px; below that, C decides (e.g. bottom sheet with the shoe
  above). Panel content: name, description, materials, characteristics, sizes (EU,
  unavailable ones disabled), Add to cart, back.
- After `enter`, move focus to the panel heading (`tabindex="-1"`). Emit
  `detail:opened` / `detail:closed`. Use `services.announce()` for "Added to cart".

## 7. Cart API (C implements; A's nav badge consumes)

`createCart(): CartModule` (no arguments: it is created before everything else),
then `cart.mount(#k-cart, services)` once.

```ts
interface CartStore {
  add(productId, size): void;      // same productId+size -> qty + 1
  remove(productId, size): void;   // removes the whole line
  clear(): void;
  items(): readonly CartItem[];    // { productId, size, qty }
  count(): number;                 // sum of qty
  isOpen(): boolean;
  subscribe(fn: (s: CartState) => void): () => void; // called immediately, then on every change
  open(returnFocusTo?: HTMLElement | null): void;    // nav passes its cart button
  close(): void;                   // returns focus to returnFocusTo
}
```

- In memory; optional persistence in `localStorage` under `kiccle.cart.v1`, every
  access wrapped in `try/catch` and validated on load.
- `subscribe` must fire on open/close as well (the nav mirrors `aria-expanded`).
- Drawer lives in `#k-cart` (`z-index: var(--z-cart)`, above nav), is a modal dialog
  (`role="dialog" aria-modal="true"`), traps focus (`trapFocus` from `src/lib/dom.js`),
  closes on Escape and scrim click. No prices, no totals in money, no checkout. A
  "Request these pairs" style demo action is fine if it says it is a demo.

Nav usage (already implemented in `src/components/nav.ts`):

```ts
cart.subscribe((s) => { badge.textContent = String(s.count); });
cartButton.onclick = () => cart.open(cartButton);
```

## 8. Pages (D)

- `createAboutPage / createFaqPage / createCollectionsPage(services: AppServices): View`.
- Roots: `#k-page-about`, `#k-page-faq`, `#k-page-collections` (`.k-page`: already
  padded below the fixed nav; `tabindex="-1"`; focused by the shell after `enter`).
  Render exactly one `<h1>` per page. The shell owns the footer and the page cross-fade.
- Collections: link every product with `href = services.productPath(id)`; render
  sneakers with `createShoeFigure(p, { loading: 'lazy', sizes: '...' })`.
- Scroll-driven reveals: `IntersectionObserver`, reveal once, no movement under
  reduced motion. Disconnect observers in `leave` if they are no longer needed.
- Pages scroll the document (`window`), not an inner scroller.

## 9. Services

```ts
interface CoreServices {          // given to the showroom
  products; collections; getProduct(id); getCollection(id);
  navigate(path, { replace? }); productPath(id); back(fallback?); current();
  bus: EventBus<AppEvents>;
  cart: CartStore;
  announce(message: string): void; // polite live region
}
interface AppServices extends CoreServices { stage: StageAPI } // detail, cart, pages
```

### Event bus

```ts
const off = services.bus.on('route:settled', ({ route }) => { ... });
services.bus.emit('detail:opened', { productId: 'loam' });
```

| Event | Payload | Emitted by |
| --- | --- | --- |
| `route:change` | `{ from, to }` | router, before any leave hook |
| `route:settled` | `{ route }` | router, after enter hooks |
| `intro:done` | `{ skipped }` | shell, when the intro starts revealing the app |
| `stage:focus` | `{ productId \| null }` | B, from `setFocus` |
| `detail:opened` / `detail:closed` | `{ productId }` | C |

Add new events only through A (they live in `AppEvents` in `src/types.ts`).

## 10. Motion helpers (`src/lib/motion.ts`)

```ts
import { DURATION, EASE, animate, dur, wait, afterPaint, prefersReducedMotion, onReducedMotionChange, settleWithin } from '../../lib/motion.js';
```

| JS | CSS | Value | Use |
| --- | --- | --- | --- |
| `DURATION.fast` | `--dur-fast` | 180ms | hover, small UI |
| `DURATION.base` | `--dur-base` | 320ms | default |
| `DURATION.slow` | `--dur-slow` | 560ms | panels, focus-mode dimming |
| `DURATION.page` | `--dur-page` | 420ms | surface cross-fade (shell) |
| `DURATION.camera` | `--dur-camera` | 1150ms | detail zoom in/out |
| `DURATION.sweep` | `--dur-sweep` | 1400ms | spotlight step between plinths |
| `EASE.standard` | `--ease-standard` | cubic-bezier(0.2,0,0,1) | default |
| `EASE.out` / `EASE.in` / `EASE.inOut` | `--ease-out` … | | arrive / leave / symmetric |
| `EASE.camera` | `--ease-camera` | cubic-bezier(0.7,0,0.12,1) | the camera dolly |
| `EASE.light` | `--ease-light` | cubic-bezier(0.3,0,0.1,1) | LEDs and spotlights warming up |

`animate(el, keyframes, opts)` wraps WAAPI, always resolves, jumps to the end on
`signal` abort, and under reduced motion skips (default) or keeps only opacity
(`reduced: 'fade'`). `dur(ms, reducedMs = 0)` returns the duration to use.

DOM helpers (`src/lib/dom.ts`): `h(tag, attrs, ...children)`, `svg(...)`,
`must(selector)`, `focusables(root)`, `trapFocus(container, { onEscape, initial })`,
`transitionEnd(el, timeoutMs, prop?)`.

## 11. Layers (z-index) and mount points

| Token | Value | Element | Owner |
| --- | --- | --- | --- |
| `--z-stage` | 0 | `#k-stage` (fixed, full viewport, `overflow: hidden`) | B |
| `--z-pages` | 10 | `#k-pages` → `#k-page-*` + `#k-footer` | D (pages), A (footer) |
| `--z-detail` | 20 | `#k-detail` (fixed, `pointer-events: none`) | C |
| `--z-nav` | 40 | `#k-nav` (fixed, height `--nav-h`: 72px, 60px < 760px) | A |
| `--z-menu` | 45 | compact menu sheet | A |
| `--z-cart` | 60 | `#k-cart` | C |
| `--z-intro` | 100 | `#k-intro` | A |
| `--z-skip` | 110 | skip link | A |

Inside your own root, use small local z-indexes (1–9). The zoomed unit stays inside
`#k-stage`, so the detail panel (`#k-detail`) and nav are always above it.

`body[data-surface]` is `stage` or `page`; `body[data-route]` is the route name.
Style against them only for layout-level decisions.

## 12. Tests

Put tests in `tests/<package>/**/*.test.ts` (`tests/showroom`, `tests/detail`,
`tests/pages`). `npm test` runs `tsx --test "tests/**/*.test.ts"` and
`npm run typecheck` checks them with `tsconfig.test.json`. Node built-ins are typed by
the small shim in `tests/foundation/node-shim.d.ts` (no `@types/node`). Import only
DOM-free modules at test load time (data, `lib/scale`, `lib/motion` constants, router
parsers, your own pure helpers). For browser checks write a Playwright script in your
own folder modelled on `scripts/verify-browser.mjs` (reuse `startServer` from
`scripts/serve.mjs`), run `npm run build` first, then
`NODE_PATH="$(npm root -g)" node <script>`.
