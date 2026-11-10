// STUB: replace with the real fold generator (unit 03). See README.md.
import type { FoldGenFactory, FoldNode } from '@/contracts/fold';
import type { FoldAddress } from '@/contracts/seed';
import { child, mix, rng, seedToU32 } from '@/core/hash';

export const factory: FoldGenFactory = () => ({
  root: (u) => ({ universe: u.seed, pathHash: u.seed, depth: 0 }),
  childrenOf: (a): FoldNode[] =>
    Array.from({ length: 7 }, (_, index) => {
      const address: FoldAddress = { universe: a.universe, pathHash: mix(a.pathHash, index), depth: a.depth + 1 };
      const r = rng(child(address.pathHash, 'content'));
      if (index > 0 && address.depth >= 2 && r.chance(1, 7)) {
        return { index, address, star: { address, seed: child(address.pathHash, 'star'), kind: 'main', heat: r.int(256) } };
      }
      if (index > 0 && r.chance(1, 12)) {
        return { index, address, flicker: { address, serialNumber: seedToU32(address.pathHash) & 0xffffff } };
      }
      return { index, address };
    }),
});
