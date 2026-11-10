import type { Fx } from '@/core/fixed';

export const TICKS_PER_SECOND = 20;
export type ClockSpeed = 0 | 1 | 3;

/**
 * Game clock. Converts wall time into whole sim ticks at a fixed 20/s times
 * speed. Wall time is passed IN (never read here).
 * Invariants: advance() returns an integer >= 0; catchUp() is capped at
 * maxCatchUpTicks; year = floor(tick / ticksPerYear).
 */
export interface Clock {
  speed(): ClockSpeed;
  setSpeed(s: ClockSpeed): void;
  /** Feed elapsed wall ms; returns ticks to run now. */
  advance(dtMs: number): number;
  /** Ticks to run for time spent offline, capped. */
  catchUp(offlineMs: number): number;
  readonly maxCatchUpTicks: number;
  readonly ticksPerYear: number;
  tick(): number;
  year(): number;
  /** Age name for the current year (from NameGen). */
  ageName(): string;
  snapshot(): { tick: number; speed: ClockSpeed };
  restore(s: { tick: number; speed: ClockSpeed }): void;
}
export type ClockFactory = (deps: { names: import('./universe').NameGen; seed: import('./seed').Seed }) => Clock;

/**
 * One Kuramoto-coupled oscillator per universe. Sim, render and audio all read
 * phase() so they share one pulse.
 * Invariants: phase is in turns, Fx in [0, FX_ONE); integer-only math;
 * step is deterministic in (frequency, coupling, neighbour phases).
 */
export interface Pulse {
  phase(): Fx;
  /** Advance by ticks, nudged toward neighbour phases by the coupling K (Fx). */
  step(ticks: number, neighbours: readonly Fx[]): void;
  readonly milliHz: number;
}
export type PulseFactory = (deps: { milliHz: number; seed: import('./seed').Seed; couplingFx: Fx }) => Pulse;
