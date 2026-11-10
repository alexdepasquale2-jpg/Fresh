/**
 * The Codex, the Deeds and the Tally: three pages in the hub menu.
 *
 * Everything the player meets is remembered here. Nothing is invented: every entry is
 * detected from real state on shell.ctx (the box, the dive, the selection, the sim's
 * latest frame, the sky, the battle in progress) by a throttled scan, and kept in one
 * compact shell.store value (ids and small numbers, capped lists; never whole specs).
 * The ladder ('sallow-ladder'), the room at the bottom (ui/mirror/endgame) and the
 * Almanac ('sallow-almanac', window.__sallowAlmanac) are read, never written.
 *
 * Cost: a light scan every 400 ms (small keys only), the ground walked at most once
 * every four seconds, the outside stores read at most once every five. Pages are built
 * only when opened: each tab makes plain data first and DOM for what is shown.
 */
import './codex.css';
import { child, seedToHex } from '@/core/hash';
import { formatSerial } from '@/core/serial';
import { glyphChar, displayName, lightShort, pieceCount, aPiece, curly } from '@/ui/kit';
import { BOX_SLOTS, LIGHT_MAX_PIPS } from '@/contracts/game';
import type { UniverseStats, Lineage } from '@/contracts/game';
import { SKY_PIECE_KINDS, SKY_MAX_PIECES } from '@/contracts/sky';
import type { SkyPieceKind, SkyState } from '@/contracts/sky';
import { BELIEFS, ERAS, LATE_ERAS, ENGINE } from '@/contracts/sim';
import type { SimFrame } from '@/contracts/app';
import { RARITIES } from '@/contracts/universe';
import type { UniverseSpec, UniverseTrait } from '@/contracts/universe';
import type { PlanetSpec } from '@/contracts/system';
import type { Seed } from '@/contracts/seed';
import type { Fighter, Element, Weather } from '@/contracts/battle';
import type { Stratum, FoldThingKind } from '@/contracts/fold';
import { load as loadEnd, FRAGMENTS, BOONS, topLayer } from '@/ui/mirror/endgame';
import type { EndState } from '@/ui/mirror/endgame';
import type { Plugin } from '../plugins';

// ---------- stored shape ----------
/** [best fold, worlds tended, flags, law index]. Flags: 1 held now or once, 2 dived, 4 floor reached, 8 mirror met, 16 made by merging. */
type URec = [number, number, number, number];
/** [star key, universe serial, kind index, heat, worlds, system name] */
type StarRec = [string, number, number, number, number, string];
/** [name, calling, deeds] */
type PersonRec = [string, string, string[]];
/** [name, belief index, first voice, most villages at once, villages that kept it] */
type CreedRec = [string, number, string, number, string[]];
/** [name, title, fate] */
type FigRec = [string, string, string];
/** [how it began, how it ended] */
type PairRec = [string, string];
/**
 * n name, b biome index, u universe serial, s peak souls, e best era, c creed mask, v most villages, p named people.
 * Peoples (all optional): a true age 0..8, ak colony ships, ci last chronicle id read, k creeds, sc schisms,
 * f rulers and heretics, wa wars, pg plagues, wk great works, iv inventions.
 */
interface WorldRec {
  n: string; b: number; u: number; s: number; e: number; c: number; v: number; p: PersonRec[];
  a?: number; ak?: number; ci?: number; k?: CreedRec[]; sc?: string[]; f?: FigRec[]; wa?: PairRec[]; pg?: PairRec[]; wk?: string[]; iv?: string[];
}
/** [name, element index, 1 if a rival's, traits, skills, best form, best level] */
type CreatureRec = [string, number, number, string[], string[], number?, number?];
/** [flags, fewest turns to win, fights, wins]. Flags: 1 fought, 2 won, 4 lost, 8 fled. */
type RivalRec = [number, number, number, number];
interface Tally {
  folds: number; deep: number; stars: number; hung: number; souls: number; vf: number; vl: number;
  won: number; lost: number; caught: number; merges: number; ms: number; le: number; ls: number; mir: number; claimed: number; full: number; orbit: number;
  strata: number; wars: number; peace: number; razed: number; plagues: number; cured: number; schisms: number; crowns: number; fallen: number;
  works: number; invent: number; arks: number; echoes: number; picks: number; hit: number; dodged: number; streak: number; seen: number; missed: number;
  combos: number; mcombo: number; fights: number; gen: number;
}
/** What the wider game added. Everything here is small: masks, ids, short capped lists. */
interface Extra {
  /** 2 once this profile has been read by this version (the first read is silent). */
  v: number;
  /** Universe serial to a mask per stratum: 1 crossed, 2<<kind a fold thing met, 256 a star, 512 a flicker. */
  sx: Record<string, number[]>;
  /** Fold thing kinds ever met (bit per kind). */
  fk: number;
  /** Echo lines read. */
  ec: string[];
  rv: Record<string, RivalRec>;
  /** Relic ids found. */
  rs: string[];
  /** Element index to skill names your creatures have learned. */
  sk: Record<string, string[]>;
  /** Weather kinds seen (bit per kind). */
  wt: number;
  /** Omen id to [name, line]. */
  om: Record<string, [string, string]>;
  /** Sky body kind to names seen. */
  hv: Record<string, string[]>;
  /** What generated skies said. */
  hs: string[];
  /** Recently discovered: [tab, label], newest first. */
  rc: [string, string][];
  /** Fragments already noted, last codex percent, tabs opened (bit per tab). */
  fg: number; cp: number; tb: number;
}
interface Save {
  v: 1;
  seeded: boolean;
  u: Record<string, URec>;
  st: StarRec[];
  w: Record<string, WorldRec>;
  /** Bit per sky piece kind ever hung. */
  pc: number;
  /** Sky combination (piece indices, sorted) to the rule indices that spoke. */
  cb: Record<string, number[]>;
  cr: Record<string, CreatureRec>;
  /** Law index to material ids seen. */
  m: Record<string, number[]>;
  /** Deed id to 1 (unlocked) or 2 (claimed). */
  a: Record<string, number>;
  /** Unread entries per codex tab. */
  nw: Record<string, number>;
  n: Tally;
  x: Extra;
}

const CAP = { u: 150, st: 200, w: 120, people: 8, deeds: 4, cb: 60, cr: 90, creeds: 4, figs: 6, wars: 4, plagues: 2, list: 8, echoes: 24, says: 16, recent: 12, rich: 24, line: 96 } as const;
const ZERO: Tally = {
  folds: 0, deep: 0, stars: 0, hung: 0, souls: 0, vf: 0, vl: 0, won: 0, lost: 0, caught: 0, merges: 0, ms: 0, le: 0, ls: 0, mir: 0, claimed: 0, full: 0, orbit: 0,
  strata: 0, wars: 0, peace: 0, razed: 0, plagues: 0, cured: 0, schisms: 0, crowns: 0, fallen: 0, works: 0, invent: 0, arks: 0, echoes: 0, picks: 0, hit: 0, dodged: 0,
  streak: 0, seen: 0, missed: 0, combos: 0, mcombo: 0, fights: 0, gen: 0,
};
const extra = (): Extra => ({ v: 0, sx: {}, fk: 0, ec: [], rv: {}, rs: [], sk: {}, wt: 0, om: {}, hv: {}, hs: [], rc: [], fg: -1, cp: 0, tb: 0 });
const fresh = (): Save => ({ v: 1, seeded: false, u: {}, st: [], w: {}, pc: 0, cb: {}, cr: {}, m: {}, a: {}, nw: {}, n: { ...ZERO }, x: extra() });
const obj = <T>(x: unknown, d: T): T => (x && typeof x === 'object' && !Array.isArray(x) ? (x as T) : d);
const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const num = (x: unknown, d = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const heal = (raw: unknown): Save => {
  const d = fresh();
  const r = obj<Partial<Save>>(raw, {});
  const n = { ...ZERO, ...obj<Partial<Tally>>(r.n, {}) };
  for (const k of Object.keys(ZERO) as (keyof Tally)[]) if (typeof n[k] !== 'number' || !Number.isFinite(n[k])) n[k] = 0;
  const rx = obj<Partial<Extra>>(r.x, {});
  const x: Extra = {
    v: num(rx.v), sx: obj(rx.sx, {}), fk: num(rx.fk), ec: arr<string>(rx.ec), rv: obj(rx.rv, {}), rs: arr<string>(rx.rs), sk: obj(rx.sk, {}), wt: num(rx.wt),
    om: obj(rx.om, {}), hv: obj(rx.hv, {}), hs: arr<string>(rx.hs), rc: arr<[string, string]>(rx.rc), fg: num(rx.fg, -1), cp: num(rx.cp), tb: num(rx.tb),
  };
  return { v: 1, seeded: r.seeded === true, u: obj(r.u, d.u), st: Array.isArray(r.st) ? r.st : [], w: obj(r.w, d.w), pc: typeof r.pc === 'number' ? r.pc : 0, cb: obj(r.cb, d.cb), cr: obj(r.cr, d.cr), m: obj(r.m, d.m), a: obj(r.a, d.a), nw: obj(r.nw, d.nw), n, x };
};

// ---------- words ----------
const STAR_KINDS = ['dwarf', 'main', 'giant', 'pulsar'] as const;
const STAR_WORD = ['A dwarf', 'A steady sun', 'A giant', 'A pulsar'] as const;
const STAR_HINT = ['Small and common. Stop at the dim ones.', 'The ordinary kind. Stop at any star in a fold.', 'Rare and swollen. Fall further.', 'It ticks. They hide in the deep folds.'] as const;
const BIOMES = ['ash', 'salt', 'moss', 'tallow', 'glass'] as const;
const BIOME_HINT = ['Grey ground, where something burned.', 'White flats that were once a sea.', 'A green one. They grow easily there.', 'Soft and pale. It gives under the hand.', 'It rings when the stones fall.'] as const;
const ELEMENTS: readonly Element[] = ['cold', 'fire', 'tide', 'stone', 'bloom', 'void'];
const WEATHERS: readonly Weather[] = ['heat', 'frost', 'tide', 'dust', 'spring', 'dark'];
const PIECE_SAYS: Record<SkyPieceKind, string> = { comet: 'It comes back each year.', moon: 'It pulls at whatever is loose.', belt: 'A river of stones.', sun: 'A second, lesser fire.', rings: 'An arch from edge to edge.', dust: 'It reddens everything.' };
const heatWord = (h: number) => (h < 64 ? 'a red ember' : h < 128 ? 'amber' : h < 200 ? 'white' : 'blue-white');
const ALL_ERAS: readonly string[] = [...ERAS, ...LATE_ERAS];
const ERA_HINT = ['They have roofs.', 'They keep a fire.', 'They draw iron from the stone.', 'Their streets are lit.', 'They ring the hours.', 'They point glass at your light.', 'Something turns without hands.', 'They speak across the dark.', 'They mean to go.'];
const FT: readonly FoldThingKind[] = ['piece', 'well', 'echo', 'wreck', 'storm', 'undertow', 'follower'];
const FT_NAME = ['Sky pieces adrift', 'Light wells', 'Echoes', 'Wrecks', 'Storms', 'Undertows', 'The one that follows'] as const;
const FT_SAY = ['Mote takes them.', 'Mote drinks.', 'Voices left in the folds.', 'Someone fell here before you.', 'They cost Light.', 'It takes the steering.', 'It follows if you stop.'] as const;
const FT_HINT = ['Something small, adrift in a ring.', 'A brightness in a ring.', 'Something speaks, further down.', 'Something broken turns in the deep rings.', 'A dark ring. Steer around it.', 'A ring that pulls.', 'Do not stop too long in the deep folds.'] as const;
const MOTION_SAY: Record<string, string> = { still: 'Nothing moves here.', drift: 'It drifts.', churn: 'It churns.', shiver: 'It shivers.', pull: 'It pulls.' };
const PERSONA_SAY: Record<string, string> = { bold: 'Bold. Strikes first and hard.', wary: 'Wary. Guards, and waits.', sly: 'Sly. Never the same move twice.', cruel: 'Cruel. Goes for whoever is weakest.' };
const WORK_SAYS: Record<string, string> = {
  'Great Granary': 'They mean never to starve again. Hunger passes it by.',
  'Sea Wall': 'It keeps the sea out of their doors.',
  'High Shrine': 'The ground around it is holy. Pilgrims walk there.',
  'Great Bell': 'It warns of raiders, fire and fever.',
  Lighthouse: 'It brings their traders home by night.',
  'Star House': 'They look back at what looks at them, unafraid.',
  'Sky Dock': 'They mean to leave, and from here they can.',
};
const WORK_NAMES = Object.keys(WORK_SAYS);
const MOD_WORD: Record<string, string> = { starDensity: 'stars', climateCalm: 'calm', glow: 'glow', tide: 'tide', growth: 'growth', depth: 'depth', luck: 'luck', might: 'might', ward: 'ward', tempo: 'tempo', faith: 'faith' };
const BODY_LABEL: Record<string, string> = { moon: 'Moons', world: 'Outer worlds', inner: 'Inner worlds', comet: 'Comets', sun: 'Companion suns', rogue: 'Rogue worlds', 'long-comet': 'Long comets' };
const BODY_SAY: Record<string, string> = { moon: 'They cross the night.', world: 'Wanderers in the dark.', inner: 'Sparks that keep near the sun.', comet: 'They hang there for part of each year.', sun: 'A lesser fire that follows the first.', rogue: 'It belongs to no sun.', 'long-comet': 'It comes back once in a long while.' };
const TABS = [
  ['u', 'Universes', 'Every lid you have lifted.'], ['d', 'Strata', 'What lies in the folds.'], ['l', 'Laws', 'The ways a universe can be.'], ['s', 'Stars', 'Places to stop.'],
  ['w', 'Worlds', 'Ground you have watched.'], ['p', 'Peoples', 'What they made of it.'], ['k', 'Skies', 'What hangs overhead.'], ['c', 'Creatures', 'What universes become.'],
  ['r', 'Rivals', 'The street, and its ladder.'], ['m', 'Materials', 'What things are made of.'], ['x', 'Mirror', 'The room at the bottom.'], ['a', 'Almanac', 'Omens and feast days.'],
] as const;
type TabId = (typeof TABS)[number][0];
const MILESTONES = [1, 10, 25, 50, 100, 200, 500] as const;
const ROMAN = ['', 'I', 'II', 'III', 'IV'] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const bits = (m: number) => { let c = 0; for (let v = m >>> 0; v; v &= v - 1) c++; return c; };
const cap1 = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string | null, ...kids: (Node | null | undefined)[]): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  for (const k of kids) if (k) e.append(k);
  return e;
};
const tags = (list: readonly string[]) => h('div', 'cx-tags', null, ...list.map((t) => h('span', 'k-tag', t)));
const section = (title: string, count: string) => h('div', 'cx-sec', null, h('span', 'k-label', title), h('span', 'cx-count', count));
const line = (text: string) => h('p', 'cx-line', text);
const say = (text: string) => h('p', 'cx-say', curly(text));
const block = (title: string, ...kids: (Node | null)[]) => h('div', 'cx-person', null, h('b', '', title), ...kids);
const barOf = (pct: number) => {
  const bar = h('div', 'cx-bar', null, h('i'));
  (bar.firstElementChild as HTMLElement).style.width = `${Math.max(0, Math.min(100, Math.round(pct)))}%`;
  return bar;
};

// ---------- reading the chronicle ----------
/** The chronicle's own kind is used when the frame carries it; otherwise the sentence is read. Order matters. */
const TELLS: readonly [string, RegExp][] = [
  ['fell', /died in bed|seal still in hand|The long rule of|fell in the war|did not come back from the field|sickness took|died of the fever|rose and threw down|pulled from the high seat/],
  ['plagueEnd', /sickness left|counted its dead|opened again\. It had lost/],
  ['plague', /[Ss]ickness came|brought more than goods|sickness started|fell sick|fever came|a sickness into|and to the fever/],
  ['war', /marched on|^War between|took up iron against/],
  ['peace', /laid their spears down|^Peace between|no one the victor|its last tribute|owes .+ nothing now/],
  ['tribute', /bent the knee|sends tribute|^The carts of/],
  ['razed', /to the ground|was razed|^Nothing stands where/],
  ['absorbed', /was taken into|swallowed .+ whole|under the roofs of/],
  ['creed', /a creed was named|gave the faith a name|began to call themselves/],
  ['schism', /broke from|split the faith|was divided/],
  ['exile', /was driven out of|cast out the heretic|by night, and some followed/],
  ['heresy', /preach against|said the creed was wrong|^A heretic in/],
  ['wonder', /finished the|was done at last|^After long work/],
  ['invention', /devised|Others will copy it|The world first saw/],
  ['ark', /for good, carrying|up past the sky|out of the world/],
  ['crowned', /first ruler|raised above the rest|a seal and a high seat|took the seat of House|the seal passed to|heir of House|took the high seat|A new house rules|has a ruler again/],
  ['passed', /\bthe [a-z-]+ (died|was lost|was among|went back|was standing|gave away|was killed|froze|raised a hand|walked out|was buried)/],
];
const tellKind = (e: { event: string; kind?: unknown }): string => {
  if (typeof e.kind === 'string') return e.kind;
  for (const [k, re] of TELLS) if (re.test(e.event)) return k;
  return '';
};
const first = (text: string, res: readonly RegExp[]): string[] | null => {
  for (const re of res) { const m = re.exec(text); if (m) return m.slice(1); }
  return null;
};
const CREED_RE = [/named: (.+?)\. (.+?) was its first voice/, /call themselves (.+?), after the words of (.+?)\.$/] as const;
const CREED_RE2 = /^(.+?) of .+? gave the faith a name: (.+?)\.$/;
const CROWN_RE = [/first ruler: (.+?)\.$/, /^(.+?) was raised above/, /high seat to (.+?)\.$/, /^(.+?) took the (?:seat|high seat)/, /seal passed to (.+?),/, /^(.+?), heir of/, /A new house rules .+?: (.+?)\.$/, /ruler again: (.+?),/] as const;
const HERETIC_RE = [/^In .+?, (.+?) began to preach/, /^(.+?) stood in the shrine/, /^A heretic in .+?: (.+?),/] as const;
const INVENT_RE = [/devised (.+?)\.$/, /made (.+?)\. Others/, /first saw (.+?) in /] as const;

