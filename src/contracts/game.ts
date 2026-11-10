import type { SerialNumber, FoldAddress } from './seed';
import type { UniverseSpec, UniverseTrait, Rarity } from './universe';
import type { FoldNode, StarRef, Stratum, FoldThingKind } from './fold';

export const LIGHT_MAX_PIPS = 8;
/**
 * The 8-pip Light economy.
 * OPEN DECISION (see docs/DESIGN.md): drain is per fold fallen, not per second;
 * at zero pips the dive auto-surfaces. Income comes from planet glow.
 * Invariants: 0 <= pips <= 8; partial progress is an integer 0..999 toward
 * the next pip (gain) or loss.
 */
export interface LightView {
  readonly pips: number;
  readonly partial: number;
  readonly low: boolean;
  /** Points in the overflow bank (0..LIGHT_BANK_MAX), if the Light keeps one. */
  readonly bank?: number;
}
export interface Light {
  view(): LightView;
  /** Drain for folds fallen. Returns false when Light hit zero. */
  drainFolds(folds: number): boolean;
  /** Add glow points (from CivView.glowPerMinute over time). */
  addGlow(points: number): void;
  canSpend(pips: number): boolean;
  spend(pips: number): boolean;
  snapshot(): { pips: number; partial: number; bank?: number; earned?: number; spent?: number; drained?: number };
  /** Older snapshots (pips and partial only) are accepted. */
  restore(s: { pips: number; partial: number; bank?: number; earned?: number; spent?: number; drained?: number }): void;
  /**
   * Optional: the overflow bank. Glow that arrives while Light is full is not all lost: half of it is
   * kept, up to LIGHT_BANK_MAX points. After Light has been spent or drained, the bank pays back out
   * alongside new glow. The 8-pip invariant is untouched.
   */
  bank?(): number;
  /** Lifetime totals, in glow points (1000 = one pip). */
  totals?(): LightTotals;
  /** Put points straight into the bank (a gift). Returns how many fitted. */
  bankGlow?(points: number): number;
  /** Take up to `points` out of the bank at once, into Light. Returns how many moved. */
  releaseBank?(points?: number): number;
}
export const LIGHT_BANK_MAX = 2000;
export interface LightTotals {
  /** Glow points ever added. */
  readonly earned: number;
  /** Pips ever spent with spend(), as points. */
  readonly spent: number;
  /** Pips ever lost to falling, as points. */
  readonly drained: number;
  /** Points now in the bank. */
  readonly banked: number;
}
export type LightFactory = () => Light;

export const BOX_SLOTS = 25;
export interface UniverseStats {
  readonly worldsTended: number;
  readonly deepestFold: number;
  readonly lightFromGlow: number;
  /** Last seen state of its most-watched world (feeds battles). */
  readonly souls?: number;
  readonly era?: number;
  readonly belief?: string;
  /** 0..100 best enlightenment seen. */
  readonly enlightenment?: number;
  /** 0..100 how well its watched colony is doing (fed, rich, glad). */
  readonly prosperity?: number;
  /** Things its worlds have put into orbit. */
  readonly orbiters?: number;
  /* ---- Optional lifetime stats (Box.recordBattle and friends). Missing = 0. ---- */
  readonly battles?: number;
  readonly battlesWon?: number;
  /** Sky pieces hung on its orbits. */
  readonly piecesHung?: number;
  /** Times a dive in it reached the floor. */
  readonly floorsReached?: number;
  /** Sim ticks spent watching its worlds. */
  readonly ticksTended?: number;
  /** Where it came from, when it was made by merging. */
  readonly lineage?: Lineage;
}
/** One parent in a lineage. */
export interface LineageParent {
  readonly serialNumber: SerialNumber;
  readonly name: string;
  readonly laws: string;
  readonly rarity?: Rarity;
  /** How many merges stand behind this parent (0 = found, not made). */
  readonly generation?: number;
}
/**
 * What a merged universe carries beside its serial. Plain JSON so it can live in a Box snapshot.
 * The universe's own spec stays a pure function of its serial; this is what it was GIVEN.
 */
