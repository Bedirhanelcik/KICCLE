import { createShoeFigure, shoeRectWithin, whenFigureDecoded } from '../../components/shoe-figure.js';
import { SHOE_FRAME } from '../../data/index.js';
import { pct, placeShoe } from '../../lib/scale.js';
import { h } from '../../lib/dom.js';
import { DURATION, EASE, dur, onReducedMotionChange, prefersReducedMotion, settleWithin, wait } from '../../lib/motion.js';
import { COLUMNS, LABEL_H, UNIT_RATIOS, cellOf, computeLayout, scrollForColumn } from './layout.js';
import { PauseGate, REST, decodeExtra, encodeExtra, sweepSequence } from './sweep.js';
const SEQ = sweepSequence({
    columns: COLUMNS,
    restSteps: 1
});
const REST_STEP = SEQ.indexOf(REST);
const IGNITE_STEP = 620;
const IGNITE_LEAD = 1000;
const IGNITE_SETTLE = 420;
const IGNITE_ORDER = COLUMNS;
const EXPOSE_MS = 520;
const OPEN_PULLBACK = 0.918;
const OPEN_DOLLY_MS = 1150;
const OPEN_UI_DELAY = 520;
const ROOM_PHOTO = {
    aspect: 1672 / 941,
    horizon: 0.8725
};
function photoHorizon(vw, vh) {
    const scaledH = Math.max(vh, vw / ROOM_PHOTO.aspect);
    const offsetY = (vh - scaledH) / 2;
    return offsetY + ROOM_PHOTO.horizon * scaledH;
}
export function createShowroom(services) {
    const records = new Map();
    const bays = [];
    let root;
    let scroller;
    let cameraEl;
    let dollyEl;
    let caption;
    let ledger;
    let layout = null;
    let focusedId = null;
    let focusDone = Promise.resolve();
    let step = REST_STEP;
    let timer = 0;
    let ignited = -1;
    let opening = false;
    let igniteTimer = 0;
    let openDolly = null;
    let flyTimer = 0;
    let mounted = false;
    const gate = new PauseGate();
    gate.set('stage', true);
    let resolveReady;
    const ready = new Promise((r)=>resolveReady = r);
    function navHeight() {
        const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'));
        return Number.isFinite(v) && v > 0 ? v : innerWidth < 760 ? 60 : 72;
    }
    function applyLayout() {
        const vw = root.clientWidth || innerWidth;
        const vh = root.clientHeight || innerHeight;
        const prev = layout;
        const prevCol = prev && prev.mode === 'pan' ? nearestColumn(prev) : 0;
        const wallBottom = photoHorizon(vw, vh);
        const l = computeLayout({
            vw,
            vh,
            navH: navHeight(),
            aspect: SHOE_FRAME.aspect,
            baseline: SHOE_FRAME.baseline,
            wallBottom
        });
        layout = l;
        const s = root.style;
        const px = (n)=>`${n}px`;
        s.setProperty('--sr-u', px(l.u));
        s.setProperty('--sr-gx', px(l.gx));
        s.setProperty('--sr-gy', px(l.gy));
        s.setProperty('--sr-fig-h', px(l.figH));
        s.setProperty('--sr-sole-y', px(l.soleY));
        s.setProperty('--sr-unit-h', px(l.unitH));
        s.setProperty('--sr-wall-w', px(l.wallW));
        s.setProperty('--sr-grid-x', px(l.gridX));
        s.setProperty('--sr-row0', px(l.rowY[0]));
        s.setProperty('--sr-row1', px(l.rowY[1]));
        s.setProperty('--sr-track-y', px(l.trackY));
        s.setProperty('--sr-lens-y', px(l.lensY));
        s.setProperty('--sr-horizon', px(l.horizonY));
        s.setProperty('--sr-cone-deg', `${l.coneHalfDeg}deg`);
        s.setProperty('--sr-cone-len', px(l.coneLen));
        const coneW = 2 * l.coneLen * Math.tan(Math.min(80, l.coneHalfDeg * 1.3) * Math.PI / 180);
        s.setProperty('--sr-cone-w', px(Math.round(coneW)));
        s.setProperty('--sr-label-h', px(LABEL_H));
        root.dataset.mode = l.mode;
        if (l.mode === 'pan' && prev && prev.mode === 'pan' && focusedId === null) {
            scroller.scrollLeft = scrollForColumn(l, prevCol, vw);
        }
    }
    function nearestColumn(l) {
        const mid = scroller.scrollLeft + root.clientWidth / 2;
        const c = Math.round((mid - l.gridX - l.u / 2) / (l.u + l.gx));
        return Math.max(0, Math.min(COLUMNS - 1, c));
    }
    function setExposure(r, lit, instant = false) {
        const st = r.rim.style;
        st.transitionProperty = 'opacity, filter';
        st.transitionTimingFunction = EASE.light;
        st.transitionDuration = instant ? '0ms' : `${EXPOSE_MS}ms`;
        if (lit) {
            st.removeProperty('opacity');
            st.removeProperty('filter');
        } else {
            st.opacity = '0';
            st.filter = 'brightness(0.04)';
        }
    }
    function groupOf(r) {
        return layout?.mode === 'pan' ? Math.floor(r.position / 2) : r.col;
    }
    function applyLights() {
        root.dataset.light = 'even';
        if (opening) {
            root.dataset.ignition = 'on';
            const on = (col)=>col <= ignited;
            bays.forEach((bay, c)=>{
                bay.toggleAttribute('data-lit', on(c));
                bay.toggleAttribute('data-lit-r0', on(c));
                bay.toggleAttribute('data-lit-r1', on(c));
            });
            const arming = ignited < 0;
            for (const r of records.values()){
                const struck = on(groupOf(r));
                r.unit.toggleAttribute('data-lit', struck);
                setExposure(r, struck, arming);
            }
            return;
        }
        delete root.dataset.ignition;
        for (const bay of bays){
            bay.toggleAttribute('data-lit', true);
            bay.toggleAttribute('data-lit-r0', true);
            bay.toggleAttribute('data-lit-r1', true);
        }
        for (const r of records.values()){
            r.unit.toggleAttribute('data-lit', true);
            setExposure(r, true);
        }
    }
    function syncSweep() {
        if (opening) return;
        clearTimeout(timer);
        timer = 0;
    }
    function cancelIgnition() {
        clearTimeout(igniteTimer);
        igniteTimer = 0;
        ignited = -1;
        opening = false;
        openDolly?.cancel();
        openDolly = null;
        dollyEl?.style.removeProperty('transform');
        dollyEl?.style.removeProperty('transform-origin');
        if (root) delete root.dataset.opening;
    }
    function runIgnition() {
        cancelIgnition();
        opening = true;
        ignited = -1;
        applyLights();
        dollyEl.style.transformOrigin = '50% 62%';
        dollyEl.style.transform = `scale(${OPEN_PULLBACK})`;
        const finish = ()=>{
            const reduced = gate.has('reduced');
            clearTimeout(igniteTimer);
            igniteTimer = 0;
            ignited = -1;
            opening = false;
            root.dataset.opening = 'dolly';
            applyLights();
            if (reduced || typeof dollyEl.animate !== 'function') {
                dollyEl.style.removeProperty('transform');
                dollyEl.style.removeProperty('transform-origin');
                delete root.dataset.opening;
                return;
            }
            const a = dollyEl.animate([
                {
                    transform: `scale(${OPEN_PULLBACK})`
                },
                {
                    transform: 'scale(1)'
                }
            ], {
                duration: OPEN_DOLLY_MS,
                easing: EASE.camera,
                fill: 'forwards'
            });
            openDolly = a;
            void a.finished.then(()=>{
                if (openDolly !== a) return;
                openDolly = null;
                dollyEl.style.removeProperty('transform');
                dollyEl.style.removeProperty('transform-origin');
                a.cancel();
            }, ()=>undefined);
            igniteTimer = window.setTimeout(()=>{
                igniteTimer = 0;
                delete root.dataset.opening;
            }, OPEN_UI_DELAY);
        };
        const next = ()=>{
            if (!gate.running) {
                cancelIgnition();
                applyLights();
                return;
            }
            ignited += 1;
            applyLights();
            if (ignited < IGNITE_ORDER - 1) igniteTimer = window.setTimeout(next, IGNITE_STEP);
            else igniteTimer = window.setTimeout(finish, IGNITE_SETTLE);
        };
        igniteTimer = window.setTimeout(next, IGNITE_LEAD);
    }
    function buildUnit(p, position) {
        const { col, row } = cellOf(position);
        const figure = createShoeFigure(p, {
            fetchPriority: col === 0 ? 'high' : col === 1 ? 'auto' : 'low',
            decorative: true
        });
        const place = placeShoe(p.image, SHOE_FRAME);
        const mask = `url("${p.image.src}")`;
        const box = `left:${pct(place.left)};top:${pct(place.top)};width:${pct(place.width)};height:${pct(place.height)};` + `-webkit-mask-image:${mask};mask-image:${mask}`;
        const skin = h('span', {
            class: 'sr-unit__skin',
            'aria-hidden': 'true',
            style: box
        });
        const rim = h('div', {
            class: 'sr-unit__rim'
        }, figure, skin);
        const shoe = h('div', {
            class: 'sr-unit__shoe'
        }, rim);
        const plinth = h('span', {
            class: 'sr-plinth',
            'aria-hidden': 'true'
        }, h('span', {
            class: 'sr-plinth__cast'
        }), h('span', {
            class: 'sr-plinth__spill'
        }), h('span', {
            class: 'sr-plinth__top'
        }), h('span', {
            class: 'sr-plinth__front'
        }), h('span', {
            class: 'sr-plinth__edge-glow'
        }), h('span', {
            class: 'sr-plinth__led'
        }), h('span', {
            class: 'sr-plinth__led-lit'
        }));
        const label = h('span', {
            class: 'sr-unit__label',
            'aria-hidden': 'true'
        }, h('span', {
            class: 'sr-unit__name'
        }, p.name), h('span', {
            class: 'sr-unit__meta'
        }, p.colorway));
        const unit = h('a', {
            class: 'sr-unit',
            href: services.productPath(p.id),
            'data-product-id': p.id,
            'aria-label': `${p.name}, ${p.colorway}`
        }, plinth, shoe, label);
        const slot = h('li', {
            class: 'sr-slot',
            'data-col': col,
            'data-row': row,
            style: `--sr-col:${col};--sr-row:${row}`
        }, unit);
        return {
            product: p,
            slot,
            unit,
            rim,
            figure,
            col,
            row,
            position
        };
    }
    function buildBay(col) {
        return h('div', {
            class: 'sr-bay',
            'data-col': col,
            style: `--sr-col:${col}`
        }, h('span', {
            class: 'sr-bay__scallop'
        }), h('span', {
            class: 'sr-bay__pool sr-bay__pool--r0'
        }), h('span', {
            class: 'sr-bay__pool sr-bay__pool--r1'
        }), h('span', {
            class: 'sr-bay__floor'
        }), h('span', {
            class: 'sr-bay__haze'
        }), h('span', {
            class: 'sr-bay__core'
        }));
    }
    function restRectOf(id) {
        const r = records.get(id);
        if (!r || !cameraEl) return null;
        const m = new DOMMatrixReadOnly(getComputedStyle(cameraEl).transform);
        const s = m.a || 1;
        const b = r.slot.getBoundingClientRect();
        return new DOMRect((b.left - m.e) / s, (b.top - m.f) / s, b.width / s, b.height / s);
    }
    function setFocusClasses(id) {
        root.classList.toggle('is-focus-mode', id !== null);
        const focusCol = id ? records.get(id)?.col ?? -1 : -1;
        bays.forEach((bay, c)=>bay.toggleAttribute('data-focus', c === focusCol));
        for (const [pid, r] of records){
            const on = pid === id;
            r.slot.classList.toggle('is-focused', on);
            r.unit.classList.toggle('is-focused', on);
            r.slot.classList.toggle('is-quiet', id !== null && !on);
        }
        caption.setAttribute('aria-hidden', id !== null ? 'true' : 'false');
    }
    const offFns = [];
    const module = {
        ready,
        get root () {
            return root;
        },
        get camera () {
            return cameraEl;
        },
        mount (el) {
            if (mounted) return;
            mounted = true;
            root = el;
            root.classList.add('sr-stage');
            root.style.setProperty('--sr-slab-r', String(UNIT_RATIOS.slab));
            root.style.setProperty('--sr-top-r', String(UNIT_RATIOS.topFace));
            const room = h('div', {
                class: 'sr-room',
                'aria-hidden': 'true'
            }, h('span', {
                class: 'sr-room__photo'
            }), h('span', {
                class: 'sr-room__wall'
            }), h('span', {
                class: 'sr-room__floor'
            }), h('span', {
                class: 'sr-room__horizon'
            }), h('span', {
                class: 'sr-room__ceiling'
            }));
            const bayLayer = h('div', {
                class: 'sr-bays',
                'aria-hidden': 'true'
            });
            for(let c = 0; c < COLUMNS; c++){
                const b = buildBay(c);
                bays.push(b);
                bayLayer.append(b);
            }
            const grid = h('ol', {
                class: 'sr-grid',
                role: 'list',
                'aria-label': 'The archive, ten pairs'
            });
            services.products.forEach((p, i)=>{
                const r = buildUnit(p, i);
                records.set(p.id, r);
                grid.append(r.slot);
            });
            const wall = h('div', {
                class: 'sr-wall'
            }, h('span', {
                class: 'sr-track',
                'aria-hidden': 'true'
            }), bayLayer, grid);
            scroller = h('div', {
                class: 'sr-scroller'
            }, wall);
            dollyEl = h('div', {
                class: 'sr-camera__dolly'
            }, room, scroller);
            cameraEl = h('div', {
                class: 'sr-camera'
            }, dollyEl);
            caption = h('div', {
                class: 'sr-caption'
            }, h('h1', {
                class: 'sr-caption__title'
            }, 'Ten pairs, lit from within.'), h('p', {
                class: 'sr-caption__line'
            }, 'Footwear / Series 01'));
            const atmos = h('div', {
                class: 'sr-atmos',
                'aria-hidden': 'true'
            });
            ledger = h('div', {
                class: 'sr-ledger'
            }, h('p', {
                class: 'sr-ledger__id'
            }, h('span', {
                class: 'sr-ledger__dot',
                'aria-hidden': 'true'
            }), `Series 01 / ${services.products.length} silhouettes`), h('p', {
                class: 'sr-ledger__hint'
            }, 'Hover to illuminate. Select to explore.'), h('a', {
                class: 'sr-ledger__about',
                href: '#/about'
            }, 'About KICCLE', h('span', {
                class: 'sr-ledger__arrow',
                'aria-hidden': 'true'
            }, '↗')));
            root.append(cameraEl, caption, ledger, atmos);
            gate.set('reduced', prefersReducedMotion());
            applyLayout();
            applyLights();
            if (typeof ResizeObserver === 'function') {
                const ro = new ResizeObserver(()=>applyLayout());
                ro.observe(root);
                offFns.push(()=>ro.disconnect());
            } else {
                const onResize = ()=>applyLayout();
                addEventListener('resize', onResize);
                offFns.push(()=>removeEventListener('resize', onResize));
            }
            const onVis = ()=>{
                gate.set('tab', document.hidden);
                syncSweep();
            };
            document.addEventListener('visibilitychange', onVis);
            offFns.push(()=>document.removeEventListener('visibilitychange', onVis));
            offFns.push(onReducedMotionChange((reduced)=>{
                gate.set('reduced', reduced);
                applyLights();
                syncSweep();
            }));
            if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
                let litUnit = null;
                const clear = ()=>{
                    litUnit?.style.removeProperty('--sr-px');
                    litUnit?.style.removeProperty('--sr-py');
                    litUnit = null;
                };
                const onMove = (e)=>{
                    const unit = e.target?.closest('.sr-unit') ?? null;
                    if (unit !== litUnit) clear();
                    if (!unit) return;
                    litUnit = unit;
                    const b = unit.getBoundingClientRect();
                    if (b.width <= 0 || b.height <= 0) return;
                    unit.style.setProperty('--sr-px', `${((e.clientX - b.left) / b.width * 100).toFixed(2)}%`);
                    unit.style.setProperty('--sr-py', `${((e.clientY - b.top) / b.height * 100).toFixed(2)}%`);
                };
                grid.addEventListener('pointermove', onMove, {
                    passive: true
                });
                grid.addEventListener('pointerleave', clear, {
                    passive: true
                });
                offFns.push(()=>{
                    grid.removeEventListener('pointermove', onMove);
                    grid.removeEventListener('pointerleave', clear);
                    clear();
                });
            }
            const firstColumn = [
                ...records.values()
            ].filter((r)=>r.col === 0).map((r)=>whenFigureDecoded(r.figure));
            void settleWithin(Promise.all(firstColumn), 6000).then(()=>resolveReady());
        },
        enter (t) {
            gate.set('stage', false);
            gate.set('tab', document.hidden);
            const reduced = t.reducedMotion || prefersReducedMotion();
            gate.set('reduced', reduced);
            cancelIgnition();
            if (t.initial && !reduced) {
                runIgnition();
            } else {
                applyLights();
                syncSweep();
            }
        },
        leave (_t) {
            gate.set('stage', true);
            cancelIgnition();
            syncSweep();
        },
        unmount () {
            clearTimeout(timer);
            clearTimeout(flyTimer);
            cancelIgnition();
            for (const f of offFns.splice(0))f();
        },
        getUnit: (id)=>records.get(id)?.unit ?? null,
        getFigure: (id)=>records.get(id)?.figure ?? null,
        getRestRect (id) {
            return restRectOf(id);
        },
        getShoeRect (id) {
            const r = records.get(id);
            const box = restRectOf(id);
            if (!r || !box) return null;
            const figRect = {
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.width / SHOE_FRAME.aspect
            };
            return shoeRectWithin(r.product, figRect);
        },
        setFocus (id) {
            const next = id !== null && records.has(id) ? id : null;
            if (next === focusedId) return focusDone;
            focusedId = next;
            setFocusClasses(next);
            root.dataset.flying = 'on';
            clearTimeout(flyTimer);
            flyTimer = window.setTimeout(()=>{
                flyTimer = 0;
                delete root.dataset.flying;
            }, DURATION.camera + 120);
            gate.set('focus', next !== null);
            syncSweep();
            services.bus.emit('stage:focus', {
                productId: next
            });
            const p = wait(dur(DURATION.slow, 200));
            focusDone = p;
            return p;
        },
        pauseSpotlights () {
            gate.pauseApi();
            syncSweep();
        },
        resumeSpotlights () {
            gate.resumeApi();
            syncSweep();
        },
        snapshot () {
            return {
                focusedId,
                scrollLeft: scroller ? scroller.scrollLeft : 0,
                scrollTop: scroller ? scroller.scrollTop : 0,
                extra: encodeExtra(step)
            };
        },
        restore (s) {
            if (!scroller) return;
            scroller.scrollLeft = s.scrollLeft;
            scroller.scrollTop = s.scrollTop;
            const st = decodeExtra(s.extra, SEQ.length);
            if (st !== null && st !== step) {
                step = st;
                applyLights();
            }
            void module.setFocus(s.focusedId);
        }
    };
    return module;
}


//# sourceURL=src\views\showroom\index.ts