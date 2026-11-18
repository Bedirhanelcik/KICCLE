/**
 * About page copy.
 *
 * Deliberately short. KICCLE is one student's project, not a company, so the
 * page says what it is, who made it, and how to reach him — and then stops.
 * No invented history, no customers, no release dates, no sales figures.
 */
import type { Product } from '../../types.js';

export const ABOUT_HERO = {
  title: 'An independent footwear concept.',
  /** Display lines; they join back to `title` exactly. */
  titleLines: ['An independent', 'footwear concept.'],
} as const;

/** The three paragraphs of the page, in order. */
export const ABOUT_BODY: readonly string[] = [
  'KICCLE is an independent student project created by Bedirhan Elçik, inspired by sneaker culture, footwear design and immersive digital experiences.',
  'The collection brings together original sneaker concepts developed specifically for this project, combining different silhouettes, materials and visual identities.',
  'KICCLE is currently a design showcase, not a commercial store. Products are not available for purchase. Future releases may be considered if the concept receives significant interest.',
];

export const ABOUT_AUTHOR = {
  label: 'Designed and built by',
  name: 'Bedirhan Elçik',
  role: 'Student project — design, code and art direction.',
} as const;

/** Real profiles only. Nothing here is invented. */
export const ABOUT_LINKS: readonly { label: string; href: string }[] = [
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/bedirhanelcik' },
  { label: 'GitHub', href: 'https://github.com/Bedirhanelcik' },
];

export const ABOUT_CONTACT_TITLE = 'Contact';

/** The pairs shown small beside the text. Ids must exist in the catalog. */
export const ABOUT_PIECES = { strip: ['aurel', 'dorea', 'zoomx'] } as const;

export const ABOUT_CLOSE = {
  title: 'The room is open.',
  showroom: 'Enter the showroom',
  collections: 'Browse the collections',
} as const;

/** A one-line caption for a pair in the strip. */
export function pieceCaption(p: Product): string {
  return `${p.name} · ${p.colorway}`;
}

/** Every string a visitor can read on the page (for wording tests). */
export function aboutStrings(): string[] {
  return [
    ABOUT_HERO.title,
    ...ABOUT_BODY,
    ABOUT_AUTHOR.label,
    ABOUT_AUTHOR.name,
    ABOUT_AUTHOR.role,
    ABOUT_CONTACT_TITLE,
    ...ABOUT_LINKS.map((l) => l.label),
    ABOUT_CLOSE.title,
    ABOUT_CLOSE.showroom,
    ABOUT_CLOSE.collections,
  ];
}
