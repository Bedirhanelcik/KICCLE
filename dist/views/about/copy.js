export const ABOUT_HERO = {
    title: 'An independent footwear concept.',
    titleLines: [
        'An independent',
        'footwear concept.'
    ]
};
export const ABOUT_BODY = [
    'KICCLE is an independent student project created by Bedirhan Elçik, inspired by sneaker culture, footwear design and immersive digital experiences.',
    'The collection brings together original sneaker concepts developed specifically for this project, combining different silhouettes, materials and visual identities.',
    'KICCLE is currently a design showcase, not a commercial store. Products are not available for purchase. Future releases may be considered if the concept receives significant interest.'
];
export const ABOUT_AUTHOR = {
    label: 'Designed and built by',
    name: 'Bedirhan Elçik',
    role: 'Student project — design, code and art direction.'
};
export const ABOUT_LINKS = [
    {
        label: 'LinkedIn',
        href: 'https://www.linkedin.com/in/bedirhanelcik'
    },
    {
        label: 'GitHub',
        href: 'https://github.com/Bedirhanelcik'
    }
];
export const ABOUT_CONTACT_TITLE = 'Contact';
export const ABOUT_PIECES = {
    strip: [
        'aurel',
        'dorea',
        'zoomx'
    ]
};
export const ABOUT_CLOSE = {
    title: 'The room is open.',
    showroom: 'Enter the showroom',
    collections: 'Browse the collections'
};
export function pieceCaption(p) {
    return `${p.name} · ${p.colorway}`;
}
export function aboutStrings() {
    return [
        ABOUT_HERO.title,
        ...ABOUT_BODY,
        ABOUT_AUTHOR.label,
        ABOUT_AUTHOR.name,
        ABOUT_AUTHOR.role,
        ABOUT_CONTACT_TITLE,
        ...ABOUT_LINKS.map((l)=>l.label),
        ABOUT_CLOSE.title,
        ABOUT_CLOSE.showroom,
        ABOUT_CLOSE.collections
    ];
}


//# sourceURL=src\views\about\copy.ts