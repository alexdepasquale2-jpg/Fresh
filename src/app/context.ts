/** Builds the AppContext from the registry. */
import type { AppContext, AppEvents, Screen, ScreenId, Selection } from '@/contracts/app';
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
    sim: createSimClient({ skyRules, sky, clock, onFrame: (f) => bus.emit('sim:frame', { tick: f.tick }) }),
    input: R['platform/input'](),
    save: R['platform/save'](),
    audio: R['platform/audio'](),
    voice: R['platform/edge-voice']({ endpoint: null }),
    perf: R['platform/perf'](),
    renderers,
    selection,
    go,
    persist,
  };

  const rb = R['ui/room-box']();
  const dh = R['ui/dive-hud']();
  const sp = R['ui/system-planet']();
  const screens: Record<ScreenId, () => Screen> = { bedroom: rb.bedroom, box: rb.box, dive: dh.dive, system: sp.system, planet: sp.planet };

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
    }),
    restore: (s) => {
      box.restore(s.box);
      box.select(s.selected);
      light.restore(s.light);
      sky.restore(s.sky);
      clock.restore(s.clock);
    },
  };
};
