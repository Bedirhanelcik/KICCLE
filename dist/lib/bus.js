export function createBus() {
    const handlers = new Map();
    const on = (type, handler)=>{
        let set = handlers.get(type);
        if (!set) handlers.set(type, set = new Set());
        set.add(handler);
        return ()=>{
            set.delete(handler);
        };
    };
    return {
        on,
        once (type, handler) {
            const off = on(type, (p)=>{
                off();
                handler(p);
            });
            return off;
        },
        emit (type, payload) {
            for (const h of [
                ...handlers.get(type) ?? []
            ]){
                try {
                    h(payload);
                } catch (err) {
                    console.error(`[bus] handler for ${String(type)} failed`, err);
                }
            }
        }
    };
}


//# sourceURL=src\lib\bus.ts