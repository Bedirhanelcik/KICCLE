/**
 * Collections index model + copy. DOM-free and unit-tested
 * (tests/pages/collections.test.ts).
 */
import type { Collection, Product } from '../../types.js';

export const COLLECTIONS_COPY = {
  title: 'Collections',
  lede: 'The archive grouped by silhouette. Every piece is shown at the same scale as in the showroom; select one to see it up close.',
  jumpLabel: 'Go to a collection',
  study: 'Drawn study, awaiting photography',
} as const;

/** `sizes` for plate figures: matches the plate column widths in collections.css. */
/** `sizes` for plate figures. Deliberately small: this is an index, not a
 *  gallery, so three to a row at a readable thumbnail size rather than two
 *  giant plates that push the next collection off the screen. */
export const PLATE_SIZES = '(min-width: 1080px) 260px, (min-width: 560px) 30vw, 44vw';

export interface CollectionGroup {
  readonly collection: Collection;
  readonly products: readonly Product[];
}

/** Collections in data order, each with its products in `productIds` order. */
export function groupByCollection(products: readonly Product[], collections: readonly Collection[]): CollectionGroup[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return collections.map((collection) => ({
    collection,
    products: collection.productIds.map((id) => {
      const p = byId.get(id);
      if (!p) throw new Error(`Collections: unknown product id "${id}" in ${collection.id}`);
      return p;
    }),
  }));
}

export function pieceCount(n: number): string {
  return `${n} ${n === 1 ? 'piece' : 'pieces'}`;
}

/**
 * "On the wall: CRATER, Neon Trail Runner and RUSTON"
 *
 * Pairs are identified by name, never by a catalogue number: the archive
 * numbers the products internally for ordering, but nothing a visitor reads
 * refers to a sneaker as "04".
 */
export function showroomNames(products: readonly Product[]): string {
  const names = products.map((p) => p.name);
  const list = names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `On the wall: ${list}`;
}

export function summary(products: readonly Product[], collections: readonly Collection[]): string {
  return `${pieceCount(products.length)} in ${collections.length} ${collections.length === 1 ? 'collection' : 'collections'}`;
}

/** Every string a visitor can read on the page (for wording tests). */
export function collectionsStrings(products: readonly Product[], collections: readonly Collection[]): string[] {
  const groups = groupByCollection(products, collections);
  return [
    ...Object.values(COLLECTIONS_COPY),
    summary(products, collections),
    ...groups.flatMap((g) => [
      g.collection.name,
      g.collection.description,
      pieceCount(g.products.length),
      ...g.products.flatMap((p) => [p.name, p.colorway, p.tagline]),
    ]),
  ];
}
