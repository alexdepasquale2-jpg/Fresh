// The civ unit's random stream: the same sfc32 as src/core/hash's rng(), number for number,
// but one whose state can be read and put back, so a snapshot carries exactly where the
// stream stood. (The core rng keeps its state private, and units may not edit the core.)
import type { Seed } from '@/contracts/seed';
import type { Rng } from '@/core/hash';

/** The four words of the stream. */
export type RngState = [number, number, number, number];
export interface SavedRng extends Rng {
  state(): RngState;
  /** False (and nothing changes) when the state is not four integers. */
  setState(s: unknown): boolean;
}

export const savedRng = (seed: Seed): SavedRng => {
  let a = seed.hi | 0;
  let b = seed.lo | 0;
  let c = (seed.hi ^ 0xdeadbeef) | 0;
  let d = 1;
  const u32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i++) u32();
  const int = (n: number): number => {
    if (n < 1) throw new Error('rng.int: n must be >= 1');
    const limit = 0x100000000 - (0x100000000 % n);
    let x = u32();
    while (x >= limit) x = u32();
    return x % n;
  };
  return {
    u32,
    int,
    range: (lo, hi) => lo + int(hi - lo + 1),
    chance: (num, den) => int(den) < num,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('rng.pick: empty');
      return items[int(items.length)] as T;
    },
    state: () => [a, b, c, d],
    setState: (s) => {
      if (!Array.isArray(s) || s.length !== 4 || !s.every((x) => Number.isInteger(x))) return false;
      a = (s[0] as number) | 0; b = (s[1] as number) | 0; c = (s[2] as number) | 0; d = (s[3] as number) | 0;
      return true;
    },
  };
};
