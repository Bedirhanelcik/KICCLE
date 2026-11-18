/**
 * Spotlight sweep logic (pure, DOM-free, unit-tested).
 *
 * The ceiling track has one spot head per column. Each head lights BOTH tiers
 * of its bay (like a real track head aimed down a wall bay), so the sweep reads
 * as one clean left-to-right pass instead of a zig-zag across rows.
 *
 * Sequence (one step every `stepMs`):
 *   col 0 -> col 1 -> col 2 -> col 3 -> col 4 -> rest -> col 0 -> ...
 * Each column warms up over DURATION.sweep while the previous one cools down
 * (CSS transitions with --ease-light), then holds briefly. The `rest` step lets
 * the whole wall settle to its ambient level for one beat before the loop
 * restarts, so the loop has a breath instead of a jump-cut from 5 back to 1.
 */

/** A step is a column index, or REST (every column at ambient). */
export const REST = -1;

export interface SweepConfig {
  readonly columns: number;
  /** Number of REST steps between loops (default 1). */
  readonly restSteps?: number;
}

/** The ordered loop of steps, e.g. [0,1,2,3,4,-1]. */
export function sweepSequence(cfg: SweepConfig): readonly number[] {
  const seq: number[] = [];
  for (let c = 0; c < cfg.columns; c++) seq.push(c);
  for (let i = 0; i < (cfg.restSteps ?? 1); i++) seq.push(REST);
  return seq;
}

/** Index of the next step in the loop. */
export function nextStep(step: number, length: number): number {
  if (length <= 0) return 0;
  return (((step + 1) % length) + length) % length;
}

/** Column lit at `step` of `seq` (REST when none). */
export function columnAt(seq: readonly number[], step: number): number {
  if (seq.length === 0) return REST;
  const i = ((step % seq.length) + seq.length) % seq.length;
  return seq[i] ?? REST;
}

/** Target light level (0 = ambient, 1 = full) of every column at a step. */
export function levelsAt(seq: readonly number[], step: number, columns: number): number[] {
  const lit = columnAt(seq, step);
  return Array.from({ length: columns }, (_, c) => (c === lit ? 1 : 0));
}

/** Time between steps: the warm-up (sweep) plus a hold so each pair is seen lit. */
export function stepInterval(sweepMs: number): number {
  return Math.round(sweepMs * 1.55);
}

// ---------------------------------------------------------------------------
// Pause gate: the sweep runs only when no reason holds it.
// ---------------------------------------------------------------------------

export type PauseReason = 'stage' | 'tab' | 'focus' | 'reduced' | 'api';

export class PauseGate {
  private readonly reasons = new Set<Exclude<PauseReason, 'api'>>();
  private apiCount = 0;

  /** Add/remove a named reason. Returns true when `running` changed. */
  set(reason: Exclude<PauseReason, 'api'>, on: boolean): boolean {
    const before = this.running;
    if (on) this.reasons.add(reason);
    else this.reasons.delete(reason);
    return before !== this.running;
  }

  /** Ref-counted external pause (StageAPI.pauseSpotlights). */
  pauseApi(): boolean {
    const before = this.running;
    this.apiCount += 1;
    return before !== this.running;
  }

  /** Ref-counted external resume; extra resumes are ignored (never below 0). */
  resumeApi(): boolean {
    const before = this.running;
    this.apiCount = Math.max(0, this.apiCount - 1);
    return before !== this.running;
  }

  has(reason: PauseReason): boolean {
    return reason === 'api' ? this.apiCount > 0 : this.reasons.has(reason as Exclude<PauseReason, 'api'>);
  }

  get running(): boolean {
    return this.reasons.size === 0 && this.apiCount === 0;
  }
}

// ---------------------------------------------------------------------------
// Snapshot extra (B-private part of StageSnapshot).
// ---------------------------------------------------------------------------

export interface SweepSnapshot {
  readonly kind: 'kiccle.showroom.v1';
  readonly step: number;
}

export function encodeExtra(step: number): SweepSnapshot {
  return { kind: 'kiccle.showroom.v1', step };
}

/** Validates an unknown `extra`; returns the step or null if it is not ours. */
export function decodeExtra(extra: unknown, length: number): number | null {
  if (!extra || typeof extra !== 'object') return null;
  const e = extra as Partial<SweepSnapshot>;
  if (e.kind !== 'kiccle.showroom.v1') return null;
  if (typeof e.step !== 'number' || !Number.isInteger(e.step)) return null;
  if (e.step < 0 || e.step >= length) return null;
  return e.step;
}
