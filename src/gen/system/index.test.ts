import { describe, it, expect } from 'vitest';
import { factory } from '@/gen/system';

describe('unit 04: src/gen/system', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("fromStar returns 1 to 4 orbits and planets.length === orbits.length.");
  it.todo("Pure in (star, universe): golden test on 3 fixed stars.");
  it.todo("Orbit rings are strictly increasing; periodTicks increase outward (Kepler-like, integer math).");
  it.todo("Every planet passes PlanetSpecSchema; names come from NameGen.");
  it.todo("Star kind and heat shift the orbit count and planet biomes in a way a test can measure over 1,000 stars.");
  it.todo("System name is from NameGen.system and differs from every planet name in the system.");
});
