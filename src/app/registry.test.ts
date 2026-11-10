/** Every stub (and later every real unit) must satisfy the basic contract shapes. */
import { describe, it, expect } from 'vitest';
import { registry as R } from './registry';
import { UniverseSpecSchema } from '@/contracts/universe';
import { PlanetSpecSchema, GRID_W, GRID_H } from '@/contracts/system';
import { SaveStateSchema } from '@/contracts/platform';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { STARTER_SERIALS } from './context';

const atlas = R['atlas/lawsets']().atlas();
const names = R['gen/names']();
const universes = R['gen/universe']({ atlas, names });

describe('registry wires 31 units', () => {
  it('has 31 entries', () => expect(Object.keys(R)).toHaveLength(31));
});

describe('contract smoke', () => {
  it('universes are valid and deterministic', () => {
    for (const s of STARTER_SERIALS) {
      const a = universes.fromSerial(s);
      expect(UniverseSpecSchema.safeParse(a).success).toBe(true);
      expect(JSON.stringify(universes.fromSerial(s))).toBe(JSON.stringify(a));
    }
  });
  it('fold returns 7 children, also at depth 10,000', () => {
    const fold = R['gen/fold']();
    const u = universes.fromSerial(STARTER_SERIALS[0]);
    const root = fold.root(u);
    expect(fold.childrenOf(root)).toHaveLength(7);
    expect(fold.childrenOf({ ...root, depth: 10_000 }).map((c) => c.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it('system, planet and surface line up', () => {
    const u = universes.fromSerial(STARTER_SERIALS[0]);
    const fold = R['gen/fold']();
    const root = fold.root(u);
    const sys = R['gen/system']({ names }).fromStar({ address: root, seed: u.seed, kind: 'main', heat: 100 }, u);
    expect(sys.orbits.length).toBeGreaterThanOrEqual(1);
    expect(sys.orbits.length).toBeLessThanOrEqual(4);
    expect(sys.planets).toHaveLength(sys.orbits.length);
    for (const p of sys.planets) expect(PlanetSpecSchema.safeParse(p).success).toBe(true);
    const surf = R['gen/planet']().surface(sys.planets[0]!, u);
    expect(surf.cells.length).toBe(GRID_W * GRID_H);
    const sim = R['sim/sand']();
    sim.init(sys.planets[0]!, u, surf);
    sim.step(10, R['rules/sky']().effects({ planetKey: '0'.repeat(16), pieces: [] }, sys.planets[0]!));
    const snap = sim.snapshot();
    const sim2 = R['sim/sand']();
    sim2.restore(snap);
    expect(sim2.snapshot()).toEqual(snap);
  });
  it('sky game places pieces', () => {
    const sky = R['game/sky']();
    for (const k of SKY_PIECE_KINDS) expect(sky.inventory()[k]).toBeGreaterThanOrEqual(0);
  });
  it('save schema accepts a fresh game', () => {
    const box = R['game/box']();
    STARTER_SERIALS.forEach((s) => box.add(s));
    const state = {
      version: 1 as const,
      screen: 'bedroom' as const,
      box: box.snapshot(),
      selected: 0,
      light: R['game/light']().snapshot(),
      sky: R['game/sky']().snapshot(),
      clock: { tick: 0, speed: 1 as const },
      savedAtMs: 0,
    };
    expect(SaveStateSchema.safeParse(state).success).toBe(true);
    expect(R['platform/save']().migrate(state)).not.toBeNull();
  });
});
