import { describe, it, expect } from 'vitest';
import { factory } from './index';

describe('unit 08: tools/atlas', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("npm run atlas -- validate exits 0 on the shipped law sets and 1 on a broken fixture.");
  it.todo("stabilityTest runs a law set on a test grid for N ticks with the real reaction rules and rejects dead (no change) or exploding (one material over 90%) worlds.");
  it.todo("score returns a deterministic integer from activity, diversity and sky sensitivity.");
  it.todo("emit writes a single validated atlas JSON with stable key order.");
  it.todo("A documented plug-in interface accepts external search results (e.g. Lenia or ALife) as candidate law sets.");
  it.todo("Nothing in tools/ is imported by the app bundle (checked by a test on the build graph or imports).");
});
