import type { PlanetSpec } from './system';
import type { UniverseSpec } from './universe';
import type { SurfaceModifiers, SkyState } from './sky';
import type { CivView, ChronicleEntry, SurfaceEnv, Tool, BodyAction } from './sim';

/** Messages main -> sim Worker. */
export type ToWorker =
  | { type: 'open'; universe: UniverseSpec; planet: PlanetSpec }
  | { type: 'step'; ticks: number; year: number; sky: SkyState; modifiers: SurfaceModifiers; skySays: readonly string[] }
  | { type: 'tool'; tool: Tool; x: number; y: number; r: number }
  | { type: 'incarnate'; x: number }
  | { type: 'walk'; x: number }
  | { type: 'ascend' }
  | { type: 'act'; action: BodyAction }
  | { type: 'close' };

/** Messages sim Worker -> main. cells is a transferred copy of the grid. */
export type FromWorker = {
  type: 'frame';
  tick: number;
  width: number;
  height: number;
  cells: Uint8Array;
  dirty: Uint8Array;
  civ: CivView;
  chronicle: ChronicleEntry[];
  /** Copied env; temp and humidity arrays are transferred. */
  env: SurfaceEnv;
};
