import type { SimClient, SimFrame } from '@/contracts/app';
import type { FromWorker, ToWorker, StoredWorld } from '@/contracts/worker';
import type { PlanetSpec } from '@/contracts/system';
import type { UniverseSpec } from '@/contracts/universe';
import type { SkyRules, SkyGame } from '@/contracts/sky';
import type { Clock } from '@/contracts/time';
import { listWorlds, worldKey, WORLDS_CHANNEL } from './world-store';

/** How a world came to stand, given with its first frame only. */
export interface Opened { restored: boolean; awayMs: number | null }

export const createSimClient = (deps: { skyRules: SkyRules; sky: SkyGame; clock: Clock; onFrame: (f: SimFrame, opened?: Opened) => void }): SimClient => {
  let worker: Worker | null = null;
  let latest: SimFrame | null = null;
  let planet: PlanetSpec | null = null;
  let openSerial: unknown = null;
  let busy = false;
  /** Frames carry the id of the open they belong to; frames of a world already left are dropped. */
  let openId = 0;
  let openedTick: number | null = null;
  let awayMs: number | null = null;
  /** What the store holds, by world key. Read once at boot, then kept current by the Worker. */
  const stored = new Map<string, StoredWorld>();
  const setIndex = (list: readonly StoredWorld[]) => {
    stored.clear();
    for (const i of list) stored.set(i.key, i);
  };
  void listWorlds().then((list) => { if (stored.size === 0) setIndex(list); });

  const stats: { saveMs: number | null; restoreMs: number | null; bytes: number | null } = { saveMs: null, restoreMs: null, bytes: null };
  const send = (m: ToWorker) => worker?.postMessage(m);
  const start = (): Worker => {
    if (worker) return worker;
    worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === 'worlds') { setIndex(m.index); if (m.lastSave) { stats.saveMs = m.lastSave.ms; stats.bytes = m.lastSave.bytes; } return; }
      if (m.openId !== undefined && m.openId !== openId) return;
      if (!planet) return;
      busy = false;
      const dirty = m.dirty;
      latest = {
        tick: m.tick,
        civ: m.civ,
        chronicle: m.chronicle,
        env: m.env,
        grid: { width: m.width, height: m.height, cells: m.cells, chunksX: Math.ceil(m.width / 32), chunksY: Math.ceil(m.height / 32), dirty, clearDirty: () => dirty.fill(0) },
      };
      let opened: Opened | undefined;
      if (m.opened) {
        openedTick = m.tick;
        awayMs = m.opened.restored && m.opened.savedAtMs !== undefined ? Math.max(0, Date.now() - m.opened.savedAtMs) : null;
        opened = { restored: m.opened.restored, awayMs };
        if (m.opened.restored) stats.restoreMs = m.opened.restoreMs ?? null;
      }
      deps.onFrame(latest, opened);
    };
    return worker;
  };

  // The page going away: ask for a last write. A hidden page usually lives long enough for a
  // whole one; pagehide gets the short (uncompressed) kind.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.hidden && planet) send({ type: 'save' }); });
    window.addEventListener('pagehide', () => { if (planet) send({ type: 'save', urgent: true }); });
  }
  // "Start a new game" emptied the store.
  try {
    if (typeof BroadcastChannel === 'function') {
      new BroadcastChannel(WORLDS_CHANNEL).onmessage = (e: MessageEvent<{ type?: string }>) => { if (e.data?.type === 'cleared') stored.clear(); };
    }
  } catch { /* no channel */ }

  const keyOf = (u: UniverseSpec, p: PlanetSpec) => worldKey(u.serialNumber, p.seed);
  return {
    open: (universe: UniverseSpec, p: PlanetSpec, opts?: { fresh?: boolean }) => {
      start();
      planet = p;
      openSerial = universe.serialNumber;
      latest = null;
      busy = false;
      openedTick = null;
      awayMs = null;
      send({ type: 'open', universe, planet: p, id: ++openId, fresh: opts?.fresh });
    },
    close: () => {
      send({ type: 'close' });
      planet = null;
      latest = null;
      openedTick = null;
      awayMs = null;
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
    hasStored: (u, p) => stored.has(keyOf(u, p)),
    storedInfo: (u, p) => {
      const i = stored.get(keyOf(u, p));
      return i ? { tick: i.tick, souls: i.souls, villages: i.villages, era: i.era, savedAtMs: i.savedAtMs, bytes: i.bytes } : null;
    },
    forget: (u, p) => {
      const key = keyOf(u, p);
      stored.delete(key);
      start().postMessage({ type: 'forget', key } satisfies ToWorker);
    },
    openedTick: () => openedTick,
    awayMs: () => awayMs,
    storeStats: () => ({ ...stats }),
    saveNow: () => { if (planet) send({ type: 'save' }); },
  };
};
