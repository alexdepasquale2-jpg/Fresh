import { describe, it, expect } from 'vitest';
import { factory } from '@/gen/universe';

describe('unit 01: src/gen/universe', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("fromSerial(n) returns a spec that passes UniverseSpecSchema for 1,000 serials.");
  it.todo("Same serial gives a byte-identical spec (JSON) across two calls and two generator instances (golden value test).");
  it.todo("serial is formatSerial(serialNumber) and seed is serialToSeed(serialNumber).");
  it.todo("The law set is chosen from atlas.lawSets only; materialTable and reactionTable are copies of that law set.");
  it.todo("palette has 16 distinct #rrggbb colours, index 0 darkest, and respects the law set hue when given.");
  it.todo("Over 1,000 serials every law set in the atlas is chosen at least once and glyphs cover at least 48 of 64 values.");
});
