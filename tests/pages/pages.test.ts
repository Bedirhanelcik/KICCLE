import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS } from '../../src/data/products.ts';
import { COLLECTIONS } from '../../src/data/collections.ts';
import { SHOE_FRAME } from '../../src/data/frame.ts';
import { ABOUT_BODY, ABOUT_HERO, ABOUT_LINKS, ABOUT_PIECES, aboutStrings } from '../../src/views/about/copy.ts';
import { FAQ_INTRO, faqGroups, faqStrings, listJoin, numberedItems } from '../../src/views/faq/data.ts';
import {
  PLATE_SIZES,
  collectionsStrings,
  groupByCollection,
  pieceCount,
  showroomNames,
  summary,
} from '../../src/views/collections/model.ts';
import { read, walk } from '../foundation/helpers.ts';

const groups = faqGroups();
const ALL_COPY: [string, string[]][] = [
  ['about', aboutStrings()],
  ['faq', faqStrings(groups)],
  ['collections', collectionsStrings(PRODUCTS, COLLECTIONS)],
];

// ------------------------------------------------------------------ wording

test('page copy has no commerce wording, no currency and no lorem ipsum', () => {
  const banned = /\b(commerce|e-commerce|checkout|check out|buy|buying|shop|shopping|discount|deal|sale price|in stock|order now|add to bag|basket)\b|lorem|ipsum/i;
  for (const [page, strings] of ALL_COPY) {
    for (const s of strings) {
      assert.doesNotMatch(s, banned, `${page}: "${s}"`);
      assert.doesNotMatch(s, /[$€£¥]|\b(usd|eur|gbp)\b/i, `${page}: currency in "${s}"`);
      assert.doesNotMatch(s, /\d+[.,]\d{2}\b/, `${page}: price-like number in "${s}"`);
    }
  }
});

test('price and payment are only ever mentioned to say there are none', () => {
  for (const [page, strings] of ALL_COPY) {
    for (const s of strings) {
      for (const sentence of s.split(/(?<=[.!?:])\s+/)) {
        if (!/pric|payment|pay\b|charged/i.test(sentence)) continue;
        assert.match(sentence, /\b(no|not|never|nothing|without|carry no)\b/i, `${page}: "${sentence}"`);
      }
    }
  }
});

test('no empty strings and no real-brand names in the copy', () => {
  const brands = /\b(nike|adidas|puma|reebok|new balance|asics|vans|converse|salomon|hoka|jordan)\b/i;
  for (const [page, strings] of ALL_COPY) {
    for (const s of strings) {
      assert.ok(s.trim().length > 0, `${page}: empty string`);
      assert.doesNotMatch(s, brands, `${page}: "${s}"`);
    }
  }
});

