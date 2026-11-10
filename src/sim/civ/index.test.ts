import { describe, it, expect } from 'vitest';
import { factory } from '@/sim/civ';

describe('unit 10: src/sim/civ', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("Villages found on dry land next to water, never in mid-air or underwater.");
  it.todo("Villages grow with nearby resources, split when large, and die when flooded or buried.");
  it.todo("Every change emits exactly one CivEvent with tick and position.");
  it.todo("glowPerMinute rises with souls and night light; a dead world gives zero.");
  it.todo("Deterministic: golden test of events and view after 2,000 ticks.");
  it.todo("Reads the grid only; never writes cells.");
  it.todo("snapshot/restore round-trips.");
});
