// Browser verification of the showroom (Package B).
// Run: npm run build && NODE_PATH="$(npm root -g)" node tests/showroom/verify-showroom.mjs
// Env: SR_OUT (screenshot dir, default <tmp>/kiccle-showroom), SR_ONLY (comma list of viewport names).
// Serves the project on port 4301 with scripts/serve.mjs.

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from '../../scripts/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = process.env.SR_OUT ?? join(tmpdir(), 'kiccle-showroom');
mkdirSync(OUT, { recursive: true });
const PORT = 4301;
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1280x640', width: 1280, height: 640 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x740', width: 360, height: 740 },
].filter((v) => !process.env.SR_ONLY || process.env.SR_ONLY.split(',').includes(v.name));

const server = await startServer(PORT, '127.0.0.1');
const origin = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch();
const problems = [];
const notes = [];
const results = [];
const fail = (label, msg) => problems.push(`${label}: ${msg}`);

function watch(page, label) {
  const log = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.push(`console ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => log.push(`pageerror: ${e}`));
  page.on('requestfailed', (r) => log.push(`failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) log.push(`HTTP ${r.status()} ${r.url()}`);
  });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) log.push(`external: ${u}`);
  });
  return () => {
    for (const l of log) fail(label, l);
  };
}

async function boot(page, hash = '#/') {
  await page.addInitScript(() => {
    window.__cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  });
  await page.goto(`${origin}/${hash}`);
  await page.waitForFunction(() => !document.getElementById('k-intro') && !document.getElementById('k-app').inert, null, { timeout: 20000 });
}

/** Expose the real StageAPI instance to the page (test-only rewrite of the served main.js). */
async function exposeStage(page) {
  await page.route('**/dist/main.js', async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace('const showroom = createShowroom(core);', 'const showroom = (window.__stage = createShowroom(core));');
    if (!body.includes('window.__stage')) throw new Error('could not expose stage');
    await route.fulfill({ response: res, body });
  });
}