test('page sources never use in-page #anchors (hash routing owns the fragment)', () => {
  const files = ['about', 'faq', 'collections'].flatMap((d) => walk(`src/views/${d}`, (p) => p.endsWith('.ts')));
  assert.ok(files.length >= 6);
  for (const f of files) {
    const text = read(f);
    for (const m of text.matchAll(/href:\s*['"`]([^'"`]*)/g)) {
      const href = m[1]!;
      // An absolute https:// link out of the site is fine (About and the FAQ
      // carry the author's real profiles). What the contract forbids is an
      // in-page `#anchor`, which the hash router would swallow as a route.
      if (/^https:\/\//.test(href)) continue;
      assert.match(href, /^#\/(|about|faq|collections)$/, `${f}: href ${href}`);
    }
  }
});

test('page CSS uses only its own prefixes for classes and private custom properties', () => {
  for (const [dir, prefix] of [['about', 'ab'], ['faq', 'fq'], ['collections', 'cl']] as const) {
    for (const f of walk(`src/views/${dir}`, (p) => p.endsWith('.css'))) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      // Only DECLARATIONS define custom properties. A BEM modifier followed by
      // a pseudo-class (`.ab-cta--quiet:hover`) looks identical to `--quiet:`
      // to a naive scan, so selectors are stripped before looking.
      const declarations = css.replace(/[^{}]*\{/g, '{');
      for (const m of declarations.matchAll(/--([a-z][a-z0-9-]*)\s*:/g)) {
        assert.ok(m[1]!.startsWith(`${prefix}-`), `${f}: defines --${m[1]}`);
      }
      for (const m of css.matchAll(/(?<![\w-])\.([a-z][a-z0-9_-]*)/g)) {
        const cls = m[1]!;
        if (/^\d/.test(cls)) continue;
        const ok = cls.startsWith(`${prefix}-`) || cls === prefix || cls.startsWith(`${prefix}--`) || cls.startsWith('is-') || cls === 'k-shoe';
        assert.ok(ok, `${f}: selector .${cls}`);
      }
    }
  }
});

// -------------------------------------------------------------------- about

test('about: one hero title whose display lines join to the title', () => {
  assert.equal(ABOUT_HERO.titleLines.join(' '), ABOUT_HERO.title);
  assert.equal(ABOUT_HERO.title, 'An independent footwear concept.');
});

test('about: the body is the three supplied paragraphs and names the author', () => {
  assert.equal(ABOUT_BODY.length, 3);
  assert.match(ABOUT_BODY[0]!, /Bedirhan Elçik/);
  assert.match(ABOUT_BODY[2]!, /not a commercial store/);
  assert.match(ABOUT_BODY[2]!, /not available for purchase/);
});

test('about: it is a short page — no invented history, customers or sales', () => {
  const text = aboutStrings().join('\n');
  // A concept showcase by one student: these words would all be fictions.
  for (const word of ['customers', 'founded', 'since 20', 'worldwide', 'flagship', 'revenue', 'orders shipped']) {
    assert.doesNotMatch(text, new RegExp(word, 'i'), `about mentions "${word}"`);
  }
  assert.ok(aboutStrings().length < 20, 'about page copy has grown back into an essay');
});

test('about: contact links are the two real profiles and nothing invented', () => {
  assert.deepEqual(
    ABOUT_LINKS.map((l) => l.href),
    ['https://www.linkedin.com/in/bedirhanelcik', 'https://github.com/Bedirhanelcik'],
  );
  const text = aboutStrings().join('\n');
  assert.doesNotMatch(text, /@|mailto:/, 'about invents an email address');
});

test('about: the small pieces are real products', () => {
  for (const id of ABOUT_PIECES.strip) {
    assert.ok(
      PRODUCTS.some((p) => p.id === id),
      `${id} is not a product`,
    );
  }
});

// ---------------------------------------------------------------------- faq

test('faq: exactly the four questions a concept showcase has to answer', () => {
  const items = numberedItems(groups).map((x) => x.item);
  assert.equal(items.length, 4);
  const ids = items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate question id');
  for (const i of items) {
    assert.match(i.id, /^[a-z][a-z0-9-]*$/);
    assert.match(i.question, /\?$/, `"${i.question}" should be a question`);
    assert.ok(i.answer.length >= 1);
  }
  assert.ok(FAQ_INTRO.title.length > 0);
});

test('faq: numbering is 01..n in reading order', () => {
  const n = numberedItems(groups);
  n.forEach((x, i) => assert.equal(x.num, String(i + 1).padStart(2, '0')));
});

test('faq: answers are honest about what KICCLE is and invents no services', () => {
  const text = faqStrings(groups).join('\n');
  assert.match(text, /not an operating store/);
  assert.match(text, /demonstration of the website interaction/);
  assert.match(text, /original design concepts/);
  // None of this exists, so none of it may be described.
  for (const word of ['shipping', 'refund', 'return policy', 'delivery', 'warranty', 'customer service', 'checkout']) {
    assert.doesNotMatch(text, new RegExp(word, 'i'), `faq invents "${word}"`);
  }
});

test('faq: the contact answer carries the two real profiles', () => {
  const contact = numberedItems(groups).map((x) => x.item).find((i) => i.id === 'contact');
  assert.ok(contact, 'no contact question');
  assert.deepEqual(
    contact!.links?.map((l) => l.href),
    ['https://www.linkedin.com/in/bedirhanelcik', 'https://github.com/Bedirhanelcik'],
  );
});

test('faq helpers', () => {
  assert.equal(listJoin(['a']), 'a');
  assert.equal(listJoin(['a', 'b', 'c']), 'a, b and c');
});

// -------------------------------------------------------------- collections

test('collections: grouping covers all 10 products exactly once, in data order', () => {
  const g = groupByCollection(PRODUCTS, COLLECTIONS);
  assert.equal(g.length, COLLECTIONS.length);
  const ids = g.flatMap((x) => x.products.map((p) => p.id));
  assert.equal(ids.length, PRODUCTS.length);
  assert.deepEqual([...ids].sort(), PRODUCTS.map((p) => p.id).sort());
  g.forEach((x, i) => {
    assert.equal(x.collection.id, COLLECTIONS[i]!.id);
    assert.deepEqual(x.products.map((p) => p.id), [...x.collection.productIds]);
    for (const p of x.products) assert.equal(p.collectionId, x.collection.id);
  });
});

test('collections: unknown ids are reported, not silently dropped', () => {
  const bad = [{ ...COLLECTIONS[0]!, productIds: ['nope'] }];
  assert.throws(() => groupByCollection(PRODUCTS, bad), /unknown product id "nope"/);
});

test('collections: labels', () => {
  assert.equal(pieceCount(1), '1 piece');
  assert.equal(pieceCount(4), '4 pieces');
  assert.equal(summary(PRODUCTS, COLLECTIONS), '10 pieces in 3 collections');
  const court = groupByCollection(PRODUCTS, COLLECTIONS)[0]!;
  // Pairs are named, never numbered, anywhere a visitor can read.
  assert.equal(showroomNames(court.products), 'On the wall: ADORA, GLACIER and AUREL');
  assert.equal(showroomNames(court.products.slice(0, 1)), 'On the wall: ADORA');
  // An index, not a gallery: the plates must stay thumbnail-sized.
  assert.match(PLATE_SIZES, /44vw$/);
});

test('collections: the three groups are the silhouette families, in order', () => {
  assert.deepEqual(
    COLLECTIONS.map((c) => c.id),
    ['court-high-top', 'street-lifestyle', 'run-trail'],
  );
  const byCollection = Object.fromEntries(COLLECTIONS.map((c) => [c.id, c.productIds]));
  // Collection order is not declared: it is derived from PRODUCTS, so it
  // follows SHOWROOM_ORDER wherever that is changed.
  assert.deepEqual(byCollection['court-high-top'], ['adora', 'glacier', 'aurel']);
  assert.deepEqual(byCollection['street-lifestyle'], ['crater', 'ruston', 'dorea', 'cosmos']);
  assert.deepEqual(byCollection['run-trail'], ['volt', 'neontrail', 'zoomx']);
});
