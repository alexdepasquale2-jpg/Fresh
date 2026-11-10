import { describe, it, expect } from 'vitest';
import { factory } from '@/game/box';

describe('unit 18: src/game/box', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("Exactly 25 slots; add fills the first empty slot and returns its index.");
  it.todo("add returns -1 when full or when the serial is already in the Box.");
  it.todo("select clamps to 0..24.");
  it.todo("recordDepth keeps the maximum; recordTended and recordGlow accumulate.");
  it.todo("snapshot/restore round-trips and snapshots are copies.");
  it.todo("count matches the number of filled slots.");
});
