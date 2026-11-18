import { h } from '../../lib/dom.js';
import { prefersReducedMotion } from '../../lib/motion.js';
import { SHOE_FRAME } from '../../data/index.js';
import { createShoeFigure } from '../../components/shoe-figure.js';
import { createRevealer } from '../about/reveal.js';
import { COLLECTIONS_COPY, PLATE_SIZES, groupByCollection, pieceCount, summary } from './model.js';
const pct = (v)=>`${(v * 100).toFixed(3)}%`;
export function createCollectionsPage(services) {
    let page = null;
    let revealer = null;
    const sections = new Map();
    const links = new Map();
    let saved = null;
    function plate(p) {
        const link = h('a', {
            class: 'cl-plate__link',
            href: services.productPath(p.id)
        }, h('span', {
            class: 'cl-plate__index'
        }, p.colorway), h('span', {
            class: 'cl-plate__name'
        }, p.name));
        links.set(p.id, link);
        return h('li', {
            class: 'cl-plate',
            'data-product-id': p.id
        }, h('div', {
            class: 'cl-plate__stage',
            style: `--cl-base:${pct(SHOE_FRAME.baseline)}`,
            'aria-hidden': 'true'
        }, h('div', {
            class: 'cl-plate__shoe'
        }, h('span', {
            class: 'cl-plate__pool'
        }), h('span', {
            class: 'cl-plate__ledge'
        }, h('span', {
            class: 'cl-plate__led'
        })), createShoeFigure(p, {
            loading: 'lazy',
            sizes: PLATE_SIZES,
            decorative: true
        }))), h('div', {
            class: 'cl-plate__cap'
        }, h('h3', {
            class: 'cl-plate__title'
        }, link), h('p', {
            class: 'cl-plate__colorway'
        }, p.colorway), h('p', {
            class: 'cl-plate__tagline'
        }, p.tagline), p.isPlaceholder ? h('p', {
            class: 'cl-plate__study'
        }, COLLECTIONS_COPY.study) : null));
    }
    function jumpTo(id) {
        const el = sections.get(id);
        if (!el) return;
        el.scrollIntoView({
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'start'
        });
        el.querySelector('.cl-coll__name')?.focus({
            preventScroll: true
        });
    }
    function build() {
        const groups = groupByCollection(services.products, services.collections);
        const jump = h('nav', {
            class: 'cl-jump',
            'aria-label': COLLECTIONS_COPY.jumpLabel
        }, h('ul', {
            class: 'cl-jump__list',
            role: 'list'
        }, ...groups.map(({ collection: c, products })=>{
            const b = h('button', {
                type: 'button',
                class: 'cl-jump__btn'
            }, h('span', {
                class: 'cl-jump__name'
            }, c.name), h('span', {
                class: 'cl-jump__count'
            }, h('span', {
                class: 'k-visually-hidden'
            }, ', '), pieceCount(products.length)));
            b.addEventListener('click', ()=>jumpTo(c.id));
            return h('li', {}, b);
        })));
        const sectionEls = groups.map(({ collection: c, products })=>{
            const s = h('section', {
                class: 'cl-coll',
                'aria-labelledby': `cl-${c.id}`,
                'data-collection-id': c.id
            }, h('div', {
                class: 'cl-coll__rail'
            }, h('h2', {
                class: 'cl-coll__name',
                id: `cl-${c.id}`,
                tabindex: '-1'
            }, c.name), h('p', {
                class: 'cl-coll__desc'
            }, c.description), h('p', {
                class: 'cl-coll__meta'
            }, h('span', {
                class: 'cl-coll__count'
            }, pieceCount(products.length)))), h('ol', {
                class: 'cl-plates',
                role: 'list'
            }, ...products.map(plate)));
            sections.set(c.id, s);
            return s;
        });
        return h('div', {
            class: 'cl k-container'
        }, h('header', {
            class: 'cl-head'
        }, h('h1', {
            class: 'cl-head__title'
        }, COLLECTIONS_COPY.title), h('div', {
            class: 'cl-head__aside'
        }, h('p', {
            class: 'cl-head__lede'
        }, COLLECTIONS_COPY.lede), h('p', {
            class: 'cl-head__summary'
        }, summary(services.products, services.collections))), jump), ...sectionEls);
    }
    return {
        mount (root) {
            page = build();
            root.append(page);
            revealer = createRevealer([
                ...page.querySelectorAll('.cl-plate')
            ], {
                rootMargin: '0px 0px -8% 0px',
                threshold: 0.2
            });
            page.classList.add('cl--reveals');
        },
        enter (t) {
            if (!page) return;
            const from = t.from;
            if (saved && from?.name === 'product' && from.productId === saved.productId) {
                const link = links.get(saved.productId);
                window.scrollTo(0, saved.scrollY);
                link?.focus({
                    preventScroll: true
                });
                link?.closest('.cl-plate')?.classList.add('is-in');
            }
            saved = null;
            revealer?.connect();
        },
        leave (t) {
            revealer?.disconnect();
            if (t.to.name === 'product') saved = {
                productId: t.to.productId,
                scrollY: window.scrollY
            };
        },
        unmount () {
            revealer?.disconnect();
            page?.remove();
            page = null;
        }
    };
}


//# sourceURL=src\views\collections\index.ts