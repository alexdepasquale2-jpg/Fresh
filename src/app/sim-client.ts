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
  let openSerial: unknown = null;
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
          env: m.env,
          grid: { width: m.width, height: m.height, cells: m.cells, chunksX: Math.ceil(m.width / 32), chunksY: Math.ceil(m.height / 32), dirty, clearDirty: () => dirty.fill(0) },
        };
        deps.onFrame(latest!);
      };
      planet = p;
      openSerial = universe.serialNumber;
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
    isOpen: (u, p) => !!planet && !!latest && openSerial === u.serialNumber && planet.seed.hi === p.seed.hi && planet.seed.lo === p.seed.lo,
    tool: (tool, x, y, r) => { if (planet) worker?.postMessage({ type: 'tool', tool, x, y, r } satisfies ToWorker); },
    incarnate: (x) => { if (planet) worker?.postMessage({ type: 'incarnate', x } satisfies ToWorker); },
    walk: (x) => { if (planet) worker?.postMessage({ type: 'walk', x } satisfies ToWorker); },
    act: (action) => { if (planet) worker?.postMessage({ type: 'act', action } satisfies ToWorker); },
    ascend: () => { if (planet) worker?.postMessage({ type: 'ascend' } satisfies ToWorker); },
    step: (ticks) => {
      if (!planet || busy || ticks <= 0) return;
      busy = true;
      const sky = deps.sky.skyOf(planet);
      send({ type: 'step', ticks, year: deps.clock.year(), sky, modifiers: deps.skyRules.effects(sky, planet), skySays: deps.skyRules.explain(sky, planet) });
    },
  };
};
