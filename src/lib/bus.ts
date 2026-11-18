import type { EventBus } from '../types.js';

/** Tiny typed synchronous event bus. Handler errors are isolated and logged. */
export function createBus<E>(): EventBus<E> {
  const handlers = new Map<keyof E, Set<(p: never) => void>>();
  const on = <K extends keyof E>(type: K, handler: (payload: E[K]) => void) => {
    let set = handlers.get(type);
    if (!set) handlers.set(type, (set = new Set()));
    set.add(handler as (p: never) => void);
    return () => {
      set.delete(handler as (p: never) => void);
    };
  };
  return {
    on,
    once(type, handler) {
      const off = on(type, (p) => {
        off();
        handler(p);
      });
      return off;
    },
    emit(type, payload) {
      for (const h of [...(handlers.get(type) ?? [])]) {
        try {
          (h as (p: typeof payload) => void)(payload);
        } catch (err) {
          console.error(`[bus] handler for ${String(type)} failed`, err);
        }
      }
    },
  };
}
