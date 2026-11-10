import type { SerialNumber } from './seed';
import type { UniverseSpec, UniverseGen, UniverseTrait, UniverseModifiers, Rarity } from './universe';
import type { UniverseStats, Lineage } from './game';
export type { Lineage, LineageParent } from './game';
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
  | { kind: 'universe'; spec: UniverseSpec; says: string; lineage?: Lineage; child?: MergedCharacter; preview?: MergePreview }
  | { kind: 'piece'; piece: SkyPieceKind; count: number; says: string };

export interface Merger {
  merge(a: Thing, b: Thing): MergeResult;
  /** Stats a merged universe starts with. */
  combineStats(a: UniverseStats, b?: UniverseStats): UniverseStats;
  /* ---- Optional ---- */
  /** What a pair would make, and by what odds each rule went the way it did. Pure; changes nothing. */
  preview?(a: Thing, b: Thing): MergePreview | null;
  /** A universe as it stands with its lineage applied: all traits, summed modifiers, final rarity. */
  character?(spec: UniverseSpec, lineage?: Lineage | null): MergedCharacter;
  /** Every named recipe, for a codex. */
  recipes?(): readonly MergeRecipe[];
  /** A lineage as a few plain lines. */
  describeLineage?(lineage: Lineage): string[];
}

/** A named result for a particular pair of law tags (one from each parent). */
export interface MergeRecipe {
  readonly id: string;
  readonly name: string;
  /** The two tags, sorted. */
  readonly tags: readonly [string, string];
  readonly says: string;
  /** The trait only this recipe gives. */
  readonly trait: UniverseTrait;
}
/** A universe with what it inherited laid over what it is. */
export interface MergedCharacter {
  readonly rarity: Rarity;
  readonly traits: readonly UniverseTrait[];
  readonly modifiers: UniverseModifiers;
  readonly title?: string;
}
/** One rule of the merge: what could have happened, how likely, and what did. */
export interface MergeChance {
  readonly label: string;
  /** 0..1000. */
  readonly permille: number;
  /** Whether it happened for this pair (merging is seeded, so this is already known). */
  readonly happened: boolean;
}
export interface MergePreview {
  readonly spec: UniverseSpec;
  readonly lineage: Lineage;
  readonly child: MergedCharacter;
  readonly recipe?: MergeRecipe;
  /** 0..100: how unlike the parents are. Unlike parents lift rarity and mutate more. */
  readonly difference: number;
  readonly chances: readonly MergeChance[];
  /** Short lines for a card: "Takes the Salt tide laws of Pallid Choir." */
  readonly lines: readonly string[];
}
export type MergerFactory = (deps: { universes: UniverseGen }) => Merger;
