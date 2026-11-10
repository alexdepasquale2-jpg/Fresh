import type { Bus } from '@/core/bus';
import type { Atlas } from './atlas';
import type { UniverseGen, NameGen, UniverseSpec } from './universe';
import type { FoldGen, StarRef } from './fold';
import type { SystemGen, PlanetGen, SystemSpec, PlanetSpec } from './system';
import type { SkyRules, SkyGame } from './sky';
import type { Light, Box, Dive } from './game';
import type { GlCore, DiveRenderer, SystemRenderer, PlanetRenderer, RoomRenderer } from './render';
import type { Input, SaveStore, Audio, EdgeVoice, Perf, ScreenId } from './platform';
import type { GridView, CivView, ChronicleEntry, SurfaceEnv } from './sim';
import type { Clock, Pulse } from './time';
import type { Battles, BattleState } from './battle';
import type { Tool } from './sim';

export type { ScreenId };

export interface AppEvents extends Record<string, unknown> {
  navigate: { to: ScreenId };
  'light:changed': { pips: number };
  'box:changed': { count: number };
  'sky:changed': { planetKey: string };
  'sim:frame': { tick: number };
}

/** What the surface Worker reports each frame. */
export interface SimFrame {
  readonly grid: GridView;
  readonly civ: CivView;
  readonly chronicle: readonly ChronicleEntry[];
  readonly tick: number;
  readonly env: SurfaceEnv;
}
/** Main-thread handle on the sim Worker (built in src/app). */
export interface SimClient {
  open(universe: UniverseSpec, planet: PlanetSpec): void;
  close(): void;
  latest(): SimFrame | null;
  /** Run ticks with the current sky. Async; latest() updates when done. */
  step(ticks: number): void;
  /** Touch the open surface with a god tool at grid (x, y), radius r. */
  tool(tool: Tool, x: number, y: number, r: number): void;
  incarnate(x: number): void;
  walk(x: number): void;
  ascend(): void;
  act(action: import('./sim').BodyAction): void;
}

/** Where the player is in the chain. Set by screens as they navigate. */
export interface Selection {
  universe: UniverseSpec | null;
  star: StarRef | null;
  system: SystemSpec | null;
  planetIndex: number;
}

/** Everything a screen may use. Built once by src/app from the registry. */
export interface AppContext {
  readonly bus: Bus<AppEvents>;
  readonly gl: GlCore;
  readonly atlas: Atlas;
  readonly names: NameGen;
  readonly universes: UniverseGen;
  readonly fold: FoldGen;
  readonly systems: SystemGen;
  readonly planets: PlanetGen;
  readonly skyRules: SkyRules;
  readonly sky: SkyGame;
  readonly light: Light;
  readonly box: Box;
  readonly dive: Dive;
  readonly clock: Clock;
  pulse(): Pulse;
  readonly sim: SimClient;
  readonly input: Input;
  readonly save: SaveStore;
  readonly audio: Audio;
  readonly voice: EdgeVoice;
  readonly perf: Perf;
  readonly renderers: {
    readonly dive: DiveRenderer;
    readonly system: SystemRenderer;
    readonly planet: PlanetRenderer;
    readonly room: RoomRenderer;
  };
  readonly selection: Selection;
  readonly battles: Battles;
  readonly merger: import('./merge').Merger;
  /** The battle in progress, kept while you go into a universe to change it. */
  battle: BattleState | null;
  readonly rivalsBeaten: Set<number>;
  go(to: ScreenId): void;
  /** Persist now. */
  persist(): void;
}

/**
 * A screen. mount() builds DOM inside root (a 390x844 portrait layer above
 * the GL canvas) and returns nothing; frame() runs each animation frame.
 */
export interface Screen {
  readonly id: ScreenId;
  mount(root: HTMLElement, ctx: AppContext): void;
  frame(dtMs: number): void;
  unmount(): void;
}
export type ScreenFactory = () => Screen;
