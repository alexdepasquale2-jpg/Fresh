import type { SerialNumber } from './seed';
import type { UniverseSpec } from './universe';
import type { UniverseStats } from './game';

/**
 * Battles on the bedroom layer. Other kids keep boxes too; their universes fight
 * yours. A universe fights with what its worlds have become:
 * - Might: souls, era and worlds tended.
 * - Depth: deepest fold.
 * - Radiance: light from glow and enlightenment.
 * - Guard: how well its colony is doing (prosperity). Flat damage soaked per hit.
 * - Speed: what its worlds have put into orbit, and its depth. Faster acts first.
 * Its law set gives an element and a signature skill; its history gives traits.
 * Each turn you spend Light (energy) on skills, guard, swap, or fuse two of your
 * universes into one. The rival's next move is shown before you choose.
 * Mid-battle you can step into your universe and change it; the fighter comes
 * back as whatever you made it.
 */
export type Element = 'cold' | 'fire' | 'tide' | 'stone' | 'bloom' | 'void';
export type StatusKind = 'burn' | 'chill' | 'ward' | 'regen' | 'expose';
export type Status = Readonly<Record<StatusKind, number>>;

export interface Skill {
  readonly id: string;
  readonly name: string;
  /** Light it costs. */
  readonly cost: number;
  readonly desc: string;
  /** What it is for, as a short badge: HARM, BURN, SHIELD, TEMPO, LIGHT, CLEANSE, FINISHER, MEND. */
  readonly kind?: string;
  /** Creature level at which it is learned (1 when absent). */
  readonly learnAt?: number;
}
/** A small thing a creature holds. One per creature; found as battle rewards. */
export interface Relic { readonly id: string; readonly name: string; readonly desc: string }
/** The field's weather, drawn from the universes in play. It lifts one element and blunts another. */
export type Weather = 'heat' | 'frost' | 'tide' | 'dust' | 'spring' | 'dark';
export interface WeatherInfo { readonly id: Weather; readonly name: string; readonly up: Element; readonly down: Element | null; readonly desc: string }
/** What a creature has earned across battles. Kept by the UI, applied with Battles.grow. */
export interface Growth { readonly xp: number; readonly relic?: string }
export interface LevelInfo { readonly level: number; readonly into: number; readonly need: number }
export interface BattleReward { readonly glow: number; readonly xp: number; readonly piece?: { readonly kind: string; readonly n: number }; readonly relic?: Relic }
export interface Trait { readonly id: string; readonly name: string; readonly desc: string }

export interface Fighter {
  readonly serialNumber: SerialNumber;
  readonly name: string;
  readonly element: Element;
  readonly might: number;
  readonly depth: number;
  readonly radiance: number;
  readonly guard: number;
  readonly speed: number;
  readonly maxHp: number;
  readonly hp: number;
  /** Light to spend on skills, 0..6. */
  readonly energy: number;
  readonly status: Status;
  readonly skills: readonly Skill[];
  readonly traits: readonly Trait[];
  /** True while guarding (until its next action). */
  readonly guarding: boolean;
  /** Bedrock and similar once-per-battle traits already used. */
  readonly spent: readonly string[];
  /** Box slot for the player's fighters, -1 for rivals' and fused ones. */
  readonly slot: number;
  readonly fused: boolean;
  /** Creature level, 1.. (1 when absent). Raises stats and teaches skills. */
  readonly level?: number;
  /** 1, 2 or 3: its form. Changes at levels 4 and 9. */
  readonly form?: number;
  /** Harm soaked before life is touched. */
  readonly shield?: number;
  readonly relic?: Relic;
}

