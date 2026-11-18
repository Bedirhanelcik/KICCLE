// Browser verification for Package D (About, FAQ, Collections).
// Run after `npm run build`:  NODE_PATH="$(npm root -g)" node tests/pages/verify-pages.mjs
// Screenshots + report.json go to $PAGES_OUT (default <tmp>/kiccle-pages).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from '../../scripts/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = process.env.PAGES_OUT ?? join(tmpdir(), 'kiccle-pages');
mkdirSync(OUT, { recursive: true });
const PORT = 4303;
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
  { name: '360', width: 360, height: 740 },
].filter((v) => !process.env.ONLY_VP || process.env.ONLY_VP.split(',').includes(v.name));
const PAGES = ['about', 'faq', 'collections'];

const server = await startServer(PORT, '127.0.0.1');
const origin = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch();
const problems = [];
const results = [];
const fail = (label, msg) => problems.push(`${label}: ${msg}`);

const CLS_INIT = () => {
  window.__cls = 0;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
};

function watch(page, label) {
  const log = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.push(`console ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => log.push(`pageerror: ${e}`));
  page.on('requestfailed', (r) => log.push(`failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => r.status() >= 400 && log.push(`HTTP ${r.status()} ${r.url()}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) log.push(`external: ${u}`);
  });
  return () => log.forEach((l) => fail(label, l));
}

async function waitForApp(page) {
  await page.waitForFunction(() => !document.getElementById('k-intro') && !document.getElementById('k-app').inert, null, { timeout: 15000 });
  await page.waitForTimeout(400);
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.round(innerHeight * 0.6);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 160));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 400));
  });
  await page.waitForTimeout(2200); // let reveals finish
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

async function pageFacts(page, name) {
  return page.evaluate((name) => {
    const root = document.getElementById(`k-page-${name}`);
    // what a visitor (or a screen reader) can perceive: rendered, visible, not aria-hidden
    const visibleH1 = [...document.querySelectorAll('h1')].filter(
      (h) => h.getClientRects().length > 0 && !h.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(h).visibility === 'visible',
    );
    const pageH1 = root.querySelectorAll('h1').length;
    const widths = (sel) => [...root.querySelectorAll(sel)].map((f) => f.getBoundingClientRect().width);
    const unrevealed = [...root.querySelectorAll('[data-ab-reveal]:not(.is-in), .cl-plate:not(.is-in)')].length;
    return {
      hash: location.hash,
      title: document.title,
      h1: visibleH1.map((h) => h.textContent.trim()),
      pageH1,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      cls: window.__cls ?? null,
      plateWidths: widths('.cl-plate .k-shoe'),
      pairWidths: widths('.ab-pair .k-shoe'),
      unrevealed,
      faqCurrent: root.querySelector('.fq-index__btn[aria-current="true"]')?.dataset.fqTarget ?? null,
      footer: !document.getElementById('k-footer').hidden && document.getElementById('k-footer').getClientRects().length > 0,
      imgs: [...root.querySelectorAll('img')].map((i) => ({ src: i.currentSrc.split('/').pop(), complete: i.complete, w: i.naturalWidth })),
    };
  }, name);
}

const spread = (a) => (a.length ? Math.max(...a) - Math.min(...a) : 0);

// ------------------------------------------------------- per viewport, per page
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  await ctx.addInitScript(CLS_INIT);
  for (const name of PAGES) {
    const label = `${vp.name}/${name}`;
    const page = await ctx.newPage();
    const done = watch(page, label);
    await page.goto(`${origin}/#/${name}`);
    await waitForApp(page);
    await page.screenshot({ path: join(OUT, `${vp.name}-${name}-top.png`) });
    await scrollThrough(page);
    const f = await pageFacts(page, name);
    await page.screenshot({ path: join(OUT, `${vp.name}-${name}-full.png`), fullPage: true });
    results.push({ label, ...f });
    if (f.hash !== `#/${name}`) fail(label, `hash ${f.hash}`);
    if (f.h1.length !== 1 || f.pageH1 !== 1) fail(label, `h1 count ${f.h1.length}: ${JSON.stringify(f.h1)}`);
    if (f.overflowX) fail(label, `horizontal overflow ${f.scrollWidth}`);
    if (f.cls > 0.01) fail(label, `CLS ${f.cls}`);
    if (f.unrevealed) fail(label, `${f.unrevealed} reveal targets never revealed`);
    if (!f.footer) fail(label, 'footer not shown');
    if (name === 'faq' && f.faqCurrent !== 'archive') fail(label, `index marks ${f.faqCurrent} at the top of the page`);
    if (spread(f.plateWidths) > 0.5) fail(label, `plate shoe widths differ ${JSON.stringify(f.plateWidths)}`);
    if (spread(f.pairWidths) > 0.5) fail(label, `pair shoe widths differ ${JSON.stringify(f.pairWidths)}`);
    if (name === 'collections' && f.plateWidths.length !== 10) fail(label, `expected 10 plates, got ${f.plateWidths.length}`);
    for (const i of f.imgs) if (!i.complete || !i.w) fail(label, `image not loaded ${i.src}`);
    done();
    await page.close();
  }
  await ctx.close();
}

// --------------------------------------------------------- About entrance frames
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(CLS_INIT);
  const page = await ctx.newPage();
  const done = watch(page, 'entrance');
  await page.goto(`${origin}/#/faq`);
  await waitForApp(page);
  await page.evaluate(() => (location.hash = '#/about'));
  const t0 = Date.now();
  for (const ms of [450, 750, 1100, 1600, 2600]) {
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
    await page.screenshot({ path: join(OUT, `entrance-about-${ms}ms.png`) });
  }
  const cls = await page.evaluate(() => window.__cls);
  if (cls > 0.01) fail('entrance', `CLS ${cls}`);
  // parallax moves the cone only, and only with motion allowed
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(200);
  const par = await page.evaluate(() => getComputedStyle(document.querySelector('.ab-lit--hero .ab-lit__cone')).translate);
  results.push({ label: 'entrance', cls, parallaxTranslate: par });
  done();
  await ctx.close();
}

