import { describe, it, expect } from 'vitest';
import { factory } from '@/gen/fold';

describe('unit 03: src/gen/fold', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("childrenOf always returns 7 nodes with index 0..6 and child addresses built with mix(pathHash, i) and depth + 1.");
  it.todo("Pure: the same address gives deep-equal children (golden test at depth 1 and depth 10,000).");
  it.todo("No node holds both a star and a flicker; index 0 (centre) never holds a flicker.");
  it.todo("Star density rises with depth then plateaus; measured over 10,000 random addresses per depth band.");
  it.todo("A fall straight down the centre path reaches a star within 40 folds for at least 95% of 1,000 universes.");
  it.todo("Time for 10,000 childrenOf calls at depth 10,000 is within 10% of the same at depth 1.");
  it.todo("Flicker serialNumbers are 24-bit and deterministic in the address.");
});
