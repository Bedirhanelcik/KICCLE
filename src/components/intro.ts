/**
 * Cinematic intro controller. The markup is static in index.html (#k-intro)
 * so it paints on the very first frame, before any JS, with the same room
 * background as the stage: there is never a flash between intro and showroom.
 *
 * Timeline (normal motion, ~2.4 s after the module starts, ~2.7 s after
 * navigation start when assets are warm):
 *   0.15–1.05 s  wordmark wipes in (CSS, from first paint)
 *   0.30–1.40 s  stitch line draws, signature and tread fade in (CSS)
 *   0.00–1.50 s  LED strip fills with REAL progress (images decoded + time)
 *   1.50–1.80 s  LED ignites (flare)                      -> `handoff` resolves
 *   1.80–2.35 s  content lifts away, room is revealed      -> `done` resolves
 * If assets are slow the LED holds below full until they decode, capped at
 * MAX_WAIT_MS. Under prefers-reduced-motion: static mark, ~0.35 s hold, fade.
 */
import { prefersReducedMotion, settleWithin, wait } from '../lib/motion.js';
import { whenFigureDecoded } from './shoe-figure.js';

export interface IntroOptions {
  /** Resolves when the critical content is ready (stage.ready + fonts). */
  ready: Promise<unknown>;
  /** Figures whose decode drives the progress counter. */
  figures?: readonly Element[];
  /** Override timings (tests / tuning). */
  minMs?: number;
  maxWaitMs?: number;
}

export interface IntroRun {
  /** Resolves when the intro starts revealing the app: start the first route now. */
  readonly handoff: Promise<void>;
  /** Resolves after the intro element is removed. */
  readonly done: Promise<void>;
  readonly skipped: boolean;
}

export const INTRO_TIMING = {
  /**
   * Long enough for the whole sign: 260 ms lead + six letters at the 360 ms
   * step in intro.css + the last 300 ms strike = 2.42 s. The intro may not
   * start leaving before every letter has had its turn.
   */
  build: 2500,
  ignite: 420,
  leave: 600,
  reducedHold: 1850,
  reducedLeave: 320,
  maxWait: 6000,
} as const;

export function runIntro(el: HTMLElement | null, opts: IntroOptions): IntroRun {
  if (!el) {
    return { handoff: Promise.resolve(), done: Promise.resolve(), skipped: true };
  }
  const reduced = prefersReducedMotion();
  const minMs = opts.minMs ?? (reduced ? INTRO_TIMING.reducedHold : INTRO_TIMING.build);
  const maxWait = opts.maxWaitMs ?? INTRO_TIMING.maxWait;
  const figures = opts.figures ?? [];
  const total = Math.max(1, figures.length);
  const countEl = el.querySelector<HTMLElement>('[data-intro-count]');
  const totalEl = el.querySelector<HTMLElement>('[data-intro-total]');
  if (totalEl) totalEl.textContent = String(figures.length || 10).padStart(2, '0');
  el.dataset.state = reduced ? 'reduced' : 'playing';
  // Shuffle which letter fires when, so the sign never lights the same way
  // twice. --k-ch is the letter's place in the order, not its position in the
  // word; every letter still gets exactly one turn, and none is skipped.
  if (!reduced) {
    const chars = [...el.querySelectorAll<HTMLElement>('.k-intro__ch')];
    const order = chars.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    chars.forEach((c, i) => c.style.setProperty('--k-ch', String(order[i])));
  }

  let decoded = 0;
  for (const f of figures) {
    void whenFigureDecoded(f, maxWait).then(() => {
      decoded += 1;
    });
  }
  let isReady = false;
  const ready = settleWithin(opts.ready, maxWait).then(() => {
    isReady = true;
  });

  const start = performance.now();
  let shown = 0;
  let resolveHandoff!: () => void;
  const handoff = new Promise<void>((r) => (resolveHandoff = r));

  const done = (async () => {
    // Progress loop
    await new Promise<void>((finish) => {
      const tick = (now: number) => {
        const elapsed = now - start;
        const timeFrac = Math.min(1, elapsed / minMs);
        const assetFrac = isReady ? 1 : Math.min(0.92, 0.12 + 0.8 * (decoded / total));
        const target = Math.min(timeFrac, assetFrac);
        shown = reduced ? target : shown + (target - shown) * 0.14;
        if (target >= 1 && shown > 0.985) shown = 1;
        el.style.setProperty('--k-intro-p', shown.toFixed(4));
        if (countEl) countEl.textContent = String(isReady ? total : Math.min(decoded, total)).padStart(2, '0');
        const timedOut = elapsed > maxWait;
        if ((shown >= 1 && isReady) || timedOut) {
          el.style.setProperty('--k-intro-p', '1');
          if (countEl) countEl.textContent = String(total).padStart(2, '0');
          finish();
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
    await ready.catch(() => undefined);

    if (!reduced) {
      el.dataset.state = 'ignite';
      await wait(INTRO_TIMING.ignite);
    }
    el.dataset.state = 'leaving';
    document.documentElement.classList.add('k-intro-leaving');
    resolveHandoff();
    await wait(reduced ? INTRO_TIMING.reducedLeave : INTRO_TIMING.leave);
    el.remove();
    document.documentElement.classList.remove('k-intro-active', 'k-intro-leaving');
  })();

  return { handoff, done, skipped: false };
}
