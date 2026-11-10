/// <reference lib="webworker" />
/**
 * Sim Worker: owns SurfaceSim, Civ and Chronicle for the open planet, and keeps worlds between
 * visits (src/app/world-store.ts). A world is stored when it is closed, when another is opened,
 * about once a minute while it runs, and when the page hides. Opening a stored world restores it.
 */
import type { ToWorker, FromWorker, WorkerFrame, StoredWorld } from '@/contracts/worker';
import { SOUL_TOOLS } from '@/contracts/sim';
import type { SoulTool, SurfaceTool } from '@/contracts/sim';
import { factory as sand } from '@/sim/sand';
import { factory as civF } from '@/sim/civ';
import { factory as chronicleF } from '@/sim/chronicle';
import { factory as planetF } from '@/gen/planet';
import { factory as namesF } from '@/gen/names';
import { worldKey, saveWorld, loadWorld, forgetWorld, listWorlds, sweepWorlds, WORLDS_CHANNEL } from './world-store';

type Open = Extract<ToWorker, { type: 'open' }>;

const names = namesF();
const planets = planetF();
/** One world's units. */
interface Units { sim: ReturnType<typeof sand>; civ: ReturnType<typeof civF>; chronicle: ReturnType<typeof chronicleF>; lawSet: string; leftAtMs: number }
const makeUnits = (lawSet = ''): Units => ({ sim: sand(), civ: civF(), chronicle: chronicleF({ names }), lawSet, leftAtMs: 0 });
/** The units of the world in hand. */
let cur: Units = makeUnits();
/**
 * The last few worlds stay alive in memory, so going to a sibling planet or the system screen and
 * back in one sitting continues the very same world, exactly. (The units' own snapshots do not
 * carry everything: a world restored from the store goes on plausibly, not identically.)
 * Insertion order is age; the store on disk is what survives a reload.
 */
const LIVE_WORLDS = 4;
const live = new Map<string, Units>();
const keepLive = (key: string, u: Units) => {
  live.delete(key);
  live.set(key, u);
  for (const k of live.keys()) { if (live.size <= LIVE_WORLDS) break; if (k !== key) live.delete(k); }
};
const scope = self as unknown as DedicatedWorkerGlobalScope;
let open = false;
let planetRef: Open['planet'] | null = null;

/** The world in hand. */
interface Held {
  key: string;
  serial: number;
  lawSet: string;
  openId: number | undefined;
  openedAtMs: number;
  /** Something happened since it was last stored. */
  changed: boolean;
  /** Forgotten or wiped while open: it must not be written back. */
  noSave: boolean;
}
let held: Held | null = null;
/** Bumped by every open, so a slow read for a world already left is dropped. */
let gen = 0;
let loading = false;
/** Messages that arrived while a stored world was being read; run in order once it stands. */
let waiting: ToWorker[] = [];
/** Store work runs one at a time, in the order asked. */
let chain: Promise<void> = Promise.resolve();
const queue = (f: () => Promise<void>) => { chain = chain.then(f).catch(() => {}); };

const SAVE_EVERY_MS = 60_000;
let lastSaveMs = 0;
let lastSaveCostMs = 0;

const tellWorlds = (index: StoredWorld[] | null, lastSave?: { key: string; ms: number; bytes: number }) => {
  if (!index) return;
  const msg: FromWorker = { type: 'worlds', index, lastSave };
  scope.postMessage(msg);
};

