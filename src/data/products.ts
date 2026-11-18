/**
 * The KICCLE archive: the ten sneakers in public/shoes/. Exhibition only, so
 * there are deliberately no price fields anywhere.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  TO REORDER THE SHOWROOM, EDIT `SHOWROOM_ORDER` BELOW. NOTHING ELSE.
 *  First five ids  -> upper row, left to right.
 *  Last five ids   -> lower row, left to right.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Everything downstream is derived from that one list: shelf positions, which
 * column a spotlight lights, hover labels, camera targets, collection order
 * and the cart. Nothing anywhere keys off an array position — products are
 * always addressed by their stable `id`.
 *
 * Data only; nothing here knows how a sneaker is drawn. The measured image
 * metrics live in images.generated.ts, which is WRITTEN BY `npm run shoes`
 * from the files in public/shoes/ — never edit that file by hand.
 */
import type { CollectionId, Product, ProductImage, ProductSize } from '../types.js';
import { IMAGES } from './images.generated.js';

/** Stable product ids. A sneaker is addressed by this everywhere, forever. */
export type ProductId = keyof typeof IMAGES;

const EU_RANGE = [38, 39, 40, 41, 42, 43, 44, 45, 46] as const;

/** EU 38–46; sizes listed in `soldOut` are shown as unavailable. */
function sizes(...soldOut: number[]): ProductSize[] {
  return EU_RANGE.map((eu) => ({ eu, available: !soldOut.includes(eu) }));
}

interface Draft {
  name: string;
  colorway: string;
  tagline: string;
  description: string;
  materials: string[];
  characteristics: { label: string; value: string }[];
  sizes: ProductSize[];
  collectionId: CollectionId;
  image: ProductImage;
  alt: string;
}

