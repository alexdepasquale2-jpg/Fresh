import type { FoldAddress, Seed, SerialNumber } from './seed';
import type { UniverseSpec } from './universe';

/** A star found in a fold. The player stops here to open a solar system. */
export interface StarRef {
  readonly address: FoldAddress;
  readonly seed: Seed;
  readonly kind: 'dwarf' | 'main' | 'giant' | 'pulsar';
  /** 0..255 */
  readonly heat: number;
}

/** A flicker: a catchable universe. A reliquary throw captures it into the Box. */
export interface FlickerRef {
  readonly address: FoldAddress;
  readonly serialNumber: SerialNumber;
}

/**
 * One of the 7 children of a fold.
 * Invariants: index 0 is the centre child, 1..6 the ring (clockwise from top);
 * at most one of star/flicker is set.
 */
export interface FoldNode {
  readonly index: number;
  readonly address: FoldAddress;
  readonly star?: StarRef;
  readonly flicker?: FlickerRef;
}

/**
 * Fold generator. Pure: childrenOf(a) is a function of a alone.
 * Invariants: always returns exactly 7 nodes in index order; cost is O(1) in
 * depth (depth 10,000 costs the same as depth 1).
 */
export interface FoldGen {
  root(universe: UniverseSpec): FoldAddress;
  childrenOf(address: FoldAddress): readonly FoldNode[];
}
export type FoldGenFactory = () => FoldGen;