/** Copy the world out now (synchronous) and write it when the store is free. Never throws. */
const store = (urgent = false) => {
  const h = held;
  if (!open || !h || h.noSave || !h.changed) return;
  try {
    const t0 = Date.now();
    const g = cur.sim.grid();
    const view = cur.civ.view();
    const input = {
      sand: cur.sim.snapshot(), civ: cur.civ.snapshot(), chronicle: cur.chronicle.snapshot(),
      info: { key: h.key, serial: h.serial, tick: cur.sim.tick(), souls: view.souls, villages: view.villages.length, era: view.age ?? view.era, savedAtMs: t0, openedAtMs: h.openedAtMs },
      lawSet: h.lawSet, width: g.width, height: g.height, urgent,
    };
    h.changed = false;
    lastSaveMs = t0;
    cur.leftAtMs = t0;
    queue(async () => {
      // Forgotten or wiped between the copy and the write.
      if (h.noSave) return;
      const index = await saveWorld(input);
      lastSaveCostMs = Date.now() - t0;
      if (!index) { h.changed = true; return; }
      const mine = index.find((i) => i.key === h.key);
      tellWorlds(index, { key: h.key, ms: lastSaveCostMs, bytes: mine?.bytes ?? 0 });
    });
  } catch { /* the world goes on unsaved */ }
};

const begin = (m: Open) => {
  const surface = planets.surface(m.planet, m.universe);
  cur.sim.init(m.planet, m.universe, surface);
  cur.civ.init(m.planet, surface);
  cur.chronicle.restore([]);
};

const post = (opened?: WorkerFrame['opened']) => {
  const g = cur.sim.grid();
  const msg: WorkerFrame = {
    type: 'frame',
    openId: held?.openId,
    opened,
    tick: cur.sim.tick(),
    width: g.width,
    height: g.height,
    cells: new Uint8Array(g.cells),
    dirty: new Uint8Array(g.dirty),
    civ: cur.civ.view(),
    chronicle: cur.chronicle.entries(40) as WorkerFrame['chronicle'],
    env: (() => {
      const e = cur.sim.env();
      return { day: e.day, season: e.season, fieldW: e.fieldW, fieldH: e.fieldH, temp: new Uint8Array(e.temp), humidity: new Uint8Array(e.humidity), wind: e.wind, rain: e.rain, snowing: e.snowing, lightning: e.lightning };
    })(),
  };
  // A world's first frame is all of it, whatever was drawn of it before.
  if (opened) msg.dirty.fill(1);
  g.clearDirty();
  const env = msg.env as { temp: Uint8Array; humidity: Uint8Array };
  scope.postMessage(msg, [msg.cells.buffer, msg.dirty.buffer, env.temp.buffer, env.humidity.buffer]);
};

const touched = () => { if (held) held.changed = true; };

/** Leaving a world: the body is given up (a stored world cannot hold one), then it is stored. */
const leave = () => {
  if (!open) return;
  try { if (cur.civ.view().avatar) { cur.civ.ascend(); touched(); } } catch { /* it stays as it is */ }
  store();
};

const openWorld = (m: Open) => {
  // The world being left is stored first.
  leave();
  const my = ++gen;
  open = false;
  waiting = [];
  const key = worldKey(m.universe.serialNumber, m.planet.seed);
  const h: Held = { key, serial: m.universe.serialNumber, lawSet: m.universe.laws.id, openId: m.id, openedAtMs: Date.now(), changed: false, noSave: false };
  held = h;
  planetRef = m.planet;
  lastSaveMs = Date.now();
  const stand = (opened: NonNullable<WorkerFrame['opened']>) => {
    loading = false;
    open = true;
    keepLive(key, cur);
    post(opened);
    const later = waiting;
    waiting = [];
    for (const w of later) handle(w);
  };
  if (m.fresh) {
    cur = makeUnits(h.lawSet);
    begin(m);
    // The old snapshot is not this world any more.
    queue(async () => tellWorlds(await forgetWorld(key)));
    stand({ restored: false });
    return;
  }
  const alive = live.get(key);
  if (alive && alive.lawSet === h.lawSet) {
    // Still in memory from earlier in this sitting: the same world, to the cell.
    cur = alive;
    h.changed = true;
    stand({ restored: true, savedAtMs: alive.leftAtMs || Date.now(), restoreMs: 0 });
    return;
  }
  loading = true;
  queue(async () => {
    if (my !== gen) return;
    const t0 = Date.now();
    let rec: Awaited<ReturnType<typeof loadWorld>> = null;
    let restored = false;
    try {
      // A fresh world first: the units need their planet before they can take a snapshot, and
      // it is what stands if nothing usable is stored.
      cur = makeUnits(h.lawSet);
      begin(m);
      const g = cur.sim.grid();
      rec = await loadWorld(key, { lawSet: h.lawSet, width: g.width, height: g.height });
      // A record that was there but useless has been deleted: say what is left.
      if (!rec) tellWorlds(await listWorlds());
      if (my !== gen) return;
      if (rec) {
        try {
          if (rec.sand.length !== cur.sim.snapshot().length) throw new Error('size');
          cur.sim.restore(rec.sand);
          cur.civ.restore(rec.civ);
          cur.chronicle.restore(rec.chronicle);
          // Reading it back proves the civ took it.
          cur.civ.view();
          if (cur.sim.tick() !== rec.tick) throw new Error('tick');
          restored = true;
          // Stored again on the way out, so the store knows it was the latest opened.
          h.changed = true;
        } catch {
          // Whatever it left half done is thrown away with it.
          cur = makeUnits(h.lawSet);
          begin(m);
          queue(async () => tellWorlds(await forgetWorld(key)));
        }
      }
    } catch { restored = false; }
    if (my !== gen) return;
    try { stand(restored && rec ? { restored: true, savedAtMs: rec.savedAtMs, restoreMs: Date.now() - t0 } : { restored: false }); } catch { loading = false; }
  });
};

