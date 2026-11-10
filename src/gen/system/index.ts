// System generator (unit 04).
import type { SystemGenFactory } from '@/contracts/system';
import { child, rng } from '@/core/hash';

const BIOMES = ['ash', 'salt', 'moss', 'tallow', 'glass'] as const;

export const factory: SystemGenFactory = ({ names }) => ({
  fromStar: (star) => {
    const seed = child(star.seed, 'system');
    const r = rng(seed);
    const n = star.kind === 'dwarf' ? r.range(1, 2) : star.kind === 'giant' ? r.range(3, 4) : r.range(2, 4);
    const planets = Array.from({ length: n }, (_, i) => {
      const s = child(seed, i);
      const pr = rng(s);
      // Inner planets run hot (glass, ash), outer ones wet (salt, moss).
      const hot = star.heat + 80 - i * 70;
      const biome = hot > 200 ? (pr.chance(1, 2) ? 'glass' : 'ash') : hot < 40 ? 'salt' : pr.pick(BIOMES);
      return { seed: s, name: names.planet(s), terrain: { seaLevel: Math.max(20, Math.min(220, 60 + i * 40 + pr.range(-30, 30))), roughness: pr.int(256), biome } };
    });
    return {
      seed,
      name: names.system(seed),
      star,
      orbits: planets.map((_, i) => ({ index: i, ring: i + 1, planet: i, periodTicks: 600 * (i + 1) * (i + 1) })),
      planets,
    };
  },
});
