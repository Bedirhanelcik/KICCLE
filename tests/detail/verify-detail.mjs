// Browser verification for Package C (detail camera move + cart drawer).
// Run from the project root after `npm run build`:
//   NODE_PATH="$(npm root -g)" node tests/detail/verify-detail.mjs
// Env: DT_OUT (screenshots + report.json, default <tmp>/kiccle-detail), DT_ONLY=1440x900 (one viewport).
//
// Only the contract is assumed: product links `#k-stage a[href="#/product/<id>"]`, the
// unit is the element in #k-stage whose inline transform-origin C sets, the figure is
// `.k-shoe[data-product-id]` inside it. No showroom (sr-*) class is used.

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from '../../scripts/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = process.env.DT_OUT ?? join(tmpdir(), 'kiccle-detail');
mkdirSync(OUT, { recursive: true });
const PORT = 4302;

const ALL_VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
  { w: 1280, h: 640 },
  { w: 768, h: 1024 },
  { w: 390, h: 844 },
  { w: 360, h: 740 },
];
const VIEWPORTS = process.env.DT_ONLY ? ALL_VIEWPORTS.filter((v) => `${v.w}x${v.h}` === process.env.DT_ONLY) : ALL_VIEWPORTS;
const IDS = ['loam', 'thicket', 'signal', 'drift', 'ledger', 'monolith', 'canyon', 'hush', 'trace', 'strata'];
// first, middle, last of row 1, first + last of row 2
const OPEN_SET = ['loam', 'signal', 'ledger', 'monolith', 'strata'];
const CAMERA_MS = 1150;

const server = await startServer(PORT, '127.0.0.1');
const origin = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch();
const report = { origin, checks: [], problems: [] };
let failures = 0;

function check(label, ok, detail) {
  report.checks.push({ label, ok: !!ok, detail });
  if (!ok) {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ''}`);
  } else if (process.env.DT_VERBOSE) console.log(`ok   ${label}`);
}

async function newPage(vp, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: opts.dpr ?? 1,
    reducedMotion: opts.reducedMotion ?? 'no-preference',
    hasTouch: vp.w < 760,
  });
  const page = await ctx.newPage();
  const log = { errors: [], external: [] };
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => log.errors.push(`pageerror: ${e}`));
  page.on('requestfailed', (r) => log.errors.push(`requestfailed: ${r.url()}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) log.external.push(u);
  });
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  return { ctx, page, log };
}

async function waitForApp(page) {
  await page.waitForFunction(() => !document.getElementById('k-intro') && !document.getElementById('k-app').inert, null, { timeout: 20000 });
  await page.waitForTimeout(400);
}

async function settle(page, ms = CAMERA_MS + 700) {
  await page.waitForTimeout(ms);
}

/** No running animation on the unit, the detail layer, or the cart. */
const QUIET = () => {
  const els = [...document.querySelectorAll('#k-stage *')].filter((el) => el.style.transformOrigin);
  const anims = [...els.flatMap((el) => el.getAnimations()), ...(document.getElementById('k-detail')?.getAnimations({ subtree: true }) ?? [])];
  return anims.every((a) => a.playState !== 'running');
};

/** Wait until the detail for `id` is fully open: camera landed, panel settled, heading focused. */
async function waitOpen(page, id) {
  await page.waitForFunction(
    ([id, quiet]) => {
      const q = new Function(`return (${quiet})()`);
      return location.hash === `#/product/${id}` && document.querySelector('.dt')?.dataset.state === 'open' && q() && document.activeElement?.classList.contains('dt-name');
    },
    [id, QUIET.toString()],
    { timeout: 10000 },
  ).catch(() => {});
  await page.waitForTimeout(120);
}

/** Wait until the detail is closed and the unit is back at rest. */
async function waitClosed(page) {
  await page.waitForFunction(
    (quiet) => {
      const q = new Function(`return (${quiet})()`);
      return document.querySelector('.dt')?.dataset.open === 'false' && document.querySelector('.dt-panel')?.hidden && ![...document.querySelectorAll('#k-stage *')].some((el) => el.style.transformOrigin) && q();
    },
    QUIET.toString(),
    { timeout: 10000 },
  ).catch(() => {});
  await page.waitForTimeout(700); // the shell/B focus-mode fade and C's focus return settle
}

