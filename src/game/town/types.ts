// Shared types of the town (the open world outside the bedroom). Pure data; no DOM.

export type Phase = 'dawn' | 'day' | 'dusk' | 'night';
export type Weather = 'clear' | 'rain' | 'fog' | 'wind';
export const TILE = 16;
export const MAP_W = 160;
export const MAP_H = 160;

/** Tile kinds. Numbers are stable: they are drawn and tested by id. */
export const T = {
  GRASS: 0, TALL: 1, PATH: 2, ROAD: 3, PAVE: 4, WATER: 5, DEEP: 6, SAND: 7, TREE: 8, BUSH: 9, FENCE: 10, WALL: 11,
  ROOF: 12, DOOR: 13, FLOWER: 14, SOIL: 15, RAIL: 16, BALLAST: 17, PLANK: 18, ROCK: 19, GRAVEL: 20, GRAVE: 21,
  LAMP: 22, BENCH: 23, SIGN: 24, STOP: 25, GATE: 26, YARD: 27, WINDOW: 28, CLIFF: 29, REED: 30, STONE: 31,
  MAST: 32, SHED: 33, CROP: 34, TUNNEL: 35, HEDGE: 36, CROSSING: 37, PIT: 38, PINE: 39, STUMP: 40, CHURCH: 41,
  VOID: 42, FLOOR: 43, COUNTER: 44, BOX: 45, SHELF: 46, BED: 47,
} as const;

/** What the rest of the game looks like right now. Built by the screen/plugin from the real AppContext. */
export interface Facts {
  /** Universes held. */
  count: number;
  /** Deepest fold reached in any held universe. */
  deepest: number;
  /** Most souls last seen on one of your worlds. */
  souls: number;
  /** Highest era seen on one of your worlds (0..8). */
  era: number;
  /** Universes of rarity rare or better. */
  rare: number;
  /** Dives that reached a floor. */
  floors: number;
  /** Ladder wins in total, and rivals beaten at least once. */
  wins: number;
  beaten: number;
  /** Light pips 0..8. */
  light: number;
  lightLow: boolean;
  /** Free slots in the Box. */
  room: number;
  /** Name of the selected (or first) universe, '' when the Box is empty. */
  firstName: string;
  /** Name of the rarest universe held. */
  bestName: string;
  /** Rival ids beaten. */
  beatenIds: readonly number[];
}
export type FactKey = 'count' | 'deepest' | 'souls' | 'era' | 'rare' | 'floors' | 'wins' | 'beaten' | 'light' | 'room';

/** A condition on town state and real game state. Every field given must hold. */
export interface Cond {
  phase?: Phase | readonly Phase[];
  weather?: Weather;
  /** Quest state: 'none' not started, 'active', 'done', or a stage number (active and at that stage). */
  quest?: readonly [string, 'none' | 'active' | 'done' | number];
  has?: string | readonly [string, number];
  flag?: string;
  noFlag?: string;
  fact?: readonly [FactKey, '>=' | '<' | '==', number];
  /** Collectibles of a kind found so far. */
  found?: readonly [string, number];
  /** Districts discovered. */
  districts?: number;
  /** Rival id beaten. */
  beat?: number;
  any?: readonly Cond[];
  not?: Cond;
}

export interface Reward {
  coins?: number;
  items?: readonly (readonly [string, number])[];
  /** Sky pieces: kind and count. */
  sky?: readonly (readonly [string, number])[];
  /** Glow points (1000 = one pip of Light). */
  glow?: number;
  /** Give a universe (seeded from this label) when the Box has room. */
  universe?: string;
  flags?: readonly string[];
  /** Items taken away. */
  take?: readonly (readonly [string, number])[];
}

export interface Choice {
  text: string;
  /** What they answer. */
  say?: string;
  /** Flags set when picked (NPC memory of what you said). */
  set?: readonly string[];
  give?: Reward;
  need?: Cond;
}
export interface Line {
  when?: Cond;
  text: string;
  choices?: readonly Choice[];
  /** Said once only (remembered under this flag). */
  once?: string;
  /** Higher wins. Lines of equal weight rotate. Default 0. */
  weight?: number;
  set?: readonly string[];
  give?: Reward;
}

