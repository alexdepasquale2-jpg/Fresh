/**
 * The Codex, the Deeds and the Tally: three pages in the hub menu.
 *
 * Everything the player meets is remembered here. Nothing is invented: every entry is
 * detected from real state on shell.ctx (the box, the dive, the selection, the sim's
 * latest frame, the sky, the battle in progress) by a throttled scan, and kept in one
 * compact shell.store value (ids and small numbers, capped lists; never whole specs).
 */
import './codex.css';
import { seedToHex } from '@/core/hash';
import { formatSerial } from '@/core/serial';
import { glyphChar } from '@/ui/kit';
import { BOX_SLOTS, LIGHT_MAX_PIPS } from '@/contracts/game';
import { SKY_PIECE_KINDS, SKY_MAX_PIECES } from '@/contracts/sky';
import type { SkyPieceKind, SkyState } from '@/contracts/sky';
import { BELIEFS, ERAS, ENGINE } from '@/contracts/sim';
import type { UniverseSpec } from '@/contracts/universe';
import type { PlanetSpec } from '@/contracts/system';
import type { Fighter } from '@/contracts/battle';
import type { Plugin } from '../plugins';

// ---------- stored shape ----------
/** [best fold, worlds tended, flags, law index]. Flags: 1 held now or once, 2 dived, 4 floor reached, 8 mirror met. */
type URec = [number, number, number, number];
/** [star key, universe serial, kind index, heat, worlds, system name] */
type StarRec = [string, number, number, number, number, string];
/** [name, calling, deeds] */
type PersonRec = [string, string, string[]];
/** n name, b biome index, u universe serial, s peak souls, e best era, c creed mask, v most villages, p named people */
interface WorldRec { n: string; b: number; u: number; s: number; e: number; c: number; v: number; p: PersonRec[] }
/** [name, element index, 1 if a rival's, traits, skills] */
type CreatureRec = [string, number, number, string[], string[]];
interface Tally {
  folds: number; deep: number; stars: number; hung: number; souls: number; vf: number; vl: number;
  won: number; lost: number; caught: number; merges: number; ms: number; le: number; ls: number; mir: number; claimed: number; full: number; orbit: number;
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
}

const CAP = { u: 150, st: 200, w: 120, people: 8, deeds: 4, cb: 60, cr: 90 } as const;
const ZERO: Tally = { folds: 0, deep: 0, stars: 0, hung: 0, souls: 0, vf: 0, vl: 0, won: 0, lost: 0, caught: 0, merges: 0, ms: 0, le: 0, ls: 0, mir: 0, claimed: 0, full: 0, orbit: 0 };
const fresh = (): Save => ({ v: 1, seeded: false, u: {}, st: [], w: {}, pc: 0, cb: {}, cr: {}, m: {}, a: {}, nw: {}, n: { ...ZERO } });
const obj = <T>(x: unknown, d: T): T => (x && typeof x === 'object' && !Array.isArray(x) ? (x as T) : d);
const heal = (raw: unknown): Save => {
  const d = fresh();
  const r = obj<Partial<Save>>(raw, {});
  const n = { ...ZERO, ...obj<Partial<Tally>>(r.n, {}) };
  for (const k of Object.keys(ZERO) as (keyof Tally)[]) if (typeof n[k] !== 'number' || !Number.isFinite(n[k])) n[k] = 0;
  return { v: 1, seeded: r.seeded === true, u: obj(r.u, d.u), st: Array.isArray(r.st) ? r.st : [], w: obj(r.w, d.w), pc: typeof r.pc === 'number' ? r.pc : 0, cb: obj(r.cb, d.cb), cr: obj(r.cr, d.cr), m: obj(r.m, d.m), a: obj(r.a, d.a), nw: obj(r.nw, d.nw), n };
};

// ---------- words ----------
const STAR_KINDS = ['dwarf', 'main', 'giant', 'pulsar'] as const;
const STAR_WORD = ['A dwarf', 'A steady sun', 'A giant', 'A pulsar'] as const;
const STAR_HINT = ['Small and common. Stop at the dim ones.', 'The ordinary kind. Stop at any star in a fold.', 'Rare and swollen. Fall further.', 'It ticks. They hide in the deep folds.'] as const;
const BIOMES = ['ash', 'salt', 'moss', 'tallow', 'glass'] as const;
const BIOME_HINT = ['Grey ground, where something burned.', 'White flats that were once a sea.', 'A green one. They grow easily there.', 'Soft and pale. It gives under the hand.', 'It rings when the stones fall.'] as const;
const ELEMENTS = ['cold', 'fire', 'tide', 'stone', 'bloom', 'void'] as const;
const PIECE_SAYS: Record<SkyPieceKind, string> = { comet: 'It comes back each year.', moon: 'It pulls at whatever is loose.', belt: 'A river of stones.', sun: 'A second, lesser fire.', rings: 'An arch from edge to edge.', dust: 'It reddens everything.' };
const heatWord = (h: number) => (h < 64 ? 'a red ember' : h < 128 ? 'amber' : h < 200 ? 'white' : 'blue-white');
const TABS = [['u', 'Universes'], ['l', 'Laws'], ['s', 'Stars'], ['w', 'Worlds'], ['k', 'Skies'], ['c', 'Creatures'], ['m', 'Materials'], ['d', 'Depths']] as const;
type TabId = (typeof TABS)[number][0];
const MILESTONES = [1, 10, 25, 50, 100, 200, 500] as const;
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string | null, ...kids: (Node | null | undefined)[]): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  for (const k of kids) if (k) e.append(k);
  return e;
};
const tags = (list: readonly string[]) => h('div', 'cx-tags', null, ...list.map((t) => h('span', 'k-tag', t)));
const silhouette = (hint: string, mark = '▒▒▒▒▒▒') => h('div', 'cx-card cx-unknown', null, h('b', 'cx-name', mark), h('p', 'cx-say', hint));
const section = (title: string, count: string) => h('div', 'cx-sec', null, h('span', 'k-label', title), h('span', 'cx-count', count));

