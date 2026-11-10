import { describe, it, expect } from 'vitest';
import { factory } from '@/render/system';

describe('unit 14: src/render/system', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("Draws the star at centre, up to 4 smooth orbits and a planet per orbit moving by periodTicks.");
  it.todo("Placed sky pieces are drawn on their planet orbit with a distinct shape per kind.");
  it.todo("While dragging, a ghost follows the pointer and the orbit under it is highlighted in glow.");
  it.todo("orbitAt(x, y) returns the orbit within a 22 px band (44 px target) or -1.");
  it.todo("Selected orbit uses the glow token; everything else uses design tokens only.");
  it.todo("No allocation in draw(); recovers after context loss.");
});
