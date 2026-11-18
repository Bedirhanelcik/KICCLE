import { h } from '../lib/dom.js';
import { lockup } from './brand.js';
import { NAV_ITEMS } from './nav.js';
export function createFooter(host) {
    host.classList.add('k-footer');
    const year = new Date().getFullYear();
    host.append(h('div', {
        class: 'k-footer__inner k-container'
    }, h('div', {
        class: 'k-footer__sig'
    }, lockup('k-lockup--footer')), h('p', {
        class: 'k-footer__note'
    }, 'An independent archive of footwear design, shown as an exhibition. Nothing here is for sale.'), h('nav', {
        class: 'k-footer__nav',
        'aria-label': 'Footer'
    }, h('ul', {
        role: 'list'
    }, ...NAV_ITEMS.map((i)=>h('li', {}, h('a', {
            href: i.path
        }, i.label))))), h('p', {
        class: 'k-footer__fine'
    }, `© ${year} KICCLE. Original designs and project content by Bedirhan Elçik. All rights reserved.`)));
    return host;
}


//# sourceURL=src\components\footer.ts