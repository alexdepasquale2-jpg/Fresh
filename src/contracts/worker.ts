import type { PlanetSpec } from './system';
import type { UniverseSpec } from './universe';
import type { SurfaceModifiers, SkyState } from './sky';
import type { CivView, ChronicleEntry } from './sim';

/** Messages main -> sim Worker. */
export type ToWorker =
  | { type: 'open'; universe: UniverseSpec; planet: PlanetSpec }
  | { type: 'step'; ticks: number; year: number; sky: SkyState; modifiers: SurfaceModifiers; skySays: readonly string[] }
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
};