const handle = (m: ToWorker) => {
  if (m.type === 'open') {
    openWorld(m);
    return;
  }
  if (m.type === 'forget') {
    if (held?.key === m.key) held.noSave = true;
    live.delete(m.key);
    queue(async () => tellWorlds(await forgetWorld(m.key)));
    return;
  }
  if (loading) {
    // The stored world is still being read. Nothing is lost: it runs when the world stands.
    if (m.type === 'close') { gen++; loading = false; waiting = []; held = null; } else waiting.push(m);
    return;
  }
  if (m.type === 'step' && open && planetRef) {
    cur.sim.step(m.ticks, m.modifiers);
    const surface = cur.sim.drainEvents();
    const events = cur.civ.step(m.ticks, cur.sim.grid(), m.modifiers, cur.sim.env(), surface);
    cur.chronicle.record(events, m.year, planetRef, surface);
    cur.chronicle.explain(m.sky, m.modifiers, m.skySays);
    touched();
    post();
    // About once a minute, and never so often that storing costs more than a hundredth of the time.
    if (Date.now() - lastSaveMs > Math.max(SAVE_EVERY_MS, lastSaveCostMs * 100)) store();
  } else if (m.type === 'tool' && open) {
    if (!SOUL_TOOLS.includes(m.tool as SoulTool)) cur.sim.apply(m.tool as SurfaceTool, m.x, m.y, m.r);
    cur.civ.apply(m.tool, m.x, m.y);
    touched();
    post();
  } else if (m.type === 'incarnate' && open) {
    cur.civ.incarnate(m.x);
    touched();
    post();
  } else if (m.type === 'walk' && open) {
    cur.civ.walk(m.x);
    touched();
  } else if (m.type === 'act' && open) {
    cur.civ.act(m.action);
    touched();
    post();
  } else if (m.type === 'ascend' && open) {
    cur.civ.ascend();
    touched();
    post();
  } else if (m.type === 'save') {
    store(m.urgent);
  } else if (m.type === 'close') {
    leave();
    open = false;
    held = null;
  }
};

self.onmessage = (e: MessageEvent<ToWorker>) => handle(e.data);

// "Start a new game" wipes the store from the main thread: the world in hand must not be written back.
try {
  if (typeof BroadcastChannel === 'function') {
    new BroadcastChannel(WORLDS_CHANNEL).onmessage = (e: MessageEvent<{ type?: string }>) => {
      if (e.data?.type !== 'cleared') return;
      live.clear();
      if (held) held.noSave = true;
    };
  }
} catch { /* no channel, no wipe to hear */ }
queue(sweepWorlds);