for (const vp of VIEWPORTS) {
  const label = vp.name;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const done = watch(page, label);
  await exposeStage(page);
  await boot(page);
  await page.waitForTimeout(300);
  const shot = (n) => page.screenshot({ path: join(OUT, `${label}-${n}.png`) });

  // Resting + several sweep frames.
  await shot('a-rest');
  for (let i = 1; i <= 3; i++) {
    await page.waitForTimeout(1500);
    await shot(`b-sweep${i}`);
  }

  // Geometry checks.
  const geo = await page.evaluate(() => {
    const stage = document.getElementById('k-stage');
    const slots = [...stage.querySelectorAll('.sr-slot')];
    const figs = [...stage.querySelectorAll('.k-shoe')];
    const rects = slots.map((s) => s.getBoundingClientRect().toJSON());
    const figW = figs.map((f) => f.getBoundingClientRect().width);
    const caption = stage.querySelector('.sr-caption')?.getBoundingClientRect().toJSON();
    const nav = document.getElementById('k-nav').getBoundingClientRect().toJSON();
    const order = [...stage.querySelectorAll('a.sr-unit')].map((a) => a.getAttribute('href'));
    return {
      mode: stage.dataset.mode,
      docOverflowX: document.documentElement.scrollWidth - innerWidth,
      docOverflowY: document.documentElement.scrollHeight - innerHeight,
      overflowers: [...document.querySelectorAll('body *')].filter((el) => {
        const r = el.getBoundingClientRect();
        return (r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5) && getComputedStyle(el).position !== 'fixed' && !el.closest('#k-stage');
      }).map((el) => el.id || el.className),
      stageOverflow: (() => { const st = document.getElementById('k-stage'); return [st.scrollWidth - st.clientWidth, st.scrollHeight - st.clientHeight]; })(),
      rects,
      figW,
      caption,
      nav,
      order,
      cls: window.__cls,
      scroller: (() => {
        const s = stage.querySelector('.sr-scroller');
        return { sw: s.scrollWidth, cw: s.clientWidth, sh: s.scrollHeight, ch: s.clientHeight };
      })(),
    };
  });
  if (geo.docOverflowX > 0) fail(label, `document overflow x ${geo.docOverflowX}`);
  if (geo.docOverflowY > 0) {
    const foreign = geo.overflowers.every((c) => String(c).includes('k-live'));
    if (foreign) notes.push(`${label}: document scrollHeight +${geo.docOverflowY}px from A's .k-live (not showroom)`);
    else fail(label, `document overflow y ${geo.docOverflowY} (${geo.overflowers})`);
  }
  if (geo.stageOverflow[0] > 0 || geo.stageOverflow[1] > 0) fail(label, `#k-stage scroll overflow ${geo.stageOverflow}`);
  if (geo.cls > 0) fail(label, `CLS ${geo.cls}`);
  const spread = Math.max(...geo.figW) - Math.min(...geo.figW);
  if (spread > 0.01) fail(label, `figure widths differ by ${spread}`);
  for (const [i, r] of geo.rects.entries()) {
    if (r.top < geo.nav.bottom) fail(label, `slot ${i} under nav (${r.top} < ${geo.nav.bottom})`);
    if (r.bottom > vp.height) fail(label, `slot ${i} below viewport (${r.bottom})`);
    if (geo.caption && geo.mode === 'wall') {
      const c = geo.caption;
      const overlap = !(c.right <= r.left || c.left >= r.right || c.bottom <= r.top || c.top >= r.bottom);
      if (overlap) fail(label, `caption overlaps slot ${i}`);
    }
  }
  if (geo.caption) {
    const lowest = Math.max(...geo.rects.map((r) => r.bottom));
    if (geo.caption.top < lowest) fail(label, `caption top ${geo.caption.top} above row 2 bottom ${lowest}`);
  }
  if (geo.scroller.sh > geo.scroller.ch + 1) fail(label, `scroller vertical overflow ${geo.scroller.sh} > ${geo.scroller.ch}`);
  const row0 = geo.rects.slice(0, 5).map((r) => r.top);
  const row1 = geo.rects.slice(5).map((r) => r.top);
  if (Math.max(...row0) - Math.min(...row0) > 0.5 || Math.max(...row1) - Math.min(...row1) > 0.5) fail(label, 'rows not aligned');
  const expectedOrder = ['loam', 'thicket', 'signal', 'drift', 'ledger', 'monolith', 'canyon', 'hush', 'trace', 'strata'].map((id) => `#/product/${id}`);
  if (JSON.stringify(geo.order) !== JSON.stringify(expectedOrder)) fail(label, `unit order ${geo.order}`);

  // Hover (desktop-like contexts only hover with a fine pointer; Playwright's default is fine pointer).
  const hoverIdx = geo.mode === 'wall' ? 2 : 0;
  const hr = geo.rects[hoverIdx];
  await page.mouse.move(hr.left + hr.width / 2, hr.top + hr.height * 0.35);
  await page.waitForTimeout(800);
  await shot('c-hover');
  const ledOn = await page.evaluate((i) => getComputedStyle(document.querySelectorAll('.sr-plinth__led-lit')[i]).opacity, hoverIdx);
  if (Number(ledOn) < 0.99) fail(label, `hover LED opacity ${ledOn}`);
  await page.mouse.move(2, vp.height - 2);
  await page.waitForTimeout(1000);
  const ledOff = await page.evaluate((i) => getComputedStyle(document.querySelectorAll('.sr-plinth__led-lit')[i]).opacity, hoverIdx);
  if (Number(ledOff) > 0.01) fail(label, `LED did not fade out: ${ledOff}`);

  // Keyboard: first Tab stops inside the stage go 01, 02, ... and light the LED.
  await page.evaluate(() => document.querySelector('#k-stage a.sr-unit').focus());
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const kb = [];
  for (let i = 0; i < 3; i++) {
    kb.push(await page.evaluate(() => document.activeElement?.getAttribute('data-product-id')));
    await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(800);
  await shot('d-keyboard');
  if (kb.join() !== 'loam,thicket,signal') fail(label, `keyboard order ${kb}`);
  await page.evaluate(() => document.activeElement?.blur());

  // Stage API: rest rect, shoe rect, focus mode with a ~3x transform as C would apply.
  const api = await page.evaluate(async () => {
    const st = window.__stage;
    const out = {};
    await st.ready;
    const id = 'signal';
    const unit = st.getUnit(id);
    out.sameUnit = unit === st.getUnit(id) && unit === document.querySelector('[data-product-id="signal"].sr-unit');
    out.figInUnit = unit.contains(st.getFigure(id));
    out.unknown = st.getUnit('nope') === null && st.getRestRect('nope') === null;
    const rest0 = st.getRestRect(id).toJSON();
    const shoe0 = st.getShoeRect(id).toJSON();
    // actual painted shoe box from the image + visible box: compare with figure rect maths
    const figR = st.getFigure(id).getBoundingClientRect();
    out.figTopMatches = Math.abs(figR.top - rest0.top) < 0.5 && Math.abs(figR.left - rest0.left) < 0.5;
    out.shoeInsideFig = shoe0.left >= figR.left - 0.5 && shoe0.right <= figR.right + 0.5 && shoe0.bottom <= figR.bottom + 0.5;
    const snap0 = st.snapshot();
    const t0 = performance.now();
    await st.setFocus(id);
    out.focusMs = performance.now() - t0;
    const t1 = performance.now();
    await st.setFocus(id); // idempotent
    out.idempotentMs = performance.now() - t1;
    out.focusClasses = st.root.classList.contains('is-focus-mode') && unit.classList.contains('is-focused');
    out.quietPE = getComputedStyle(st.getUnit('loam')).pointerEvents;
    out.focusLed = getComputedStyle(unit.querySelector('.sr-plinth__led-lit')).opacity;
    // C-like camera transform
    const target = { x: innerWidth * 0.08, y: innerHeight * 0.22, w: innerWidth * (innerWidth >= 760 ? 0.55 : 0.84) };
    const s = target.w / shoe0.width;
    unit.style.transformOrigin = '0 0';
    const tx = target.x - (rest0.left + (shoe0.left - rest0.left) * s);
    const ty = target.y - (rest0.top + (shoe0.top - rest0.top) * s);
    unit.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    out.scale = s;
    const rest1 = st.getRestRect(id).toJSON();
    const shoe1 = st.getShoeRect(id).toJSON();
    out.restStable = JSON.stringify(rest0) === JSON.stringify(rest1);
    out.shoeStable = JSON.stringify(shoe0) === JSON.stringify(shoe1);
    out.unitTransformedRect = unit.getBoundingClientRect().toJSON();
    // ancestors: none transformed, none clipping except the full-viewport scroller
    const anc = [];
    for (let el = unit.parentElement; el && el !== st.root; el = el.parentElement) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      anc.push({ cls: el.className, transform: cs.transform, overflow: cs.overflow, clip: cs.clipPath, mask: cs.maskImage, contain: cs.contain, covers: r.left <= 0.5 && r.top <= 0.5 && r.right >= innerWidth - 0.5 && r.bottom >= innerHeight - 0.5 });
    }
    out.ancestors = anc;
    out.snapFocused = st.snapshot().focusedId;
    out.snap0 = snap0;
    return out;
  });
  await page.waitForTimeout(400);
  await shot('e-focus-zoom');
  const labelOpacity = await page.evaluate(() => getComputedStyle(window.__stage.getUnit('signal').querySelector('.sr-unit__label')).opacity);
  if (Number(labelOpacity) > 0.01) fail(label, `focused label visible ${labelOpacity}`);
  for (const k of ['sameUnit', 'figInUnit', 'unknown', 'figTopMatches', 'shoeInsideFig', 'focusClasses', 'restStable', 'shoeStable']) {
    if (!api[k]) fail(label, `api check ${k} failed`);
  }
  if (api.quietPE !== 'none') fail(label, `quiet unit pointer-events ${api.quietPE}`);
  if (Number(api.focusLed) < 0.99) fail(label, `focused LED ${api.focusLed}`);
  if (api.idempotentMs > 50) fail(label, `setFocus not idempotent-fast ${api.idempotentMs}`);
  if (api.focusMs > 1000) fail(label, `setFocus slow ${api.focusMs}`);
  for (const a of api.ancestors) {
    if (a.transform !== 'none') fail(label, `ancestor ${a.cls} transformed`);
    if (a.clip !== 'none' || (a.mask && a.mask !== 'none') || /paint|strict|content/.test(a.contain)) fail(label, `ancestor ${a.cls} clips (clip/mask/contain)`);
    if (a.overflow !== 'visible' && !a.covers) fail(label, `ancestor ${a.cls} overflow ${a.overflow} without covering viewport`);
  }

  // Reverse: clear transform, unfocus, restore -> snapshot round trip.
  const rt = await page.evaluate(async () => {
    const st = window.__stage;
    const unit = st.getUnit('signal');
    const litIdx = () => [...st.root.querySelectorAll('.sr-bay')].findIndex((b) => b.hasAttribute('data-lit'));
    const fa = litIdx();
    await new Promise((r) => setTimeout(r, 2600));
    const focusPaused = fa === litIdx();
    const before = st.snapshot();
    unit.style.transform = '';
    unit.style.transformOrigin = '';
    await st.setFocus(null);
    const sc = st.root.querySelector('.sr-scroller');
    // a real resting position: column 3 centred (snap-aligned)
    st.getUnit('signal').scrollIntoView({ inline: 'center', block: 'nearest' });
    await new Promise((r) => setTimeout(r, 300));
    const mid = st.snapshot();
    sc.scrollLeft = 0;
    await new Promise((r) => setTimeout(r, 100));
    st.restore(mid);
    const after1 = st.snapshot();
    const after2 = st.snapshot();
    st.restore(before); // focus back on
    await new Promise((r) => setTimeout(r, 50));
    const after3 = st.snapshot();
    await st.setFocus(null);
    const pe = getComputedStyle(st.getUnit('loam')).pointerEvents;
    return { before, mid, after1, after2, after3, pe, focusPaused, focusMode: st.root.classList.contains('is-focus-mode') };
  });
  if (JSON.stringify(rt.after2) !== JSON.stringify(rt.mid)) fail(label, `restore round trip ${JSON.stringify(rt.mid)} vs ${JSON.stringify(rt.after2)}`);
  if (!rt.focusPaused) fail(label, 'sweep advanced during focus mode');
  if (rt.after3.focusedId !== 'signal') fail(label, 'restore did not re-apply focus');
  if (rt.pe !== 'auto' || rt.focusMode) fail(label, 'unfocus did not restore pointer events');
  if (geo.mode === 'pan' && (rt.mid.scrollLeft <= 0 || Math.abs(rt.after1.scrollLeft - rt.mid.scrollLeft) > 1)) fail(label, `restore scrollLeft ${rt.after1.scrollLeft} vs ${rt.mid.scrollLeft}`);

  // Pause semantics: hidden stage / API pause stops the sweep.
  const pause = await page.evaluate(async () => {
    const st = window.__stage;
    const litNow = () => [...st.root.querySelectorAll('.sr-bay')].findIndex((b) => b.hasAttribute('data-lit'));
    st.pauseSpotlights();
    const a = litNow();
    await new Promise((r) => setTimeout(r, 2600));
    const b = litNow();
    st.resumeSpotlights();
    await new Promise((r) => setTimeout(r, 2600));
    const c = litNow();
    return { a, b, c };
  });
  if (pause.a !== pause.b) fail(label, `sweep moved while paused ${JSON.stringify(pause)}`);
  if (pause.c === pause.b) fail(label, `sweep did not resume ${JSON.stringify(pause)}`);

  // Resize: pan mode keeps the centred column; layout stays inside the viewport.
  if (geo.mode === 'pan') {
    await page.evaluate(async () => {
      window.__stage.getUnit('signal').scrollIntoView({ inline: 'center', block: 'nearest' });
      await new Promise((r) => setTimeout(r, 300));
    });
    await page.setViewportSize({ width: vp.width + 40, height: vp.height });
    await page.waitForTimeout(300);
    const centred = await page.evaluate(() => {
      const r = window.__stage.getRestRect('signal');
      return Math.abs(r.left + r.width / 2 - innerWidth / 2);
    });
    if (centred > 2) fail(label, `column lost on resize (${centred}px off centre)`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
  }

  results.push({ label, mode: geo.mode, figW: geo.figW[0], rects: geo.rects.length });
  await ctx.close();
  done();
}

// Reduced motion: no sweep, calm even light, still hover LED (opacity fade only).
for (const vp of VIEWPORTS.filter((v) => ['1440x900', '390x844'].includes(v.name))) {
  const label = `${vp.name}-reduced`;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const done = watch(page, label);
  await exposeStage(page);
  await boot(page);
  const a = await page.evaluate(() => ({ light: window.__stage.root.dataset.light, lit: document.querySelectorAll('#k-stage [data-lit]').length }));
  await page.waitForTimeout(4000);
  const b = await page.evaluate(() => document.querySelectorAll('#k-stage [data-lit]').length);
  if (a.light !== 'even' || a.lit !== 0 || b !== 0) fail(label, `reduced lighting not static/even ${JSON.stringify(a)} ${b}`);
  await page.screenshot({ path: join(OUT, `${label}.png`) });
  const cls = await page.evaluate(() => window.__cls);
  if (cls > 0) fail(label, `CLS ${cls}`);
  await ctx.close();
  done();
}

// Hidden tab pauses the sweep.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const done = watch(page, 'visibility');
  await exposeStage(page);
  await boot(page);
  const r = await page.evaluate(async () => {
    const lit = () => [...document.querySelectorAll('.sr-bay')].findIndex((b) => b.hasAttribute('data-lit'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    const a = lit();
    await new Promise((res) => setTimeout(res, 2600));
    const b = lit();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((res) => setTimeout(res, 1200));
    return { a, b, c: lit() };
  });
  if (r.a !== r.b || r.c === r.b) fail('visibility', `tab pause/resume ${JSON.stringify(r)}`);
  // Leaving the stage (to a page) pauses; entering resumes. Also checks stage.enter promptness via route:settled timing.
  const t0 = Date.now();
  await page.evaluate(() => { location.hash = '#/about'; });
  await page.waitForFunction(() => document.body.dataset.surface === 'page');
  const lv = await page.evaluate(async () => {
    const lit = () => [...document.querySelectorAll('.sr-bay')].findIndex((b) => b.hasAttribute('data-lit'));
    const a = lit();
    await new Promise((res) => setTimeout(res, 2600));
    return { a, b: lit() };
  });
  if (lv.a !== lv.b) fail('visibility', `sweep ran while stage hidden ${JSON.stringify(lv)}`);
  const t1 = Date.now();
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForFunction(() => document.body.dataset.surface === 'stage' && document.getElementById('k-stage').dataset.surfaceState === 'in');
  const enterMs = Date.now() - t1;
  if (enterMs > 1500) fail('visibility', `stage enter slow ${enterMs}ms`);
  void t0;
  await ctx.close();
  done();
}

await browser.close();
server.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ results, problems, notes }, null, 2));
if (notes.length) console.log('NOTES:\n' + [...new Set(notes)].join('\n'));
console.log(JSON.stringify(results, null, 1));
if (problems.length) {
  console.log('PROBLEMS:\n' + problems.join('\n'));
  process.exitCode = 1;
} else console.log('OK: no problems');
console.log('screenshots in', OUT);
