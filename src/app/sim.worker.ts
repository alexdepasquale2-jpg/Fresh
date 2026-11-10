/// <reference lib="webworker" />
/** Sim Worker: owns SurfaceSim, Civ and Chronicle for the open planet. */
import type { ToWorker, FromWorker } from '@/contracts/worker';
import { factory as sand } from '@/sim/sand';
import { factory as civF } from '@/sim/civ';
import { factory as chronicleF } from '@/sim/chronicle';
import { factory as planetF } from '@/gen/planet';
import { factory as namesF } from '@/gen/names';

const sim = sand();
const civ = civF();
const chronicle = chronicleF({ names: namesF() });
const planets = planetF();
let open = false;
let planetRef: Extract<ToWorker, { type: 'open' }>['planet'] | null = null;

const post = () => {
  const g = sim.grid();
  const msg: FromWorker = {
    type: 'frame',
    tick: sim.tick(),
    width: g.width,
    height: g.height,
    cells: new Uint8Array(g.cells),
    dirty: new Uint8Array(g.dirty),
    civ: civ.view(),
    chronicle: chronicle.entries(40) as FromWorker['chronicle'],
    env: (() => {
      const e = sim.env();
      return { day: e.day, season: e.season, fieldW: e.fieldW, fieldH: e.fieldH, temp: new Uint8Array(e.temp), humidity: new Uint8Array(e.humidity), wind: e.wind, rain: e.rain, snowing: e.snowing, lightning: e.lightning };
    })(),
  };
  g.clearDirty();
  const env = msg.env as { temp: Uint8Array; humidity: Uint8Array };
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, [msg.cells.buffer, msg.dirty.buffer, env.temp.buffer, env.humidity.buffer]);
};

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'open') {
    const surface = planets.surface(m.planet, m.universe);
    sim.init(m.planet, m.universe, surface);
    civ.init(m.planet, surface);
    chronicle.restore([]);
    planetRef = m.planet;
    open = true;
    post();
  } else if (m.type === 'step' && open && planetRef) {
    sim.step(m.ticks, m.modifiers);
    const surface = sim.drainEvents();
    const events = civ.step(m.ticks, sim.grid(), m.modifiers, sim.env(), surface);
    chronicle.record(events, m.year, planetRef, surface);
    chronicle.explain(m.sky, m.modifiers, m.skySays);
    post();
  } else if (m.type === 'close') {
    open = false;
  }
};
