import { h, svg } from '../../lib/dom.js';
let uid = 0;
function arrowIcon() {
    return svg('svg', {
        viewBox: '0 0 24 24',
        width: 18,
        height: 18,
        'aria-hidden': 'true',
        focusable: 'false',
        class: 'dt-icon'
    }, svg('path', {
        d: 'M19 12H5M11 6l-6 6 6 6',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.5,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
    }));
}
export function backLabel(from) {
    return from?.name === 'collections' ? 'Back to collections' : 'Back to showroom';
}
export function renderPanel(p, services, from, lead, scroll, actions, onBack) {
    const n = ++uid;
    const ids = {
        name: `dt-name-${n}`,
        hint: `dt-hint-${n}`,
        sizes: `dt-sizes-${n}`
    };
    const collection = services.getCollection(p.collectionId);
    const back = h('button', {
        type: 'button',
        class: 'dt-back'
    }, arrowIcon(), h('span', {}, backLabel(from)));
    back.addEventListener('click', onBack);
    const bar = h('div', {
        class: 'dt-bar'
    }, back, h('p', {
        class: 'dt-crumb'
    }, h('span', {
        class: 'dt-crumb__brand'
    }, 'KICCLE'), h('span', {
        class: 'dt-crumb__sep',
        'aria-hidden': 'true'
    }, '/'), h('span', {
        class: 'dt-crumb__no'
    }, collection?.name ?? 'Archive')));
    const heading = h('h1', {
        class: 'dt-name',
        id: ids.name,
        tabindex: '-1'
    }, p.name);
    const statement = h('p', {
        class: 'dt-statement'
    }, p.tagline);
    const head = h('header', {
        class: 'dt-head'
    }, heading, statement);
    const lede = h('div', {
        class: 'dt-lede'
    }, h('p', {
        class: 'dt-colorway'
    }, p.colorway), h('p', {
        class: 'dt-desc'
    }, p.description));
    const meta = h('p', {
        class: 'dt-meta'
    }, collection?.name ?? '', h('span', {
        class: 'dt-meta__sep',
        'aria-hidden': 'true'
    }, '/'), 'Footwear');
    const materials = h('section', {
        class: 'dt-section',
        'aria-labelledby': `dt-mat-${n}`
    }, h('h2', {
        class: 'dt-section__title',
        id: `dt-mat-${n}`
    }, 'Materials'), h('ul', {
        class: 'dt-materials',
        role: 'list'
    }, ...p.materials.map((m)=>h('li', {}, m))));
    const chars = h('section', {
        class: 'dt-section',
        'aria-labelledby': `dt-chr-${n}`
    }, h('h2', {
        class: 'dt-section__title',
        id: `dt-chr-${n}`
    }, 'Characteristics'), h('dl', {
        class: 'dt-chars'
    }, ...p.characteristics.map((c)=>h('div', {
            class: 'dt-chars__row'
        }, h('dt', {}, c.label), h('dd', {}, c.value)))));
    let selected = null;
    const anyAvailable = p.sizes.some((s)=>s.available);
    const hint = h('p', {
        class: 'dt-hint',
        id: ids.hint,
        'aria-live': 'polite'
    });
    const radios = [];
    const keys = p.sizes.map((s)=>{
        const input = h('input', {
            type: 'radio',
            class: 'dt-size__input',
            name: ids.sizes,
            value: String(s.eu),
            disabled: !s.available,
            'aria-describedby': ids.hint
        });
        radios.push(input);
        input.addEventListener('change', ()=>{
            if (!input.checked) return;
            selected = s.eu;
            fieldset.dataset.invalid = 'false';
            hint.textContent = '';
            add.removeAttribute('aria-describedby');
        });
        return h('label', {
            class: 'dt-size',
            'data-available': String(s.available)
        }, input, h('span', {
            class: 'dt-size__key'
        }, String(s.eu), s.available ? null : h('span', {
            class: 'dt-sr'
        }, ', sold out')));
    });
    const fieldset = h('fieldset', {
        class: 'dt-sizes',
        'data-invalid': 'false'
    }, h('legend', {
        class: 'dt-section__title dt-sizes__legend'
    }, 'Size', h('span', {
        class: 'dt-sizes__system'
    }, 'EU')), h('div', {
        class: 'dt-sizes__grid'
    }, ...keys), hint);
    fieldset.setAttribute('role', 'radiogroup');
    fieldset.setAttribute('aria-label', 'Size, EU');
    const addLabel = h('span', {
        class: 'dt-add__label'
    }, anyAvailable ? 'Add to cart' : 'Sold out in every size');
    const add = h('button', {
        type: 'button',
        class: 'k-button dt-add',
        disabled: !anyAvailable
    }, h('span', {
        class: 'dt-add__led',
        'aria-hidden': 'true'
    }), addLabel);
    const viewCart = h('button', {
        type: 'button',
        class: 'dt-viewcart'
    }, 'View cart');
    const feedbackText = h('span', {});
    const feedback = h('p', {
        class: 'dt-feedback',
        role: 'status'
    }, feedbackText);
    let feedbackTimer = 0;
    add.addEventListener('click', ()=>{
        if (selected === null) {
            fieldset.dataset.invalid = 'true';
            hint.textContent = 'Choose a size first.';
            add.setAttribute('aria-describedby', ids.hint);
            fieldset.scrollIntoView({
                block: 'nearest',
                behavior: 'smooth'
            });
            radios.find((r)=>!r.disabled)?.focus({
                preventScroll: true
            });
            return;
        }
        services.cart.add(p.id, selected);
        const msg = `${p.name}, EU ${selected}, added to cart`;
        services.announce(msg);
        feedbackText.textContent = `${p.name} in EU ${selected} is in your cart.`;
        if (!viewCart.isConnected) feedback.append(' ', viewCart);
        feedback.dataset.shown = 'true';
        add.dataset.state = 'added';
        addLabel.textContent = 'Added';
        clearTimeout(feedbackTimer);
        feedbackTimer = window.setTimeout(()=>{
            add.dataset.state = '';
            addLabel.textContent = 'Add to cart';
        }, 1800);
    });
    viewCart.addEventListener('click', ()=>services.cart.open(viewCart));
    lead.replaceChildren(bar, head);
    scroll.replaceChildren(meta, lede, materials, chars, fieldset);
    actions.replaceChildren(add, feedback);
    return {
        sequence: [
            bar,
            head,
            lede,
            materials,
            chars,
            fieldset,
            add
        ],
        heading,
        back,
        head,
        sizes: fieldset
    };
}


//# sourceURL=src\views\detail\panel.ts