/**
 * Package B: the showroom stage.
 *
 * A gallery wall in a navy room: a ceiling track with one spot head per bay,
 * two tiers of floating acrylic plinths with orange LED strips (row 1 = 01–05,
 * row 2 = 06–10) and a floor plane. The opening brings the ten displays up one
 * at a time, left to right, upper row first; after that the hall stays lit and
 * hover / keyboard focus ignites the LED under a pair. Implements View &
 * StageAPI (CONTRACTS.md §5).
 *
 * DOM (inside #k-stage):
 *   .sr-camera          THE LENS. C transforms this for the flight into a pair.
 *     .sr-camera__dolly  B's own move: the opening push-in. Identity at rest.
 *       .sr-room         static room: wall, floor, horizon (aria-hidden)
 *       .sr-scroller     inset 0; pans horizontally in `pan` mode only
 *     .sr-wall          the wall, width = layout.wallW
 *       .sr-track       ceiling track (aria-hidden)
 *       .sr-bays        5 x .sr-bay: fixture, lens, haze cone, wall scallop, pools
 *       ol.sr-grid      10 x li.sr-slot (never transformed: rest rect)
 *                         a.sr-unit (persistent; C transforms it)
 *                           .sr-plinth (acrylic slab + LED), .sr-unit__shoe > .sr-unit__rim > .k-shoe, label
 *   .sr-caption         editorial line (h1)
 *   .sr-atmos           vignette + grain (aria-hidden)
 */
import type { CoreServices, Product, ShowroomModule, StageSnapshot, ViewTransition } from '../../types.js';
import { createShoeFigure, shoeRectWithin, whenFigureDecoded } from '../../components/shoe-figure.js';
import { SHOE_FRAME } from '../../data/index.js';
import { pct, placeShoe } from '../../lib/scale.js';
import { h } from '../../lib/dom.js';
import { DURATION, EASE, dur, onReducedMotionChange, prefersReducedMotion, settleWithin, wait } from '../../lib/motion.js';
import { COLUMNS, LABEL_H, UNIT_RATIOS, cellOf, computeLayout, scrollForColumn, type StageLayout } from './layout.js';
import { PauseGate, REST, decodeExtra, encodeExtra, sweepSequence } from './sweep.js';

const SEQ = sweepSequence({ columns: COLUMNS, restSteps: 1 });
const REST_STEP = SEQ.indexOf(REST);
/** Opening: gap between one column coming up and the next, ms. Deliberate. */
const IGNITE_STEP = 620;
/**
 * How long the room is held completely dark before the first spot strikes.
 * A full second: long enough for the eye to accept that the room is empty, so
 * that the first light reads as an event rather than as a slow page load.
 */
const IGNITE_LEAD = 1000;
/** Pause after the last display before the camera settles forward, ms. */
const IGNITE_SETTLE = 420;
/**
 * Steps in the opening: one per COLUMN, not one per shoe.
 *
 * A column is one display: the two spots above it strike together and the two
 * pairs under them arrive together. Ten separate reveals read as ten pictures
 * fading in; five read as a room being lit.
 */
const IGNITE_ORDER = COLUMNS;
/** How long a pair takes to come up once its column's spot strikes, ms. */
const EXPOSE_MS = 520;
/**
 * The opening push-in. The room is first seen from a step further back; when
 * the last spot lands the camera eases forward to its resting frame. It is a
 * breath, not a zoom — anything stronger competes with the product flight.
 */
const OPEN_PULLBACK = 0.918;
const OPEN_DOLLY_MS = 1150;
/** After the dolly starts, how long until the interface is allowed back in. */
const OPEN_UI_DELAY = 520;

/**
 * The room photograph (public/images/newbg.png): a dark exhibition
 * hall with side returns, a back wall and a reflective floor. Two numbers
 * describe it, and everything else is derived from them.
 */
const ROOM_PHOTO = {
  /** Natural size, so cover-fitting can be reproduced in script. */
  aspect: 1672 / 941,
  /** Wall/floor junction as a fraction of the photo height. */
  horizon: 0.8725,
} as const;