// ---------- deeds ----------
/** What deeds are judged on. Rebuilt from the save when something changed. */
interface Q {
  uni: number; held: number; laws: number; lawTotal: number; dived10: number; floors: number;
  kinds: number; hot: boolean; cold: boolean; pulsar: boolean; starN: number;
  worlds: number; biomes: number; era: number; creeds: number; people: number; deeds3: boolean; towns: number;
  pk: number; combos: number; says: number; sayTotal: number;
  mats: number; matFull: boolean; met: number; elements: number; rivalsAll: boolean; mine: number;
  unlocked: number; n: Tally;
  // Character
  rar: number; tempers: number; traitN: number; made: number; bond: number;
  // Strata
  strata: number; strataFull: number; motions: number; thingKinds: number;
  // Peoples
  creedN: number; rulers: number; heretics: number; workKinds: number; inventKinds: number; age: number; tribute: boolean;
  // Rivals
  rivalsBeat: number; bossBeat: number; champ: boolean; personas: number; quick: number; relics: number; relicTotal: number; form: number;
  skills: number; skillFull: boolean; weathers: number;
  // Mirror
  frags: number; talks: number; layer: number; wakes: number; boons: number; left: number; lamps: number;
  // Almanac
  omens: number; feasts: number; haps: number; astreak: number;
  // Sky bodies and the book itself
  bodyKinds: number; heard: number; matLaws: number; cp: number; tabs: number;
}
type Tier = 'bronze' | 'silver' | 'gold';
interface Deed { id: string; tier: Tier; name: string; desc: string; hidden?: string; ok(q: Q): boolean; fam?: string; rung?: number; of?: number }
const D = (id: string, tier: Tier, name: string, desc: string, ok: (q: Q) => boolean, hidden?: string): Deed => ({ id, tier, name, desc, ok, hidden });
/** A family that chains: I, then II, then III. Each rung shows only once the one before is done. */
const F = (fam: string, name: string, steps: readonly number[], desc: (n: number) => string, get: (q: Q) => number, tiers: readonly Tier[] = ['bronze', 'silver', 'gold']): Deed[] =>
  steps.map((n, i) => ({ id: `${fam}${i + 1}`, tier: tiers[i] ?? 'gold', name: `${name} ${ROMAN[i + 1] ?? ''}`.trim(), desc: desc(n), ok: (q: Q) => get(q) >= n, fam, rung: i + 1, of: steps.length }));
/** The first 73 are the original deeds: their ids and order never change (rewards go by position). */
const DEEDS: readonly Deed[] = [
  // The box
  D('box1', 'bronze', 'A box of your own', 'Hold a universe.', (q) => q.held >= 1),
  D('box5', 'bronze', 'Five lids', 'Know five universes.', (q) => q.uni >= 5),
  D('box12', 'silver', 'A shelf of them', 'Know twelve universes.', (q) => q.uni >= 12),
  D('box25', 'gold', 'No room left', 'Fill all 25 slots of the Box.', (q) => q.held >= BOX_SLOTS),
  D('box50', 'gold', 'More than fits', 'Know fifty universes.', (q) => q.uni >= 50, 'A box holds only so many. You remember more.'),
  D('law2', 'bronze', 'Not the same rules', 'Meet two different law sets.', (q) => q.laws >= 2),
  D('lawHalf', 'silver', 'A student of rules', 'Meet half of all law sets.', (q) => q.laws * 2 >= q.lawTotal),
  D('lawAll', 'gold', 'Every way to be', 'Meet every law set.', (q) => q.laws >= q.lawTotal),
  // The fall
  D('fall1', 'bronze', 'Let go', 'Fall through a fold.', (q) => q.n.folds >= 1 || q.n.deep >= 1),
  D('deep10', 'bronze', 'Ten folds down', 'Reach fold 10.', (q) => q.n.deep >= 10),
  D('deep50', 'silver', 'Out of earshot', 'Reach fold 50.', (q) => q.n.deep >= 50),
  D('deep200', 'gold', 'Where it is quiet', 'Reach fold 200.', (q) => q.n.deep >= 200),
  D('folds100', 'bronze', 'A hundred folds', 'Fall 100 folds in all.', (q) => q.n.folds >= 100),
  D('folds1k', 'silver', 'A thousand folds', 'Fall 1,000 folds in all.', (q) => q.n.folds >= 1000),
  D('folds10k', 'gold', 'Still falling', 'Fall 10,000 folds in all.', (q) => q.n.folds >= 10000),
  D('dive3', 'silver', 'Three wells', 'Reach fold 10 in three universes.', (q) => q.dived10 >= 3),
  D('floor', 'silver', 'Someone else’s floor', 'Reach the bottom of a universe.', (q) => q.floors >= 1 || q.n.mir >= 1, 'Every fall ends somewhere. Someone lives there.'),
  D('mirror3', 'gold', 'Three rooms like yours', 'Stand at the bottom three times.', (q) => q.n.mir >= 3, 'The room at the bottom knows you by now.'),
  // Stars
  D('star1', 'bronze', 'A place to stop', 'Stop at a star.', (q) => q.starN >= 1),
  D('star10', 'silver', 'Ten suns', 'Stop at ten different stars.', (q) => q.starN >= 10),
  D('star40', 'gold', 'A sky of your own', 'Stop at forty different stars.', (q) => q.starN >= 40),
  D('kinds', 'silver', 'All four fires', 'Stop at a dwarf, a steady sun, a giant and a pulsar.', (q) => q.kinds >= 4),
  D('pulsar', 'bronze', 'It ticks', 'Stop at a pulsar.', (q) => q.pulsar, 'One of them keeps time.'),
  D('hot', 'bronze', 'Blue-white', 'Stop at a star hotter than 230.', (q) => q.hot),
  D('cold', 'bronze', 'A red ember', 'Stop at a star colder than 30.', (q) => q.cold, 'Their sun is almost out.'),
  // Worlds
  D('world1', 'bronze', 'Watcher', 'Watch a world.', (q) => q.worlds >= 1),
  D('world5', 'silver', 'Five small lights', 'Watch five worlds.', (q) => q.worlds >= 5),
  D('biomes', 'gold', 'Every kind of ground', 'Watch a world of each biome.', (q) => q.biomes >= BIOMES.length),
  D('souls50', 'bronze', 'Fifty souls', 'Watch a world hold 50 souls.', (q) => q.n.souls >= 50),
  D('souls200', 'silver', 'Two hundred souls', 'Watch a world hold 200 souls.', (q) => q.n.souls >= 200),
  D('souls1k', 'gold', 'A thousand souls', 'Watch a world hold 1,000 souls.', (q) => q.n.souls >= 1000),
  D('era1', 'bronze', 'They found fire', 'See a world reach the age of fire.', (q) => q.era >= 1),
  D('era3', 'silver', 'Lamps at night', 'See a world reach the age of lamps.', (q) => q.era >= 3),
  D('era5', 'gold', 'They reach back', 'See a world reach for the stars.', (q) => q.era >= 5),
  D('town1', 'bronze', 'A first roof', 'See a village founded.', (q) => q.n.vf >= 1 || q.towns >= 1),
  D('town10', 'silver', 'Ten hearths', 'See ten villages founded.', (q) => q.n.vf >= 10),
  D('lost1', 'bronze', 'You watched', 'See a village lost.', (q) => q.n.vl >= 1, 'Not every roof stays.'),
  D('creed3', 'silver', 'Three creeds', 'See three different creeds.', (q) => q.creeds >= 3),
  D('creedAll', 'gold', 'Everything is holy', 'See all six creeds.', (q) => q.creeds >= BELIEFS.length - 1),
  D('person1', 'bronze', 'One of them has a name', 'Meet a named person.', (q) => q.people >= 1),
  D('person5', 'silver', 'Five names', 'Remember five named people.', (q) => q.people >= 5),
  D('life', 'silver', 'A whole life', 'Follow one person through three deeds.', (q) => q.deeds3),
  D('orbit', 'gold', 'Their own lights', 'A universe of yours puts something into orbit.', (q) => q.n.orbit >= 1, 'One night, something of theirs goes up.'),
  // Skies
  D('hang1', 'bronze', 'Sky-hanger', 'Hang a sky piece.', (q) => q.n.hung >= 1 || q.pk >= 1),
  D('hang10', 'silver', 'Ten pieces hung', 'Hang ten sky pieces.', (q) => q.n.hung >= 10),
  D('hang40', 'gold', 'A crowded heaven', 'Hang forty sky pieces.', (q) => q.n.hung >= 40),
  D('pieces', 'silver', 'One of each', 'Hang every kind of sky piece.', (q) => q.pk >= SKY_PIECE_KINDS.length),
  D('combo3', 'bronze', 'Try it and see', 'Try three different skies.', (q) => q.combos >= 3),
  D('combo10', 'silver', 'Ten skies', 'Try ten different skies.', (q) => q.combos >= 10),
  D('saysHalf', 'silver', 'The sky explains itself', 'Hear half of what the sky rules say.', (q) => q.says * 2 >= q.sayTotal && q.says > 0),
  D('saysAll', 'gold', 'Nothing left unsaid', 'Hear every sky rule.', (q) => q.says >= q.sayTotal && q.says > 0),
  D('full', 'silver', 'No more room up there', `Hang ${SKY_MAX_PIECES} pieces over one world.`, (q) => q.n.full >= SKY_MAX_PIECES, 'A sky can be full.'),
  // Materials
  D('mat10', 'bronze', 'Ten kinds of stuff', 'See ten materials.', (q) => q.mats >= 10),
  D('mat25', 'silver', 'What it is made of', 'See twenty-five materials.', (q) => q.mats >= 25),
  D('matFull', 'gold', 'The whole table', 'See every material of one law set.', (q) => q.matFull),
  // Battles
  D('met2', 'bronze', 'Outside', 'Bring a creature to meet a rival’s.', (q) => q.met >= 1 && q.mine >= 1),
  D('met10', 'silver', 'Ten of theirs', 'Meet ten rival creatures.', (q) => q.met >= 10),
  D('elems', 'silver', 'Six tempers', 'Meet creatures of all six elements.', (q) => q.elements >= ELEMENTS.length),
  D('win1', 'bronze', 'Yours was stronger', 'Win a battle.', (q) => q.n.won >= 1),
  D('win5', 'silver', 'Five wins', 'Win five battles.', (q) => q.n.won >= 5),
  D('winAll', 'gold', 'No one left on the street', 'Beat every rival.', (q) => q.rivalsAll),
  D('lose1', 'bronze', 'Mote dims', 'Lose a battle.', (q) => q.n.lost >= 1, 'It does not always go your way.'),
  // Catching and merging
  D('catch1', 'bronze', 'Reliquary', 'Catch a flicker in the folds.', (q) => q.n.caught >= 1),
  D('catch5', 'silver', 'Five flickers', 'Catch five flickers.', (q) => q.n.caught >= 5),
  D('merge1', 'bronze', 'A third thing', 'Merge two things.', (q) => q.n.merges >= 1),
  D('merge5', 'silver', 'Never either parent', 'Merge five times.', (q) => q.n.merges >= 5),
  // Light and time
  D('light10', 'bronze', 'Their glow, your Light', 'Earn 10 pips of Light.', (q) => q.n.le >= 10000),
  D('light100', 'silver', 'A lamp that stays lit', 'Earn 100 pips of Light.', (q) => q.n.le >= 100000),
  D('spend20', 'silver', 'Spent in the dark', 'Spend 20 pips of Light.', (q) => q.n.ls >= 20000),
  D('time10', 'bronze', 'Ten minutes', 'Play for ten minutes.', (q) => q.n.ms >= 600000),
  D('time60', 'silver', 'Past bedtime', 'Play for an hour.', (q) => q.n.ms >= 3600000),
  D('claim10', 'silver', 'Collector', 'Claim ten deeds.', (q) => q.n.claimed >= 10),
  D('most', 'gold', 'Nearly everything', 'Unlock forty deeds.', (q) => q.unlocked >= 40, 'Keep the list. It is almost the whole game.'),

  // ---- Everything below was added later. New deeds are only ever appended. ----
  // What a universe is like
  D('rare1', 'bronze', 'Not a common one', 'Know a universe that is rare, or better.', (q) => q.rar >= 2),
  D('epic1', 'silver', 'It hums differently', 'Know an epic universe.', (q) => q.rar >= 3),
  D('mythic1', 'gold', 'One in a hundred', 'Know a mythic universe.', (q) => q.rar >= 4, 'Most lids are ordinary. One is not.'),
  ...F('temper', 'Moods', [3, 6, 10], (n) => `Know universes of ${n} temperaments.`, (q) => q.tempers),
  ...F('trait', 'Leanings', [6, 14, 24], (n) => `Know ${n} different traits among your universes.`, (q) => q.traitN),
  D('made1', 'bronze', 'It has parents', 'Know a universe that was made, not found.', (q) => q.made >= 1),
  D('gen2', 'silver', 'A grandchild', 'Make a universe out of a made universe.', (q) => q.n.gen >= 2),
  D('gen3', 'gold', 'A long line', 'Make a universe three merges deep.', (q) => q.n.gen >= 3, 'What you made has made something.'),
  ...F('bond', 'Kept close', [25, 60, 90], (n) => `Reach a bond of ${n} with a universe.`, (q) => q.bond),
  // Strata
  ...F('strata', 'Layers', [3, 12, 30], (n) => `Cross into ${n} strata.`, (q) => q.strata),
  D('strataAll', 'silver', 'Top to bottom', 'Cross every stratum of one universe.', (q) => q.strataFull >= 1),
  D('strataAll3', 'gold', 'Three whole wells', 'Cross every stratum of three universes.', (q) => q.strataFull >= 3),
  D('motions', 'silver', 'Five ways to move', 'Fall through still, drifting, churning, shivering and pulling strata.', (q) => q.motions >= 5),
  ...F('echo', 'Listener', [1, 5, 15], (n) => (n === 1 ? 'Read an echo in the folds.' : `Read ${n} echoes.`), (q) => q.n.echoes),
  ...F('pick', 'Beachcomber', [3, 15, 50], (n) => `Take ${n} things from the folds.`, (q) => q.n.picks),
  D('hazard1', 'bronze', 'It found you', 'Be caught by something in the folds.', (q) => q.n.hit >= 1, 'Not every ring is empty.'),
  ...F('dodge', 'Slipped past', [3, 12, 40], (n) => `Slip past ${n} hazards.`, (q) => q.n.dodged),
  D('things7', 'gold', 'Everything in the folds', 'Meet every kind of thing the folds hold.', (q) => q.thingKinds >= FT.length),
  ...F('streak', 'Without stopping', [10, 25, 60], (n) => `Fall ${n} folds in one unbroken run.`, (q) => q.n.streak),
  D('miss1', 'bronze', 'It got away', 'Let a flicker go by.', (q) => q.n.missed >= 1, 'Something flickered, and you fell past it.'),
  D('seen20', 'silver', 'Twenty small lights', 'See twenty flickers in the folds.', (q) => q.n.seen >= 20),
  // Peoples
  ...F('creedN', 'Named faiths', [1, 4, 10], (n) => (n === 1 ? 'See a creed given a name.' : `Know ${n} named creeds.`), (q) => q.creedN),
  D('schism1', 'silver', 'One god, two rites', 'See a creed split.', (q) => q.n.schisms >= 1, 'Someone will say the creed is wrong. Enough will believe it.'),
  D('heretic1', 'bronze', 'Will not kneel', 'Know a heretic by name.', (q) => q.heretics >= 1),
  ...F('ruler', 'High seats', [1, 5, 12], (n) => (n === 1 ? 'Know a ruler by name.' : `Know ${n} rulers by name.`), (q) => q.rulers),
  D('fell1', 'bronze', 'The seat is empty', 'See a ruler fall.', (q) => q.n.fallen >= 1, 'A seal changes hands.'),
  ...F('war', 'Witness', [1, 5, 15], (n) => (n === 1 ? 'See a war begin.' : `See ${n} wars begin.`), (q) => q.n.wars),
  D('peace1', 'bronze', 'Spears laid down', 'See a war end in peace.', (q) => q.n.peace >= 1),
  D('tribute1', 'bronze', 'Full carts, empty carts', 'See one village pay tribute to another.', (q) => q.tribute),
  D('razed1', 'silver', 'Nothing stands', 'See a village taken or burned by another.', (q) => q.n.razed >= 1, 'A war can end without a peace.'),
  ...F('plague', 'Fever years', [1, 4], (n) => (n === 1 ? 'See a sickness come to a village.' : `See ${n} sicknesses.`), (q) => q.n.plagues, ['bronze', 'silver']),
  D('cured1', 'bronze', 'The doors opened again', 'See a sickness leave.', (q) => q.n.cured >= 1),
  ...F('work', 'Great works', [1, 4, 7], (n) => (n === 1 ? 'See a great work finished.' : `See ${n} different great works.`), (q) => q.workKinds),
  ...F('invent', 'First of its kind', [1, 4, 8], (n) => (n === 1 ? 'See something invented.' : `See ${n} different inventions.`), (q) => q.inventKinds),
  D('era6', 'silver', 'Without hands', 'See a world reach the age of engines.', (q) => q.age >= 6),
  D('era7', 'gold', 'Across the dark', 'See a world reach the age of far-speaking.', (q) => q.age >= 7),
  D('era8', 'gold', 'Leaving', 'See a world reach its last age.', (q) => q.age >= 8, 'There is an age after the stars.'),
  D('ark1', 'gold', 'They went to find it', 'See a colony ship leave for good.', (q) => q.n.arks >= 1, 'One day a ship does not come back, on purpose.'),
  // Rivals and the ladder
  ...F('rival', 'Up the street', [1, 5, 10], (n) => (n === 1 ? 'Beat a rival.' : `Beat ${n} different rivals.`), (q) => q.rivalsBeat),
  D('boss1', 'silver', 'Tier-keeper', 'Beat a boss.', (q) => q.bossBeat >= 1),
  D('champ', 'gold', 'Top of the ladder', 'Beat the champion.', (q) => q.champ, 'Someone keeps the last rung.'),
  D('persona4', 'silver', 'Four ways to fight', 'Fight a bold, a wary, a sly and a cruel rival.', (q) => q.personas >= 4),
  D('quick', 'silver', 'Before they blinked', 'Win a battle in four turns or fewer.', (q) => q.quick > 0 && q.quick <= 4),
  ...F('relic', 'Small things kept', [1, 4, 8], (n) => (n === 1 ? 'Find a relic.' : `Find ${n} relics.`), (q) => q.relics),
  D('form2', 'bronze', 'It has changed', 'See a creature reach its second form.', (q) => q.form >= 2),
  D('form3', 'gold', 'Its last shape', 'See a creature reach its third form.', (q) => q.form >= 3),
  ...F('skill', 'Lessons', [6, 14, 24], (n) => `Have your creatures learn ${n} skills.`, (q) => q.skills),
  D('skillEl', 'gold', 'A whole school', 'Learn every skill of one element.', (q) => q.skillFull),
  ...F('weather', 'Weathers', [2, 4, 6], (n) => `Fight under ${n} kinds of weather.`, (q) => q.weathers),
  ...F('chain', 'Chains', [1, 10, 40], (n) => (n === 1 ? 'Land a combo in battle.' : `Land ${n} combos.`), (q) => q.n.combos),
  D('fights20', 'silver', 'A regular', 'Fight twenty battles.', (q) => q.n.fights >= 20),
  // The mirror
  ...F('frag', 'The answer', [1, 4, FRAGMENTS.length], (n) => (n === 1 ? 'Find a piece of the answer.' : n >= FRAGMENTS.length ? 'Find every piece of the answer.' : `Find ${n} pieces of the answer.`), (q) => q.frags),
  ...F('talk', 'Said aloud', [1, 8, 25], (n) => (n === 1 ? 'Say something to the other child.' : `Have ${n} exchanges with the other child.`), (q) => q.talks),
  D('left1', 'bronze', 'Left on their shelf', 'Leave something of yours in their room.', (q) => q.left >= 1 || q.lamps >= 1),
  D('layer1', 'silver', 'Upstairs', 'Enter a universe from their box.', (q) => q.layer >= 1, 'Their box opens too.'),
  D('layer3', 'gold', 'Three rooms up', 'Stand three layers above your own room.', (q) => q.layer >= 3, 'The boxes go a long way up.'),
  ...F('wake', 'Waking', [1, 3], (n) => (n === 1 ? 'Wake up.' : `Wake ${n} times.`), (q) => q.wakes, ['gold', 'gold']),
  D('boon3', 'silver', 'Things kept', 'Keep three boons.', (q) => q.boons >= 3),
  // The Almanac
  ...F('omen', 'Signs', [1, 5, 12], (n) => (n === 1 ? 'See an omen.' : `See ${n} different omens.`), (q) => q.omens),
  D('feast1', 'silver', 'A day kept', 'Keep a feast day.', (q) => q.feasts >= 1, 'Some days the box keeps for you.'),
  ...F('hap', 'Answered', [1, 5, 15], (n) => (n === 1 ? 'Answer a happening.' : `Answer ${n} happenings.`), (q) => q.haps),
  ...F('days', 'Day after day', [3, 7, 21], (n) => `Keep a streak of ${n} days.`, (q) => q.astreak),
  // Overhead
  ...F('body', 'Sky-reader', [1, 3, 5], (n) => (n === 1 ? 'See something cross a generated sky.' : `See ${n} kinds of thing in generated skies.`), (q) => q.bodyKinds),
  D('heard6', 'bronze', 'What the heavens said', 'Hear six things said of the skies you were given.', (q) => q.heard >= 6),
  // The book
  D('matLaw3', 'silver', 'Three tables', 'Watch ground under three different law sets.', (q) => q.matLaws >= 3),
  D('tabs', 'bronze', 'Every chapter', 'Open every page of the Codex.', (q) => q.tabs >= TABS.length),
  D('book50', 'silver', 'Half the book', 'Fill half of the Codex.', (q) => q.cp >= 50),
  D('book80', 'gold', 'A full book', 'Fill four fifths of the Codex.', (q) => q.cp >= 80),
  D('most90', 'gold', 'Nearly all of it', 'Unlock ninety deeds.', (q) => q.unlocked >= 90, 'The list is longer than it looks.'),
];
const TIER_MARK: Record<Tier, string> = { bronze: '◇', silver: '◈', gold: '◆' };
const TIER_N: Record<Tier, number> = { bronze: 1, silver: 2, gold: 3 };
/** How seldom a deed is done: its tier, whether it hides, how far up its family it sits. */
const rarityOf = (d: Deed) => TIER_N[d.tier] * 10 + (d.hidden ? 6 : 0) + (d.rung ?? 0) * 2;
type Reward = { glow: number } | { piece: SkyPieceKind; count: number };
const rewardOf = (i: number, d: Deed): Reward => {
  const piece = SKY_PIECE_KINDS[i % SKY_PIECE_KINDS.length] ?? 'moon';
  if (d.tier === 'gold') return { piece, count: 2 };
  if (d.tier === 'silver') return i % 2 ? { piece, count: 1 } : { glow: 800 };
  return { glow: 300 };
};
const rewardText = (r: Reward) => ('glow' in r ? `${lightShort(r.glow)}` : pieceCount(r.piece, r.count));

