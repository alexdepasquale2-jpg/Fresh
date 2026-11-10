import type { PlanetSpec, PlanetSurface } from './system';
import type { UniverseSpec } from './universe';
import type { SurfaceModifiers, SkyState } from './sky';

export { GRID_W, GRID_H, CHUNK } from './system';

/** Coarse field cell size (temperature) in grid cells. */
export const FIELD = 4;
export const DAY_TICKS = 400;
export const YEAR_TICKS = 1600;

/**
 * Engine-level materials every universe has, beside its law set. Ids 250..254
 * are reserved; law sets must not use them. Colours are palette slots.
 */
export const ENGINE = {
  ice: { id: 250, color: 9 },
  snow: { id: 251, color: 9 },
  ore: { id: 252, color: 7 },
  fire: { id: 253, color: 13 },
  ash: { id: 254, color: 3 },
} as const;

/** Environment of the surface, for civ, chronicle and render. Read-only views. */
export interface SurfaceEnv {
  /** 0..999 time of day; 0 midnight, 500 noon. */
  readonly day: number;
  /** 0..999 through the year; 250 midsummer, 750 midwinter. */
  readonly season: number;
  readonly fieldW: number;
  readonly fieldH: number;
  /** Coarse temperature, fieldW*fieldH; 128 mild, <100 freezing, >200 burning. */
  readonly temp: Readonly<Uint8Array>;
  /** Cloud moisture per coarse column 0..255. Rain above 150. */
  readonly humidity: Readonly<Uint8Array>;
  /** -100..100, positive blows right. */
  readonly wind: number;
  /** 0..255 overall rain intensity. */
  readonly rain: number;
  readonly snowing: boolean;
  /** Ticks since the last lightning strike (for flashes). */
  readonly lightning: number;
}