const CATALOG: Record<ProductId, Draft> = {
  adora: {
    name: 'ADORA',
    colorway: 'White / Midnight',
    tagline: 'A tall white shape cut with midnight blue.',
    description:
      'Adora carries its height quietly: a white shell panelled with midnight blue, the pieces stepped back so the silhouette reads as one mass rather than a stack of parts. Nothing on it is louder than the shape.',
    materials: ['White leather shell', 'Midnight blue panelling', 'Compression-moulded foam', 'Rubber outsole'],
    characteristics: [
      { label: 'Profile', value: 'High, padded collar' },
      { label: 'Cushioning', value: 'Moulded foam bed' },
      { label: 'Traction', value: 'Fine siping' },
      { label: 'Weight', value: '430 g (EU 42)' },
    ],
    sizes: sizes(38, 45),
    collectionId: 'court-high-top',
    image: IMAGES.adora,
    alt: 'ADORA high-top sneaker in white with midnight blue panels, right side profile',
  },
  aurel: {
    name: 'AUREL',
    colorway: 'White / Gold',
    tagline: 'White leather, gold line, ice underfoot.',
    description:
      'Aurel is the dress shoe of the archive: a white leather upper traced with a single gold line, a gold heel loop and a translucent icy outsole that picks up whatever light is in the room. Worn once a year, photographed constantly.',
    materials: ['Full-grain white leather', 'Gold-foil trim', 'Patent mudguard', 'Translucent rubber outsole'],
    characteristics: [
      { label: 'Profile', value: 'High, structured' },
      { label: 'Finish', value: 'Gold foil on leather' },
      { label: 'Outsole', value: 'Icy translucent rubber' },
      { label: 'Weight', value: '460 g (EU 42)' },
    ],
    sizes: sizes(39, 46),
    collectionId: 'court-high-top',
    image: IMAGES.aurel,
    alt: 'AUREL high-top sneaker in white leather with gold trim and an icy sole, right side profile',
  },
  cosmos: {
    name: 'COSMOS',
    colorway: 'Nebula / Black',
    tagline: 'A nebula printed across a black shoe.',
    description:
      'Cosmos puts deep space where a logo panel would normally go: violet and magenta clouds over black, running the length of the quarter and dying out into the toe. The icy outsole underneath reads like the shoe is standing on nothing.',
    materials: ['Printed nebula panel', 'Matte black mesh', 'Foam midsole', 'Translucent icy outsole'],
    characteristics: [
      { label: 'Profile', value: 'Low, close-fitting' },
      { label: 'Finish', value: 'Full-panel nebula print' },
      { label: 'Outsole', value: 'Icy translucent rubber' },
      { label: 'Weight', value: '350 g (EU 42)' },
    ],
    sizes: sizes(38, 44),
    collectionId: 'street-lifestyle',
    image: IMAGES.cosmos,
    alt: 'COSMOS sneaker in black with a violet nebula print and an icy sole, right side profile',
  },
  crater: {
    name: 'CRATER',
    colorway: 'Cement / Ember',
    tagline: 'Cement print, black panels, one ember line.',
    description:
      'Crater is the most worked piece in the archive: speckled cement panels set against flat black, split by a single ember-red line through the collar and the heel. The white midsole is left clean so the print has something to argue with.',
    materials: ['Speckled cement-print panels', 'Black nubuck overlays', 'Ember-red collar trim', 'Rubber outsole'],
    characteristics: [
      { label: 'Profile', value: 'Mid, structured heel' },
      { label: 'Finish', value: 'Speckled cement print' },
      { label: 'Traction', value: 'Flat tread' },
      { label: 'Weight', value: '410 g (EU 42)' },
    ],
    sizes: sizes(40, 46),
    collectionId: 'street-lifestyle',
    image: IMAGES.crater,
    alt: 'CRATER sneaker in speckled cement print and black with a red collar line, right side profile',
  },
  dorea: {
    name: 'DOREA',
    colorway: 'Pastel / Cream',
    tagline: 'Pink, butter and sky on a cream sole.',
    description:
      'Dorea is the loudest pair in the room and never raises its voice: pink suede, butter-yellow overlays and a pale blue toe, all set on a thick cream midsole with a pink lugged outsole underneath.',
    materials: ['Pink suede quarter', 'Butter-yellow leather overlays', 'Cream EVA midsole', 'Pink rubber outsole'],
    characteristics: [
      { label: 'Profile', value: 'Low, chunky skate' },
      { label: 'Midsole', value: 'Cream EVA, 34 mm' },
      { label: 'Traction', value: 'Deep lugs' },
      { label: 'Weight', value: '440 g (EU 42)' },
    ],
    sizes: sizes(38, 41),
    collectionId: 'street-lifestyle',
    image: IMAGES.dorea,
    alt: 'DOREA chunky low-top sneaker in pastel pink, yellow and blue on a cream sole, right side profile',
  },
  glacier: {
    name: 'GLACIER',
    colorway: 'Ice / Grey',
    tagline: 'Grey shell, cold blue running through it.',
    description:
      'Glacier is cut high and kept cold: grey panels with an ice-blue underlay that reads like meltwater through a crack. The collar is padded and the tongue sits proud, so it holds its shape standing still.',
    materials: ['Grey technical shell', 'Ice-blue underlay', 'Padded collar', 'Rubber outsole'],
    characteristics: [
      { label: 'Profile', value: 'High, padded' },
      { label: 'Lining', value: 'Brushed warm-weight' },
      { label: 'Traction', value: 'Siped rubber' },
      { label: 'Weight', value: '420 g (EU 42)' },
    ],
    sizes: sizes(39, 45),
    collectionId: 'court-high-top',
    image: IMAGES.glacier,
    alt: 'GLACIER high-top sneaker in grey with ice-blue panels, right side profile',
  },
  neontrail: {
    name: 'Neon Trail Runner',
    colorway: 'Black / Neon',
    tagline: 'Black trail shoe wired with neon.',
    description:
      'The trail runner of the set: a black ripstop upper with neon piping that traces every panel and the lace keepers, so the shoe still reads at dusk. Lugs are spaced wide so mud lets go of them.',
    materials: ['Black ripstop upper', 'Neon piping', 'Dual-density EVA midsole', 'Carbon rubber lugs'],
    characteristics: [
      { label: 'Profile', value: 'Low, locked heel' },
      { label: 'Visibility', value: 'Neon contrast piping' },
      { label: 'Traction', value: 'Multidirectional lugs' },
      { label: 'Weight', value: '360 g (EU 42)' },
    ],
    sizes: sizes(38, 46),
    collectionId: 'run-trail',
    image: IMAGES.neontrail,
    alt: 'Neon Trail Runner sneaker in black with neon piping and lugged sole, right side profile',
  },
  ruston: {
    name: 'RUSTON',
    colorway: 'Rust / Tan',
    tagline: 'Rust suede over tan, long and low.',
    description:
      'Ruston is the longest shape in the archive and leans on it: rust suede panels over a tan base, with a low stance and a gum outsole that darkens with wear instead of scuffing.',
    materials: ['Rust suede overlays', 'Tan nubuck base', 'Cork-blend footbed', 'Gum rubber outsole'],
    characteristics: [
      { label: 'Profile', value: 'Low, elongated' },
      { label: 'Footbed', value: 'Cork blend' },
      { label: 'Outsole', value: 'Gum rubber' },
      { label: 'Weight', value: '380 g (EU 42)' },
    ],
    sizes: sizes(38, 39),
    collectionId: 'street-lifestyle',
    image: IMAGES.ruston,
    alt: 'RUSTON low sneaker in rust suede over tan nubuck with a gum sole, right side profile',
  },
  volt: {
    name: 'VOLT',
    colorway: 'Volt / Lime',
    tagline: 'All volt, no apology.',
    description:
      'Volt commits: the whole upper is one charged green-yellow, graded slightly darker at the heel so the shape still reads under a single light. The only break is the lace, and even that is tonal.',
    materials: ['Volt engineered mesh', 'Tonal welded overlays', 'Full-length foam', 'Volt rubber outsole'],
    characteristics: [
      { label: 'Profile', value: 'Low, racing last' },
      { label: 'Cushioning', value: 'Full-length foam' },
      { label: 'Upper', value: 'Engineered mesh' },
      { label: 'Weight', value: '320 g (EU 42)' },
    ],
    sizes: sizes(40, 45),
    collectionId: 'run-trail',
    image: IMAGES.volt,
    alt: 'VOLT running sneaker in volt green with tonal overlays, right side profile',
  },
  zoomx: {
    name: 'ZOOMX',
    colorway: 'Green / Crimson',
    tagline: 'A racer that graduates from green to red.',
    description:
      'ZoomX is the fastest shape here and does not hide it: a knit upper running from acid green at the toe into crimson at the heel, over a tall plated midsole with an aggressive toe spring. Everything it has is underfoot.',
    materials: ['Graduated knit upper', 'High-rebound foam midsole', 'Full-length carbon plate', 'Rubber forefoot pods'],
    characteristics: [
      { label: 'Profile', value: 'Low, aggressive toe spring' },
      { label: 'Plate', value: 'Full-length carbon' },
      { label: 'Cushioning', value: 'High-rebound foam' },
      { label: 'Weight', value: '290 g (EU 42)' },
    ],
    sizes: sizes(38, 43),
    collectionId: 'run-trail',
    image: IMAGES.zoomx,
    alt: 'ZOOMX racing sneaker in graduated green and crimson knit on a plated midsole, right side profile',
  },
};

