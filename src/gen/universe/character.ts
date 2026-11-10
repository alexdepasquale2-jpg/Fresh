// What makes a universe a character: rarity, temperament, traits, origin, description, motto, signature.
// Every draw here comes from child(seed, 'character/...'), never from the 'spec' stream, so the name,
// palette, glyph and law set of every serial are exactly what they were before this file existed.
import type { NameGen, Rarity, UniverseModifiers, UniverseSignature, UniverseTrait } from '@/contracts/universe';
import { RARITIES, UNIVERSE_PATTERNS } from '@/contracts/universe';
import type { Seed } from '@/contracts/seed';
import { child, rng } from '@/core/hash';
import type { Rng } from '@/core/hash';

/** Odds per thousand, common to mythic. */
export const RARITY_ODDS = [600, 250, 100, 40, 10] as const;

interface TraitDef extends UniverseTrait {
  /** Two traits of one group never meet (no "calm" with "storm-born"). */
  readonly group: string;
  /** Lowest rarity index that can roll it. */
  readonly tier: number;
  readonly weight: number;
}
const T = (id: string, name: string, group: string, says: string, mods: UniverseModifiers, dominant = false, tier = 0, weight = 10): TraitDef => ({ id, name, says, mods, dominant, group, tier, weight });
export const TRAITS: readonly TraitDef[] = [
  T('star-thick', 'Star-thick', 'stars', 'Its dark is crowded. You are never far from a star.', { starDensity: 15 }, true),
  T('thin-skied', 'Thin-skied', 'stars', 'Its stars are far apart, and each one burns the brighter for it.', { starDensity: -12, glow: 8 }),
  T('mild', 'Mild', 'climate', 'Its weather keeps its voice down.', { climateCalm: 15 }, true),
  T('storm-born', 'Storm-born', 'climate', 'Its skies do not settle. What lives here lives braced.', { climateCalm: -15, might: 8 }),
  T('bright-hearted', 'Bright-hearted', 'glow', 'Its worlds give off more light than they should.', { glow: 12 }, true),
  T('banked', 'Banked', 'glow', 'It gives its light slowly, like a fire covered for the night.', { glow: -6, ward: 10 }),
  T('tide-pulled', 'Tide-pulled', 'tide', 'Its water is always on its way somewhere.', { tide: 15 }),
  T('dry-boned', 'Dry-boned', 'tide', 'Water is a rumour here. The stone remembers it.', { tide: -12, ward: 6 }),
  T('quick-to-green', 'Quick to green', 'growth', 'Leave anything alone here and something grows on it.', { growth: 15 }, true),
  T('slow-to-root', 'Slow to root', 'growth', 'Little grows here, so what does is prayed to.', { growth: -10, faith: 10 }),
  T('deep-floored', 'Deep-floored', 'depth', 'It goes down further than it looks from the lid.', { depth: 15 }),
  T('near-bottomed', 'Near-bottomed', 'depth', 'Its floor is close. Things dropped here are soon found.', { depth: -12, luck: 8 }),
  T('kindly', 'Kindly', 'luck', 'It leaves small things where you will come across them.', { luck: 12 }),
  T('toothed', 'Toothed', 'might', 'What it makes, it makes with teeth.', { might: 12 }, true),
  T('thick-walled', 'Thick-walled', 'ward', 'Its villages stand a long time after they should have fallen.', { ward: 12 }, true),
  T('quick-pulsed', 'Quick-pulsed', 'tempo', 'Its years go by like breath.', { tempo: 12 }),
  T('long-yeared', 'Long-yeared', 'tempo', 'One of its afternoons could outlast a village.', { tempo: -12, climateCalm: 6 }),
  T('listening', 'Listening', 'faith', 'Its people look up early, and keep looking.', { faith: 15 }),
  T('unpersuaded', 'Unpersuaded', 'faith', 'Its people believe what they can lift.', { faith: -12, growth: 6 }),
  T('echoing', 'Echoing', 'special', 'Sounds made in it come back a little changed.', { luck: 8, depth: 8 }, false, 2, 8),
  T('twice-lit', 'Twice-lit', 'special', 'Everything in it casts two shadows.', { glow: 10, starDensity: 8 }, true, 2, 8),
  T('salt-kept', 'Salt-kept', 'special', 'Nothing in it quite rots.', { ward: 10, tide: 6 }, false, 2, 8),
  T('hollow-cored', 'Hollow-cored', 'special', 'Something was taken out of the middle of it, long ago.', { depth: 20, ward: -6 }, false, 3, 8),
  T('crowned', 'Crowned', 'special', 'It behaves as though it were being watched by its betters.', { might: 10, ward: 10, faith: 8 }, true, 3, 8),
  T('unwitnessed', 'Unwitnessed', 'special', 'Nothing in it had ever been looked at before you.', { luck: 15, glow: 15, starDensity: 10 }, true, 4, 30),
];