// ---------- pages as data ----------
/** One thing on a codex page. Plain data; DOM is made only for what is shown. */
interface Entry {
  k: string; name: string; sub?: string; say?: string; lines?: string[]; chips?: readonly string[];
  /** Not yet met: drawn as a silhouette, never sorted above what is known. */
  un?: boolean; fresh?: boolean; slim?: boolean;
  /** A number to sort by, and a palette colour for tiles. */
  n?: number; dot?: string;
  pre?: () => Node | null;
  detail?: () => Node[];
}
interface Group { title?: string; count?: string; tiles?: boolean; e: Entry[] }
interface Built { known: number; total: number; g: Group[] }
type SortId = 'found' | 'name' | 'most';
const SORTS: readonly [SortId, string][] = [['found', 'Found'], ['name', 'A to Z'], ['most', 'Most']];
const unknown = (hint: string, mark = '▒▒▒▒▒▒'): Entry => ({ k: '', name: mark, say: hint, un: true });

interface LadderView { wins: Record<string, number>; xp: Record<string, number>; relics: string[]; held: Record<string, string> }
interface AlmView { best: number; streak: number; feasts: string[]; haps: { title: string; text: string; done: string }[]; omen: string }
const readJson = (key: string): unknown => { try { return JSON.parse(localStorage.getItem(key) ?? 'null') as unknown; } catch { return null; } };

