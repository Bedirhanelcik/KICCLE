import { h, svg, trapFocus } from '../lib/dom.js';
import { wordmark } from './brand.js';
export const NAV_ITEMS = [
    {
        label: 'Home',
        path: '#/',
        routes: [
            'home',
            'product'
        ]
    },
    {
        label: 'About',
        path: '#/about',
        routes: [
            'about'
        ]
    },
    {
        label: 'FAQ',
        path: '#/faq',
        routes: [
            'faq'
        ]
    },
    {
        label: 'Collections',
        path: '#/collections',
        routes: [
            'collections'
        ]
    }
];
function bagIcon() {
    return svg('svg', {
        class: 'k-nav__cart-icon',
        viewBox: '0 0 24 24',
        width: 20,
        height: 20,
        'aria-hidden': 'true',
        focusable: 'false'
    }, svg('path', {
        d: 'M3.5 9.5h17v9.2a.8.8 0 0 1-.8.8H4.3a.8.8 0 0 1-.8-.8z',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.4,
        'stroke-linejoin': 'round'
    }), svg('path', {
        d: 'M2.5 6.2h19v3.3h-19z',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.4,
        'stroke-linejoin': 'round'
    }), svg('path', {
        d: 'M9.5 13h5',
        stroke: 'currentColor',
        'stroke-width': 1.4,
        'stroke-linecap': 'round'
    }));
}
export function createNav(host, cart) {
    const linkEls = [];
    const menuLinkEls = [];
    const brand = h('a', {
        class: 'k-nav__brand',
        href: '#/',
        'aria-label': 'KICCLE, home'
    }, wordmark('k-nav__mark'));
    const list = h('ul', {
        class: 'k-nav__list',
        role: 'list'
    });
    const menuList = h('ul', {
        class: 'k-menu__list',
        role: 'list'
    });
    NAV_ITEMS.forEach((item)=>{
        const a = h('a', {
            class: 'k-nav__link',
            href: item.path
        }, item.label);
        linkEls.push(a);
        list.append(h('li', {}, a));
        const m = h('a', {
            class: 'k-menu__link',
            href: item.path
        }, item.label);
        menuLinkEls.push(m);
        menuList.append(h('li', {}, m));
    });
    const count = h('span', {
        class: 'k-nav__badge',
        'aria-hidden': 'true',
        'data-count': '0'
    }, '0');
    const cartBtn = h('button', {
        class: 'k-nav__cart',
        type: 'button',
        'aria-label': 'Cart, empty',
        'aria-haspopup': 'dialog'
    }, bagIcon(), h('span', {
        class: 'k-nav__cart-label'
    }, 'Cart'), count);
    const menuBtn = h('button', {
        class: 'k-nav__menu-btn',
        type: 'button',
        'aria-expanded': 'false',
        'aria-controls': 'k-menu'
    }, h('span', {
        class: 'k-nav__menu-lines',
        'aria-hidden': 'true'
    }, h('span'), h('span')), h('span', {
        class: 'k-nav__menu-label'
    }, 'Menu'));
    const menu = h('div', {
        class: 'k-menu',
        id: 'k-menu',
        hidden: true
    }, h('nav', {
        'aria-label': 'Primary, compact'
    }, menuList));
    const primary = h('nav', {
        class: 'k-nav__primary',
        'aria-label': 'Primary'
    }, list);
    const bar = h('div', {
        class: 'k-nav__bar'
    }, brand, primary, h('div', {
        class: 'k-nav__actions'
    }, cartBtn, menuBtn));
    host.classList.add('k-nav');
    host.append(bar, menu);
    let lastCount = 0;
    cart.subscribe((state)=>{
        count.textContent = String(state.count);
        count.dataset.count = String(state.count);
        cartBtn.setAttribute('aria-label', state.count === 0 ? 'Cart, empty' : `Cart, ${state.count} item${state.count === 1 ? '' : 's'}`);
        cartBtn.setAttribute('aria-expanded', String(state.isOpen));
        if (state.count > lastCount) {
            count.classList.remove('is-bumped');
            void count.offsetWidth;
            count.classList.add('is-bumped');
        }
        lastCount = state.count;
    });
    cartBtn.addEventListener('click', ()=>{
        closeMenu(false);
        cart.open(cartBtn);
    });
    let release = null;
    function openMenu() {
        menu.hidden = false;
        host.classList.add('is-menu-open');
        menuBtn.setAttribute('aria-expanded', 'true');
        menuBtn.querySelector('.k-nav__menu-label').textContent = 'Close';
        release = trapFocus(host, {
            onEscape: ()=>closeMenu(true),
            initial: menuLinkEls[0] ?? null
        });
    }
    function closeMenu(restoreFocus = true) {
        if (menu.hidden) return;
        release?.();
        release = null;
        menu.hidden = true;
        host.classList.remove('is-menu-open');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.querySelector('.k-nav__menu-label').textContent = 'Menu';
        if (restoreFocus) menuBtn.focus();
    }
    menuBtn.addEventListener('click', ()=>menu.hidden ? openMenu() : closeMenu(true));
    menu.addEventListener('click', (e)=>{
        if (e.target.closest('a')) closeMenu(false);
    });
    matchMedia('(min-width: 760px)').addEventListener('change', (e)=>{
        if (e.matches) closeMenu(false);
    });
    return {
        el: host,
        setActive (route) {
            NAV_ITEMS.forEach((item, i)=>{
                const active = item.routes.includes(route.name);
                for (const a of [
                    linkEls[i],
                    menuLinkEls[i]
                ]){
                    if (active) a.setAttribute('aria-current', 'page');
                    else a.removeAttribute('aria-current');
                }
            });
            host.dataset.route = route.name;
        },
        closeMenu: ()=>closeMenu(false)
    };
}


//# sourceURL=src\components\nav.ts