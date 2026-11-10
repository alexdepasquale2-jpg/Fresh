import type { PlanetSpec } from './system';
import type { UniverseSpec } from './universe';
import type { SurfaceModifiers, SkyState } from './sky';
import type { CivView, ChronicleEntry, SurfaceEnv, Tool, BodyAction } from './sim';

/** Messages main -> sim Worker. */
export type ToWorker =
  /**
   * Open a world. If a snapshot of it is stored it is restored and goes on from where it stood;
   * `fresh` starts it from its first morning instead. `id` is echoed on every frame of this world.
   */
  | { type: 'open'; universe: UniverseSpec; planet: PlanetSpec; id?: number; fresh?: boolean }
  | { type: 'step'; ticks: number; year: number; sky: SkyState; modifiers: SurfaceModifiers; skySays: readonly string[] }
  | { type: 'tool'; tool: Tool; x: number; y: number; r: number }
  | { type: 'incarnate'; x: number }
  | { type: 'walk'; x: number }
  | { type: 'ascend' }
  | { type: 'act'; action: BodyAction }
  /** Store the open world (if it changed) and let it go. */
  | { type: 'close' }
  /** Store the open world now. `urgent`: the page is going away, write the shortest way. */
  | { type: 'save'; urgent?: boolean }
  /** Delete a stored world by key (see src/app/world-store.ts). If it is the open one it is not stored again. */
  | { type: 'forget'; key: string };

/** One stored world, as the index knows it. */
export interface StoredWorld {
  /** Universe serial + planet seed. */
  readonly key: string;
  readonly serial: number;
  readonly tick: number;
  readonly souls: number;
  readonly villages: number;
  /** True highest era 0..8 (CivView.age, or era where absent). */
  readonly era: number;
  /** Real time (ms since epoch) it was last stored, and last opened. */
  readonly savedAtMs: number;
  readonly openedAtMs: number;
  /** Bytes on disk. */
  readonly bytes: number;
}

/** Messages sim Worker -> main. cells is a transferred copy of the grid. */
export type FromWorker = WorkerFrame | WorkerWorlds;
/** What is stored changed (a save, a forget, an eviction). */
export interface WorkerWorlds {
  type: 'worlds';
  index: StoredWorld[];
  /** How long the last save took, and how big it was. */
  lastSave?: { key: string; ms: number; bytes: number };
}
export type WorkerFrame = {
  type: 'frame';
  /** The `id` of the open message this world came from. */
  openId?: number;
  /** Only on the first frame after open: whether it was restored, and when it was stored. */
  opened?: { restored: boolean; savedAtMs?: number; restoreMs?: number };
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
