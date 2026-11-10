/**
 * The campaign: twelve chapters laid over the sandbox, side stories beside them, a Journal
 * page in the hub, and an epilogue assembled from what the player really did. Nothing here
 * is self-reported or timed. Every objective is a predicate over real game state (the Box
 * and its stats, every sky, the open surface, the dive, the battle and its ladder, the room
 * at the bottom, the Almanac and the Codex), sampled a few times a second.
 *
 * Facts that can only be seen while they are true (a body, a war, a stratum passed) are
 * remembered the moment they are seen, whatever chapter is open, so a chapter you reach
 * late fills in at once with what you have already done.
 *
 * Read only, never written: 'sallow-ladder' (ui/battle), 'sallow-almanac', 'sallow-codex',
 * and the endgame state through src/ui/mirror/endgame. The dive is read through its view and
 * summary only; Dive.takeEvents belongs to the dive HUD and is never called here.
 *
 * Other plugins may read `window.__sallowCampaign` ({ chapter, chapters, done, side }).
 */
import './campaign.css';
import { el, button, displayName } from '@/ui/kit';
import type { ScreenId, SimFrame } from '@/contracts/app';
import type { BoxEntry, DiveView } from '@/contracts/game';
import type { SkyPieceKind, SkyState } from '@/contracts/sky';
import type { BattleState, Rival } from '@/contracts/battle';
import type { UniverseSpec } from '@/contracts/universe';
import { RARITIES } from '@/contracts/universe';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { DAY_TICKS } from '@/contracts/sim';
import { seedToU32 } from '@/core/hash';
import { load as loadEnd, readSeen, FRAGMENTS } from '@/ui/mirror/endgame';
import { whenLoaded, loadTown } from '@/ui/town/lazy';
// The town's tables arrive only once the town has been loaded (it is a separate chunk).
type TownGame = typeof import('@/game/town');
let COLLECT = [] as unknown as TownGame['COLLECT'];
let DISTRICTS = [] as unknown as TownGame['DISTRICTS'];
let NPCS = [] as unknown as TownGame['NPCS'];
let QUESTS = [] as unknown as TownGame['QUESTS'];
whenLoaded((m) => { COLLECT = m.game.COLLECT; DISTRICTS = m.game.DISTRICTS; NPCS = m.game.NPCS; QUESTS = m.game.QUESTS; });
// Someone who has been out before has a town to count; load it quietly in the background.
try { if (localStorage.getItem('sallow-town')) void loadTown(); } catch { /* storage blocked */ }

import type { Plugin } from '../plugins';

const CHECK_MS = 300;
const SOULS_GOAL = 120;
const WALK_GOAL = 12;
const ORBIT_GOAL = 6;
const ALIGN_GOAL = 8;
const TEND_GOAL = 5;
const KEEP_GOAL = 12;
const RIVALS_GOAL = 3;
const LADDER_KEY = 'sallow-ladder';
const ALMANAC_KEY = 'sallow-almanac';
const CODEX_KEY = 'sallow-codex';
/** The town's save. Read here, never written. */
const TOWN_KEY = 'sallow-town';

// ---- reading other units' stores without owning them ----
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const jsonCache = new Map<string, { raw: string | null; val: unknown }>();
/** Parse a stored value only when its text has changed. */
const readJson = (key: string): unknown => {
  let raw: string | null = null;
  try { raw = localStorage.getItem(key); } catch { return null; }
  const c = jsonCache.get(key);
  if (c && c.raw === raw) return c.val;
  let val: unknown = null;
  try { val = raw ? JSON.parse(raw) : null; } catch { val = null; }
  jsonCache.set(key, { raw, val });
  return val;
};

/** What the journal remembers of things that can only be seen while they happen. */
interface Hist {
  /** The first universe the journal ever saw in the Box (-1 until there is one). */
  first: number;
  /** Names of strata fallen through. */
  strata: string[];
  /** Most strata crossed in one dive. */
  strataDive: number;
  pickups: number;
  dodged: number;
  /** Dives of ten folds or more that ended with no hazard hit. */
  clean: number;
  streak: number;
  mult: number;
  /** Glow carried back up from dives. */
  back: number;
  /** Losses by rival id. */
  lost: Record<string, number>;
  /** Kinds of sky piece seen hanging. */
  kinds: string[];
  /** A named person from a world the player watched. */
  person: string;
  /** Worlds (keys) seen at war. */
  warWorlds: string[];
  /** A war seen to end on a world it was seen on. */
  warEnded: boolean;
  /** Era each watched world was first seen at. */
  seen: Record<string, number>;
  plagueKey: string;
  plagueOver: boolean;
  /** Highest true era seen on a watched world (0..8). */
  age: number;
}
const blankHist = (): Hist => ({
  first: -1, strata: [], strataDive: 0, pickups: 0, dodged: 0, clean: 0, streak: 0, mult: 1, back: 0, lost: {}, kinds: [],
  person: '', warWorlds: [], warEnded: false, seen: {}, plagueKey: '', plagueOver: false, age: 0,
});

/** Everything an objective may look at. Rebuilt on every check from live state. */
interface World {
  readonly screen: ScreenId | null;
  /** Screens the player has stood on since the journal began. */
  readonly been: ReadonlySet<string>;
  readonly entries: readonly BoxEntry[];
  readonly boxCount: number;
  readonly maxDepth: number;
  readonly tended: number;
  readonly tendedUniverses: number;
  readonly glow: number;
  readonly bestSouls: number;
  readonly bestEra: number;
  readonly skies: readonly SkyState[];
  readonly maxPieces: number;
  readonly orbiters: number;
  /** Things in orbit across the solar system the player is in now. */
  readonly systemOrbiters: number;
  readonly frame: SimFrame | null;
  /** Key of the world on screen, '' when none. */
  readonly worldKey: string;
  readonly dive: DiveView;
  readonly battle: BattleState | null;
  readonly beaten: number;
  /** True while the planet screen is showing the world through the body's eyes. */
  readonly eyes: boolean;
  /** Columns walked from where the current body was taken. */
  readonly walked: number;
  /** Sim ticks the current body has lived. */
  readonly bodyTicks: number;
  readonly mirrorGifts: number;
  /** A universe arrived in the Box while falling: a flicker caught in a reliquary. */
  readonly caughtFalling: boolean;
  readonly h: Hist;
  // The ladder.
  readonly anyXp: boolean;
  readonly level: number;
  readonly relics: number;
  readonly held: number;
  readonly bosses: number;
  readonly tierOne: boolean;
  readonly champion: boolean;
  /** Most wins against one rival. */
  readonly rewins: number;
  /** Wins against the rival who has beaten the player most (0 when nobody has). */
  readonly revenge: number;
  // Universe character.
  /** Best rarity held, as an index into RARITIES. */
  readonly rarity: number;
  /** Rarities held, as a bit set. */
  readonly rarities: number;
  readonly bond: number;
  readonly generation: number;
  readonly gifts: number;
  readonly strange: boolean;
  // The room at the bottom.
  readonly fragments: number;
  readonly talks: number;
  readonly left: number;
  readonly taken: number;
  readonly above: number;
  readonly wakings: number;
  // Almanac and Codex.
  readonly almStreak: number;
  readonly almPaid: number;
  readonly almTasks: number;
  readonly almAnswered: number;
  readonly deeds: number;
  readonly deedsClaimed: number;
  // The street (the town's own save, read only).
  readonly tSteps: number;
  readonly tDistricts: number;
  readonly tPeople: number;
  readonly tQuests: number;
  /** The main thread out there has moved: its first errand is past its first step, or done. */
  readonly tMain: boolean;
  readonly tFound: number;
  readonly tSets: number;
  readonly tSkim: number;
  /** Standing in the street after dark, now. */
  readonly tNight: boolean;
  /** A battle begun in the street has just been won. */
  readonly tWonOut: boolean;
}

type Place = 'bed' | 'box' | 'dive' | 'star' | 'planet' | 'out' | 'fight' | 'room' | 'hub' | 'town';
/** Where an objective is done: the screen, what to call it, and how to get there from anywhere. */
const PLACE: Record<Place, { screen: ScreenId | null; name: string; way: string }> = {
  bed: { screen: 'bedroom', name: 'the bedroom', way: 'Go back to the bedroom' },
  box: { screen: 'box', name: 'the Box', way: 'Bedroom, then OPEN THE BOX' },
  dive: { screen: 'dive', name: 'the fall', way: 'The Box, choose a universe, press ENTER' },
  star: { screen: 'system', name: 'a star', way: 'Fall, and let go of HOLD beside a star' },
  planet: { screen: 'planet', name: 'a surface', way: 'At a star, press WATCH THE SURFACE' },
  out: { screen: 'outside', name: 'outside', way: 'Bedroom, then GO OUTSIDE' },
  fight: { screen: 'battle', name: 'a battle', way: 'Outside, choose a kid' },
  room: { screen: 'mirror', name: 'the room at the bottom', way: 'Fall to the floor of a universe' },
  hub: { screen: null, name: 'the menu', way: 'Open the menu in the top corner' },
  town: { screen: 'town', name: 'the street', way: 'Bedroom, then THE STREET' },
};

interface Objective {
  readonly id: string;
  readonly at: Place;
  readonly text: string;
  /** One line for the Journal while the objective is open. */
  readonly hint: string;
  test(w: World): boolean;
  /** [have, want] shown beside an open objective. */
  count?(w: World): readonly [number, number];
}
interface Reward {
  readonly glow: number;
  readonly pieces: readonly (readonly [SkyPieceKind, number])[];
  /** A universe that arrives in the Box, if there is room and it is not already there. */
  readonly universe?: number;
  readonly says: string;
}
/** A chapter of the story, or a side story: the same shape. */
interface Chapter {
  readonly id: string;
  readonly title: string;
  readonly intro: string;
  readonly outro: string;
  readonly objectives: readonly Objective[];
  readonly reward: Reward;
}
const ob = (id: string, at: Place, text: string, hint: string, test: (w: World) => boolean, count?: (w: World) => readonly [number, number]): Objective =>
  (count ? { id, at, text, hint, test, count } : { id, at, text, hint, test });

const went = (w: World, s: ScreenId) => w.been.has(s);
const civ = (w: World) => w.frame?.civ ?? null;
const villages = (w: World) => civ(w)?.villages.length ?? 0;
const souls = (w: World) => Math.max(w.bestSouls, civ(w)?.souls ?? 0);
const avatar = (w: World) => civ(w)?.avatar ?? null;
const era = (w: World) => Math.max(w.bestEra, civ(w)?.era ?? 0);
const age = (w: World) => Math.max(w.h.age, w.bestEra, civ(w)?.age ?? civ(w)?.era ?? 0);
const atWar = (w: World) => !!civ(w) && ((civ(w)!.relations ?? []).some((r) => r.kind === 'war') || civ(w)!.villages.some((v) => v.state === 'war'));
const plagued = (w: World) => !!civ(w)?.villages.some((v) => v.state === 'plague');
const creeds = (w: World) => Math.max(civ(w)?.creeds?.length ?? 0, civ(w)?.villages.some((v) => !!v.creed) ? 1 : 0);
const ruled = (w: World) => !!civ(w) && ((civ(w)!.figures ?? []).some((f) => f.title === 'ruler') || civ(w)!.villages.some((v) => !!v.ruler));
const works = (w: World) => (civ(w)?.villages ?? []).reduce((n, v) => n + (v.works?.length ?? 0), 0);
/** Eras this world has risen while watched, zero once it has been seen at war. */
const peaceRise = (w: World) => {
  if (!civ(w) || !w.worldKey || w.h.warWorlds.includes(w.worldKey)) return 0;
  const from = w.h.seen[w.worldKey];
  return from === undefined ? 0 : (civ(w)!.age ?? civ(w)!.era) - from;
};
const bits = (n: number) => { let c = 0; for (let v = n; v; v >>= 1) c += v & 1; return c; };

