import { describe, it, expect } from 'vitest';
import { factory } from '@/game/dive';

describe('unit 19: src/game/dive', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("hold moves to falling, release to hovering, release with a star in the children to stopped.");
  it.todo("update advances progress while falling and moves one fold per 1,000 progress; best tracks the max depth.");
  it.todo("Falling drains Light via light.drainFolds; at zero the dive surfaces.");
  it.todo("throwAt on a flicker uses one reliquary and adds its serial to the Box; on an empty child it returns no-flicker.");
  it.todo("Throws fail with no-reliquary after 3, box-full when the Box is full, duplicate when already owned.");
  it.todo("Narration line changes with phase and depth, from a fixed table.");
  it.todo("Deterministic for a fixed input script (golden test).");
});
