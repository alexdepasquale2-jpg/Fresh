import { describe, it, expect } from 'vitest';
import { factory } from '@/gen/names';

describe('unit 02: src/gen/names', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("Each of the five methods is a pure function of its seed (golden values for 3 fixed seeds).");
  it.todo("Names are 3 to 24 characters, letters, spaces, hyphens and apostrophes only.");
  it.todo("Universe names are one or two words; age names start with \"Age of\".");
  it.todo("Over 10,000 seeds, at least 2,000 distinct planet names and fewer than 1% exact repeats in a row.");
  it.todo("No name contains a word from a blocklist of modern or comic words (included in the test).");
  it.todo("The grammar is data (word lists and patterns in one file), not code branches.");
});