export interface Lineage {
  readonly parents: readonly LineageParent[];
  /** The sky piece it was reborn under, for universe + piece. */
  readonly piece?: string;
  /** 1 for a child of two found universes; one more than its deepest parent after that. */
  readonly generation: number;
  /** Every found universe folded into it, all the way down. */
  readonly ancestors?: number;
  readonly recipe?: { readonly id: string; readonly name: string; readonly says: string };
  /** Traits passed down from the parents (the child's own traits are on its spec). */
  readonly gifts?: readonly UniverseTrait[];
  /** A trait neither parent had. */
  readonly mutation?: UniverseTrait;
  /** The child's rarity after the merge (never below its own). */
  readonly rarity?: Rarity;
  /** Four colours kept from the parents: two from each, "#rrggbb". */
  readonly colours?: readonly string[];
  /** Glyph elements kept: the first parent's glyph row and the second's column (0..7 each). */
  readonly sigil?: readonly [number, number];
  /** One line to show under its name. */
  readonly says?: string;
}
export interface BoxEntry {
  readonly serialNumber: SerialNumber;
  readonly stats: UniverseStats;
}
/** The Box: 25 slots. Mote never goes in the Box. Invariant: a serial appears at most once. */
export interface Box {
  slots(): readonly (BoxEntry | null)[];
  count(): number;
  selected(): number;
  select(slot: number): void;
  /** Add to the first empty slot. Returns slot index, or -1 if full or duplicate. */
  add(serialNumber: SerialNumber): number;
  recordDepth(slot: number, depth: number): void;
  recordTended(slot: number): void;
  recordGlow(slot: number, light: number): void;
  /** Empty a slot (used by merging). */
  remove(slot: number): void;
  /** Replace a slot's stats (used by merging). */
  setStats(slot: number, stats: UniverseStats): void;
  recordLife(slot: number, life: { souls: number; era: number; belief: string; enlightenment: number; prosperity?: number; orbiters?: number }): void;
  snapshot(): (BoxEntry | null)[];
  /** Older snapshots (without the optional stats) are accepted. */
  restore(slots: readonly (BoxEntry | null)[]): void;
  /* ---- Optional lifetime records. Every one is a no-op on an empty slot. ---- */
  recordBattle?(slot: number, won: boolean): void;
  recordPieceHung?(slot: number, count?: number): void;
  /** A dive in it reached the floor. */
  recordFloor?(slot: number): void;
  recordTicks?(slot: number, ticks: number): void;
  setLineage?(slot: number, lineage: Lineage | null): void;
  lineage?(slot: number): Lineage | null;
  /** 0..100: how close the player and this universe have become, from real use. */
  bond?(slot: number): number;
  /** The same, from stats alone (for a universe not in a slot). */
  bondOf?(stats: UniverseStats): number;
  /** A word for a bond score: "stranger", "known", "kept", "dear", "kin". */
  bondName?(bond: number): string;
  slotOf?(serialNumber: SerialNumber): number;
}
export type BoxFactory = () => Box;