// ------------------------------------------------------------------ FAQ behaviour
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const done = watch(page, 'faq');
  await page.goto(`${origin}/#/faq`);
  await waitForApp(page);
  const first = page.locator('.fq-item__btn').first();
  const panelId = await first.getAttribute('aria-controls');
  const panelH = () => page.evaluate((id) => document.getElementById(id).getBoundingClientRect().height, panelId);
  const r = { label: 'faq-behaviour' };
  r.closedHeight = await panelH();
  r.closedFocusableHidden = await page.evaluate((id) => getComputedStyle(document.getElementById(id)).visibility, panelId);
  await first.click();
  await page.waitForTimeout(120);
  r.midHeight = await panelH();
  await page.screenshot({ path: join(OUT, 'faq-opening-mid.png') });
  await page.waitForTimeout(700);
  r.openHeight = await panelH();
  r.expandedAfterClick = await first.getAttribute('aria-expanded');
  await page.screenshot({ path: join(OUT, 'faq-open-1.png') });
  // keyboard: focus moves with arrows, Enter/Space toggle, others stay open (multi-open)
  await first.focus();
  await page.keyboard.press('ArrowDown');
  r.focusAfterArrow = await page.evaluate(() => document.activeElement.id);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  r.secondExpanded = await page.evaluate(() => document.activeElement.getAttribute('aria-expanded'));
  r.firstStillOpen = await first.getAttribute('aria-expanded');
  await page.keyboard.press('End');
  r.focusAfterEnd = await page.evaluate(() => document.activeElement.id);
  await page.keyboard.press('Space');
  await page.waitForTimeout(700);
  r.lastExpanded = await page.evaluate(() => document.activeElement.getAttribute('aria-expanded'));
  await page.keyboard.press('Home');
  r.focusAfterHome = await page.evaluate(() => document.activeElement.id);
  await page.screenshot({ path: join(OUT, 'faq-keyboard-focus.png') });
  await page.keyboard.press('Enter'); // close first
  await page.waitForTimeout(700);
  r.firstClosedAgain = await first.getAttribute('aria-expanded');
  r.closedHeightAgain = await panelH();
  // region semantics
  r.regions = await page.evaluate(() => [...document.querySelectorAll('.fq-item__panel')].every((p) => p.getAttribute('role') === 'region' && document.getElementById(p.getAttribute('aria-labelledby'))));
  // jump index
  await page.locator('.fq-index__btn').nth(3).click();
  await page.waitForTimeout(1000);
  r.jumpFocus = await page.evaluate(() => document.activeElement.id);
  r.hashAfterJump = await page.evaluate(() => location.hash);
  await page.screenshot({ path: join(OUT, 'faq-after-jump.png') });
  results.push(r);
  if (r.closedHeight !== 0) fail('faq', `closed panel height ${r.closedHeight}`);
  if (r.closedFocusableHidden !== 'hidden') fail('faq', 'closed panel not visibility:hidden');
  if (!(r.midHeight > 0 && r.midHeight < r.openHeight)) fail('faq', `no animated height (mid ${r.midHeight}, open ${r.openHeight})`);
  if (r.expandedAfterClick !== 'true' || r.secondExpanded !== 'true' || r.firstStillOpen !== 'true' || r.lastExpanded !== 'true') fail('faq', `expand states ${JSON.stringify(r)}`);
  if (r.firstClosedAgain !== 'false' || r.closedHeightAgain !== 0) fail('faq', 'did not close');
  if (!r.regions) fail('faq', 'regions not labelled');
  if (r.hashAfterJump !== '#/faq') fail('faq', `jump changed hash ${r.hashAfterJump}`);
  done();
  await ctx.close();
}

