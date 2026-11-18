/**
 * The landing-page sign: six LED letters that never settle.
 *
 * This is NOT the intro (src/components/intro.ts). The intro fires once, on
 * the very first load, and ends with the whole word lit. This is the ambient
 * loop that runs afterwards, and only while the showroom is on screen.
 *
 * Two phases alternate forever:
 *
 *   1  scan      one letter lit at a time, jumping at random, each letter
 *                getting at least one turn; then the whole word goes white
 *                and rests.
 *   2  fill      letters light at random and STAY lit until all six burn;
 *                the word then flashes together a few times, returns to
 *                white, and rests longer.
 *
 * Only `--k-led` (0 | 1) and a `data-flash` flag are written per letter; the
 * colours, glow and timing curves all live in components.css, so the loop
 * stays legible and the look stays in one place.
 */
import { prefersReducedMotion } from '../lib/motion.js';

/** Warm LED hues the letters pick from. Orange and amber, with the odd warm white. */
const LED_TONES = ['var(--led-core)', 'var(--led-deep)', '#ffa33d', '#ffbe63', '#fff0db'] as const;

const TIMING = {
  /** Phase 1: how long one letter holds before the next takes over. */
  scanHold: 280,
  /** Phase 1: white rest before phase 2. */
  scanRest: 2800,
  /** Phase 2: gap between one letter igniting and the next. */
  fillStep: 380,
  /** Phase 2: beat of the all-together flash. */
  flashOn: 180,
  flashOff: 230,
  flashes: 4,
  /** Phase 2: white rest before the loop starts over. */
  fillRest: 3800,
} as const;

export interface LogoLoop {
  /** Run the loop (idempotent). */
  start(): void;
  /** Park every letter white and stop (idempotent). */
  stop(): void;
  /** Stop and drop listeners. */
  destroy(): void;
}

const randomInt = (n: number): number => Math.floor(Math.random() * n);

/** A fresh shuffle of 0..n-1 whose first item is never `avoid`. */
function shuffled(n: number, avoid = -1): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  if (order.length > 1 && order[0] === avoid) [order[0], order[1]] = [order[1]!, order[0]!];
  return order;
}

export function createLogoLoop(mark: HTMLElement | null): LogoLoop {
  const letters = mark ? [...mark.querySelectorAll<HTMLElement>('.k-wordmark__ch')] : [];
  let timer = 0;
  let running = false;
  let generation = 0;

  const light = (el: HTMLElement, on: boolean): void => {
    if (on) {
      el.style.setProperty('--k-led-tone', LED_TONES[randomInt(LED_TONES.length)]!);
      el.style.setProperty('--k-led', '1');
    } else {
      el.style.setProperty('--k-led', '0');
    }
  };

  const allWhite = (): void => {
    for (const el of letters) {
      el.style.setProperty('--k-led', '0');
      el.removeAttribute('data-flash');
    }
  };

  /** setTimeout that dies with the current generation. */
  const after = (ms: number, fn: () => void): void => {
    const g = generation;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (running && g === generation) fn();
    }, ms);
  };

  // -------------------------------------------------------------- phase 1
  function scan(order: number[], i: number, prev: number): void {
    if (i >= order.length) {
      allWhite();
      after(TIMING.scanRest, () => fill(shuffled(letters.length), 0));
      return;
    }
    if (prev >= 0) light(letters[prev]!, false);
    const idx = order[i]!;
    light(letters[idx]!, true);
    after(TIMING.scanHold, () => scan(order, i + 1, idx));
  }

  // -------------------------------------------------------------- phase 2
  function fill(order: number[], i: number): void {
    if (i >= order.length) {
      flash(0);
      return;
    }
    light(letters[order[i]!]!, true); // everything already lit stays lit
    after(TIMING.fillStep, () => fill(order, i + 1));
    return;
  }

  function flash(n: number): void {
    if (n >= TIMING.flashes) {
      allWhite();
      after(TIMING.fillRest, () => scan(shuffled(letters.length), 0, -1));
      return;
    }
    for (const el of letters) el.setAttribute('data-flash', 'off');
    after(TIMING.flashOff, () => {
      for (const el of letters) el.setAttribute('data-flash', 'on');
      after(TIMING.flashOn, () => flash(n + 1));
    });
  }

  return {
    start() {
      // Reduced motion: the sign is simply on, and never blinks.
      if (running || letters.length === 0 || prefersReducedMotion()) return;
      running = true;
      generation += 1;
      allWhite();
      after(600, () => scan(shuffled(letters.length), 0, -1));
    },
    stop() {
      running = false;
      generation += 1;
      clearTimeout(timer);
      timer = 0;
      allWhite();
    },
    destroy() {
      this.stop();
    },
  };
}
