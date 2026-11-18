/**
 * FAQ (Package D). An accordion of real buttons (aria-expanded/aria-controls)
 * and labelled regions. Multi-open by design: opening a question never closes
 * another one above it, so the answer being read never jumps out from under
 * the reader. Height animates with grid-template-rows (0fr -> 1fr): no
 * measuring, no content jump.
 */
import type { AppServices, View, ViewTransition } from '../../types.js';
import { h } from '../../lib/dom.js';
import { afterPaint } from '../../lib/motion.js';
import { FAQ_INTRO, faqGroups, numberedItems, type FaqGroup } from './data.js';

export function createFaqPage(services: AppServices): View {
  let page: HTMLElement | null = null;
  let buttons: HTMLButtonElement[] = [];

  function setOpen(btn: HTMLButtonElement, open: boolean): void {
    btn.setAttribute('aria-expanded', String(open));
    btn.closest('.fq-item')?.classList.toggle('is-open', open);
  }

  function onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (!(target instanceof HTMLButtonElement) || !target.classList.contains('fq-item__btn')) return;
    const i = buttons.indexOf(target);
    let next = -1;
    if (e.key === 'ArrowDown') next = (i + 1) % buttons.length;
    else if (e.key === 'ArrowUp') next = (i - 1 + buttons.length) % buttons.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = buttons.length - 1;
    if (next < 0) return;
    e.preventDefault();
    buttons[next]!.focus();
  }

  function build(groups: FaqGroup[]): HTMLElement {
    const numbered = numberedItems(groups);
    const numOf = new Map(numbered.map((n) => [n.item.id, n.num]));

    const groupNodes = groups.map((g) => {
      const section = h(
        'section',
        { class: 'fq-group', 'aria-labelledby': `fq-g-${g.id}`, 'data-fq-group': g.id },
        h('h2', { class: 'k-visually-hidden', id: `fq-g-${g.id}`, tabindex: '-1' }, g.title),
        h(
          'ul',
          { class: 'fq-list', role: 'list' },
          ...g.items.map((item) => {
            const qId = `fq-q-${item.id}`;
            const aId = `fq-a-${item.id}`;
            const btn = h(
              'button',
              { type: 'button', class: 'fq-item__btn', id: qId, 'aria-expanded': 'false', 'aria-controls': aId },
              h('span', { class: 'fq-item__num', 'aria-hidden': 'true' }, numOf.get(item.id) ?? ''),
              h('span', { class: 'fq-item__q' }, item.question),
              h('span', { class: 'fq-item__icon', 'aria-hidden': 'true' }),
            );
            btn.addEventListener('click', () => setOpen(btn, btn.getAttribute('aria-expanded') !== 'true'));
            buttons.push(btn);
            return h(
              'li',
              { class: 'fq-item', style: `--fq-i:${Number(numOf.get(item.id) ?? 1) - 1}` },
              h('span', { class: 'fq-item__led', 'aria-hidden': 'true' }),
              h('h3', { class: 'fq-item__h' }, btn),
              h(
                'div',
                { class: 'fq-item__panel', id: aId, role: 'region', 'aria-labelledby': qId },
                h(
                  'div',
                  { class: 'fq-item__clip' },
                  h(
                    'div',
                    { class: 'fq-item__answer' },
                    ...item.answer.map((t) => h('p', {}, t)),
                    ...(item.links
                      ? [
                          h(
                            'p',
                            { class: 'fq-item__links' },
                            ...item.links.map((l) =>
                              h('a', { class: 'fq-link', href: l.href, target: '_blank', rel: 'noopener noreferrer' }, l.label),
                            ),
                          ),
                        ]
                      : []),
                  ),
                ),
              ),
            );
          }),
        ),
      );
      return section;
    });

    const root = h(
      'div',
      { class: 'fq k-container', 'data-fq-enter': 'done' },
      h(
        'header',
        { class: 'fq-head' },
        h('h1', { class: 'fq-head__title' }, FAQ_INTRO.title),
        h('p', { class: 'fq-head__lede' }, FAQ_INTRO.lede),
      ),
      h('div', { class: 'fq-body' }, h('div', { class: 'fq-groups' }, ...groupNodes)),
    );
    root.addEventListener('keydown', onKey);
    return root;
  }

  return {
    mount(root) {
      page = build(faqGroups());
      root.append(page);
    },

    async enter(t: ViewTransition) {
      if (!page) return;
      if (t.initial || t.reducedMotion || t.signal.aborted) {
        page.dataset.fqEnter = 'done';
        return;
      }
      // Rows draw their hairlines in from the left, one after another.
      page.dataset.fqEnter = 'start';
      void page.offsetWidth;
      await afterPaint();
      page.dataset.fqEnter = 'done';
    },


    leave() {
      // Required by the View contract. Collapse every answer so the page is
      // found in its resting state next time rather than half-unfolded.
      for (const b of buttons) setOpen(b, false);
    },

    unmount() {
      page?.remove();
      page = null;
      buttons = [];
    },
  };
}
