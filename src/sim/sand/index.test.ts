import { describe, it, expect } from 'vitest';
import { factory } from '@/sim/sand';

describe('unit 09: src/sim/sand', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("Powders fall and pile, liquids flow and level, gases rise, solids stay, by density.");
  it.todo("Reactions from the reaction table fire at their integer chance and honour needs on modifiers.");
  it.todo("Only dirty chunks are stepped; a settled grid marks no chunks dirty after one tick.");
  it.todo("Deterministic: two sims with the same inputs give identical grids after 2,000 ticks (golden hash).");
  it.todo("snapshot/restore round-trips byte-identically, including tick and RNG state.");
  it.todo("One tick on a busy 236x200 grid takes under 2 ms on desktop (state the 4x-throttle number in the PR).");
  it.todo("No allocation inside step().");
});
