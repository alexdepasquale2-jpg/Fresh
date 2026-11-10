/**
 * Every unit's index.ts exports `factory` with exactly one of these types.
 * src/app/registry.ts imports them; units never import each other.
 */
import type { UniverseGenFactory, NameGenFactory } from './universe';
import type { FoldGenFactory } from './fold';
import type { SystemGenFactory, PlanetGenFactory } from './system';
import type { SkyRulesFactory, SkyGameFactory } from './sky';
import type { SurfaceSimFactory, CivFactory, ChronicleFactory } from './sim';
import type { ClockFactory, PulseFactory } from './time';
import type { DiveRendererFactory, SystemRendererFactory, PlanetRendererFactory, RoomRendererFactory } from './render';
import type { LightFactory, BoxFactory, DiveFactory } from './game';
import type { ScreenFactory } from './app';
import type { SaveStoreFactory, AudioFactory, InputFactory, EdgeVoiceFactory, PerfFactory } from './platform';
import type { Atlas, LawSet } from './atlas';
import type { BattlesFactory } from './battle';
import type { MergerFactory } from './merge';

export interface TimebaseFactory {
  clock: ClockFactory;
  pulse: PulseFactory;
}
export interface AtlasLawsetsModule {
  lawSets(): readonly LawSet[];
  atlas(): Atlas;
}
export interface AtlasToolModule {
  validate(raw: unknown): { ok: boolean; errors: string[] };
  stabilityTest(lawSet: LawSet, ticks: number): { ok: boolean; reason: string };
  score(lawSet: LawSet): number;
  emit(lawSets: readonly LawSet[]): string;
}

export interface UnitFactories {
  'gen/universe': UniverseGenFactory;
  'gen/names': NameGenFactory;
  'gen/fold': FoldGenFactory;
  'gen/system': SystemGenFactory;
  'gen/planet': PlanetGenFactory;
  'atlas/lawsets': () => AtlasLawsetsModule;
  'rules/sky': SkyRulesFactory;
  'tools/atlas': () => AtlasToolModule;
  'sim/sand': SurfaceSimFactory;
  'sim/civ': CivFactory;
  'sim/chronicle': ChronicleFactory;
  'sim/timebase': () => TimebaseFactory;
  'render/dive': DiveRendererFactory;
  'render/system': SystemRendererFactory;
  'render/planet': PlanetRendererFactory;
  'render/room': RoomRendererFactory;
  'game/light': LightFactory;
  'game/box': BoxFactory;
  'game/dive': DiveFactory;
  'game/sky': SkyGameFactory;
  'ui/room-box': () => { bedroom: ScreenFactory; box: ScreenFactory };
  'ui/dive-hud': () => { dive: ScreenFactory };
  'ui/system-planet': () => { system: ScreenFactory; planet: ScreenFactory };
  'platform/save': SaveStoreFactory;
  'platform/audio': AudioFactory;
  'platform/input': InputFactory;
  'platform/edge-voice': EdgeVoiceFactory;
  'platform/perf': PerfFactory;
  'game/battle': BattlesFactory;
  'game/merge': MergerFactory;
  'ui/battle': () => { outside: ScreenFactory; battle: ScreenFactory };
}

/**
 * A /dev gallery entry. Each unit adds src/<unit>/demo.ts exporting
 * `demo: Demo`; the gallery discovers it with import.meta.glob. mount()
 * runs the unit alone with a fixed seed and returns a cleanup function.
 */
export interface Demo {
  readonly title: string;
  mount(root: HTMLElement): () => void;
}
