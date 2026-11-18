import { ABOUT_LINKS } from '../about/copy.js';
export const FAQ_INTRO = {
    title: 'Questions',
    lede: 'What KICCLE is, what the cart does, where the designs come from, and how to get in touch.',
    indexLabel: 'Jump to a question'
};
export function listJoin(items) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
export function faqGroups() {
    return [
        {
            id: 'kiccle',
            title: 'KICCLE',
            items: [
                {
                    id: 'real-store',
                    question: 'Is KICCLE a real store?',
                    answer: [
                        'KICCLE is currently an independent footwear concept and digital showcase, not an operating store.'
                    ]
                },
                {
                    id: 'purchase',
                    question: 'Can I purchase the sneakers?',
                    answer: [
                        'No. The cart is currently a demonstration of the website interaction. Purchases and payment are not available.'
                    ]
                },
                {
                    id: 'original',
                    question: 'Are the sneaker designs original?',
                    answer: [
                        'The collection contains original design concepts developed for the KICCLE project, inspired by wider sneaker culture.'
                    ]
                },
                {
                    id: 'contact',
                    question: 'How can I contact the creator?',
                    answer: [
                        'KICCLE is made by Bedirhan Elçik. The best places to reach him are below.'
                    ],
                    links: ABOUT_LINKS
                }
            ]
        }
    ];
}
export function numberedItems(groups) {
    let n = 0;
    return groups.flatMap((group)=>group.items.map((item)=>({
                num: String(++n).padStart(2, '0'),
                group,
                item
            })));
}
export function faqStrings(groups) {
    return [
        ...Object.values(FAQ_INTRO),
        ...groups.flatMap((g)=>[
                g.title,
                ...g.items.flatMap((i)=>[
                        i.question,
                        ...i.answer,
                        ...(i.links ?? []).map((l)=>l.label)
                    ])
            ])
    ];
}


//# sourceURL=src\views\faq\data.ts