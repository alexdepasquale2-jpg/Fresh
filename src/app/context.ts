/** Builds the AppContext from the registry. */
import type { AppContext, AppEvents, Screen, ScreenId, Selection, SimFrame } from '@/contracts/app';
import type { Pulse } from '@/contracts/time';
import type { SaveState } from '@/contracts/platform';
import type { GlCore } from '@/contracts/render';
import { createBus } from '@/core/bus';
import { ROOT_SEED } from '@/core/serial';
import { seedToHex } from '@/core/hash';
import { FX_ONE } from '@/core/fixed';
import { registry as R } from './registry';
import { createSimClient } from './sim-client';

/** Serials in the Box on a new game. Never change: saves and share codes rely on them. */
export const STARTER_SERIALS = [0x3f9a77, 0x0b11e5, 0x5a17ee, 0x7a110e, 0xc401a1, 0x9e11a5, 0x2d0ce4] as const;

export interface App {
  ctx: AppContext;
  screens: Record<ScreenId, () => Screen>;
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
  const onFrame = (f: SimFrame) => {
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
  const renderers = { dive: R['render/dive'](), system: R['render/system'](), planet: R['render/planet'](), room: R['render/room']() };
  for (const r of Object.values(renderers)) r.init(gl);

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
  const sp = R['ui/system-planet']();
  const bt = R['ui/battle']();
  const screens: Record<ScreenId, () => Screen> = { bedroom: rb.bedroom, box: rb.box, dive: dh.dive, system: sp.system, planet: sp.planet, outside: bt.outside, battle: bt.battle };

  let screen: ScreenId = 'bedroom';
  bus.on('navigate', ({ to }) => void (screen = to));

  return {
    ctx,
    screens,
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
