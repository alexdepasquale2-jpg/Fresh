// Fold generator (unit 03). O(1) in depth: everything comes from the pathHash.
import type { FoldGenFactory, FoldNode } from '@/contracts/fold';
import type { FoldAddress } from '@/contracts/seed';
import { child, mix, rng, seedToU32 } from '@/core/hash';

const KINDS = ['dwarf', 'main', 'main', 'giant', 'pulsar'] as const;

export const factory: FoldGenFactory = () => ({
  root: (u) => ({ universe: u.seed, pathHash: u.seed, depth: 0 }),
  childrenOf: (a): FoldNode[] => {
    // Star density per mille: none at the top, rising to a plateau by fold 12.
    const starPm = a.depth < 2 ? 0 : Math.min(220, 40 + a.depth * 15);
    return Array.from({ length: 7 }, (_, index) => {
      const address: FoldAddress = { universe: a.universe, pathHash: mix(a.pathHash, index), depth: a.depth + 1 };
      const r = rng(child(address.pathHash, 'content'));
      const roll = r.int(1000);
      if (index > 0 && roll < starPm) return { index, address, star: { address, seed: child(address.pathHash, 'star'), kind: r.pick(KINDS), heat: r.int(256) } };
      if (index > 0 && roll >= 920) return { index, address, flicker: { address, serialNumber: seedToU32(child(address.pathHash, 'flicker')) & 0xffffff } };
      return { index, address };
    });
  },
});
