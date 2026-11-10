import { describe, it, expect } from 'vitest';
import { factory } from './index';

describe('unit 06: atlas/lawsets', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("At least 8 JSON files, each passing LawSetSchema; ids are unique and match file names.");
  it.todo("Every law set has material id 0 named \"empty\" and at least one solid, one powder and one liquid.");
  it.todo("Every reaction names only materials that exist in its law set.");
  it.todo("Each law set has 1 to 4 tags shown to the player and a distinct pulseMilliHz.");
  it.todo("Includes \"cold-fire\" and \"slow-time\" plus six more, each with a one-line comment in this README on what makes it different.");
  it.todo("At least half the law sets have reactions gated by a sky modifier (needs), so the sky matters.");
  it.todo("The atlas factory loads every file and passes AtlasSchema.");
});
