import { describe, it, expect } from 'vitest';
import { factory } from '@/gen/planet';

describe('unit 05: src/gen/planet', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("surface() returns GRID_W * GRID_H cells using only ids from universe.materialTable.");
  it.todo("Pure: golden hash of the grid for 3 fixed planets.");
  it.todo("seaLevel measurably controls the share of liquid cells (monotonic over 5 values).");
  it.todo("Land forms at least one continent; no floating single-cell islands of solid in mid-air.");
  it.todo("Returns 1 to 6 village sites, each on a dry land cell with empty space above.");
  it.todo("biome changes the material mix in a measurable way.");
  it.todo("Runs in under 20 ms on a desktop for one planet.");
});