// ---------- deeds ----------
/** What deeds are judged on. Rebuilt from the save when something changed. */
interface Q {
  uni: number; held: number; laws: number; lawTotal: number; dived10: number; floors: number;
  kinds: number; hot: boolean; cold: boolean; pulsar: boolean; starN: number;
  worlds: number; biomes: number; era: number; creeds: number; people: number; deeds3: boolean; towns: number;
  pk: number; combos: number; says: number; sayTotal: number;
  mats: number; matFull: boolean; met: number; elements: number; rivalsAll: boolean; mine: number;
  unlocked: number; n: Tally;
}
type Tier = 'bronze' | 'silver' | 'gold';
interface Deed { id: string; tier: Tier; name: string; desc: string; hidden?: string; ok(q: Q): boolean }
const D = (id: string, tier: Tier, name: string, desc: string, ok: (q: Q) => boolean, hidden?: string): Deed => ({ id, tier, name, desc, ok, hidden });
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
  D('light10', 'bronze', 'Their glow, your light', 'Earn 10 pips of Light.', (q) => q.n.le >= 10000),
  D('light100', 'silver', 'A lamp that stays lit', 'Earn 100 pips of Light.', (q) => q.n.le >= 100000),
  D('spend20', 'silver', 'Spent in the dark', 'Spend 20 pips of Light.', (q) => q.n.ls >= 20000),
  D('time10', 'bronze', 'Ten minutes', 'Play for ten minutes.', (q) => q.n.ms >= 600000),
  D('time60', 'silver', 'Past bedtime', 'Play for an hour.', (q) => q.n.ms >= 3600000),
  D('claim10', 'silver', 'Collector', 'Claim ten deeds.', (q) => q.n.claimed >= 10),
  D('most', 'gold', 'Nearly everything', 'Unlock forty deeds.', (q) => q.unlocked >= 40, 'Keep the list. It is almost the whole game.'),
];
const TIER_MARK: Record<Tier, string> = { bronze: '◇', silver: '◈', gold: '◆' };
type Reward = { glow: number } | { piece: SkyPieceKind; count: number };
const rewardOf = (i: number, d: Deed): Reward => {
  const piece = SKY_PIECE_KINDS[i % SKY_PIECE_KINDS.length] ?? 'moon';
  if (d.tier === 'gold') return { piece, count: 2 };
  if (d.tier === 'silver') return i % 2 ? { piece, count: 1 } : { glow: 800 };
  return { glow: 300 };
};
const rewardText = (r: Reward) => ('glow' in r ? `+${r.glow} glow` : `${r.count} ${r.piece}${r.count > 1 && !r.piece.endsWith('s') ? 's' : ''}`);