export type DivePhase = 'falling' | 'hovering' | 'stopped' | 'surfaced';
export const RELIQUARIES_PER_DIVE = 3;
export interface DiveView {
  readonly phase: DivePhase;
  readonly universe: UniverseSpec | null;
  readonly address: FoldAddress | null;
  readonly depth: number;
  readonly best: number;
  /** 0..999 progress through the current fold, for render zoom. */
  readonly progress: number;
  readonly children: readonly FoldNode[];
  readonly reliquaries: number;
  /** Child index the fall is steering into (0 centre, 1..6 ring). */
  readonly aim: number;
  /** Child index the current fold was entered through, for seamless drawing. */
  readonly cameFrom: number;
  /** Star the player stopped at, or is near enough to stop at. */
  readonly star: StarRef | null;
  readonly narration: string;
  /** Folds until the bottom of this universe (0 = you are at the bottom). Every universe has one, seeded. */
  readonly toBottom?: number;
  /** True once the fall has reached the bottom: the room where someone keeps a box. */
  readonly bottom?: boolean;
  /** The stratum the fall is in, and the universe's whole ordered set. */
  readonly stratum?: Stratum | null;
  readonly strata?: readonly Stratum[];
  /** Consecutive folds fallen without stopping, and the multiplier it earns (1..5). */
  readonly streak?: number;
  readonly multiplier?: number;
  /** What this dive has gathered so far; part of it comes back as Light when the dive ends. */
  readonly haul?: number;
  /** 0 = nothing follows; otherwise how many folds behind it is (1 = at your heels). */
  readonly follower?: number;
  /** True while an undertow has the steering. */
  readonly steerLocked?: boolean;
  /** Set once the dive has ended (star, surface or floor), until the next start. */
  readonly summary?: DiveSummary | null;
}
export interface DiveSummary {
  readonly reason: 'star' | 'surface' | 'floor';
  readonly depth: number;
  readonly best: number;
  readonly newBest: boolean;
  /** Folds fallen in this dive. */
  readonly folds: number;
  /** Names of the strata this dive passed through, in order (the first is where it began). */
  readonly strata: readonly string[];
  readonly pieces: number;
  readonly wells: number;
  readonly echoes: number;
  readonly wrecks: number;
  readonly flickers: number;
  readonly hazardsHit: number;
  readonly hazardsDodged: number;
  readonly bestStreak: number;
  readonly haul: number;
  /** Glow points (1000 = one pip) carried back up as Light. */
  readonly lightBack: number;
}
/** Things that happened since the last takeEvents(). The HUD says them and applies what the dive cannot reach (sky pieces). */
export type DiveEvent =
  | { readonly type: 'stratum'; readonly stratum: Stratum }
  | { readonly type: 'pickup'; readonly kind: FoldThingKind; readonly key: number; readonly power: number; readonly reward: 'piece' | 'light' | 'reliquary' | 'voice' }
  | { readonly type: 'hazard'; readonly kind: FoldThingKind }
  | { readonly type: 'dodge'; readonly kind: FoldThingKind }
  | { readonly type: 'follower'; readonly state: 'caught' | 'lost' }
  | { readonly type: 'milestone'; readonly depth: number; readonly key: number; readonly reward: 'piece' | 'light' | 'reliquary' }
  | { readonly type: 'streak'; readonly multiplier: number }
  | { readonly type: 'streak-lost'; readonly streak: number };
export type CaptureResult =
  | { ok: true; serialNumber: SerialNumber; slot: number }
  | { ok: false; reason: 'no-reliquary' | 'no-flicker' | 'box-full' | 'duplicate' | 'missed' | 'grazed' };

/**
 * Dive state machine: hold to fall, release to hover, release near a star to
 * stop, tap a flicker to throw a reliquary. update() runs on fixed ticks.
 */
export interface Dive {
  start(universe: UniverseSpec, best: number): void;
  hold(): void;
  release(): void;
  /** Throw a reliquary at child index (1..6 or 0). */
  /**
   * With accuracy (0..1000, how well the throw was timed) the catch is a skill moment: a poor throw is
   * 'missed' (the reliquary is spent, the flicker stays), a near one 'grazed' (nothing is spent). Without it, as before.
   */
  throwAt(childIndex: number, accuracy?: number): CaptureResult;
  /** Steer the fall into child index 0..6. Falling into a star lands on it. */
  aim(childIndex: number): void;
  update(ticks: number): void;
  surface(): void;
  view(): DiveView;
  /** Drain what happened since the last call. */
  takeEvents?(): readonly DiveEvent[];
  /** Things (by FoldThing.key) already taken from this universe on earlier dives; they are gone from the folds. */
  bindTaken?(taken: { has(key: number): boolean } | null): void;
}
export type DiveFactory = (deps: {
  fold: import('./fold').FoldGen;
  light: Light;
  box: Box;
}) => Dive;
