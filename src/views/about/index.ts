/**
 * Package D: the About page.
 *
 * One screen of type and three small sneakers. It is a personal page for a
 * student project, so it is short by design: what KICCLE is, who made it, and
 * where to find him. Prefix ab- / --ab-.
 */
import type { AppServices, Product, View, ViewTransition } from '../../types.js';
import { createShoeFigure } from '../../components/shoe-figure.js';
import { h } from '../../lib/dom.js';
import {
  ABOUT_AUTHOR,
  ABOUT_BODY,
  ABOUT_CLOSE,
  ABOUT_CONTACT_TITLE,
  ABOUT_HERO,
  ABOUT_LINKS,
  ABOUT_PIECES,
  pieceCaption,
} from './copy.js';
import { createRevealer, type Revealer } from './reveal.js';

/** One small pair on its lit ledge. */
function piece(p: Product): HTMLElement {
  const fig = createShoeFigure(p, {
    // Small on the page, so a modest slot: the full-resolution file is already
    // in the browser cache from the showroom, and this only scales it down.
    sizes: '(max-width: 760px) 40vw, 220px',
    loading: 'lazy',
    decorative: true,
  });
  return h(
    'figure',
    { class: 'ab-piece', 'data-ab-reveal': '' },
    h(
      'div',
      { class: 'ab-piece__frame' },
      h('span', { class: 'ab-piece__pool', 'aria-hidden': 'true' }),
      h('div', { class: 'ab-piece__shoe' }, fig),
      h('span', { class: 'ab-piece__ledge', 'aria-hidden': 'true' }, h('span', { class: 'ab-piece__led' })),
    ),
    h('figcaption', { class: 'ab-piece__cap' }, pieceCaption(p)),
  );
}

export function createAboutPage(services: AppServices): View {
  let root!: HTMLElement;
  let revealer: Revealer | null = null;

  return {
    mount(el) {
      root = el;
      root.classList.add('ab');

      const pieces = ABOUT_PIECES.strip
        .map((id) => services.getProduct(id))
        .filter((p): p is Product => !!p)
        .map(piece);

      const hero = h(
        'header',
        { class: 'ab-hero', 'aria-labelledby': 'ab-title' },
        h(
          'h1',
          { class: 'ab-hero__title', id: 'ab-title' },
          h('span', { class: 'k-visually-hidden' }, ABOUT_HERO.title),
          ...ABOUT_HERO.titleLines.map((line, i) =>
            h('span', { class: 'ab-hero__line', 'aria-hidden': 'true', style: `--ab-i:${i}` }, h('span', {}, line)),
          ),
        ),
        h('div', { class: 'ab-hero__body' }, ...ABOUT_BODY.map((t) => h('p', { class: 'ab-body' }, t))),
      );

      const strip = h('div', { class: 'ab-strip', 'aria-label': 'Three pairs from the collection' }, ...pieces);

      const author = h(
        'section',
        { class: 'ab-author', 'aria-labelledby': 'ab-author-title', 'data-ab-reveal': '' },
        h('h2', { class: 'ab-kicker', id: 'ab-author-title' }, ABOUT_AUTHOR.label),
        h('p', { class: 'ab-author__name' }, ABOUT_AUTHOR.name),
        h('p', { class: 'ab-author__role' }, ABOUT_AUTHOR.role),
      );

      const contact = h(
        'section',
        { class: 'ab-contact', 'aria-labelledby': 'ab-contact-title', 'data-ab-reveal': '' },
        h('h2', { class: 'ab-kicker', id: 'ab-contact-title' }, ABOUT_CONTACT_TITLE),
        h(
          'ul',
          { class: 'ab-links', role: 'list' },
          ...ABOUT_LINKS.map((l) =>
            h(
              'li',
              {},
              h(
                'a',
                { class: 'ab-link', href: l.href, target: '_blank', rel: 'noopener noreferrer' },
                l.label,
                h('span', { class: 'ab-link__arrow', 'aria-hidden': 'true' }, '↗'),
              ),
            ),
          ),
        ),
      );

      const close = h(
        'section',
        { class: 'ab-close', 'data-ab-reveal': '' },
        h('p', { class: 'ab-close__title' }, ABOUT_CLOSE.title),
        h(
          'div',
          { class: 'ab-close__links' },
          h('a', { class: 'ab-cta', href: '#/' }, ABOUT_CLOSE.showroom),
          h('a', { class: 'ab-cta ab-cta--quiet', href: '#/collections' }, ABOUT_CLOSE.collections),
        ),
      );

      root.replaceChildren(h('div', { class: 'ab-wrap' }, hero, strip, author, contact, close));
    },

    enter(t: ViewTransition) {
      revealer ??= createRevealer([...root.querySelectorAll('[data-ab-reveal]')], { rootMargin: '0px 0px -12% 0px' });
      // Reduced motion: everything is simply there, with no scroll-triggered
      // entrance at all. The page must never depend on scrolling to be read.
      if (t.reducedMotion) revealer.revealAll();
      else revealer.connect();
    },

    leave() {
      revealer?.disconnect();
    },
  };
}
