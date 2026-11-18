/**
 * Cart (Package C): the CartStore (see ./store.ts) and the drawer in #k-cart.
 *
 * The drawer is a modal dialog sliding in from the right over a blurred,
 * dimmed scrim. Focus is trapped while it is open; Escape, the close button
 * and the scrim close it; focus returns to whatever opened it. Lines show a
 * small shoe on a lit acrylic ledge, name, colourway, EU size, a quantity
 * stepper and Remove. No prices, no totals, no checkout: the one action is a
 * clearly labelled demo request.
 */
import type { AppServices, CartItem, CartModule, CartState } from '../types.js';
import { getProduct } from '../data/index.js';
import { h, svg, trapFocus, transitionEnd } from '../lib/dom.js';
import { DURATION, prefersReducedMotion } from '../lib/motion.js';
import { createShoeFigure } from '../components/shoe-figure.js';
import { MAX_QTY, STORAGE_KEY, createCartStore, pairsLabel, summaryText, type StorageLike } from './store.js';

/** localStorage, or null when the browser refuses access (sandboxed iframes, disabled storage). */
function safeStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

function isValidLine(productId: string, size: number): boolean {
  const p = getProduct(productId);
  return !!p && p.sizes.some((s) => s.eu === size && s.available);
}

const lineKey = (i: { productId: string; size: number }) => `${i.productId}|${i.size}`;

