import { describe, it, expect } from 'vitest';
import { factory } from '@/rules/sky';

describe('unit 07: src/rules/sky', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("Fewer than 40 rules, each passing SkyRuleSchema with a unique id.");
  it.todo("Every single piece kind has at least one rule; at least 6 pairwise combinations have rules.");
  it.todo("effects() sums matching rules and clamps each key to -100..100; an empty sky is neutral.");
  it.todo("explain() returns the says of matching rules in table order.");
  it.todo("Each says line is under 80 characters, plain words, present tense (checked by a regex test).");
  it.todo("Pure and deterministic: golden test for 5 fixed skies.");
  it.todo("Moon gives tide; Comet gives impacts; Sun gives warmth; Dust gives dimming; Rings give night light.");
});
