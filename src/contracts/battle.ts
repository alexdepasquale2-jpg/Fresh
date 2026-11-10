import type { SerialNumber } from './seed';
import type { UniverseSpec } from './universe';
import type { UniverseStats } from './game';

/**
 * Battles on the bedroom layer. Other kids keep boxes too. Out in the house and
 * the street you find them; their universes fight yours. A universe fights with
 * what its worlds have become: souls and era give Might, deepest fold gives Depth,
 * light from glow and enlightenment give Radiance, and its law set gives it an
 * element. Mid-battle you can step into your universe and change it; the battle
 * waits, and the fighter comes back as whatever you made it.
 */
export type Element = 'cold' | 'fire' | 'tide' | 'stone' | 'bloom' | 'void';

export interface Fighter {
  readonly serialNumber: SerialNumber;
  readonly name: string;
  readonly element: Element;
  readonly might: number;
  readonly depth: number;
  readonly radiance: number;
  readonly maxHp: number;
  readonly hp: number;
  /** Turns of shielding left. */
  readonly ward: number;
  /** Box slot for the player's fighters, -1 for rivals'. */
  readonly slot: number;
}

export interface Rival {
  readonly id: number;
  readonly name: string;
  readonly where: string;
  readonly taunt: string;
  /** 1..10 */
  readonly level: number;
  readonly serials: readonly SerialNumber[];
}

export type BattleAction = 'strike' | 'fold' | 'shine' | 'swap';
export interface BattleLogLine { readonly side: 'you' | 'them' | 'world'; readonly text: string }

export interface BattleState {
  readonly rival: Rival;
  readonly mine: readonly Fighter[];
  readonly theirs: readonly Fighter[];
  readonly myActive: number;
  readonly theirActive: number;
  readonly turn: number;
  readonly log: readonly BattleLogLine[];
  readonly outcome: 'ongoing' | 'won' | 'lost' | 'fled';
}

export interface Battles {
  /** Rivals you can find from the bedroom, in order of difficulty. */
  rivals(): readonly Rival[];
  /** Build a fighter from a universe and what its worlds have become. */
  fighter(spec: UniverseSpec, stats: UniverseStats | undefined, slot: number): Fighter;
  /** A rival's team, built from their serials at their level. */
  rivalTeam(rival: Rival, specOf: (serial: SerialNumber) => UniverseSpec): Fighter[];
  start(rival: Rival, mine: readonly Fighter[], theirs: readonly Fighter[]): BattleState;
  /** Player acts, then the rival answers. Deterministic in (state, action, seed). */
  act(state: BattleState, action: BattleAction, target?: number): BattleState;
  /** Replace the player's fighter in a slot after you went in and changed its universe. Keeps damage taken. */
  refresh(state: BattleState, slot: number, fresh: Fighter): BattleState;
  flee(state: BattleState): BattleState;
}
export type BattlesFactory = (deps: { seed: import('./seed').Seed }) => Battles;
