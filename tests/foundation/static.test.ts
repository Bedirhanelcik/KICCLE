import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, read, walk } from './helpers.ts';

const html = read('index.html');

test('index.html: brand title, description, relative module entry and favicon', () => {
  assert.match(html, /<title>KICCLE — FOOTWEAR ARCHIVE<\/title>/);
  assert.match(html, /<meta\s+name="description"\s+content="KICCLE — FOOTWEAR ARCHIVE[^"]*"/);
  assert.match(html, /<script type="module" src="dist\/main\.js"><\/script>/);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="assets\/icons\/favicon\.svg"/);
});

test('index.html links every package stylesheet and all exist', () => {
  const required = [
    'src/styles/tokens.css',
    'src/styles/base.css',
    'src/views/showroom/showroom.css',
    'src/views/detail/detail.css',
    'src/cart/cart.css',
    'src/views/about/about.css',
    'src/views/faq/faq.css',
    'src/views/collections/collections.css',
  ];
  for (const href of required) {
    assert.ok(html.includes(`href="${href}"`), `${href} not linked`);
  }
  for (const m of html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
    const url = m[1]!;
    assert.doesNotMatch(url, /^(\/|[a-z]+:)/i, `non-relative URL in index.html: ${url}`);
    if (!url.startsWith('dist/')) assert.ok(existsSync(join(ROOT, url)), `${url} missing`);
  }
});

/** Inline data: URLs make no request (textures, noise); they may contain an SVG namespace URL. */
const stripDataUrls = (t: string) =>
  t
    .replace(/url\(\s*"data:[^"]*"\s*\)/g, 'url(data)')
    .replace(/url\(\s*'data:[^']*'\s*\)/g, 'url(data)')
    .replace(/url\(\s*data:[^)]*\)/g, 'url(data)')
    .replace(/(["'`])data:[^"'`]*\1/g, '$1data$1');

test('nothing off-origin is ever fetched (url(), src, @import)', () => {
  for (const f of walk('src', (p) => /\.(css|ts)$/.test(p))) {
    const text = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const re of [/url\(\s*['"]?https?:/gi, /@import\s+['"]?https?:/gi, /src\s*[:=]\s*['"`]https?:/gi, /fetch\(\s*['"`]https?:/gi]) {
      assert.doesNotMatch(text, re, `${f} fetches something off-origin`);
    }
  }
});

test('no external URLs or root-absolute paths in CSS and browser source (data: allowed)', () => {
  for (const f of walk('src', (p) => /\.(css|ts)$/.test(p))) {
    const text = stripDataUrls(
      read(f)
        .replace(/\/\*[\s\S]*?\*\//g, '') // block comments (licence notes)
        .replace(/^\s*\/\/.*$/gm, ''),
    )
      .replace(/'http:\/\/www\.w3\.org\/2000\/svg'/g, '') // SVG namespace, not a request
      // An outbound LINK is not a request: the About page and the FAQ carry
      // the author's real LinkedIn and GitHub profiles, which the visitor
      // clicks. The rule this test exists for is that the site must never
      // FETCH anything off-origin — no CDN, no web fonts, no remote images —
      // so href values are exempt and everything else still is not.
      .replace(/href:\s*'https:\/\/[^']*'/g, "href: ''");
    assert.doesNotMatch(text, /https?:\/\//, `${f} has an absolute URL`);
    for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)/g)) {
      const u = m[1]!.trim();
      if (u === 'data') continue;
      // rejects '/root', '//host', 'http:', 'https:', any other scheme
      assert.doesNotMatch(u, /^(\/|[a-z][a-z0-9+.-]*:)/i, `${f}: non-relative url(${u})`);
    }
  }
});

test('the URL rule itself: data: allowed, external / protocol-relative / root-absolute rejected', () => {
  const bad = /^(\/|[a-z][a-z0-9+.-]*:)/i;
  const urls = (css: string) => [...stripDataUrls(css).matchAll(/url\(\s*['"]?([^'")]+)/g)].map((m) => m[1]!.trim()).filter((u) => u !== 'data');
  assert.deepEqual(urls(`a{background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E")}`), []);
  assert.deepEqual(urls(`a{background:url(data:image/png;base64,AAAA)}`), []);
  for (const u of ['https://cdn.example/x.png', '//cdn.example/x.png', '/assets/x.png', 'http://x/y']) {
    assert.match(urls(`a{background:url('${u}')}`)[0]!, bad, u);
  }
  assert.doesNotMatch(urls(`a{background:url('../../assets/x.png')}`)[0]!, bad);
});

test('main.ts imports every package entry module', () => {
  const main = read('src/main.ts');
  for (const mod of ['./views/showroom/index.js', './views/detail/index.js', './cart/index.js', './views/about/index.js', './views/faq/index.js', './views/collections/index.js']) {
    assert.ok(main.includes(`from '${mod}'`), `main.ts does not import ${mod}`);
  }
});

test('nav items are exactly Home, About, FAQ, Collections', () => {
  const nav = read('src/components/nav.ts');
  const labels = [...nav.matchAll(/\{ label: '([^']+)', path:/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['Home', 'About', 'FAQ', 'Collections']);
});

test('package.json has no dependencies', () => {
  const pkg = JSON.parse(read('package.json')) as Record<string, unknown>;
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(typeof (pkg.scripts as Record<string, string>).test, 'string');
});

test('fonts are self-hosted with their licences', () => {
  for (const f of ['Tektur-OFL.txt', 'InstrumentSans-OFL.txt']) {
    assert.match(read(`assets/fonts/${f}`), /SIL Open Font License/);
  }
});
