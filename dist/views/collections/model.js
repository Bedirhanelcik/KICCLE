export const COLLECTIONS_COPY = {
    title: 'Collections',
    lede: 'The archive grouped by silhouette. Every piece is shown at the same scale as in the showroom; select one to see it up close.',
    jumpLabel: 'Go to a collection',
    study: 'Drawn study, awaiting photography'
};
export const PLATE_SIZES = '(min-width: 1080px) 260px, (min-width: 560px) 30vw, 44vw';
export function groupByCollection(products, collections) {
    const byId = new Map(products.map((p)=>[
            p.id,
            p
        ]));
    return collections.map((collection)=>({
            collection,
            products: collection.productIds.map((id)=>{
                const p = byId.get(id);
                if (!p) throw new Error(`Collections: unknown product id "${id}" in ${collection.id}`);
                return p;
            })
        }));
}
export function pieceCount(n) {
    return `${n} ${n === 1 ? 'piece' : 'pieces'}`;
}
export function showroomNames(products) {
    const names = products.map((p)=>p.name);
    const list = names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return `On the wall: ${list}`;
}
export function summary(products, collections) {
    return `${pieceCount(products.length)} in ${collections.length} ${collections.length === 1 ? 'collection' : 'collections'}`;
}
export function collectionsStrings(products, collections) {
    const groups = groupByCollection(products, collections);
    return [
        ...Object.values(COLLECTIONS_COPY),
        summary(products, collections),
        ...groups.flatMap((g)=>[
                g.collection.name,
                g.collection.description,
                pieceCount(g.products.length),
                ...g.products.flatMap((p)=>[
                        p.name,
                        p.colorway,
                        p.tagline
                    ])
            ])
    ];
}


//# sourceURL=src\views\collections\model.ts