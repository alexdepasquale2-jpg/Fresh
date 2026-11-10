import { describe, it, expect } from 'vitest';
import { factory } from '@/sim/chronicle';

describe('unit 11: src/sim/chronicle', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("record() turns each CivEvent into one entry with year and grammar text naming the village.");
  it.todo("explain() fills reason only on entries that have none; reasons never change once set.");
  it.todo("Reasons cite the sky (from skySays and modifiers) or an earlier event, never random text.");
  it.todo("entries() is newest first and respects limit.");
  it.todo("Deterministic text for a fixed event list (golden test).");
  it.todo("Lines are under 90 characters in the IM Fell voice: no modern words (blocklist test).");
});