const TEMPERAMENTS: readonly { id: string; mods: UniverseModifiers; lines: readonly string[] }[] = [
  { id: 'placid', mods: { climateCalm: 4 }, lines: ['It does not mind being held.', 'It sits in the hand like a warm stone.', 'Nothing in it is in a hurry.'] },
  { id: 'restless', mods: { tempo: 4 }, lines: ['It turns over in the Box at night.', 'It will not keep still for long.', 'You can feel it ticking through the lid.'] },
  { id: 'watchful', mods: { luck: 3 }, lines: ['It knows when the lid is open.', 'It goes quiet when you look at it.', 'Something in it keeps count of you.'] },
  { id: 'hungry', mods: { growth: 4 }, lines: ['It takes whatever sky it is given and asks for more.', 'It leans toward the light.', 'It is never quite full.'] },
  { id: 'shy', mods: { starDensity: -3, glow: 3 }, lines: ['It dims a little when it is opened.', 'It shows you less than it has.', 'It would rather be left at the back of the Box.'] },
  { id: 'proud', mods: { might: 4 }, lines: ['It holds itself very straight.', 'It does not like to be set beside another.', 'It expects to be remembered.'] },
  { id: 'mournful', mods: { faith: 4 }, lines: ['It hums something low that has no end.', 'It seems to be missing someone.', 'It keeps a place laid for a guest who does not come.'] },
  { id: 'patient', mods: { tempo: -4 }, lines: ['It can wait longer than you can.', 'It has all the time it needs.', 'It was old before the Box was made.'] },
  { id: 'feral', mods: { might: 3, climateCalm: -3 }, lines: ['It has never been tended and does not want to be.', 'It bites at the edges of the lid.', 'It has not learned its name yet.'] },
  { id: 'kind', mods: { luck: 4 }, lines: ['It is gentle with what falls into it.', 'It warms the slot it sits in.', 'It gives things back.'] },
  { id: 'cold', mods: { ward: 4 }, lines: ['It does not warm to the hand.', 'Frost comes off it in a thin breath.', 'It keeps its own counsel.'] },
  { id: 'dreaming', mods: { depth: 4 }, lines: ['It is asleep, mostly.', 'What you see in it may only be what it dreams.', 'It mutters when the room is dark.'] },
];

