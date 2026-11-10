import { describe, it, expect } from 'vitest';
import { factory } from '@/game/light';

describe('unit 17: src/game/light', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("Starts full at 8 pips; never below 0 or above 8.");
  it.todo("drainFolds drains a stated number of folds per pip and returns false at zero.");
  it.todo("addGlow accumulates partial progress and adds a pip at 1,000.");
  it.todo("low is true at 2 pips or fewer.");
  it.todo("A dive of about 40 folds is reachable from full but not free (test with the stated rates).");
  it.todo("snapshot/restore round-trips.");
});
