import { describe, it, expect } from 'vitest';
import { factory } from '@/platform/edge-voice';

describe('unit 27: src/platform/edge-voice', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("Off by default; when off, revoice and revoiceSync return grammarText unchanged.");
  it.todo("When on, output is validated (length, charset, no URLs) and falls back to grammarText on failure or timeout.");
  it.todo("Results are cached by (kind, seedHex) and revoiceSync returns the cached value.");
  it.todo("Never blocks the core loop; no network call without an endpoint.");
  it.todo("Network errors never throw to callers.");
});
