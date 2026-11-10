import { describe, it, expect } from 'vitest';
import { factory } from '@/platform/save';

describe('unit 24: src/platform/save', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("save then load returns an equal SaveState (fake IndexedDB in tests).");
  it.todo("migrate accepts every past version and returns the current one; garbage returns null.");
  it.todo("exportCode gives \"No. 3F9A-77\"; importCode accepts that, \"3F9A-77\" and \"3f9a77\".");
  it.todo("A corrupt store loads as null without throwing.");
  it.todo("Saves are debounced and never block a frame.");
});
