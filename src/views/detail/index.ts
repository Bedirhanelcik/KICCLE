/**
 * Product detail (Package C).
 *
 * Opening a product is a camera move, not a modal: the showroom unit itself
 * (same element, same image, no clone, no rotation) dollies toward the main
 * visual area with translate + uniform scale, the rest of the room quiets
 * through `stage.setFocus`, and the information panel arrives on the right
 * (a sheet below the shoe under 760px). Back reverses the move exactly.
 *
 * Every move starts from the unit's CURRENT computed transform, so an
 * interrupted zoom (rapid navigation, Back mid-move) reverses or retargets
 * smoothly instead of jumping.
 */
import type { AppServices, Product, StageSnapshot, View, ViewTransition } from '../../types.js';
import { SHOE_FRAME } from '../../data/frame.js';
import { whenFigureDecoded } from '../../components/shoe-figure.js';
import { visibleBoxInFrame } from '../../lib/scale.js';
import { focusables, h } from '../../lib/dom.js';
import { DURATION, EASE, prefersReducedMotion, settleWithin } from '../../lib/motion.js';
import {
  IDENTITY,
  computeLayout,
  computeTarget,
  dollyKeyframes,
  easingFromCss,
  isIdentity,
  parseMatrix,
  sceneAnchor,
  toScene,
  remainingFraction,
  toCss,
  type CameraTarget,
  type CameraTransform,
  type DetailLayout,
  type ShoeGeometry,
} from './camera.js';
import { renderPanel, type PanelParts } from './panel.js';

const cameraEase = easingFromCss(EASE.camera);
/** Used when a move starts from a moving state: no slow lift-off, same long settle. */
const retargetEase = easingFromCss('cubic-bezier(0.35, 0, 0.12, 1)');

function untilAbort(signal: AbortSignal): Promise<void> {
  return new Promise((r) => {
    if (signal.aborted) r();
    else signal.addEventListener('abort', () => r(), { once: true });
  });
}

function navHeight(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'));
  return Number.isFinite(v) && v > 0 ? v : innerWidth < 760 ? 60 : 72;
}

/** Largest visible shoe width that keeps the image at or under 1:1 with the source the
 *  foundation's `sizes` selected ('(max-width: 760px) 92vw, 50vw'). */
function maxShoeWidth(vw: number): number {
  const slot = vw <= 760 ? vw * 0.92 : vw * 0.5;
  return slot * SHOE_FRAME.contentWidth;
}