export type SurfaceEventKind = 'impact' | 'flood' | 'drought' | 'freeze' | 'thaw' | 'fire' | 'storm' | 'bloom' | 'blight' | 'ore' | 'lightning' | 'quake';
export interface SurfaceEvent {
  readonly kind: SurfaceEventKind;
  readonly tick: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/**
 * Read-only view of the surface grid.
 * Invariants: cells is row-major width*height material ids; chunks are
 * CHUNK x CHUNK cells (edge chunks may be partial); dirty[cy*chunksX+cx] is 1
 * when that chunk changed since the last clearDirty().
 */
export interface GridView {
  readonly width: number;
  readonly height: number;
  readonly cells: Readonly<Uint8Array>;
  readonly chunksX: number;
  readonly chunksY: number;
  readonly dirty: Readonly<Uint8Array>;
  clearDirty(): void;
}

/**
 * Falling-sand surface. Runs in the sim Worker at a fixed 20 ticks/s.
 * Invariants: deterministic in (planet, universe, surface, sequence of
 * step calls); step steps dirty chunks only; snapshot/restore round-trips
 * byte-identically, including the tick counter and RNG state. A restored sim
 * continues exactly as the one snapshotted would have; restore() never throws,
 * and reads the snapshots of older formats as well as it can.
 */
export interface SurfaceSim {
  init(planet: PlanetSpec, universe: UniverseSpec, surface: PlanetSurface): void;
  step(ticks: number, modifiers: SurfaceModifiers): void;
  grid(): GridView;
  tick(): number;
  env(): SurfaceEnv;
  /** A god tool touches the surface at (x, y) with radius r (grid cells). */
  apply(tool: SurfaceTool, x: number, y: number, r: number): void;
  /** Surface events since the last call. */
  drainEvents(): readonly SurfaceEvent[];
  snapshot(): Uint8Array;
  restore(snapshot: Uint8Array): void;
}
export type SurfaceSimFactory = () => SurfaceSim;

/** What a village builds as it grows. x is the column it stands on. */
export type BuildingKind = 'house' | 'fire' | 'farm' | 'dock' | 'mine' | 'workshop' | 'market' | 'store' | 'shrine' | 'tower' | 'pad';
export const BUILDING_KINDS: readonly BuildingKind[] = ['house', 'fire', 'farm', 'dock', 'mine', 'workshop', 'market', 'store', 'shrine', 'tower', 'pad'];
export interface Building { readonly kind: BuildingKind; readonly x: number; readonly seed: number }

export type Belief = 'none' | 'sun' | 'moon' | 'sea' | 'stone' | 'fire' | 'sky';
export const BELIEFS: readonly Belief[] = ['none', 'sun', 'moon', 'sea', 'stone', 'fire', 'sky'];
/** Tech eras: 0 huts, 1 fire, 2 iron, 3 lamps, 4 bells, 5 star-reaching. */
export const ERAS = ['huts', 'fire', 'iron', 'lamps', 'bells', 'star-reaching'] as const;

export interface Village {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** souls in this village */
  readonly souls: number;
  readonly name: string;
  readonly tech: number;
  readonly belief: Belief;
  /** 0..999 stores. */
  readonly food: number;
  /** -100..100 */
  readonly mood: number;
  /** 0..100. At 100 they understand what you are and will not fear you. */
  readonly enlightenment: number;
  /** Coin from trade and craft, 0..999. */
  readonly wealth: number;
  /** Crafted goods waiting to be traded. */
  readonly goods: number;
  /** 0..100: fed, rich and glad. */
  readonly prosperity: number;
  readonly buildings: readonly Building[];
  /** True era 0..8 (tech is held at 5 for older readers; see LATE_ERAS). */
  readonly era?: number;
  /** Name of the creed kept here, e.g. 'the Patient Tide'. */
  readonly creed?: string;
  /** Name of the ruler, if one sits. */
  readonly ruler?: string;
  /** What weighs on the village right now. */
  readonly state?: 'war' | 'plague' | 'tribute' | 'festival' | 'building' | 'heresy';
  /** The other village of a war or tribute. */
  readonly stateWith?: number;
  /** Great works finished here, by name. */
  readonly works?: readonly string[];
  /** True when it keeps a school. */
  readonly school?: boolean;
}
/** Eras past star-reaching: tech 6, 7, 8. Village.tech and CivView.era stay at 5 for them. */
export const LATE_ERAS = ['engines', 'far-speaking', 'leaving'] as const;
/** A named person other than the notable: a ruler, a heretic. */
export interface Figure {
  readonly name: string;
  readonly title: 'ruler' | 'heretic';
  readonly villageId: number;
}
/** How two villages stand. */
export interface Relation {
  readonly a: number;
  readonly b: number;
  readonly kind: 'pact' | 'alliance' | 'rivalry' | 'war' | 'tribute';
}
export type CivEventKind =
  | 'found' | 'grow' | 'split' | 'die' | 'migrate' | 'light'
  | 'famine' | 'tech' | 'convert' | 'feud' | 'festival' | 'burn' | 'flooded' | 'frozen' | 'launch' | 'merged'
  | 'born' | 'deed' | 'passed' | 'built' | 'traded' | 'struck' | 'preached' | 'gift' | 'omen' | 'stranger' | 'attack' | 'slain' | 'worship' | 'enlightened' | 'smitten' | 'blessed'
  // Between villages. villageId acts, `other` is acted on.
  | 'pact' | 'alliance' | 'wedding' | 'rivalry' | 'raid' | 'war' | 'peace' | 'tribute' | 'razed' | 'absorbed'
  // Faith.
  | 'creed' | 'schism' | 'heresy' | 'exile' | 'holy' | 'sign'
  // Hardship and recovery.
  | 'plague' | 'plagueEnd' | 'refugees' | 'resettled' | 'recovered'
  // Culture, works and people.
  | 'song' | 'wonder' | 'school' | 'invention' | 'ark' | 'voyage' | 'crowned' | 'fell'
  // The life of the player's body: detail is a deed code particular to sim/civ and sim/chronicle.
  | 'body';
export interface CivEvent {
  readonly kind: CivEventKind;
  readonly tick: number;
  readonly villageId: number;
  readonly x: number;
  readonly y: number;
  /** Tech level for 'tech', other village id for 'feud'/'migrate'. */
  readonly detail?: number;
  readonly belief?: Belief;
  /** The other village of the event (foe, partner, source, the ruin resettled). */
  readonly other?: number;
  /** A named figure: ordinal + 4096 * house. The name is a pure function of (planet seed, who). */
  readonly who?: number;
  /** Why it happened, as a small code particular to the kind; the chronicle turns it into the reason. */
  readonly cause?: number;
  /** Creed id. The creed's name is a pure function of (planet seed, creed, belief). */
  readonly creed?: number;
  /** Souls involved: the dead, the refugees, those aboard. */
  readonly count?: number;
}
/** Person roles in CivView.people. */
export const ROLE = { idle: 0, farm: 1, fish: 2, pray: 3, travel: 4, lamp: 5, attack: 6, kneel: 7, watch: 8, flee: 9, listen: 10, carry: 11, chat: 12, dance: 13, sleep: 14, mine: 15, craft: 16, trade: 17, build: 18 } as const;
/** Floats per person in CivView.people. */
export const PERSON_STRIDE = 5;
/** What the player's body can do. */
export type BodyAction = 'strike' | 'preach' | 'gift' | 'shine' | 'rest' | BodyDeed;
export const BODY_ACTIONS: readonly BodyAction[] = ['strike', 'preach', 'gift', 'shine', 'rest'];
/**
 * Things a body can do only where they apply (see Avatar.options). heal the sick, work a field or
 * a great work, trade, teach, speak to a ruler (plead for peace, incite a war, petition against a
 * tribute), stand between armies, challenge a heretic or side with one, bless or curse a harvest,
 * keep vigil at a shrine, bury the dead, carry and deliver between villages, found a village with
 * followers, accept a role, eat at their table, steal.
 */
export type BodyDeed =
  | 'heal' | 'work' | 'trade' | 'teach' | 'plead' | 'incite' | 'petition' | 'stand' | 'challenge' | 'side'
  | 'blessHarvest' | 'curseHarvest' | 'vigil' | 'bury' | 'carry' | 'deliver' | 'found' | 'role' | 'eat' | 'steal';
export const BODY_DEEDS: readonly BodyDeed[] = ['heal', 'work', 'trade', 'teach', 'plead', 'incite', 'petition', 'stand', 'challenge', 'side', 'blessHarvest', 'curseHarvest', 'vigil', 'bury', 'carry', 'deliver', 'found', 'role', 'eat', 'steal'];
/** One thing the body could do now, or why not yet. */
export interface BodyOption {
  readonly id: BodyAction;
  readonly ready: boolean;
  /** Ticks until it can be used again (0 when it is not cooling). */
  readonly wait: number;
  /** Why it cannot be used, when ready is false and it is not only cooling. */
  readonly reason?: string;
  /** What it will do here, in a sentence. */
  readonly does?: string;
  /** The village it would act on. */
  readonly villageId?: number;
}
/** How a village treats the body. */
export type StandingLevel = 'hunted' | 'shunned' | 'tolerated' | 'welcome' | 'followed';
export interface BodyStanding {
  readonly villageId: number;
  /** -100..100 */
  readonly value: number;
  readonly level: StandingLevel;
  /** What they remember, most told first, e.g. 'healed their sick'. */
  readonly remembered: readonly string[];
}
export type BodyRole = 'healer' | 'envoy' | 'prophet';
export interface CivView {
  readonly villages: readonly Village[];
  readonly souls: number;
  /** Glow sent to the player's light, per in-game minute (integer). */
  readonly glowPerMinute: number;
  /** People: [x, y, role, villageId, id] * count (PERSON_STRIDE). id is stable, so renderers can smooth movement. */
  readonly people: Readonly<Int16Array>;
  readonly peopleCount: number;
  /** Highest tech level reached on this planet. */
  readonly era: number;
  /** Average village prosperity, 0..100. */
  readonly prosperity: number;
  /** Things this world has put into orbit since it was opened. */
  readonly launches: number;
  /** Ticks since the last launch (for the rocket animation). */
  readonly launchAge: number;
  /** The one person on this world the chronicle follows by name, if any. */
  readonly notable?: Notable | null;
  /** The player's incarnation on this surface, if any. */
  readonly avatar: Avatar | null;
  /** True highest era, 0..8 (era stays at 5 past star-reaching). */
  readonly age?: number;
  /** Rulers and heretics alive now. */
  readonly figures?: readonly Figure[];
  /** Creeds kept by at least one village. */
  readonly creeds?: readonly { readonly id: number; readonly name: string; readonly belief: Belief; readonly villages: number }[];
  readonly relations?: readonly Relation[];
  /** Ghost towns waiting to be resettled. */
  readonly ruins?: number;
  /** Colony ships that have left for good (also counted in launches). */
  readonly arks?: number;
}

/**
 * A named person the chronicle follows through their life: born, does deeds, grows
 * old, dies, and is succeeded. personId matches the id in CivView.people while alive.
 */
export interface Notable {
  readonly personId: number;
  readonly name: string;
  /** e.g. 'prophet', 'smith', 'trader', 'wanderer', 'elder'. */
  readonly calling: string;
  /** Years lived. */
  readonly age: number;
  readonly villageId: number;
  /** Short lines of what they have done, newest last. */
  readonly deeds: readonly string[];
  /** True if they have met the player's body. */
  readonly metYou: boolean;
}

/** The player walking the surface in a body. */
export interface Avatar {
  readonly x: number;
  readonly y: number;
  /** 0..100 */
  readonly hp: number;
  /** How many villagers are attacking right now. */
  readonly attackers: number;
  /** How many villagers are kneeling right now. */
  readonly worshippers: number;
  /** Last body action and how many ticks ago, for animation. */
  readonly action: BodyAction | null;
  readonly actionAge: number;
  /** Everything the body can do here, the five old actions first, with readiness. */
  readonly options?: readonly BodyOption[];
  /** How each village that knows the body stands toward it. */
  readonly standing?: readonly BodyStanding[];
  /** Needs, 0..100. Hunger and weariness hurt mildly above 80. wound lowers the most the body can mend to. */
  readonly hunger?: number;
  readonly weariness?: number;
  readonly wound?: number;
  /** True while the plague is in the body. */
  readonly sick?: boolean;
  /** What the weather is doing to it, if anything. */
  readonly exposure?: 'cold' | 'storm' | null;
  /** True when it stands in a village that will let it sleep safely. */
  readonly sheltered?: boolean;
  readonly role?: BodyRole | null;
  /** A role the villagers are offering; the 'role' action accepts it. */
  readonly roleOffer?: BodyRole | null;
  readonly followers?: number;
  /** What it carries for another village, in words. */
  readonly carrying?: string | null;
  /** The village a carried message or load is meant for. */
  readonly carryingTo?: number | null;
  /** The village whose ruler is hunting it, if any. */
  readonly huntedBy?: number | null;
  /** Name of the creed that has formed about the body, if one has. */
  readonly creed?: string | null;
  /** How many bodies have walked this world, this one included. */
  readonly lives?: number;
  /** What this body has done this life, oldest first, short lines. */
  readonly log?: readonly string[];
}

/**
 * God tools. Surface tools change the grid (SurfaceSim.apply); soul tools act on
 * villages (Civ.apply). Every use is seen by the inhabitants as an omen.
 */
export type SurfaceTool = 'water' | 'sand' | 'stone' | 'seed' | 'fire' | 'freeze' | 'meteor' | 'rain' | 'quake' | 'lightning' | 'heat' | 'cold' | 'erase';
export type SoulTool = 'bless' | 'smite' | 'sow' | 'whisper' | 'merge';
export type Tool = SurfaceTool | SoulTool;
export const SURFACE_TOOLS: readonly SurfaceTool[] = ['water', 'sand', 'stone', 'seed', 'fire', 'freeze', 'meteor', 'rain', 'quake', 'lightning', 'heat', 'cold', 'erase'];
export const SOUL_TOOLS: readonly SoulTool[] = ['bless', 'smite', 'sow', 'whisper', 'merge'];
/** Villages on the grid. Deterministic like SurfaceSim. Reads the grid, never writes it. */
export interface Civ {
  /** With the universe, the civ knows every liquid of its law set: it does not found on one, and a village one rises over floods. */
  init(planet: PlanetSpec, surface: PlanetSurface, universe?: UniverseSpec): void;
  step(ticks: number, grid: GridView, modifiers: SurfaceModifiers, env: SurfaceEnv, surface: readonly SurfaceEvent[]): readonly CivEvent[];
  view(): CivView;
  /** A soul tool, or the omen of a surface tool, at x. */
  apply(tool: Tool, x: number, y: number): void;
  /** Take a body at column x. Replaces any current avatar. */
  incarnate(x: number): void;
  /** Walk the avatar toward column x. */
  walk(x: number): void;
  /** Leave the body. */
  ascend(): void;
  /** The body acts: strike attackers, preach, give, shine, or rest. */
  act(action: BodyAction): void;
  /** Everything, the living body included: a restored civ continues exactly as the one snapshotted would have. */
  snapshot(): Uint8Array;
  restore(snapshot: Uint8Array): void;
}
export type CivFactory = () => Civ;

/**
 * One chronicle line. The event is recorded first; the reason is attached
 * later (back-filled from sky state and earlier events). Invariant: id is
 * unique and increasing; reason, once set, never changes.
 */
export interface ChronicleEntry {
  readonly id: number;
  readonly year: number;
  readonly event: string;
  readonly reason?: string;
  /** What kind of event wrote the line: a CivEventKind, a SurfaceEventKind or 'quiet'. */
  readonly kind?: string;
  /** Where it happened, in grid cells, when it happened somewhere. */
  readonly x?: number;
  readonly y?: number;
  /** The village it is about. */
  readonly villageId?: number;
  /** For kind 'body': which deed, e.g. 'heal', 'death', 'creed'. */
  readonly deed?: string;
}
export interface Chronicle {
  record(events: readonly CivEvent[], year: number, planet: PlanetSpec, surface?: readonly SurfaceEvent[]): void;
  /** Attach reasons to entries that have none, using the sky and history. */
  explain(sky: SkyState, modifiers: SurfaceModifiers, skySays: readonly string[]): void;
  /** Newest first. */
  entries(limit?: number): readonly ChronicleEntry[];
  snapshot(): ChronicleEntry[];
  /**
   * What snapshot() leaves out and an exact restore needs (when each line was written, the event
   * behind it, the phrasing memory), as an opaque string to store beside the entries.
   */
  memory?(): string;
  /** With the memory taken beside these entries, the chronicle goes on exactly as it would have. Without, it goes on plausibly. */
  restore(entries: readonly ChronicleEntry[], memory?: string): void;
}
export type ChronicleFactory = (deps: { names: import('./universe').NameGen }) => Chronicle;
