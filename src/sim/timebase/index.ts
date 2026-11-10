// Clock and Kuramoto Pulse (unit 12).
import type { TimebaseFactory } from '@/contracts/units';
import type { ClockSpeed } from '@/contracts/time';
import { TICKS_PER_SECOND } from '@/contracts/time';
import { YEAR_TICKS } from "@/contracts/sim";
import { FX_ONE, fxSin, fxMul } from '@/core/fixed';

export const factory = (): TimebaseFactory => ({
  clock: ({ names, seed }) => {
    let tick = 0;
    let speed: ClockSpeed = 1;
    let accMs = 0;
    const ticksPerYear = YEAR_TICKS;
    const maxCatchUpTicks = TICKS_PER_SECOND * 60 * 10;
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
      catchUp: (ms) => Math.max(0, Math.min(Math.floor((ms * TICKS_PER_SECOND) / 1000), maxCatchUpTicks)),
      maxCatchUpTicks,
      ticksPerYear,
      tick: () => tick,
      year: () => Math.floor(tick / ticksPerYear),
      ageName: () => names.age({ hi: seed.hi, lo: (seed.lo + Math.floor(tick / (ticksPerYear * 50))) >>> 0 }),
      snapshot: () => ({ tick, speed }),
      restore: (s) => void ({ tick, speed } = s),
    };
  },
  pulse: ({ milliHz, seed, couplingFx }) => {
    let phase = seed.lo & (FX_ONE - 1);
    const omega = Math.trunc((milliHz * FX_ONE) / (1000 * TICKS_PER_SECOND));
    return {
      milliHz,
      phase: () => phase,
      step: (ticks, neighbours) => {
        for (let t = 0; t < ticks; t++) {
          let pull = 0;
          for (const n of neighbours) pull += fxSin((n - phase) | 0);
          if (neighbours.length) pull = Math.trunc(fxMul(couplingFx, pull) / neighbours.length / TICKS_PER_SECOND);
          phase = (phase + omega + pull) & (FX_ONE - 1);
        }
      },
    };
  },
});