/**
 * THE ORDERING LIST. This is the one place the showroom layout is decided.
 *
 *   positions 1-5  -> upper row, left to right
 *   positions 6-10 -> lower row, left to right
 *
 * Move an id and the pair moves with it: its shelf, its spotlight column, its
 * hover label, its camera target and its place in Collections all follow.
 */
export const SHOWROOM_ORDER = [
  // upper row, left to right
  'adora',
  'crater',
  'ruston',
  'glacier',
  'dorea',
  // lower row, left to right
  'volt',
  'cosmos',
  'aurel',
  'neontrail',
  'zoomx',
] as const satisfies readonly ProductId[];

export const PRODUCTS: readonly Product[] = Object.freeze(
  SHOWROOM_ORDER.map((id, i): Product => {
    const d = CATALOG[id];
    return Object.freeze({
      ...d,
      id,
      // Position in SHOWROOM_ORDER. Used for ordering and for assistive
      // announcements; never shown to a visitor and never used as an identity.
      index: String(i + 1).padStart(2, '0'),
      isPlaceholder: d.image.kind === 'placeholder',
    });
  }),
);

const byId = new Map(PRODUCTS.map((p) => [p.id, p]));

export function getProduct(id: string): Product | undefined {
  return byId.get(id);
}

export function isProductId(id: string): boolean {
  return byId.has(id);
}
