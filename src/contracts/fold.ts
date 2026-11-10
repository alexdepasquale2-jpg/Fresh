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
  /** Something else in this fold. Never set together with star or flicker. Pickups sit in the ring (index 1..6); hazards may sit anywhere. */
  readonly thing?: FoldThing;
}

/** Things in folds beyond stars and flickers. The first four are pickups, the last three hazards. */
export type FoldThingKind = 'piece' | 'well' | 'echo' | 'wreck' | 'storm' | 'undertow' | 'follower';
export const FOLD_HAZARDS: readonly FoldThingKind[] = ['storm', 'undertow', 'follower'];
export interface FoldThing {
  readonly kind: FoldThingKind;
  /** 0..255 seeded variety (strength, which reward, which line). */
  readonly power: number;
  /** Stable u32 identity of this thing, a function of the fold address. */
  readonly key: number;
}

export type StratumMotion = 'still' | 'drift' | 'churn' | 'shiver' | 'pull';
/**
 * A named region of depth. Each universe has its own ordered set, a pure
 * function of its seed (names also draw on its laws).
 * Invariants: strata are contiguous from depth 0; the last one never ends.
 */
export interface Stratum {
  readonly index: number;
  readonly name: string;
  /** First fold depth inside it. */
  readonly from: number;
  /** First fold depth past it (a large number for the last). */
  readonly to: number;
  /** Three universe palette indices (1..15) that colour its rings. */
  readonly hues: readonly [number, number, number];
  /** 0..100 how far its background sinks toward the darkest palette entry. */
  readonly dark: number;
  readonly motion: StratumMotion;
  /** Densities, per mille of children. */
  readonly starPm: number;
  readonly flickerPm: number;
  readonly pickupPm: number;
  readonly hazardPm: number;
  /** One line said as you cross into it. */
  readonly line: string;
}

/**
 * Fold generator. Pure: childrenOf(a) is a function of a alone.
 * Invariants: always returns exactly 7 nodes in index order; cost is O(1) in
 * depth (depth 10,000 costs the same as depth 1).
 */
export interface FoldGen {
  root(universe: UniverseSpec): FoldAddress;
  childrenOf(address: FoldAddress): readonly FoldNode[];
  /** The universe's strata, shallowest first. Optional: a generator without regions returns nothing. */
  strata?(universe: UniverseSpec): readonly Stratum[];
}
export type FoldGenFactory = () => FoldGen;