export interface Look { hair: number; top: number; legs: number; skin?: number; hat?: number; tall?: boolean; kind?: 'person' | 'dog' | 'cat' | 'shade' | 'bird' }
export type Post = readonly [number, number] | null;
export interface NpcDef {
  id: string;
  name: string;
  kid?: boolean;
  /** One line on who they are (shown in the hub). */
  about: string;
  look: Look;
  /** Where they stand in each phase; null or missing = not about. */
  at: Partial<Record<Phase, Post>>;
  /** Tiles they drift from their post. Default 1. */
  roam?: number;
  lines: readonly Line[];
  /** Shop they keep, if any. */
  shop?: string;
  /** Only present while this holds. */
  when?: Cond;
  /** Lives inside this interior (an INTERIORS id). Posts are then tiles relative to the room's top-left corner. */
  inside?: string;
}

export type StepOn =
  | { type: 'talk'; npc: string; need?: Cond; say: string; wait?: string; choices?: readonly Choice[] }
  | { type: 'reach'; at: readonly [number, number]; r?: number; need?: Cond; say?: string; /** Interior id: `at` is then relative to that room, and the step only fires inside it. */ inside?: string }
  | { type: 'cond'; need: Cond; say?: string }
  | { type: 'wait'; days: number; say?: string };
export interface Step {
  hint: string;
  on: StepOn;
  give?: Reward;
  /** Where the map marker goes (defaults to the npc or the reach point). */
  mark?: readonly [number, number];
  /** A creature shown at the reach point while this step is active (for follow quests). */
  actor?: Look;
}
export interface QuestDef {
  id: string;
  name: string;
  thread: 'main' | 'side';
  giver: string;
  /** What the giver says to offer it. */
  offer: string;
  accept?: string;
  /** Handed over when the quest is taken. */
  start?: Reward;
  needs?: Cond;
  steps: readonly Step[];
  reward: Reward;
  /** Said in the log once finished. */
  end: string;
}

export interface ItemDef { id: string; name: string; desc: string; kind: 'key' | 'tool' | 'food' | 'trinket' | 'find' | 'thing'; value?: number }
export interface ShopDef { id: string; name: string; open: readonly Phase[]; stock: readonly { item: string; price: number; limit?: number }[]; buys?: readonly { item: string; price: number }[] }
export interface CollectKind { id: string; name: string; one: string; count: number; item: string; districts?: readonly string[]; reward: Reward; says: string }

export interface GateDef { id: string; at: readonly [number, number]; w?: number; h?: number; open: Cond; shut: string; look?: 'gate' | 'dog' | 'dark' | 'bar' }
export interface PlaceDef {
  id: string;
  name: string;
  at: readonly [number, number];
  /** Not on the map until found. */
  hidden?: boolean;
  /** A bus stop: fast travel once discovered. */
  stop?: boolean;
  /** Text of a sign standing here. */
  sign?: string;
  /** A bench: sitting passes time. */
  bench?: boolean;
  /** A place to skim stones. */
  skim?: boolean;
  /** A photo spot: what the picture shows, said once. */
  photo?: string;
  /** The id of an interior this place stands for (`at` is its street door). Set by the interiors table. */
  inside?: string;
  /** Draw extra tiles into the map (runs after the base map is built). */
  build?: (b: Builder) => void;
}
export interface Builder {
  set(x: number, y: number, t: number): void;
  get(x: number, y: number): number;
  rect(x: number, y: number, w: number, h: number, t: number): void;
  /** A building: roof rows over one wall row, door at x + door. */
  house(x: number, y: number, w: number, h: number, door: number, kind?: number): void;
  ring(x: number, y: number, w: number, h: number, t: number): void;
}
export interface District { id: string; name: string; rect: readonly [number, number, number, number]; says: string }

export interface EncounterDef {
  /** Index into ctx.battles.rivals(). */
  rival: number;
  at: Partial<Record<Phase, Post>>;
  look: Look;
  /** Extra lines by state. `beat` conditions use the rival id. */
  before: string;
  after: string;
  /** Where they go once beaten (defaults to a couple of tiles off their old spot). */
  beatenAt?: Partial<Record<Phase, Post>>;
  /** A line said as they notice you, before the taunt. */
  notice?: string;
  when?: Cond;
}