const CHAPTERS: readonly Chapter[] = [
  {
    id: 'box',
    title: 'The Box',
    intro: 'There is a box on your PC. It was not there yesterday. Mote says it has always been there. Open it, and fall.',
    outro: 'You have been inside. The box is warmer than it was.',
    objectives: [
      ob('box.open', 'bed', 'Open the Box', 'In the bedroom, press OPEN THE BOX.', (w) => went(w, 'box') || w.maxDepth > 0 || w.tended > 0),
      ob('box.enter', 'box', 'Enter a universe', 'Choose a slot in the Box and press ENTER.', (w) => went(w, 'dive') || w.maxDepth > 0 || w.tended > 0),
      ob('box.fall', 'dive', 'Fall three folds deep', 'Hold HOLD to fall. Each fold costs a little Light.', (w) => w.maxDepth >= 3, (w) => [w.maxDepth, 3]),
      ob('box.star', 'dive', 'Stop at a star', 'Let go of HOLD while a star is near, or steer into one.', (w) => went(w, 'system') || w.tended > 0 || (w.dive.phase === 'stopped' && !!w.dive.star)),
      ob('box.watch', 'star', 'Watch a surface', 'At a star, choose a world and press WATCH THE SURFACE.', (w) => w.tended > 0 || (w.screen === 'planet' && !!w.frame)),
    ],
    reward: { glow: 1000, pieces: [['moon', 1], ['comet', 1]], says: 'A pip of Light, a moon and a comet.' },
  },
  {
    id: 'sky',
    title: 'Sky',
    intro: 'Begin with what hangs over them. The sky is your first and gentlest lever; your hands are the blunt one. They will look up, and decide what it means.',
    outro: 'They have a sky now, and a reason for it. They made the reason up.',
    objectives: [
      ob('sky.hang', 'star', 'Hang a piece in a sky', 'At a star, drag a sky piece from the tray onto an orbit. On a surface, open the Sky tab and press a piece.', (w) => w.maxPieces >= 1),
      ob('sky.three', 'star', 'Hang three pieces over one world', 'One sky holds up to eight. Three is enough to change a faith.', (w) => w.maxPieces >= 3, (w) => [w.maxPieces, 3]),
      ob('sky.nudge', 'star', 'Move a world nearer its star, or further', 'At a star, open Cosmic, choose Pull in or Push out, then tap an orbit.', (w) => w.skies.some((s) => (s.drift ?? 0) !== 0)),
      ob('sky.village', 'planet', 'See a new village founded', 'Watch a surface and let the years run. A crowded village sends its young to find new ground.', (w) => villages(w) >= 2, (w) => [villages(w), 2]),
      ob('sky.souls', 'planet', `Reach ${SOULS_GOAL} souls on one world`, 'Mild seasons, water and food. On the Watch tab run the clock at 3x and leave them be.', (w) => souls(w) >= SOULS_GOAL, (w) => [souls(w), SOULS_GOAL]),
      ob('sky.fire', 'planet', 'See a people learn fire', 'Villages that eat well and stay glad learn. Give them time.', (w) => era(w) >= 1),
      ob('sky.glow', 'planet', 'Let a world feed your Light', 'Souls glow. Keep watching a living world and Mote brightens.', (w) => w.glow > 0),
    ],
    reward: { glow: 1500, pieces: [['sun', 1], ['rings', 1], ['dust', 1]], universe: 0x51ca11, says: 'A pip and a half of Light, a sun, a set of rings, a veil of dust, and a universe that was waiting behind the others.' },
  },
  {
    id: 'body',
    title: 'Body',
    intro: 'Mote says there is a way down that is not falling. You take a body. It is small, and it is cold, and they can see it.',
    outro: 'Someone down there knows your face. You did not know you had one.',
    objectives: [
      ob('body.take', 'planet', 'Take a body', 'On a surface, open the Body tab, press Body, then tap the ground.', (w) => !!avatar(w)),
      ob('body.walk', 'planet', 'Walk among them', 'With a body, tap further along the ground to walk there.', (w) => w.walked >= WALK_GOAL, (w) => [w.walked, WALK_GOAL]),
      ob('body.eyes', 'planet', 'Open its eyes', 'With a body, press Eyes on the Body tab, or zoom all the way in.', (w) => w.eyes),
      ob('body.act', 'planet', 'Do something with its hands', 'The Body tab has Strike, Preach, Gift, Shine and Rest while you have a body.', (w) => !!avatar(w)?.action),
      ob('body.day', 'planet', 'Live one whole day in it', 'Stay in one body for a full turn of their sun. They may not let you.', (w) => w.bodyTicks >= DAY_TICKS, (w) => [Math.floor((w.bodyTicks * 100) / DAY_TICKS), 100]),
      ob('body.seen', 'planet', 'Be seen by the one the chronicle names', 'The People tab shows a named person. Press Find, then walk your body to them.', (w) => !!civ(w)?.notable?.metYou),
    ],
    reward: { glow: 2000, pieces: [['moon', 2], ['belt', 1]], universe: 0xb0d1e5, says: 'Two pips of Light, two moons, a belt of stones, and a universe that smells of rain.' },
  },
  {
    id: 'outside',
    title: 'Outside',
    intro: 'Other kids have boxes too. They do not talk about it at school. Go outside. Bring your three strongest.',
    outro: 'Their universes sit in your box now. They are quiet. They are listening to yours.',
    objectives: [
      ob('out.go', 'bed', 'Go outside', 'In the bedroom, press GO OUTSIDE.', (w) => went(w, 'outside') || w.beaten > 0),
      ob('out.fight', 'out', 'Stand against another box', 'Outside, choose a kid. The first is always willing.', (w) => !!w.battle || w.beaten > 0),
      ob('out.enter', 'fight', 'Step into your universe while the battle waits', 'In a battle, press GO INSIDE. The BATTLE chip at the top brings you back.', (w) => w.battle?.outcome === 'ongoing' && (w.screen === 'planet' || w.screen === 'system' || w.screen === 'dive')),
      ob('out.fuse', 'fight', 'Fuse two of yours into one', 'In a battle, press FUSE, then a universe on your bench. Once per battle.', (w) => !!w.battle && (w.battle.fusedUsed || w.battle.mine.some((f) => f.fused))),
      ob('out.win', 'fight', 'Win a battle', 'Watch what they mean to do next. Guard when it is a huge blow.', (w) => w.battle?.outcome === 'won' || w.beaten > 0),
      ob('out.catch', 'fight', 'Take one of their universes home', 'When you win, their box is open. Choose one.', (w) => w.beaten >= 1),
      ob('out.three', 'out', `Beat ${RIVALS_GOAL} rivals`, 'Each kid you beat lets you find the next.', (w) => w.beaten >= RIVALS_GOAL, (w) => [w.beaten, RIVALS_GOAL]),
    ],
    reward: { glow: 2500, pieces: [['belt', 2], ['comet', 2], ['dust', 1]], says: 'Two and a half pips of Light, two belts of stones, two comets and a veil of dust.' },
  },
  {
    id: 'town',
    title: 'The Street',
    intro: 'There is a front door, and past it a street, and past the street the rest. People live out there who have never heard of your box. Some of them have heard of somebody else\'s. Go out and walk.',
    outro: 'You know the street now, and it knows your step. Somebody has been leaving boxes out here. Not for you. Not yet.',
    objectives: [
      ob('town.walk', 'bed', 'Walk out of the front door', 'In the bedroom, press THE STREET. Touch a place and you walk to it.', (w) => w.tSteps >= 12, (w) => [Math.min(w.tSteps, 12), 12]),
      ob('town.districts', 'town', 'Find four parts of the neighbourhood', 'Each has a name. It is said once, when you first cross into it.', (w) => w.tDistricts >= 4, (w) => [w.tDistricts, 4]),
      ob('town.people', 'town', 'Speak to five people', 'Walk up to someone and touch them. They move about with the hour.', (w) => w.tPeople >= 5, (w) => [w.tPeople, 5]),
      ob('town.errand', 'town', 'Finish an errand for somebody', 'Errands are kept in the menu under Street, with where to go next.', (w) => w.tQuests >= 1),
      ob('town.thread', 'town', 'Find out about the box on the wall', 'Ines, two doors along from yours, has seen something. Do what she asks first.', (w) => w.tMain),
      ob('town.rival', 'town', 'Beat a kid where they stand', 'Some of the children from the ladder are out here. Speak to one and open your Box.', (w) => w.tWonOut),
      ob('town.night', 'town', 'Be out after dark', 'The hour moves as you walk. A bench passes it faster. After eight it is night.', (w) => w.tNight),
    ],
    reward: { glow: 2500, pieces: [['moon', 1], ['comet', 2], ['dust', 1]], universe: 0x57ee70, says: 'Two and a half pips of Light, a moon, two comets, a veil of dust, and a universe somebody left on your doorstep.' },
  },
  {
    id: 'strata',
    title: 'Strata',
    intro: 'The fall is not all one dark. It lies in layers, and each layer keeps its own things: wells, wrecks, echoes, and things that would rather you did not pass.',
    outro: 'You know the layers by name now. They do not know yours. Something down there has started to listen for it.',
    objectives: [
      ob('strata.cross', 'dive', 'Fall out of one stratum into the next', 'The name of the stratum is on the fall. Keep holding until it changes.', (w) => w.h.strata.length >= 2, (w) => [w.h.strata.length, 2]),
      ob('strata.find', 'dive', 'Take something out of the fall', 'Steer into a well, a wreck, an echo or a loose piece. It is counted when the dive ends.', (w) => w.h.pickups >= 1),
      ob('strata.streak', 'dive', 'Fall far enough without stopping to double your haul', 'Do not let go of HOLD. The streak beside the depth turns to x2.', (w) => w.h.mult >= 2),
      ob('strata.dodge', 'dive', 'Slip past something that meant to stop you', 'Steer to another ring when a hazard lies ahead. It is counted when the dive ends.', (w) => w.h.dodged >= 1),
      ob('strata.back', 'dive', 'Carry Light back up from a dive', 'What you gather comes home as Light when the dive ends at a star, the surface or the floor.', (w) => w.h.back > 0),
      ob('strata.three', 'dive', 'Know three strata by name', 'Deeper, or in another universe. No two universes are layered alike.', (w) => w.h.strata.length >= 3, (w) => [w.h.strata.length, 3]),
    ],
    reward: { glow: 2000, pieces: [['comet', 2], ['dust', 2]], universe: 0x57a7a5, says: 'Two pips of Light, two comets, two veils of dust, and a universe that is mostly layers.' },
  },
  {
    id: 'deep',
    title: 'Deep',
    intro: 'Every universe has a bottom. Mote does not like to say what is there. Fall until the folds stop.',
    outro: 'There was a room. There was a kid, and a PC, and a box. You know whose box you are in.',
    objectives: [
      ob('deep.ten', 'dive', 'Fall past fold 10', 'Fill your Light before a long fall. It drains by the fold.', (w) => w.maxDepth >= 10, (w) => [w.maxDepth, 10]),
      ob('deep.twenty', 'dive', 'Fall past fold 20', 'A glowing world pays for the fall. Watch one first.', (w) => w.maxDepth >= 20, (w) => [w.maxDepth, 20]),
      ob('deep.flicker', 'dive', 'Catch a flicker as you fall', 'A flicker is a loose universe. Tap it mid-fall to throw a reliquary, as its ring closes.', (w) => w.caughtFalling),
      ob('deep.floor', 'dive', 'Reach the floor of a universe', 'The fall says how many folds are left. Keep holding.', (w) => !!w.dive.bottom || went(w, 'mirror') || w.mirrorGifts > 0),
      ob('deep.room', 'room', 'Stand in the room at the bottom', 'At the floor, wait. The room comes to you.', (w) => went(w, 'mirror') || w.mirrorGifts > 0),
      ob('deep.gift', 'room', 'Take what the other child hands you', 'In the room, stay until the end of what they say.', (w) => w.mirrorGifts > 0),
    ],
    reward: { glow: 3000, pieces: [['sun', 2], ['rings', 1]], universe: 0x0dee9f, says: 'Three pips of Light, two suns, a set of rings, and a universe from very far down.' },
  },
  {
    id: 'street',
    title: 'The Ladder',
    intro: 'The kids outside are not all the same kid. There is an order to them, and at the end of each street somebody who has never lost. Your universes are learning. Let them.',
    outro: 'They nod at you on the street now. Not all of them. Enough.',
    objectives: [
      ob('street.xp', 'fight', 'Let a creature learn from a fight', 'Every finished battle gives XP to the creatures that fought it.', (w) => w.anyXp),
      ob('street.level', 'fight', 'Raise a creature to level 3', 'Fight with the same universe. Rematches pay too.', (w) => w.level >= 3, (w) => [w.level, 3]),
      ob('street.relic', 'fight', 'Win a relic', 'Some wins leave a small thing behind. Bosses always carry one.', (w) => w.relics >= 1),
      ob('street.hold', 'out', 'Give a creature a relic to hold', 'Outside, tap HOLDS NOTHING under one of your three. One relic each.', (w) => w.held >= 1),
      ob('street.again', 'out', 'Beat the same kid twice', 'They come back harder. Outside, choose somebody you have already beaten.', (w) => w.rewins >= 2, (w) => [w.rewins, 2]),
      ob('street.tier', 'out', 'Clear the first street', 'Beat every kid in the first tier of the ladder.', (w) => w.tierOne),
      ob('street.boss', 'fight', 'Beat a boss', 'The last kid of a tier fights by a rule of their own. Read it before you start.', (w) => w.bosses >= 1),
    ],
    reward: { glow: 3000, pieces: [['belt', 2], ['moon', 2]], universe: 0x1add3a, says: 'Three pips of Light, two belts of stones, two moons, and a universe a kid left on a wall for you.' },
  },
  {
    id: 'chronicle',
    title: 'Chronicle',
    intro: 'They do more than live and die down there. They believe things. They follow people. They fall out with the village over the hill. Watch one world long enough to see it happen.',
    outro: 'They have a history now. You are in it, a little, as weather.',
    objectives: [
      ob('chron.creed', 'planet', 'See a creed take hold', 'A village that looks up long enough names what it believes. The People tab shows the creed.', (w) => creeds(w) >= 1),
      ob('chron.ruler', 'planet', 'See somebody rule', 'A grown village crowns a ruler. The People tab names them.', (w) => ruled(w)),
      ob('chron.school', 'planet', 'See a village keep a school', 'Well fed and glad, past iron. Give them calm years.', (w) => !!civ(w)?.villages.some((v) => v.school)),
      ob('chron.war', 'planet', 'Watch a war begin', 'Two villages, a hard season, a rivalry. You will read it in the Chronicle tab.', (w) => atWar(w) || w.h.warWorlds.length > 0),
      ob('chron.peace', 'planet', 'Watch it end', 'Stay on the world where the war is. They tire of it, or one of them is gone.', (w) => w.h.warEnded),
      ob('chron.work', 'planet', 'See a great work finished', 'A rich village builds something that outlasts it. It is named on the People tab.', (w) => works(w) >= 1),
    ],
    reward: { glow: 3000, pieces: [['sun', 1], ['moon', 1], ['rings', 2]], universe: 0xc40a1c, says: 'Three pips of Light, a sun, a moon, two sets of rings, and a universe with a long memory.' },
  },
  {
    id: 'kin',
    title: 'Kin',
    intro: 'No two universes in the box are alike, and they are not all strangers to you any more. Two of them, put together, make a third that is neither. It remembers both.',
    outro: 'There is a family in the box. You did not mean to start one.',
    objectives: [
      ob('kin.known', 'box', 'Become known to a universe', 'Fall in it, tend its worlds, fight beside it. The Box shows its bond.', (w) => w.bond >= 10, (w) => [w.bond, 10]),
      ob('kin.rare', 'box', 'Keep a universe that is not common', 'Uncommon or better. Flickers, rivals and the room all hand them over, now and then.', (w) => w.rarity >= 1),
      ob('kin.merge', 'box', 'Merge two universes into a third', 'In the Box, press MERGE, choose two, read what they would make, then Merge these.', (w) => w.generation >= 1),
      ob('kin.gift', 'box', 'See a child keep something of its parents', 'The merge card lists the odds. Dominant traits pass more readily.', (w) => w.gifts >= 1),
      ob('kin.kept', 'box', 'Be kept by a universe', 'A bond of 30. Time spent in one universe counts for more than time spread thin.', (w) => w.bond >= 30, (w) => [w.bond, 30]),
      ob('kin.strange', 'box', 'Make a child with something neither parent had', 'A mutation, or a named recipe. Unlike parents mutate more.', (w) => w.strange),
    ],
    reward: { glow: 3500, pieces: [['comet', 2], ['sun', 1], ['dust', 2]], says: 'Three and a half pips of Light, two comets, a sun and two veils of dust.' },
  },
  {
    id: 'days',
    title: 'Days',
    intro: 'The room you sleep in has days, too. Each one has an omen, and small things it asks. People come to the window. Somewhere a book is keeping count of everything you have seen.',
    outro: 'The days know you. The book has your name in it, more than once.',
    objectives: [
      ob('days.task', 'hub', 'Be paid for one of the day\'s tasks', 'Open the menu, then the Almanac. Do one of today\'s tasks, then press Claim beside it.', (w) => w.almPaid >= 1),
      ob('days.all', 'hub', 'Finish everything a day asks', 'Every one of today\'s tasks in the Almanac, done and claimed.', (w) => w.almTasks > 0 && w.almPaid >= w.almTasks, (w) => [w.almPaid, Math.max(1, w.almTasks)]),
      ob('days.window', 'bed', 'Answer somebody at the window', 'Stay a while in the bedroom or the Box. When somebody comes, answer them in the Almanac.', (w) => w.almAnswered >= 1),
      ob('days.streak', 'hub', 'Keep two days running', 'Come back tomorrow. The Almanac counts the days you were here; one missed day in a week is forgiven.', (w) => w.almStreak >= 2, (w) => [w.almStreak, 2]),
      ob('days.deed', 'hub', 'Earn a deed', 'Deeds, in the menu, keeps them. Most of what you do is on the way to one.', (w) => w.deeds >= 1),
      ob('days.claim', 'hub', 'Claim what a deed is worth', 'Open Deeds in the menu and press Claim on one you have earned.', (w) => w.deedsClaimed >= 1),
      ob('days.five', 'hub', 'Earn five deeds', 'The Deeds page shows how near each one is.', (w) => w.deeds >= 5, (w) => [w.deeds, 5]),
    ],
    reward: { glow: 3000, pieces: [['moon', 2], ['rings', 1], ['belt', 1]], says: 'Three pips of Light, two moons, a set of rings and a belt of stones.' },
  },
  {
    id: 'align',
    title: 'Alignment',
    intro: 'They have started to look up on purpose. Soon they will send things. Keep them fed, keep them glad, and let every world turn as one.',
    outro: 'Every world in the system turns as one. Above them, something small and bright is pleased.',
    objectives: [
      ob('align.launch', 'planet', 'See a world put something into orbit', 'A star-reaching people build a pad. Keep them prosperous and watch.', (w) => w.orbiters >= 1 || (civ(w)?.launches ?? 0) >= 1),
      ob('align.reach', 'planet', 'Raise a star-reaching people', 'Six eras: huts, fire, iron, lamps, bells, star-reaching.', (w) => era(w) >= 5, (w) => [era(w), 5]),
      ob('align.bright', 'planet', 'Keep a world both prosperous and enlightened', 'Prosperity 60 and a village that fully understands what you are. Preach, bless, feed.', (w) => w.entries.some((e) => (e.stats.prosperity ?? 0) >= 60 && (e.stats.enlightenment ?? 0) >= 100)),
      ob('align.orbit', 'planet', `Have ${ORBIT_GOAL} things in orbit across your skies`, 'Lanterns first, then stations. Every launch stays up.', (w) => w.orbiters >= ORBIT_GOAL, (w) => [w.orbiters, ORBIT_GOAL]),
      ob('align.system', 'star', 'Align a solar system', `${ALIGN_GOAL} things in orbit around one star, then stand at that star.`, (w) => w.systemOrbiters >= ALIGN_GOAL, (w) => [w.systemOrbiters, ALIGN_GOAL]),
      ob('align.tend', 'planet', `Tend worlds in ${TEND_GOAL} universes`, 'Watch a surface in each. The Box remembers which you have tended.', (w) => w.tendedUniverses >= TEND_GOAL, (w) => [w.tendedUniverses, TEND_GOAL]),
      ob('align.keep', 'box', `Keep ${KEEP_GOAL} universes in the Box`, 'Catch flickers, win them outside, or take them from the room at the bottom.', (w) => w.boxCount >= KEEP_GOAL, (w) => [w.boxCount, KEEP_GOAL]),
    ],
    reward: { glow: 8000, pieces: SKY_PIECE_KINDS.map((k) => [k, 2] as const), says: 'All the Light Mote can hold, and two of every piece of sky.' },
  },
  {
    id: 'waking',
    title: 'Waking',
    intro: 'The child at the bottom has been waiting for you to ask. Each floor gives up a piece of the answer. Far above, their people are building engines. Everybody is getting ready to leave.',
    outro: 'You woke. The box was where you left it, lit, under the bed. You went back in.',
    objectives: [
      ob('wake.speak', 'room', 'Speak to the other child', 'In the room at the bottom, press Speak and say something through to the end.', (w) => w.talks >= 1),
      ob('wake.piece', 'room', 'Find a piece of the answer', 'Each universe whose floor you reach for the first time gives one.', (w) => w.fragments >= 1),
      ob('wake.engines', 'planet', 'See a people build engines', 'The era past star-reaching. A prosperous, schooled world gets there.', (w) => age(w) >= 6, (w) => [age(w), 6]),
      ob('wake.champion', 'out', 'Beat the champion', 'The last kid on the ladder. Every tier before them must be cleared.', (w) => w.champion),
      ob('wake.four', 'room', 'Find four pieces of the answer', 'Four floors, four universes. Their box opens to you after that.', (w) => w.fragments >= 4, (w) => [w.fragments, 4]),
      ob('wake.above', 'room', 'Enter a box above your own', 'In the room, press Enter box. A universe from their box comes home with you.', (w) => w.above >= 1),
      ob('wake.wake', 'room', 'Wake up', 'In the room, press Wake up when the floors and the pieces are enough. You keep one thing.', (w) => w.wakings >= 1),
    ],
    reward: { glow: 8000, pieces: SKY_PIECE_KINDS.map((k) => [k, 3] as const), says: 'All the Light Mote can hold, and three of every piece of sky.' },
  },
];
/** Chapter order before the campaign grew: a v1 save's `chapter` counts along this. */
const OLD_ORDER = ['box', 'sky', 'body', 'outside', 'deep', 'align'];
/** Chapter order before the town chapter was set in after Outside: a v2 save's `chapter` counts along this. */
const V2_ORDER = ['box', 'sky', 'body', 'outside', 'strata', 'deep', 'street', 'chronicle', 'kin', 'days', 'align', 'waking'];

