// STUB: replace with the real system generator (unit 04). See README.md.
import type { SystemGenFactory } from '@/contracts/system';
import { child } from '@/core/hash';

export const factory: SystemGenFactory = ({ names }) => ({
  fromStar: (star) => {
    const seed = child(star.seed, 'system');
    const planets = [0, 1].map((i) => {
      const s = child(seed, i);
      return { seed: s, name: names.planet(s), terrain: { seaLevel: 100, roughness: 80, biome: 'salt' as const } };
    });
    return {
      seed,
      name: names.system(seed),
      star,
      orbits: planets.map((_, i) => ({ index: i, ring: i + 1, planet: i, periodTicks: 400 * (i + 1) })),
      planets,
    };
  },
});
