/**
 * Cart store (pure, DOM-free, unit-tested). Implements the CartStore contract
 * (CONTRACTS.md §7) plus a couple of drawer helpers (setQty). Storage, line
 * validation and the open/close side effects are injected.
 */
import type { CartItem, CartListener, CartState, CartStore } from '../types.js';

export const STORAGE_KEY = 'kiccle.cart.v1';
/** Upper bound per line: a demo cart, not a warehouse. */
export const MAX_QTY = 99;

/** The subset of Web Storage the store uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface CartStoreOptions {
  /** Persistent storage; null/undefined = memory only. Every access is guarded. */
  storage?: StorageLike | null;
  /** Is this a real, selectable product + EU size? Invalid adds and stored lines are dropped. */
  isValidLine?: (productId: string, size: number) => boolean;
  /** Side effects (drawer). */
  onOpen?: (returnFocusTo: unknown) => void;
  onClose?: (returnFocusTo: unknown) => void;
}

export interface CartStoreInternal extends CartStore {
  /** Set a line's quantity (clamped 1..MAX_QTY); 0 removes it. */
  setQty(productId: string, size: number, qty: number): void;
  /** Re-read storage (e.g. after a `storage` event from another tab). */
  reload(): void;
  state(): CartState;
}

const sameLine = (a: { productId: string; size: number }, productId: string, size: number) =>
  a.productId === productId && a.size === size;

/** Validate + normalise anything read from storage. Never throws. */
export function parseStored(raw: string | null, isValidLine: (id: string, size: number) => boolean = () => true): CartItem[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  // Accept either a bare array (v1 stub format) or { v: 1, items: [] }.
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
      ? ((data as { items: unknown[] }).items)
      : null;
  if (!list) return [];
  const out: CartItem[] = [];
  for (const x of list) {
    if (!x || typeof x !== 'object') continue;
    const { productId, size, qty } = x as Record<string, unknown>;
    if (typeof productId !== 'string' || productId.length === 0 || productId.length > 64) continue;
    if (typeof size !== 'number' || !Number.isFinite(size)) continue;
    if (typeof qty !== 'number' || !Number.isFinite(qty)) continue;
    const q = Math.floor(qty);
    if (q < 1) continue;
    if (!isValidLine(productId, size)) continue;
    const existing = out.findIndex((l) => sameLine(l, productId, size));
    if (existing >= 0) {
      const prev = out[existing]!;
      out[existing] = { ...prev, qty: Math.min(MAX_QTY, prev.qty + q) };
    } else {
      out.push({ productId, size, qty: Math.min(MAX_QTY, q) });
    }
  }
  return out;
}

export function createCartStore(opts: CartStoreOptions = {}): CartStoreInternal {
  const isValidLine = opts.isValidLine ?? ((id: string, size: number) => id.length > 0 && Number.isFinite(size));
  const storage = opts.storage ?? null;

  const read = (): CartItem[] => {
    if (!storage) return [];
    try {
      return parseStored(storage.getItem(STORAGE_KEY), isValidLine);
    } catch {
      return [];
    }
  };
  const write = (list: readonly CartItem[]) => {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      /* private mode / quota / disabled: stay in memory */
    }
  };

  let items: readonly CartItem[] = Object.freeze(read().map((i) => Object.freeze(i)));
  let isOpen = false;
  let returnFocus: unknown = null;
  const listeners = new Set<CartListener>();

  const snapshot = (): CartState =>
    Object.freeze({ items, count: items.reduce((n, i) => n + i.qty, 0), isOpen });

  const emit = () => {
    const s = snapshot();
    for (const l of [...listeners]) {
      try {
        l(s);
      } catch (err) {
        // One faulty listener must not break the others.
        console.error('[cart] listener failed', err);
      }
    }
  };

  const commit = (next: CartItem[]) => {
    items = Object.freeze(next.map((i) => Object.freeze({ ...i })));
    write(items);
    emit();
  };

  const store: CartStoreInternal = {
    add(productId, size) {
      if (typeof productId !== 'string' || typeof size !== 'number' || !isValidLine(productId, size)) return;
      const i = items.findIndex((l) => sameLine(l, productId, size));
      if (i >= 0) {
        if (items[i]!.qty >= MAX_QTY) return;
        commit(items.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l)));
      } else {
        commit([...items, { productId, size, qty: 1 }]);
      }
    },
    remove(productId, size) {
      if (!items.some((l) => sameLine(l, productId, size))) return;
      commit(items.filter((l) => !sameLine(l, productId, size)));
    },
    setQty(productId, size, qty) {
      const i = items.findIndex((l) => sameLine(l, productId, size));
      if (i < 0 || !Number.isFinite(qty)) return;
      const q = Math.floor(qty);
      if (q <= 0) return store.remove(productId, size);
      const next = Math.min(MAX_QTY, q);
      if (next === items[i]!.qty) return;
      commit(items.map((l, j) => (j === i ? { ...l, qty: next } : l)));
    },
    clear() {
      if (items.length === 0) return;
      commit([]);
    },
    items: () => items,
    count: () => items.reduce((n, i) => n + i.qty, 0),
    isOpen: () => isOpen,
    state: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    open(returnFocusTo) {
      if (returnFocusTo !== undefined) returnFocus = returnFocusTo;
      if (isOpen) return;
      isOpen = true;
      opts.onOpen?.(returnFocus);
      emit();
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      const target = returnFocus;
      returnFocus = null;
      opts.onClose?.(target);
      emit();
    },
    reload() {
      const next = read();
      const same =
        next.length === items.length && next.every((l, i) => sameLine(items[i]!, l.productId, l.size) && items[i]!.qty === l.qty);
      if (same) return;
      items = Object.freeze(next.map((i) => Object.freeze(i)));
      emit();
    },
  };
  return store;
}

export const pairsLabel = (n: number) => `${n} ${n === 1 ? 'pair' : 'pairs'}`;

/** "3 pairs, 2 styles" style summary. */
export function summaryText(items: readonly CartItem[]): string {
  const pairs = items.reduce((n, i) => n + i.qty, 0);
  if (pairs === 0) return 'Nothing set aside yet';
  const styles = new Set(items.map((i) => i.productId)).size;
  return styles === pairs ? pairsLabel(pairs) : `${pairsLabel(pairs)}, ${styles} ${styles === 1 ? 'style' : 'styles'}`;
}

