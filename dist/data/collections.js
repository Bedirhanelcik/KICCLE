import { PRODUCTS } from './products.js';
const defs = [
    {
        id: 'court-high-top',
        name: 'Court / High-top',
        description: 'Cut above the ankle. Court shapes with structure, padding and a collar that holds its line standing still.'
    },
    {
        id: 'street-lifestyle',
        name: 'Street / Lifestyle',
        description: 'Low, wide and built for pavement. Chunky midsoles, suede panels and colour used as material.'
    },
    {
        id: 'run-trail',
        name: 'Run / Trail',
        description: 'Shapes that keep only what speed and ground need: light uppers, plated or lugged soles, nothing spare.'
    }
];
export const COLLECTIONS = Object.freeze(defs.map((c)=>Object.freeze({
        ...c,
        productIds: PRODUCTS.filter((p)=>p.collectionId === c.id).map((p)=>p.id)
    })));
const byId = new Map(COLLECTIONS.map((c)=>[
        c.id,
        c
    ]));
export function getCollection(id) {
    return byId.get(id);
}


//# sourceURL=src\data\collections.ts