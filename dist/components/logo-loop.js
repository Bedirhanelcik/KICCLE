import { prefersReducedMotion } from '../lib/motion.js';
const LED_TONES = [
    'var(--led-core)',
    'var(--led-deep)',
    '#ffa33d',
    '#ffbe63',
    '#fff0db'
];
const TIMING = {
    scanHold: 280,
    scanRest: 2800,
    fillStep: 380,
    flashOn: 180,
    flashOff: 230,
    flashes: 4,
    fillRest: 3800
};
const randomInt = (n)=>Math.floor(Math.random() * n);
function shuffled(n, avoid = -1) {
    const order = Array.from({
        length: n
    }, (_, i)=>i);
    for(let i = n - 1; i > 0; i--){
        const j = randomInt(i + 1);
        [order[i], order[j]] = [
            order[j],
            order[i]
        ];
    }
    if (order.length > 1 && order[0] === avoid) [order[0], order[1]] = [
        order[1],
        order[0]
    ];
    return order;
}
export function createLogoLoop(mark) {
    const letters = mark ? [
        ...mark.querySelectorAll('.k-wordmark__ch')
    ] : [];
    let timer = 0;
    let running = false;
    let generation = 0;
    const light = (el, on)=>{
        if (on) {
            el.style.setProperty('--k-led-tone', LED_TONES[randomInt(LED_TONES.length)]);
            el.style.setProperty('--k-led', '1');
        } else {
            el.style.setProperty('--k-led', '0');
        }
    };
    const allWhite = ()=>{
        for (const el of letters){
            el.style.setProperty('--k-led', '0');
            el.removeAttribute('data-flash');
        }
    };
    const after = (ms, fn)=>{
        const g = generation;
        clearTimeout(timer);
        timer = window.setTimeout(()=>{
            if (running && g === generation) fn();
        }, ms);
    };
    function scan(order, i, prev) {
        if (i >= order.length) {
            allWhite();
            after(TIMING.scanRest, ()=>fill(shuffled(letters.length), 0));
            return;
        }
        if (prev >= 0) light(letters[prev], false);
        const idx = order[i];
        light(letters[idx], true);
        after(TIMING.scanHold, ()=>scan(order, i + 1, idx));
    }
    function fill(order, i) {
        if (i >= order.length) {
            flash(0);
            return;
        }
        light(letters[order[i]], true);
        after(TIMING.fillStep, ()=>fill(order, i + 1));
        return;
    }
    function flash(n) {
        if (n >= TIMING.flashes) {
            allWhite();
            after(TIMING.fillRest, ()=>scan(shuffled(letters.length), 0, -1));
            return;
        }
        for (const el of letters)el.setAttribute('data-flash', 'off');
        after(TIMING.flashOff, ()=>{
            for (const el of letters)el.setAttribute('data-flash', 'on');
            after(TIMING.flashOn, ()=>flash(n + 1));
        });
    }
    return {
        start () {
            if (running || letters.length === 0 || prefersReducedMotion()) return;
            running = true;
            generation += 1;
            allWhite();
            after(600, ()=>scan(shuffled(letters.length), 0, -1));
        },
        stop () {
            running = false;
            generation += 1;
            clearTimeout(timer);
            timer = 0;
            allWhite();
        },
        destroy () {
            this.stop();
        }
    };
}


//# sourceURL=src\components\logo-loop.ts