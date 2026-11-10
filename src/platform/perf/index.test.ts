import { describe, it, expect, beforeEach } from 'vitest';
import { factory, perfControl } from '@/platform/perf';

const run = (p: ReturnType<typeof factory>, ms: number, forMs: number) => {
  for (let t = 0; t < forMs; t += ms) p.sample(ms);
};
const warm = (p: ReturnType<typeof factory>) => { for (let i = 0; i < 30; i++) p.sample(16.7); };

describe('unit 28: src/platform/perf', () => {
  beforeEach(() => perfControl.setMode('auto'));

  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it('averageFrameMs tracks a rolling window.', () => {
    const p = factory();
    warm(p);
    run(p, 10, 1000);
    expect(p.averageFrameMs()).toBeCloseTo(10, 3);
    run(p, 30, 30 * 240);
    expect(p.averageFrameMs()).toBeCloseTo(30, 3);
  });
  it('quality drops after sustained slow frames and recovers after a longer fast run, with hysteresis.', () => {
    const p = factory();
    warm(p);
    run(p, 30, 1000);
    expect(p.quality()).toBe(2);
    run(p, 30, 700);
    expect(p.quality()).toBe(1);
    run(p, 20, 6000); // between the two bars: holds
    expect(p.quality()).toBe(1);
    run(p, 16.7, 3000);
    expect(p.quality()).toBe(1);
    run(p, 16.7, 2000);
    expect(p.quality()).toBe(2);
  });
  it('ignores a lone huge frame and backs off after a relapse.', () => {
    const p = factory();
    warm(p);
    run(p, 16.7, 1000);
    p.sample(250);
    run(p, 16.7, 2000);
    expect(p.quality()).toBe(2);
    run(p, 30, 1600);
    expect(p.quality()).toBe(1);
    run(p, 16.7, 5100);
    expect(p.quality()).toBe(2);
    run(p, 30, 1600); // relapse right after the climb
    expect(p.quality()).toBe(1);
    run(p, 16.7, 6000); // the old 4 s is no longer enough
    expect(p.quality()).toBe(1);
    run(p, 16.7, 3500);
    expect(p.quality()).toBe(2);
  });
  it('resolutionScale follows quality within 0.5..1.', () => {
    const p = factory();
    warm(p);
    expect(p.resolutionScale()).toBe(1);
    run(p, 40, 1600);
    const mid = p.resolutionScale();
    expect(mid).toBeGreaterThan(0.75);
    expect(mid).toBeLessThanOrEqual(1);
    perfControl.setMode('low');
    expect(p.quality()).toBe(0);
    expect(p.resolutionScale()).toBe(0.55);
    run(p, 5, 10000); // forced: no recovery
    expect(p.quality()).toBe(0);
    perfControl.setMode('high');
    expect(p.resolutionScale()).toBe(1);
  });
  it('tickBudget sheds sim ticks at low quality but never below 1 when ticks are wanted.', () => {
    const p = factory();
    expect(p.tickBudget(9)).toBe(9);
    perfControl.setMode('low');
    expect(p.tickBudget(9)).toBe(2);
    expect(p.tickBudget(1)).toBe(1);
    expect(p.tickBudget(0)).toBe(0);
  });
  it('onChange fires once per quality change.', () => {
    const p = factory();
    const seen: number[] = [];
    const off = p.onChange((q) => seen.push(q));
    warm(p);
    run(p, 30, 1600);
    perfControl.setMode('medium');
    perfControl.setMode('low');
    off();
    perfControl.setMode('high');
    expect(seen).toEqual([1, 0]);
  });
});
