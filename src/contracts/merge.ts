import type { SerialNumber } from './seed';
import type { UniverseSpec, UniverseGen } from './universe';
import type { UniverseStats } from './game';
import type { SkyPieceKind } from './sky';

/**
 * Merging. Any two things merge, and the result is always something new:
 * never either parent. Pure and deterministic: the same two things always
 * make the same third, on every device.
 * - universe + universe: a child universe. Its serial comes from both parents,
 *   chosen among seeded candidates so it takes after one parent's laws.
 * - universe + sky piece: the universe is reborn under that piece's sign.
 * - sky piece + sky piece: a third kind of piece, two of them.
 */
export type Thing = { kind: 'universe'; serialNumber: SerialNumber } | { kind: 'piece'; piece: SkyPieceKind };
export type MergeResult =
  | { kind: 'universe'; spec: UniverseSpec; says: string }
  | { kind: 'piece'; piece: SkyPieceKind; count: number; says: string };

export interface Merger {
  merge(a: Thing, b: Thing): MergeResult;
  /** Stats a merged universe starts with. */
  combineStats(a: UniverseStats, b?: UniverseStats): UniverseStats;
}
export type MergerFactory = (deps: { universes: UniverseGen }) => Merger;