/** Side stories: always open, any order, each following one idea across the game. */
const SIDES: readonly Chapter[] = [
  {
    id: 'peace',
    title: 'The Long Peace',
    intro: 'One world. Three ages. Not one war. You may not touch them, so it will have to be the sky that keeps them gentle.',
    outro: 'Three ages and nobody burned a village. They think it was their own good sense.',
    objectives: [
      ob('side.peace.1', 'planet', 'Raise a world one era while it stays at peace', 'It counts from the era you first watched it at, and stops for good if you see it at war.', (w) => peaceRise(w) >= 1, (w) => [peaceRise(w), 1]),
      ob('side.peace.2', 'planet', 'Two eras, still no war', 'Calm skies. A moon steadies a people; a comet does not.', (w) => peaceRise(w) >= 2, (w) => [peaceRise(w), 2]),
      ob('side.peace.3', 'planet', 'Three eras without a war', 'Stay with the same world. A new one starts the count again.', (w) => peaceRise(w) >= 3, (w) => [peaceRise(w), 3]),
    ],
    reward: { glow: 3000, pieces: [['moon', 3]], says: 'Three pips of Light and three moons.' },
  },
  {
    id: 'family',
    title: 'A Family',
    intro: 'A child of two universes can be merged again, and so can what comes of that. See how far down a family goes.',
    outro: 'Great-grandchild of four strangers. It has all their colours and none of their names.',
    objectives: [
      ob('side.family.1', 'box', 'Keep a merged universe', 'In the Box, press MERGE and choose two universes.', (w) => w.generation >= 1),
      ob('side.family.2', 'box', 'Merge a merged universe', 'A second generation: one parent was itself made.', (w) => w.generation >= 2, (w) => [w.generation, 2]),
      ob('side.family.3', 'box', 'Keep a third-generation universe', 'Merge the grandchild with anything. Its lineage is on its card.', (w) => w.generation >= 3, (w) => [w.generation, 3]),
    ],
    reward: { glow: 4000, pieces: [['sun', 2], ['rings', 2]], says: 'Four pips of Light, two suns and two sets of rings.' },
  },
  {
    id: 'child',
    title: 'The Other Child',
    intro: 'They have a shelf, and a lamp, and things to say. You could be a good guest. You could also not be.',
    outro: 'They know what you leave and what you take. They have decided what they think of you.',
    objectives: [
      ob('side.child.leave', 'room', 'Leave something in their room', 'In the room at the bottom, press Leave: a sky piece for their shelf, or Light for their lamp.', (w) => w.left >= 1),
      ob('side.child.take', 'room', 'Take something of theirs', 'In the room, press Take. They will notice.', (w) => w.taken >= 1),
      ob('side.child.speak', 'room', 'Speak with them three times', 'Press Speak and follow it to the end. They say different things on different floors.', (w) => w.talks >= 3, (w) => [w.talks, 3]),
    ],
    reward: { glow: 3000, pieces: [['dust', 3], ['comet', 1]], says: 'Three pips of Light, three veils of dust and a comet.' },
  },
  {
    id: 'rare',
    title: 'One of Each',
    intro: 'Most universes are common. Some are not. A very few should not be in a box at all.',
    outro: 'Three shelves of the box glow differently now.',
    objectives: [
      ob('side.rare.1', 'box', 'Hold an uncommon universe', 'The Box shows rarity on each card.', (w) => (w.rarities & 0b11110) !== 0),
      ob('side.rare.2', 'box', 'Hold a rare one', 'Merging unlike parents can lift a child above both.', (w) => (w.rarities & 0b11100) !== 0),
      ob('side.rare.3', 'box', 'Hold three different rarities at once', 'Common counts.', (w) => bits(w.rarities) >= 3, (w) => [bits(w.rarities), 3]),
    ],
    reward: { glow: 3000, pieces: [['rings', 2], ['belt', 2]], says: 'Three pips of Light, two sets of rings and two belts of stones.' },
  },
  {
    id: 'clean',
    title: 'The Clean Fall',
    intro: 'Ten folds and more, and nothing lays a hand on you. Then further, and faster.',
    outro: 'You fall like something that has always been falling.',
    objectives: [
      ob('side.clean.1', 'dive', 'Fall ten folds in one dive and be hit by nothing', 'Steer round every hazard. It is judged when the dive ends.', (w) => w.h.clean >= 1),
      ob('side.clean.2', 'dive', 'Cross three strata in one dive', 'Fill your Light first. Do not stop at stars.', (w) => w.h.strataDive >= 3, (w) => [w.h.strataDive, 3]),
      ob('side.clean.3', 'dive', 'Hold a streak until it triples your haul', 'x3 beside the depth. Letting go of HOLD ends it.', (w) => w.h.mult >= 3, (w) => [w.h.mult, 3]),
    ],
    reward: { glow: 3000, pieces: [['comet', 3]], says: 'Three pips of Light and three comets.' },
  },
  {
    id: 'grudge',
    title: 'A Grudge',
    intro: 'Somebody out there will beat you. Remember who.',
    outro: 'They do not look at you when you pass. That is how you know it is settled.',
    objectives: [
      ob('side.grudge.1', 'fight', 'Lose a battle', 'It will happen. The Journal writes down who did it.', (w) => Object.keys(w.h.lost).length > 0),
      ob('side.grudge.2', 'fight', 'Beat the kid who has beaten you most', 'Outside, find them again. Grow your creatures first.', (w) => w.revenge >= 1),
      ob('side.grudge.3', 'fight', 'Beat them three times', 'Every rematch is harder.', (w) => w.revenge >= 3, (w) => [w.revenge, 3]),
    ],
    reward: { glow: 3000, pieces: [['belt', 3]], says: 'Three pips of Light and three belts of stones.' },
  },
  {
    id: 'skies',
    title: 'Every Sky',
    intro: 'Six kinds of thing can hang over a world. They have a word for each. Teach them all six.',
    outro: 'Somewhere a child is learning six words for what is overhead. You chose them.',
    objectives: [
      ob('side.skies.1', 'star', 'Hang three kinds of piece', 'Across any of your skies. Sun, moon, comet, rings, belt, dust.', (w) => w.h.kinds.length >= 3, (w) => [w.h.kinds.length, 3]),
      ob('side.skies.2', 'star', 'Hang all six kinds', 'Merging two pieces in the Box makes a third kind.', (w) => w.h.kinds.length >= SKY_PIECE_KINDS.length, (w) => [w.h.kinds.length, SKY_PIECE_KINDS.length]),
      ob('side.skies.3', 'star', 'Fill one sky', 'Eight pieces over one world.', (w) => w.maxPieces >= 8, (w) => [w.maxPieces, 8]),
    ],
    reward: { glow: 3000, pieces: [['sun', 2], ['moon', 2]], says: 'Three pips of Light, two suns and two moons.' },
  },
  {
    id: 'sickness',
    title: 'The Sickness',
    intro: 'It comes to crowded places. You cannot cure it. You can only stay, and see who is left.',
    outro: 'They buried their dead under a sky you hung. They are more than they were.',
    objectives: [
      ob('side.sick.1', 'planet', 'See a plague come to a village', 'Crowded, trading, late in an era. The Chronicle tab will say so.', (w) => plagued(w) || !!w.h.plagueKey),
      ob('side.sick.2', 'planet', 'See them outlast it', 'Stay on that world until no village is sick and somebody is still alive.', (w) => w.h.plagueOver),
      ob('side.sick.3', 'planet', 'See that world hold sixty souls afterwards', 'The same world. Mild seasons help.', (w) => w.h.plagueOver && w.worldKey === w.h.plagueKey && (civ(w)?.souls ?? 0) >= 60, (w) => [w.h.plagueOver && w.worldKey === w.h.plagueKey ? civ(w)?.souls ?? 0 : 0, 60]),
    ],
    reward: { glow: 3000, pieces: [['moon', 2], ['dust', 2]], says: 'Three pips of Light, two moons and two veils of dust.' },
  },
  {
    id: 'leaving',
    title: 'The Leaving',
    intro: 'Past the engines there is speaking across the dark, and past that there is going. A world that reaches the last age builds a ship and does not come back.',
    outro: 'A light left their sky and did not come down. Some of them were on it.',
    objectives: [
      ob('side.leave.1', 'planet', 'See a people speak across the dark', 'The seventh age, far-speaking.', (w) => age(w) >= 7, (w) => [age(w), 7]),
      ob('side.leave.2', 'planet', 'See the last age', 'The eighth: leaving.', (w) => age(w) >= 8, (w) => [age(w), 8]),
      ob('side.leave.3', 'planet', 'See a colony ship go', 'It is counted among their launches, and it does not stay in orbit.', (w) => (civ(w)?.arks ?? 0) >= 1),
    ],
    reward: { glow: 5000, pieces: [['sun', 2], ['comet', 2], ['rings', 1]], says: 'Five pips of Light, two suns, two comets and a set of rings.' },
  },
  {
    id: 'door',
    title: 'Both Sides of the Door',
    intro: 'Inside the box it goes down for ever. Outside the door it goes on as far as the bus does. See how far you can keep both going at once.',
    outro: 'Down and out. You have worn a path in both. Mote says they are the same direction, and will not explain.',
    objectives: [
      ob('side.door.1', 'town', 'Walk 400 steps outside, and fall 15 folds inside', 'Steps are counted in the street. Folds are counted in the fall.', (w) => w.tSteps >= 400 && w.maxDepth >= 15, (w) => [Math.min(400, w.tSteps) + Math.min(15, w.maxDepth), 415]),
      ob('side.door.2', 'town', 'Finish three errands, and tend three worlds', 'Errands are out in the street. A world is tended once it has a sky of yours.', (w) => w.tQuests >= 3 && w.tended >= 3, (w) => [Math.min(3, w.tQuests) + Math.min(3, w.tended), 6]),
      ob('side.door.3', 'town', 'Know every part of the neighbourhood, and hold ten universes', 'Twelve parts, out to the water. The Box counts the rest.', (w) => w.tDistricts >= 12 && w.boxCount >= 10, (w) => [Math.min(12, w.tDistricts) + Math.min(10, w.boxCount), 22]),
    ],
    reward: { glow: 4000, pieces: [['sun', 1], ['rings', 1], ['moon', 2]], says: 'Four pips of Light, a sun, a set of rings and two moons.' },
  },
  {
    id: 'pockets',
    title: 'Full Pockets',
    intro: 'People drop things and stop looking. Caps, feathers, glass, old pennies. What you carry home in your pockets can end up in a sky.',
    outro: 'A whole set, laid out on the desk beside the box. The people under your sky have started finding small bright things too.',
    objectives: [
      ob('side.pockets.1', 'town', 'Pick up ten things people dropped', 'They lie about the neighbourhood, a little bright. Walk over one.', (w) => w.tFound >= 10, (w) => [w.tFound, 10]),
      ob('side.pockets.2', 'town', 'Skim a stone five times', 'At the water there are places to throw from. Let go when the mark is in the bright part.', (w) => w.tSkim >= 5, (w) => [w.tSkim, 5]),
      ob('side.pockets.3', 'town', 'Complete a set, and hang a sky of four pieces', 'A set is every one of a kind. The sky is hung at a star, over one world.', (w) => w.tSets >= 1 && w.maxPieces >= 4, (w) => [Math.min(1, w.tSets) + Math.min(4, w.maxPieces), 5]),
    ],
    reward: { glow: 3000, pieces: [['comet', 2], ['dust', 2]], says: 'Three pips of Light, two comets and two veils of dust.' },
  },
  {
    id: 'keeper',
    title: 'Keeper of Days',
    intro: 'A day kept is a small thing. Seven of them is a habit. The Almanac counts.',
    outro: 'A week of days, all kept. The omens have started to look like yours.',
    objectives: [
      ob('side.keeper.1', 'hub', 'Keep three days running', 'Come back each day. The Almanac counts them.', (w) => w.almStreak >= 3, (w) => [w.almStreak, 3]),
      ob('side.keeper.2', 'bed', 'Answer three people at the window', 'Traders, rivals, lenders, letters. Answer them in the Almanac.', (w) => w.almAnswered >= 3, (w) => [w.almAnswered, 3]),
      ob('side.keeper.3', 'hub', 'Keep seven days running', 'A missed day is forgiven once.', (w) => w.almStreak >= 7, (w) => [w.almStreak, 7]),
    ],
    reward: { glow: 4000, pieces: SKY_PIECE_KINDS.map((k) => [k, 1] as const), says: 'Four pips of Light and one of every piece of sky.' },
  },
];