/** What each law tag is made of, for the grammar. Unknown tags fall back to the tag itself, lower-cased. */
const STUFF: Record<string, readonly string[]> = {
  ASH: ['ash', 'grey drifts', 'cold hearths'], CHOIR: ['singing', 'held notes', 'voices with no mouths'], 'COLD FIRE': ['cold fire', 'flame that does not warm', 'blue embers'],
  PLAIN: ['plain stone', 'first light', 'ordinary mornings'], GLASS: ['glass', 'thin bright edges', 'things you can see through'], RAIN: ['rain', 'falling water', 'wet roofs'],
  PALE: ['pale light', 'whitened ground', 'faded things'], GREEN: ['moss', 'slow green', 'soft growth'], SALT: ['salt', 'white crusts', 'dried seas'],
  TIDES: ['tides', 'water that comes back', 'long shores'], 'SLOW TIME': ['slow hours', 'afternoons that do not end', 'stopped clocks'], TALLOW: ['tallow', 'candle fat', 'warm grease'], BLOOM: ['bloom', 'flowers of wax', 'sudden blossom'],
};
const FILLER = ['dust', 'quiet', 'long shadows', 'small lamps', 'stillness', 'old weather', 'low stars', 'shut doors', 'thin air', 'patience'];
const OPEN = [
  '{name} is a {temper} universe of {a} and {b}.', 'A {temper} place, {name}: {a}, and under it, {b}.', '{name} is made of {a}. Look closer: {b}.',
  'In {name} there is {a}, and there is {b}, and not much else.', '{name} keeps {a} the way other universes keep stars.', 'Open {name} and you find {a} first, then {b}.',
  '{name} is {temper}. It is mostly {a}.', 'They would call {name} a universe of {a}, if anyone were there to call it anything.', '{a}, {b}, and a {temper} dark: that is {name}.',
  '{name} was folded out of {a} and {b}.', 'What {name} has is {a}. What it wants is {b}.', 'There is a {temper} universe called {name}. It runs on {a}.',
];
const CLOSE = [
  'Hold it to your ear and you can hear {sound}.', 'It smells faintly of {smell}.', 'It is {weight} than it looks.', 'Nobody remembers putting it in the Box.',
  'It was like this when you found it.', 'It has been opened before, by someone else.', 'Late at night it sounds like {sound}.', 'The slot it sits in is always a little {feel}.',
  'Mote does not like to look straight at it.', 'Mote brightens near it.', 'It is not finished. None of them are.', 'Somewhere in it, a door is open.',
  'It hums on {day}.', 'Whatever made it left the smell of {smell} on it.', 'It has a bottom. Something lives there.', 'It is waiting for a sky.',
];
const SOUND = ['rain on a roof', 'a far bell', 'someone breathing', 'wind in a jar', 'the sea, very small', 'pages turning', 'a slow drip', 'ice settling', 'a held note', 'footsteps going down', 'nothing at all', 'a fire burning low'];
const SMELL = ['candle smoke', 'salt', 'wet stone', 'cold ash', 'rain', 'old paper', 'struck matches', 'moss', 'tin', 'snow', 'warm wax', 'a shut room'];
const WEIGHT = ['heavier', 'lighter', 'colder', 'warmer', 'older', 'smaller', 'deeper'];
const FEEL = ['warm', 'damp', 'cold', 'dusty', 'bright'];
const DAY = ['cold mornings', 'nights with no moon', 'days it rains', 'the first day of the week', 'days nobody opens the Box'];
const RARE_LINE: Record<Rarity, readonly string[]> = {
  common: [], uncommon: [],
  rare: ['There are not many like it.', 'You will not find its like twice.'],
  epic: ['Most Boxes never hold one of these.', 'It is the kind a kid would trade everything for.'],
  mythic: ['There should not be one of these at all.', 'Nobody will believe you have it.'],
};
const ORIGIN = [
  'Found {where}.', 'It was {where} when the Box was first opened.', 'Somebody left it {where}.', 'It rolled out and stopped {where}, {when}.', 'It came up from the bottom of another universe, {when}.',
  'It turned up {where}, {when}.', 'It budded off something larger, {when}.', 'It was caught mid-flicker, {when}.', 'It was won, not found. Nobody says from whom.', 'It was already old {when}.',
  'It was {where}, wrapped in {wrap}.', 'It fell out of {wrap}, {when}.', 'Traded for {wrap}, {when}.', 'It was the last one left {where}.',
];
const WHERE = ['under the bed', 'at the back of a drawer', 'in a coat pocket', 'behind the radiator', 'between two floorboards', 'in the toe of a sock', 'under the stairs', 'on the windowsill', 'in a shoebox', 'at the bottom of the toy chest', 'inside a hollow book', 'in the garden, after rain'];
const WHEN = ['one winter', 'a long time ago', 'on a night with no power', 'the summer the well went dry', 'before you could read', 'on a school night', 'the day after the storm', 'when nobody was looking', 'on the first cold morning', 'last year, or the one before'];
const WRAP = ['a handkerchief', 'yesterday\'s paper', 'a marble and a button', 'grey wool', 'a library book', 'a matchbox', 'tin foil', 'an old glove'];
const MOTTO = [
  '{v} the {n}.', 'No {n} without {n2}.', 'Still {a}.', '{a}, and {a2}.', 'After the {n}, the {n2}.', 'We {v2} what we are given.', 'Under one {n}.', 'Let the {n} {v3}.',
  'Not yet, but {a}.', 'The {n} remembers.', 'Small {n}, long {n2}.', 'What falls is {a}.', 'Ask the {n}.', 'Each {n} a {n2}.', 'Slowly, {a}.', 'Keep the {n} lit.',
];
const M = {
  v: ['Keep', 'Tend', 'Mind', 'Bank', 'Follow', 'Wait for', 'Mend', 'Carry'], v2: ['keep', 'tend', 'burn', 'mend', 'bury', 'carry', 'weigh'], v3: ['fall', 'burn', 'wait', 'pass', 'come', 'rest'],
  n: ['lamp', 'tide', 'ash', 'door', 'night', 'stone', 'bell', 'root', 'sky', 'well', 'wick', 'thread'], a: ['burning', 'here', 'patient', 'unbroken', 'kept', 'falling', 'quiet', 'awake', 'small', 'whole'],
};

const fillWith = (pattern: string, r: Rng, fixed: Record<string, string>, lists: Record<string, readonly string[]>): string =>
  pattern.replace(/\{(\w+?)(\d?)\}/g, (_, k: string, d: string) => fixed[k + d] ?? fixed[k] ?? r.pick(lists[k + d] ?? lists[k] ?? ['']));
const article = (s: string) => s.replace(/\b([Aa]) ([aeio])/g, '$1n $2');