// ----------------------------------------- Collections -> product -> back
for (const vp of [VIEWPORTS[0], VIEWPORTS.find((v) => v.name === '390')].filter(Boolean)) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  const label = `${vp.name}/collections-nav`;
  const done = watch(page, label);
  await page.goto(`${origin}/#/collections`);
  await waitForApp(page);
  await page.evaluate(() => (window.__noReload = 1));
  const link = page.locator('.cl-plate[data-product-id="drift"] .cl-plate__link');
  await link.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await link.hover();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `${vp.name}-collections-hover.png`) });
  const yBefore = await page.evaluate(() => scrollY);
  const href = await link.getAttribute('href');
  await link.click();
  await page.waitForFunction(() => location.hash === '#/product/drift');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: join(OUT, `${vp.name}-collections-to-product.png`) });
  const onProduct = await page.evaluate(() => ({ surface: document.body.dataset.surface, route: document.body.dataset.route }));
  await page.goBack();
  await page.waitForFunction(() => location.hash === '#/collections');
  await page.waitForTimeout(2000);
  const back = await page.evaluate(() => ({
    hash: location.hash,
    y: scrollY,
    focus: document.activeElement?.closest('.cl-plate')?.dataset.productId ?? document.activeElement?.id ?? document.activeElement?.tagName,
    noReload: window.__noReload === 1,
  }));
  await page.screenshot({ path: join(OUT, `${vp.name}-collections-after-back.png`) });
  results.push({ label, href, yBefore, onProduct, back });
  if (href !== '#/product/drift') fail(label, `href ${href}`);
  if (onProduct.route !== 'product') fail(label, `not on product ${JSON.stringify(onProduct)}`);
  if (back.hash !== '#/collections') fail(label, `back went to ${back.hash}`);
  if (!back.noReload) fail(label, 'page reloaded');
  if (Math.abs(back.y - yBefore) > 4) fail(label, `scroll not restored ${back.y} vs ${yBefore}`);
  if (back.focus !== 'drift') fail(label, `focus after back on ${back.focus}`);
  // keyboard: jump buttons do not touch the hash
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.cl-jump__btn').nth(2).click();
  await page.waitForTimeout(1000);
  const jump = await page.evaluate(() => ({ hash: location.hash, focus: document.activeElement.id, y: scrollY }));
  results.push({ label: `${label}-jump`, jump });
  if (jump.hash !== '#/collections' || jump.focus !== 'cl-quiet-forms') fail(label, `jump ${JSON.stringify(jump)}`);
  done();
  await ctx.close();
}

// ----------------------------------------------------------------- reduced motion
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(CLS_INIT);
  const page = await ctx.newPage();
  const done = watch(page, 'reduced');
  await page.goto(`${origin}/#/faq`);
  await waitForApp(page);
  await page.evaluate(() => (location.hash = '#/about'));
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(OUT, 'reduced-about-450ms.png') });
  const r = await page.evaluate(() => {
    const line = document.querySelector('.ab-hero__line > span');
    const shoe = document.querySelector('.ab-hero .ab-lit__shoe');
    return {
      lineTransform: getComputedStyle(line).transform,
      shoeOpacity: getComputedStyle(shoe).opacity,
      hero: document.querySelector('.ab').dataset.abHero,
    };
  });
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(250);
  r.cone = await page.evaluate(() => getComputedStyle(document.querySelector('.ab-lit--hero .ab-lit__cone')).translate);
  r.revealTransform = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-ab-reveal]')].pop();
    return getComputedStyle(el).transform;
  });
  await scrollThrough(page);
  await page.screenshot({ path: join(OUT, 'reduced-about-full.png'), fullPage: true });
  r.cls = await page.evaluate(() => window.__cls);
  results.push({ label: 'reduced', ...r });
  if (r.lineTransform !== 'none' && !/matrix\(1, 0, 0, 1, 0, 0\)/.test(r.lineTransform)) fail('reduced', `title moved ${r.lineTransform}`);
  if (Number(r.shoeOpacity) < 0.99) fail('reduced', `hero not lit after 450ms (${r.shoeOpacity})`);
  if (r.cone !== 'none' && r.cone !== '0px') fail('reduced', `parallax active ${r.cone}`);
  if (r.revealTransform !== 'none') fail('reduced', `reveal moves ${r.revealTransform}`);
  // FAQ under reduced motion still opens
  await page.evaluate(() => (location.hash = '#/faq'));
  await page.waitForTimeout(800);
  await page.locator('.fq-item__btn').nth(1).click();
  await page.waitForTimeout(300);
  const open = await page.locator('.fq-item__btn').nth(1).getAttribute('aria-expanded');
  if (open !== 'true') fail('reduced', 'faq did not open');
  done();
  await ctx.close();
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify({ results, problems }, null, 2));
for (const r of results) {
  const { imgs, ...rest } = r;
  console.log(JSON.stringify(rest));
}
console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n- ${problems.join('\n- ')}` : '\nNo problems.');
console.log(`Screenshots: ${OUT}`);
await browser.close();
server.close();
process.exit(problems.length ? 1 : 0);