export interface Rival {
  readonly id: number;
  readonly name: string;
  readonly where: string;
  readonly taunt: string;
  /** 1..10 */
  readonly level: number;
  readonly serials: readonly SerialNumber[];
  /** Ladder tier, 1..4. */
  readonly tier?: number;
  readonly tierName?: string;
  /** Bosses have a signature mechanic. */
  readonly boss?: 'weather' | 'mirror' | 'fuse' | 'champion';
  /** One line on what the boss does. */
  readonly mechanic?: string;
  /** How they fight. */
  readonly persona?: 'bold' | 'wary' | 'sly' | 'cruel';
  /** The element their team leans to. */
  readonly theme?: Element;
  /** What they say when you come back, and when they lose. */
  readonly again?: string;
  readonly beaten?: string;
  /** Times already beaten; each makes the rematch harder. */
  readonly rematch?: number;
}

export type BattleAction =
  | { type: 'skill'; id: string }
  | { type: 'guard' }
  | { type: 'swap'; target: number }
  | { type: 'fuse'; target: number };

export interface BattleLogLine { readonly side: 'you' | 'them' | 'world'; readonly text: string }
/** What happened this turn, for numbers and shakes. */
export interface Hit { readonly to: 'you' | 'them'; readonly amount: number; readonly crit: boolean; readonly heal: boolean; readonly tag: string; readonly eff?: 'strong' | 'weak' }

export interface BattleState {
  readonly rival: Rival;
  readonly mine: readonly Fighter[];
  readonly theirs: readonly Fighter[];
  readonly myActive: number;
  readonly theirActive: number;
  readonly turn: number;
  readonly log: readonly BattleLogLine[];
  readonly hits: readonly Hit[];
  /** The rival's next move, shown to the player. */
  readonly intent: { readonly action: BattleAction; readonly label: string };
  readonly fusedUsed: boolean;
  readonly outcome: 'ongoing' | 'won' | 'lost' | 'fled';
  readonly weather?: Weather;
  /** Who moves first if both use a plain skill. */
  readonly first?: 'you' | 'them';
  /** Moves in a row that differed from the one before, per side (0..3). Each adds harm. */
  readonly chain?: { readonly you: number; readonly them: number };
  /** The last skill each side used. */
  readonly last?: { readonly you: string; readonly them: string };
  readonly theirFused?: boolean;
  /** Running totals for the summary. */
  readonly tally?: { readonly dealt: number; readonly taken: number; readonly combos: number };
}

export interface Battles {
  rivals(): readonly Rival[];
  fighter(spec: UniverseSpec, stats: UniverseStats | undefined, slot: number): Fighter;
  rivalTeam(rival: Rival, specOf: (serial: SerialNumber) => UniverseSpec): Fighter[];
  start(rival: Rival, mine: readonly Fighter[], theirs: readonly Fighter[]): BattleState;
  /** One full turn: you and the rival each act, the faster first. Deterministic. */
  act(state: BattleState, action: BattleAction): BattleState;
  /** Can this action be taken now? */
  can(state: BattleState, action: BattleAction): boolean;
  /** Replace your fighter in a slot after you went in and changed its universe. Keeps damage taken. */
  refresh(state: BattleState, slot: number, fresh: Fighter): BattleState;
  flee(state: BattleState): BattleState;
  /** Element advantage multiplier of a over b. */
  advantage(a: Element, b: Element): number;
  /** Level from total XP. */
  levelOf?(xp: number): LevelInfo;
  /** A base fighter (from fighter()) as it is after its growth: level, form, skills learned, relic held. */
  grow?(base: Fighter, growth: Growth): Fighter;
  /** The same rival, harder, after `wins` wins against them. */
  rematch?(rival: Rival, wins: number): Rival;
  /** What a finished battle pays. `wins` is wins against this rival before this one; `owned` the relic ids already found. */
  reward?(state: BattleState, wins: number, owned: readonly string[]): BattleReward;
  relics?(): readonly Relic[];
  weatherInfo?(w: Weather): WeatherInfo;
  /** Every skill an element can learn, in order. */
  skillsOf?(element: Element): readonly Skill[];
}
export type BattlesFactory = (deps: { seed: import('./seed').Seed }) => Battles;
