import { SHOE_FRAME } from '../../data/frame.js';
import { whenFigureDecoded } from '../../components/shoe-figure.js';
import { visibleBoxInFrame } from '../../lib/scale.js';
import { focusables, h } from '../../lib/dom.js';
import { DURATION, EASE, prefersReducedMotion, settleWithin } from '../../lib/motion.js';
import { IDENTITY, computeLayout, computeTarget, dollyKeyframes, easingFromCss, isIdentity, parseMatrix, sceneAnchor, toScene, remainingFraction, toCss } from './camera.js';
import { renderPanel } from './panel.js';
const cameraEase = easingFromCss(EASE.camera);
const retargetEase = easingFromCss('cubic-bezier(0.35, 0, 0.12, 1)');
function untilAbort(signal) {
    return new Promise((r)=>{
        if (signal.aborted) r();
        else signal.addEventListener('abort', ()=>r(), {
            once: true
        });
    });
}
function navHeight() {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'));
    return Number.isFinite(v) && v > 0 ? v : innerWidth < 760 ? 60 : 72;
}
function maxShoeWidth(vw) {
    const slot = vw <= 760 ? vw * 0.92 : vw * 0.5;
    return slot * SHOE_FRAME.contentWidth;
}
export function createDetail(services) {
    const { stage } = services;
    let wrap;
    let backdrop;
    let panel;
    let lead;
    let scroll;
    let actions;
    let parts = null;
    let openId = null;
    let snap = null;
    let layout = null;
    let target = null;
    let cameraAnim = null;
    let moveToken = 0;
    let tabBackward = false;
    let resizeRaf = 0;
    const geometryOf = (p)=>({
            visibleBox: visibleBoxInFrame(p.image, SHOE_FRAME),
            aspect: SHOE_FRAME.aspect,
            baseline: SHOE_FRAME.baseline
        });
    function applyLayout() {
        const vw = document.documentElement.clientWidth || innerWidth;
        const vh = innerHeight;
        const l = computeLayout(vw, vh, navHeight());
        layout = l;
        wrap.dataset.mode = l.mode;
        const st = wrap.style;
        st.setProperty('--dt-panel-left', `${l.panel.left}px`);
        st.setProperty('--dt-panel-top', `${l.panel.top}px`);
        st.setProperty('--dt-panel-width', `${l.panel.width}px`);
        st.setProperty('--dt-panel-height', `${l.panel.height}px`);
        st.setProperty('--dt-stage-height', `${l.stage.height}px`);
        placeSizes();
        placeHead();
        return l;
    }
    function placeSizes() {
        const f = parts?.sizes;
        if (!f || !layout) return;
        if (layout.mode === 'side' && layout.panel.height >= 680) {
            if (f.parentElement !== actions) actions.prepend(f);
        } else if (f.parentElement !== scroll) scroll.append(f);
    }
    function placeHead() {
        const head = parts?.head;
        if (!head || !layout) return;
        if (layout.mode === 'side') {
            if (head.parentElement !== lead) lead.append(head);
        } else if (head.parentElement !== scroll) scroll.prepend(head);
    }
    function aim(id) {
        const p = services.getProduct(id);
        const rest = stage.getRestRect(id);
        const shoe = stage.getShoeRect(id);
        if (!p || !rest || !shoe || rest.width <= 0 || shoe.width <= 0 || !layout) return null;
        const vw = document.documentElement.clientWidth || innerWidth;
        const t = computeTarget(rest, shoe, geometryOf(p), layout, {
            maxShoeWidth: maxShoeWidth(vw)
        });
        return {
            ...t,
            transform: toScene(t.transform, rest)
        };
    }
    function settleOwnTransitions(el) {
        if (typeof el.getAnimations !== 'function') return;
        for (const a of el.getAnimations()){
            const prop = a.transitionProperty;
            if (prop === 'transform' || prop === 'transform-origin' || prop === 'will-change') a.finish();
        }
    }
    function clearUnit(el) {
        el.style.removeProperty('transform');
        el.style.removeProperty('transform-origin');
        el.style.removeProperty('will-change');
        settleOwnTransitions(el);
    }
    function placeUnit(el, t) {
        el.style.transformOrigin = '0 0';
        el.style.transform = toCss(t);
        settleOwnTransitions(el);
    }
    function currentOf(el) {
        return parseMatrix(getComputedStyle(el).transform) ?? IDENTITY;
    }
    function moveUnit(id, to, duration, ease) {
        const unit = stage.camera;
        const p = services.getProduct(id);
        const rest = stage.getRestRect(id);
        const shoe = stage.getShoeRect(id);
        if (!unit) return Promise.resolve();
        const from = currentOf(unit);
        cameraAnim?.cancel();
        cameraAnim = null;
        const token = ++moveToken;
        const toRest = isIdentity(to, 1e-6);
        const settleAt = (t)=>{
            if (token !== moveToken) return;
            if (isIdentity(t, 1e-6)) clearUnit(unit);
            else {
                placeUnit(unit, t);
                unit.style.removeProperty('will-change');
            }
        };
        if (duration <= 0 || typeof unit.animate !== 'function' || isIdentity({
            tx: from.tx - to.tx,
            ty: from.ty - to.ty,
            s: 1 + from.s - to.s
        }, 1e-4)) {
            settleAt(to);
            return Promise.resolve();
        }
        placeUnit(unit, from);
        unit.style.willChange = 'transform';
        settleOwnTransitions(unit);
        const anchor = p && rest && shoe ? sceneAnchor(rest, shoe, geometryOf(p)) : {
            x: 0,
            y: 0
        };
        const steps = Math.max(24, Math.round(duration / 8));
        const anim = unit.animate(dollyKeyframes(from, to, anchor, ease, steps), {
            duration,
            easing: 'linear',
            fill: 'forwards'
        });
        cameraAnim = anim;
        return anim.finished.then(()=>{
            if (cameraAnim !== anim || token !== moveToken) return;
            cameraAnim = null;
            settleAt(to);
            anim.cancel();
        }, ()=>undefined);
    }
    async function fadeUnitTo(id, to) {
        const unit = stage.camera;
        if (!unit) return;
        cameraAnim?.cancel();
        cameraAnim = null;
        if (typeof unit.animate !== 'function') {
            if (isIdentity(to, 1e-6)) clearUnit(unit);
            else placeUnit(unit, to);
            return;
        }
        const out = unit.animate([
            {
                opacity: 1
            },
            {
                opacity: 0
            }
        ], {
            duration: 90,
            easing: 'linear',
            fill: 'forwards'
        });
        await out.finished.catch(()=>undefined);
        unit.style.removeProperty('will-change');
        if (isIdentity(to, 1e-6)) clearUnit(unit);
        else placeUnit(unit, to);
        const back = unit.animate([
            {
                opacity: 0
            },
            {
                opacity: 1
            }
        ], {
            duration: 110,
            easing: 'linear'
        });
        out.cancel();
        await back.finished.catch(()=>undefined);
    }
    function cancelPanelAnimations() {
        for (const a of panel.getAnimations({
            subtree: true
        }))a.cancel();
    }
    function showPanel(delay, reduced, quick) {
        cancelPanelAnimations();
        panel.hidden = false;
        wrap.dataset.state = 'open';
        if (typeof panel.animate !== 'function') return Promise.resolve();
        if (reduced || quick) {
            return panel.animate([
                {
                    opacity: 0
                },
                {
                    opacity: 1
                }
            ], {
                duration: reduced ? 180 : DURATION.base,
                delay: quick ? 0 : delay,
                easing: EASE.standard,
                fill: 'backwards'
            }).finished.then(()=>undefined, ()=>undefined);
        }
        const sheet = layout?.mode === 'sheet';
        const slab = panel.animate([
            {
                opacity: 0,
                transform: sheet ? 'translateY(56px)' : 'translateX(48px)'
            },
            {
                opacity: 1,
                transform: 'none'
            }
        ], {
            duration: DURATION.slow + 140,
            delay,
            easing: EASE.out,
            fill: 'backwards'
        });
        const items = (parts?.sequence ?? []).map((el, i)=>el.animate([
                {
                    opacity: 0,
                    transform: 'translateY(14px)'
                },
                {
                    opacity: 1,
                    transform: 'none'
                }
            ], {
                duration: DURATION.slow,
                delay: delay + 140 + i * 55,
                easing: EASE.out,
                fill: 'backwards'
            }));
        return Promise.all([
            slab,
            ...items
        ].map((a)=>a.finished.catch(()=>undefined))).then(()=>undefined);
    }
    function hidePanel(reduced) {
        if (panel.hidden) return Promise.resolve();
        const opacity = getComputedStyle(panel).opacity;
        cancelPanelAnimations();
        wrap.dataset.state = 'closing';
        const done = ()=>{
            if (wrap.dataset.state !== 'closing') return;
            panel.hidden = true;
            wrap.dataset.state = 'closed';
            cancelPanelAnimations();
        };
        if (typeof panel.animate !== 'function') {
            done();
            return Promise.resolve();
        }
        const sheet = layout?.mode === 'sheet';
        const a = panel.animate([
            {
                opacity: Number(opacity) || 1,
                transform: 'none'
            },
            {
                opacity: 0,
                transform: reduced ? 'none' : sheet ? 'translateY(40px)' : 'translateX(32px)'
            }
        ], {
            duration: reduced ? 160 : DURATION.base,
            easing: EASE.in,
            fill: 'forwards'
        });
        return a.finished.then(done, ()=>undefined);
    }
    function onFocusIn(e) {
        if (!openId || services.cart.isOpen()) return;
        const t = e.target;
        if (!t || !stage.root.contains(t)) return;
        const visible = (el)=>!stage.root.contains(el) && (el.checkVisibility?.({
                visibilityProperty: true
            }) ?? true);
        const all = focusables(document.body).filter(visible);
        const inPanel = focusables(panel);
        const fallback = tabBackward ? inPanel[inPanel.length - 1] : inPanel[0];
        let next = fallback;
        if (tabBackward) {
            const first = inPanel[0];
            const i = first ? all.indexOf(first) : -1;
            next = (i > 0 ? all[i - 1] : undefined) ?? fallback;
        }
        next?.focus({
            preventScroll: true
        });
        if (stage.root.contains(document.activeElement)) (fallback ?? parts?.heading)?.focus({
            preventScroll: true
        });
    }
    function onKeyDown(e) {
        if (e.key === 'Tab') tabBackward = e.shiftKey;
        if (e.key !== 'Escape' || !openId || e.defaultPrevented || services.cart.isOpen()) return;
        e.preventDefault();
        services.back('#/');
    }
    function onResize() {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(()=>{
            if (!openId) return;
            applyLayout();
            const next = aim(openId);
            if (!next) return;
            target = next;
            const unit = stage.camera;
            if (!unit) return;
            if (cameraAnim) {
                const timing = cameraAnim.effect?.getComputedTiming();
                const left = timing && typeof timing.endTime === 'number' ? Math.max(120, timing.endTime - Number(cameraAnim.currentTime ?? 0)) : 300;
                void moveUnit(openId, next.transform, left, retargetEase);
            } else placeUnit(unit, next.transform);
        });
    }
    function arm() {
        document.addEventListener('focusin', onFocusIn, true);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', onResize);
        wrap.dataset.open = 'true';
    }
    function disarm() {
        document.removeEventListener('focusin', onFocusIn, true);
        document.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', onResize);
        cancelAnimationFrame(resizeRaf);
        wrap.dataset.open = 'false';
    }
    const goBack = ()=>services.back('#/');
    return {
        mount (root) {
            backdrop = h('div', {
                class: 'dt-backdrop',
                'aria-hidden': 'true'
            });
            scroll = h('div', {
                class: 'dt-panel__scroll'
            });
            actions = h('div', {
                class: 'dt-actions'
            });
            panel = h('section', {
                class: 'dt-panel',
                hidden: true
            }, scroll, actions);
            lead = h('div', {
                class: 'dt-lead'
            });
            wrap = h('div', {
                class: 'dt',
                'data-state': 'closed',
                'data-open': 'false'
            }, backdrop, lead, panel);
            root.append(wrap);
            applyLayout();
            backdrop.addEventListener('click', ()=>{
                if (openId && layout?.mode === 'side') goBack();
            });
            const stop = (e)=>e.preventDefault();
            backdrop.addEventListener('wheel', stop, {
                passive: false
            });
            backdrop.addEventListener('touchmove', stop, {
                passive: false
            });
        },
        async enter (t) {
            if (t.to.name !== 'product') return;
            const id = t.to.productId;
            const p = services.getProduct(id);
            if (!p) return;
            openId = id;
            snap = stage.snapshot();
            const reduced = t.reducedMotion || prefersReducedMotion();
            applyLayout();
            const focusDone = stage.setFocus(id);
            target = aim(id);
            const unit = stage.camera;
            const figure = stage.getFigure(id);
            if (figure && !t.initial) await settleWithin(whenFigureDecoded(figure, 900), 900);
            if (t.signal.aborted || openId !== id) return;
            let camera = Promise.resolve();
            let panelIn;
            const buildPanel = ()=>{
                parts = renderPanel(p, services, t.from, lead, scroll, actions, goBack);
                placeHead();
                applyLayout();
                panel.setAttribute('aria-labelledby', parts.heading.id);
                scroll.scrollTop = 0;
                arm();
            };
            if (t.initial) {
                if (unit && target) {
                    cameraAnim?.cancel();
                    cameraAnim = null;
                    placeUnit(unit, target.transform);
                }
                buildPanel();
                panelIn = showPanel(0, reduced, true);
            } else if (reduced) {
                if (target) camera = fadeUnitTo(id, target.transform);
                buildPanel();
                panelIn = showPanel(60, true, false);
            } else {
                if (unit && target) {
                    const from = currentOf(unit);
                    const frac = isIdentity(from) ? 1 : Math.max(0.45, remainingFraction(from, target.transform, IDENTITY));
                    camera = moveUnit(id, target.transform, Math.round(DURATION.camera * frac), isIdentity(from) ? cameraEase : retargetEase);
                    buildPanel();
                    panelIn = showPanel(Math.round(DURATION.camera * frac * 0.5), false, false);
                } else {
                    buildPanel();
                    panelIn = showPanel(0, false, false);
                }
            }
            void panelIn;
            await Promise.race([
                Promise.all([
                    camera,
                    focusDone
                ]),
                untilAbort(t.signal)
            ]);
            if (t.signal.aborted || openId !== id) return;
            if (!panel.contains(document.activeElement) || document.activeElement === document.body) {
                parts.heading.focus({
                    preventScroll: true
                });
            }
            services.bus.emit('detail:opened', {
                productId: id
            });
        },
        async leave (t) {
            const id = openId;
            if (!id) return;
            openId = null;
            disarm();
            const reduced = t.reducedMotion || prefersReducedMotion();
            const unit = stage.camera;
            const hadFocus = panel.contains(document.activeElement);
            const panelOut = hidePanel(reduced);
            let camera;
            if (reduced) {
                camera = fadeUnitTo(id, IDENTITY);
            } else if (unit) {
                const from = currentOf(unit);
                const full = target?.transform ?? from;
                const frac = Math.max(0.4, remainingFraction(from, IDENTITY, full));
                const moving = !!cameraAnim;
                camera = new Promise((r)=>setTimeout(r, moving ? 0 : 90)).then(()=>moveUnit(id, IDENTITY, Math.round(DURATION.camera * frac), moving ? retargetEase : cameraEase));
            } else {
                camera = Promise.resolve();
            }
            const focusOff = stage.setFocus(null);
            await Promise.race([
                Promise.all([
                    panelOut,
                    camera,
                    focusOff
                ]),
                untilAbort(t.signal)
            ]);
            if (t.signal.aborted) {
                stage.restore({
                    ...snap ?? stage.snapshot(),
                    focusedId: null
                });
                services.bus.emit('detail:closed', {
                    productId: id
                });
                return;
            }
            if (unit && !cameraAnim) clearUnit(unit);
            if (snap) stage.restore({
                ...snap,
                focusedId: null
            });
            snap = null;
            target = null;
            services.bus.emit('detail:closed', {
                productId: id
            });
            if (t.to.name === 'home' && (hadFocus || document.activeElement === document.body || !document.activeElement)) {
                const link = unit?.matches('a[href]') ? unit : unit?.querySelector('a[href]') ?? unit?.closest('a[href]');
                link?.focus({
                    preventScroll: true
                });
            }
        },
        unmount () {
            disarm();
            cameraAnim?.cancel();
            cameraAnim = null;
            if (stage.camera) clearUnit(stage.camera);
            wrap?.remove();
        }
    };
}


//# sourceURL=src\views\detail\index.ts