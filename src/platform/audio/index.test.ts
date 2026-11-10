import { describe, it, expect } from 'vitest';
import { factory } from '@/platform/audio';

describe('unit 25: src/platform/audio', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("Silent until unlock() is called from a gesture; never throws without AudioContext.");
  it.todo("Notes are scheduled on pulse phase crossings so sound and visuals share one beat.");
  it.todo("Each screen has a distinct synth scene; setScene crossfades.");
  it.todo("No audio files are loaded; all voices are oscillators and noise.");
  it.todo("setMuted silences within 50 ms; dispose closes the context.");
  it.todo("update() allocates nothing per frame.");
});