function icon(kind: 'close' | 'minus' | 'plus'): SVGSVGElement {
  const paths: Record<typeof kind, string> = {
    close: 'M6 6l12 12M18 6L6 18',
    minus: 'M6 12h12',
    plus: 'M6 12h12M12 6v12',
  };
  return svg(
    'svg',
    { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': 'true', focusable: 'false', class: 'ct-icon' },
    svg('path', { d: paths[kind], fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' }),
  );
}

export function createCart(): CartModule {
  // Side effects are bound when the drawer mounts; before that, open/close only change state.
  let drawerOpen: (returnFocusTo: HTMLElement | null) => void = () => {};
  let drawerClose: (returnFocusTo: HTMLElement | null) => void = () => {};

  const internal = createCartStore({
    storage: safeStorage(),
    isValidLine,
    onOpen: (r) => drawerOpen(r instanceof HTMLElement ? r : null),
    onClose: (r) => drawerClose(r instanceof HTMLElement ? r : null),
  });

  // The public store: open() without an argument returns focus to the element that had it.
  const store = {
    ...internal,
    open(returnFocusTo?: HTMLElement | null) {
      const fallback = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      internal.open(returnFocusTo ?? fallback);
    },
  };

  return {
    store,
    mount(root: HTMLElement, services: AppServices) {
      // ---------- static DOM
      const title = h('h2', { class: 'ct-title', id: 'ct-title', tabindex: '-1' }, 'Cart');
      const countEl = h('p', { class: 'ct-count' });
      const closeBtn = h('button', { type: 'button', class: 'ct-close', 'aria-label': 'Close cart' }, icon('close'));
      const lines = h('ul', { class: 'ct-lines', role: 'list', 'aria-label': 'Pairs in your cart' });

      const browse = h('button', { type: 'button', class: 'k-button ct-browse' }, 'Browse the showroom');
      const empty = h(
        'div',
        { class: 'ct-empty' },
        h('div', { class: 'ct-empty__plinth', 'aria-hidden': 'true' }, h('span', { class: 'ct-empty__led' })),
        h('p', { class: 'ct-empty__title' }, 'Your cart is empty'),
        h('p', { class: 'ct-empty__text' }, 'Open any pair in the showroom, choose an EU size and add it. It will wait here, even after you close the tab.'),
        browse,
      );

      const status = h('p', { class: 'ct-status', role: 'status' });
      const request = h('button', { type: 'button', class: 'k-button ct-request' }, 'Request these pairs');
      const clearBtn = h('button', { type: 'button', class: 'ct-clear' }, 'Clear cart');
      const foot = h(
        'footer',
        { class: 'ct-foot' },
        request,
        h('p', { class: 'ct-note' }, 'Demo only. Requests are not sent anywhere and nothing is charged.'),
        status,
        clearBtn,
      );

      const panel = h(
        'section',
        { class: 'ct-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ct-title', tabindex: '-1' },
        h('header', { class: 'ct-head' }, h('div', { class: 'ct-head__text' }, title, countEl), closeBtn),
        h('div', { class: 'ct-body' }, lines, empty),
        foot,
      );
      const scrim = h('div', { class: 'ct-scrim', 'aria-hidden': 'true' });
      const wrap = h('div', { class: 'ct', 'data-state': 'closed', hidden: true }, scrim, panel);
      root.append(wrap);

      // ---------- open / close
      let release: (() => void) | null = null;
      let closeToken = 0;

      drawerOpen = () => {
        closeToken++;
        status.textContent = '';
        wrap.hidden = false;
        void wrap.offsetWidth; // start the transition from the closed state
        wrap.dataset.state = 'open';
        release?.();
        release = trapFocus(panel, { onEscape: () => store.close(), initial: closeBtn });
      };
      drawerClose = (returnTo) => {
        release?.();
        release = null;
        wrap.dataset.state = 'closing';
        const token = ++closeToken;
        const ms = prefersReducedMotion() ? 220 : DURATION.base + 120;
        void transitionEnd(panel, ms, 'transform').then(() => {
          if (token !== closeToken) return; // reopened meanwhile
          wrap.dataset.state = 'closed';
          wrap.hidden = true;
        });
        const target = returnTo && returnTo.isConnected ? returnTo : null;
        target?.focus({ preventScroll: true });
      };

      closeBtn.addEventListener('click', () => store.close());
      scrim.addEventListener('click', () => store.close());
      // The page behind must not scroll under the dialog (pages scroll the document).
      const stopScroll = (e: Event) => e.preventDefault();
      scrim.addEventListener('wheel', stopScroll, { passive: false });
      scrim.addEventListener('touchmove', stopScroll, { passive: false });

      browse.addEventListener('click', () => {
        store.close();
        if (services.current().name !== 'home') services.navigate('#/');
      });
      clearBtn.addEventListener('click', () => {
        internal.clear();
        services.announce('Cart cleared');
        title.focus({ preventScroll: true });
      });
      request.addEventListener('click', () => {
        const s = internal.state();
        if (s.count === 0) return;
        status.textContent = `Request noted for ${pairsLabel(s.count)}. This is a demo, so nothing was sent.`;
      });

      // ---------- lines (keyed: controls keep focus while quantities change)
      const rows = new Map<string, { li: HTMLLIElement; qty: HTMLElement; minus: HTMLButtonElement; plus: HTMLButtonElement }>();

      function buildRow(item: CartItem) {
        const p = getProduct(item.productId)!;
        const label = `${p.name}, EU ${item.size}`;
        const fig = createShoeFigure(p, { sizes: '112px', loading: 'lazy', decorative: true });
        const minus = h('button', { type: 'button', class: 'ct-step', 'aria-label': `One fewer: ${label}` }, icon('minus'));
        const plus = h('button', { type: 'button', class: 'ct-step', 'aria-label': `One more: ${label}` }, icon('plus'));
        const qty = h('span', { class: 'ct-qty__value', 'aria-live': 'polite' });
        const remove = h('button', { type: 'button', class: 'ct-remove' }, 'Remove', h('span', { class: 'ct-sr' }, ` ${label}`));
        const name = h('a', { class: 'ct-line__name', href: services.productPath(p.id) }, p.name);
        name.addEventListener('click', () => store.close());
        const li = h(
          'li',
          { class: 'ct-line', 'data-key': lineKey(item) },
          h('div', { class: 'ct-thumb', 'aria-hidden': 'true' }, fig, h('span', { class: 'ct-thumb__ledge' })),
          h(
            'div',
            { class: 'ct-line__info' },
            name,
            h('p', { class: 'ct-line__meta' }, p.colorway),
            h('p', { class: 'ct-line__size' }, `EU ${item.size}`),
          ),
          h(
            'div',
            { class: 'ct-line__actions' },
            h('div', { class: 'ct-qty', role: 'group', 'aria-label': `Quantity, ${label}` }, minus, qty, plus),
            remove,
          ),
        );
        minus.addEventListener('click', () => {
          const cur = internal.items().find((i) => lineKey(i) === lineKey(item));
          if (cur && cur.qty > 1) internal.setQty(item.productId, item.size, cur.qty - 1);
        });
        plus.addEventListener('click', () => internal.add(item.productId, item.size));
        remove.addEventListener('click', () => {
          const keys = [...rows.keys()];
          const idx = keys.indexOf(lineKey(item));
          internal.remove(item.productId, item.size);
          services.announce(`${label} removed from cart`);
          // Focus the next line's Remove, else the previous one, else the heading.
          const nextKey = keys[idx + 1] ?? keys[idx - 1];
          const next = nextKey ? rows.get(nextKey)?.li.querySelector<HTMLElement>('.ct-remove') : null;
          (next ?? title).focus({ preventScroll: true });
        });
        return { li, qty, minus, plus };
      }

      function render(s: CartState) {
        const seen = new Set<string>();
        let prev: HTMLElement | null = null;
        for (const item of s.items) {
          if (!getProduct(item.productId)) continue;
          const key = lineKey(item);
          seen.add(key);
          let row = rows.get(key);
          if (!row) {
            row = buildRow(item);
            rows.set(key, row);
          }
          row.qty.textContent = String(item.qty);
          row.minus.disabled = item.qty <= 1;
          row.plus.disabled = item.qty >= MAX_QTY;
          // keep DOM order = store order
          const want: ChildNode | null = prev ? prev.nextSibling : lines.firstChild;
          if (want !== row.li) lines.insertBefore(row.li, want);
          prev = row.li;
        }
        for (const [key, row] of rows) {
          if (!seen.has(key)) {
            row.li.remove();
            rows.delete(key);
          }
        }
        const isEmpty = s.count === 0;
        empty.hidden = !isEmpty;
        lines.hidden = isEmpty;
        foot.hidden = isEmpty;
        countEl.textContent = summaryText(s.items);
        if (isEmpty) status.textContent = '';
      }
      store.subscribe(render);

      // Another tab changed the cart.
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY || e.key === null) internal.reload();
      });
    },
  };
}
