import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DURATION } from '../../src/lib/motion.ts';
import {
  PauseGate,
  REST,
  columnAt,
  decodeExtra,
  encodeExtra,
  levelsAt,
  nextStep,
  stepInterval,
  sweepSequence,
} from '../../src/views/showroom/sweep.ts';

test('sequence sweeps columns left to right, then rests once', () => {
  assert.deepEqual(sweepSequence({ columns: 5 }), [0, 1, 2, 3, 4, REST]);
  assert.deepEqual(sweepSequence({ columns: 3, restSteps: 2 }), [0, 1, 2, REST, REST]);
});

test('nextStep loops and columnAt wraps', () => {
  const seq = sweepSequence({ columns: 5 });
  let s = 0;
  const visited: number[] = [];
  for (let i = 0; i < 12; i++) {
    visited.push(columnAt(seq, s));
    s = nextStep(s, seq.length);
  }
  assert.deepEqual(visited, [0, 1, 2, 3, 4, REST, 0, 1, 2, 3, 4, REST]);
  assert.equal(columnAt(seq, -1), REST);
  assert.equal(nextStep(5, 6), 0);
  assert.equal(nextStep(0, 0), 0);
});

test('exactly one column is lit per step, none at rest', () => {
  const seq = sweepSequence({ columns: 5 });
  for (let s = 0; s < seq.length; s++) {
    const lv = levelsAt(seq, s, 5);
    const lit = lv.filter((v) => v === 1).length;
    assert.equal(lit, seq[s] === REST ? 0 : 1);
  }
});

test('each step outlasts the warm-up so every pair is seen fully lit', () => {
  assert.ok(stepInterval(DURATION.sweep) > DURATION.sweep);
  assert.ok(stepInterval(DURATION.sweep) < DURATION.sweep * 2.5);
});

test('pause gate: named reasons and ref-counted API pauses', () => {
  const g = new PauseGate();
  assert.equal(g.running, true);
  assert.equal(g.set('stage', true), true);
  assert.equal(g.running, false);
  assert.equal(g.set('stage', true), false); // idempotent
  g.set('tab', true);
  g.set('stage', false);
  assert.equal(g.running, false);
  g.set('tab', false);
  assert.equal(g.running, true);
  g.pauseApi();
  g.pauseApi();
  g.resumeApi();
  assert.equal(g.running, false);
  g.resumeApi();
  assert.equal(g.running, true);
  g.resumeApi(); // extra resume never goes negative
  g.pauseApi();
  assert.equal(g.running, false);
  assert.equal(g.has('api'), true);
  g.resumeApi();
  g.set('focus', true);
  assert.equal(g.has('focus'), true);
  assert.equal(g.running, false);
});

test('snapshot extra round-trips and rejects foreign data', () => {
  const e = encodeExtra(3);
  assert.equal(decodeExtra(JSON.parse(JSON.stringify(e)), 6), 3);
  assert.equal(decodeExtra(undefined, 6), null);
  assert.equal(decodeExtra({ step: 2 }, 6), null);
  assert.equal(decodeExtra({ kind: 'kiccle.showroom.v1', step: 9 }, 6), null);
  assert.equal(decodeExtra({ kind: 'kiccle.showroom.v1', step: 1.5 }, 6), null);
  assert.equal(decodeExtra('x', 6), null);
});
