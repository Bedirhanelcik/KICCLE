/** Small DOM helpers shared by every package. No framework. */

type Attrs = Record<string, string | number | boolean | null | undefined>;
type Child = Node | string | null | undefined | false;

/**
 * Create an element. Attribute values: `true` -> empty attribute, `false` /
 * null / undefined -> omitted. `class` and `style` are plain strings.
 *
 *   h('a', { href: '#/about', class: 'k-nav__link' }, 'About')
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Create an SVG element (namespace-correct). */
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** querySelector that throws with a useful message when the element is missing. */
export function must<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing required element: ${selector}`);
  return el;
}

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Visible, focusable descendants in DOM order. */
export function focusables(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute('inert') && !el.closest('[inert],[hidden]') && el.getClientRects().length > 0,
  );
}

/**
 * Keep Tab focus inside `container` until the returned release() is called.
 * Escape calls `onEscape`. Focus moves to `initial` (or the first focusable).
 */
export function trapFocus(
  container: HTMLElement,
  opts: { onEscape?: () => void; initial?: HTMLElement | null } = {},
): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && opts.onEscape) {
      e.preventDefault();
      opts.onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables(container);
    if (items.length === 0) {
      e.preventDefault();
      container.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !container.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !container.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKey, true);
  const target = opts.initial ?? focusables(container)[0] ?? container;
  if (target === container && !container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  return () => document.removeEventListener('keydown', onKey, true);
}

/** Wait for a CSS transition on `el` (any property, or `prop`) with a safety timeout. */
export function transitionEnd(el: Element, timeoutMs: number, prop?: string): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(id);
      el.removeEventListener('transitionend', onEnd as EventListener);
      el.removeEventListener('transitioncancel', onEnd as EventListener);
      resolve();
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el) return;
      if (prop && e.propertyName !== prop) return;
      done();
    };
    const id = setTimeout(done, timeoutMs);
    el.addEventListener('transitionend', onEnd as EventListener);
    el.addEventListener('transitioncancel', onEnd as EventListener);
  });
}
