/**
 * Deterministic hashing and PRNG. The ONLY source of randomness allowed in
 * src/core, src/gen, src/rules and src/sim. Pure integer math (Math.imul and
 * 32-bit ops), so results are bit-identical on every JS engine.
 */
import type { Seed, Path } from '@/contracts/seed';

const fmix32 = (h: number): number => {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

const rotl = (x: number, r: number): number => ((x << r) | (x >>> (32 - r))) >>> 0;

/** FNV-1a over UTF-16 code units. */
export const hashString = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

export const makeSeed = (hi: number, lo: number): Seed => ({ hi: hi >>> 0, lo: lo >>> 0 });

/** Mix one u32 word into a seed, producing a new seed. */
export const mix = (seed: Seed, word: number): Seed => {
  const w = word >>> 0;
  const hi = fmix32((seed.hi ^ Math.imul(w + 0x9e3779b9, 0xcc9e2d51)) >>> 0);
  const lo = fmix32((seed.lo + rotl(hi, 13) + Math.imul(w ^ 0x7f4a7c15, 0x1b873593)) >>> 0);
  return { hi: fmix32((hi ^ rotl(lo, 7)) >>> 0), lo };
};

/** Seed of a named or indexed child. */
export const child = (seed: Seed, label: string | number): Seed =>
  mix(seed, typeof label === 'number' ? label : hashString(label));

/** Hash a path of child indices from a root seed. Cost is O(path length). */
export const hashPath = (seed: Seed, path: Path): Seed => {
  let s = seed;
  for (const step of path) s = mix(s, step);
  return s;
};

/** Collapse a seed to a single u32 (e.g. for FoldAddress.pathHash). */
export const seedToU32 = (s: Seed): number => fmix32((s.hi ^ rotl(s.lo, 16)) >>> 0);

export const seedEquals = (a: Seed, b: Seed): boolean => a.hi === b.hi && a.lo === b.lo;

/** 8 hex chars hi + 8 hex chars lo. */
export const seedToHex = (s: Seed): string =>
  s.hi.toString(16).padStart(8, '0') + s.lo.toString(16).padStart(8, '0');

export const seedFromHex = (hex: string): Seed => {
  if (!/^[0-9a-f]{16}$/i.test(hex)) throw new Error(`bad seed hex: ${hex}`);
  return makeSeed(parseInt(hex.slice(0, 8), 16), parseInt(hex.slice(8), 16));
};

/** sfc32 PRNG. Integer-only API; no floats are produced. */
export interface Rng {
  /** Uniform u32. */
  u32(): number;
  /** Uniform integer in [0, n). n must be in [1, 2^32). */
  int(n: number): number;
  /** Uniform integer in [lo, hi] inclusive. */
  range(lo: number, hi: number): number;
  /** True with probability num/den. */
  chance(num: number, den: number): boolean;
  pick<T>(items: readonly T[]): T;
}

export const rng = (seed: Seed): Rng => {
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
    // Rejection sampling for an unbiased result.
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
  };
};