export interface QuestState { stage: number; done: boolean; day: number }
export interface TownState {
  v: 2;
  x: number; y: number; dir: number;
  /** Game minutes since the first morning (day 0, 07:00 is minute 420). */
  minutes: number;
  coins: number;
  bag: Record<string, number>;
  quests: Record<string, QuestState>;
  flags: Record<string, number>;
  /** Times spoken to each NPC. */
  talks: Record<string, number>;
  /** Collectible ids found. */
  found: string[];
  /** Explored 8x8 cells, one char per cell ('1' seen). */
  seen: string;
  places: string[];
  districts: string[];
  bought: Record<string, number>;
  run: boolean;
  /** A battle was started from the street and has not come back yet. */
  fromTown: boolean;
  skim: { best: number; day: number; throws: number };
  stats: { steps: number; talks: number; rides: number; sits: number };
  /** Finished-quest log lines, newest last. */
  log: string[];
  /** Interior id while indoors, and the street spot to come back out to. */
  inside?: string; bx?: number; by?: number;
  /** On the bike. */
  riding?: boolean;
}

/** One line of the bottom sheet. */
export interface Scene {
  who: string;
  text: string;
  choices?: readonly { text: string; pick: () => Scene | null; off?: boolean }[];
  /** A special sheet: the skimming game. */
  skim?: string;
  /** A special sheet: fishing ('mere', 'creek' or 'pond'). */
  fish?: string;
  /** Speaker look for the portrait. */
  look?: Look;
}

export type TownEvent =
  | { type: 'quest'; id: string; name: string; state: 'start' | 'step' | 'done'; text: string }
  | { type: 'item'; id: string; name: string; n: number }
  | { type: 'coins'; n: number }
  | { type: 'find'; kind: string; name: string; have: number; of: number }
  | { type: 'place'; id: string; name: string }
  | { type: 'district'; id: string; name: string; says: string }
  | { type: 'note'; text: string; title?: string }
  | { type: 'sfx'; name: string }
  /** The screen should start a battle with this rival id. */
  | { type: 'battle'; rival: number }
  | { type: 'go'; to: 'bedroom' | 'outside' }
  | { type: 'moved' };

export interface Actor {
  id: string;
  name: string;
  kind: 'npc' | 'rival' | 'quest';
  look: Look;
  /** Pixels, feet at the tile's centre. */
  x: number; y: number;
  tx: number; ty: number;
  hx: number; hy: number;
  dir: number;
  moving: boolean;
  here: boolean;
  roam: number;
  next: number;
  rival: number;
  /** A route being walked to a new post. */
  rx?: Int16Array; ry?: Int16Array; rn?: number; ri?: number;
  /** Wants a route worked out. */
  want?: boolean;
  /** Clock time they last noticed the kid; 0 = not yet. */
  alert?: number;
}

export interface TownDeps {
  facts(): Facts;
  grantSky(kind: string, n: number): void;
  addGlow(points: number): void;
  /** Returns the universe's name when it was added, or null when the Box was full. */
  addUniverse(label: string): string | null;
  rivals(): readonly { id: number; name: string; taunt: string; again?: string; beaten?: string; boss?: string; where: string }[];
}

/** A small room behind a street door. Rows are drawn with: # wall, . floor, D the way out (bottom row), c counter,
 *  s shelf or board (reads, in turn), b bed, B a box on the floor, w window, p pew or bench, space nothing. */
export interface InteriorDef {
  id: string; name: string;
  /** Label of the street door (see map doors), or its tile(s). */
  door?: string; at?: readonly (readonly [number, number])[];
  rows: readonly string[];
  reads?: readonly string[];
  /** Shop served at the counter. */
  shop?: string;
  /** Said the first time you step in. */
  says?: string;
  /** Shut at night. */
  day?: boolean;
  /** What the box on the floor is. */
  box?: string;
}
/** Something that can be pulled out of the water. Heavier `weight` = commoner. */
export interface CatchDef { id: string; name: string; desc: string; weight: number; where?: 'mere' | 'creek' | 'pond'; night?: boolean; coins?: number }
