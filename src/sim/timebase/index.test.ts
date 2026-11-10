import { describe, it, expect } from 'vitest';
import { factory } from '@/sim/timebase';

describe('unit 12: src/sim/timebase', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("Clock.advance returns whole ticks at 20/s times speed, carrying the remainder; pause returns 0.");
  it.todo("catchUp is capped at maxCatchUpTicks.");
  it.todo("year() and ageName() follow the tick count.");
  it.todo("Pulse.phase is in [0, FX_ONE) and advances at milliHz using integer math only.");
  it.todo("Two pulses with different frequencies and coupling K converge in phase (Kuramoto) within a stated number of ticks; with K = 0 they do not.");
  it.todo("Deterministic golden phases after 10,000 ticks.");
});
