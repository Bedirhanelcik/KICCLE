import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DURATION, EASE } from '../../src/lib/motion.ts';
import { read } from './helpers.ts';

const css = read('src/styles/tokens.css');
const rootStart = css.indexOf(':root {');
const rootBlock = css.slice(rootStart, css.indexOf('@media', rootStart));
const token = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(rootBlock)?.[1]?.trim();
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

test('motion.ts durations mirror tokens.css', () => {
  for (const [name, ms] of Object.entries(DURATION)) {
    if (name === 'introReduced') continue;
    assert.equal(token(`dur-${name}`), `${ms}ms`, `--dur-${name}`);
  }
});

test('motion.ts easings mirror tokens.css', () => {
  for (const [name, value] of Object.entries(EASE)) {
    const cssName = name === 'inOut' ? 'in-out' : kebab(name);
    assert.equal(token(`ease-${cssName}`), value, `--ease-${cssName}`);
  }
});

test('palette never uses pure black as a surface', () => {
  assert.doesNotMatch(rootBlock, /#000(000)?\b/i);
  for (const name of ['navy-900', 'navy-950', 'charcoal-900']) assert.ok(token(name), name);
});

test('reduced motion is handled globally', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(read('src/styles/base.css'), /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(read('src/styles/base.css'), /:focus-visible/);
});
