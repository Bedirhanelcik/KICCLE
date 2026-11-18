// Headless Chromium verification of the foundation (npm run verify).
// Needs `playwright` on NODE_PATH and a prior `npm run build`.
// Writes screenshots + report.json to $VERIFY_OUT (default: <tmp>/kiccle-verify).
//
// Checks: console errors, page errors, failed / external requests, intro
// duration (normal + reduced motion), direct load of every route, in-app
// navigation without reload, rendered visible shoe width + baseline spread,
// cumulative layout shift, visible keyboard focus, horizontal overflow.

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from './serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = process.env.VERIFY_OUT ?? join(tmpdir(), 'kiccle-verify');
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
  // Edge widths: run with VERIFY_ALL=1 (doubles the run time).
  ...(process.env.VERIFY_ALL ? [
    { name: 'xs', width: 360, height: 740 },
    { name: 'xl', width: 1920, height: 1080 },
  ] : []),
];
const ROUTES = ['#/', '#/about', '#/faq', '#/collections', '#/product/loam'];

const server = await startServer(0, '127.0.0.1');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const report = { origin, runs: [], problems: [] };

function watch(page, label) {
  const log = { console: [], pageErrors: [], failed: [], external: [] };
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.console.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => log.pageErrors.push(String(e)));
  page.on('requestfailed', (r) => log.failed.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) log.failed.push(`${r.url()} HTTP ${r.status()}`);
  });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) log.external.push(u);
  });
  return () => {
    for (const [k, v] of Object.entries(log)) if (v.length) report.problems.push({ label, kind: k, items: v });
    return log;
  };
}

/** Wait until the intro is gone and the router settled. Returns ms since navigation start. */
async function waitForApp(page) {
  await page.waitForFunction(() => !document.getElementById('k-intro') && !document.getElementById('k-app').inert, null, { timeout: 15000 });
  return page.evaluate(() => performance.now());
}

/** Per-figure visible width / baseline measured from actual pixels. */
async function measureShoes(page, scope = '#k-stage') {
  return page.evaluate(async (scope) => {
    const out = [];
    for (const fig of document.querySelectorAll(`${scope} .k-shoe`)) {
      const img = fig.querySelector('img');
      await img.decode().catch(() => {});
      const fr = fig.getBoundingClientRect();
      const ir = img.getBoundingClientRect();
      const scale = 2;
      const c = document.createElement('canvas');
      c.width = Math.round(fr.width * scale);
      c.height = Math.round(fr.height * scale);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, (ir.left - fr.left) * scale, (ir.top - fr.top) * scale, ir.width * scale, ir.height * scale);
      const { data, width: W, height: H } = ctx.getImageData(0, 0, c.width, c.height);
      let x0 = W, x1 = -1, yBase = -1;
      for (let y = 0; y < H; y++) {
        let solid = 0;
        for (let x = 0; x < W; x++) {
          const a = data[(y * W + x) * 4 + 3];
          if (a >= 32) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
          }
          if (a >= 128) solid++;
        }
        if (solid >= Math.max(3, W * 0.015 * 0.9)) yBase = y + 1;
      }
      out.push({
        id: fig.dataset.productId,
        frameW: fr.width,
        visibleW: (x1 - x0 + 1) / scale,
        visibleFrac: (x1 - x0 + 1) / W,
        baselineFrac: yBase / H,
        currentSrc: img.currentSrc.split('/').pop(),
      });
    }
    return out;
  }, scope);
}

