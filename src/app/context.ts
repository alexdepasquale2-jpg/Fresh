/** Builds the AppContext from the registry. */
import type { AppContext, AppEvents, Screen, ScreenId, Selection, SimFrame } from '@/contracts/app';
import type { Pulse } from '@/contracts/time';
import type { SaveState } from '@/contracts/platform';
import type { GlCore } from '@/contracts/render';
import { createBus } from '@/core/bus';
import { ROOT_SEED } from '@/core/serial';
import { seedToHex } from '@/core/hash';
import { FX_ONE } from '@/core/fixed';
import { core as R, lazy } from './units';
import type { SystemRenderer, PlanetRenderer } from '@/contracts/render';
import { createSimClient } from './sim-client';
import type { Opened } from './sim-client';

/** Serials in the Box on a new game. Never change: saves and share codes rely on them. */
export const STARTER_SERIALS = [0x3f9a77, 0x0b11e5, 0x5a17ee, 0x7a110e, 0xc401a1, 0x9e11a5, 0x2d0ce4] as const;

export interface App {
  ctx: AppContext;
  screens: Record<ScreenId, () => Screen>;
  /** Fetch the code a screen needs. Null when it is already here; otherwise wait before calling screens[id](). */
  prepare(id: ScreenId): Promise<void> | null;
  snapshot(): SaveState;
  restore(s: SaveState): void;
}

