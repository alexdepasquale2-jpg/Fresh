// STUB: replace with the real sky-piece game logic (unit 20). See README.md.
import type { SkyGameFactory, SkyPieceKind, SkyState } from '@/contracts/sky';
import { seedToHex } from '@/core/hash';

export const factory: SkyGameFactory = () => {
  let inventory: Record<SkyPieceKind, number> = { comet: 2, moon: 2, belt: 1, sun: 0, rings: 1, dust: 0 };
  let skies = new Map<string, SkyState>();
  const get = (key: string): SkyState => skies.get(key) ?? { planetKey: key, pieces: [] };
  return {
    inventory: () => inventory,
    grant: (k, n) => void (inventory[k] += n),
    place: (kind, system, orbitIndex) => {
      const orbit = system.orbits[orbitIndex];
      if (!orbit) return { ok: false, reason: 'bad-orbit' };
      if (inventory[kind] <= 0) return { ok: false, reason: 'none-left' };
      const key = seedToHex(system.planets[orbit.planet]!.seed);
      const sky = get(key);
      if (sky.pieces.length >= 4) return { ok: false, reason: 'sky-full' };
      const next = { planetKey: key, pieces: [...sky.pieces, kind] };
      skies.set(key, next);
      inventory[kind]--;
      return { ok: true, sky: next };
    },
    remove: (key, i) => {
      const s = get(key);
      skies.set(key, { planetKey: key, pieces: s.pieces.filter((_, j) => j !== i) });
    },
    skyOf: (planet) => get(seedToHex(planet.seed)),
    snapshot: () => ({ inventory: { ...inventory }, skies: [...skies.values()] }),
    restore: (s) => {
      inventory = { ...s.inventory };
      skies = new Map(s.skies.map((x) => [x.planetKey, x]));
    },
  };
};