export const sumMods = (list: readonly UniverseModifiers[]): UniverseModifiers => {
  const out: Record<string, number> = {};
  for (const m of list) for (const [k, v] of Object.entries(m)) if (typeof v === 'number' && v !== 0) out[k] = (out[k] ?? 0) + v;
  for (const k of Object.keys(out)) if (out[k] === 0) delete out[k];
  return out;
};

export const rarityOf = (seed: Seed): Rarity => {
  let roll = rng(child(seed, 'character/rarity')).int(1000);
  for (let i = 0; i < RARITY_ODDS.length; i++) {
    if (roll < RARITY_ODDS[i]!) return RARITIES[i]!;
    roll -= RARITY_ODDS[i]!;
  }
  return 'common';
};

export interface Character {
  rarity: Rarity;
  temperament: string;
  traits: UniverseTrait[];
  modifiers: UniverseModifiers;
  origin: string;
  description: string;
  motto: string;
  signature: UniverseSignature;
  nameFamily: number;
}

export const character = (seed: Seed, name: string, tags: readonly string[], names: NameGen): Character => {
  const rarity = rarityOf(seed);
  const tier = RARITIES.indexOf(rarity);
  const temper = rng(child(seed, 'character/temper')).pick(TEMPERAMENTS);

  // Traits: weighted, one per group, three for rare and above. A mythic always carries its mark.
  const rt = rng(child(seed, 'character/traits'));
  const want = tier >= 2 ? 3 : 2;
  const traits: TraitDef[] = [];
  if (tier === 4) traits.push(TRAITS.find((t) => t.id === 'unwitnessed')!);
  while (traits.length < want) {
    const pool = TRAITS.filter((t) => t.tier <= tier && !traits.some((x) => x.group === t.group));
    let roll = rt.int(pool.reduce((n, t) => n + t.weight, 0));
    const got = pool.find((t) => (roll -= t.weight) < 0) ?? pool[0]!;
    traits.push(got);
  }
  const plain: UniverseTrait[] = traits.map((t) => ({ id: t.id, name: t.name, says: t.says, mods: { ...t.mods }, dominant: t.dominant }));
  const modifiers = sumMods([...traits.map((t) => t.mods), temper.mods, { luck: [0, 1, 2, 4, 6][tier]! }]);

  const rw = rng(child(seed, 'character/words'));
  const stuff = tags.map((t) => rw.pick(STUFF[t] ?? [t.toLowerCase()]));
  const a = stuff[0] ?? rw.pick(FILLER);
  const b = stuff[1] ?? rw.pick(FILLER.filter((f) => f !== a));
  const lists = { sound: SOUND, smell: SMELL, weight: WEIGHT, feel: FEEL, day: DAY, where: WHERE, when: WHEN, wrap: WRAP, ...M };
  const open = article(fillWith(rw.pick(OPEN), rw, { name, temper: temper.id, a, b }, lists));
  const first = open.charAt(0).toUpperCase() + open.slice(1);
  const extra = RARE_LINE[rarity];
  const description = [first, rw.pick(temper.lines), ...plain.slice(0, 2).map((t) => t.says), ...(extra.length ? [rw.pick(extra)] : []), fillWith(rw.pick(CLOSE), rw, {}, lists)].join(' ');

  const ro = rng(child(seed, 'character/origin'));
  const origin = fillWith(ro.pick(ORIGIN), ro, {}, lists);
  const rm = rng(child(seed, 'character/motto'));
  // A motto never says the same word twice.
  let motto = '';
  for (let i = 0; i < 4; i++) {
    const n = rm.pick(M.n), a1 = rm.pick(M.a);
    motto = fillWith(rm.pick(MOTTO), rm, { n, n2: rm.pick(M.n.filter((x) => x !== n)), a: a1, a2: rm.pick(M.a.filter((x) => x !== a1)) }, lists);
    motto = motto.charAt(0).toUpperCase() + motto.slice(1);
    if (motto.length <= 40) break;
  }

  const rs = rng(child(seed, 'character/signature'));
  const pattern = rs.int(UNIVERSE_PATTERNS.length);
  const signature: UniverseSignature = {
    pattern,
    patternName: UNIVERSE_PATTERNS[pattern]!,
    // Main from the law-tinted colours, second from the warm earths, spark from the lights.
    accents: [rs.pick([11, 12, 15]), rs.pick([6, 7, 13, 14, 4]), rs.pick([8, 9, 10])],
    turn: rs.int(8),
    repeat: 1 + rs.int(4),
  };
  const nameFamily = names.family ? names.family(seed) : rng(child(seed, 'family')).int(8);
  return { rarity, temperament: temper.id, traits: plain, modifiers, origin, description, motto, signature, nameFamily };
};
