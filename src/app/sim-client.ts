import type { SimClient, SimFrame } from '@/contracts/app';
import type { FromWorker, ToWorker } from '@/contracts/worker';
import type { PlanetSpec } from '@/contracts/system';
import type { UniverseSpec } from '@/contracts/universe';
import type { SkyRules, SkyGame } from '@/contracts/sky';
import type { Clock } from '@/contracts/time';

export const createSimClient = (deps: { skyRules: SkyRules; sky: SkyGame; clock: Clock; onFrame: (f: SimFrame) => void }): SimClient => {
  let worker: Worker | null = null;
  let latest: SimFrame | null = null;
  let planet: PlanetSpec | null = null;
  let busy = false;
  const send = (m: ToWorker) => worker?.postMessage(m);
  return {
    open: (universe: UniverseSpec, p: PlanetSpec) => {
      worker ??= new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        busy = false;
        const dirty = m.dirty;
        latest = {
          tick: m.tick,
          civ: m.civ,
          chronicle: m.chronicle,
          grid: { width: m.width, height: m.height, cells: m.cells, chunksX: Math.ceil(m.width / 32), chunksY: Math.ceil(m.height / 32), dirty, clearDirty: () => dirty.fill(0) },
        };
        deps.onFrame(latest);
      };
      planet = p;
      latest = null;
      busy = false;
      send({ type: 'open', universe, planet: p });
    },
    close: () => {
      send({ type: 'close' });
      planet = null;
      latest = null;
    },
    latest: () => latest,
    step: (ticks) => {
      if (!planet || busy || ticks <= 0) return;
      busy = true;
      const sky = deps.sky.skyOf(planet);
      send({ type: 'step', ticks, year: deps.clock.year(), sky, modifiers: deps.skyRules.effects(sky, planet), skySays: deps.skyRules.explain(sky, planet) });
    },
  };
};