/** Rects of every element from the figure up to #k-stage, keyed by a path index (pre-open). */
async function preRects(page, id) {
  return page.evaluate((id) => {
    const fig = document.querySelector(`#k-stage .k-shoe[data-product-id="${id}"]`);
    const out = [];
    for (let el = fig; el && el.id !== 'k-stage'; el = el.parentElement) {
      const r = el.getBoundingClientRect();
      out.push({ left: r.left, top: r.top, width: r.width, height: r.height });
    }
    return out;
  }, id);
}

/** Install a rAF sampler of the unit's computed transform. */
async function startSampler(page) {
  await page.evaluate(() => {
    window.__samples = [];
    window.__sampling = true;
    const tick = (ts) => {
      if (!window.__sampling) return;
      const unit = [...document.querySelectorAll('#k-stage *')].find((el) => el.style.transformOrigin);
      const fig = unit?.querySelector('.k-shoe');
      window.__samples.push({
        t: ts ?? performance.now(),
        transform: unit ? getComputedStyle(unit).transform : null,
        fig: fig ? fig.getBoundingClientRect().toJSON() : null,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
async function stopSampler(page) {
  return page.evaluate(() => {
    window.__sampling = false;
    return window.__samples;
  });
}

function parseM(t) {
  if (!t || t === 'none') return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, none: true };
  const n = t.replace(/^matrix\(|\)$/g, '').split(',').map(Number);
  return { a: n[0], b: n[1], c: n[2], d: n[3], e: n[4], f: n[5] };
}

/**
 * Every sample: translate + uniform scale. Jump detector, independent of the frame rate:
 * per frame, the change in log(scale) and in on-screen centre (normalised by the total
 * range of the move) must stay under what the easing's steepest slope allows for the
 * elapsed time. `rate` = max progress per ms (camera ease: 4.88 / 1150 ms).
 */
function analyseSamples(samples, label, { expectMotion = true, rate = 4.88 / CAMERA_MS } = {}) {
  const ms = samples.filter((s) => s.transform !== null).map((s) => ({ ...parseM(s.transform), t: s.t, fig: s.fig }));
  const bad = ms.filter((m) => Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6 || Math.abs(m.a - m.d) > 1e-6 || m.a <= 0);
  check(`${label}: every frame is translate + uniform scale (a=d, b=c=0)`, bad.length === 0 && ms.length > 0, { frames: ms.length, bad: bad.slice(0, 3) });
  if (!expectMotion || ms.length < 3) return ms;
  const figs = ms.filter((m) => m.fig);
  const lw = figs.map((m) => Math.log(m.fig.width));
  const cx = figs.map((m) => m.fig.left + m.fig.width / 2);
  const cy = figs.map((m) => m.fig.top + m.fig.height / 2);
  const range = (a) => Math.max(...a) - Math.min(...a) || 1;
  const rS = range(lw);
  const rP = Math.max(range(cx), range(cy), range(figs.map((m) => m.fig.width)), 20);
  let worst = { excess: 0 };
  for (let i = 1; i < figs.length; i++) {
    const dt = figs[i].t - figs[i - 1].t;
    const allowed = rate * dt * 1.3 + 0.07;
    const dp = Math.max(Math.abs(lw[i] - lw[i - 1]) / rS, Math.hypot(cx[i] - cx[i - 1], cy[i] - cy[i - 1]) / rP);
    if (dp - allowed > worst.excess) worst = { excess: dp - allowed, dp: +dp.toFixed(3), allowed: +allowed.toFixed(3), dt: Math.round(dt), i };
  }
  check(`${label}: no jump between frames`, worst.excess === 0, { ...worst, frames: figs.length });
  if (worst.excess > 0) {
    const f = join(OUT, `samples-${label.replace(/[^a-z0-9]+/gi, '_')}.json`);
    writeFileSync(f, JSON.stringify(figs.map((m) => ({ t: Math.round(m.t), s: m.a, e: m.e, f: m.f, w: m.fig.width, l: m.fig.left })), null, 0));
  }
  return ms;
}

async function finalGeometry(page, id) {
  return page.evaluate((id) => {
    const fig = document.querySelector(`#k-stage .k-shoe[data-product-id="${id}"]`);
    const panel = document.querySelector('.dt-panel');
    const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'));
    const f = fig.getBoundingClientRect();
    const baseline = parseFloat(fig.style.getPropertyValue('--k-shoe-baseline')) / 100;
    const content = parseFloat(fig.style.getPropertyValue('--k-shoe-content')) / 100;
    const p = panel && !panel.hidden ? panel.getBoundingClientRect() : null;
    const img = fig.querySelector('img');
    return {
      fig: f.toJSON(),
      shoeWidth: f.width * content,
      shoeCx: f.left + f.width / 2,
      baselineY: f.top + baseline * f.height,
      panel: p ? p.toJSON() : null,
      nav,
      vw: document.documentElement.clientWidth,
      vh: innerHeight,
      currentSrc: img.currentSrc.split('/').pop(),
      // intrinsic width of the chosen file (naturalWidth is density-corrected for srcset)
      naturalWidth: Number(/-(\d+)\.webp$/.exec(img.currentSrc)?.[1] ?? 0),
      imgWidth: img.getBoundingClientRect().width,
      hash: location.hash,
      focusTag: document.activeElement?.tagName,
      focusClass: document.activeElement?.className,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
    };
  }, id);
}

async function stageState(page, id) {
  return page.evaluate((id) => {
    const fig = document.querySelector(`#k-stage .k-shoe[data-product-id="${id}"]`);
    const transformed = [...document.querySelectorAll('#k-stage *')].filter(
      (el) => el.style.transform || el.style.transformOrigin || el.style.willChange,
    );
    const out = [];
    for (let el = fig; el && el.id !== 'k-stage'; el = el.parentElement) {
      const r = el.getBoundingClientRect();
      out.push({ left: r.left, top: r.top, width: r.width, height: r.height });
    }
    // focus mode off: another product's link is hit-testable again
    const other = [...document.querySelectorAll('#k-stage a[href^="#/product/"]')].find((a) => !a.getAttribute('href').endsWith(`/${id}`));
    let otherClickable = null;
    if (other) {
      const r = other.querySelector('.k-shoe')?.getBoundingClientRect() ?? other.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x > 0 && y > 0 && x < innerWidth && y < innerHeight) {
        const hit = document.elementFromPoint(x, y);
        otherClickable = !!hit && other.contains(hit);
      }
    }
    return {
      rects: out,
      inlineTransformed: transformed.map((el) => `${el.tagName}.${el.className}`),
      computed: transformed.map((el) => getComputedStyle(el).transform),
      detailOpen: document.querySelector('.dt')?.dataset.open,
      panelHidden: document.querySelector('.dt-panel')?.hidden,
      otherClickable,
      hash: location.hash,
      active: document.activeElement ? `${document.activeElement.tagName} ${document.activeElement.getAttribute('href') ?? ''}` : null,
    };
  }, id);
}

function rectsClose(a, b, eps = 0.5) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((r, i) => ['left', 'top', 'width', 'height'].every((k) => Math.abs(r[k] - b[i][k]) <= eps));
}

/** Bring the unit into view the way a visitor would (inner scroller on small screens). */
async function revealProduct(page, id) {
  const link = page.locator(`#k-stage a[href="#/product/${id}"]`).first();
  await link.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(250);
}

async function clickProduct(page, id) {
  await revealProduct(page, id);
  await page.locator(`#k-stage a[href="#/product/${id}"]`).first().click();
}

const tag = (vp) => `${vp.w}x${vp.h}`;

// =====================================================================================
for (const vp of VIEWPORTS) {
  const T = tag(vp);
  const { ctx, page, log } = await newPage(vp);
  await page.goto(`${origin}/#/`);
  await waitForApp(page);
  await page.screenshot({ path: join(OUT, `${T}-00-home.png`) });
  const homeScrollH = await page.evaluate(() => document.documentElement.scrollHeight);
  if (homeScrollH > vp.h) report.problems.push({ label: `${T} home`, kind: 'foundation/showroom', items: [`document scrollHeight ${homeScrollH} > ${vp.h} before the detail opens`] });

  const finals = [];
  for (const [n, id] of OPEN_SET.entries()) {
    await revealProduct(page, id);
    const before = await preRects(page, id);
    await startSampler(page);
    await clickProduct(page, id);
    if (n === 0) {
      await page.waitForTimeout(380);
      await page.screenshot({ path: join(OUT, `${T}-01-${id}-move-a.png`) });
      await page.waitForTimeout(320);
      await page.screenshot({ path: join(OUT, `${T}-01-${id}-move-b.png`) });
    }
    await waitOpen(page, id);
    const samples = await stopSampler(page);
    analyseSamples(samples, `${T} open ${id}`);
    const g = await finalGeometry(page, id);
    finals.push({ id, ...g });
    if (n < 3 || vp.w === 1440) await page.screenshot({ path: join(OUT, `${T}-02-${id}-open.png`) });
    check(`${T} ${id}: hash`, g.hash === `#/product/${id}`, g.hash);
    check(`${T} ${id}: focus on panel heading`, g.focusTag === 'H1' && /dt-name/.test(g.focusClass), [g.focusTag, g.focusClass]);
    check(`${T} ${id}: shoe below the nav`, g.fig.top + 0.01 >= g.nav - g.fig.height * 0.05, { figTop: g.fig.top, nav: g.nav });
    if (g.panel) {
      if (vp.w >= 760) {
        check(`${T} ${id}: panel on the right`, Math.abs(g.panel.right - g.vw) < 1 && g.panel.left > g.vw * 0.5, g.panel);
        check(`${T} ${id}: shoe clear of panel`, g.fig.left + g.fig.width <= g.panel.left + 0.5, { figRight: g.fig.left + g.fig.width, panelLeft: g.panel.left });
      } else {
        check(`${T} ${id}: sheet below the shoe`, g.fig.top + g.fig.height <= g.panel.top + 0.5, { figBottom: g.fig.top + g.fig.height, sheetTop: g.panel.top });
      }
      check(`${T} ${id}: panel below nav`, g.panel.top >= g.nav - 0.5, g.panel.top);
    } else check(`${T} ${id}: panel visible`, false);
    check(`${T} ${id}: image never upscaled past its source (raster)`, g.naturalWidth === 0 || /svg/.test(g.currentSrc) || g.imgWidth <= g.naturalWidth * 1.01, { src: g.currentSrc, natural: g.naturalWidth, drawn: Math.round(g.imgWidth) });
    check(`${T} ${id}: no document overflow (none horizontally, none added vertically vs home)`, g.scrollW <= vp.w && g.scrollH <= homeScrollH, { w: g.scrollW, h: g.scrollH, homeH: homeScrollH });

    // back via the Back button (first), Escape (others), browser back (last)
    await startSampler(page);
    if (n === 0) await page.click('.dt-back');
    else if (n === OPEN_SET.length - 1) await page.goBack();
    else await page.keyboard.press('Escape');
    if (n === 0) {
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(OUT, `${T}-03-${id}-return.png`) });
    }
    await waitClosed(page);
    const back = await stopSampler(page);
    analyseSamples(back, `${T} back ${id}`);
    const st = await stageState(page, id);
    const how = n === 0 ? 'button' : n === OPEN_SET.length - 1 ? 'browser back' : 'Escape';
    check(`${T} back (${how}) ${id}: hash home`, st.hash === '#/' || st.hash === '', st.hash);
    check(`${T} back (${how}) ${id}: unit transform/origin/will-change cleared`, st.inlineTransformed.length === 0, st.inlineTransformed);
    check(`${T} back (${how}) ${id}: rest rects identical (0.5px)`, rectsClose(before, st.rects), { before: before[0], after: st.rects[0] });
    check(`${T} back (${how}) ${id}: detail layer off`, st.detailOpen === 'false' && st.panelHidden === true, st);
    check(`${T} back (${how}) ${id}: focus mode off (other units clickable)`, st.otherClickable !== false, st.otherClickable);
    check(`${T} back (${how}) ${id}: focus returned to the unit link`, st.active === `A #/product/${id}`, st.active);
  }
  const f0 = finals[0];
  for (const f of finals) {
    check(`${T}: same final size ${f.id} vs ${f0.id} (1px)`, Math.abs(f.shoeWidth - f0.shoeWidth) <= 1, [f.shoeWidth, f0.shoeWidth]);
    check(`${T}: same final position ${f.id} vs ${f0.id} (1px)`, Math.abs(f.shoeCx - f0.shoeCx) <= 1 && Math.abs(f.baselineY - f0.baselineY) <= 1, [f.shoeCx, f0.shoeCx, f.baselineY, f0.baselineY]);
  }
  report.checks.push({ label: `${T} final geometry`, ok: true, detail: finals.map((f) => ({ id: f.id, w: Math.round(f.shoeWidth), cx: Math.round(f.shoeCx), base: Math.round(f.baselineY), src: f.currentSrc })) });

  // ---------- keyboard containment + size radio group + add to cart
  {
    await clickProduct(page, 'thicket');
    await waitOpen(page, 'thicket');
    // tab through: never into the stage
    let leaked = null;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const a = document.activeElement;
        return { inStage: !!a && document.getElementById('k-stage').contains(a), desc: a ? `${a.tagName}.${a.className}` : null };
      });
      if (where.inStage) leaked = where.desc;
    }
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Shift+Tab');
      const inStage = await page.evaluate(() => document.getElementById('k-stage').contains(document.activeElement));
      if (inStage) leaked = 'shift-tab';
    }
    check(`${T}: keyboard never reaches the stage while open`, leaked === null, leaked);

    // add without a size -> inline prompt, focus on first available size
    await page.locator('.dt-add').click();
    const prompt = await page.evaluate(() => ({ hint: document.querySelector('.dt-hint')?.textContent, focus: document.activeElement?.className, badge: document.querySelector('.k-nav__badge')?.textContent }));
    check(`${T}: add without size prompts`, prompt.hint === 'Choose a size first.' && prompt.focus === 'dt-size__input' && prompt.badge === '0', prompt);
    await page.screenshot({ path: join(OUT, `${T}-04-size-prompt.png`) });
    // disabled size not selectable
    const disabledLabel = page.locator('.dt-size[data-available="false"]').first();
    if (await disabledLabel.count()) {
      await disabledLabel.click({ force: true });
      const anyChecked = await page.evaluate(() => [...document.querySelectorAll('.dt-size__input')].some((r) => r.checked));
      check(`${T}: unavailable size not selectable`, !anyChecked);
    }
    // keyboard: arrows move between available sizes
    await page.locator('.dt-size__input:not([disabled])').first().focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const kb = await page.evaluate(() => ({ checked: document.querySelector('.dt-size__input:checked')?.value, role: document.querySelector('.dt-sizes')?.getAttribute('role') }));
    check(`${T}: arrow keys select sizes`, !!kb.checked && kb.role === 'radiogroup', kb);
    await page.locator('.dt-add').click();
    await page.waitForTimeout(400);
    const added = await page.evaluate(() => ({ badge: document.querySelector('.k-nav__badge')?.textContent, feedback: document.querySelector('.dt-feedback')?.textContent, live: document.getElementById('k-live')?.textContent }));
    check(`${T}: add to cart updates the nav badge`, added.badge === '1', added);
    check(`${T}: add confirmation + announcement`, /is in your cart/.test(added.feedback ?? '') && /added to cart/.test(added.live ?? ''), added);
    await page.screenshot({ path: join(OUT, `${T}-05-added.png`) });

    // cart drawer from the panel's "View cart"
    await page.locator('.dt-viewcart').click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, `${T}-06-cart.png`) });
    const drawer = await page.evaluate(() => ({
      state: document.querySelector('.ct')?.dataset.state,
      inPanel: document.querySelector('.ct-panel')?.contains(document.activeElement),
      role: document.querySelector('.ct-panel')?.getAttribute('role'),
      modal: document.querySelector('.ct-panel')?.getAttribute('aria-modal'),
      expanded: document.querySelector('.k-nav__cart')?.getAttribute('aria-expanded'),
      lines: document.querySelectorAll('.ct-line').length,
    }));
    check(`${T}: cart drawer opens as a modal dialog with focus inside`, drawer.state === 'open' && drawer.inPanel && drawer.role === 'dialog' && drawer.modal === 'true' && drawer.expanded === 'true' && drawer.lines === 1, drawer);
    let escaped = false;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
      if (!(await page.evaluate(() => document.querySelector('.ct-panel').contains(document.activeElement)))) escaped = true;
    }
    check(`${T}: cart focus trap`, !escaped);
    // qty + / -
    await page.locator('.ct-step').nth(1).click();
    await page.locator('.ct-step').nth(1).click();
    let q = await page.evaluate(() => ({ qty: document.querySelector('.ct-qty__value')?.textContent, badge: document.querySelector('.k-nav__badge')?.textContent, focusStep: document.activeElement?.classList.contains('ct-step') }));
    check(`${T}: cart + increments (focus kept)`, q.qty === '3' && q.badge === '3' && q.focusStep, q);
    await page.locator('.ct-step').nth(0).click();
    q = await page.evaluate(() => ({ qty: document.querySelector('.ct-qty__value')?.textContent, badge: document.querySelector('.k-nav__badge')?.textContent }));
    check(`${T}: cart - decrements`, q.qty === '2' && q.badge === '2', q);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    const afterEsc = await page.evaluate(() => ({ state: document.querySelector('.ct')?.dataset.state, hidden: document.querySelector('.ct')?.hidden, focus: document.activeElement?.className, hash: location.hash, detail: document.querySelector('.dt')?.dataset.open }));
    check(`${T}: Escape closes only the cart, focus back to opener`, afterEsc.state === 'closed' && afterEsc.hidden && afterEsc.focus === 'dt-viewcart' && afterEsc.hash === '#/product/thicket' && afterEsc.detail === 'true', afterEsc);
    await page.keyboard.press('Escape');
    await waitClosed(page);
  }

  // ---------- product A -> product B (hash change while open), then home
  {
    await clickProduct(page, 'loam');
    await waitOpen(page, 'loam');
    await startSampler(page);
    await page.evaluate(() => (location.hash = '#/product/hush'));
    await waitOpen(page, 'hush');
    const s = await stopSampler(page);
    analyseSamples(s, `${T} A->B`, { expectMotion: false });
    const g = await finalGeometry(page, 'hush');
    const st = await stageState(page, 'loam');
    check(`${T} A->B: B open, A cleared`, g.hash === '#/product/hush' && !st.inlineTransformed.some((x) => /loam/.test(x)) && st.inlineTransformed.length === 1, st.inlineTransformed);
    await page.screenshot({ path: join(OUT, `${T}-07-a-to-b.png`) });
    // Escape = history back: B -> A (loam), then A -> home
    await page.keyboard.press('Escape');
    await waitOpen(page, 'loam');
    const g2 = await finalGeometry(page, 'loam');
    const st2 = await stageState(page, 'hush');
    check(`${T} B->A via Escape (history back)`, g2.hash === '#/product/loam' && st2.inlineTransformed.length === 1, { hash: g2.hash, t: st2.inlineTransformed });
    await page.keyboard.press('Escape');
    await waitClosed(page);
  }

  // ---------- interrupt mid-zoom (Back at 45%), then rapid double navigation
  {
    await revealProduct(page, 'drift');
    const before = await preRects(page, 'drift');
    await startSampler(page);
    await clickProduct(page, 'drift');
    await page.waitForTimeout(CAMERA_MS * 0.45);
    await page.keyboard.press('Escape');
    await waitClosed(page);
    const s = await stopSampler(page);
    analyseSamples(s, `${T} interrupt mid-zoom`, { rate: 3.08 / (CAMERA_MS * 0.4) });
    const st = await stageState(page, 'drift');
    check(`${T} interrupt: back at rest, cleared`, st.inlineTransformed.length === 0 && rectsClose(before, st.rects) && st.detailOpen === 'false', st);

    await startSampler(page);
    await clickProduct(page, 'canyon');
    await page.waitForTimeout(220);
    await page.evaluate(() => (location.hash = '#/product/trace'));
    await page.waitForTimeout(160);
    await page.evaluate(() => (location.hash = '#/'));
    await waitClosed(page);
    const s2 = await stopSampler(page);
    analyseSamples(s2, `${T} rapid navigation`, { expectMotion: false });
    const st2 = await stageState(page, 'canyon');
    check(`${T} rapid navigation: nothing stuck transformed, focus mode off`, st2.inlineTransformed.length === 0 && st2.detailOpen === 'false' && st2.otherClickable !== false && (st2.hash === '#/' || st2.hash === ''), st2);
  }

  check(`${T}: CLS 0`, (await page.evaluate(() => window.__cls)) === 0);
  check(`${T}: no console errors`, log.errors.length === 0, log.errors);
  check(`${T}: no external requests`, log.external.length === 0, log.external);
  await ctx.close();
}

