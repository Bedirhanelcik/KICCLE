import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CartState } from '../../src/types.ts';
import { MAX_QTY, STORAGE_KEY, createCartStore, parseStored, summaryText, type StorageLike } from '../../src/cart/store.ts';

class FakeStorage implements StorageLike {
  data = new Map<string, string>();
  writes = 0;
  failGet = false;
  failSet = false;
  getItem(k: string) {
    if (this.failGet) throw new Error('SecurityError');
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failSet) throw new Error('QuotaExceededError');
    this.writes++;
    this.data.set(k, v);
  }
}

const valid = (id: string, size: number) => ['loam', 'signal', 'hush'].includes(id) && size >= 38 && size <= 46 && size !== 45;

test('subscribe fires immediately, then on every change; unsubscribe stops it', () => {
  const store = createCartStore({ isValidLine: valid });
  const seen: CartState[] = [];
  const off = store.subscribe((s) => seen.push(s));
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], { items: [], count: 0, isOpen: false });
  store.add('loam', 42);
  assert.equal(seen.length, 2);
  assert.equal(seen[1]!.count, 1);
  off();
  store.add('loam', 42);
  assert.equal(seen.length, 2);
});

test('add: same product + size increments qty, different size is a new line', () => {
  const store = createCartStore({ isValidLine: valid });
  store.add('loam', 42);
  store.add('loam', 42);
  store.add('loam', 43);
  store.add('signal', 42);
  assert.deepEqual(store.items(), [
    { productId: 'loam', size: 42, qty: 2 },
    { productId: 'loam', size: 43, qty: 1 },
    { productId: 'signal', size: 42, qty: 1 },
  ]);
  assert.equal(store.count(), 4);
});

test('add ignores unknown products and unavailable sizes', () => {
  const store = createCartStore({ isValidLine: valid });
  let calls = 0;
  store.subscribe(() => calls++);
  store.add('nope', 42);
  store.add('loam', 45);
  store.add('loam', Number.NaN);
  assert.equal(store.count(), 0);
  assert.equal(calls, 1, 'no change, no emit');
});

test('remove deletes the whole line; clear empties; no-ops do not emit', () => {
  const store = createCartStore({ isValidLine: valid });
  store.add('loam', 42);
  store.add('loam', 42);
  store.add('hush', 40);
  let calls = 0;
  store.subscribe(() => calls++);
  store.remove('loam', 42);
  assert.deepEqual(store.items(), [{ productId: 'hush', size: 40, qty: 1 }]);
  store.remove('loam', 42);
  assert.equal(calls, 2);
  store.clear();
  assert.equal(store.count(), 0);
  store.clear();
  assert.equal(calls, 3);
});

test('setQty clamps, 0 removes, MAX_QTY caps add', () => {
  const store = createCartStore({ isValidLine: valid });
  store.add('loam', 42);
  store.setQty('loam', 42, 5);
  assert.equal(store.count(), 5);
  store.setQty('loam', 42, 1000);
  assert.equal(store.count(), MAX_QTY);
  store.add('loam', 42);
  assert.equal(store.count(), MAX_QTY);
  store.setQty('loam', 42, 0);
  assert.equal(store.items().length, 0);
});

test('open/close change isOpen, notify subscribers and hand the return-focus target to the side effects', () => {
  const opened: unknown[] = [];
  const closed: unknown[] = [];
  const store = createCartStore({ onOpen: (r) => opened.push(r), onClose: (r) => closed.push(r) });
  const states: boolean[] = [];
  store.subscribe((s) => states.push(s.isOpen));
  const button = { id: 'nav-cart' };
  store.open(button as never);
  store.open(button as never); // idempotent
  assert.equal(store.isOpen(), true);
  store.close();
  store.close();
  assert.deepEqual(states, [false, true, false]);
  assert.deepEqual(opened, [button]);
  assert.deepEqual(closed, [button]);
});

test('state handed to listeners is immutable', () => {
  const store = createCartStore({ isValidLine: valid });
  store.add('loam', 42);
  const items = store.items();
  assert.throws(() => (items as unknown as unknown[]).push({}));
  assert.throws(() => {
    (items[0] as { qty: number }).qty = 7;
  });
});

test('persistence: writes kiccle.cart.v1 and restores it in a new store', () => {
  const storage = new FakeStorage();
  const a = createCartStore({ storage, isValidLine: valid });
  a.add('loam', 42);
  a.add('loam', 42);
  a.add('signal', 40);
  assert.ok(storage.data.has(STORAGE_KEY));
  const b = createCartStore({ storage, isValidLine: valid });
  assert.deepEqual(b.items(), a.items());
  assert.equal(b.count(), 3);
});

test('persistence: corrupt or hostile data is dropped, valid lines kept and merged', () => {
  assert.deepEqual(parseStored('{not json', valid), []);
  assert.deepEqual(parseStored('"str"', valid), []);
  assert.deepEqual(parseStored('null', valid), []);
  assert.deepEqual(parseStored('{"items": 4}', valid), []);
  const raw = JSON.stringify([
    { productId: 'loam', size: 42, qty: 2 },
    { productId: 'loam', size: 42, qty: 1 }, // duplicate: merged
    { productId: 'loam', size: 45, qty: 1 }, // unavailable size
    { productId: 'ghost', size: 42, qty: 1 }, // unknown product
    { productId: 'hush', size: '42', qty: 1 }, // wrong type
    { productId: 'hush', size: 41, qty: 0 }, // qty < 1
    { productId: 'hush', size: 41, qty: 2.9 }, // floored
    { productId: 'signal', size: 40, qty: 5000 }, // capped
    null,
    7,
    { __proto__: { productId: 'loam' } },
  ]);
  assert.deepEqual(parseStored(raw, valid), [
    { productId: 'loam', size: 42, qty: 3 },
    { productId: 'hush', size: 41, qty: 2 },
    { productId: 'signal', size: 40, qty: MAX_QTY },
  ]);
  assert.deepEqual(parseStored(JSON.stringify({ v: 1, items: [{ productId: 'loam', size: 40, qty: 1 }] }), valid), [
    { productId: 'loam', size: 40, qty: 1 },
  ]);
});

test('persistence: storage that throws never breaks the store', () => {
  const storage = new FakeStorage();
  storage.failGet = true;
  storage.failSet = true;
  const store = createCartStore({ storage, isValidLine: valid });
  assert.equal(store.count(), 0);
  store.add('loam', 42);
  assert.equal(store.count(), 1, 'still works in memory');
  store.reload();
  assert.equal(store.count(), 0, 'reload with unreadable storage falls back to empty');
});

test('reload picks up changes from another tab', () => {
  const storage = new FakeStorage();
  const a = createCartStore({ storage, isValidLine: valid });
  const b = createCartStore({ storage, isValidLine: valid });
  let calls = 0;
  b.subscribe(() => calls++);
  a.add('hush', 40);
  b.reload();
  assert.equal(b.count(), 1);
  b.reload();
  assert.equal(calls, 2, 'unchanged storage does not emit');
});

test('summary text', () => {
  assert.equal(summaryText([]), 'Nothing set aside yet');
  assert.equal(summaryText([{ productId: 'a', size: 42, qty: 1 }]), '1 pair');
  assert.equal(summaryText([{ productId: 'a', size: 42, qty: 1 }, { productId: 'b', size: 40, qty: 1 }]), '2 pairs');
  assert.equal(summaryText([{ productId: 'a', size: 42, qty: 2 }, { productId: 'a', size: 40, qty: 1 }]), '3 pairs, 1 style');
});
