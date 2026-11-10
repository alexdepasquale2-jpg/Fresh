// STUB: replace with the real Clock and Kuramoto Pulse (unit 12). See README.md.
import type { TimebaseFactory } from '@/contracts/units';
import type { ClockSpeed } from '@/contracts/time';
import { TICKS_PER_SECOND } from '@/contracts/time';
import { FX_ONE } from '@/core/fixed';

export const factory = (): TimebaseFactory => ({
  clock: ({ names, seed }) => {
    let tick = 0;
    let speed: ClockSpeed = 1;
    let accMs = 0;
    const ticksPerYear = TICKS_PER_SECOND * 10;
    return {
      speed: () => speed,
      setSpeed: (s) => void (speed = s),
      advance: (dtMs) => {
        accMs += dtMs * speed;
        const n = Math.floor((accMs * TICKS_PER_SECOND) / 1000);
        accMs -= (n * 1000) / TICKS_PER_SECOND;
        tick += n;
        return n;
      },
      catchUp: (ms) => Math.min(Math.floor((ms * TICKS_PER_SECOND) / 1000), 20 * 60 * 10),
      maxCatchUpTicks: 20 * 60 * 10,
      ticksPerYear,
      tick: () => tick,
      year: () => Math.floor(tick / ticksPerYear),
      ageName: () => names.age(seed),
      snapshot: () => ({ tick, speed }),
      restore: (s) => void ({ tick, speed } = s),
    };
  },
  pulse: ({ milliHz }) => {
    let phase = 0;
    return {
      milliHz,
      phase: () => phase,
      step: (ticks) => {
        phase = (phase + Math.trunc((milliHz * ticks * FX_ONE) / (1000 * TICKS_PER_SECOND))) & (FX_ONE - 1);
      },
    };
  },
});
