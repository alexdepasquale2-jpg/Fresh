import type { PlanetSpec, PlanetSurface } from './system';
import type { UniverseSpec } from './universe';
import type { SurfaceModifiers, SkyState } from './sky';

export { GRID_W, GRID_H, CHUNK } from './system';

/**
 * Read-only view of the surface grid.
 * Invariants: cells is row-major width*height material ids; chunks are
 * CHUNK x CHUNK cells (edge chunks may be partial); dirty[cy*chunksX+cx] is 1
 * when that chunk changed since the last clearDirty().
 */
export interface GridView {
  readonly width: number;
  readonly height: number;
  readonly cells: Readonly<Uint8Array>;
  readonly chunksX: number;
  readonly chunksY: number;
  readonly dirty: Readonly<Uint8Array>;
  clearDirty(): void;
}

/**
 * Falling-sand surface. Runs in the sim Worker at a fixed 20 ticks/s.
 * Invariants: deterministic in (planet, universe, surface, sequence of
 * step calls); step steps dirty chunks only; snapshot/restore round-trips
 * byte-identically, including the tick counter and RNG state.
 */
export interface SurfaceSim {
  init(planet: PlanetSpec, universe: UniverseSpec, surface: PlanetSurface): void;
  step(ticks: number, modifiers: SurfaceModifiers): void;
  grid(): GridView;
  tick(): number;
  snapshot(): Uint8Array;
  restore(snapshot: Uint8Array): void;
}
export type SurfaceSimFactory = () => SurfaceSim;

export interface Village {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** souls in this village */
  readonly souls: number;
  readonly name: string;
}
export type CivEventKind = 'found' | 'grow' | 'split' | 'die' | 'migrate' | 'light';
export interface CivEvent {
  readonly kind: CivEventKind;
  readonly tick: number;
  readonly villageId: number;
  readonly x: number;
  readonly y: number;
}
export interface CivView {
  readonly villages: readonly Village[];
  readonly souls: number;
  /** Glow sent to the player's light, per in-game minute (integer). */
  readonly glowPerMinute: number;
}
/** Villages on the grid. Deterministic like SurfaceSim. Reads the grid, never writes it. */
export interface Civ {
  init(planet: PlanetSpec, surface: PlanetSurface): void;
  step(ticks: number, grid: GridView, modifiers: SurfaceModifiers): readonly CivEvent[];
  view(): CivView;
  snapshot(): Uint8Array;
  restore(snapshot: Uint8Array): void;
}
export type CivFactory = () => Civ;

/**
 * One chronicle line. The event is recorded first; the reason is attached
 * later (back-filled from sky state and earlier events). Invariant: id is
 * unique and increasing; reason, once set, never changes.
 */
export interface ChronicleEntry {
  readonly id: number;
  readonly year: number;
  readonly event: string;
  readonly reason?: string;
}
export interface Chronicle {
  record(events: readonly CivEvent[], year: number, planet: PlanetSpec): void;
  /** Attach reasons to entries that have none, using the sky and history. */
  explain(sky: SkyState, modifiers: SurfaceModifiers, skySays: readonly string[]): void;
  /** Newest first. */
  entries(limit?: number): readonly ChronicleEntry[];
  snapshot(): ChronicleEntry[];
  restore(entries: readonly ChronicleEntry[]): void;
}
export type ChronicleFactory = (deps: { names: import('./universe').NameGen }) => Chronicle;
