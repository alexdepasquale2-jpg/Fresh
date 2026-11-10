import { describe, it, expect } from 'vitest';
import { factory } from '@/platform/perf';

describe('unit 28: src/platform/perf', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("averageFrameMs tracks a rolling window.");
  it.todo("quality drops after sustained frames over 20 ms and recovers after sustained frames under 14 ms, with hysteresis.");
  it.todo("resolutionScale follows quality within 0.5..1.");
  it.todo("tickBudget sheds sim ticks at low quality but never below 1 when ticks are wanted.");
  it.todo("onChange fires once per quality change.");
});