for (const vp of VIEWPORTS) {
  // ---------- home with intro, CLS, shoe metrics
  {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const done = watch(page, `${vp.name} home`);
    await page.goto(`${origin}/`, { waitUntil: 'commit' });
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT, `${vp.name}-intro-early.png`) });
    await page.waitForTimeout(950);
    await page.screenshot({ path: join(OUT, `${vp.name}-intro-mid.png`) });
    const introEnd = await waitForApp(page);
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, `${vp.name}-home.png`) });
    const shoes = await measureShoes(page);
    const fr = shoes.map((s) => s.visibleFrac);
    const bl = shoes.map((s) => s.baselineFrac);
    const spread = (a) => (Math.max(...a) - Math.min(...a)) / (a.reduce((x, y) => x + y, 0) / a.length);
    const cls = await page.evaluate(() => window.__cls);
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const title = await page.title();
    const navLabels = await page.$$eval('.k-nav__list .k-nav__link', (els) => els.map((e) => e.textContent));
    // keyboard focus visibility
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const el = document.activeElement;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, text: (el.textContent || '').trim().slice(0, 30), outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}` };
    });
    await page.screenshot({ path: join(OUT, `${vp.name}-focus.png`) });
    report.runs.push({
      viewport: vp.name,
      introMs: Math.round(introEnd),
      title,
      navLabels,
      cls,
      overflowX,
      focus,
      shoes,
      visibleWidthSpread: spread(fr),
      baselineSpread: Math.max(...bl) - Math.min(...bl),
    });

    // ---------- in-app navigation (no reload)
    await page.evaluate(() => (window.__noReload = true));
    const stops = vp.width >= 760 ? ['About', 'FAQ', 'Collections', 'Home'] : [];
    for (const label of stops) {
      await page.click(`.k-nav__list a:text-is("${label}")`);
      await page.waitForTimeout(1100);
    }
    if (vp.width < 760) {
      await page.click('.k-nav__menu-btn');
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT, `${vp.name}-menu.png`) });
      await page.click('.k-menu a:text-is("FAQ")');
      await page.waitForTimeout(1000);
    }
    // product via showroom click and back
    await page.goto(`${origin}/#/`);
    await page.waitForTimeout(900);
    await page.click('#k-stage [data-product-id="signal"] .k-shoe', { force: true }).catch(async () => {
      await page.evaluate(() => (location.hash = '#/product/signal'));
    });
    await page.waitForTimeout(1900);
    await page.screenshot({ path: join(OUT, `${vp.name}-detail-from-click.png`) });
    await page.goBack();
    await page.waitForTimeout(1900);
    await page.screenshot({ path: join(OUT, `${vp.name}-back-home.png`) });
    const restTransform = await page.$eval('#k-stage [data-product-id="signal"]', (el) => getComputedStyle(el).transform);
    const noReload = await page.evaluate(() => window.__noReload === true);
    report.runs.at(-1).inAppNavigationWithoutReload = noReload;
    report.runs.at(-1).unitTransformAfterBack = restTransform;
    done();
    await ctx.close();
  }

  // ---------- direct load of each route
  for (const route of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const done = watch(page, `${vp.name} ${route}`);
    await page.goto(`${origin}/${route}`);
    await waitForApp(page);
    await page.waitForTimeout(route.startsWith('#/product') ? 1900 : 700);
    const slug = route.replace(/[#/]+/g, '-').replace(/^-|-$/g, '') || 'home';
    await page.screenshot({ path: join(OUT, `${vp.name}-direct-${slug}.png`) });
    if (route === '#/about') await page.screenshot({ path: join(OUT, `${vp.name}-direct-${slug}-full.png`), fullPage: true });
    const state = await page.evaluate(() => ({
      hash: location.hash,
      title: document.title,
      route: document.body.dataset.route,
      surface: document.body.dataset.surface,
      footerVisible: !!document.querySelector('#k-footer') && getComputedStyle(document.querySelector('#k-pages')).visibility !== 'hidden',
    }));
    report.runs.push({ viewport: vp.name, direct: route, ...state });
    done();
    await ctx.close();
  }
}

// ---------- Collections -> product -> back (the showroom must appear, then the same detail experience)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const done = watch(page, 'collections-flow');
  await page.goto(`${origin}/#/collections`);
  await waitForApp(page);
  await page.waitForTimeout(500);
  await page.click('#k-page-collections a[href="#/product/canyon"]');
  await page.waitForTimeout(400);
  const midway = await page.evaluate(() => ({ surface: document.body.dataset.surface, stageVisible: getComputedStyle(document.getElementById('k-stage')).visibility }));
  await page.waitForTimeout(2200);
  await page.screenshot({ path: join(OUT, 'desktop-collections-to-product.png') });
  const atProduct = await page.evaluate(() => ({
    hash: location.hash,
    transform: getComputedStyle(document.querySelector('#k-stage [data-product-id="canyon"]')).transform,
  }));
  await page.goBack();
  await page.waitForTimeout(2200);
  const back = await page.evaluate(() => ({ hash: location.hash, surface: document.body.dataset.surface }));
  report.runs.push({ collectionsFlow: { midway, atProduct, back } });
  done();
  await ctx.close();
}

// ---------- reduced motion intro
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const done = watch(page, 'reduced-motion');
  await page.goto(`${origin}/`);
  const t = await waitForApp(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `reduced-home.png`) });
  report.runs.push({ viewport: 'desktop-reduced', introMs: Math.round(t) });
  done();
  await ctx.close();
}

// ---------- unknown routes redirect home
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const done = watch(page, 'unknown');
  await page.goto(`${origin}/#/product/does-not-exist`);
  await waitForApp(page);
  report.runs.push({ unknownProductRedirect: await page.evaluate(() => location.hash) });
  await page.goto(`${origin}/#/nope`);
  await page.waitForTimeout(600);
  report.runs.push({ unknownRouteRedirect: await page.evaluate(() => location.hash) });
  done();
  await ctx.close();
}

await browser.close();
server.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out: OUT, problems: report.problems }, null, 2));
for (const r of report.runs) {
  if (r.shoes) {
    console.log(
      `${r.viewport}: intro ${r.introMs}ms, CLS ${r.cls.toFixed(4)}, overflowX ${r.overflowX}, visible width spread ${(r.visibleWidthSpread * 100).toFixed(2)}%, baseline spread ${(r.baselineSpread * 100).toFixed(2)}% of frame, title "${r.title}", nav ${JSON.stringify(r.navLabels)}, focus ${JSON.stringify(r.focus)}, noReload ${r.inAppNavigationWithoutReload}, transform after back ${r.unitTransformAfterBack}`,
    );
  } else console.log(JSON.stringify(r));
}
process.exit(report.problems.length ? 1 : 0);
