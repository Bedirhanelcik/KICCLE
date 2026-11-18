/**
 * Motion helpers. Values mirror src/styles/tokens.css (keep in sync; the
 * foundation test `tokens.test.ts` asserts they match).
 */

/** Milliseconds. CSS: --dur-<name>. */
export const DURATION = {
  instant: 90,
  fast: 180,
  base: 320,
  slow: 560,
  /** Page cross-fade (each half). */
  page: 420,
  /** Camera move into / out of the product detail. */
  camera: 1320,
  /** Spotlight sweep step between two plinths. */
  sweep: 1400,
  /** Intro total (min) duration. */
  intro: 2600,
  /** Intro duration under prefers-reduced-motion. */
  introReduced: 350,
} as const;

/** CSS easing strings. CSS: --ease-<name>. */
export const EASE = {
  /** UI default. */
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  /** Things arriving (decelerate). */
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** Things leaving (accelerate). */
  in: 'cubic-bezier(0.55, 0, 0.75, 0.2)',
  /** Symmetric. */
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  /** Cinematic camera dolly: slow lift-off, long weighted settle. */
  camera: 'cubic-bezier(0.62, 0, 0.14, 1)',
  /** Light coming up (LED ignition, spotlight bloom). */
  light: 'cubic-bezier(0.3, 0, 0.1, 1)',
} as const;

export type DurationName = keyof typeof DURATION;
export type EaseName = keyof typeof EASE;

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/** Live check (safe outside the browser: returns false). */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(REDUCED_QUERY).matches;
}

/** Subscribe to reduced-motion changes. Returns unsubscribe. */
export function onReducedMotionChange(cb: (reduced: boolean) => void): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia(REDUCED_QUERY);
  const h = (e: MediaQueryListEvent) => cb(e.matches);
  mq.addEventListener('change', h);
  return () => mq.removeEventListener('change', h);
}

/**
 * Duration to actually use: under reduced motion movement collapses to a short
 * fade (`reducedMs`, default 0).
 */
export function dur(ms: number, reducedMs = 0, reduced = prefersReducedMotion()): number {
  return reduced ? Math.min(ms, reducedMs) : ms;
}

/** Promise that resolves after `ms` or immediately when `signal` aborts. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const id = setTimeout(done, ms);
    function done() {
      clearTimeout(id);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

/** Resolve on the next animation frame (after style/layout of this frame). */
export function nextFrame(): Promise<number> {
  return new Promise((r) => requestAnimationFrame(r));
}

/** Two frames: guarantees the browser painted the current state once. */
export async function afterPaint(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

/** Resolve `p`, or resolve undefined after `ms` (never rejects). */
export function settleWithin<T>(p: Promise<T> | T, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const id = setTimeout(() => resolve(undefined), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      () => {
        clearTimeout(id);
        resolve(undefined);
      },
    );
  });
}

export interface AnimateOptions extends KeyframeAnimationOptions {
  signal?: AbortSignal;
  /** Under reduced motion: 'skip' jumps to the end state (default), 'fade' keeps opacity keyframes only with a short duration. */
  reduced?: 'skip' | 'fade';
}

/**
 * WAAPI wrapper. Always resolves (finish, cancel, abort or missing WAAPI).
 * `fill: 'forwards'` is NOT applied by default: commit end styles yourself or
 * pass `fill`. On abort the animation jumps to its end.
 */
export function animate(el: Element, keyframes: Keyframe[], opts: AnimateOptions = {}): Promise<void> {
  const { signal, reduced = 'skip', ...rest } = opts;
  const isReduced = prefersReducedMotion();
  let frames = keyframes;
  let options: KeyframeAnimationOptions = { duration: DURATION.base, easing: EASE.standard, ...rest };
  if (isReduced) {
    if (reduced === 'fade') {
      frames = keyframes.map((k) => ('opacity' in k ? { opacity: k.opacity, offset: k.offset } : { offset: k.offset }));
      options = { ...options, duration: Math.min(Number(options.duration) || 0, 200), delay: 0 };
    } else {
      options = { ...options, duration: 0, delay: 0 };
    }
  }
  if (typeof (el as HTMLElement).animate !== 'function') return Promise.resolve();
  const anim = (el as HTMLElement).animate(frames, options);
  if (signal) {
    if (signal.aborted) anim.finish();
    else signal.addEventListener('abort', () => anim.finish(), { once: true });
  }
  return anim.finished.then(
    () => undefined,
    () => undefined,
  );
}
