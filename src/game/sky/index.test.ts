import { describe, it, expect } from 'vitest';
import { factory } from '@/game/sky';

describe('unit 20: src/game/sky', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("place decrements the inventory and appends to the planet sky.");
  it.todo("place fails with none-left, sky-full (4 pieces) or bad-orbit.");
  it.todo("remove returns the piece to the inventory.");
  it.todo("skyOf returns an empty sky for unknown planets.");
  it.todo("grant adds pieces (source decided in Prompt 2; see docs/DESIGN.md open decisions).");
  it.todo("snapshot/restore round-trips.");
});
