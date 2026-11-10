import type { PlanetSpec, PlanetSurface } from './system';
import type { UniverseSpec } from './universe';
import type { SurfaceModifiers, SkyState } from './sky';

export { GRID_W, GRID_H, CHUNK } from './system';

/** Coarse field cell size (temperature) in grid cells. */
export const FIELD = 4;
export const DAY_TICKS = 400;
export const YEAR_TICKS = 1600;

/**
 * Engine-level materials every universe has, beside its law set. Ids 250..254
 * are reserved; law sets must not use them. Colours are palette slots.
 */
export const ENGINE = {
  ice: { id: 250, color: 9 },
  snow: { id: 251, color: 9 },
  ore: { id: 252, color: 7 },
  fire: { id: 253, color: 13 },
  ash: { id: 254, color: 3 },
} as const;

/** Environment of the surface, for civ, chronicle and render. Read-only views. */
export interface SurfaceEnv {
  /** 0..999 time of day; 0 midnight, 500 noon. */
  readonly day: number;
  /** 0..999 through the year; 250 midsummer, 750 midwinter. */
  readonly season: number;
  readonly fieldW: number;
  readonly fieldH: number;
  /** Coarse temperature, fieldW*fieldH; 128 mild, <100 freezing, >200 burning. */
  readonly temp: Readonly<Uint8Array>;
  /** Cloud moisture per coarse column 0..255. Rain above 150. */
  readonly humidity: Readonly<Uint8Array>;
  /** -100..100, positive blows right. */
  readonly wind: number;
  /** 0..255 overall rain intensity. */
  readonly rain: number;
  readonly snowing: boolean;
  /** Ticks since the last lightning strike (for flashes). */
  readonly lightning: number;
}

export type SurfaceEventKind = 'impact' | 'flood' | 'drought' | 'freeze' | 'thaw' | 'fire' | 'storm' | 'bloom' | 'blight' | 'ore' | 'lightning';
export interface SurfaceEvent {
  readonly kind: SurfaceEventKind;
  readonly tick: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

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
  env(): SurfaceEnv;
  /** Surface events since the last call. */
  drainEvents(): readonly SurfaceEvent[];
  snapshot(): Uint8Array;
  restore(snapshot: Uint8Array): void;
}
export type SurfaceSimFactory = () => SurfaceSim;

export type Belief = 'none' | 'sun' | 'moon' | 'sea' | 'stone' | 'fire' | 'sky';
export const BELIEFS: readonly Belief[] = ['none', 'sun', 'moon', 'sea', 'stone', 'fire', 'sky'];
/** Tech eras: 0 huts, 1 fire, 2 iron, 3 lamps, 4 bells, 5 star-reaching. */
export const ERAS = ['huts', 'fire', 'iron', 'lamps', 'bells', 'star-reaching'] as const;

export interface Village {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** souls in this village */
  readonly souls: number;
  readonly name: string;
  readonly tech: number;
  readonly belief: Belief;
  /** 0..999 stores. */
  readonly food: number;
  /** -100..100 */
  readonly mood: number;
}
export type CivEventKind =
  | 'found' | 'grow' | 'split' | 'die' | 'migrate' | 'light'
  | 'famine' | 'tech' | 'convert' | 'feud' | 'festival' | 'burn' | 'flooded' | 'frozen' | 'launch';
export interface CivEvent {
  readonly kind: CivEventKind;
  readonly tick: number;
  readonly villageId: number;
  readonly x: number;
  readonly y: number;
  /** Tech level for 'tech', other village id for 'feud'/'migrate'. */
  readonly detail?: number;
  readonly belief?: Belief;
}
/** Person roles in CivView.people. */
export const ROLE = { idle: 0, farm: 1, fish: 2, pray: 3, travel: 4, lamp: 5 } as const;
export interface CivView {
  readonly villages: readonly Village[];
  readonly souls: number;
  /** Glow sent to the player's light, per in-game minute (integer). */
  readonly glowPerMinute: number;
  /** Walking people: [x, y, role, villageId] * count. */
  readonly people: Readonly<Int16Array>;
  readonly peopleCount: number;
  /** Highest tech level reached on this planet. */
  readonly era: number;
}
/** Villages on the grid. Deterministic like SurfaceSim. Reads the grid, never writes it. */
export interface Civ {
  init(planet: PlanetSpec, surface: PlanetSurface): void;
  step(ticks: number, grid: GridView, modifiers: SurfaceModifiers, env: SurfaceEnv, surface: readonly SurfaceEvent[]): readonly CivEvent[];
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
  record(events: readonly CivEvent[], year: number, planet: PlanetSpec, surface?: readonly SurfaceEvent[]): void;
  /** Attach reasons to entries that have none, using the sky and history. */
  explain(sky: SkyState, modifiers: SurfaceModifiers, skySays: readonly string[]): void;
  /** Newest first. */
  entries(limit?: number): readonly ChronicleEntry[];
  snapshot(): ChronicleEntry[];
  restore(entries: readonly ChronicleEntry[]): void;
}
export type ChronicleFactory = (deps: { names: import('./universe').NameGen }) => Chronicle;