const ALL = CHAPTERS.flatMap((c) => c.objectives);
const SIDE_ALL = SIDES.flatMap((c) => c.objectives);
const EVERY = [...ALL, ...SIDE_ALL];
const ENDING = {
  title: 'The Box is open',
  text: 'Somewhere above your ceiling a kid looks at a small glow on a screen and is pleased with you. You look at yours. It goes all the way down, and it goes all the way up, and you are in the middle, tending.',
  after: 'There is no more story to be told to you. What is left is yours to find.',
};

interface Saved {
  /** 1 before the campaign grew to twelve chapters; 2 with twelve; 3 since the town chapter was set in after Outside. */
  v: 1 | 2 | 3;
  /** Index of the open chapter; CHAPTERS.length once the last one is closed. */
  chapter: number;
  /** Objectives completed and rewarded. */
  done: string[];
  /** Objectives seen to be true, in any chapter. */
  met: string[];
  been: string[];
  /** Chapters whose intro card has been shown, by index (CHAPTERS.length is the ending). */
  intro: number[];
  /** Marks made since the Journal was last read. */
  fresh: number;
  /** Objective, chapter and side story ids already paid for. Kept through "Start over", so nothing pays twice. */
  paid: string[];
  hist?: Hist;
}
const blank = (): Saved => ({ v: 3, chapter: 0, done: [], met: [], been: [], intro: [], fresh: 0, paid: [], hist: blankHist() });
const strs = (v: unknown, cap = 400) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-cap) : []);
const cleanHist = (raw: unknown): Hist => {
  const h = blankHist();
  const r = rec(raw);
  h.first = typeof r.first === 'number' ? r.first : -1;
  h.strata = strs(r.strata, 60);
  h.kinds = strs(r.kinds, 12);
  h.warWorlds = strs(r.warWorlds, 40);
  for (const k of ['strataDive', 'pickups', 'dodged', 'clean', 'streak', 'back', 'age'] as const) h[k] = Math.max(0, Math.floor(num(r[k])));
  h.mult = Math.max(1, Math.floor(num(r.mult)));
  for (const [k, v] of Object.entries(rec(r.lost))) if (num(v) > 0) h.lost[k] = Math.floor(num(v));
  for (const [k, v] of Object.entries(rec(r.seen)).slice(-40)) h.seen[k] = Math.floor(num(v));
  if (typeof r.person === 'string') h.person = r.person.slice(0, 120);
  if (typeof r.plagueKey === 'string') h.plagueKey = r.plagueKey;
  h.warEnded = r.warEnded === true;
  h.plagueOver = r.plagueOver === true;
  return h;
};
const clean = (raw: unknown): Saved => {
  const s = blank();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Partial<Record<keyof Saved, unknown>>;
  s.done = strs(r.done);
  s.met = strs(r.met);
  s.been = strs(r.been, 20);
  s.paid = strs(r.paid);
  s.intro = Array.isArray(r.intro) ? r.intro.filter((x): x is number => typeof x === 'number') : [];
  s.hist = cleanHist(r.hist);
  const at = typeof r.chapter === 'number' && Number.isInteger(r.chapter) ? Math.max(0, r.chapter) : 0;
  if (r.v === 3) s.chapter = Math.min(CHAPTERS.length, at);
  else if (r.v === 2) {
    // A save from before the town chapter. Closed chapters stay closed (their marks are in `done`, and
    // `paid` keeps them from paying again). The open one becomes the first that is not closed: the town
    // chapter for anyone already past Outside. Once it closes, chapters closed before are stepped over.
    const closed = new Set(V2_ORDER.slice(0, at));
    const next = CHAPTERS.findIndex((c) => !closed.has(c.id));
    s.chapter = next < 0 ? CHAPTERS.length : next;
    s.intro = s.intro.map((i) => (i >= V2_ORDER.length ? CHAPTERS.length : CHAPTERS.findIndex((c) => c.id === V2_ORDER[i]))).filter((i) => i >= 0);
  } else {
    // A save from the six-chapter journal. Its closed chapters stay closed (their marks are all in
    // `done`, and `paid` keeps them from paying again); the open one is the first that is not.
    const closed = new Set(OLD_ORDER.slice(0, at));
    const next = CHAPTERS.findIndex((c) => !closed.has(c.id));
    s.chapter = next < 0 ? CHAPTERS.length : next;
    // Cards already read keep to their chapters; the old ending card is the new ending's.
    s.intro = s.intro.map((i) => (i >= OLD_ORDER.length ? -1 : CHAPTERS.findIndex((c) => c.id === OLD_ORDER[i]))).filter((i) => i >= 0);
  }
  if (typeof r.fresh === 'number' && r.fresh > 0) s.fresh = Math.floor(r.fresh);
  return s;
};

