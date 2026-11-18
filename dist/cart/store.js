export const STORAGE_KEY = 'kiccle.cart.v1';
export const MAX_QTY = 99;
const sameLine = (a, productId, size)=>a.productId === productId && a.size === size;
export function parseStored(raw, isValidLine = ()=>true) {
    if (!raw) return [];
    let data;
    try {
        data = JSON.parse(raw);
    } catch  {
        return [];
    }
    const list = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray(data.items) ? data.items : null;
    if (!list) return [];
    const out = [];
    for (const x of list){
        if (!x || typeof x !== 'object') continue;
        const { productId, size, qty } = x;
        if (typeof productId !== 'string' || productId.length === 0 || productId.length > 64) continue;
        if (typeof size !== 'number' || !Number.isFinite(size)) continue;
        if (typeof qty !== 'number' || !Number.isFinite(qty)) continue;
        const q = Math.floor(qty);
        if (q < 1) continue;
        if (!isValidLine(productId, size)) continue;
        const existing = out.findIndex((l)=>sameLine(l, productId, size));
        if (existing >= 0) {
            const prev = out[existing];
            out[existing] = {
                ...prev,
                qty: Math.min(MAX_QTY, prev.qty + q)
            };
        } else {
            out.push({
                productId,
                size,
                qty: Math.min(MAX_QTY, q)
            });
        }
    }
    return out;
}
export function createCartStore(opts = {}) {
    const isValidLine = opts.isValidLine ?? ((id, size)=>id.length > 0 && Number.isFinite(size));
    const storage = opts.storage ?? null;
    const read = ()=>{
        if (!storage) return [];
        try {
            return parseStored(storage.getItem(STORAGE_KEY), isValidLine);
        } catch  {
            return [];
        }
    };
    const write = (list)=>{
        if (!storage) return;
        try {
            storage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch  {}
    };
    let items = Object.freeze(read().map((i)=>Object.freeze(i)));
    let isOpen = false;
    let returnFocus = null;
    const listeners = new Set();
    const snapshot = ()=>Object.freeze({
            items,
            count: items.reduce((n, i)=>n + i.qty, 0),
            isOpen
        });
    const emit = ()=>{
        const s = snapshot();
        for (const l of [
            ...listeners
        ]){
            try {
                l(s);
            } catch (err) {
                console.error('[cart] listener failed', err);
            }
        }
    };
    const commit = (next)=>{
        items = Object.freeze(next.map((i)=>Object.freeze({
                ...i
            })));
        write(items);
        emit();
    };
    const store = {
        add (productId, size) {
            if (typeof productId !== 'string' || typeof size !== 'number' || !isValidLine(productId, size)) return;
            const i = items.findIndex((l)=>sameLine(l, productId, size));
            if (i >= 0) {
                if (items[i].qty >= MAX_QTY) return;
                commit(items.map((l, j)=>j === i ? {
                        ...l,
                        qty: l.qty + 1
                    } : l));
            } else {
                commit([
                    ...items,
                    {
                        productId,
                        size,
                        qty: 1
                    }
                ]);
            }
        },
        remove (productId, size) {
            if (!items.some((l)=>sameLine(l, productId, size))) return;
            commit(items.filter((l)=>!sameLine(l, productId, size)));
        },
        setQty (productId, size, qty) {
            const i = items.findIndex((l)=>sameLine(l, productId, size));
            if (i < 0 || !Number.isFinite(qty)) return;
            const q = Math.floor(qty);
            if (q <= 0) return store.remove(productId, size);
            const next = Math.min(MAX_QTY, q);
            if (next === items[i].qty) return;
            commit(items.map((l, j)=>j === i ? {
                    ...l,
                    qty: next
                } : l));
        },
        clear () {
            if (items.length === 0) return;
            commit([]);
        },
        items: ()=>items,
        count: ()=>items.reduce((n, i)=>n + i.qty, 0),
        isOpen: ()=>isOpen,
        state: snapshot,
        subscribe (listener) {
            listeners.add(listener);
            listener(snapshot());
            return ()=>{
                listeners.delete(listener);
            };
        },
        open (returnFocusTo) {
            if (returnFocusTo !== undefined) returnFocus = returnFocusTo;
            if (isOpen) return;
            isOpen = true;
            opts.onOpen?.(returnFocus);
            emit();
        },
        close () {
            if (!isOpen) return;
            isOpen = false;
            const target = returnFocus;
            returnFocus = null;
            opts.onClose?.(target);
            emit();
        },
        reload () {
            const next = read();
            const same = next.length === items.length && next.every((l, i)=>sameLine(items[i], l.productId, l.size) && items[i].qty === l.qty);
            if (same) return;
            items = Object.freeze(next.map((i)=>Object.freeze(i)));
            emit();
        }
    };
    return store;
}
export const pairsLabel = (n)=>`${n} ${n === 1 ? 'pair' : 'pairs'}`;
export function summaryText(items) {
    const pairs = items.reduce((n, i)=>n + i.qty, 0);
    if (pairs === 0) return 'Nothing set aside yet';
    const styles = new Set(items.map((i)=>i.productId)).size;
    return styles === pairs ? pairsLabel(pairs) : `${pairsLabel(pairs)}, ${styles} ${styles === 1 ? 'style' : 'styles'}`;
}


//# sourceURL=src\cart\store.ts