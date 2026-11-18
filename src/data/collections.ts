/**
 * The three KICCLE collections. Every product belongs to exactly one, and a
 * product's `collectionId` (in src/data/products.ts) is what puts it here —
 * the membership lists below are derived, never hand-maintained.
 *
 * Grouping is by silhouette: what kind of shoe it is.
 */
import type { Collection } from '../types.js';
import { PRODUCTS } from './products.js';

const defs: Omit<Collection, 'productIds'>[] = [
  {
    id: 'court-high-top',
    name: 'Court / High-top',
    description: 'Cut above the ankle. Court shapes with structure, padding and a collar that holds its line standing still.',
  },
  {
    id: 'street-lifestyle',
    name: 'Street / Lifestyle',
    description: 'Low, wide and built for pavement. Chunky midsoles, suede panels and colour used as material.',
  },
  {
    id: 'run-trail',
    name: 'Run / Trail',
    description: 'Shapes that keep only what speed and ground need: light uppers, plated or lugged soles, nothing spare.',
  },
];

export const COLLECTIONS: readonly Collection[] = Object.freeze(
  defs.map((c) =>
    Object.freeze({
      ...c,
      // Showroom order decides the order inside a collection too, so the two
      // pages never disagree about which pair comes first.
      productIds: PRODUCTS.filter((p) => p.collectionId === c.id).map((p) => p.id),
    }),
  ),
);

const byId = new Map(COLLECTIONS.map((c) => [c.id as string, c]));

export function getCollection(id: string): Collection | undefined {
  return byId.get(id);
}