type Tab = 'story' | 'side' | 'done';

export const plugin: Plugin = (shell) => {
  const { ctx } = shell;
  const store = shell.store<Saved>('campaign', blank());
  let st = clean(store.get());
  const h = st.hist ?? blankHist();
  const done = new Set(st.done);
  const met = new Set(st.met);
  const been = new Set(st.been);
  const save = () => {
    st.done = [...done];
    st.met = [...met];
    st.been = [...been];
    st.hist = h;
    store.set(st);
  };
  const sideDone = (s: Chapter) => s.objectives.every((o) => done.has(o.id));
  const publish = () => {
    const snap = Object.freeze({
      chapter: st.chapter,
      chapters: CHAPTERS.length,
      done: Object.freeze([...done]) as readonly string[],
      side: Object.freeze(SIDES.filter(sideDone).map((s) => s.id)) as readonly string[],
    });
    (window as unknown as { __sallowCampaign: unknown }).__sallowCampaign = snap;
  };
  publish();

  // ---- what can only be seen while it happens ----
  let bodyTicks = 0;
  let bodyFrom = -1;
  let walked = 0;
  let lastTick = -1;
  let lastBoxCount = -1;
  let caughtFalling = false;
  let lastWorld: World | null = null;
  let journal: (() => void) | null = null;
  let lastSummary = '';
  let lossCounted = false;
  let warHere = '';
  let histDirty = false;

  const specs = new Map<number, UniverseSpec>();
  const specOf = (serial: number): UniverseSpec | null => {
    let s = specs.get(serial) ?? null;
    if (!s) {
      try { s = ctx.universes.fromSerial(serial); specs.set(serial, s); } catch { s = null; }
      if (specs.size > 200) specs.clear();
    }
    return s;
  };
  let rivalList: readonly Rival[] | null = null;
  const rivals = (): readonly Rival[] => {
    if (!rivalList) { try { rivalList = ctx.battles.rivals(); } catch { rivalList = []; } }
    return rivalList;
  };
  const ladder = () => {
    const L = rec(readJson(LADDER_KEY));
    return { wins: rec(L.wins), xp: rec(L.xp), relics: arr(L.relics), held: rec(L.held) };
  };
  const winsOver = (id: number | string): number => {
    const n = num(ladder().wins[String(id)]);
    return n > 0 ? n : ctx.rivalsBeaten.has(Number(id)) ? 1 : 0;
  };
  /** The rival who has beaten the player most: [id, losses], or null. */
  const nemesis = (): readonly [string, number] | null => {
    let best: readonly [string, number] | null = null;
    for (const [id, n] of Object.entries(h.lost)) if (!best || n > best[1]) best = [id, n];
    return best;
  };

  const look = (): World => {
    const screen = shell.current();
    const entries = ctx.box.slots().filter((e): e is BoxEntry => !!e);
    let maxDepth = 0, tended = 0, tendedUniverses = 0, glow = 0, bestSouls = 0, bestEra = 0;
    let rarity = 0, rarities = 0, generation = 0, gifts = 0, strange = false;
    for (const e of entries) {
      const s = e.stats;
      if (s.deepestFold > maxDepth) maxDepth = s.deepestFold;
      tended += s.worldsTended;
      if (s.worldsTended > 0) tendedUniverses++;
      glow += s.lightFromGlow;
      if ((s.souls ?? 0) > bestSouls) bestSouls = s.souls ?? 0;
      if ((s.era ?? 0) > bestEra) bestEra = s.era ?? 0;
      const lin = s.lineage;
      const r = Math.max(0, RARITIES.indexOf(lin?.rarity ?? specOf(e.serialNumber)?.rarity ?? 'common'));
      if (r > rarity) rarity = r;
      rarities |= 1 << r;
      if (lin) {
        if (lin.generation > generation) generation = lin.generation;
        gifts += lin.gifts?.length ?? 0;
        if (lin.mutation || lin.recipe) strange = true;
      }
    }
    if (h.first < 0 && entries[0]) { h.first = entries[0].serialNumber; histDirty = true; }
    let bond = 0;
    if (ctx.box.bond) ctx.box.slots().forEach((e, i) => { if (e) bond = Math.max(bond, ctx.box.bond!(i)); });

    const dive = ctx.dive.view();
    if (screen === 'dive' && dive.depth > maxDepth) maxDepth = dive.depth;
    // The fall, read from its view and its summary only.
    if (screen === 'dive') {
      const name = dive.stratum?.name;
      if (name && !h.strata.includes(name)) { h.strata.push(name); histDirty = true; }
      if ((dive.streak ?? 0) > h.streak) { h.streak = dive.streak ?? 0; histDirty = true; }
      if ((dive.multiplier ?? 1) > h.mult) { h.mult = dive.multiplier ?? 1; histDirty = true; }
    }
    const sum = dive.summary ?? null;
    const sig = sum ? `${sum.reason}|${sum.depth}|${sum.folds}|${sum.haul}|${sum.pieces}|${sum.wells}|${sum.echoes}|${sum.wrecks}|${sum.hazardsHit}|${sum.hazardsDodged}` : '';
    if (sum && sig !== lastSummary) {
      for (const n of sum.strata) if (!h.strata.includes(n)) h.strata.push(n);
      h.strataDive = Math.max(h.strataDive, sum.strata.length);
      h.pickups += sum.pieces + sum.wells + sum.echoes + sum.wrecks;
      h.dodged += sum.hazardsDodged;
      if (sum.folds >= 10 && sum.hazardsHit === 0) h.clean++;
      h.streak = Math.max(h.streak, sum.bestStreak);
      h.back += sum.lightBack;
      if (sum.flickers > 0) caughtFalling = true;
      histDirty = true;
    }
    lastSummary = sig;

    const skies = ctx.sky.snapshot().skies;
    let maxPieces = 0, orbiters = 0;
    for (const s of skies) {
      if (s.pieces.length > maxPieces) maxPieces = s.pieces.length;
      orbiters += s.built ?? 0;
      for (const k of s.pieces) if (!h.kinds.includes(k)) { h.kinds.push(k); histDirty = true; }
    }
    const sys = ctx.selection.system;
    let systemOrbiters = 0;
    if (sys) for (const p of sys.planets) systemOrbiters += ctx.sky.skyOf(p).built ?? 0;

    // The surface only counts while it is the one on screen.
    const frame = screen === 'planet' ? ctx.sim.latest() : null;
    const av = frame?.civ.avatar ?? null;
    if (frame && av && av.hp > 0) {
      if (bodyFrom < 0 || lastTick < 0 || frame.tick < lastTick) { bodyFrom = av.x; bodyTicks = 0; walked = 0; }
      else bodyTicks += frame.tick - lastTick;
      walked = Math.max(walked, Math.abs(av.x - bodyFrom));
      lastTick = frame.tick;
    } else { bodyFrom = -1; bodyTicks = 0; walked = 0; lastTick = -1; }
    // The WALK button is only shown while the view is first person, whichever tab is open.
    const walkBtn = screen === 'planet' && av ? shell.layer.querySelector<HTMLElement>('[data-id=walk]') : null;
    const eyes = !!walkBtn && !walkBtn.hidden;

    // The history of the world on screen.
    let worldKey = '';
    const planet = frame && sys ? sys.planets[ctx.selection.planetIndex] : undefined;
    if (frame && planet && ctx.selection.universe) {
      worldKey = `${ctx.selection.universe.serialNumber}:${seedToU32(planet.seed)}`;
      const c = frame.civ;
      const a = c.age ?? c.era;
      if (a > h.age) { h.age = a; histDirty = true; }
      if (h.seen[worldKey] === undefined) {
        const keys = Object.keys(h.seen);
        if (keys.length >= 40) delete h.seen[keys[0]!];
        h.seen[worldKey] = a;
        histDirty = true;
      }
      const war = (c.relations ?? []).some((r) => r.kind === 'war') || c.villages.some((v) => v.state === 'war');
      if (war) {
        warHere = worldKey;
        if (!h.warWorlds.includes(worldKey)) { h.warWorlds.push(worldKey); if (h.warWorlds.length > 40) h.warWorlds.shift(); histDirty = true; }
      } else if (warHere === worldKey && c.villages.length > 0 && !h.warEnded) { h.warEnded = true; histDirty = true; }
      const sick = c.villages.some((v) => v.state === 'plague');
      if (sick && !h.plagueOver && h.plagueKey !== worldKey) { h.plagueKey = worldKey; histDirty = true; }
      else if (!sick && h.plagueKey === worldKey && !h.plagueOver && c.souls > 0) { h.plagueOver = true; histDirty = true; }
      const nb = c.notable;
      if (nb && (!h.person || nb.metYou)) {
        const home = c.villages.find((v) => v.id === nb.villageId)?.name;
        const who = `${nb.name}, ${nb.calling}${home && /^[A-Za-z]/.test(home) ? ` of ${home}` : ''}`;
        if (who !== h.person && (nb.metYou || !h.person)) { h.person = who; histDirty = true; }
      }
    }

    const boxCount = ctx.box.count();
    if (lastBoxCount >= 0 && boxCount > lastBoxCount && screen === 'dive') caughtFalling = true;
    lastBoxCount = boxCount;

    // The ladder: wins, growth and relics as the battle screen keeps them.
    const battle = ctx.battle;
    if (battle?.outcome === 'lost') {
      if (!lossCounted) { lossCounted = true; const id = String(battle.rival.id); h.lost[id] = (h.lost[id] ?? 0) + 1; histDirty = true; }
    } else lossCounted = false;
    const L = ladder();
    let bestXp = 0;
    for (const v of Object.values(L.xp)) bestXp = Math.max(bestXp, num(v));
    let level = 1;
    try { level = ctx.battles.levelOf?.(bestXp).level ?? 1; } catch { level = 1; }
    let bosses = 0, champion = false, rewins = 0, tierCount = 0, tierBeaten = 0;
    for (const r of rivals()) {
      const n = winsOver(r.id);
      if (n > rewins) rewins = n;
      if (r.boss && n > 0) { bosses++; if (r.boss === 'champion') champion = true; }
      if ((r.tier ?? 1) === 1) { tierCount++; if (n > 0) tierBeaten++; }
    }
    const worst = nemesis();

    const end = loadEnd();
    const alm = rec(readJson(ALMANAC_KEY));
    const day = rec(alm.day);
    const deedMap = rec(rec(readJson(CODEX_KEY)).a);
    let deeds = 0, deedsClaimed = 0;
    for (const v of Object.values(deedMap)) { if (num(v) >= 1) deeds++; if (num(v) >= 2) deedsClaimed++; }

    // The street: the live state while the town has been up this session, else what it last saved.
    let tSteps = 0, tDistricts = 0, tPeople = 0, tQuests = 0, tMain = false, tFound = 0, tSets = 0, tSkim = 0, tNight = false, tWonOut = false;
    try {
      const live = (window as unknown as { __sallowTown?: { town?: { state?: unknown } } }).__sallowTown?.town?.state;
      const t = rec(live ?? readJson(TOWN_KEY));
      tSteps = num(rec(t.stats).steps);
      tDistricts = arr(t.districts).length;
      for (const v of Object.values(rec(t.talks))) if (num(v) > 0) tPeople++;
      const qs = rec(t.quests);
      for (const v of Object.values(qs)) if (rec(v).done === true) tQuests++;
      const m1 = rec(qs.m1);
      tMain = m1.done === true || num(m1.stage) >= 1;
      const found = arr(t.found).filter((x): x is string => typeof x === 'string');
      tFound = found.length;
      for (const k of COLLECT) if (found.filter((x) => x.startsWith(`${k.id}-`)).length >= k.count) tSets++;
      tSkim = num(rec(t.skim).best);
      const hr = (num(t.minutes) % 1440) / 60;
      tNight = screen === 'town' && typeof t.minutes === 'number' && (hr < 5 || hr >= 20);
      tWonOut = t.fromTown === true && battle?.outcome === 'won';
    } catch { /* the street is not there to be read: nothing out there counts yet */ }

    if (histDirty) { histDirty = false; st.hist = h; store.set({ ...st, done: [...done], met: [...met], been: [...been] }); }

    return {
      screen, been, entries, boxCount, maxDepth, tended, tendedUniverses, glow, bestSouls, bestEra,
      skies, maxPieces, orbiters, systemOrbiters, frame, worldKey, dive, battle, beaten: ctx.rivalsBeaten.size,
      eyes, walked, bodyTicks, mirrorGifts: readSeen().length, caughtFalling, h,
      anyXp: bestXp > 0, level, relics: L.relics.length, held: Object.keys(L.held).length, bosses,
      tierOne: tierCount > 0 && tierBeaten >= tierCount, champion, rewins, revenge: worst ? winsOver(worst[0]) : 0,
      rarity, rarities, bond, generation, gifts, strange,
      fragments: end.fragments, talks: end.talks, left: end.left.length + end.lamps, taken: end.taken.length,
      above: Object.keys(end.above).length, wakings: end.level,
      almStreak: Math.max(num(alm.streak), num(alm.best)), almPaid: arr(day.claimed).length, almTasks: arr(day.tasks).length,
      almAnswered: arr(alm.haps).filter((x) => typeof rec(x).done === 'string').length,
      deeds, deedsClaimed,
      tSteps, tDistricts, tPeople, tQuests, tMain, tFound, tSets, tSkim, tNight, tWonOut,
    };
  };

  // ---- rewards ----
  const give = (id: string, r: Reward): string => {
    if (st.paid.includes(id)) return 'Mote has already paid you for this.';
    st.paid.push(id);
    ctx.light.addGlow(r.glow);
    for (const [k, n] of r.pieces) ctx.sky.grant(k, n);
    let says = r.says;
    if (r.universe !== undefined && ctx.box.add(r.universe) < 0) {
      // No room, or it is already here: a sun instead.
      ctx.sky.grant('sun', 1);
      says = `${says} The box had no room for it, so Mote kept a sun instead.`;
    }
    ctx.bus.emit('light:changed', { pips: ctx.light.view().pips });
    ctx.bus.emit('box:changed', { count: ctx.box.count() });
    ctx.persist();
    return says;
  };
  /** A small thank-you for one mark: a little glow, and now and then a piece. */
  const tip = (o: Objective) => {
    if (st.paid.includes(o.id)) return;
    st.paid.push(o.id);
    const i = EVERY.indexOf(o);
    ctx.light.addGlow(120);
    if (i % 3 === 2) ctx.sky.grant(SKY_PIECE_KINDS[i % SKY_PIECE_KINDS.length]!, 1);
    ctx.bus.emit('light:changed', { pips: ctx.light.view().pips });
  };

  const check = () => {
    const w = look();
    lastWorld = w;
    let changed = false;
    for (const o of EVERY) {
      if (met.has(o.id)) continue;
      let ok = false;
      try { ok = o.test(w); } catch { ok = false; }
      if (ok) { met.add(o.id); changed = true; }
    }
    // Side stories are always open.
    for (const s of SIDES) {
      const now = s.objectives.filter((o) => met.has(o.id) && !done.has(o.id));
      if (!now.length) continue;
      for (const o of now) { done.add(o.id); tip(o); }
      st.fresh += now.length;
      changed = true;
      if (sideDone(s)) shell.toast(`${s.outro} ${give(`side:${s.id}`, s.reward)}`, { title: `Side story told · ${s.title}`, sfx: 'win' });
      else shell.toast(now.map((o) => o.text).join('. '), { title: `Side story · ${s.title}`, sfx: 'gain' });
      ctx.persist();
    }
    const ch = CHAPTERS[st.chapter];
    if (ch) {
      const now = ch.objectives.filter((o) => met.has(o.id) && !done.has(o.id));
      for (const o of now) { done.add(o.id); tip(o); }
      if (now.length) { st.fresh += now.length; changed = true; }
      const left = ch.objectives.filter((o) => !done.has(o.id)).length;
      if (left === 0) {
        const says = give(`chapter:${ch.id}`, ch.reward);
        st.chapter++;
        changed = true;
        shell.toast(`${ch.outro} ${says}`, { title: `Chapter ${st.chapter} closed · ${ch.title}`, sfx: 'win' });
        // Chapters closed and paid before a new one was set in ahead of them are stepped over without a word.
        for (let nx = CHAPTERS[st.chapter]; nx && st.paid.includes(`chapter:${nx.id}`) && nx.objectives.every((o) => done.has(o.id)); nx = CHAPTERS[st.chapter]) st.chapter++;
      } else if (now.length) {
        if (now.length === 1) shell.toast(now[0]!.text, { title: `Journal · ${ch.title}`, sfx: 'gain' });
        else shell.toast(now.length === 2 ? `${now[0]!.text}. ${now[1]!.text}.` : `${now.length} marks at once. The Journal has them.`, { title: `Journal · ${ch.title}`, sfx: 'gain' });
        ctx.persist();
      }
    }
    if (changed) {
      if (journal) st.fresh = 0;
      save(); publish(); journal?.();
    }
  };

  // ---- the card that opens a chapter (and the one that ends the book) ----
  const frameEl = el('div', { class: 'camp-frame' });
  const cardKicker = el('span', { class: 'k-label camp-kicker' });
  const cardTitle = el('h2', { class: 'camp-title' });
  const cardText = el('p', { class: 'camp-text' });
  const cardFoot = el('span', { class: 'camp-foot' }, 'Tap to go on. It is all in the Journal.');
  const card = el('button', { class: 'camp-card', type: 'button', 'data-id': 'campaign-card' }, cardKicker, cardTitle, cardText, cardFoot);
  card.hidden = true;
  frameEl.append(card);
  shell.host.append(frameEl);
  card.addEventListener('pointerdown', (e) => e.stopPropagation());
  let cardFor = -1;
  let tab: Tab = 'story';
  const hideCard = () => { card.hidden = true; cardFor = -1; };
  card.addEventListener('click', () => {
    const was = cardFor;
    if (was >= 0 && !st.intro.includes(was)) { st.intro.push(was); save(); }
    hideCard();
    // The last card opens the last page.
    if (was >= CHAPTERS.length) { tab = 'story'; try { shell.menu.open('journal'); } catch { /* the page is in the menu either way */ } }
  });
  /** Anything else that is talking: the hub, Mote's guide, the away report, any toast (the Almanac's happenings come as toasts). */
  const busy = () => shell.menu.isOpen() || !!document.querySelector('.guide .guide-card.on, .away, .away-note, .hub-toast, [data-id=merge-reveal], [data-id=goals-page], [data-id=recipe-book], [data-id=merge-confirm]');
  const cards = () => {
    const screen = shell.current();
    const quiet = (screen === 'bedroom' || screen === 'box') && !busy();
    if (!card.hidden) {
      // Never talk over anything else, and never follow the player off these two screens.
      if (!quiet || cardFor !== st.chapter) hideCard();
      return;
    }
    if (!quiet || st.intro.includes(st.chapter)) return;
    const ch = CHAPTERS[st.chapter];
    cardFor = st.chapter;
    cardKicker.textContent = ch ? `Chapter ${st.chapter + 1} of ${CHAPTERS.length}` : 'The last page';
    cardTitle.textContent = ch ? ch.title : ENDING.title;
    cardText.textContent = ch ? ch.intro : ENDING.text;
    cardFoot.textContent = ch ? 'Tap to go on. It is all in the Journal.' : 'Tap to read the last page.';
    card.classList.toggle('end', !ch);
    card.hidden = false;
  };

  // ---- the epilogue: what the player really did ----
  const nameOf = (serial: number) => displayName(serial, specOf(serial)?.name ?? 'a universe with no name');
  const rivalName = (id: string) => rivals().find((r) => String(r.id) === id)?.name ?? 'a kid whose name you never learned';
  const codexPerson = (): string => {
    for (const wr of Object.values(rec(rec(readJson(CODEX_KEY)).w))) {
      const p = arr(arr(rec(wr).p)[0]);
      if (typeof p[0] === 'string' && p[0]) return `${p[0]}${typeof p[1] === 'string' && p[1] ? `, ${p[1]}` : ''}${typeof rec(wr).n === 'string' ? ` of ${String(rec(wr).n)}` : ''}`;
    }
    return '';
  };
  const epilogue = (w: World): string[] => {
    const out: string[] = [];
    const deepest = w.entries.reduce<BoxEntry | null>((b, e) => (!b || e.stats.deepestFold > b.stats.deepestFold ? e : b), null);
    if (deepest && deepest.stats.deepestFold > 0) out.push(`The furthest you ever fell was fold ${deepest.stats.deepestFold}, inside ${nameOf(deepest.serialNumber)}. You have known ${w.h.strata.length === 1 ? 'one stratum' : `${w.h.strata.length} strata`} by name.`);
    if (w.h.first >= 0) {
      const still = w.entries.some((e) => e.serialNumber === w.h.first);
      out.push(`The first universe you kept was ${nameOf(w.h.first)}. ${still ? 'It is still in the box. It was there before you knew what the box was.' : 'It is not in the box any more. Part of it is in something else now.'}`);
    }
    let dearSerial = -1, dearBond = 0;
    const slots = ctx.box.slots();
    for (let i = 0; i < slots.length; i++) {
      const e = slots[i];
      if (!e) continue;
      const b = ctx.box.bond?.(i) ?? ctx.box.bondOf?.(e.stats) ?? 0;
      if (b > dearBond) { dearSerial = e.serialNumber; dearBond = b; }
    }
    if (dearSerial >= 0) out.push(`Of all of them, ${nameOf(dearSerial)} knows you best. The box calls it ${ctx.box.bondName?.(dearBond) ?? 'known'}.`);
    const who = (w.h.person || codexPerson()).replace(/ of #\d+$/, '');
    if (who) out.push(`On a world you watched there was ${who}. They never knew what the light over them was. They looked up anyway.`);
    else if (w.tended > 0) out.push(`You have tended ${w.tended === 1 ? 'one world' : `${w.tended} worlds`}. Nobody on them has a name you would know.`);
    const worst = nemesis();
    if (worst) {
      const back = winsOver(worst[0]);
      out.push(`${rivalName(worst[0])} beat you ${worst[1] === 1 ? 'once' : `${worst[1]} times`}, more than anybody. ${back > 0 ? `You have beaten them ${back === 1 ? 'once' : `${back} times`} since.` : 'You have not beaten them yet.'}`);
    } else if (w.beaten > 0) out.push(`Nobody on the street has beaten you. ${w.beaten === 1 ? 'One kid has' : `${w.beaten} kids have`} lost to you. They remember.`);
    if (w.fragments > 0) {
      out.push(`You carry ${w.fragments} of the ${FRAGMENTS.length} pieces of the answer${w.wakings > 0 ? `, and you have woken ${w.wakings === 1 ? 'once' : `${w.wakings} times`}` : ''}. The last one you found says:`);
      out.push(`“${FRAGMENTS[Math.min(w.fragments, FRAGMENTS.length) - 1] ?? ''}”`);
    }
    return out;
  };
  /** What is still out there, so the last page is not the last thing. */
  const remains = (w: World): string[] => {
    const out: string[] = [];
    for (const s of SIDES) {
      if (sideDone(s)) continue;
      const n = s.objectives.filter((o) => done.has(o.id)).length;
      out.push(`${s.title}: ${n ? `${n} of ${s.objectives.length} told` : 'not begun'}.`);
    }
    const unbeaten = rivals().filter((r) => winsOver(r.id) === 0).length;
    if (unbeaten > 0) out.push(`${unbeaten === 1 ? 'One kid' : `${unbeaten} kids`} on the ladder you have not beaten.`);
    if (w.fragments < FRAGMENTS.length) out.push(`${FRAGMENTS.length - w.fragments} pieces of the answer still under floors you have not reached.`);
    const cdx = rec(readJson(CODEX_KEY));
    const unclaimed = w.deeds - w.deedsClaimed;
    out.push(`The Codex holds ${Object.keys(rec(cdx.u)).length} universes, ${Object.keys(rec(cdx.w)).length} worlds and ${w.deeds} deeds${unclaimed > 0 ? `, ${unclaimed} of them unclaimed` : ''}. Its empty lines are what you have not seen.`);
    if (w.boxCount < 25) out.push(`${25 - w.boxCount} slots of the box are empty.`);
    const lost = COLLECT.reduce((n, k) => n + k.count, 0) - w.tFound;
    if (w.tSteps === 0) out.push('The street past your front door, where you have not set foot.');
    else {
      const parts: string[] = [];
      if (w.tDistricts < DISTRICTS.length) parts.push(`${DISTRICTS.length - w.tDistricts} of its ${DISTRICTS.length} parts unwalked`);
      if (w.tQuests < QUESTS.length) parts.push(`${QUESTS.length - w.tQuests} errands nobody has done`);
      if (w.tPeople < NPCS.length) parts.push(`${NPCS.length - w.tPeople} people you have not spoken to`);
      if (lost > 0) parts.push(`${lost} small things still lying where they were dropped`);
      if (parts.length) out.push(`The street: ${parts.join(', ')}.`);
    }
    return out;
  };

  // ---- the Journal ----
  const fraction = (ch: Chapter) => ch.objectives.filter((o) => done.has(o.id)).length;
  const objective = (o: Objective, w: World | null, open: boolean) => {
    const isDone = done.has(o.id);
    let count = '';
    if (!isDone && open && o.count && w) {
      try { const [have, want] = o.count(w); count = `${Math.max(0, Math.min(have, want))} / ${want}`; } catch { count = ''; }
    }
    return el('li', { class: isDone ? 'camp-obj done' : 'camp-obj', 'data-id': `obj-${o.id}` },
      el('i', { class: 'camp-mark', 'aria-hidden': 'true' }, isDone ? '✓' : ''),
      el('div', { class: 'camp-what' },
        el('span', { class: 'camp-line' }, o.text, count ? el('b', {}, count) : null),
        !isDone && open ? el('small', {}, o.hint) : null,
      ),
    );
  };
  const progress = (n: number, of: number) => {
    const bar = el('div', { class: 'camp-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': of, 'aria-valuenow': n }, el('i', {}));
    (bar.firstElementChild as HTMLElement).style.width = `${Math.round((n * 100) / Math.max(1, of))}%`;
    return el('div', { class: 'camp-prog' }, bar, el('span', { class: 'k-label' }, `${n} of ${of}`));
  };
  /** The one thing to do next: an open mark that can be made where the player stands, else the first open one. */
  const nextStep = (w: World | null): { what: string; where: string; how: string } => {
    const ch = CHAPTERS[st.chapter];
    const open = (ch ? ch.objectives : SIDE_ALL).filter((o) => !done.has(o.id));
    if (!open.length) return { what: 'Nothing is asked of you', where: 'Anywhere', how: 'The box is yours. Fall where you like.' };
    const o = open.find((x) => PLACE[x.at].screen !== null && PLACE[x.at].screen === w?.screen) ?? open[0]!;
    const p = PLACE[o.at];
    return { what: o.text, where: p.screen !== null && p.screen === w?.screen ? 'Here' : p.way, how: o.hint };
  };

  const openPast = new Set<number>();
  let confirming = false;
  const startOver = () => {
    const paid = st.paid;
    st = blank();
    st.paid = paid;
    st.hist = h;
    done.clear(); met.clear(); been.clear(); openPast.clear();
    caughtFalling = false;
    tab = 'story';
    const now = shell.current();
    if (now) been.add(now);
    hideCard();
    save(); publish();
  };

  const storyTab = (w: World | null): (Node | null)[] => {
    const kids: (Node | null)[] = [];
    const cur = CHAPTERS[st.chapter];
    if (cur) {
      const n = fraction(cur);
      kids.push(el('section', { class: 'camp-chapter now', 'data-id': 'journal-now' },
        el('span', { class: 'k-label' }, `Chapter ${st.chapter + 1} of ${CHAPTERS.length}`),
        el('h3', { class: 'camp-title' }, cur.title),
        el('p', { class: 'camp-text' }, cur.intro),
        progress(n, cur.objectives.length),
        el('ul', { class: 'camp-list' }, ...cur.objectives.map((o) => objective(o, w, true))),
        el('p', { class: 'camp-reward' }, el('span', { class: 'k-label' }, 'When it closes'), cur.reward.says),
      ));
      CHAPTERS.forEach((ch, i) => {
        if (i <= st.chapter) return;
        kids.push(el('div', { class: 'camp-row locked', 'data-id': `journal-locked-${i}` }, el('span', { class: 'k-label' }, `Chapter ${i + 1}`), el('span', { class: 'camp-name' }, ch.title), el('span', { class: 'k-label' }, 'Not yet')));
      });
    } else {
      let told: string[] = [], left: string[] = [];
      if (w) { try { told = epilogue(w); left = remains(w); } catch { told = []; left = []; } }
      kids.push(el('section', { class: 'camp-chapter now end', 'data-id': 'journal-end' },
        el('span', { class: 'k-label' }, 'The last page'),
        el('h3', { class: 'camp-title' }, ENDING.title),
        ...told.map((t, i) => el('p', { class: t.startsWith('“') ? 'camp-text camp-quote' : 'camp-epi', 'data-id': `journal-epi-${i}` }, t)),
        el('p', { class: 'camp-text' }, ENDING.text),
        el('p', { class: 'camp-reward' }, ENDING.after),
      ));
      kids.push(el('section', { class: 'camp-chapter', 'data-id': 'journal-remains' },
        el('span', { class: 'k-label' }, 'What remains'),
        el('ul', { class: 'camp-remains' }, ...left.map((t) => el('li', {}, t))),
      ));
    }
    return kids;
  };
  const sideTab = (w: World | null): (Node | null)[] => {
    const kids: (Node | null)[] = [el('p', { class: 'camp-text camp-lead', 'data-id': 'journal-side-sum' }, `${SIDES.filter(sideDone).length} of ${SIDES.length} told. These are not owed. They are open from the first day, in any order, and each one pays when it is told.`)];
    for (const s of SIDES) {
      const n = fraction(s);
      const told = sideDone(s);
      kids.push(el('section', { class: told ? 'camp-chapter side told' : 'camp-chapter side', 'data-id': `journal-side-${s.id}` },
        el('div', { class: 'camp-side-head' }, el('h3', { class: 'camp-title' }, s.title), el('span', { class: 'k-label' }, told ? 'Told ✓' : `${n} of ${s.objectives.length}`)),
        el('p', { class: 'camp-text' }, told ? s.outro : s.intro),
        el('ul', { class: 'camp-list' }, ...s.objectives.map((o) => objective(o, w, !told))),
        el('p', { class: 'camp-reward' }, el('span', { class: 'k-label' }, told ? 'It gave you' : 'When it is told'), s.reward.says),
      ));
    }
    return kids;
  };
  const doneTab = (w: World | null, redraw: () => void): (Node | null)[] => {
    const kids: (Node | null)[] = [];
    const closed = Math.min(st.chapter, CHAPTERS.length);
    if (closed === 0) kids.push(el('p', { class: 'camp-text camp-lead', 'data-id': 'journal-none' }, 'Nothing is closed yet. The first chapter is on the Story page.'));
    CHAPTERS.forEach((ch, i) => {
      if (i >= st.chapter) return;
      const isOpen = openPast.has(i);
      const head = el('button', { class: 'camp-row past', type: 'button', 'aria-expanded': String(isOpen), 'data-id': `journal-past-${i}` },
        el('span', { class: 'k-label' }, `Chapter ${i + 1}`), el('span', { class: 'camp-name' }, ch.title), el('span', { class: 'k-label' }, isOpen ? 'Fold' : 'Closed ✓'));
      head.addEventListener('click', () => { if (isOpen) openPast.delete(i); else openPast.add(i); redraw(); });
      kids.push(head);
      if (isOpen) kids.push(el('section', { class: 'camp-chapter old' },
        el('p', { class: 'camp-text' }, ch.outro),
        el('ul', { class: 'camp-list' }, ...ch.objectives.map((o) => objective(o, w, false))),
        el('p', { class: 'camp-reward' }, el('span', { class: 'k-label' }, 'It gave you'), ch.reward.says),
      ));
    });
    for (const s of SIDES) {
      if (!sideDone(s)) continue;
      kids.push(el('div', { class: 'camp-row told', 'data-id': `journal-told-${s.id}` }, el('span', { class: 'k-label' }, 'Side story'), el('span', { class: 'camp-name' }, s.title), el('span', { class: 'k-label' }, 'Told ✓')));
    }
    const over = el('div', { class: 'camp-over' });
    if (confirming) {
      over.append(
        el('p', { class: 'camp-text' }, 'Forget the journal? Your box, your Light and your skies stay as they are. What they already prove is marked again at once, and nothing pays twice.'),
        el('div', { class: 'camp-pair' },
          button('Forget it', () => { confirming = false; startOver(); redraw(); }, { id: 'journal-reset-yes' }),
          button('Keep it', () => { confirming = false; redraw(); }, { id: 'journal-reset-no' }),
        ),
      );
    } else {
      over.append(button('Start over', () => { confirming = true; redraw(); }, { id: 'journal-reset' }));
    }
    kids.push(over);
    return kids;
  };

  const TABS: readonly (readonly [Tab, string])[] = [['story', 'Story'], ['side', 'Side stories'], ['done', 'Done']];
  let shownTab: Tab | null = null;
  const renderJournal = (into: HTMLElement) => {
    const w = lastWorld;
    const redraw = () => renderJournal(into);
    const step = nextStep(w);
    const tabs = el('div', { class: 'camp-tabs', role: 'tablist' }, ...TABS.map(([id, text]) => {
      const b = el('button', { class: 'camp-tab', type: 'button', role: 'tab', 'aria-selected': String(tab === id), 'data-id': `journal-tab-${id}` }, text);
      b.addEventListener('click', () => { if (tab !== id) { tab = id; confirming = false; redraw(); } });
      return b;
    }));
    const page = el('div', { class: 'camp-journal' },
      el('p', { class: 'camp-sum', 'data-id': 'journal-sum' },
        st.chapter >= CHAPTERS.length ? 'Every chapter is closed.' : `Chapter ${st.chapter + 1} of ${CHAPTERS.length}`,
        el('b', {}, `${ALL.filter((o) => done.has(o.id)).length} / ${ALL.length} marks`)),
      el('div', { class: 'camp-next', 'data-id': 'journal-next' },
        el('span', { class: 'k-label' }, 'Next'),
        el('p', { class: 'camp-next-what' }, step.what),
        el('p', { class: 'camp-next-how' }, el('b', {}, `${step.where}. `), step.how)),
      tabs,
      el('div', { class: 'camp-page', role: 'tabpanel', 'data-id': `journal-page-${tab}` }, ...(tab === 'story' ? storyTab(w) : tab === 'side' ? sideTab(w) : doneTab(w, redraw))),
    );
    const keep = shownTab === tab ? into.scrollTop : 0;
    shownTab = tab;
    into.replaceChildren(page);
    into.scrollTop = keep;
    if (confirming) into.scrollTop = into.scrollHeight;
  };

  shell.menu.add({
    id: 'journal',
    label: 'Journal',
    hint: 'What the box is asking of you',
    order: 10,
    badge: () => (st.fresh > 0 ? `${st.fresh} new` : null),
    render: (into) => {
      confirming = false;
      shownTab = null;
      if (st.fresh > 0) { st.fresh = 0; save(); }
      try { lastWorld = look(); } catch { /* render with what we had */ }
      renderJournal(into);
      journal = () => renderJournal(into);
      return () => { journal = null; confirming = false; };
    },
  });

  // ---- wiring ----
  shell.onNavigate((_from, to) => {
    if (!been.has(to)) { been.add(to); save(); }
    try { cards(); } catch { /* never break navigation */ }
  });
  let acc = 0;
  shell.onFrame((dt) => {
    acc += dt;
    if (acc < CHECK_MS) return;
    acc = 0;
    try { check(); cards(); } catch (e) { console.error('campaign', e); }
  });
};
