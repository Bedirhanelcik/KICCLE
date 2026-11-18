/**
 * Scroll reveals for Package D pages (About, Collections).
 * Elements get `is-in` once, when they first enter the viewport; they never
 * hide again. The observer is connected in `enter` and disconnected in `leave`.
 * The CSS decides what "revealed" looks like (no movement under reduced motion).
 */
export interface Revealer {
  /** Start observing every element not yet revealed. */
  connect(): void;
  /** Stop observing (call from leave). */
  disconnect(): void;
  /** Reveal everything immediately (e.g. when IntersectionObserver is missing). */
  revealAll(): void;
}

export function createRevealer(
  targets: readonly Element[],
  opts: { rootMargin?: string; threshold?: number; onReveal?: (el: Element) => void } = {},
): Revealer {
  let io: IntersectionObserver | null = null;
  const pending = () => targets.filter((el) => !el.classList.contains('is-in'));
  const reveal = (el: Element) => {
    if (el.classList.contains('is-in')) return;
    el.classList.add('is-in');
    opts.onReveal?.(el);
  };

  return {
    connect() {
      const left = pending();
      if (left.length === 0) return;
      if (typeof IntersectionObserver !== 'function') {
        left.forEach(reveal);
        return;
      }
      io?.disconnect();
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            reveal(e.target);
            io?.unobserve(e.target);
          }
          if (pending().length === 0) {
            io?.disconnect();
            io = null;
          }
        },
        { rootMargin: opts.rootMargin ?? '0px 0px -12% 0px', threshold: opts.threshold ?? 0.15 },
      );
      left.forEach((el) => io!.observe(el));
    },
    disconnect() {
      io?.disconnect();
      io = null;
    },
    revealAll() {
      targets.forEach(reveal);
    },
  };
}