/**
 * Where the photograph's wall/floor junction lands once it is cover-fitted to
 * a vw x vh stage, in px from the stage top. The two tiers are composed above
 * this line so the shelves read as mounted on the wall in the picture.
 */
function photoHorizon(vw: number, vh: number): number {
  const scaledH = Math.max(vh, vw / ROOM_PHOTO.aspect);
  const offsetY = (vh - scaledH) / 2; // background-position: 50% 50%
  return offsetY + ROOM_PHOTO.horizon * scaledH;
}

interface UnitRecord {
  readonly product: Product;
  readonly slot: HTMLLIElement;
  readonly unit: HTMLAnchorElement;
  /** The box holding the figure and its light layer: where exposure is written. */
  readonly rim: HTMLElement;
  readonly figure: HTMLElement;
  readonly col: number;
  readonly row: number;
  /** Place in SHOWROOM_ORDER. Drives the mobile grid's lighting groups. */
  readonly position: number;
}

export function createShowroom(services: CoreServices): ShowroomModule {
  const records = new Map<string, UnitRecord>();
  const bays: HTMLElement[] = [];
  let root!: HTMLElement;
  let scroller!: HTMLElement;
  let cameraEl!: HTMLElement;
  let dollyEl!: HTMLElement;
  let caption!: HTMLElement;
  let ledger!: HTMLElement;
  let layout: StageLayout | null = null;
  let focusedId: string | null = null;
  let focusDone: Promise<void> = Promise.resolve();
  let step = REST_STEP;
  let timer = 0;
  /**
   * Columns lit so far during the opening, left to right; -1 when the opening
   * is not running. A column lights both of its tiers at once: one overhead
   * spot, the pair beneath it.
   */
  let ignited = -1;
  /**
   * True from the instant the opening is armed until it hands over. It is a
   * separate flag from `ignited` on purpose: `ignited === -1` has to be able
   * to mean "the opening has started and NOTHING is lit yet", which is the
   * state the room must be in on its very first painted frame.
   */
  let opening = false;
  let igniteTimer = 0;
  let openDolly: Animation | null = null;
  /** Clears `data-flying` once the camera has settled (see setFocus). */
  let flyTimer = 0;
  let mounted = false;
  const gate = new PauseGate();
  gate.set('stage', true); // hidden until the first enter

  let resolveReady!: () => void;
  const ready = new Promise<void>((r) => (resolveReady = r));

  // ---------------------------------------------------------------- layout
  function navHeight(): number {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'));
    return Number.isFinite(v) && v > 0 ? v : innerWidth < 760 ? 60 : 72;
  }

  function applyLayout(): void {
    const vw = root.clientWidth || innerWidth;
    const vh = root.clientHeight || innerHeight;
    const prev = layout;
    // Keep the column in view across a resize in pan mode.
    const prevCol = prev && prev.mode === 'pan' ? nearestColumn(prev) : 0;
    const wallBottom = photoHorizon(vw, vh);
    const l = computeLayout({ vw, vh, navH: navHeight(), aspect: SHOE_FRAME.aspect, baseline: SHOE_FRAME.baseline, wallBottom });
    layout = l;
    const s = root.style;
    const px = (n: number) => `${n}px`;
    s.setProperty('--sr-u', px(l.u));
    s.setProperty('--sr-gx', px(l.gx));
    s.setProperty('--sr-gy', px(l.gy));
    s.setProperty('--sr-fig-h', px(l.figH));
    s.setProperty('--sr-sole-y', px(l.soleY));
    s.setProperty('--sr-unit-h', px(l.unitH));
    s.setProperty('--sr-wall-w', px(l.wallW));
    s.setProperty('--sr-grid-x', px(l.gridX));
    s.setProperty('--sr-row0', px(l.rowY[0]));
    s.setProperty('--sr-row1', px(l.rowY[1]));
    s.setProperty('--sr-track-y', px(l.trackY));
    s.setProperty('--sr-lens-y', px(l.lensY));
    s.setProperty('--sr-horizon', px(l.horizonY));
    s.setProperty('--sr-cone-deg', `${l.coneHalfDeg}deg`);
    s.setProperty('--sr-cone-len', px(l.coneLen));
    // Box that contains the feathered cone (penumbra reaches 1.28x the half-angle).
    const coneW = 2 * l.coneLen * Math.tan((Math.min(80, l.coneHalfDeg * 1.3) * Math.PI) / 180);
    s.setProperty('--sr-cone-w', px(Math.round(coneW)));
    s.setProperty('--sr-label-h', px(LABEL_H));
    root.dataset.mode = l.mode;
    if (l.mode === 'pan' && prev && prev.mode === 'pan' && focusedId === null) {
      scroller.scrollLeft = scrollForColumn(l, prevCol, vw);
    }
  }

  function nearestColumn(l: StageLayout): number {
    const mid = scroller.scrollLeft + root.clientWidth / 2;
    const c = Math.round((mid - l.gridX - l.u / 2) / (l.u + l.gx));
    return Math.max(0, Math.min(COLUMNS - 1, c));
  }

  // ---------------------------------------------------------------- lighting
  /**
   * EXPOSURE, written directly.
   *
   * How much light is falling on a pair is the one thing the opening
   * animates, so it is set here rather than left to a cascade: an inline
   * style always wins, and it can be read straight back out of the element,
   * which is what makes the sequence testable. The CSS still owns the CURVE —
   * `.sr-stage[data-ignition] .sr-unit__rim` carries the transition — so this
   * only ever states the target.
   *
   * Nothing here touches geometry. The sneakers stand at their final
   * coordinates from the first painted frame to the last.
   */
  function setExposure(r: UnitRecord, lit: boolean, instant = false): void {
    const st = r.rim.style;
    // The CURVE is stated here too, not left to the cascade. Inheriting it
    // picked up the room's slow 2.2 s cooling transition, so the room was
    // still fading to black three columns into the sequence — the pairs were
    // visible before their own light struck, which is the one thing the
    // opening may not do.
    st.transitionProperty = 'opacity, filter';
    st.transitionTimingFunction = EASE.light;
    st.transitionDuration = instant ? '0ms' : `${EXPOSE_MS}ms`;
    if (lit) {
      st.removeProperty('opacity');
      st.removeProperty('filter');
    } else {
      st.opacity = '0';
      st.filter = 'brightness(0.04)';
    }
  }

  /**
   * Which of the five lighting groups a pair belongs to.
   *
   * The opening is always five steps of two, but what "a column" means
   * depends on the arrangement. On the wall it is a real column, so the group
   * is the column index and the two tiers of it come up together. On a phone
   * the ten pairs are a two-wide grid, so a group is a ROW of that grid —
   * still two pairs, still five steps, still left to right and then down,
   * which is how the grid is read.
   */
  function groupOf(r: UnitRecord): number {
    return layout?.mode === 'pan' ? Math.floor(r.position / 2) : r.col;
  }

  function applyLights(): void {
    root.dataset.light = 'even';
    if (opening) {
      // THE OPENING. One COLUMN at a time, left to right. Both spots in the
      // column strike together and both pairs under them become visible with
      // their light — not before it, not after it, and never one shoe at a
      // time. Everything already lit stays lit; everything the sequence has
      // not reached is genuinely dark, not merely dimmer.
      root.dataset.ignition = 'on';
      const on = (col: number) => col <= ignited;
      bays.forEach((bay, c) => {
        bay.toggleAttribute('data-lit', on(c));
        bay.toggleAttribute('data-lit-r0', on(c));
        bay.toggleAttribute('data-lit-r1', on(c));
      });
      // Arming the opening (nothing lit yet) must be INSTANT: the room has to
      // be black on its first painted frame, not fade there afterwards.
      const arming = ignited < 0;
      for (const r of records.values()) {
        const struck = on(groupOf(r));
        r.unit.toggleAttribute('data-lit', struck);
        setExposure(r, struck, arming);
      }
      return;
    }
    delete root.dataset.ignition;
    // THE STEADY STATE: the hall stands lit, all ten displays at once.
    //
    // A spot that comes up in the opening stays up — that is what the opening
    // is for. An exhibition does not move its lights around while you are
    // looking at the work, and the reference room has every pair lit at the
    // same time; the only thing that changes afterwards is the LED under
    // whichever pair the pointer is on. The per-bay levels for ten-at-once
    // live in the [data-light='even'] block in showroom.css.
    for (const bay of bays) {
      bay.toggleAttribute('data-lit', true);
      bay.toggleAttribute('data-lit-r0', true);
      bay.toggleAttribute('data-lit-r1', true);
    }
    for (const r of records.values()) {
      r.unit.toggleAttribute('data-lit', true);
      setExposure(r, true);
    }
  }

  /**
   * There is no longer a light to re-schedule: once the opening has run, the
   * hall simply stays lit. This is kept as the one place that parks any timer
   * the opening left behind, so every caller (enter/leave, the pause API, the
   * visibility and reduced-motion listeners) still has a single entry point.
   */
  function syncSweep(): void {
    if (opening) return; // the opening owns the lights until it hands over
    clearTimeout(timer);
    timer = 0;
  }

  function cancelIgnition(): void {
    clearTimeout(igniteTimer);
    igniteTimer = 0;
    ignited = -1;
    opening = false;
    openDolly?.cancel();
    openDolly = null;
    dollyEl?.style.removeProperty('transform');
    dollyEl?.style.removeProperty('transform-origin');
    if (root) delete root.dataset.opening;
  }

  /**
   * The opening.
   *
   * The room starts completely dark and completely empty — no spots, no pairs,
   * no type anywhere (`data-ignition` is what hides the header, the caption and
   * the ledger) — and is HELD there for a full second. Then the five columns
   * come up one at a time from the left, each striking BOTH of its spots and
   * revealing BOTH of its pairs together, each staying on. When the last one lands the
   * camera eases forward from a step back to its resting frame, and only then
   * is the interface allowed into the room.
   */
  function runIgnition(): void {
    cancelIgnition();
    opening = true;
    ignited = -1; // armed, nothing lit: the room's first frame is fully dark
    applyLights();
    // Park the camera a step back before the first frame is shown.
    dollyEl.style.transformOrigin = '50% 62%';
    dollyEl.style.transform = `scale(${OPEN_PULLBACK})`;

    const finish = (): void => {
      // The push-in and the hand-off to the lit hall are one movement, so the
      // pulled-back pose must never be released before the animation that
      // replaces it exists — clearing it first would paint one frame at full
      // size and snap back. `data-opening` holds the interface out for a beat
      // longer, so the type arrives into a room that is already settling.
      const reduced = gate.has('reduced');
      clearTimeout(igniteTimer);
      igniteTimer = 0;
      ignited = -1;
      opening = false;
      root.dataset.opening = 'dolly';
      applyLights(); // clears data-ignition: the hall now stands fully lit
      if (reduced || typeof dollyEl.animate !== 'function') {
        dollyEl.style.removeProperty('transform');
        dollyEl.style.removeProperty('transform-origin');
        delete root.dataset.opening;
        return;
      }
      const a = dollyEl.animate(
        [{ transform: `scale(${OPEN_PULLBACK})` }, { transform: 'scale(1)' }],
        { duration: OPEN_DOLLY_MS, easing: EASE.camera, fill: 'forwards' },
      );
      openDolly = a;
      void a.finished.then(
        () => {
          if (openDolly !== a) return;
          openDolly = null;
          // Land on a clean identity: nothing is left transformed at rest, so
          // C's flight starts from the exact geometry getRestRect reports.
          dollyEl.style.removeProperty('transform');
          dollyEl.style.removeProperty('transform-origin');
          a.cancel();
        },
        () => undefined,
      );
      igniteTimer = window.setTimeout(() => {
        igniteTimer = 0;
        delete root.dataset.opening;
      }, OPEN_UI_DELAY);
    };

    const next = (): void => {
      if (!gate.running) {
        cancelIgnition();
        applyLights();
        return;
      }
      ignited += 1;
      applyLights();
      if (ignited < IGNITE_ORDER - 1) igniteTimer = window.setTimeout(next, IGNITE_STEP);
      else igniteTimer = window.setTimeout(finish, IGNITE_SETTLE);
    };
    igniteTimer = window.setTimeout(next, IGNITE_LEAD);
  }

  // ---------------------------------------------------------------- DOM
  function buildUnit(p: Product, position: number): UnitRecord {
    const { col, row } = cellOf(position);
    // LOADING ORDER FOLLOWS THE OPENING ORDER.
    //
    // These are full-resolution PNGs — around 2 MB each, because the camera
    // close-up must never land on a downscaled copy — so the order they are
    // fetched in decides how quickly the room can be shown. The opening lights
    // column 0 first and only reaches column 4 about three seconds later, so
    // the first column is fetched at high priority and the rest trail it.
    const figure = createShoeFigure(p, {
      fetchPriority: col === 0 ? 'high' : col === 1 ? 'auto' : 'low',
      decorative: true,
    });
    // LIGHT ON THE PRODUCT, not brightness on the image.
    //
    // ONE extra layer sits in the same box as the sneaker, stencilled by the
    // sneaker's own alpha channel so what it paints lands on the shoe and
    // nowhere else: `__skin`, a top-down ramp of light, screen-blended, so
    // upper surfaces catch the overhead spot and everything under the midsole
    // stays dark. Its geometry is the same placeShoe() result the <img> is
    // positioned with, so the stencil registers with the photograph exactly.
    //
    // There is deliberately no cast-shadow layer. A blurred silhouette behind
    // each shoe read as an artificial dark halo on a wall that is already
    // nearly black, and it put ten blur filters inside the one layer the
    // camera scales. The shoes are grounded by the contact shadow on the
    // glass instead (see .sr-plinth__top::before).
    const place = placeShoe(p.image, SHOE_FRAME);
    // The stencil URL goes in the INLINE style, not in a custom property.
    // A relative url() inside a custom property is resolved against the
    // stylesheet that substitutes it (showroom.css, three directories down),
    // not against the document — which silently 404s every mask and leaves
    // the product unlit. In a style attribute it resolves against the page.
    const mask = `url("${p.image.src}")`;
    const box =
      `left:${pct(place.left)};top:${pct(place.top)};width:${pct(place.width)};height:${pct(place.height)};` +
      `-webkit-mask-image:${mask};mask-image:${mask}`;
    const skin = h('span', { class: 'sr-unit__skin', 'aria-hidden': 'true', style: box });
    const rim = h('div', { class: 'sr-unit__rim' }, figure, skin);
    // Nothing is ever drawn over the sneaker: the pointer light goes to the
    // shelf, not to the product.
    const shoe = h('div', { class: 'sr-unit__shoe' }, rim);
    const plinth = h(
      'span',
      { class: 'sr-plinth', 'aria-hidden': 'true' },
      h('span', { class: 'sr-plinth__cast' }),
      h('span', { class: 'sr-plinth__spill' }),
      h('span', { class: 'sr-plinth__top' }),
      h('span', { class: 'sr-plinth__front' }),
      h('span', { class: 'sr-plinth__edge-glow' }),
      h('span', { class: 'sr-plinth__led' }),
      h('span', { class: 'sr-plinth__led-lit' }),
    );
    // The caption belongs to the light, not to the shelf: it appears on the
    // dark wall under a pair only while that pair is lit by the pointer or by
    // keyboard focus, in the same ember the LED is burning. Ten standing
    // labels would turn the wall into a product grid.
    const label = h(
      'span',
      { class: 'sr-unit__label', 'aria-hidden': 'true' },
      h('span', { class: 'sr-unit__name' }, p.name),
      h('span', { class: 'sr-unit__meta' }, p.colorway),
    );
    const unit = h(
      'a',
      {
        class: 'sr-unit',
        href: services.productPath(p.id),
        'data-product-id': p.id,
        'aria-label': `${p.name}, ${p.colorway}`,
      },
      plinth,
      shoe,
      label,
    );
    const slot = h('li', { class: 'sr-slot', 'data-col': col, 'data-row': row, style: `--sr-col:${col};--sr-row:${row}` }, unit);
    return { product: p, slot, unit, rim, figure, col, row, position };
  }

  function buildBay(col: number): HTMLElement {
    return h(
      'div',
      { class: 'sr-bay', 'data-col': col, style: `--sr-col:${col}` },
      h('span', { class: 'sr-bay__scallop' }),
      h('span', { class: 'sr-bay__pool sr-bay__pool--r0' }),
      h('span', { class: 'sr-bay__pool sr-bay__pool--r1' }),
      h('span', { class: 'sr-bay__floor' }),
      h('span', { class: 'sr-bay__haze' }),
      h('span', { class: 'sr-bay__core' }),
    );
  }

  /**
   * Untransformed viewport box of a unit, straight from the layout numbers.
   * In pan mode the wall is scrolled, so the scroll offset comes off the x.
   */
  function restRectOf(id: string): DOMRect | null {
    const r = records.get(id);
    if (!r || !cameraEl) return null;
    // MEASURE, then divide the camera out.
    //
    // Deriving this from the layout model meant the camera only understood
    // the one arrangement the model described; a different grid on a phone
    // would have aimed it at coordinates nothing was standing on. Measuring
    // the slot works for any arrangement CSS cares to produce — and because
    // the scene sits under a single `translate(tx, ty) scale(s)` layer, the
    // untransformed box is recovered exactly by inverting that one matrix.
    const m = new DOMMatrixReadOnly(getComputedStyle(cameraEl).transform);
    const s = m.a || 1;
    const b = r.slot.getBoundingClientRect();
    return new DOMRect((b.left - m.e) / s, (b.top - m.f) / s, b.width / s, b.height / s);
  }

  // ---------------------------------------------------------------- focus mode
  function setFocusClasses(id: string | null): void {
    root.classList.toggle('is-focus-mode', id !== null);
    // The bay the camera is flying into keeps its light at full strength, so
    // the spot's pool on the wall behind the selected pair stays in the shot.
    const focusCol = id ? (records.get(id)?.col ?? -1) : -1;
    bays.forEach((bay, c) => bay.toggleAttribute('data-focus', c === focusCol));
    for (const [pid, r] of records) {
      const on = pid === id;
      r.slot.classList.toggle('is-focused', on);
      r.unit.classList.toggle('is-focused', on);
      r.slot.classList.toggle('is-quiet', id !== null && !on);
    }
    caption.setAttribute('aria-hidden', id !== null ? 'true' : 'false');
  }

  // ---------------------------------------------------------------- module
  const offFns: Array<() => void> = [];

  const module: ShowroomModule = {
    ready,
    get root() {
      return root;
    },
    get camera() {
      return cameraEl;
    },

    mount(el) {
      if (mounted) return;
      mounted = true;
      root = el;
      root.classList.add('sr-stage');
      root.style.setProperty('--sr-slab-r', String(UNIT_RATIOS.slab));
      root.style.setProperty('--sr-top-r', String(UNIT_RATIOS.topFace));

      const room = h(
        'div',
        { class: 'sr-room', 'aria-hidden': 'true' },
        h('span', { class: 'sr-room__photo' }),
        h('span', { class: 'sr-room__wall' }),
        h('span', { class: 'sr-room__floor' }),
        h('span', { class: 'sr-room__horizon' }),
        h('span', { class: 'sr-room__ceiling' }),
      );
      const bayLayer = h('div', { class: 'sr-bays', 'aria-hidden': 'true' });
      for (let c = 0; c < COLUMNS; c++) {
        const b = buildBay(c);
        bays.push(b);
        bayLayer.append(b);
      }
      const grid = h('ol', { class: 'sr-grid', role: 'list', 'aria-label': 'The archive, ten pairs' });
      services.products.forEach((p, i) => {
        const r = buildUnit(p, i);
        records.set(p.id, r);
        grid.append(r.slot);
      });
      const wall = h('div', { class: 'sr-wall' }, h('span', { class: 'sr-track', 'aria-hidden': 'true' }), bayLayer, grid);
      scroller = h('div', { class: 'sr-scroller' }, wall);
      // THE CAMERA RIG. Two nested full-viewport layers, both anchored at the
      // stage's own top-left with transform-origin 0 0. A transform on either
      // moves the WHOLE scene — the photograph, the lights and all ten pairs
      // together — which is the difference between a camera travelling into a
      // room and an element flying out of one. Nothing inside is ever moved
      // on its own, so the ten pairs keep their showroom coordinates forever.
      dollyEl = h('div', { class: 'sr-camera__dolly' }, room, scroller);
      cameraEl = h('div', { class: 'sr-camera' }, dollyEl);
      caption = h(
        'div',
        { class: 'sr-caption' },
        h('h1', { class: 'sr-caption__title' }, 'Ten pairs, lit from within.'),
        h('p', { class: 'sr-caption__line' }, 'Footwear / Series 01'),
      );
      const atmos = h('div', { class: 'sr-atmos', 'aria-hidden': 'true' });
      // The lower edge of the room: what you are looking at, what to do with
      // it, and the way out. Three tiny lines of type on the dark floor —
      // deliberately NOT a footer, because the stage has no second section
      // and nothing here may read as the start of one.
      ledger = h(
        'div',
        { class: 'sr-ledger' },
        h(
          'p',
          { class: 'sr-ledger__id' },
          h('span', { class: 'sr-ledger__dot', 'aria-hidden': 'true' }),
          `Series 01 / ${services.products.length} silhouettes`,
        ),
        h('p', { class: 'sr-ledger__hint' }, 'Hover to illuminate. Select to explore.'),
        h(
          'a',
          { class: 'sr-ledger__about', href: '#/about' },
          'About KICCLE',
          h('span', { class: 'sr-ledger__arrow', 'aria-hidden': 'true' }, '↗'),
        ),
      );
      root.append(cameraEl, caption, ledger, atmos);

      gate.set('reduced', prefersReducedMotion());
      applyLayout();
      applyLights();

      // Resize: ResizeObserver callbacks run before paint, so no stale frame.
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(() => applyLayout());
        ro.observe(root);
        offFns.push(() => ro.disconnect());
      } else {
        const onResize = () => applyLayout();
        addEventListener('resize', onResize);
        offFns.push(() => removeEventListener('resize', onResize));
      }
      const onVis = () => {
        gate.set('tab', document.hidden);
        syncSweep();
      };
      document.addEventListener('visibilitychange', onVis);
      offFns.push(() => document.removeEventListener('visibilitychange', onVis));
      offFns.push(
        onReducedMotionChange((reduced) => {
          gate.set('reduced', reduced);
          applyLights();
          syncSweep();
        }),
      );
      // Pointer-tracked light. One listener on the grid, not ten: the pointer
      // position is written as a percentage into the hovered unit so CSS can
      // put a soft highlight exactly under the cursor. No library, no rAF —
      // a pointermove already arrives at most once per frame.
      if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
        let litUnit: HTMLElement | null = null;
        const clear = () => {
          litUnit?.style.removeProperty('--sr-px');
          litUnit?.style.removeProperty('--sr-py');
          litUnit = null;
        };
        const onMove = (e: PointerEvent) => {
          const unit = (e.target as Element | null)?.closest<HTMLElement>('.sr-unit') ?? null;
          if (unit !== litUnit) clear();
          if (!unit) return;
          litUnit = unit;
          const b = unit.getBoundingClientRect();
          if (b.width <= 0 || b.height <= 0) return;
          unit.style.setProperty('--sr-px', `${(((e.clientX - b.left) / b.width) * 100).toFixed(2)}%`);
          unit.style.setProperty('--sr-py', `${(((e.clientY - b.top) / b.height) * 100).toFixed(2)}%`);
        };
        grid.addEventListener('pointermove', onMove, { passive: true });
        grid.addEventListener('pointerleave', clear, { passive: true });
        offFns.push(() => {
          grid.removeEventListener('pointermove', onMove);
          grid.removeEventListener('pointerleave', clear);
          clear();
        });
      }
      // Touch: hover styles live behind @media (hover: hover) and (pointer: fine),
      // so a tap never leaves a sticky LED.

      // `ready` is "the room can be shown", not "every byte has arrived".
      //
      // Waiting on all ten decodes held the intro up for the whole ~19 MB of
      // the collection before anything appeared. The opening only needs the
      // first column to exist at the moment it strikes; the other four are
      // already in flight and have between 0.6 and 3 seconds of runway each.
      const firstColumn = [...records.values()].filter((r) => r.col === 0).map((r) => whenFigureDecoded(r.figure));
      void settleWithin(Promise.all(firstColumn), 6000).then(() => resolveReady());
    },

    enter(t: ViewTransition) {
      gate.set('stage', false);
      gate.set('tab', document.hidden);
      const reduced = t.reducedMotion || prefersReducedMotion();
      gate.set('reduced', reduced);
      cancelIgnition();
      // Decide BEFORE painting. Lighting the hall and only then starting the
      // opening put one frame of the finished room on screen, which is the
      // one thing the opening must never show.
      if (t.initial && !reduced) {
        // Decorative work is never awaited: the room is interactive immediately.
        runIgnition();
      } else {
        applyLights();
        syncSweep();
      }
    },

    leave(_t: ViewTransition) {
      gate.set('stage', true);
      cancelIgnition();
      syncSweep();
    },

    unmount() {
      clearTimeout(timer);
      clearTimeout(flyTimer);
      cancelIgnition();
      for (const f of offFns.splice(0)) f();
    },

    getUnit: (id) => records.get(id)?.unit ?? null,
    getFigure: (id) => records.get(id)?.figure ?? null,

    getRestRect(id) {
      // Measured from the layout model, never from getBoundingClientRect.
      // The whole scene now lives under a transformed camera, so a measured
      // rect would come back already flown; what C needs is where the pair
      // sits when the camera is at rest. #k-stage is fixed at inset 0, so
      // these stage coordinates are viewport coordinates.
      return restRectOf(id);
    },

    getShoeRect(id) {
      const r = records.get(id);
      const box = restRectOf(id);
      if (!r || !box) return null;
      // The figure sits at the unit's top-left and fills its width (showroom.css).
      const figRect = { left: box.left, top: box.top, width: box.width, height: box.width / SHOE_FRAME.aspect };
      return shoeRectWithin(r.product, figRect);
    },

    setFocus(id) {
      const next = id !== null && records.has(id) ? id : null;
      if (next === focusedId) return focusDone;
      focusedId = next;
      setFocusClasses(next);
      // THE FLIGHT WINDOW.
      //
      // While the camera is travelling, the scene is one composited layer
      // being scaled. Anything still animating INSIDE that layer invalidates
      // its raster on every frame, so the browser both repaints the whole
      // room each frame (the stutter) and stops rendering it at the scale it
      // is being shown at (the softness). `data-flying` is how showroom.css
      // knows to settle every inner transition inside the first fifth of the
      // move instead of letting them run across all of it.
      root.dataset.flying = 'on';
      clearTimeout(flyTimer);
      flyTimer = window.setTimeout(() => {
        flyTimer = 0;
        delete root.dataset.flying;
      }, DURATION.camera + 120);
      gate.set('focus', next !== null);
      syncSweep();
      services.bus.emit('stage:focus', { productId: next });
      const p = wait(dur(DURATION.slow, 200));
      focusDone = p;
      return p;
    },

    pauseSpotlights() {
      gate.pauseApi();
      syncSweep();
    },

    resumeSpotlights() {
      gate.resumeApi();
      syncSweep();
    },

    snapshot(): StageSnapshot {
      return {
        focusedId,
        scrollLeft: scroller ? scroller.scrollLeft : 0,
        scrollTop: scroller ? scroller.scrollTop : 0,
        extra: encodeExtra(step),
      };
    },

    restore(s) {
      if (!scroller) return;
      scroller.scrollLeft = s.scrollLeft;
      scroller.scrollTop = s.scrollTop;
      const st = decodeExtra(s.extra, SEQ.length);
      if (st !== null && st !== step) {
        step = st;
        applyLights();
      }
      void module.setFocus(s.focusedId);
    },
  };
  return module;
}