// =====================================================================================
// Flows checked once per layout family: direct load, collections round trip, product -> about,
// reload persistence, cart remove/empty/scrim, reduced motion.
for (const vp of VIEWPORTS.filter((v) => [1440, 390].includes(v.w) || VIEWPORTS.length === 1)) {
  const T = tag(vp);
  // direct load
  {
    const { ctx, page, log } = await newPage(vp);
    await page.goto(`${origin}/#/product/monolith`);
    await waitForApp(page);
    await waitOpen(page, 'monolith');
    const g = await finalGeometry(page, 'monolith');
    await page.screenshot({ path: join(OUT, `${T}-10-direct.png`) });
    check(`${T} direct load: open with panel + heading focus`, g.hash === '#/product/monolith' && !!g.panel && g.focusTag === 'H1', g);
    const st = await stageState(page, 'monolith');
    check(`${T} direct load: unit transformed`, st.inlineTransformed.length === 1, st.inlineTransformed);
    await page.locator('.dt-back').click();
    await waitClosed(page);
    const st2 = await stageState(page, 'monolith');
    check(`${T} direct load -> back: home, cleared`, (st2.hash === '#/' || st2.hash === '') && st2.inlineTransformed.length === 0 && st2.detailOpen === 'false', st2);
    check(`${T} direct load: no console errors`, log.errors.length === 0, log.errors);
    await ctx.close();
  }
  // collections -> product -> back, then product -> about
  {
    const { ctx, page, log } = await newPage(vp);
    await page.goto(`${origin}/#/collections`);
    await waitForApp(page);
    await page.waitForTimeout(600);
    const link = page.locator('#k-page-collections a[href="#/product/canyon"]').first();
    if (await link.count()) {
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await waitOpen(page, 'canyon');
      const g = await finalGeometry(page, 'canyon');
      await page.screenshot({ path: join(OUT, `${T}-11-from-collections.png`) });
      const backText = await page.locator('.dt-back').textContent();
      check(`${T} collections -> product opens`, g.hash === '#/product/canyon' && !!g.panel, g.hash);
      check(`${T} collections -> product: back label`, backText === 'Back to collections', backText);
      await page.locator('.dt-back').click();
      await waitClosed(page);
      const st = await stageState(page, 'canyon');
      check(`${T} product -> back returns to collections`, st.hash === '#/collections' && st.inlineTransformed.length === 0 && st.detailOpen === 'false', st);
    } else check(`${T} collections page has product links`, false);
    // product -> about
    await page.goto(`${origin}/#/`);
    await page.waitForTimeout(900);
    await clickProduct(page, 'signal');
    await waitOpen(page, 'signal');
    await page.evaluate(() => (location.hash = '#/about'));
    await waitClosed(page);
    const st = await stageState(page, 'signal');
    check(`${T} product -> about: zoom reversed and cleared`, st.hash === '#/about' && st.inlineTransformed.length === 0 && st.detailOpen === 'false', st);
    check(`${T} collections/about flows: no console errors`, log.errors.length === 0, log.errors);
    await ctx.close();
  }
  // persistence + cart remove + empty state + scrim close
  {
    const { ctx, page, log } = await newPage(vp);
    await page.goto(`${origin}/#/product/loam`);
    await waitForApp(page);
    await waitOpen(page, 'loam');
    for (const eu of ['40', '42']) {
      await page.locator(`.dt-size__input[value="${eu}"]`).check({ force: true });
      await page.locator('.dt-add').click();
    }
    await page.reload();
    await waitForApp(page);
    await waitOpen(page, 'loam');
    const badge = await page.locator('.k-nav__badge').textContent();
    check(`${T} reload keeps the cart (localStorage)`, badge === '2', badge);
    await page.locator('.k-nav__cart').click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, `${T}-12-cart-two.png`) });
    await page.locator('.ct-remove').first().click();
    let st = await page.evaluate(() => ({ lines: document.querySelectorAll('.ct-line').length, focus: document.activeElement?.className, badge: document.querySelector('.k-nav__badge')?.textContent }));
    check(`${T} remove a line, focus to next Remove`, st.lines === 1 && st.focus === 'ct-remove' && st.badge === '1', st);
    await page.locator('.ct-remove').first().click();
    st = await page.evaluate(() => ({ empty: !document.querySelector('.ct-empty').hidden, focus: document.activeElement?.className, badge: document.querySelector('.k-nav__badge')?.textContent }));
    check(`${T} empty state`, st.empty && st.focus === 'ct-title' && st.badge === '0', st);
    await page.screenshot({ path: join(OUT, `${T}-13-cart-empty.png`) });
    await page.mouse.click(20, vp.h / 2); // scrim (left of the drawer; drawer is full width < 440px)
    await page.waitForTimeout(600);
    const closed = await page.evaluate(() => ({ state: document.querySelector('.ct')?.dataset.state, focus: document.activeElement?.className }));
    if (vp.w > 480) check(`${T} scrim click closes, focus to nav cart button`, closed.state === 'closed' && /k-nav__cart/.test(closed.focus), closed);
    else {
      await page.locator('.ct-close').click();
      await page.waitForTimeout(600);
      const c2 = await page.evaluate(() => ({ state: document.querySelector('.ct')?.dataset.state, focus: document.activeElement?.className }));
      check(`${T} close button closes, focus to nav cart button`, c2.state === 'closed' && /k-nav__cart/.test(c2.focus), c2);
    }
    check(`${T} cart flows: no console errors`, log.errors.length === 0, log.errors);
    await ctx.close();
  }
  // reduced motion
  {
    const { ctx, page, log } = await newPage(vp, { reducedMotion: 'reduce' });
    await page.goto(`${origin}/#/`);
    await waitForApp(page);
    await startSampler(page);
    await clickProduct(page, 'ledger');
    await waitOpen(page, 'ledger');
    const s = await stopSampler(page);
    const ms = analyseSamples(s, `${T} reduced motion open`, { expectMotion: false });
    const distinct = new Set(ms.map((m) => `${m.a.toFixed(3)} ${m.e.toFixed(1)} ${m.f.toFixed(1)}`));
    check(`${T} reduced motion: no camera movement (only rest and end states)`, distinct.size <= 2, [...distinct]);
    await page.screenshot({ path: join(OUT, `${T}-14-reduced.png`) });
    await page.keyboard.press('Escape');
    await waitClosed(page);
    const st = await stageState(page, 'ledger');
    check(`${T} reduced motion: back cleared`, st.inlineTransformed.length === 0 && st.detailOpen === 'false', st);
    check(`${T} reduced motion: no console errors`, log.errors.length === 0, log.errors);
    await ctx.close();
  }
}

// High-DPR sharpness: the source picked by the foundation's sizes covers the zoomed size.
{
  const { ctx, page } = await newPage({ w: 1440, h: 900 }, { dpr: 2 });
  await page.goto(`${origin}/#/`);
  await waitForApp(page);
  await clickProduct(page, 'loam');
  await waitOpen(page, 'loam');
  const g = await finalGeometry(page, 'loam');
  check('1440x900@2x: zoomed photo drawn at <= 1:1 device pixels', g.imgWidth * 2 <= g.naturalWidth * 1.02, { src: g.currentSrc, natural: g.naturalWidth, drawnCss: Math.round(g.imgWidth) });
  await page.screenshot({ path: join(OUT, `1440x900@2x-loam.png`) });
  await ctx.close();
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
for (const p of report.problems) console.log(`NOTE ${p.label} [${p.kind}] ${p.items.join('; ')}`);
const total = report.checks.length;
console.log(`\n${total - failures}/${total} checks passed. Screenshots + report: ${OUT}`);
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