export function createDetail(services: AppServices): View {
  const { stage } = services;

  let wrap!: HTMLElement;
  let backdrop!: HTMLElement;
  let panel!: HTMLElement;
  let lead!: HTMLElement;
  let scroll!: HTMLElement;
  let actions!: HTMLElement;
  let parts: PanelParts | null = null;

  let openId: string | null = null;
  let snap: StageSnapshot | null = null;
  let layout: DetailLayout | null = null;
  let target: CameraTarget | null = null;
  /**
   * THE CAMERA IS ONE OBJECT, SO IT HAS ONE ANIMATION.
   *
   * This used to be a Map keyed by product id, from when every pair was
   * transformed on its own element. Now a single layer carries the whole
   * scene, so a handle stored per product meant a flight into B could not
   * see — and therefore could not cancel — the flight out of A that was
   * still running on the very same element. Two WAAPI animations with
   * `fill: forwards` then fought over one transform, which is exactly the
   * "press Back then immediately tap another shoe" breakage: doubled
   * movement, the wrong pair framed, or a camera stuck between poses.
   *
   * One handle, one owner. `moveToken` is bumped by every new move so a
   * late-finishing older move can never write the final pose.
   */
  let cameraAnim: Animation | null = null;
  let moveToken = 0;
  let tabBackward = false;
  let resizeRaf = 0;

  const geometryOf = (p: Product): ShoeGeometry => ({
    visibleBox: visibleBoxInFrame(p.image, SHOE_FRAME),
    aspect: SHOE_FRAME.aspect,
    baseline: SHOE_FRAME.baseline,
  });

  // ------------------------------------------------------------------ layout

  function applyLayout(): DetailLayout {
    const vw = document.documentElement.clientWidth || innerWidth;
    const vh = innerHeight;
    const l = computeLayout(vw, vh, navHeight());
    layout = l;
    wrap.dataset.mode = l.mode;
    const st = wrap.style;
    st.setProperty('--dt-panel-left', `${l.panel.left}px`);
    st.setProperty('--dt-panel-top', `${l.panel.top}px`);
    st.setProperty('--dt-panel-width', `${l.panel.width}px`);
    st.setProperty('--dt-panel-height', `${l.panel.height}px`);
    st.setProperty('--dt-stage-height', `${l.stage.height}px`);
    placeSizes();
    placeHead();
    return l;
  }

  /** Wide and tall enough: sizes sit with Add to cart in the pinned footer (always in view).
   *  Sheet or short side panel: in the scroll, so the text keeps room; Add to cart stays pinned. */
  function placeSizes() {
    const f = parts?.sizes;
    if (!f || !layout) return;
    if (layout.mode === 'side' && layout.panel.height >= 680) {
      if (f.parentElement !== actions) actions.prepend(f);
    } else if (f.parentElement !== scroll) scroll.append(f);
  }

  /** Wide: the name stands in the lead, over the room. Narrow: there is no
   *  room to stand in, so it goes to the top of the sheet. */
  function placeHead() {
    const head = parts?.head;
    if (!head || !layout) return;
    if (layout.mode === 'side') {
      if (head.parentElement !== lead) lead.append(head);
    } else if (head.parentElement !== scroll) scroll.prepend(head);
  }

  function aim(id: string): CameraTarget | null {
    const p = services.getProduct(id);
    const rest = stage.getRestRect(id);
    const shoe = stage.getShoeRect(id);
    if (!p || !rest || !shoe || rest.width <= 0 || shoe.width <= 0 || !layout) return null;
    const vw = document.documentElement.clientWidth || innerWidth;
    const t = computeTarget(rest, shoe, geometryOf(p), layout, { maxShoeWidth: maxShoeWidth(vw) });
    // The move is applied to the camera layer, not to the pair, so the
    // translation has to be re-expressed from the viewport origin.
    return { ...t, transform: toScene(t.transform, rest) };
  }

  // ------------------------------------------------------------------ camera

  /**
   * Our inline writes must never become CSS transitions (e.g. the reduced-motion clamp in
   * base.css gives every element a transition duration with the default `transition-property:
   * all`). Finish any such transition on the properties C owns, without touching other styles.
   */
  function settleOwnTransitions(el: HTMLElement) {
    if (typeof el.getAnimations !== 'function') return;
    for (const a of el.getAnimations()) {
      const prop = (a as Animation & { transitionProperty?: string }).transitionProperty;
      if (prop === 'transform' || prop === 'transform-origin' || prop === 'will-change') a.finish();
    }
  }

  function clearUnit(el: HTMLElement) {
    el.style.removeProperty('transform');
    el.style.removeProperty('transform-origin');
    el.style.removeProperty('will-change');
    settleOwnTransitions(el);
  }

  function placeUnit(el: HTMLElement, t: CameraTransform) {
    el.style.transformOrigin = '0 0';
    el.style.transform = toCss(t);
    settleOwnTransitions(el);
  }

  function currentOf(el: HTMLElement): CameraTransform {
    return parseMatrix(getComputedStyle(el).transform) ?? IDENTITY;
  }

  /**
   * Move the unit from wherever it is now to `to` along the dolly path.
   * Resolves when the move finished or was superseded by another move.
   */
  function moveUnit(id: string, to: CameraTransform, duration: number, ease: (t: number) => number): Promise<void> {
    // THE CAMERA, not the product. `to` was computed to put THIS pair's rest
    // box onto the presentation frame; applying it to the scene layer (origin
    // 0 0, anchored at the viewport) maps that box to exactly the same place,
    // and carries the room, the lights and the other nine pairs with it. The
    // target therefore still depends on which pair was clicked — the move is
    // different for every one of the ten — while nothing in the room is ever
    // repositioned relative to anything else.
    const unit = stage.camera;
    const p = services.getProduct(id);
    const rest = stage.getRestRect(id);
    const shoe = stage.getShoeRect(id);
    if (!unit) return Promise.resolve();
    // Read the pose that is ON SCREEN before cancelling, so a move that
    // interrupts another continues from where the camera actually is instead
    // of snapping back to a start it never had.
    const from = currentOf(unit);
    cameraAnim?.cancel();
    cameraAnim = null;
    const token = ++moveToken;
    const toRest = isIdentity(to, 1e-6);

    const settleAt = (t: CameraTransform) => {
      // Only the move that is still the current one may commit a final pose.
      if (token !== moveToken) return;
      if (isIdentity(t, 1e-6)) clearUnit(unit);
      else {
        placeUnit(unit, t);
        // Drop the layer hint so the browser re-rasterises the image crisply at its final scale.
        unit.style.removeProperty('will-change');
      }
    };

    if (duration <= 0 || typeof unit.animate !== 'function' || isIdentity({ tx: from.tx - to.tx, ty: from.ty - to.ty, s: 1 + from.s - to.s }, 1e-4)) {
      settleAt(to);
      return Promise.resolve();
    }
    // While the move runs the inline style holds the pose we start from and the animation
    // holds its end pose (fill: forwards). Whether or not the animation is applying in a
    // given frame, the element shows the right pose: no flash at either end.
    placeUnit(unit, from);
    unit.style.willChange = 'transform';
    settleOwnTransitions(unit);
    const anchor = p && rest && shoe ? sceneAnchor(rest, shoe, geometryOf(p)) : { x: 0, y: 0 };
    // KEYFRAME DENSITY.
    //
    // The dolly path is sampled into a polyline and WAAPI interpolates each
    // segment LINEARLY, so a segment is a stretch of constant velocity. At one
    // sample per 28 ms a segment lasted nearly two frames, which means the
    // speed of the zoom changed in visible little jumps — the "moves in small
    // jerky steps" feeling, even though no frame was ever dropped.
    //
    // One sample per 8 ms puts every segment comfortably under a single frame
    // at 120 Hz, so the velocity changes below the refresh rate and the move
    // reads as one continuous acceleration. ~165 keyframes for a 1.3 s flight
    // costs nothing: they are built once and handed to the compositor.
    const steps = Math.max(24, Math.round(duration / 8));
    const anim = unit.animate(dollyKeyframes(from, to, anchor, ease, steps), { duration, easing: 'linear', fill: 'forwards' });
    cameraAnim = anim;
    return anim.finished.then(
      () => {
        if (cameraAnim !== anim || token !== moveToken) return;
        cameraAnim = null;
        // Same task: commit the end pose inline, then drop the held animation.
        settleAt(to);
        anim.cancel();
      },
      () => undefined, // cancelled by a newer move (which read the on-screen pose first)
    );
  }

  /**
   * Reduced motion: no camera movement. The scene is cut to its new framing
   * behind a short cross-fade — the only thing that moves is opacity, and it
   * is well under the 200 ms the contract allows. Nothing is ever left
   * hidden: the fade always ends at full opacity.
   */
  async function fadeUnitTo(id: string, to: CameraTransform): Promise<void> {
    const unit = stage.camera;
    if (!unit) return;
    cameraAnim?.cancel();
    cameraAnim = null;
    if (typeof unit.animate !== 'function') {
      if (isIdentity(to, 1e-6)) clearUnit(unit);
      else placeUnit(unit, to);
      return;
    }
    const out = unit.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, easing: 'linear', fill: 'forwards' });
    await out.finished.catch(() => undefined);
    unit.style.removeProperty('will-change');
    if (isIdentity(to, 1e-6)) clearUnit(unit);
    else placeUnit(unit, to);
    const back = unit.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 110, easing: 'linear' });
    out.cancel();
    await back.finished.catch(() => undefined);
  }

  // ------------------------------------------------------------------ panel motion

  function cancelPanelAnimations() {
    for (const a of panel.getAnimations({ subtree: true })) a.cancel();
  }

  function showPanel(delay: number, reduced: boolean, quick: boolean): Promise<void> {
    cancelPanelAnimations();
    panel.hidden = false;
    wrap.dataset.state = 'open';
    if (typeof panel.animate !== 'function') return Promise.resolve();
    if (reduced || quick) {
      return panel
        .animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduced ? 180 : DURATION.base, delay: quick ? 0 : delay, easing: EASE.standard, fill: 'backwards' })
        .finished.then(() => undefined, () => undefined);
    }
    const sheet = layout?.mode === 'sheet';
    const slab = panel.animate(
      [
        { opacity: 0, transform: sheet ? 'translateY(56px)' : 'translateX(48px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: DURATION.slow + 140, delay, easing: EASE.out, fill: 'backwards' },
    );
    const items = (parts?.sequence ?? []).map((el, i) =>
      el.animate(
        [
          { opacity: 0, transform: 'translateY(14px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: DURATION.slow, delay: delay + 140 + i * 55, easing: EASE.out, fill: 'backwards' },
      ),
    );
    return Promise.all([slab, ...items].map((a) => a.finished.catch(() => undefined))).then(() => undefined);
  }

  function hidePanel(reduced: boolean): Promise<void> {
    if (panel.hidden) return Promise.resolve();
    const opacity = getComputedStyle(panel).opacity;
    cancelPanelAnimations();
    wrap.dataset.state = 'closing';
    const done = () => {
      if (wrap.dataset.state !== 'closing') return; // re-opened meanwhile
      panel.hidden = true;
      wrap.dataset.state = 'closed';
      cancelPanelAnimations();
    };
    if (typeof panel.animate !== 'function') {
      done();
      return Promise.resolve();
    }
    const sheet = layout?.mode === 'sheet';
    const a = panel.animate(
      [
        { opacity: Number(opacity) || 1, transform: 'none' },
        { opacity: 0, transform: reduced ? 'none' : sheet ? 'translateY(40px)' : 'translateX(32px)' },
      ],
      { duration: reduced ? 160 : DURATION.base, easing: EASE.in, fill: 'forwards' },
    );
    return a.finished.then(done, () => undefined);
  }

  // ------------------------------------------------------------------ keyboard + pointer containment

  /** The stage behind the detail is not reachable by keyboard while it is open. */
  function onFocusIn(e: FocusEvent) {
    if (!openId || services.cart.isOpen()) return;
    const t = e.target as Node | null;
    if (!t || !stage.root.contains(t)) return;
    // focusables() does not see `visibility: hidden` (e.g. the hidden pages surface): filter it here.
    const visible = (el: HTMLElement) => !stage.root.contains(el) && (el.checkVisibility?.({ visibilityProperty: true }) ?? true);
    const all = focusables(document.body).filter(visible);
    const inPanel = focusables(panel);
    const fallback = tabBackward ? inPanel[inPanel.length - 1] : inPanel[0];
    let next: HTMLElement | undefined = fallback;
    if (tabBackward) {
      // Coming back from the panel: whatever precedes it outside the stage (the nav), else the panel's last control.
      const first = inPanel[0];
      const i = first ? all.indexOf(first) : -1;
      next = (i > 0 ? all[i - 1] : undefined) ?? fallback;
    }
    next?.focus({ preventScroll: true });
    if (stage.root.contains(document.activeElement)) (fallback ?? parts?.heading)?.focus({ preventScroll: true });
  }
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Tab') tabBackward = e.shiftKey;
    if (e.key !== 'Escape' || !openId || e.defaultPrevented || services.cart.isOpen()) return;
    e.preventDefault();
    services.back('#/');
  }
  function onResize() {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (!openId) return;
      applyLayout();
      const next = aim(openId);
      if (!next) return;
      target = next;
      const unit = stage.camera;
      if (!unit) return;
      if (cameraAnim) {
        // Mid-move: retarget smoothly over what is left of the move.
        const timing = cameraAnim.effect?.getComputedTiming();
        const left = timing && typeof timing.endTime === 'number' ? Math.max(120, timing.endTime - Number(cameraAnim.currentTime ?? 0)) : 300;
        void moveUnit(openId, next.transform, left, retargetEase);
      } else placeUnit(unit, next.transform);
    });
  }

  function arm() {
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    wrap.dataset.open = 'true';
  }
  function disarm() {
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    cancelAnimationFrame(resizeRaf);
    wrap.dataset.open = 'false';
  }

  const goBack = () => services.back('#/');

  // ------------------------------------------------------------------ view

  return {
    mount(root) {
      backdrop = h('div', { class: 'dt-backdrop', 'aria-hidden': 'true' });
      scroll = h('div', { class: 'dt-panel__scroll' });
      actions = h('div', { class: 'dt-actions' });
      panel = h('section', { class: 'dt-panel', hidden: true }, scroll, actions);
      lead = h('div', { class: 'dt-lead' });
      wrap = h('div', { class: 'dt', 'data-state': 'closed', 'data-open': 'false' }, backdrop, lead, panel);
      root.append(wrap);
      applyLayout();
      // Clicking the quiet room (wide screens) steps the camera back out.
      backdrop.addEventListener('click', () => {
        if (openId && layout?.mode === 'side') goBack();
      });
      // The room behind must not scroll while the camera is in.
      const stop = (e: Event) => e.preventDefault();
      backdrop.addEventListener('wheel', stop, { passive: false });
      backdrop.addEventListener('touchmove', stop, { passive: false });
    },

    async enter(t: ViewTransition) {
      if (t.to.name !== 'product') return;
      const id = t.to.productId;
      const p = services.getProduct(id);
      if (!p) return;
      openId = id;
      snap = stage.snapshot();
      const reduced = t.reducedMotion || prefersReducedMotion();

      // The panel is NOT built yet. Building it is the single most expensive
      // thing this function does — a few hundred nodes for the materials,
      // characteristics and nine size keys — and doing it before the camera
      // starts put that cost on the flight's very first frame, which is a
      // visible hitch right where a cinematic move can least afford one.
      // applyLayout() needs only the viewport, so the camera can be aimed and
      // launched first and the panel built into the move.
      applyLayout();
      const focusDone = stage.setFocus(id);
      target = aim(id);
      const unit = stage.camera;

      // SHARPNESS. The camera is about to magnify this pair about 3.4x, so the
      // one thing that must not happen mid-flight is the browser still
      // decoding its bitmap — that is what produces a soft frame that snaps
      // into focus afterwards. Each sneaker is a single full-resolution file
      // (no srcset, so there is no low-resolution candidate to land on) and
      // the stage decodes them all at boot; this just refuses to start the
      // move until THIS one is definitely ready. Time-boxed, so a stalled
      // image can never hold the interaction.
      const figure = stage.getFigure(id);
      if (figure && !t.initial) await settleWithin(whenFigureDecoded(figure, 900), 900);
      // Anything awaited above is a window in which the visitor can tap a
      // different pair. If they did, this enter is stale: the product id, the
      // camera target and the panel it was about to build all belong to a
      // selection that no longer exists, so it must not touch any of them.
      if (t.signal.aborted || openId !== id) return;

      let camera: Promise<void> = Promise.resolve();
      let panelIn: Promise<void>;
      /** Build the panel. Called once the camera is already travelling. */
      const buildPanel = () => {
        parts = renderPanel(p, services, t.from, lead, scroll, actions, goBack);
        placeHead();
        applyLayout();
        panel.setAttribute('aria-labelledby', parts.heading.id);
        scroll.scrollTop = 0;
        arm();
      };
      if (t.initial) {
        // The intro is lifting off over the app: land directly on the end state, no movement.
        if (unit && target) {
          cameraAnim?.cancel();
          cameraAnim = null;
          placeUnit(unit, target.transform);
        }
        buildPanel();
        panelIn = showPanel(0, reduced, true);
      } else if (reduced) {
        if (target) camera = fadeUnitTo(id, target.transform);
        buildPanel();
        panelIn = showPanel(60, true, false);
      } else {
        if (unit && target) {
          const from = currentOf(unit);
          const frac = isIdentity(from) ? 1 : Math.max(0.45, remainingFraction(from, target.transform, IDENTITY));
          // Camera first...
          camera = moveUnit(id, target.transform, Math.round(DURATION.camera * frac), isIdentity(from) ? cameraEase : retargetEase);
          // ...then the panel, built into the move rather than ahead of it.
          buildPanel();
          panelIn = showPanel(Math.round(DURATION.camera * frac * 0.5), false, false);
        } else {
          buildPanel();
          panelIn = showPanel(0, false, false);
        }
      }

      void panelIn; // the panel's stagger may still be settling; the camera has landed
      await Promise.race([Promise.all([camera, focusDone]), untilAbort(t.signal)]);
      if (t.signal.aborted || openId !== id) return; // a newer navigation takes it from the current state
      if (!panel.contains(document.activeElement) || document.activeElement === document.body) {
        parts.heading.focus({ preventScroll: true });
      }
      services.bus.emit('detail:opened', { productId: id });
    },

    async leave(t: ViewTransition) {
      const id = openId;
      if (!id) return;
      openId = null;
      disarm();
      const reduced = t.reducedMotion || prefersReducedMotion();
      const unit = stage.camera;
      const hadFocus = panel.contains(document.activeElement);

      const panelOut = hidePanel(reduced);
      let camera: Promise<void>;
      if (reduced) {
        camera = fadeUnitTo(id, IDENTITY);
      } else if (unit) {
        const from = currentOf(unit);
        const full = target?.transform ?? from;
        const frac = Math.max(0.4, remainingFraction(from, IDENTITY, full));
        const moving = !!cameraAnim;
        camera = new Promise<void>((r) => setTimeout(r, moving ? 0 : 90)).then(() =>
          moveUnit(id, IDENTITY, Math.round(DURATION.camera * frac), moving ? retargetEase : cameraEase),
        );
      } else {
        camera = Promise.resolve();
      }
      // The room lights back up while the camera pulls out.
      const focusOff = stage.setFocus(null);

      await Promise.race([Promise.all([panelOut, camera, focusOff]), untilAbort(t.signal)]);
      if (t.signal.aborted) {
        // A newer navigation is queued: let the move continue; the next enter starts from wherever it is.
        stage.restore({ ...(snap ?? stage.snapshot()), focusedId: null });
        services.bus.emit('detail:closed', { productId: id });
        return;
      }
      if (unit && !cameraAnim) clearUnit(unit);
      if (snap) stage.restore({ ...snap, focusedId: null });
      snap = null;
      target = null;
      services.bus.emit('detail:closed', { productId: id });

      if (t.to.name === 'home' && (hadFocus || document.activeElement === document.body || !document.activeElement)) {
        const link = unit?.matches('a[href]') ? unit : (unit?.querySelector<HTMLElement>('a[href]') ?? unit?.closest<HTMLElement>('a[href]'));
        link?.focus({ preventScroll: true });
      }
    },

    unmount() {
      disarm();
      cameraAnim?.cancel();
      cameraAnim = null;
      if (stage.camera) clearUnit(stage.camera);
      wrap?.remove();
    },
  };
}