export const plugin: Plugin = (shell) => {
  const ctx = shell.ctx;
  const store = shell.store<Save>('codex', fresh());
  const S = heal(store.get());
  const N = S.n;
  const X = S.x;
  let dirty = false;
  let changed = true;
  const touch = () => { dirty = true; changed = true; };
  const safe = (fn: () => void) => { try { fn(); } catch { /* a missing part of state must never break the game */ } };
  const save = () => { if (!dirty) return; dirty = false; store.set(S); };

  /** True until this profile has been read once by this version: nothing found then is announced. */
  let quiet = true;
  let pendingN = 0;
  let pendingLabel = '';
  /** Entries added since the tab was last read, for NEW marks. */
  const news = new Set<string>();
  const isNew = (tab: TabId, key: string | number) => news.has(`${tab}:${key}`);
  const newly = (tab: TabId, key: string | number, label = '') => {
    news.add(`${tab}:${key}`);
    S.nw[tab] = (S.nw[tab] ?? 0) + 1;
    if (!quiet && label) {
      X.rc.unshift([tab, clip(label, 48)]);
      if (X.rc.length > CAP.recent) X.rc.length = CAP.recent;
      pendingN++;
      pendingLabel = label;
    }
    touch();
  };

  const specs = new Map<number, UniverseSpec | null>();
  const specOf = (serial: number): UniverseSpec | null => {
    let s = specs.get(serial);
    if (s === undefined) {
      try { s = ctx.universes.fromSerial(serial); } catch { s = null; }
      specs.set(serial, s);
    }
    return s;
  };
  const strataCache = new Map<number, readonly Stratum[]>();
  const strataOf = (serial: number): readonly Stratum[] => {
    let s = strataCache.get(serial);
    if (!s) {
      s = [];
      const spec = specOf(serial);
      try { if (spec) s = ctx.fold.strata?.(spec) ?? []; } catch { s = []; }
      strataCache.set(serial, s);
    }
    return s;
  };
  const lawSets = () => ctx.atlas?.lawSets ?? [];
  const lawIndex = (spec: UniverseSpec | null) => (spec ? lawSets().findIndex((l) => l.id === spec.laws.id) : -1);
  const uniName = (serial: number) => displayName(serial, specOf(serial)?.name ?? formatSerial(serial));
  const heldMap = (): Map<number, { slot: number; stats: UniverseStats }> => {
    const m = new Map<number, { slot: number; stats: UniverseStats }>();
    safe(() => ctx.box.slots().forEach((e, slot) => { if (e) m.set(e.serialNumber, { slot, stats: e.stats }); }));
    return m;
  };
  const lineageOf = (slot: number, stats: UniverseStats): Lineage | null => {
    try { return ctx.box.lineage?.(slot) ?? stats.lineage ?? null; } catch { return stats.lineage ?? null; }
  };

  // ---------- other units' stores, read only and seldom ----------
  let ladAt = -1e9;
  let lad: LadderView = { wins: {}, xp: {}, relics: [], held: {} };
  const ladder = (): LadderView => {
    const now = Date.now();
    if (now - ladAt > 3000) {
      ladAt = now;
      const j = obj<Partial<LadderView>>(readJson('sallow-ladder'), {});
      lad = { wins: obj(j.wins, {}), xp: obj(j.xp, {}), relics: arr<string>(j.relics).filter((x) => typeof x === 'string'), held: obj(j.held, {}) };
    }
    return lad;
  };
  let almAt = -1e9;
  let almV: AlmView = { best: 0, streak: 0, feasts: [], haps: [], omen: '' };
  const alm = (): AlmView => {
    const now = Date.now();
    if (now - almAt > 5000) {
      almAt = now;
      const j = obj<Record<string, unknown>>(readJson('sallow-almanac'), {});
      const haps = arr<Record<string, unknown>>(j.haps).filter((x) => x && typeof x === 'object' && typeof x.done === 'string')
        .map((x) => ({ title: clip(x.title, 48), text: clip(x.text, 200), done: clip(x.done, 160) }));
      almV = { best: num(j.best), streak: num(j.streak), feasts: arr<string>(j.feasts).filter((x) => typeof x === 'string'), haps, omen: clip(obj<Record<string, unknown>>(j.day, {}).omen, 32) };
    }
    return almV;
  };
  const end = (): EndState | null => { try { return loadEnd(); } catch { return null; } };
  const relicList = () => { try { return ctx.battles.relics?.() ?? []; } catch { return []; } };
  const rivalList = () => { try { return ctx.battles.rivals(); } catch { return []; } };

  // ---------- detection ----------
  const uni = (serial: number): URec | null => {
    const k = String(serial);
    let r = S.u[k];
    if (!r) {
      if (Object.keys(S.u).length >= CAP.u) return null;
      const spec = specOf(serial);
      const li = lawIndex(spec);
      r = S.u[k] = [0, 0, 0, li];
      newly('u', serial, displayName(serial, spec?.name ?? 'A universe'));
      if (li >= 0 && !Object.values(S.u).some((x) => x !== r && x[3] === li)) newly('l', li, spec?.laws.name ?? 'A law set');
    }
    return r;
  };
  const raise = (r: URec, i: 0 | 1, v: number) => { if (Number.isFinite(v) && v > r[i]) { r[i] = Math.floor(v); touch(); } };
  const flag = (r: URec, f: number) => { if ((r[2] & f) !== f) { r[2] |= f; touch(); } };
  const bump = (k: keyof Tally, v: number) => { if (v > 0) { N[k] += v; touch(); } };
  const top = (k: keyof Tally, v: number) => { if (Number.isFinite(v) && v > N[k]) { N[k] = Math.floor(v); touch(); } };

  let boxSeen: Set<number> | null = null;
  let invSeen: number[] | null = null;
  let caughtHere = 0;
  const scanBox = () => {
    const now = new Set<number>();
    for (const e of ctx.box.slots()) {
      if (!e) continue;
      now.add(e.serialNumber);
      const r = uni(e.serialNumber);
      if (!r) continue;
      flag(r, 1);
      raise(r, 0, e.stats.deepestFold);
      raise(r, 1, e.stats.worldsTended);
      top('deep', e.stats.deepestFold);
      top('souls', e.stats.souls ?? 0);
      top('orbit', e.stats.orbiters ?? 0);
      const lin = e.stats.lineage;
      if (lin) { flag(r, 16); top('gen', lin.generation); }
    }
    const inv = SKY_PIECE_KINDS.map((k) => ctx.sky.inventory()[k] ?? 0);
    const screen = shell.current();
    let merged = false;
    if (boxSeen) {
      for (const s of now) {
        if (boxSeen.has(s)) continue;
        if (screen === 'dive') { bump('caught', 1); caughtHere++; }
        else if (screen === 'box') merged = true;
      }
    }
    // Two pieces merged into a third: some kind went down while the Box was open.
    if (invSeen && screen === 'box' && !shell.menu.isOpen() && inv.some((n, i) => n < (invSeen?.[i] ?? 0))) merged = true;
    if (merged) bump('merges', 1);
    boxSeen = now;
    invSeen = inv;
    top('won', ctx.rivalsBeaten.size);
  };

  let diveSerial = -1;
  let diveDepth = 0;
  let booted = false;
  let foldAt = -1;
  let foldFlick = 0;
  let sumKey: string | null = null;
  const scanDive = () => {
    const v = ctx.dive.view();
    const u = v.universe;
    if (!u) return;
    const r = uni(u.serialNumber);
    const restarted = u.serialNumber !== diveSerial || v.depth < diveDepth;
    if (restarted) { diveSerial = u.serialNumber; diveDepth = booted ? 0 : v.depth; foldAt = -1; foldFlick = 0; caughtHere = 0; }
    if (v.depth > diveDepth) { bump('folds', v.depth - diveDepth); diveDepth = v.depth; }
    top('deep', v.depth);
    top('deep', v.best);
    top('streak', v.streak ?? 0);
    if (r) {
      raise(r, 0, Math.max(v.depth, v.best));
      if (v.depth > 0) flag(r, 2);
      if (v.bottom) flag(r, 4);
    }
    const onDive = shell.current() === 'dive';
    // The stratum being crossed, and what its rings hold.
    const st = v.stratum;
    if (onDive && st && r && st.index >= 0 && st.index < 24) {
      const list = (X.sx[u.serialNumber] ??= []);
      const was = list[st.index] ?? 0;
      let m = was | 1;
      for (const c of v.children) {
        if (c.star) m |= 256;
        if (c.flicker) m |= 512;
        if (c.thing) { const i = FT.indexOf(c.thing.kind); if (i >= 0) m |= 2 << i; }
      }
      if (m !== was) {
        for (let i = 0; i < st.index; i++) list[i] = list[i] ?? 0;
        list[st.index] = m;
        touch();
        if (!(was & 1)) { bump('strata', 1); newly('d', `${u.serialNumber}:${st.index}`, `${st.name}, in ${displayName(u)}`); }
        const met = (m >> 1) & 127;
        for (let i = 0; i < FT.length; i++) if (met & (1 << i) && !(X.fk & (1 << i))) { X.fk |= 1 << i; newly('d', `ft${i}`, FT_NAME[i] ?? 'Something in the folds'); }
      }
    }
    // Flickers seen in a fold, and those fallen past.
    if (onDive && v.depth !== foldAt) {
      if (foldAt >= 0 && v.depth > foldAt && foldFlick > caughtHere) bump('missed', foldFlick - caughtHere);
      foldAt = v.depth;
      caughtHere = 0;
      foldFlick = 0;
      for (const c of v.children) if (c.flicker) foldFlick++;
      bump('seen', foldFlick);
    }
    // What a finished dive gathered: counted once per summary.
    const s = v.summary ?? null;
    const key = s ? `${u.serialNumber}:${s.reason}:${s.depth}:${s.folds}:${s.haul}` : '';
    if (key !== sumKey) {
      if (s && sumKey !== null) {
        bump('echoes', s.echoes);
        bump('picks', s.pieces + s.wells + s.echoes + s.wrecks);
        bump('hit', s.hazardsHit);
        bump('dodged', s.hazardsDodged);
        top('streak', s.bestStreak);
      }
      sumKey = key;
    }
    // An echo is read where the dive says it; its words are kept.
    if (onDive) {
      const t = shell.layer.querySelector('.k-narration')?.textContent ?? '';
      if (t.startsWith('An echo') && !X.ec.includes(t)) {
        X.ec.push(clip(t, 140));
        if (X.ec.length > CAP.echoes) X.ec.shift();
        newly('d', `echo${X.ec.length}`, 'An echo, read');
      }
    }
  };

  const scanStar = () => {
    const sel = ctx.selection;
    const screen = shell.current();
    if (!sel.star || !sel.system || !sel.universe || (screen !== 'system' && screen !== 'planet')) return;
    const key = seedToHex(sel.star.seed);
    uni(sel.universe.serialNumber);
    if (S.st.some((x) => x[0] === key)) return;
    S.st.push([key, sel.universe.serialNumber, Math.max(0, STAR_KINDS.indexOf(sel.star.kind)), sel.star.heat | 0, sel.system.planets.length, clip(sel.system.name, 32)]);
    if (S.st.length > CAP.st) S.st.splice(0, S.st.length - CAP.st);
    bump('stars', 1);
    newly('s', key, sel.system.name || 'A star');
  };

  // ---------- peoples: what a watched world's civilisations did ----------
  const pushCap = <T>(list: T[], v: T, cap: number) => { list.push(v); if (list.length > cap) list.shift(); };
  const creedOf = (w: WorldRec, key: string, name: string, belief: number): CreedRec | null => {
    const list = (w.k ??= []);
    const low = name.toLowerCase();
    let c = list.find((x) => x[0].toLowerCase() === low);
    if (!c) {
      if (list.length >= CAP.creeds) return null;
      c = [clip(name, 32), belief, '', 0, []];
      list.push(c);
      newly('p', `${key}:k${list.length}`, `${cap1(name)}, on ${w.n}`);
    } else if (belief > 0 && c[1] <= 0) { c[1] = belief; touch(); }
    return c;
  };
  const figureOf = (w: WorldRec, key: string, name: string, title: string): FigRec | null => {
    const list = (w.f ??= []);
    const nm = clip(name, 28);
    let f = list.find((x) => x[0] === nm);
    if (!f) {
      if (!nm || nm.length < 2) return null;
      f = [nm, title, ''];
      pushCap(list, f, CAP.figs);
      newly('p', `${key}:f${nm}`, `${nm}, ${title} on ${w.n}`);
    }
    return f;
  };
  const fateOf = (w: WorldRec, text: string) => {
    for (const f of w.f ?? []) {
      const short = f[0].split(' ')[0] ?? f[0];
      if (text.includes(f[0]) || (short.length > 2 && text.includes(short))) { if (f[2] !== text) { f[2] = text; touch(); } return; }
    }
  };
  const workOf = (w: WorldRec, key: string, name: string) => {
    const list = (w.wk ??= []);
    const nm = clip(name, 24);
    if (!nm || list.includes(nm) || list.length >= CAP.list) return;
    list.push(nm);
    bump('works', 1);
    newly('p', `${key}:w${nm}`, `The ${nm} of ${w.n}`);
  };
  /** One chronicle line, read once. `names` are the villages standing now. */
  const tell = (w: WorldRec, key: string, e: { event: string; kind?: unknown }, names: readonly string[]) => {
    const kind = tellKind(e);
    if (!kind) return;
    const text = clip(e.event, CAP.line);
    switch (kind) {
      case 'war': {
        const both = names.filter((n) => n && text.includes(n));
        const open = (w.wa ??= []).find((x) => !x[1] && both.length >= 2 && both.every((n) => x[0].includes(n)));
        // The chronicle tells it better than the bare fact did.
        if (open) { if (open[0] !== text) { open[0] = text; touch(); } break; }
        pushCap(w.wa, [text, ''], CAP.wars);
        bump('wars', 1);
        newly('p', `${key}:war${N.wars}`, text);
        break;
      }
      case 'peace': case 'tribute': case 'razed': case 'absorbed': {
        const wars = (w.wa ??= []);
        const shared = names.filter((n) => n && text.includes(n));
        const open = [...wars].reverse().find((x) => !x[1] && shared.some((n) => x[0].includes(n))) ?? [...wars].reverse().find((x) => !x[1]);
        if (open) open[1] = text; else pushCap(wars, ['An old quarrel, begun before you looked.', text], CAP.wars);
        if (kind === 'peace') bump('peace', 1); else if (kind !== 'tribute') bump('razed', 1);
        touch();
        break;
      }
      case 'creed': {
        const m = first(text, CREED_RE);
        const m2 = m ? null : CREED_RE2.exec(text);
        const name = m?.[0] ?? m2?.[2];
        const voice = m?.[1] ?? m2?.[1];
        const c = name ? creedOf(w, key, name, 0) : null;
        if (c && voice && !c[2]) { c[2] = clip(voice, 28); touch(); }
        break;
      }
      case 'schism':
        pushCap((w.sc ??= []), text, 3);
        bump('schisms', 1);
        newly('p', `${key}:sc${N.schisms}`, text);
        break;
      case 'heresy': { const m = first(text, HERETIC_RE); if (m?.[0]) figureOf(w, key, m[0], 'heretic'); break; }
      case 'exile': fateOf(w, text); break;
      case 'plague':
        pushCap((w.pg ??= []), [text, ''], CAP.plagues);
        bump('plagues', 1);
        newly('p', `${key}:pg${N.plagues}`, text);
        break;
      case 'plagueEnd': {
        const open = [...(w.pg ??= [])].reverse().find((x) => !x[1]);
        if (open) open[1] = text; else pushCap(w.pg, ['A sickness, already there when you looked.', text], CAP.plagues);
        bump('cured', 1);
        break;
      }
      case 'wonder': { const nm = WORK_NAMES.find((x) => text.includes(x)); if (nm) workOf(w, key, nm); break; }
      case 'invention': {
        const m = first(text, INVENT_RE);
        const list = (w.iv ??= []);
        const nm = clip(m?.[0] ?? '', 20);
        if (nm && !list.includes(nm) && list.length < CAP.list) { list.push(nm); bump('invent', 1); newly('p', `${key}:i${nm}`, `${cap1(nm)}, first made on ${w.n}`); }
        break;
      }
      case 'crowned': {
        const m = first(text, CROWN_RE);
        bump('crowns', 1);
        const f = m?.[0] ? figureOf(w, key, m[0], 'ruler') : null;
        if (f && !f[2]) { f[2] = text; touch(); }
        break;
      }
      case 'fell': bump('fallen', 1); fateOf(w, text); break;
      case 'passed': {
        // The followed person's end is the last thing told of them.
        const p = w.p.find((x) => text.includes(x[0]) || text.includes(x[0].split(' ')[0] ?? x[0]));
        if (p && !p[2].includes(text)) { p[2] = [...p[2], clip(text, 72)].slice(-CAP.deeds); touch(); }
        break;
      }
      default:
    }
  };
  const scanPeoples = (w: WorldRec, key: string, f: SimFrame, seed: Seed) => {
    const civ = f.civ;
    const age = Math.max(civ.era, civ.age ?? 0);
    if (age > (w.a ?? 0)) { w.a = age; touch(); if (age > 5) newly('p', `${key}:a${age}`, `${w.n} reached the age of ${ALL_ERAS[age] ?? 'leaving'}`); }
    const arks = civ.arks ?? 0;
    if (arks > (w.ak ?? 0)) { bump('arks', arks - (w.ak ?? 0)); w.ak = arks; newly('p', `${key}:ark${arks}`, `A ship left ${w.n} for good`); }
    const names: string[] = [];
    const byId = new Map<number, string>();
    // A village's name is a pure function of the planet and its id (as the planet screen shows it).
    for (const v of civ.villages) {
      let nm = v.name;
      try { nm = ctx.names.village(child(seed, v.id + 1)); } catch { /* keep what the view gave */ }
      names.push(nm);
      byId.set(v.id, nm);
    }
    for (const c of civ.creeds ?? []) {
      const rec = creedOf(w, key, c.name, Math.max(0, BELIEFS.indexOf(c.belief)));
      if (!rec) continue;
      if (c.villages > rec[3]) { rec[3] = c.villages; touch(); }
    }
    for (const v of civ.villages) {
      if (v.creed) {
        const rec = (w.k ?? []).find((x) => x[0].toLowerCase() === v.creed?.toLowerCase());
        const vn = clip(byId.get(v.id) ?? v.name, 20);
        if (rec && rec[4].length < 4 && !rec[4].includes(vn)) { rec[4].push(vn); touch(); }
      }
      if (v.ruler) figureOf(w, key, v.ruler, 'ruler');
      for (const nm of v.works ?? []) workOf(w, key, nm);
    }
    for (const g of civ.figures ?? []) figureOf(w, key, g.name, g.title);
    const ch = f.chronicle;
    let maxId = w.ci ?? 0;
    for (const e of ch) if (e.id > maxId) maxId = e.id;
    if (maxId !== (w.ci ?? 0)) {
      const since = w.ci ?? 0;
      const fresh = ch.filter((e) => e.id > since).sort((a, b) => a.id - b.id);
      for (const e of fresh) tell(w, key, e, names);
      w.ci = maxId;
      touch();
    }
    // A war the chronicle had no room to tell is still a war.
    for (const r of civ.relations ?? []) {
      if (r.kind !== 'war') continue;
      const a = byId.get(r.a);
      const b = byId.get(r.b);
      if (!a || !b) continue;
      const wars = (w.wa ??= []);
      if (wars.some((x) => !x[1] && x[0].includes(a) && x[0].includes(b))) continue;
      pushCap(wars, [`War between ${a} and ${b}.`, ''], CAP.wars);
      bump('wars', 1);
      newly('p', `${key}:war${N.wars}`, `War between ${a} and ${b}`);
    }
    // And a war no longer being fought has ended, told or not.
    const atWar = (civ.relations ?? []).filter((r) => r.kind === 'war').map((r) => [byId.get(r.a) ?? '', byId.get(r.b) ?? ''] as const);
    for (const x of w.wa ?? []) {
      if (x[1] || atWar.some(([a, b]) => a && b && x[0].includes(a) && x[0].includes(b))) continue;
      x[1] = 'It ended, and no one wrote down how.';
      touch();
    }
  };
  /** Older worlds keep their numbers and names; only the newest keep their long lines. */
  const slimOld = () => {
    const keys = Object.keys(S.w);
    for (let i = 0; i < keys.length - CAP.rich; i++) {
      const w = S.w[keys[i] ?? ''];
      if (!w) continue;
      delete w.wa; delete w.pg; delete w.sc;
      for (const f of w.f ?? []) f[2] = '';
      for (const p of w.p) if (p[2].length > 1) p[2] = p[2].slice(-1);
    }
  };

  let watchKey = '';
  let watchTick = -1;
  let towns: Set<number> | null = null;
  let matTurn = 0;
  const openPlanet = (): { planet: PlanetSpec; universe: UniverseSpec } | null => {
    const sel = ctx.selection;
    if (shell.current() !== 'planet' || !sel.system || !sel.universe) return null;
    const planet = sel.system.planets[sel.planetIndex];
    if (!planet || !ctx.sim.isOpen(sel.universe, planet)) return null;
    return { planet, universe: sel.universe };
  };
  const scanWorld = () => {
    const at = openPlanet();
    const f = at ? ctx.sim.latest() : null;
    if (!at || !f) { watchKey = ''; towns = null; return; }
    const key = seedToHex(at.planet.seed);
    let w = S.w[key];
    const first = !w;
    if (!w) {
      const keys = Object.keys(S.w);
      if (keys.length >= CAP.w && keys[0]) delete S.w[keys[0]];
      w = S.w[key] = { n: clip(at.planet.name, 32), b: Math.max(0, BIOMES.indexOf(at.planet.terrain.biome)), u: at.universe.serialNumber, s: 0, e: 0, c: 0, v: 0, p: [] };
      uni(at.universe.serialNumber);
      newly('w', key, w.n || 'A world');
      slimOld();
    }
    const civ = f.civ;
    if (civ.souls > w.s) { w.s = civ.souls; touch(); }
    if (civ.era > w.e) { w.e = civ.era; touch(); }
    if (civ.villages.length > w.v) { w.v = civ.villages.length; touch(); }
    top('souls', civ.souls);
    top('orbit', civ.launches);
    let creeds = w.c;
    const ids = new Set<number>();
    for (const v of civ.villages) {
      ids.add(v.id);
      const bi = BELIEFS.indexOf(v.belief);
      if (bi > 0) creeds |= 1 << bi;
    }
    if (creeds !== w.c) { w.c = creeds; touch(); }
    // Villages seen founded and lost, by id, while this world stays open.
    if (key !== watchKey || f.tick < watchTick || !towns) {
      if (first) bump('vf', ids.size);
    } else {
      let born = 0;
      let gone = 0;
      for (const id of ids) if (!towns.has(id)) born++;
      for (const id of towns) if (!ids.has(id)) gone++;
      bump('vf', born);
      bump('vl', gone);
    }
    const moved = key !== watchKey || f.tick !== watchTick;
    watchKey = key;
    watchTick = f.tick;
    towns = ids;
    const who = civ.notable;
    if (who && who.name) {
      const deeds = who.deeds.slice(-CAP.deeds).map((d) => clip(d, 72));
      const p = w.p.find((x) => x[0] === who.name);
      if (!p) {
        w.p.push([clip(who.name, 28), clip(who.calling, 16), deeds]);
        if (w.p.length > CAP.people) w.p.shift();
        if (!first) newly('w', key, `${who.name}, of ${w.n}`);
        touch();
      } else if (p[2].join('|') !== deeds.join('|') && deeds.length) { p[2] = deeds; p[1] = clip(who.calling, 16); touch(); }
    }
    // Nothing below changes unless the world has stepped.
    if (!moved) return;
    const world = w;
    safe(() => scanPeoples(world, key, f, at.planet.seed));
    // Materials on the ground: one walk of the grid, at most every four seconds.
    if (matTurn++ % 10 === 0) {
      const li = lawIndex(at.universe);
      if (li < 0) return;
      const cells = f.grid.cells;
      const seen = new Uint8Array(256);
      for (let i = 0; i < cells.length; i++) seen[cells[i] ?? 0] = 1;
      const known = (S.m[li] ??= []);
      const table = at.universe.materialTable;
      const valid = new Set<number>([...table.map((m) => m.id), ...Object.values(ENGINE).map((m) => m.id)]);
      for (let id = 1; id < 256; id++) {
        if (!seen[id] || !valid.has(id) || known.includes(id)) continue;
        known.push(id);
        newly('m', `${li}:${id}`, cap1(table.find((m) => m.id === id)?.name ?? Object.entries(ENGINE).find(([, m]) => m.id === id)?.[0] ?? 'A material'));
      }
    }
  };

  let skyDirty = true;
  let hungSeen = -1;
  const comboKey = (pieces: readonly SkyPieceKind[]) => pieces.map((p) => SKY_PIECE_KINDS.indexOf(p)).filter((i) => i >= 0).sort((a, b) => a - b).join('');
  const rulesFor = (sky: SkyState): number[] => {
    const rules = ctx.skyRules.rules;
    const planet = ctx.selection.system?.planets.find((p) => seedToHex(p.seed) === sky.planetKey);
    if (planet) {
      // What the rules themselves say about this very sky.
      const says = ctx.skyRules.explain(sky, planet);
      return says.map((s) => rules.findIndex((r) => r.says === s)).filter((i) => i >= 0);
    }
    const out: number[] = [];
    rules.forEach((r, i) => {
      const twin = r.when.length === 2 && r.when[0] === r.when[1];
      if (twin ? sky.pieces.filter((p) => p === r.when[0]).length >= 2 : r.when.every((k) => sky.pieces.includes(k))) out.push(i);
    });
    return out;
  };
  const scanSky = () => {
    const skies = ctx.sky.snapshot().skies;
    let total = 0;
    for (const s of skies) total += s.pieces.length;
    if (hungSeen < 0) { if (!S.seeded) bump('hung', total); } else if (total > hungSeen) bump('hung', total - hungSeen);
    if (total !== hungSeen) skyDirty = true;
    hungSeen = total;
    if (!skyDirty) return;
    skyDirty = false;
    for (const s of skies) {
      if (!s.pieces.length) continue;
      top('full', s.pieces.length);
      for (const p of s.pieces) {
        const bit = 1 << SKY_PIECE_KINDS.indexOf(p);
        if (bit > 0 && !(S.pc & bit)) { S.pc |= bit; newly('k', `p${p}`, `A ${p}, hung`); }
      }
      const key = comboKey(s.pieces);
      if (!key) continue;
      const said = rulesFor(s);
      const had = S.cb[key];
      if (!had) {
        if (Object.keys(S.cb).length >= CAP.cb) continue;
        S.cb[key] = said;
        newly('k', key, 'A sky tried');
      } else if (said.some((i) => !had.includes(i))) { S.cb[key] = [...new Set([...had, ...said])]; touch(); }
    }
  };
  /** What a generated sky holds, read once per world and sky. */
  let heavKey = '';
  const scanHeavens = () => {
    const sel = ctx.selection;
    const screen = shell.current();
    if ((screen !== 'planet' && screen !== 'system') || !sel.system) return;
    const key = `${seedToHex(sel.system.seed)}:${sel.planetIndex}:${hungSeen}`;
    if (key === heavKey) return;
    heavKey = key;
    const hv = ctx.sky.heavens(sel.system, sel.planetIndex);
    for (const b of hv.bodies ?? []) {
      const kind = clip(b.kind, 16);
      if (!kind) continue;
      let list = X.hv[kind];
      if (!list) {
        if (Object.keys(X.hv).length >= 12) continue;
        list = X.hv[kind] = [];
        newly('k', `hv${kind}`, BODY_LABEL[kind] ?? cap1(kind));
      }
      const nm = clip(b.name, 32) || kind;
      if (!list.includes(nm) && list.length < 6) { list.push(nm); touch(); }
    }
    for (const s of hv.says ?? []) {
      const t = clip(s, 110);
      if (!t || X.hs.includes(t)) continue;
      X.hs.push(t);
      if (X.hs.length > CAP.says) X.hs.shift();
      touch();
    }
  };

  let counted = false;
  let began = false;
  let lastTurn = -1;
  const meet = (f: Fighter, rival: boolean) => {
    const key = `${f.fused ? 'f' : ''}${f.serialNumber}`;
    const skills = f.skills.map((s) => clip(s.name, 20)).slice(0, 6);
    const traits = f.traits.map((t) => clip(t.name, 20)).slice(0, 6);
    const form = f.form ?? 1;
    const level = f.level ?? 1;
    if (!rival) {
      // Skills your own creatures know, by element.
      const ei = Math.max(0, ELEMENTS.indexOf(f.element));
      const known = (X.sk[ei] ??= []);
      for (const s of f.skills) {
        const nm = clip(s.name, 20);
        if (nm && !known.includes(nm) && known.length < 20) { known.push(nm); newly('r', `sk${ei}:${nm}`, known.length === 1 ? `Skills of ${f.element}` : ''); }
      }
      if (f.relic?.id && !X.rs.includes(f.relic.id) && X.rs.length < 40) { X.rs.push(f.relic.id); newly('r', `rl${f.relic.id}`, f.relic.name); }
    }
    const had = S.cr[key];
    if (!had) {
      if (Object.keys(S.cr).length >= CAP.cr) return;
      S.cr[key] = [clip(f.name, 32), Math.max(0, ELEMENTS.indexOf(f.element)), rival ? 1 : 0, traits, skills, form, level];
      newly('c', key, f.name);
      return;
    }
    const allS = [...new Set([...had[4], ...skills])].slice(0, 8);
    const allT = [...new Set([...had[3], ...traits])].slice(0, 8);
    if (allS.length !== had[4].length || allT.length !== had[3].length) { had[3] = allT; had[4] = allS; touch(); }
    if (form > (had[5] ?? 1)) { had[5] = form; touch(); if (!rival) newly('c', key, `${f.name} changed form`); }
    if (level > (had[6] ?? 1)) { had[6] = level; touch(); }
  };
  const rivalRec = (id: number, name: string): RivalRec => {
    let r = X.rv[id];
    if (!r) { r = X.rv[id] = [0, 0, 0, 0]; newly('r', `rv${id}`, name); }
    return r;
  };
  /** Cheap enough for every frame: a battle can end and be dismissed between two scans. */
  const scanBattle = () => {
    const b = ctx.battle;
    if (!b) { counted = false; began = false; lastTurn = -1; return; }
    if (b.turn < lastTurn) { began = false; counted = false; }
    lastTurn = b.turn;
    if (!began) {
      began = true;
      const r = rivalRec(b.rival.id, b.rival.name);
      r[0] |= 1;
      r[2]++;
      bump('fights', 1);
    }
    if (b.outcome === 'ongoing') { counted = false; return; }
    if (counted) return;
    counted = true;
    const r = rivalRec(b.rival.id, b.rival.name);
    if (b.outcome === 'won') {
      bump('won', 1);
      r[0] |= 2;
      r[3]++;
      if (!r[1] || b.turn < r[1]) r[1] = b.turn;
    } else if (b.outcome === 'lost') { bump('lost', 1); r[0] |= 4; } else r[0] |= 8;
    const combos = b.tally?.combos ?? 0;
    bump('combos', combos);
    top('mcombo', combos);
    touch();
    for (const f of b.mine) meet(f, false);
    for (const f of b.theirs) meet(f, true);
  };
  const scanFighters = () => {
    const b = ctx.battle;
    if (!b) return;
    for (const f of b.mine) meet(f, false);
    for (const f of b.theirs) meet(f, true);
    if (b.weather) {
      const i = WEATHERS.indexOf(b.weather);
      if (i >= 0 && !(X.wt & (1 << i))) {
        X.wt |= 1 << i;
        let name: string = b.weather;
        try { name = ctx.battles.weatherInfo?.(b.weather)?.name ?? name; } catch { /* the plain word will do */ }
        newly('r', `w${i}`, `${name}, over a battle`);
      }
    }
  };

  let lightSeen = -1;
  const scanLight = () => {
    const v = ctx.light.view();
    const now = v.pips * 1000 + v.partial;
    if (lightSeen >= 0) {
      if (now > lightSeen) bump('le', now - lightSeen);
      else if (now < lightSeen) bump('ls', lightSeen - now);
    }
    lightSeen = now;
  };

  let clockSeen = Date.now();
  const scanTime = () => {
    const now = Date.now();
    const d = now - clockSeen;
    clockSeen = now;
    if (d > 0 && d < 5000 && !document.hidden) { N.ms += d; dirty = true; }
  };

  /** The ladder, the mirror and the Almanac: other units' state, looked at every five seconds. */
  const scanSlow = () => {
    safe(() => {
      const relics = relicList();
      for (const id of ladder().relics) {
        if (X.rs.includes(id) || X.rs.length >= 40) continue;
        X.rs.push(id);
        newly('r', `rl${id}`, relics.find((r) => r.id === id)?.name ?? 'A relic');
      }
    });
    safe(() => {
      const e = end();
      if (!e) return;
      const n = Math.min(FRAGMENTS.length, Math.max(0, Math.floor(num(e.fragments))));
      if (X.fg < 0) { X.fg = n; touch(); return; }
      for (let i = X.fg; i < n; i++) newly('x', `f${i}`, 'A piece of the answer');
      if (n !== X.fg) { X.fg = n; touch(); }
    });
    safe(() => {
      const a = (window as unknown as { __sallowAlmanac?: { omenOn?(ms: number): { id?: string; name?: string; line?: string } } }).__sallowAlmanac;
      const today = alm().omen;
      if (!a?.omenOn || !today || X.om[today]) return;
      const o = a.omenOn(Date.now());
      if (!o || o.id !== today || !o.name || Object.keys(X.om).length >= 60) return;
      X.om[today] = [clip(o.name, 32), clip(o.line, 140)];
      newly('a', `o${today}`, o.name);
    });
    safe(scanHeavens);
  };

  // ---------- deeds: judging, toasts, claiming ----------
  const rivalSerials = (): number[] => {
    try { return [...new Set(ctx.battles.rivals().flatMap((r) => [...r.serials]))]; } catch { return []; }
  };
  const judge = (): Q => {
    const us = Object.values(S.u);
    const laws = new Set(us.map((r) => r[3]).filter((i) => i >= 0));
    const ws = Object.values(S.w);
    const crs = Object.values(S.cr);
    let creedMask = 0;
    for (const w of ws) creedMask |= w.c;
    let creeds = 0;
    for (let i = 1; i < BELIEFS.length; i++) if (creedMask & (1 << i)) creeds++;
    let pk = 0;
    for (let i = 0; i < SKY_PIECE_KINDS.length; i++) if (S.pc & (1 << i)) pk++;
    const said = new Set<number>();
    for (const v of Object.values(S.cb)) for (const i of v) said.add(i);
    let mats = 0;
    let matFull = false;
    for (const [li, ids] of Object.entries(S.m)) {
      mats += ids.length;
      const ls = lawSets()[Number(li)];
      if (ls && ls.materials.filter((m) => m.id !== 0).every((m) => ids.includes(m.id))) matFull = true;
    }
    const rivals = rivalList();
    // Character: what the universes you know are like.
    const held = heldMap();
    let rar = 0;
    let bond = 0;
    const tempers = new Set<string>();
    const traitIds = new Set<string>();
    for (const k of Object.keys(S.u)) {
      const spec = specOf(Number(k));
      if (!spec) continue;
      rar = Math.max(rar, RARITIES.indexOf(spec.rarity ?? 'common'));
      if (spec.temperament) tempers.add(spec.temperament);
      for (const t of spec.traits ?? []) traitIds.add(t.id);
    }
    for (const [, hv] of held) {
      const lin = hv.stats.lineage;
      if (lin?.rarity) rar = Math.max(rar, RARITIES.indexOf(lin.rarity));
      for (const t of lin?.gifts ?? []) traitIds.add(t.id);
      if (lin?.mutation) traitIds.add(lin.mutation.id);
      try { bond = Math.max(bond, ctx.box.bond?.(hv.slot) ?? ctx.box.bondOf?.(hv.stats) ?? 0); } catch { /* no bond kept */ }
    }
    // Strata.
    let strataFull = 0;
    let crossed = 0;
    const motions = new Set<string>();
    for (const [k, list] of Object.entries(X.sx)) {
      const all = strataOf(Number(k));
      let n = 0;
      list.forEach((m, i) => { if ((m ?? 0) & 1) { n++; const mo = all[i]?.motion; if (mo) motions.add(mo); } });
      crossed += n;
      if (all.length > 0 && n >= all.length) strataFull++;
    }
    // Peoples.
    let creedN = 0;
    let rulers = 0;
    let heretics = 0;
    let age = 0;
    let tribute = false;
    const workKinds = new Set<string>();
    const inventKinds = new Set<string>();
    for (const w of ws) {
      creedN += w.k?.length ?? 0;
      for (const f of w.f ?? []) { if (f[1] === 'heretic') heretics++; else rulers++; }
      age = Math.max(age, w.a ?? w.e);
      for (const x of w.wk ?? []) workKinds.add(x);
      for (const x of w.iv ?? []) inventKinds.add(x);
      if ((w.wa ?? []).some((x) => /tribute|bent the knee|carts of/.test(x[1]))) tribute = true;
    }
    // Rivals.
    let rivalsBeat = 0;
    let bossBeat = 0;
    let champ = false;
    let quick = 0;
    const personas = new Set<string>();
    for (const r of rivals) {
      const rec = X.rv[r.id];
      if (!rec) continue;
      if (rec[0] & 1 && r.persona) personas.add(r.persona);
      if (rec[0] & 2) { rivalsBeat++; if (r.boss) bossBeat++; if (r.boss === 'champion') champ = true; if (rec[1] && (!quick || rec[1] < quick)) quick = rec[1]; }
    }
    let skills = 0;
    let skillFull = false;
    ELEMENTS.forEach((el, i) => {
      const known = X.sk[i]?.length ?? 0;
      skills += known;
      let all = 0;
      try { all = ctx.battles.skillsOf?.(el).length ?? 0; } catch { all = 0; }
      if (all > 0 && known >= all) skillFull = true;
    });
    const relicTotal = relicList().length;
    const e = end();
    const a = alm();
    return {
      uni: us.length, held: ctx.box.count(), laws: laws.size, lawTotal: Math.max(1, lawSets().length),
      dived10: us.filter((r) => r[0] >= 10).length, floors: us.filter((r) => r[2] & 4).length,
      kinds: new Set(S.st.map((s) => s[2])).size, hot: S.st.some((s) => s[3] > 230), cold: S.st.some((s) => s[3] < 30), pulsar: S.st.some((s) => s[2] === 3), starN: S.st.length,
      worlds: ws.length, biomes: new Set(ws.map((w) => w.b)).size, era: ws.reduce((n, w) => Math.max(n, w.e), 0), creeds,
      people: ws.reduce((n, w) => n + w.p.length, 0), deeds3: ws.some((w) => w.p.some((p) => p[2].length >= 3)), towns: ws.reduce((n, w) => Math.max(n, w.v), 0),
      pk, combos: Object.keys(S.cb).length, says: said.size, sayTotal: ctx.skyRules.rules.length,
      mats, matFull, met: crs.filter((c) => c[2] === 1).length, mine: crs.filter((c) => c[2] === 0).length, elements: new Set(crs.map((c) => c[1])).size,
      rivalsAll: rivals.length > 0 && ctx.rivalsBeaten.size >= rivals.length,
      unlocked: Object.keys(S.a).length, n: N,
      rar, tempers: tempers.size, traitN: traitIds.size, made: us.filter((r) => r[2] & 16).length, bond,
      strata: crossed, strataFull, motions: motions.size, thingKinds: bits(X.fk),
      creedN, rulers, heretics, workKinds: workKinds.size, inventKinds: inventKinds.size, age, tribute,
      rivalsBeat, bossBeat, champ, personas: personas.size, quick, relics: X.rs.length, relicTotal,
      form: crs.reduce((n, c) => (c[2] ? n : Math.max(n, c[5] ?? 1)), 1), skills, skillFull, weathers: bits(X.wt),
      frags: e ? num(e.fragments) : 0, talks: e ? num(e.talks) : 0, layer: e ? topLayer(e) : 0, wakes: e ? num(e.level) : 0, boons: e ? arr(e.boons).length : 0,
      left: e ? arr(e.left).length : 0, lamps: e ? num(e.lamps) : 0,
      omens: Object.keys(X.om).length, feasts: a.feasts.length, haps: a.haps.length, astreak: Math.max(a.best, a.streak),
      bodyKinds: Object.keys(X.hv).length, heard: X.hs.length, matLaws: Object.values(S.m).filter((ids) => ids.length > 0).length, cp: X.cp, tabs: bits(X.tb),
    };
  };
  const deedQ: Deed[] = [];
  const check = () => {
    const q = judge();
    for (const d of DEEDS) {
      if (S.a[d.id]) continue;
      let ok = false;
      try { ok = d.ok(q); } catch { ok = false; }
      if (!ok) continue;
      S.a[d.id] = 1;
      q.unlocked++;
      dirty = true;
      deedQ.push(d);
    }
  };
  const claim = (d: Deed): string | null => {
    if (S.a[d.id] !== 1) return null;
    const r = rewardOf(DEEDS.indexOf(d), d);
    let got = rewardText(r);
    if ('glow' in r) {
      // A full lamp takes no more: the reward comes as a piece for a sky instead.
      const piece = SKY_PIECE_KINDS[DEEDS.indexOf(d) % SKY_PIECE_KINDS.length] ?? 'dust';
      if (ctx.light.view().pips >= LIGHT_MAX_PIPS) { ctx.sky.grant(piece, 1); got = `${pieceCount(piece, 1)}, because Mote is full`; }
      else ctx.light.addGlow(r.glow);
    } else ctx.sky.grant(r.piece, r.count);
    S.a[d.id] = 2;
    N.claimed++;
    touch();
    save();
    safe(() => ctx.persist());
    return got;
  };

  // ---------- notices: one at a time, merged, and never over another card ----------
  let lastToast = -1e9;
  const overlayUp = (): boolean => {
    if (shell.menu.isOpen()) return true;
    if (document.querySelector('.guide .guide-card.on, .away, .away-note, .hub-toast')) return true;
    const c = document.querySelector<HTMLElement>('[data-id=campaign-card]');
    return !!c && !c.hidden && c.offsetParent !== null;
  };
  const pump = () => {
    if (!deedQ.length && !pendingN) return;
    const now = Date.now();
    if (now - lastToast < 12000 || overlayUp()) return;
    lastToast = now;
    const n = pendingN;
    const label = pendingLabel.replace(/\.$/, '');
    pendingN = 0;
    pendingLabel = '';
    const entries = n === 1 ? `New in the Codex: ${label}.` : n > 1 ? `${n} new entries in the Codex.` : '';
    if (deedQ.length) {
      // Deeds and entries that arrived together are one notice.
      const all = deedQ.splice(0, deedQ.length);
      const d = all.reduce((a, b) => (rarityOf(b) > rarityOf(a) ? b : a));
      if (all.length === 1) shell.toast(`${d.name}. ${d.desc}${entries ? ` ${entries}` : ''}`, { title: `Deed · ${d.tier}` });
      else shell.toast(`${all.length} deeds done. The rarest: ${d.name}.${entries ? ` ${entries}` : ''}`, { title: 'Deeds' });
      return;
    }
    shell.toast(n === 1 ? `${label}.` : `${n} new entries. The last: ${label}.`, { title: n === 1 ? 'Codex · new entry' : 'Codex', sfx: '' });
  };

  // ---------- the loop ----------
  let turn = 0;
  let checkWait = 0;
  const scan = () => {
    safe(scanTime);
    safe(scanLight);
    safe(scanBox);
    safe(scanDive);
    safe(scanStar);
    safe(scanWorld);
    safe(scanSky);
    safe(scanFighters);
    if (turn++ % 12 === 0) scanSlow();
    booted = true;
    if (!S.seeded) { S.seeded = true; touch(); }
    if (X.v < 2) { X.v = 2; touch(); }
    quiet = false;
    if ((changed && checkWait <= 0) || N.ms % 20000 < 500) { changed = false; checkWait = 3; safe(check); }
    checkWait--;
  };
  let acc = 0;
  let saveWait = 0;
  shell.onFrame((dt) => {
    safe(scanBattle);
    acc += dt;
    saveWait += dt;
    if (acc >= 400) { acc = 0; scan(); safe(pump); }
    if (saveWait >= 4000) { saveWait = 0; safe(save); }
  });
  shell.onNavigate((_from, to) => {
    safe(() => {
      if (to === 'mirror') {
        bump('mir', 1);
        const u = ctx.selection.universe ?? ctx.dive.view().universe;
        const r = u ? uni(u.serialNumber) : null;
        if (r) flag(r, 12);
        if (N.mir === 1) newly('x', 'mirror', 'The room at the bottom');
      }
    });
    scan();
    safe(save);
  });
  safe(() => ctx.bus.on('sky:changed', () => { skyDirty = true; }));
  safe(() => ctx.bus.on('box:changed', () => { changed = true; }));
  const flush = () => { safe(scanTime); safe(save); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else clockSeen = Date.now(); });

  // ---------- codex pages (data) ----------
  const swatch = (spec: UniverseSpec) => {
    const row = h('div', 'cx-swatch');
    for (const c of spec.palette) { const i = h('i'); i.style.background = c; row.append(i); }
    return row;
  };
  const modsText = (t: UniverseTrait) => Object.entries(t.mods ?? {}).filter(([, v]) => typeof v === 'number' && v !== 0).map(([k, v]) => `${MOD_WORD[k] ?? k} ${(v as number) > 0 ? '+' : ''}${v as number}`).join(' · ');

  const tabUniverses = (): Built => {
    const rows = Object.entries(S.u).sort((a, b) => (b[1][2] & 1) - (a[1][2] & 1) || b[1][0] - a[1][0]);
    const held = heldMap();
    const e: Entry[] = rows.map(([k, r]) => {
      const serial = Number(k);
      const spec = specOf(serial);
      const hv = held.get(serial);
      const lin = hv ? lineageOf(hv.slot, hv.stats) : null;
      const rarity = lin?.rarity ?? spec?.rarity ?? '';
      const state = hv ? 'In the Box' : r[2] & 1 ? 'Let go' : 'Visited';
      return {
        k, name: displayName(serial, spec?.name ?? 'Unnamed'), sub: [formatSerial(serial), state, rarity, spec?.temperament ?? ''].filter(Boolean).join(' · '),
        say: spec?.motto ?? undefined, chips: spec?.laws.tags, n: r[0], fresh: isNew('u', serial),
        lines: [`Deepest fold ${fmt(r[0])} · worlds tended ${fmt(r[1])}${r[2] & 4 ? ' · floor reached' : ''}${r[2] & 16 ? ' · made' : ''}`],
        pre: () => h('span', 'cx-glyph', spec ? glyphChar(spec.glyph) : '?'),
        detail: () => {
          const out: Node[] = [];
          if (spec) out.push(swatch(spec), tags(spec.laws.tags));
          out.push(line(`${formatSerial(serial)} · ${state} · under ${spec?.laws.name ?? 'unknown laws'}`));
          let char: { rarity?: string; traits?: readonly UniverseTrait[]; title?: string } | null = null;
          try { char = spec ? ctx.merger.character?.(spec, lin) ?? null : null; } catch { char = null; }
          const rar = char?.rarity ?? rarity;
          if (rar || spec?.temperament) out.push(section('Character', [rar, spec?.temperament].filter(Boolean).join(' · ')));
          if (char?.title) out.push(line(char.title));
          if (spec?.motto) out.push(say(`“${spec.motto}”`));
          if (spec?.description) out.push(line(spec.description.split(spec.name).join(displayName(spec))));
          if (spec?.origin) out.push(block('Origin', line(spec.origin)));
          const traits = char?.traits ?? spec?.traits ?? [];
          if (traits.length) out.push(section('Traits', `${traits.length}`));
          for (const t of traits) out.push(block(`${t.name}${t.source && t.source !== 'own' ? ` · ${t.source}` : ''}`, say(t.says), modsText(t) ? line(modsText(t)) : null));
          if (lin) {
            out.push(section('Lineage', `generation ${lin.generation}`));
            let told: string[] = [];
            try { told = ctx.merger.describeLineage?.(lin) ?? []; } catch { told = []; }
            if (!told.length) told = [`Made from ${lin.parents.map((p) => p.name).join(' and ')}${lin.piece ? `, under ${aPiece(lin.piece)}` : ''}.`, ...(lin.says ? [lin.says] : [])];
            for (const t of told) out.push(line(t));
            if (lin.recipe) out.push(block(lin.recipe.name, say(lin.recipe.says)));
          }
          if (hv) {
            let bond = -1;
            let word = '';
            try { bond = ctx.box.bond?.(hv.slot) ?? -1; word = bond >= 0 ? ctx.box.bondName?.(bond) ?? '' : ''; } catch { bond = -1; }
            if (bond >= 0) out.push(section('Bond', `${word ? `${word} · ` : ''}${bond} of 100`), barOf(bond));
            const s = hv.stats;
            out.push(section('What it has been through', ''),
              line(`Deepest fold ${fmt(r[0])} · worlds tended ${fmt(r[1])} · floors reached ${fmt(s.floorsReached ?? (r[2] & 4 ? 1 : 0))}`),
              line(`Battles ${fmt(s.battles ?? 0)}, won ${fmt(s.battlesWon ?? 0)} · sky pieces hung ${fmt(s.piecesHung ?? 0)} · souls last seen ${fmt(s.souls ?? 0)}`));
          } else out.push(line(`Deepest fold ${fmt(r[0])} · worlds tended ${fmt(r[1])}. It is not in the Box now.`));
          return out;
        },
      };
    });
    const empty = Math.max(0, BOX_SLOTS - held.size);
    if (empty > 0) e.push(unknown(`${empty} slot${empty > 1 ? 's' : ''} of the Box lie empty. Flickers in the folds can be caught with a reliquary.`));
    return { known: rows.length, total: Math.max(BOX_SLOTS, rows.length), g: [{ e }] };
  };

  const thingsIn = (m: number): string[] => {
    const out: string[] = [];
    if (m & 256) out.push('stars');
    if (m & 512) out.push('flickers');
    FT.forEach((_, i) => { if (m & (2 << i)) out.push((FT_NAME[i] ?? '').toLowerCase()); });
    return out;
  };
  const tabStrata = (): Built => {
    const floors = Object.values(S.u).filter((r) => r[2] & 4).length;
    const marks: [boolean, string, string][] = MILESTONES.map((m) => [N.deep >= m, `Fold ${m}`, `Deeper than you have fallen. Fold ${m > 99 ? '???' : m} waits.`]);
    marks.push([floors > 0 || N.mir > 0, 'The floor', 'Every universe has a bottom. Keep falling in one.'], [N.mir > 0, 'The room at the bottom', 'Someone keeps a box down there.']);
    const got = marks.filter((m) => m[0]).length;
    const g: Group[] = [];
    // Universes dived, with every stratum of each.
    const rows = Object.entries(S.u).filter(([, r]) => r[0] > 0 || r[2] & 12).sort((a, b) => b[1][0] - a[1][0]);
    let crossedAll = 0;
    let strataAll = 0;
    const per: Entry[] = rows.map(([k, r]) => {
      const serial = Number(k);
      const all = strataOf(serial);
      const list = X.sx[k] ?? [];
      const crossed = all.filter((_, i) => (list[i] ?? 0) & 1).length;
      crossedAll += crossed;
      strataAll += all.length;
      const names = all.filter((_, i) => (list[i] ?? 0) & 1).map((s) => s.name);
      return {
        k, name: uniName(serial), sub: `fold ${fmt(r[0])}${all.length ? ` · ${crossed} of ${all.length} strata` : ''}`, n: r[0],
        lines: [names.length ? `Crossed: ${names.join(', ')}.` : r[2] & 12 ? (r[2] & 8 ? 'You stood on its floor, in their room.' : 'You reached its floor.') : 'Its strata have not been named to you yet.'],
        detail: () => {
          const out: Node[] = [line(`Deepest fold ${fmt(r[0])}.${r[2] & 8 ? ' You stood on its floor, in their room.' : r[2] & 4 ? ' You reached its floor.' : ''}`)];
          if (!all.length) out.push(say('This universe keeps no named strata.'));
          all.forEach((s, i) => {
            const m = list[i] ?? 0;
            if (!(m & 1)) { out.push(h('div', 'cx-card cx-unknown', null, h('b', 'cx-name', '▒▒▒▒▒▒'), say(`A stratum below fold ${fmt(s.from)}. Fall further.`))); return; }
            const found = thingsIn(m);
            out.push(h('div', 'cx-card', null, h('b', 'cx-name', s.name),
              h('small', 'cx-sub', `from fold ${fmt(s.from)} · ${s.motion}`), say(s.line),
              line(`${MOTION_SAY[s.motion] ?? ''} ${found.length ? `Found there: ${found.join(', ')}.` : 'Nothing was found there yet.'}`.trim())));
          });
          return out;
        },
      };
    });
    if (!per.length) per.push(unknown('Open a universe and hold to fall.'));
    g.push({ title: 'Universes fallen into', count: strataAll ? `${crossedAll} of ${strataAll} strata` : `${rows.length}`, e: per });
    const things: Entry[] = FT.map((_, i) => (X.fk & (1 << i)
      ? { k: `ft${i}`, name: FT_NAME[i] ?? '', say: FT_SAY[i] ?? '', fresh: isNew('d', `ft${i}`) }
      : unknown(FT_HINT[i] ?? '', '▒▒▒')));
    g.push({ title: 'Met in the folds', count: `${bits(X.fk)} of ${FT.length}`, tiles: true, e: things });
    g.push({ title: 'Taken, slipped, missed', e: [
      { k: 'haul', name: 'From the folds', slim: true, sub: `${plural(N.picks, 'thing')} taken · ${plural(N.echoes, 'echo', 'echoes')} read` },
      { k: 'haz', name: 'Hazards', slim: true, sub: `${fmt(N.hit)} met · ${fmt(N.dodged)} slipped` },
      { k: 'flk', name: 'Flickers', slim: true, sub: `${fmt(N.seen)} seen · ${fmt(N.caught)} caught · ${fmt(N.missed)} fallen past` },
      { k: 'run', name: 'Longest unbroken fall', slim: true, sub: plural(N.streak, 'fold') },
    ] });
    const echoes: Entry[] = [...X.ec].reverse().map((t, i) => ({ k: `e${i}`, name: 'An echo', say: t.replace(/^An echo[^:]*: ?/, '') || t, sub: (/^An echo([^:]*):/.exec(t)?.[1] ?? '').replace(/^,? ?/, '').trim() || 'from the folds' }));
    if (!echoes.length) echoes.push(unknown('Something speaks, further down. Fall into it.'));
    g.push({ title: 'Echoes read', count: `${X.ec.length}`, e: echoes });
    g.push({ title: 'Depths', count: `${got} of ${marks.length}`, e: marks.map(([ok, name, hint]) => (ok ? { k: name, name, sub: 'reached', slim: true } : unknown(hint))) });
    return { known: got + bits(X.fk) + crossedAll, total: marks.length + FT.length + Math.max(strataAll, crossedAll), g };
  };

  const lawSentence = (li: number): string => {
    const l = lawSets()[li];
    if (!l) return '';
    const beat = l.pulseMilliHz < 600 ? 'Time beats slowly here' : l.pulseMilliHz < 1500 ? 'Time keeps an even beat here' : 'Time runs quick here';
    const r = l.reactions.find((x) => x.b !== '*' && x.becomesA !== x.a) ?? l.reactions.find((x) => x.becomesA !== x.a);
    if (!r) return `${beat}, and nothing changes what it touches.`;
    const into = r.becomesA === 'empty' ? 'is gone' : `turns to ${r.becomesA}`;
    return r.b === '*' ? `${beat}, and ${r.a} ${into} on its own.` : `${beat}, and where ${r.a} meets ${r.b} it ${into}.`;
  };
  /** Every law set the atlas holds, whatever it holds: nothing here names one. */
  const tabLaws = (): Built => {
    const carriers = new Map<number, number[]>();
    for (const [k, r] of Object.entries(S.u)) { if (r[3] < 0) continue; const a = carriers.get(r[3]) ?? []; a.push(Number(k)); carriers.set(r[3], a); }
    const e: Entry[] = [];
    const un: Entry[] = [];
    lawSets().forEach((l, i) => {
      const who = carriers.get(i);
      if (!who) { un.push(unknown(`A way of being not yet met. ${plural(l.tags.length, 'mark')}, ${l.materials.length - 1} materials. Catch more universes; each is born under one.`)); return; }
      const seen = S.m[i] ?? [];
      e.push({
        k: l.id, name: l.name, chips: l.tags, say: lawSentence(i), n: who.length, fresh: isNew('l', i),
        sub: `${plural(l.materials.length - 1, 'material')} · ${plural(l.reactions.length, 'reaction')}`,
        lines: [`Carried by ${who.slice(0, 6).map(uniName).join(', ')}${who.length > 6 ? ` and ${who.length - 6} more` : ''}.`],
        detail: () => {
          const out: Node[] = [tags(l.tags), say(lawSentence(i)),
            line(`Pulse ${(l.pulseMilliHz / 1000).toFixed(2)} beats a second. ${plural(l.materials.length - 1, 'material')}, ${seen.filter((id) => l.materials.some((m) => m.id === id)).length} seen on the ground.`),
            line(`Carried by ${who.map(uniName).join(', ')}.`)];
          const kinds = new Map<string, string[]>();
          for (const m of l.materials) { if (m.id === 0) continue; const a = kinds.get(m.kind) ?? []; a.push(seen.includes(m.id) ? m.name : '▒▒▒'); kinds.set(m.kind, a); }
          out.push(section('What it is made of', `${l.materials.length - 1}`));
          for (const [kind, names] of kinds) out.push(line(`${cap1(kind)}: ${names.join(', ')}.`));
          // A reaction is told only once both things in it have been seen.
          const known = new Set(l.materials.filter((m) => m.id === 0 || seen.includes(m.id)).map((m) => m.name));
          const told = l.reactions.filter((r) => known.has(r.a) && (r.b === '*' || known.has(r.b)));
          out.push(section('What happens here', `${told.length} of ${l.reactions.length}`));
          for (const r of told.slice(0, 40)) {
            const into = r.becomesA === r.a ? 'stays' : r.becomesA === 'empty' ? 'is gone' : `becomes ${r.becomesA}`;
            const other = r.b === '*' || r.becomesB === r.b ? '' : r.becomesB === 'empty' ? `, and the ${r.b} is gone` : `, and the ${r.b} becomes ${r.becomesB}`;
            const need = r.needs ? ` Only under ${r.needs.min !== undefined ? 'enough' : 'little'} ${r.needs.key}.` : '';
            out.push(line(`${cap1(r.a)}${r.b === '*' ? '' : ` beside ${r.b}`} ${into}${other}.${need}`));
          }
          if (told.length < l.reactions.length) out.push(say('The rest wait for materials you have not watched.'));
          return out;
        },
      });
    });
    return { known: e.length, total: lawSets().length, g: [{ e: [...e, ...un] }] };
  };

  const tabStars = (): Built => {
    const kinds = new Set(S.st.map((s) => s[2]));
    const kindE: Entry[] = STAR_KINDS.map((_, i) => (kinds.has(i)
      ? { k: `kind${i}`, name: STAR_WORD[i] ?? 'A star', sub: `${S.st.filter((s) => s[2] === i).length} visited`, slim: true, n: S.st.filter((s) => s[2] === i).length }
      : unknown(STAR_HINT[i] ?? '')));
    const sys: Entry[] = [];
    for (let i = S.st.length - 1; i >= 0; i--) {
      const s = S.st[i];
      if (!s) continue;
      sys.push({ k: s[0], name: s[5] || 'Unnamed', sub: `${STAR_KINDS[s[2]] ?? 'star'} · heat ${s[3]} · ${plural(s[4], 'world')}`, say: `${STAR_WORD[s[2]] ?? 'A star'}, ${heatWord(s[3])}, in ${uniName(s[1])}.`, n: s[3], fresh: isNew('s', s[0]) });
    }
    if (!sys.length) sys.push(unknown('Hold to fall. Let go near a star to stop there.'));
    return { known: kinds.size, total: STAR_KINDS.length, g: [{ title: 'Kinds of sun', count: `${kinds.size} of ${STAR_KINDS.length}`, e: kindE }, { title: 'Systems visited', count: `${S.st.length}`, e: sys }] };
  };

  const tabWorlds = (): Built => {
    const ws = Object.entries(S.w).reverse();
    const seen = new Set(ws.map(([, w]) => w.b));
    const e: Entry[] = ws.map(([key, w]) => {
      const creeds = BELIEFS.filter((_, i) => i > 0 && w.c & (1 << i));
      const age = Math.max(w.e, w.a ?? 0);
      const eras = `Eras: ${ALL_ERAS.slice(0, Math.min(ALL_ERAS.length, age + 1)).join(', ')}`;
      return {
        k: key, name: w.n || 'Unnamed', sub: `${BIOMES[w.b] ?? 'world'} · ${uniName(w.u)}`, n: w.s, fresh: isNew('w', key),
        lines: [`Peak souls ${fmt(w.s)} · most villages ${w.v}`, eras, creeds.length ? `Beliefs: ${creeds.join(', ')}` : 'No belief seen yet.', w.p.length ? `Named: ${w.p.map((p) => p[0]).join(', ')}.` : ''].filter(Boolean),
        detail: () => {
          const out: Node[] = [say(BIOME_HINT[w.b] ?? ''), line(`${cap1(BIOMES[w.b] ?? 'world')}, in ${uniName(w.u)}.`), line(`Peak souls ${fmt(w.s)} · most villages ${w.v}`), line(eras),
            line(creeds.length ? `Beliefs: ${creeds.join(', ')}` : 'No belief seen yet.')];
          out.push(section('People followed by name', `${w.p.length}`));
          if (!w.p.length) out.push(say('No one here has been named to you yet. Watch longer.'));
          for (const p of w.p) out.push(block(`${p[0]}, ${p[1] || 'one of them'}`, ...(p[2].length ? p[2].map((d) => say(d)) : [say('Nothing is told of them yet.')])));
          return out;
        },
      };
    });
    if (!ws.length) e.push(unknown('Stop at a star, choose a world, and watch it.'));
    BIOMES.forEach((b, i) => { if (!seen.has(i)) e.push(unknown(`${BIOME_HINT[i]} Look around other stars.`, `▒▒▒ ${'▒'.repeat(b.length)}`)); });
    return { known: seen.size, total: BIOMES.length, g: [{ e }] };
  };

  const tabPeoples = (): Built => {
    const ws = Object.entries(S.w).reverse();
    let ageMax = -1;
    let beliefMask = 0;
    const works = new Set<string>();
    const e: Entry[] = [];
    for (const [key, w] of ws) {
      const age = Math.max(w.e, w.a ?? 0);
      if (w.s > 0 || w.v > 0) ageMax = Math.max(ageMax, age);
      beliefMask |= w.c;
      for (const k of w.k ?? []) if (k[1] > 0) beliefMask |= 1 << k[1];
      for (const x of w.wk ?? []) works.add(x);
      const counts: [number, string, string?][] = [[w.k?.length ?? 0, 'creed'], [w.f?.length ?? 0, 'named figure'], [w.wa?.length ?? 0, 'war'], [w.pg?.length ?? 0, 'sickness', 'sicknesses'], [w.wk?.length ?? 0, 'great work'], [w.iv?.length ?? 0, 'invention'], [w.ak ?? 0, 'ship gone', 'ships gone']];
      const total = counts.reduce((n, c) => n + c[0], 0);
      if (!total && age < 1) continue;
      const have = counts.filter((c) => c[0] > 0).map((c) => plural(c[0], c[1], c[2]));
      e.push({
        k: key, name: w.n || 'Unnamed', sub: `the age of ${ALL_ERAS[age] ?? 'huts'} · ${uniName(w.u)}`, n: total,
        lines: [have.length ? `${have.join(' · ')}.` : 'They are few yet, and nothing is written of them.'],
        detail: () => {
          const out: Node[] = [line(`${cap1(BIOMES[w.b] ?? 'world')}, in ${uniName(w.u)}. Peak souls ${fmt(w.s)}.`), section('Ages reached', `${age + 1} of ${ALL_ERAS.length}`), line(ALL_ERAS.slice(0, age + 1).join(', '))];
          const creeds = w.k ?? [];
          out.push(section('Creeds', `${creeds.length}`));
          if (!creeds.length) out.push(say('No creed has been named here yet.'));
          for (const c of creeds) {
            out.push(block(cap1(c[0]), line(`${c[1] > 0 ? `They pray to the ${BELIEFS[c[1]]}. ` : ''}${c[2] ? `${c[2]} was its first voice.` : 'No one wrote down who spoke first.'}`),
              line(c[4].length ? `Kept in ${c[4].join(', ')}${c[3] > c[4].length ? `, and ${c[3]} villages at its widest` : ''}.` : c[3] > 0 ? `Kept by ${plural(c[3], 'village')} at its widest.` : 'It has not spread.')));
          }
          for (const s of w.sc ?? []) out.push(block('Schism', say(s)));
          const figs = w.f ?? [];
          out.push(section('Rulers and other named figures', `${figs.length + w.p.length}`));
          if (!figs.length && !w.p.length) out.push(say('No one has risen above the rest.'));
          for (const f of figs) out.push(block(`${f[0]}, ${f[1]}`, say(f[2] || (f[1] === 'heretic' ? 'Still preaching, when you last looked.' : 'Still on the high seat, when you last looked.'))));
          for (const p of w.p) out.push(block(`${p[0]}, ${p[1] || 'one of them'}`, say(p[2][p[2].length - 1] ?? 'Nothing is told of them yet.')));
          const wars = w.wa ?? [];
          out.push(section('Wars', `${wars.length}`));
          if (!wars.length) out.push(say('No war seen.'));
          for (const x of wars) out.push(block(x[0], say(x[1] || 'It had not ended when you last looked.')));
          const pg = w.pg ?? [];
          if (pg.length) out.push(section('Sickness', `${pg.length}`));
          for (const x of pg) out.push(block(x[0], say(x[1] || 'It had not left when you last looked.')));
          const wk = w.wk ?? [];
          out.push(section('Great works', `${wk.length}`));
          if (!wk.length) out.push(say('Nothing built to outlast them yet.'));
          for (const x of wk) out.push(block(x, say(WORK_SAYS[x] ?? 'It stands.')));
          const iv = w.iv ?? [];
          if (iv.length) out.push(section('Inventions', `${iv.length}`), line(`${cap1(iv.join(', '))}.`));
          if (w.ak) out.push(section('Colony ships', `${w.ak}`), say(w.ak === 1 ? 'A ship left for good. They will not return.' : `${w.ak} ships left for good.`));
          return out;
        },
      });
    }
    if (!e.length) e.push(unknown('Watch a world long enough and its people begin to do things to each other.'));
    const g: Group[] = [{ title: 'Worlds and their peoples', count: `${e.filter((x) => !x.un).length}`, e }];
    g.push({ title: 'Ages', count: `${Math.max(0, ageMax + 1)} of ${ALL_ERAS.length}`, tiles: true, e: ALL_ERAS.map((name, i) => (i <= ageMax ? { k: `era${i}`, name, say: ERA_HINT[i] ?? '' } : unknown(i > 5 ? 'An age past the stars.' : 'An age not yet reached.', '▒▒▒'))) });
    const allWorks = [...new Set([...WORK_NAMES, ...works])];
    g.push({ title: 'Great works', count: `${works.size} of ${allWorks.length}`, tiles: true, e: allWorks.map((name) => (works.has(name) ? { k: name, name, say: WORK_SAYS[name] ?? 'It stands.' } : unknown('Something built to outlast its builders.', '▒▒▒'))) });
    let beliefs = 0;
    for (let i = 1; i < BELIEFS.length; i++) if (beliefMask & (1 << i)) beliefs++;
    g.push({ title: 'Lifetime', e: [
      { k: 'wars', name: 'Wars', slim: true, sub: `${fmt(N.wars)} begun · ${fmt(N.peace)} ended in peace · ${fmt(N.razed)} ended in ruin` },
      { k: 'pl', name: 'Sickness', slim: true, sub: `${fmt(N.plagues)} came · ${fmt(N.cured)} left` },
      { k: 'cr', name: 'High seats', slim: true, sub: `${fmt(N.crowns)} taken · ${fmt(N.fallen)} lost` },
      { k: 'bf', name: 'Beliefs', slim: true, sub: `${beliefs} of ${BELIEFS.length - 1} · ${fmt(N.schisms)} schisms` },
    ] });
    return { known: Math.max(0, ageMax + 1) + works.size + beliefs, total: ALL_ERAS.length + allWorks.length + BELIEFS.length - 1, g };
  };

  const pieceNames = (key: string) => key.split('').map((c) => SKY_PIECE_KINDS[Number(c)] ?? '?');
  const tabSkies = (): Built => {
    const rules = ctx.skyRules.rules;
    const said = new Set<number>();
    for (const v of Object.values(S.cb)) for (const i of v) said.add(i);
    let pk = 0;
    const pieces: Entry[] = SKY_PIECE_KINDS.map((k, i) => {
      const got = !!(S.pc & (1 << i));
      if (got) pk++;
      return got ? { k: `p${k}`, name: k, say: PIECE_SAYS[k], fresh: isNew('k', `p${k}`) } : unknown('Not yet hung.', '▒▒▒');
    });
    const ruleE: Entry[] = rules.map((r, i) => (said.has(i)
      ? { k: r.id, name: r.when.join(' + '), say: r.says, slim: false }
      : unknown(r.when.length > 1 ? (r.when[0] === r.when[1] ? 'Two of the same piece, hung together.' : 'Two different pieces, hung together.') : 'One piece, hung alone.', r.when.map(() => '▒▒▒').join(' + '))));
    const combos = Object.entries(S.cb).reverse();
    const comboE: Entry[] = combos.map(([key, idx]) => ({ k: key, name: pieceNames(key).join(' + '), n: idx.length, fresh: isNew('k', key), lines: idx.length ? idx.map((i) => rules[i]?.says ?? '') : ['The sky said nothing.'] }));
    if (!combos.length) comboE.push(unknown('Drag a sky piece onto a world’s orbit.'));
    const bodies: Entry[] = Object.entries(X.hv).map(([kind, names]) => ({ k: `hv${kind}`, name: BODY_LABEL[kind] ?? cap1(kind), say: BODY_SAY[kind] ?? 'It crosses the sky.', n: names.length, fresh: isNew('k', `hv${kind}`), lines: [`Seen: ${names.join(', ')}.`] }));
    if (!bodies.length) bodies.push(unknown('Watch a world. Its sky is not empty even before you touch it.'));
    const heard: Entry[] = [...X.hs].reverse().map((t, i) => ({ k: `hs${i}`, name: 'Overhead', say: t }));
    const g: Group[] = [
      { title: 'Pieces hung', count: `${pk} of ${SKY_PIECE_KINDS.length}`, tiles: true, e: pieces },
      { title: 'What the sky rules said', count: `${said.size} of ${rules.length}`, e: ruleE },
      { title: 'Skies tried', count: `${combos.length}`, e: comboE },
      { title: 'Seen in the skies you were given', count: `${plural(Object.keys(X.hv).length, 'kind')}`, e: bodies },
    ];
    if (heard.length) g.push({ title: 'What was said of them', count: `${heard.length}`, e: heard });
    return { known: said.size + pk, total: rules.length + SKY_PIECE_KINDS.length, g };
  };

  const tabCreatures = (): Built => {
    const all = Object.entries(S.cr).reverse();
    const card = ([key, c]: [string, CreatureRec]): Entry => ({
      k: key, name: c[0], n: c[6] ?? 1, fresh: isNew('c', key),
      sub: `${ELEMENTS[c[1]] ?? 'unknown'} · ${key.startsWith('f') ? 'fused' : c[2] ? 'a rival’s' : 'yours'}${(c[6] ?? 1) > 1 ? ` · level ${c[6]}` : ''}${(c[5] ?? 1) > 1 ? ` · ${ROMAN[c[5] ?? 1] ?? ''} form` : ''}`,
      lines: [c[3].length ? `Traits: ${c[3].join(', ')}` : '', c[4].length ? `Skills: ${c[4].join(', ')}` : ''].filter(Boolean),
    });
    const mine = all.filter(([, c]) => !c[2]).map(card);
    const theirs = all.filter(([, c]) => c[2]);
    if (!mine.length) mine.push(unknown('Go outside. Whatever your universes have become will fight for you.'));
    const serials = rivalSerials();
    const met = new Set(theirs.map(([k]) => Number(k)));
    const knownRivals = serials.filter((s) => met.has(s)).length;
    const theirE = theirs.map(card);
    for (const r of rivalList()) {
      const left = r.serials.filter((s) => !met.has(s)).length;
      if (left) theirE.push(unknown(`${left} kept by ${r.name}, ${r.where}. Level ${r.level}.`));
    }
    const seen = Math.max(knownRivals, Math.min(theirs.length, serials.length));
    return { known: seen, total: serials.length, g: [{ title: 'Yours', count: `${all.length - theirs.length}`, e: mine }, { title: 'Theirs', count: `${seen} of ${serials.length}`, e: theirE }] };
  };

  const tabRivals = (): Built => {
    const rivals = rivalList();
    let met = 0;
    const lad2 = ladder();
    const rv: Entry[] = rivals.map((r) => {
      const rec = X.rv[r.id];
      if (!rec || !(rec[0] & 1)) return unknown(`Someone ${r.tier && r.tier > 1 ? 'further up the ladder' : 'on the street'}. ${r.boss ? 'They guard a tier.' : 'Go outside.'}`);
      met++;
      const wins = Math.max(rec[3], num(lad2.wins[r.id]));
      const best = rec[0] & 2 ? `Beaten ${wins > 1 ? `${wins} times` : 'once'}${rec[1] ? `, quickest in ${plural(rec[1], 'turn')}` : ''}.` : rec[0] & 4 ? 'They beat you.' : rec[0] & 8 ? 'You walked away.' : 'Unfinished.';
      return {
        k: `rv${r.id}`, name: r.name, n: wins, fresh: isNew('r', `rv${r.id}`),
        sub: [`tier ${r.tier ?? 1}${r.tierName ? ` · ${r.tierName}` : ''}`, r.persona ?? '', r.boss ? (r.boss === 'champion' ? 'champion' : 'boss') : '', `level ${r.level}`].filter(Boolean).join(' · '),
        say: `“${r.taunt}”`, lines: [best, r.boss && r.mechanic ? `Their trick: ${r.mechanic}` : ''].filter(Boolean),
        detail: () => {
          const out: Node[] = [line(`${r.name}, ${r.where}.`), say(`“${r.taunt}”`)];
          if (r.persona) out.push(block('How they fight', line(PERSONA_SAY[r.persona] ?? cap1(r.persona)), r.theme ? line(`Their creatures lean to ${r.theme}.`) : null));
          if (r.boss && r.mechanic) out.push(block(r.boss === 'champion' ? 'The champion’s trick' : 'A boss’s trick', say(r.mechanic)));
          out.push(section('Your record', `${plural(rec[2], 'fight')}`), line(best));
          if (rec[0] & 2 && r.beaten) out.push(say(`“${r.beaten}”`));
          const theirs = Object.entries(S.cr).filter(([k, c]) => c[2] && r.serials.includes(Number(k)));
          if (theirs.length) out.push(section('Their creatures', `${theirs.length} of ${r.serials.length}`));
          for (const [, c] of theirs) out.push(block(`${c[0]} · ${ELEMENTS[c[1]] ?? ''}`, c[4].length ? line(`Skills: ${c[4].join(', ')}`) : null));
          return out;
        },
      };
    });
    const relics = relicList();
    const relicE: Entry[] = relics.map((r) => (X.rs.includes(r.id) ? { k: `rl${r.id}`, name: r.name, say: r.desc, fresh: isNew('r', `rl${r.id}`) } : unknown('A small thing a creature can hold. Win, further up.', '▒▒▒')));
    let skillsKnown = 0;
    let skillsAll = 0;
    const skillE: Entry[] = ELEMENTS.map((el, i) => {
      let all: readonly { name: string; desc: string; kind?: string; learnAt?: number }[] = [];
      try { all = ctx.battles.skillsOf?.(el) ?? []; } catch { all = []; }
      const known = X.sk[i] ?? [];
      skillsKnown += known.length;
      skillsAll += Math.max(all.length, known.length);
      if (!known.length) return unknown(`No creature of ${el} has fought for you yet.`, `▒▒▒ ${el}`);
      return {
        k: `sk${i}`, name: cap1(el), sub: `${known.length}${all.length ? ` of ${all.length}` : ''} skills learned`, n: known.length, lines: [known.join(', ')],
        detail: () => {
          const out: Node[] = [line(`What your creatures of ${el} have learned.`)];
          const rows = all.length ? all : known.map((name) => ({ name, desc: '' }));
          for (const s of rows) {
            out.push(known.includes(clip(s.name, 20))
              ? block(`${s.name}${'kind' in s && s.kind ? ` · ${s.kind.toLowerCase()}` : ''}`, s.desc ? say(s.desc) : null)
              : h('div', 'cx-card cx-unknown', null, h('b', 'cx-name', '▒▒▒▒▒▒'), say(`Learned at level ${'learnAt' in s && s.learnAt ? s.learnAt : '?'}.`)));
          }
          return out;
        },
      };
    });
    const weatherE: Entry[] = WEATHERS.map((w, i) => {
      if (!(X.wt & (1 << i))) return unknown('A weather not yet fought under.', '▒▒▒');
      let info: { name: string; desc: string } | null = null;
      try { info = ctx.battles.weatherInfo?.(w) ?? null; } catch { info = null; }
      return { k: `w${i}`, name: info?.name ?? w, say: info?.desc ?? 'It lifts one temper and blunts another.', fresh: isNew('r', `w${i}`) };
    });
    const crs = Object.values(S.cr).filter((c) => !c[2]);
    const form = crs.reduce((n, c) => Math.max(n, c[5] ?? 1), crs.length ? 1 : 0);
    const formE: Entry[] = [1, 2, 3].map((f) => (form >= f
      ? { k: `form${f}`, name: `${['', 'First', 'Second', 'Third'][f]} form`, slim: true, sub: `${crs.filter((c) => (c[5] ?? 1) >= f).length} of yours` }
      : unknown(f === 2 ? 'A creature changes at level 4.' : f === 3 ? 'And again at level 9.' : 'Bring a creature outside.')));
    const g: Group[] = [
      { title: 'The ladder', count: `${met} of ${rivals.length}`, e: rv.length ? rv : [unknown('Go outside.')] },
      { title: 'Relics found', count: `${X.rs.length} of ${Math.max(relics.length, X.rs.length)}`, tiles: true, e: relicE },
      { title: 'Skills learned, by element', count: `${skillsKnown} of ${skillsAll}`, e: skillE },
      { title: 'Weather', count: `${bits(X.wt)} of ${WEATHERS.length}`, tiles: true, e: weatherE },
      { title: 'Forms', count: `${Math.min(3, form)} of 3`, e: formE },
      { title: 'Record', e: [
        { k: 'fights', name: 'Battles', slim: true, sub: `${fmt(N.fights)} fought · ${fmt(N.won)} won · ${fmt(N.lost)} lost` },
        { k: 'combos', name: 'Combos', slim: true, sub: `${fmt(N.combos)} landed · ${fmt(N.mcombo)} in one battle at most` },
      ] },
    ];
    return { known: met + Math.min(X.rs.length, relics.length || X.rs.length) + skillsKnown + bits(X.wt) + Math.min(3, form), total: rivals.length + Math.max(relics.length, X.rs.length) + skillsAll + WEATHERS.length + 3, g };
  };

  /** Every material table the atlas holds, drawn from the tables themselves. */
  const tabMaterials = (): Built => {
    const g: Group[] = [];
    let known = 0;
    let total = 0;
    const engine = Object.entries(ENGINE).map(([name, m]) => ({ id: m.id, name, kind: 'engine', color: m.color, density: -1 }));
    const weight = (d: number) => (d < 0 ? '' : d < 40 ? 'light as air' : d < 110 ? 'light' : d < 180 ? 'heavy' : 'very heavy');
    for (const [k, ids] of Object.entries(S.m)) {
      const li = Number(k);
      const l = lawSets()[li];
      if (!l) continue;
      const carrier = Object.entries(S.u).find(([, r]) => r[3] === li);
      const spec = carrier ? specOf(Number(carrier[0])) : null;
      const table = [...l.materials.filter((m) => m.id !== 0), ...engine];
      const got = table.filter((m) => ids.includes(m.id)).length;
      known += got;
      total += table.length;
      g.push({ title: l.name, count: `${got} of ${table.length}`, tiles: true, e: table.map((m) => {
        if (!ids.includes(m.id)) return unknown(m.kind === 'engine' ? 'Weather makes it.' : m.kind === 'life' ? 'Something alive. Watch longer.' : `A ${m.kind}. Watch longer.`, '▒▒▒');
        const turns = l.reactions.filter((r) => r.a === m.name && r.becomesA !== m.name).length;
        return {
          k: `${li}:${m.id}`, name: m.name, dot: spec?.palette[m.color] ?? '', fresh: isNew('m', `${li}:${m.id}`), n: m.density,
          say: m.kind === 'engine' ? 'found everywhere' : `${m.kind}${weight(m.density) ? `, ${weight(m.density)}` : ''}${turns ? ` · changes ${turns === 1 ? 'one way' : `${turns} ways`}` : ''}`,
        };
      }) });
    }
    if (!g.length) g.push({ e: [unknown('Watch a world. What its ground is made of is written here.')] });
    const unseen = lawSets().filter((_, i) => !S.m[i]);
    if (unseen.length) g.push({ title: 'Ground not yet watched', count: `${unseen.length}`, e: [unknown(`${plural(unseen.length, 'law set has', 'law sets have')} ground you have not watched: ${plural(unseen.reduce((n, l) => n + l.materials.length - 1, 0), 'material')} in all.`)] });
    for (const l of unseen) total += l.materials.length - 1 + engine.length;
    return { known, total, g };
  };

  const tabMirror = (): Built => {
    const e = end();
    const n = e ? Math.min(FRAGMENTS.length, Math.max(0, Math.floor(num(e.fragments)))) : 0;
    const frags: Entry[] = FRAGMENTS.map((text, i) => (i < n ? { k: `f${i}`, name: `Piece ${ROMAN[i + 1] ?? i + 1}`, say: text, n: i, fresh: isNew('x', `f${i}`) } : unknown('A piece of the answer, not yet found. Reach a floor you have not stood on.')));
    const g: Group[] = [{ title: 'Pieces of the answer', count: `${n} of ${FRAGMENTS.length}`, e: frags }];
    const visited = !!e && (num(e.visits) > 0 || num(e.floorsEver) > 0 || N.mir > 0);
    const boons = e ? arr<string>(e.boons) : [];
    if (!e || !visited) {
      g.push({ title: 'The room at the bottom', e: [unknown('Every universe has a bottom. Someone keeps a box down there.')] });
      return { known: n, total: FRAGMENTS.length + BOONS.length, g };
    }
    const said = Object.values(obj<Record<string, number>>(e.said, {})).reduce((a, b) => a + num(b), 0);
    const last = e.last && typeof e.last.words === 'string' ? e.last.words : '';
    g.push({ title: 'Exchanges', count: `${fmt(num(e.talks))}`, e: [
      { k: 'talks', name: 'Things said', slim: true, sub: `${plural(num(e.talks), 'exchange')} · ${plural(said, 'thing')} said aloud` },
      ...(last ? [{ k: 'last', name: 'The last thing you said', say: `“${clip(last, 160)}”` }] : []),
      { k: 'shelf', name: 'Their shelf', slim: true, sub: `${plural(arr(e.left).length, 'piece')} left · ${plural(num(e.lamps), 'pip')} left burning · ${plural(arr(e.taken).length, 'thing')} taken` },
      ...(e.promised ? [{ k: 'promise', name: 'A promise', say: 'You promised to come back.' }] : []),
    ] });
    const layer = topLayer(e);
    const above = Object.entries(obj<Record<string, number>>(e.above, {}));
    g.push({ title: 'Layers', count: `${layer}`, e: layer > 0
      ? [{ k: 'layer', name: `${plural(layer, 'room')} above your own`, lines: above.slice(0, 6).map(([s, l]) => `${uniName(Number(s))}: ${plural(num(l), 'layer')} up.`) }]
      : [unknown('Their box opens too. You have not gone in.')] });
    const boonE: Entry[] = BOONS.map((b) => {
      const rank = boons.filter((x) => x === b.id).length;
      return rank ? { k: b.id, name: `${b.name}${rank > 1 ? ` ${ROMAN[rank] ?? rank}` : ''}`, say: b.text, n: rank } : unknown(num(e.level) >= b.from ? 'A boon you have not kept.' : 'A boon not yet offered.');
    });
    g.push({ title: 'Wakings and boons', count: `woken ${plural(num(e.level), 'time')}`, e: [
      { k: 'visits', name: 'Arrivals', slim: true, sub: `${plural(num(e.visits), 'visit')} · ${plural(arr(e.floors).length, 'floor')} this run · ${fmt(num(e.floorsEver))} ever` }, ...boonE] });
    return { known: n + BOONS.filter((b) => boons.includes(b.id)).length, total: FRAGMENTS.length + BOONS.length, g };
  };

  const feastDay = (key: string) => {
    const m = /(\d\d)-(\d\d)$/.exec(key);
    return m ? `${Number(m[2])} ${MONTHS[Number(m[1]) - 1] ?? ''}`.trim() : key;
  };
  const tabAlmanac = (): Built => {
    almAt = -1e9;
    const a = alm();
    const omens: Entry[] = Object.entries(X.om).reverse().map(([id, o]) => ({ k: `o${id}`, name: o[0], say: o[1], fresh: isNew('a', `o${id}`) }));
    if (!omens.length) omens.push(unknown('Each day has an omen. Open the Almanac to see today’s.'));
    const feasts: Entry[] = a.feasts.map((k) => ({ k: `fd${k}`, name: `The feast of ${feastDay(k)}`, sub: 'kept', slim: true }));
    if (!feasts.length) feasts.push(unknown('Some days the box keeps for you. Come back on one.'));
    const haps: Entry[] = [...a.haps].reverse().slice(0, 20).map((x, i) => ({ k: `hp${i}`, name: x.title || 'A happening', say: x.text, lines: [x.done] }));
    if (!haps.length) haps.push(unknown('Now and then something comes to the door and waits for an answer.'));
    const g: Group[] = [
      { title: 'Omens seen', count: `${Object.keys(X.om).length}`, e: omens },
      { title: 'Feast days kept', count: `${a.feasts.length}`, e: feasts },
      { title: 'Happenings answered', count: `${a.haps.length}`, e: haps },
      { title: 'Days', e: [{ k: 'streak', name: 'Days in a row', slim: true, sub: `${fmt(a.streak)} now · ${fmt(Math.max(a.best, a.streak))} at best` }] },
    ];
    return { known: Object.keys(X.om).length + a.feasts.length + a.haps.length, total: 0, g };
  };

  const BUILD: Record<TabId, () => Built> = { u: tabUniverses, d: tabStrata, l: tabLaws, s: tabStars, w: tabWorlds, p: tabPeoples, k: tabSkies, c: tabCreatures, r: tabRivals, m: tabMaterials, x: tabMirror, a: tabAlmanac };
  const build = (id: TabId): Built => { try { return BUILD[id](); } catch { return { known: 0, total: 0, g: [{ e: [unknown('This page could not be read.')] }] }; } };
  let lastTab: TabId | null = null;
  let sortBy: SortId = 'found';
  const totalNew = () => Object.values(S.nw).reduce((a, b) => a + (b || 0), 0);
  const tabLabel = (id: string) => TABS.find((t) => t[0] === id)?.[1] ?? '';

  // ---------- codex page (DOM) ----------
  const MAX_SHOWN = 60;
  const cardOf = (e: Entry, open: ((e: Entry) => void) | null, id: string): HTMLElement => {
    const can = !!e.detail && !!open;
    const c = h(can ? 'button' : 'div', `cx-card${e.un ? ' cx-unknown' : ''}${e.slim ? ' cx-slim' : ''}${can ? ' cx-open' : ''}`);
    if (can) {
      (c as HTMLButtonElement).type = 'button';
      c.dataset.id = id;
      c.addEventListener('click', () => open?.(e));
    }
    const name = h('b', 'cx-name', e.name, e.fresh ? h('i', 'cx-new', 'new') : null);
    const sub = e.sub ? h('small', 'cx-sub', e.sub) : null;
    if (e.slim) { c.append(name, sub ?? ''); return c; }
    const pre = e.pre?.() ?? null;
    if (pre || can) c.append(h('div', 'cx-row', null, pre, h('div', 'cx-grow', null, name, sub), can ? h('span', 'cx-chev', '›') : null));
    else { c.append(name); if (sub) c.append(sub); }
    if (e.chips?.length) c.append(tags(e.chips));
    if (e.say) c.append(say(e.say));
    for (const l of e.lines ?? []) c.append(line(l));
    return c;
  };
  const tileOf = (e: Entry): HTMLElement => {
    const t = h('div', e.un ? 'cx-tile cx-unknown' : 'cx-tile');
    if (e.dot !== undefined) { const dot = h('i', 'cx-dot'); if (e.dot) dot.style.background = e.dot; t.append(dot); }
    t.append(h('b', '', e.name, e.fresh ? h('i', 'cx-new', 'new') : null), h('small', '', e.say ?? e.sub ?? ''));
    return t;
  };
  const textOf = (e: Entry) => `${e.name} ${e.sub ?? ''} ${e.say ?? ''} ${(e.lines ?? []).join(' ')} ${(e.chips ?? []).join(' ')}`.toLowerCase();
  const arrange = (list: readonly Entry[], query: string): Entry[] => {
    let out = query ? list.filter((e) => !e.un && textOf(e).includes(query)) : [...list];
    if (sortBy !== 'found') {
      const known = out.filter((e) => !e.un);
      const rest = out.filter((e) => e.un);
      if (sortBy === 'name') known.sort((a, b) => a.name.localeCompare(b.name));
      else known.sort((a, b) => (b.n ?? 0) - (a.n ?? 0));
      out = [...known, ...rest];
    }
    return out;
  };

  shell.menu.add({
    id: 'codex',
    label: 'Codex',
    hint: 'Everything you have met.',
    order: 30,
    badge: () => { const n = totalNew(); return n > 0 ? `${n} new` : null; },
    render: (into) => {
      scan();
      const page = h('div', 'cx-page');
      into.append(page);
      let query = '';
      const leaveTab = () => { if (lastTab) for (const k of [...news]) if (k.startsWith(`${lastTab}:`)) news.delete(k); };

      const showFront = () => {
        leaveTab();
        lastTab = null;
        let known = 0;
        let total = 0;
        const grid = h('div', 'cx-tabs');
        for (const [id, label, hint] of TABS) {
          const b = build(id);
          if (b.total > 0) { known += Math.min(b.known, b.total); total += b.total; }
          const fresh = S.nw[id] ?? 0;
          const t = h('button', `cx-tab${fresh > 0 ? ' has-new' : ''}`, null,
            h('b', '', label), h('small', '', hint),
            h('span', 'cx-count', b.total > 0 ? `${b.known} of ${b.total}` : `${b.known} met`), b.total > 0 ? barOf((b.known / b.total) * 100) : null);
          t.type = 'button';
          t.dataset.id = `codex-tab-${id}`;
          t.addEventListener('click', () => showTab(id));
          grid.append(t);
        }
        const pct = total ? Math.floor((known / total) * 100) : 0;
        if (pct !== X.cp) { X.cp = pct; touch(); }
        const pctEl = h('b', 'cx-pct', `${pct}%`);
        pctEl.dataset.id = 'codex-percent';
        const head = h('div', 'cx-progress', null, h('div', 'cx-row', null, pctEl, h('div', 'cx-grow', null, h('span', 'k-label', `${fmt(known)} of ${fmt(total)} entries`), h('small', 'cx-sub', 'Everything you have met, and the shape of what you have not.'))), barOf(pct));
        const strip = h('div', 'cx-recent');
        strip.dataset.id = 'codex-recent';
        if (X.rc.length) {
          for (const [tab, label] of X.rc) {
            const chip = h('button', 'cx-chip', null, h('small', '', tabLabel(tab)), h('b', '', label));
            chip.type = 'button';
            chip.addEventListener('click', () => { if (TABS.some((t) => t[0] === tab)) showTab(tab as TabId); });
            strip.append(chip);
          }
        } else strip.append(h('p', 'cx-say', 'Nothing new yet. Go and look.'));
        page.replaceChildren(head, section('Recently discovered', X.rc.length ? `${X.rc.length}` : ''), strip, section('Chapters', `${TABS.length}`), grid);
        into.scrollTop = 0;
      };

      const showTab = (id: TabId) => {
        leaveTab();
        lastTab = id;
        query = '';
        if (!(X.tb & (1 << TABS.findIndex((t) => t[0] === id)))) { X.tb |= 1 << TABS.findIndex((t) => t[0] === id); touch(); }
        const built = build(id);
        const fresh = S.nw[id] ?? 0;
        const back = h('button', 'cx-back', '‹ Codex');
        back.type = 'button';
        back.dataset.id = 'codex-front';
        back.addEventListener('click', showFront);
        const title = h('span', 'k-title', tabLabel(id));
        const count = h('span', 'cx-count', `${built.total > 0 ? `${built.known} of ${built.total}` : `${built.known} met`}${fresh > 0 ? ` · ${fresh} new` : ''}`);
        const head = h('div', 'cx-head', null, back, title, count);
        const search = h('input', 'cx-search');
        search.type = 'search';
        search.placeholder = 'Search this page';
        search.dataset.id = 'codex-search';
        search.setAttribute('aria-label', 'Search this page');
        search.autocomplete = 'off';
        const sorts = h('div', 'cx-sorts');
        sorts.setAttribute('role', 'group');
        sorts.setAttribute('aria-label', 'Sort');
        const body = h('div', 'cx-list');
        const tools = h('div', 'cx-tools', null, search, sorts);
        let limit = MAX_SHOWN;

        const openDetail = (e: Entry) => {
          const top = into.scrollTop;
          const b2 = h('button', 'cx-back', `‹ ${tabLabel(id)}`);
          b2.type = 'button';
          b2.dataset.id = 'codex-back';
          const view = h('div', 'cx-detail');
          view.dataset.id = 'codex-detail';
          let nodes: Node[] = [];
          try { nodes = e.detail?.() ?? []; } catch { nodes = [say('This could not be read.')]; }
          view.append(h('div', 'cx-head', null, b2, h('span', 'k-title', e.name)), e.sub ? h('small', 'cx-sub', e.sub) : '', ...nodes);
          b2.addEventListener('click', () => { page.replaceChildren(head, tools, body); into.scrollTop = top; });
          page.replaceChildren(view);
          into.scrollTop = 0;
        };
        const paint = () => {
          const frag = document.createDocumentFragment();
          let shown = 0;
          let hidden = 0;
          let n = 0;
          for (const g of built.g) {
            const list = arrange(g.e, query);
            if (!list.length) continue;
            if (g.title) frag.append(section(g.title, g.count ?? ''));
            if (g.tiles) {
              const grid = h('div', 'cx-tiles');
              for (const e of list) grid.append(tileOf(e));
              frag.append(grid);
              shown += list.length;
              continue;
            }
            for (const e of list) {
              if (shown >= limit) { hidden++; continue; }
              frag.append(cardOf(e, openDetail, `codex-open-${n++}`));
              shown++;
            }
          }
          if (!shown) frag.append(h('p', 'cx-say cx-none', query ? 'Nothing here by that name.' : 'Nothing here yet.'));
          if (hidden) {
            const more = h('button', 'k-btn cx-more', `Show ${hidden} more`);
            more.type = 'button';
            more.dataset.id = 'codex-more';
            more.addEventListener('click', () => { limit += MAX_SHOWN; paint(); });
            frag.append(more);
          }
          body.replaceChildren(frag);
          for (const b of sorts.children) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.sort === sortBy));
        };
        for (const [sid, label] of SORTS) {
          const b = h('button', 'cx-sort', label);
          b.type = 'button';
          b.dataset.id = `codex-sort-${sid}`;
          b.dataset.sort = sid;
          b.addEventListener('click', () => { sortBy = sid; paint(); });
          sorts.append(b);
        }
        let typing = 0;
        search.addEventListener('input', () => {
          window.clearTimeout(typing);
          typing = window.setTimeout(() => { query = search.value.trim().toLowerCase(); limit = MAX_SHOWN; paint(); }, 120);
        });
        // Typing here is not steering: keep the keys from the screen underneath.
        search.addEventListener('keydown', (ev) => ev.stopPropagation());
        search.addEventListener('keyup', (ev) => ev.stopPropagation());
        paint();
        page.replaceChildren(head, tools, body);
        if (fresh > 0) { S.nw[id] = 0; dirty = true; }
        into.scrollTop = 0;
      };

      if (lastTab) showTab(lastTab); else showFront();
      return () => { leaveTab(); safe(save); };
    },
  });

  // ---------- deeds page ----------
  const claimable = () => DEEDS.reduce((n, d) => n + (S.a[d.id] === 1 ? 1 : 0), 0);
  /** In a family, the next rung shows only once the one before is done. */
  const visible = (d: Deed): boolean => {
    if (!d.fam || S.a[d.id] || (d.rung ?? 1) <= 1) return true;
    return !!S.a[`${d.fam}${(d.rung ?? 1) - 1}`];
  };
  shell.menu.add({
    id: 'deeds',
    label: 'Deeds',
    hint: 'What you have done, and what it earned.',
    order: 40,
    badge: () => { const n = claimable(); return n > 0 ? `${n} to claim` : null; },
    render: (into) => {
      scan();
      safe(check);
      // Whatever was just judged is on this page already: no notice needed for it.
      deedQ.length = 0;
      const page = h('div', 'cx-page');
      const head = h('div', 'cx-progress');
      const rare = h('div', 'cx-rare');
      rare.dataset.id = 'deeds-rarest';
      const list = h('div', 'cx-list');
      const paintHead = () => {
        const done = DEEDS.filter((d) => S.a[d.id]).length;
        const pct = Math.round((done / DEEDS.length) * 100);
        const tiers = (['bronze', 'silver', 'gold'] as const).map((t) => `${TIER_MARK[t]} ${DEEDS.filter((d) => d.tier === t && S.a[d.id]).length}/${DEEDS.filter((d) => d.tier === t).length}`).join('   ');
        const pctEl = h('b', 'cx-pct', `${pct}%`);
        pctEl.dataset.id = 'deeds-percent';
        head.replaceChildren(h('div', 'cx-row', null, pctEl, h('div', 'cx-grow', null, h('span', 'k-label', `${done} of ${DEEDS.length} deeds`), h('small', 'cx-sub', tiers))), barOf(pct));
        const best = DEEDS.filter((d) => S.a[d.id]).sort((a, b) => rarityOf(b) - rarityOf(a)).slice(0, 3);
        rare.replaceChildren(section('Rarest deeds', best.length ? `${best.length}` : ''),
          ...(best.length
            ? best.map((d) => h('div', `cx-card cx-slim cx-${d.tier} cx-rarest`, null, h('span', 'cx-medal', TIER_MARK[d.tier]), h('div', 'cx-grow', null, h('b', 'cx-name', d.name), h('small', 'cx-sub', `${d.tier}${d.hidden ? ' · hidden' : ''}${d.fam ? ` · ${ROMAN[d.rung ?? 1] ?? ''} of ${ROMAN[d.of ?? 1] ?? ''}` : ''}`))))
            : [say('Nothing rare yet. The quiet ones are worth the most.')]));
      };
      const card = (d: Deed): HTMLElement => {
        const st = S.a[d.id] ?? 0;
        const secret = !st && !!d.hidden;
        const c = h('div', `cx-card cx-deed cx-${d.tier}${st ? '' : ' cx-locked'}${secret ? ' cx-unknown' : ''}`);
        c.dataset.id = `deed-${d.id}`;
        const reward = rewardText(rewardOf(DEEDS.indexOf(d), d));
        const chain = d.fam ? ` · ${ROMAN[d.rung ?? 1] ?? ''} of ${ROMAN[d.of ?? 1] ?? ''}` : '';
        c.append(h('div', 'cx-row', null, h('span', 'cx-medal', TIER_MARK[d.tier]),
          h('div', 'cx-grow', null, h('b', 'cx-name', secret ? '???' : d.name), h('p', 'cx-say', secret ? d.hidden ?? '' : d.desc), h('small', 'cx-sub', `${d.tier}${chain} · ${st === 2 ? 'claimed' : `reward ${secret ? '?' : reward}`}`))));
        if (st === 1) {
          const b = h('button', 'k-btn cx-claim', 'Claim');
          b.type = 'button';
          b.dataset.id = `claim-${d.id}`;
          b.addEventListener('click', () => {
            let got: string | null = null;
            try { got = claim(d); } catch { got = null; }
            if (got) shell.toast(`${d.name}: ${got}.`, { title: 'Claimed' });
            c.replaceWith(card(d));
            paintHead();
          });
          c.append(b);
        }
        return c;
      };
      const rank = (d: Deed) => (S.a[d.id] === 1 ? 0 : S.a[d.id] === 2 ? 2 : 1);
      const frag = document.createDocumentFragment();
      const shown = DEEDS.filter(visible);
      for (const d of [...shown].sort((a, b) => rank(a) - rank(b))) frag.append(card(d));
      const later = DEEDS.length - shown.length;
      if (later > 0) frag.append(h('p', 'cx-say cx-none', `${later} more wait further up their chains.`));
      list.append(frag);
      // Claim everything that is waiting, in one press, with one notice.
      const all = h('button', 'k-btn cx-claim-all', '');
      all.type = 'button';
      all.dataset.id = 'claim-all';
      const waiting = () => DEEDS.filter((d) => S.a[d.id] === 1);
      const paintAll = () => { const n = waiting().length; all.hidden = n < 2; all.textContent = `Claim all ${n}`; };
      all.addEventListener('click', () => {
        const got: string[] = [];
        for (const d of waiting()) {
          let g: string | null = null;
          try { g = claim(d); } catch { g = null; }
          if (g) got.push(g);
          const old = list.querySelector(`[data-id="deed-${d.id}"]`);
          if (old) old.replaceWith(card(d));
        }
        if (got.length) shell.toast(`${got.length} deeds claimed: ${got.slice(0, 4).join(', ')}${got.length > 4 ? ' and more' : ''}.`, { title: 'Claimed' });
        paintHead();
        paintAll();
      });
      list.addEventListener('click', () => window.setTimeout(paintAll, 0));
      paintAll();
      paintHead();
      page.append(head, all, rare, list);
      into.append(page);
      return () => safe(save);
    },
  });

  // ---------- stats page ----------
  const clock = (ms: number) => {
    const m = Math.floor(ms / 60000);
    return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min ${Math.floor((ms % 60000) / 1000)} s`;
  };
  const pipsOf = (glow: number) => (glow / 1000).toFixed(1);
  shell.menu.add({
    id: 'stats',
    label: 'Tally',
    hint: 'Lifetime numbers.',
    order: 45,
    render: (into) => {
      const page = h('div', 'cx-page');
      const worlds = () => Object.values(S.w);
      const groups: [string, [string, string, () => string][]][] = [
        ['The fall', [
          ['folds', 'Folds fallen', () => fmt(N.folds)],
          ['deep', 'Deepest fold', () => fmt(N.deep)],
          ['strata', 'Strata crossed', () => fmt(N.strata)],
          ['streak', 'Longest unbroken fall', () => fmt(N.streak)],
          ['picks', 'Things taken from folds', () => fmt(N.picks)],
          ['echoes', 'Echoes read', () => fmt(Math.max(N.echoes, X.ec.length))],
          ['dodged', 'Hazards slipped', () => fmt(N.dodged)],
          ['hit', 'Hazards met', () => fmt(N.hit)],
          ['caught', 'Flickers caught', () => fmt(N.caught)],
          ['missed', 'Flickers fallen past', () => fmt(N.missed)],
          ['mir', 'Floors stood on', () => fmt(N.mir)],
          ['stars', 'Stars stopped at', () => fmt(Math.max(N.stars, S.st.length))],
        ]],
        ['Worlds and peoples', [
          ['worlds', 'Worlds watched', () => fmt(worlds().length)],
          ['souls', 'Most souls watched', () => fmt(N.souls)],
          ['vf', 'Villages seen founded', () => fmt(N.vf)],
          ['vl', 'Villages seen lost', () => fmt(N.vl)],
          ['wars', 'Wars witnessed', () => fmt(N.wars)],
          ['peace', 'Wars ended in peace', () => fmt(N.peace)],
          ['creeds', 'Creeds named', () => fmt(worlds().reduce((n, w) => n + (w.k?.length ?? 0), 0))],
          ['schisms', 'Schisms', () => fmt(N.schisms)],
          ['works', 'Great works seen built', () => fmt(Math.max(N.works, worlds().reduce((n, w) => n + (w.wk?.length ?? 0), 0)))],
          ['invent', 'Inventions seen', () => fmt(N.invent)],
          ['plagues', 'Sicknesses', () => fmt(N.plagues)],
          ['crowns', 'Rulers raised', () => fmt(N.crowns)],
          ['fallen', 'Rulers fallen', () => fmt(N.fallen)],
          ['arks', 'Colony ships gone', () => fmt(N.arks)],
          ['age', 'Latest age reached', () => ALL_ERAS[worlds().reduce((n, w) => Math.max(n, w.e, w.a ?? 0), 0)] ?? 'huts'],
          ['hung', 'Sky pieces hung', () => fmt(N.hung)],
        ]],
        ['Outside', [
          ['fights', 'Battles fought', () => fmt(Math.max(N.fights, N.won + N.lost))],
          ['won', 'Battles won', () => fmt(N.won)],
          ['lost', 'Battles lost', () => fmt(N.lost)],
          ['combos', 'Combos landed', () => fmt(N.combos)],
          ['relics', 'Relics found', () => fmt(X.rs.length)],
          ['skills', 'Skills learned', () => fmt(Object.values(X.sk).reduce((n, l) => n + l.length, 0))],
          ['merges', 'Merges', () => fmt(N.merges)],
          ['gen', 'Deepest lineage', () => fmt(N.gen)],
        ]],
        ['The mirror and the days', [
          ['frags', 'Pieces of the answer', () => `${fmt(num(end()?.fragments))} of ${FRAGMENTS.length}`],
          ['talks', 'Exchanges below', () => fmt(num(end()?.talks))],
          ['wakes', 'Wakings', () => fmt(num(end()?.level))],
          ['omens', 'Omens seen', () => fmt(Object.keys(X.om).length)],
          ['feasts', 'Feast days kept', () => fmt(alm().feasts.length)],
          ['beststreak', 'Best streak of days', () => fmt(Math.max(alm().best, alm().streak))],
        ]],
        ['Everything', [
          ['uni', 'Universes known', () => fmt(Object.keys(S.u).length)],
          ['le', 'Light earned (pips)', () => pipsOf(N.le)],
          ['ls', 'Light spent (pips)', () => pipsOf(N.ls)],
          ['ms', 'Time played', () => clock(N.ms)],
          ['deeds', 'Deeds done', () => `${Object.keys(S.a).length} of ${DEEDS.length}`],
          ['book', 'Codex filled', () => `${X.cp}%`],
        ]],
      ];
      const cells: (readonly [HTMLElement, () => string])[] = [];
      page.append(h('p', 'k-narration', 'Mote has been counting.'));
      for (const [title, rows] of groups) {
        const grid = h('div', 'cx-stats');
        for (const [id, label, get] of rows) {
          const v = h('b', '', '');
          v.dataset.id = `stat-${id}`;
          grid.append(h('div', 'cx-stat', null, v, h('span', '', label)));
          cells.push([v, get] as const);
        }
        page.append(section(title, ''), grid);
      }
      const paint = () => { scan(); for (const [v, get] of cells) { let t = '0'; try { t = get(); } catch { t = '0'; } if (v.textContent !== t) v.textContent = t; } };
      paint();
      into.append(page);
      const timer = window.setInterval(paint, 1000);
      return () => window.clearInterval(timer);
    },
  });

  scan();
};