export const plugin: Plugin = (shell) => {
  const ctx = shell.ctx;
  const store = shell.store<Save>('codex', fresh());
  const S = heal(store.get());
  const N = S.n;
  let dirty = false;
  let changed = true;
  const touch = () => { dirty = true; changed = true; };
  const safe = (fn: () => void) => { try { fn(); } catch { /* a missing part of state must never break the game */ } };
  const save = () => { if (!dirty) return; dirty = false; store.set(S); };

  /** Entries added since the tab was last read, for NEW marks. */
  const news = new Set<string>();
  const isNew = (tab: TabId, key: string | number) => news.has(`${tab}:${key}`);
  const newly = (tab: TabId, key: string | number) => { news.add(`${tab}:${key}`); S.nw[tab] = (S.nw[tab] ?? 0) + 1; touch(); };

  const specs = new Map<number, UniverseSpec | null>();
  const specOf = (serial: number): UniverseSpec | null => {
    let s = specs.get(serial);
    if (s === undefined) {
      try { s = ctx.universes.fromSerial(serial); } catch { s = null; }
      specs.set(serial, s);
    }
    return s;
  };
  const lawSets = () => ctx.atlas?.lawSets ?? [];
  const lawIndex = (spec: UniverseSpec | null) => (spec ? lawSets().findIndex((l) => l.id === spec.laws.id) : -1);
  const uniName = (serial: number) => specOf(serial)?.name ?? formatSerial(serial);

  // ---------- detection ----------
  const uni = (serial: number): URec | null => {
    const k = String(serial);
    let r = S.u[k];
    if (!r) {
      if (Object.keys(S.u).length >= CAP.u) return null;
      const li = lawIndex(specOf(serial));
      r = S.u[k] = [0, 0, 0, li];
      newly('u', serial);
      if (li >= 0 && !Object.values(S.u).some((x) => x !== r && x[3] === li)) newly('l', li);
    }
    return r;
  };
  const raise = (r: URec, i: 0 | 1, v: number) => { if (Number.isFinite(v) && v > r[i]) { r[i] = Math.floor(v); touch(); } };
  const flag = (r: URec, f: number) => { if ((r[2] & f) !== f) { r[2] |= f; touch(); } };
  const bump = (k: keyof Tally, v: number) => { if (v > 0) { N[k] += v; touch(); } };
  const top = (k: keyof Tally, v: number) => { if (Number.isFinite(v) && v > N[k]) { N[k] = Math.floor(v); touch(); } };

  let boxSeen: Set<number> | null = null;
  let invSeen: number[] | null = null;
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
    }
    const inv = SKY_PIECE_KINDS.map((k) => ctx.sky.inventory()[k] ?? 0);
    const screen = shell.current();
    let merged = false;
    if (boxSeen) {
      for (const s of now) {
        if (boxSeen.has(s)) continue;
        if (screen === 'dive') bump('caught', 1);
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
  const scanDive = () => {
    const v = ctx.dive.view();
    const u = v.universe;
    if (!u) return;
    const r = uni(u.serialNumber);
    if (u.serialNumber !== diveSerial || v.depth < diveDepth) { diveSerial = u.serialNumber; diveDepth = booted ? 0 : v.depth; }
    if (v.depth > diveDepth) { bump('folds', v.depth - diveDepth); diveDepth = v.depth; }
    top('deep', v.depth);
    top('deep', v.best);
    if (r) {
      raise(r, 0, Math.max(v.depth, v.best));
      if (v.depth > 0) flag(r, 2);
      if (v.bottom) flag(r, 4);
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
    newly('s', key);
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
      newly('w', key);
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
        if (!first) newly('w', key);
        touch();
      } else if (p[2].join('|') !== deeds.join('|')) { p[2] = deeds; p[1] = clip(who.calling, 16); touch(); }
    }
    // Materials on the ground: a histogram of the grid, every few scans.
    if (matTurn++ % 4 === 0) {
      const li = lawIndex(at.universe);
      if (li < 0) return;
      const cells = f.grid.cells;
      const seen = new Uint8Array(256);
      for (let i = 0; i < cells.length; i++) seen[cells[i] ?? 0] = 1;
      const known = (S.m[li] ??= []);
      const valid = new Set<number>([...at.universe.materialTable.map((m) => m.id), ...Object.values(ENGINE).map((m) => m.id)]);
      for (let id = 1; id < 256; id++) {
        if (!seen[id] || !valid.has(id) || known.includes(id)) continue;
        known.push(id);
        newly('m', `${li}:${id}`);
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
        if (bit > 0 && !(S.pc & bit)) { S.pc |= bit; newly('k', `p${p}`); }
      }
      const key = comboKey(s.pieces);
      if (!key) continue;
      const said = rulesFor(s);
      const had = S.cb[key];
      if (!had) {
        if (Object.keys(S.cb).length >= CAP.cb) continue;
        S.cb[key] = said;
        newly('k', key);
      } else if (said.some((i) => !had.includes(i))) { S.cb[key] = [...new Set([...had, ...said])]; touch(); }
    }
  };

  let counted = false;
  const meet = (f: Fighter, rival: boolean) => {
    const key = `${f.fused ? 'f' : ''}${f.serialNumber}`;
    const skills = f.skills.map((s) => clip(s.name, 20)).slice(0, 6);
    const traits = f.traits.map((t) => clip(t.name, 20)).slice(0, 6);
    const had = S.cr[key];
    if (!had) {
      if (Object.keys(S.cr).length >= CAP.cr) return;
      S.cr[key] = [clip(f.name, 32), Math.max(0, ELEMENTS.indexOf(f.element)), rival ? 1 : 0, traits, skills];
      newly('c', key);
      return;
    }
    const allS = [...new Set([...had[4], ...skills])].slice(0, 8);
    const allT = [...new Set([...had[3], ...traits])].slice(0, 8);
    if (allS.length !== had[4].length || allT.length !== had[3].length) { had[3] = allT; had[4] = allS; touch(); }
  };
  /** Cheap enough for every frame: a battle can end and be dismissed between two scans. */
  const scanBattle = () => {
    const b = ctx.battle;
    if (!b || b.outcome === 'ongoing') { counted = false; return; }
    if (counted) return;
    counted = true;
    if (b.outcome === 'won') bump('won', 1);
    else if (b.outcome === 'lost') bump('lost', 1);
    for (const f of b.mine) meet(f, false);
    for (const f of b.theirs) meet(f, true);
  };
  const scanFighters = () => {
    const b = ctx.battle;
    if (!b) return;
    for (const f of b.mine) meet(f, false);
    for (const f of b.theirs) meet(f, true);
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
    let rivals = 0;
    try { rivals = ctx.battles.rivals().length; } catch { /* no rivals */ }
    return {
      uni: us.length, held: ctx.box.count(), laws: laws.size, lawTotal: Math.max(1, lawSets().length),
      dived10: us.filter((r) => r[0] >= 10).length, floors: us.filter((r) => r[2] & 4).length,
      kinds: new Set(S.st.map((s) => s[2])).size, hot: S.st.some((s) => s[3] > 230), cold: S.st.some((s) => s[3] < 30), pulsar: S.st.some((s) => s[2] === 3), starN: S.st.length,
      worlds: ws.length, biomes: new Set(ws.map((w) => w.b)).size, era: ws.reduce((n, w) => Math.max(n, w.e), 0), creeds,
      people: ws.reduce((n, w) => n + w.p.length, 0), deeds3: ws.some((w) => w.p.some((p) => p[2].length >= 3)), towns: ws.reduce((n, w) => Math.max(n, w.v), 0),
      pk, combos: Object.keys(S.cb).length, says: said.size, sayTotal: ctx.skyRules.rules.length,
      mats, matFull, met: crs.filter((c) => c[2] === 1).length, mine: crs.filter((c) => c[2] === 0).length, elements: new Set(crs.map((c) => c[1])).size,
      rivalsAll: rivals > 0 && ctx.rivalsBeaten.size >= rivals,
      unlocked: Object.keys(S.a).length, n: N,
    };
  };
  const toasts: { text: string; title: string }[] = [];
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
      toasts.push({ title: `Deed · ${d.tier}`, text: `${d.name}. ${d.desc}` });
    }
  };
  const claim = (d: Deed): string | null => {
    if (S.a[d.id] !== 1) return null;
    const r = rewardOf(DEEDS.indexOf(d), d);
    let got = rewardText(r);
    if ('glow' in r) {
      // A full lamp takes no more: the reward comes as a piece for a sky instead.
      const piece = SKY_PIECE_KINDS[DEEDS.indexOf(d) % SKY_PIECE_KINDS.length] ?? 'dust';
      if (ctx.light.view().pips >= LIGHT_MAX_PIPS) { ctx.sky.grant(piece, 1); got = `1 ${piece}, for the lamp is full`; }
      else ctx.light.addGlow(r.glow);
    } else ctx.sky.grant(r.piece, r.count);
    S.a[d.id] = 2;
    N.claimed++;
    touch();
    save();
    safe(() => ctx.persist());
    return got;
  };

  // ---------- the loop ----------
  const scan = () => {
    safe(scanTime);
    safe(scanLight);
    safe(scanBox);
    safe(scanDive);
    safe(scanStar);
    safe(scanWorld);
    safe(scanSky);
    safe(scanFighters);
    booted = true;
    if (!S.seeded) { S.seeded = true; touch(); }
    if (changed || N.ms % 20000 < 500) { changed = false; safe(check); }
  };
  let acc = 0;
  let toastWait = 0;
  let saveWait = 0;
  shell.onFrame((dt) => {
    safe(scanBattle);
    acc += dt;
    toastWait -= dt;
    saveWait += dt;
    if (acc >= 400) { acc = 0; scan(); }
    if (toastWait <= 0 && toasts.length) {
      const t = toasts.shift();
      toastWait = 900;
      if (t) safe(() => shell.toast(t.text, { title: t.title }));
    }
    if (saveWait >= 4000) { saveWait = 0; safe(save); }
  });
  shell.onNavigate((_from, to) => {
    safe(() => {
      if (to === 'mirror') {
        bump('mir', 1);
        const u = ctx.selection.universe ?? ctx.dive.view().universe;
        const r = u ? uni(u.serialNumber) : null;
        if (r) flag(r, 12);
        newly('d', 'mirror');
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

  // ---------- codex page ----------
  type Built = { known: number; total: number; nodes: Node[] };
  const mark = (tab: TabId, key: string | number) => (isNew(tab, key) ? h('i', 'cx-new', 'new') : null);
  const swatch = (spec: UniverseSpec) => {
    const row = h('div', 'cx-swatch');
    for (const c of spec.palette) { const i = h('i'); i.style.background = c; row.append(i); }
    return row;
  };

  const tabUniverses = (): Built => {
    const rows = Object.entries(S.u).sort((a, b) => (b[1][2] & 1) - (a[1][2] & 1) || b[1][0] - a[1][0]);
    const held = new Set<number>();
    safe(() => { for (const e of ctx.box.slots()) if (e) held.add(e.serialNumber); });
    const nodes: Node[] = rows.map(([k, r]) => {
      const serial = Number(k);
      const spec = specOf(serial);
      const card = h('div', 'cx-card');
      const glyph = h('span', 'cx-glyph', spec ? glyphChar(spec.glyph) : '?');
      const state = held.has(serial) ? 'In the Box' : r[2] & 1 ? 'Let go' : 'Visited';
      card.append(h('div', 'cx-row', null, glyph, h('div', 'cx-grow', null, h('b', 'cx-name', spec?.name ?? 'Unnamed', mark('u', serial)), h('small', 'cx-sub', `${formatSerial(serial)} · ${state}`))));
      if (spec) card.append(swatch(spec), tags(spec.laws.tags));
      card.append(
        h('p', 'cx-line', `Deepest fold ${fmt(r[0])} · worlds tended ${fmt(r[1])}${r[2] & 4 ? ' · floor reached' : ''}`),
      );
      return card;
    });
    const empty = Math.max(0, BOX_SLOTS - held.size);
    if (empty > 0) nodes.push(silhouette(`${empty} slot${empty > 1 ? 's' : ''} of the Box lie empty. Flickers in the folds can be caught with a reliquary.`));
    return { known: rows.length, total: Math.max(BOX_SLOTS, rows.length), nodes };
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
  const tabLaws = (): Built => {
    const carriers = new Map<number, number[]>();
    for (const [k, r] of Object.entries(S.u)) { if (r[3] < 0) continue; const a = carriers.get(r[3]) ?? []; a.push(Number(k)); carriers.set(r[3], a); }
    const nodes: Node[] = [];
    const unknown: Node[] = [];
    lawSets().forEach((l, i) => {
      const who = carriers.get(i);
      if (!who) { unknown.push(silhouette(`A way of being not yet met. ${l.tags.length} mark${l.tags.length > 1 ? 's' : ''}, ${l.materials.length - 1} materials. Catch more universes; each is born under one.`)); return; }
      nodes.push(h('div', 'cx-card', null,
        h('b', 'cx-name', l.name, mark('l', i)), tags(l.tags), h('p', 'cx-say', lawSentence(i)),
        h('p', 'cx-line', `Carried by ${who.slice(0, 6).map(uniName).join(', ')}${who.length > 6 ? ` and ${who.length - 6} more` : ''}.`)));
    });
    return { known: nodes.length, total: lawSets().length, nodes: [...nodes, ...unknown] };
  };

  const tabStars = (): Built => {
    const kinds = new Set(S.st.map((s) => s[2]));
    const nodes: Node[] = [section('Kinds of sun', `${kinds.size} of ${STAR_KINDS.length}`)];
    STAR_KINDS.forEach((k, i) => {
      const n = S.st.filter((s) => s[2] === i).length;
      nodes.push(kinds.has(i) ? h('div', 'cx-card cx-slim', null, h('b', 'cx-name', `${STAR_WORD[i]}`), h('small', 'cx-sub', `${n} visited`)) : silhouette(STAR_HINT[i] ?? ''));
    });
    nodes.push(section('Systems visited', `${S.st.length}`));
    if (!S.st.length) nodes.push(silhouette('Hold to fall. Let go near a star to stop there.'));
    for (let i = S.st.length - 1; i >= 0; i--) {
      const s = S.st[i];
      if (!s) continue;
      nodes.push(h('div', 'cx-card', null,
        h('b', 'cx-name', s[5] || 'Unnamed', mark('s', s[0])),
        h('small', 'cx-sub', `${STAR_KINDS[s[2]] ?? 'star'} · heat ${s[3]} · ${s[4]} world${s[4] === 1 ? '' : 's'}`),
        h('p', 'cx-say', `${STAR_WORD[s[2]] ?? 'A star'}, ${heatWord(s[3])}, in ${uniName(s[1])}.`)));
    }
    return { known: kinds.size, total: STAR_KINDS.length, nodes };
  };

  const tabWorlds = (): Built => {
    const ws = Object.entries(S.w).reverse();
    const seen = new Set(ws.map(([, w]) => w.b));
    const nodes: Node[] = ws.map(([key, w]) => {
      const creeds = BELIEFS.filter((_, i) => i > 0 && w.c & (1 << i));
      const card = h('div', 'cx-card', null,
        h('b', 'cx-name', w.n || 'Unnamed', mark('w', key)),
        h('small', 'cx-sub', `${BIOMES[w.b] ?? 'world'} · ${uniName(w.u)}`),
        h('p', 'cx-line', `Peak souls ${fmt(w.s)} · most villages ${w.v}`),
        h('p', 'cx-line', `Eras: ${ERAS.slice(0, Math.min(ERAS.length, w.e + 1)).join(', ')}`),
        h('p', 'cx-line', creeds.length ? `Creeds: ${creeds.join(', ')}` : 'No creed seen yet.'));
      for (const p of w.p) {
        card.append(h('div', 'cx-person', null, h('b', '', `${p[0]}, ${p[1] || 'one of them'}`), ...(p[2].length ? p[2].map((d) => h('p', 'cx-say', d)) : [h('p', 'cx-say', 'Nothing is told of them yet.')])));
      }
      return card;
    });
    if (!ws.length) nodes.push(silhouette('Stop at a star, choose a world, and watch it.'));
    BIOMES.forEach((b, i) => { if (!seen.has(i)) nodes.push(silhouette(`${BIOME_HINT[i]} Look around other stars.`, `▒▒▒ ${'▒'.repeat(b.length)}`)); });
    return { known: seen.size, total: BIOMES.length, nodes };
  };

  const pieceNames = (key: string) => key.split('').map((c) => SKY_PIECE_KINDS[Number(c)] ?? '?');
  const tabSkies = (): Built => {
    const rules = ctx.skyRules.rules;
    const said = new Set<number>();
    for (const v of Object.values(S.cb)) for (const i of v) said.add(i);
    let pk = 0;
    const nodes: Node[] = [];
    const tiles = h('div', 'cx-tiles');
    SKY_PIECE_KINDS.forEach((k, i) => {
      const got = !!(S.pc & (1 << i));
      if (got) pk++;
      tiles.append(h('div', got ? 'cx-tile' : 'cx-tile cx-unknown', null, h('b', '', got ? k : '▒▒▒'), h('small', '', got ? PIECE_SAYS[k] : 'Not yet hung.')));
    });
    nodes.push(section('Pieces hung', `${pk} of ${SKY_PIECE_KINDS.length}`), tiles, section('What the sky rules said', `${said.size} of ${rules.length}`));
    rules.forEach((r, i) => {
      nodes.push(said.has(i)
        ? h('div', 'cx-card cx-slim', null, h('small', 'cx-sub', r.when.join(' + ')), h('p', 'cx-say', r.says))
        : silhouette(r.when.length > 1 ? (r.when[0] === r.when[1] ? 'Two of the same piece, hung together.' : 'Two different pieces, hung together.') : 'One piece, hung alone.', r.when.map(() => '▒▒▒').join(' + ')));
    });
    const combos = Object.entries(S.cb).reverse();
    nodes.push(section('Skies tried', `${combos.length}`));
    if (!combos.length) nodes.push(silhouette('Drag a sky piece onto a world’s orbit.'));
    for (const [key, idx] of combos) {
      nodes.push(h('div', 'cx-card', null, h('b', 'cx-name', pieceNames(key).join(' + '), mark('k', key)),
        ...(idx.length ? idx.map((i) => h('p', 'cx-say', rules[i]?.says ?? '')) : [h('p', 'cx-say', 'The sky said nothing.')])));
    }
    return { known: said.size + pk, total: rules.length + SKY_PIECE_KINDS.length, nodes };
  };

  const tabCreatures = (): Built => {
    const all = Object.entries(S.cr).reverse();
    const nodes: Node[] = [];
    const card = ([key, c]: [string, CreatureRec]) => h('div', 'cx-card', null,
      h('b', 'cx-name', c[0], mark('c', key)),
      h('small', 'cx-sub', `${ELEMENTS[c[1]] ?? 'unknown'} · ${key.startsWith('f') ? 'fused' : c[2] ? 'a rival’s' : 'yours'}`),
      c[3].length ? h('p', 'cx-line', `Traits: ${c[3].join(', ')}`) : null,
      c[4].length ? h('p', 'cx-line', `Skills: ${c[4].join(', ')}`) : null);
    const mine = all.filter(([, c]) => !c[2]);
    const theirs = all.filter(([, c]) => c[2]);
    nodes.push(section('Yours', `${mine.length}`), ...mine.map(card));
    if (!mine.length) nodes.push(silhouette('Go outside. Whatever your universes have become will fight for you.'));
    const serials = rivalSerials();
    const met = new Set(theirs.map(([k]) => Number(k)));
    const knownRivals = serials.filter((s) => met.has(s)).length;
    nodes.push(section('Theirs', `${knownRivals} of ${serials.length}`), ...theirs.map(card));
    safe(() => {
      for (const r of ctx.battles.rivals()) {
        const left = r.serials.filter((s) => !met.has(s)).length;
        if (left) nodes.push(silhouette(`${left} kept by ${r.name}, ${r.where}. Level ${r.level}.`));
      }
    });
    return { known: knownRivals, total: serials.length, nodes };
  };

  const tabMaterials = (): Built => {
    const nodes: Node[] = [];
    let known = 0;
    let total = 0;
    const engine = Object.entries(ENGINE).map(([name, m]) => ({ id: m.id, name, kind: 'engine', color: m.color }));
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
      nodes.push(section(l.name, `${got} of ${table.length}`));
      const grid = h('div', 'cx-tiles');
      for (const m of table) {
        const seen = ids.includes(m.id);
        const tile = h('div', seen ? 'cx-tile' : 'cx-tile cx-unknown');
        const dot = h('i', 'cx-dot');
        if (seen && spec) dot.style.background = spec.palette[m.color] ?? '';
        tile.append(dot, h('b', '', seen ? m.name : '▒▒▒', seen ? mark('m', `${li}:${m.id}`) : null), h('small', '', seen ? (m.kind === 'engine' ? 'found everywhere' : m.kind) : m.kind === 'engine' ? 'Weather makes it.' : `A ${m.kind}. Watch longer.`));
        grid.append(tile);
      }
      nodes.push(grid);
    }
    if (!nodes.length) nodes.push(silhouette('Watch a world. What its ground is made of is written here.'));
    const unseenLaws = lawSets().length - Object.keys(S.m).length;
    if (unseenLaws > 0) nodes.push(silhouette(`${unseenLaws} law set${unseenLaws > 1 ? 's have' : ' has'} ground you have not watched.`));
    return { known, total, nodes };
  };

  const tabDepths = (): Built => {
    const nodes: Node[] = [];
    const floors = Object.values(S.u).filter((r) => r[2] & 4).length;
    const marks: [boolean, string, string][] = MILESTONES.map((m) => [N.deep >= m, `Fold ${m}`, `Deeper than you have fallen. Fold ${m > 99 ? '???' : m} waits.`]);
    marks.push([floors > 0 || N.mir > 0, 'The floor', 'Every universe has a bottom. Keep falling in one.'], [N.mir > 0, 'The room at the bottom', 'Someone keeps a box down there.']);
    const got = marks.filter((m) => m[0]).length;
    nodes.push(section('Strata', `${got} of ${marks.length}`));
    for (const [ok, name, hint] of marks) nodes.push(ok ? h('div', 'cx-card cx-slim', null, h('b', 'cx-name', name), h('small', 'cx-sub', 'reached')) : silhouette(hint));
    const rows = Object.entries(S.u).filter(([, r]) => r[0] > 0 || r[2] & 12).sort((a, b) => b[1][0] - a[1][0]);
    nodes.push(section('Deepest folds', `${rows.length} universe${rows.length === 1 ? '' : 's'}`),
      h('p', 'cx-line', `Floors reached ${floors} · visits to the room at the bottom ${N.mir}${isNew('d', 'mirror') ? ' · new' : ''}`));
    const max = Math.max(1, ...rows.map(([, r]) => r[0]));
    for (const [k, r] of rows) {
      const bar = h('div', 'cx-bar', null, h('i'));
      (bar.firstElementChild as HTMLElement).style.width = `${Math.max(2, Math.round((r[0] / max) * 100))}%`;
      nodes.push(h('div', 'cx-card', null, h('div', 'cx-row', null, h('b', 'cx-name cx-grow', uniName(Number(k))), h('span', 'cx-count', `fold ${fmt(r[0])}`)), bar,
        r[2] & 12 ? h('small', 'cx-sub', r[2] & 8 ? 'You stood on its floor, in their room.' : 'You reached its floor.') : null));
    }
    if (!rows.length) nodes.push(silhouette('Open a universe and hold to fall.'));
    return { known: got, total: marks.length, nodes };
  };

  const BUILD: Record<TabId, () => Built> = { u: tabUniverses, l: tabLaws, s: tabStars, w: tabWorlds, k: tabSkies, c: tabCreatures, m: tabMaterials, d: tabDepths };
  let lastTab: TabId = 'u';
  const totalNew = () => Object.values(S.nw).reduce((a, b) => a + (b || 0), 0);

  shell.menu.add({
    id: 'codex',
    label: 'Codex',
    hint: 'Everything you have met.',
    order: 30,
    badge: () => { const n = totalNew(); return n > 0 ? `${n} new` : null; },
    render: (into) => {
      scan();
      const page = h('div', 'cx-page');
      const strip = h('div', 'cx-tabs');
      strip.setAttribute('role', 'tablist');
      const head = h('div', 'cx-head');
      const body = h('div', 'cx-list');
      const buttons = new Map<TabId, HTMLButtonElement>();
      const paint = () => {
        for (const [id, b] of buttons) {
          b.setAttribute('aria-selected', String(id === lastTab));
          b.classList.toggle('has-new', (S.nw[id] ?? 0) > 0 && id !== lastTab);
        }
      };
      const show = (id: TabId) => {
        // Leaving a tab clears its NEW marks.
        for (const k of [...news]) if (k.startsWith(`${lastTab}:`) && lastTab !== id) news.delete(k);
        lastTab = id;
        const frag = document.createDocumentFragment();
        let built: Built = { known: 0, total: 0, nodes: [] };
        try { built = BUILD[id](); } catch { built.nodes.push(silhouette('This page could not be read.')); }
        for (const n of built.nodes) frag.append(n);
        const label = TABS.find((t) => t[0] === id)?.[1] ?? '';
        const fresh = S.nw[id] ?? 0;
        head.replaceChildren(h('span', 'k-title', label), h('span', 'cx-count', `${built.known} of ${built.total}${fresh > 0 ? ` · ${fresh} new` : ''}`));
        body.replaceChildren(frag);
        if (fresh > 0) { S.nw[id] = 0; dirty = true; }
        paint();
        into.scrollTop = 0;
      };
      for (const [id, label] of TABS) {
        const b = h('button', 'cx-tab', label);
        b.type = 'button';
        b.dataset.id = `codex-tab-${id}`;
        b.setAttribute('role', 'tab');
        b.addEventListener('click', () => show(id));
        buttons.set(id, b);
        strip.append(b);
      }
      page.append(strip, head, body);
      into.append(page);
      show(lastTab);
      return () => { for (const k of [...news]) if (k.startsWith(`${lastTab}:`)) news.delete(k); safe(save); };
    },
  });

  // ---------- deeds page ----------
  const claimable = () => DEEDS.reduce((n, d) => n + (S.a[d.id] === 1 ? 1 : 0), 0);
  shell.menu.add({
    id: 'deeds',
    label: 'Deeds',
    hint: 'What you have done, and what it earned.',
    order: 40,
    badge: () => { const n = claimable(); return n > 0 ? `${n} to claim` : null; },
    render: (into) => {
      scan();
      const page = h('div', 'cx-page');
      const head = h('div', 'cx-progress');
      const list = h('div', 'cx-list');
      const paintHead = () => {
        const done = DEEDS.filter((d) => S.a[d.id]).length;
        const pct = Math.round((done / DEEDS.length) * 100);
        const bar = h('div', 'cx-bar', null, h('i'));
        (bar.firstElementChild as HTMLElement).style.width = `${pct}%`;
        const tiers = (['bronze', 'silver', 'gold'] as const).map((t) => `${TIER_MARK[t]} ${DEEDS.filter((d) => d.tier === t && S.a[d.id]).length}/${DEEDS.filter((d) => d.tier === t).length}`).join('   ');
        const pctEl = h('b', 'cx-pct', `${pct}%`);
        pctEl.dataset.id = 'deeds-percent';
        head.replaceChildren(h('div', 'cx-row', null, pctEl, h('div', 'cx-grow', null, h('span', 'k-label', `${done} of ${DEEDS.length} deeds`), h('small', 'cx-sub', tiers))), bar);
      };
      const card = (d: Deed): HTMLElement => {
        const st = S.a[d.id] ?? 0;
        const secret = !st && !!d.hidden;
        const c = h('div', `cx-card cx-deed cx-${d.tier}${st ? '' : ' cx-locked'}${secret ? ' cx-unknown' : ''}`);
        c.dataset.id = `deed-${d.id}`;
        const reward = rewardText(rewardOf(DEEDS.indexOf(d), d));
        c.append(h('div', 'cx-row', null, h('span', 'cx-medal', TIER_MARK[d.tier]),
          h('div', 'cx-grow', null, h('b', 'cx-name', secret ? '???' : d.name), h('p', 'cx-say', secret ? d.hidden ?? '' : d.desc), h('small', 'cx-sub', `${d.tier} · ${st === 2 ? 'claimed' : `reward ${secret ? '?' : reward}`}`))));
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
      for (const d of [...DEEDS].sort((a, b) => rank(a) - rank(b))) frag.append(card(d));
      list.append(frag);
      paintHead();
      page.append(head, list);
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
      const grid = h('div', 'cx-stats');
      const rows: [string, string, () => string][] = [
        ['folds', 'Folds fallen', () => fmt(N.folds)],
        ['deep', 'Deepest fold', () => fmt(N.deep)],
        ['stars', 'Stars stopped at', () => fmt(Math.max(N.stars, S.st.length))],
        ['hung', 'Sky pieces hung', () => fmt(N.hung)],
        ['souls', 'Most souls watched', () => fmt(N.souls)],
        ['vf', 'Villages seen founded', () => fmt(N.vf)],
        ['vl', 'Villages seen lost', () => fmt(N.vl)],
        ['won', 'Battles won', () => fmt(N.won)],
        ['lost', 'Battles lost', () => fmt(N.lost)],
        ['caught', 'Creatures caught', () => fmt(N.caught)],
        ['merges', 'Merges', () => fmt(N.merges)],
        ['mir', 'Floors stood on', () => fmt(N.mir)],
        ['uni', 'Universes known', () => fmt(Object.keys(S.u).length)],
        ['worlds', 'Worlds watched', () => fmt(Object.keys(S.w).length)],
        ['le', 'Light earned (pips)', () => pipsOf(N.le)],
        ['ls', 'Light spent (pips)', () => pipsOf(N.ls)],
        ['ms', 'Time played', () => clock(N.ms)],
        ['deeds', 'Deeds done', () => `${Object.keys(S.a).length} of ${DEEDS.length}`],
      ];
      const cells = rows.map(([id, label, get]) => {
        const v = h('b', '', '');
        v.dataset.id = `stat-${id}`;
        grid.append(h('div', 'cx-stat', null, v, h('span', '', label)));
        return [v, get] as const;
      });
      const paint = () => { scan(); for (const [v, get] of cells) { let t = '0'; try { t = get(); } catch { t = '0'; } if (v.textContent !== t) v.textContent = t; } };
      paint();
      page.append(h('p', 'k-narration', 'Mote has been counting.'), grid);
      into.append(page);
      const timer = window.setInterval(paint, 1000);
      return () => window.clearInterval(timer);
    },
  });

  scan();
};
