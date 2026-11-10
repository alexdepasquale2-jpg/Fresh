import type { SerialNumber, FoldAddress } from './seed';
import type { UniverseSpec } from './universe';
import type { FoldNode, StarRef } from './fold';

export const LIGHT_MAX_PIPS = 8;
/**
 * The 8-pip Light economy.
 * OPEN DECISION (see docs/DESIGN.md): drain is per fold fallen, not per second;
 * at zero pips the dive auto-surfaces. Income comes from planet glow.
 * Invariants: 0 <= pips <= 8; partial progress is an integer 0..999 toward
 * the next pip (gain) or loss.
 */
export interface LightView {
  readonly pips: number;
  readonly partial: number;
  readonly low: boolean;
}
export interface Light {
  view(): LightView;
  /** Drain for folds fallen. Returns false when Light hit zero. */
  drainFolds(folds: number): boolean;
  /** Add glow points (from CivView.glowPerMinute over time). */
  addGlow(points: number): void;
  canSpend(pips: number): boolean;
  spend(pips: number): boolean;
  snapshot(): { pips: number; partial: number };
  restore(s: { pips: number; partial: number }): void;
}
export type LightFactory = () => Light;

export const BOX_SLOTS = 25;
export interface UniverseStats {
  readonly worldsTended: number;
  readonly deepestFold: number;
  readonly lightFromGlow: number;
}
export interface BoxEntry {
  readonly serialNumber: SerialNumber;
  readonly stats: UniverseStats;
}
/** The Box: 25 slots. Mote never goes in the Box. Invariant: a serial appears at most once. */
export interface Box {
  slots(): readonly (BoxEntry | null)[];
  count(): number;
  selected(): number;
  select(slot: number): void;
  /** Add to the first empty slot. Returns slot index, or -1 if full or duplicate. */
  add(serialNumber: SerialNumber): number;
  recordDepth(slot: number, depth: number): void;
  recordTended(slot: number): void;
  recordGlow(slot: number, light: number): void;
  snapshot(): (BoxEntry | null)[];
  restore(slots: readonly (BoxEntry | null)[]): void;
}
export type BoxFactory = () => Box;

export type DivePhase = 'falling' | 'hovering' | 'stopped' | 'surfaced';
export const RELIQUARIES_PER_DIVE = 3;
export interface DiveView {
  readonly phase: DivePhase;
  readonly universe: UniverseSpec | null;
  readonly address: FoldAddress | null;
  readonly depth: number;
  readonly best: number;
  /** 0..999 progress through the current fold, for render zoom. */
  readonly progress: number;
  readonly children: readonly FoldNode[];
  readonly reliquaries: number;
  /** Star the player stopped at, or is near enough to stop at. */
  readonly star: StarRef | null;
  readonly narration: string;
}
export type CaptureResult =
  | { ok: true; serialNumber: SerialNumber; slot: number }
  | { ok: false; reason: 'no-reliquary' | 'no-flicker' | 'box-full' | 'duplicate' };

/**
 * Dive state machine: hold to fall, release to hover, release near a star to
 * stop, tap a flicker to throw a reliquary. update() runs on fixed ticks.
 */
export interface Dive {
  start(universe: UniverseSpec, best: number): void;
  hold(): void;
  release(): void;
  /** Throw a reliquary at child index (1..6 or 0). */
  throwAt(childIndex: number): CaptureResult;
  update(ticks: number): void;
  surface(): void;
  view(): DiveView;
}
export type DiveFactory = (deps: {
  fold: import('./fold').FoldGen;
  light: Light;
  box: Box;
}) => Dive;