export const createApp = (gl: GlCore, go: (to: ScreenId) => void, persist: () => void): App => {
  const bus = createBus<AppEvents>();
  const atlasMod = R['atlas/lawsets']();
  const atlas = atlasMod.atlas();
  const names = R['gen/names']();
  const universes = R['gen/universe']({ atlas, names });
  const fold = R['gen/fold']();
  const light = R['game/light']();
  const box = R['game/box']();
  const sky = R['game/sky']();
  const skyRules = R['rules/sky']();
  const timebase = R['sim/timebase']();
  const clock = timebase.clock({ names, seed: ROOT_SEED });
  const pulses = new Map<string, Pulse>();
  const selection: Selection = { universe: null, star: null, system: null, planetIndex: 0 };
  const fallbackPulse = timebase.pulse({ milliHz: 800, seed: ROOT_SEED, couplingFx: FX_ONE >> 4 });
  const pulse = (): Pulse => {
    const u = selection.universe;
    if (!u) return fallbackPulse;
    const k = seedToHex(u.seed);
    let p = pulses.get(k);
    if (!p) pulses.set(k, (p = timebase.pulse({ milliHz: u.pulseMilliHz, seed: u.seed, couplingFx: FX_ONE >> 4 })));
    return p;
  };
  // Glow from a watched world refills Light: 50 points per glow per minute (1000 points = 1 pip).
  let lastSimTick = 0;
  let glowAcc = 0;
  let seenLaunches = 0;
  let lastOrbitTick = 0;
  const onFrame = (f: SimFrame, opened?: Opened) => {
    // A world's first frame is where it stands, not time that passed: a restored world must not
    // pay out the glow of all its years again, nor launch again what it already put in orbit.
    if (opened) {
      lastSimTick = f.tick;
      lastOrbitTick = f.tick;
      seenLaunches = opened.restored ? f.civ.launches : 0;
    }
    const dt = Math.max(0, f.tick - lastSimTick);
    lastSimTick = f.tick;
    glowAcc += (f.civ.glowPerMinute * 50 * dt) / 1200;
    const whole = Math.floor(glowAcc);
    if (whole > 0) {
      glowAcc -= whole;
      light.addGlow(whole);
      box.recordGlow(box.selected(), whole);
    }
    // What a universe's watched world has become is what it fights with.
    const civ = f.civ;
    const bestEnl = civ.villages.reduce((n, v) => Math.max(n, v.enlightenment), 0);
    const faith = civ.villages[0]?.belief ?? 'none';
// What they put into orbit stays there, feeds your light, and sometimes comes back as a gift.
    if (f.tick < lastOrbitTick) seenLaunches = 0;
    lastOrbitTick = f.tick;
    const planet = selection.system?.planets[selection.planetIndex];
    if (planet && civ.launches > seenLaunches) {
      const n = civ.launches - seenLaunches;
      seenLaunches = civ.launches;
      const st = sky.build(seedToHex(planet.seed), n);
      light.addGlow(400 * n);
      if ((st.built ?? 0) % 3 === 0) sky.grant((['moon', 'rings', 'comet', 'belt', 'dust', 'sun'] as const)[(st.built ?? 0) % 6]!, 1);
      bus.emit('sky:changed', { planetKey: st.planetKey });
    }
    const orbiters = selection.system ? selection.system.planets.reduce((n, p) => n + (sky.skyOf(p).built ?? 0), 0) : 0;
    box.recordLife(box.selected(), { souls: civ.souls, era: civ.era, belief: faith, enlightenment: bestEnl, prosperity: civ.prosperity, orbiters });
    bus.emit('sim:frame', { tick: f.tick });
  };
  // The system and planet renderers are fetched with their screens; until then these stand in.
  const idleSystem: SystemRenderer = { init: () => {}, draw: () => {}, dispose: () => {}, orbitAt: () => -1 };
  const idlePlanet: PlanetRenderer = { init: () => {}, draw: () => {}, dispose: () => {} } as unknown as PlanetRenderer;
  const renderers: { dive: AppContext['renderers']['dive']; system: SystemRenderer; planet: PlanetRenderer; room: AppContext['renderers']['room'] } =
    { dive: R['render/dive'](), system: idleSystem, planet: idlePlanet, room: R['render/room']() };
  renderers.dive.init(gl);
  renderers.room.init(gl);

  const ctx: AppContext = {
    bus,
    gl,
    atlas,
    names,
    universes,
    fold,
    systems: R['gen/system']({ names }),
    planets: R['gen/planet'](),
    skyRules,
    sky,
    light,
    box,
    dive: R['game/dive']({ fold, light, box }),
    clock,
    pulse,
    sim: createSimClient({ skyRules, sky, clock, onFrame }),
    input: R['platform/input'](),
    save: R['platform/save'](),
    audio: R['platform/audio'](),
    voice: R['platform/edge-voice']({ endpoint: null }),
    perf: R['platform/perf'](),
    renderers,
    selection,
    battles: R['game/battle']({ seed: ROOT_SEED }),
    merger: R['game/merge']({ universes }),
    battle: null,
    rivalsBeaten: new Set<number>(),
    go,
    persist,
  };

  const rb = R['ui/room-box']();
  const dh = R['ui/dive-hud']();
  const screens: Record<ScreenId, () => Screen> = {
    bedroom: rb.bedroom, box: rb.box, dive: dh.dive,
    system: () => notLoaded('system'), planet: () => notLoaded('planet'), outside: () => notLoaded('outside'),
    battle: () => notLoaded('battle'), mirror: () => notLoaded('mirror'), town: () => notLoaded('town'),
  };
  const notLoaded = (id: ScreenId): Screen => { throw new Error(`screen ${id} was used before prepare()`); };
  // Each group of lazy screens is fetched once; a failed fetch is forgotten so it can be tried again.
  const groups: Partial<Record<ScreenId, () => Promise<void>>> = {};
  const once = (load: () => Promise<void>) => {
    let p: Promise<void> | null = null;
    return () => (p ??= load().catch((e: unknown) => { p = null; throw e; }));
  };
  const worlds = once(async () => {
    const [rs, rp, sp] = await Promise.all([lazy['render/system'](), lazy['render/planet'](), lazy['ui/system-planet']()]);
    const sys = rs();
    const pl = rp();
    sys.init(gl);
    pl.init(gl);
    renderers.system = sys;
    renderers.planet = pl;
    const f = sp();
    screens.system = f.system;
    screens.planet = f.planet;
  });
  const battle = once(async () => {
    const f = (await lazy['ui/battle']())();
    screens.outside = f.outside;
    screens.battle = f.battle;
  });
  const mirror = once(async () => void (screens.mirror = (await lazy['ui/mirror']())().mirror));
  const town = once(async () => void (screens.town = (await lazy['ui/town']())().town));
  groups.system = worlds;
  groups.planet = worlds;
  groups.outside = battle;
  groups.battle = battle;
  groups.mirror = mirror;
  groups.town = town;
  const ready = new Set<ScreenId>(['bedroom', 'box', 'dive']);
  const prepare = (id: ScreenId): Promise<void> | null => {
    if (ready.has(id)) return null;
    const g = groups[id];
    return g ? g().then(() => void ready.add(id)) : null;
  };

  let screen: ScreenId = 'bedroom';
  bus.on('navigate', ({ to }) => void (screen = to));

  return {
    ctx,
    screens,
    prepare,
    snapshot: () => ({
      version: 1,
      screen,
      box: box.snapshot(),
      selected: box.selected(),
      light: light.snapshot(),
      sky: sky.snapshot(),
      clock: clock.snapshot(),
      savedAtMs: Date.now(),
      rivalsBeaten: [...ctx.rivalsBeaten],
    }),
    restore: (s) => {
      box.restore(s.box);
      box.select(s.selected);
      light.restore(s.light);
      sky.restore(s.sky);
      clock.restore(s.clock);
      for (const id of s.rivalsBeaten ?? []) ctx.rivalsBeaten.add(id);
    },
  };
};
