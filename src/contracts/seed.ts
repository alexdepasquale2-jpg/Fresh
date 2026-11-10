import { z } from 'zod';

/**
 * A 64-bit seed as two u32 words.
 * Invariants: hi and lo are integers in [0, 2^32). Seeds are values: never
 * mutate one, derive children with core/hash (child, mix, hashPath).
 */
export interface Seed {
  readonly hi: number;
  readonly lo: number;
}
const u32 = z.number().int().min(0).max(0xffffffff);
export const SeedSchema = z.object({ hi: u32, lo: u32 }).readonly();

/**
 * A path of fold child indices from a universe root. Each step is 0..6
 * (0 = centre child, 1..6 = the ring around it).
 * Invariant: paths are never stored once deep; use FoldAddress.pathHash.
 */
export type Path = readonly number[];
export const PathSchema = z.array(z.number().int().min(0).max(6)).readonly();

/**
 * The address of one fold.
 * Invariants:
 * - pathHash = hashPath(universe, path) folded incrementally; child i of an
 *   address A is { universe: A.universe, pathHash: mix(A.pathHash, i), depth: A.depth + 1 }.
 * - depth is a plain counter. No absolute scale or zoom is ever stored, so
 *   depth 10,000 costs the same as depth 1.
 */
export interface FoldAddress {
  readonly universe: Seed;
  readonly pathHash: Seed;
  readonly depth: number;
}
export const FoldAddressSchema = z
  .object({ universe: SeedSchema, pathHash: SeedSchema, depth: z.number().int().min(0) })
  .readonly();

/** 24-bit universe serial number, shown as "No. 3F9A-77". */
export type SerialNumber = number;
export const SerialNumberSchema = z.number().int().min(0).max(0xffffff);
