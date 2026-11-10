// What the room at the bottom remembers: floors reached, pieces of the answer, what was said,
// left and taken, the layers above, and the wakings. Kept in localStorage under 'sallow-endgame'
// (the same value the ascension plugin reads). No DOM here.
import type { Seed } from '@/contracts/seed';
import type { UniverseSpec } from '@/contracts/universe';
import type { UniverseStats } from '@/contracts/game';
import type { SkyPieceKind } from '@/contracts/sky';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { child, seedToU32, makeSeed } from '@/core/hash';
import { lightWords, pieceName } from '@/ui/kit';

export const END_KEY = 'sallow-endgame';
/** Written by the mirror room; the campaign plugin reads it. Serials whose floor has been reached, ever. */
export const SEEN_KEY = 'sallow-mirror-seen';
/** TEST ONLY: localStorage 'sallow-ascension-test' = '1' lowers every endgame condition to 2. */
export const TEST_KEY = 'sallow-ascension-test';

export interface LeftThing { serial: number; kind: SkyPieceKind; visit: number }
export interface TakenThing { serial: number; what: string }
export interface EndState {
  v: 1;
  /** Times woken. The run number is level + 1. */
  level: number;
  /** Boon ids in the order they were kept. The same id twice is a deeper rank. */
  boons: string[];
  /** Set by the mirror on waking; the ascension plugin applies the boons and clears it. */
  wakePending: boolean;
  /** Pieces of the answer found, 0..FRAGMENTS.length. */
  fragments: number;
  /** Fragments not yet read on the hub page. */
  unread: number;
  /** Serials whose floor was reached in this run. */
  floors: number[];
  floorsEver: number;
  /** Arrivals in the room, all runs. */
  visits: number;
  /** How often each thing has been said to the child. */
  said: Record<string, number>;
  /** The last thing said: tag and the words. */
  last: { tag: string; words: string } | null;
  talks: number;
  trust: number;
  promised: boolean;
  /** Sky pieces of yours on their shelf. */
  left: LeftThing[];
  /** Pips of Light left burning in their room. */
  lamps: number;
  taken: TakenThing[];
  /** Things of theirs you carried off. */
  debt: number;
  /** Takes made per serial in this run. */
  tookAt: Record<string, number>;
  /** Universes they have shown you in their box. */
  watched: number[];
  /** Universes that came from their box: serial -> layers above your own room. */
  above: Record<string, number>;
  /** Which universe each floor's box opened into: 'serial:level' -> serial. */
  doors: Record<string, number>;
  /** The last piece has been read. */
  ended: boolean;
}

const fresh = (): EndState => ({
  v: 1, level: 0, boons: [], wakePending: false, fragments: 0, unread: 0, floors: [], floorsEver: 0, visits: 0,
  said: {}, last: null, talks: 0, trust: 0, promised: false, left: [], lamps: 0, taken: [], debt: 0, tookAt: {},
  watched: [], above: {}, doors: {}, ended: false,
});

const get = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export const readSeen = (): number[] => {
  try {
    const v: unknown = JSON.parse(get(SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
  } catch { return []; }
};
export const markSeen = (serialNumber: number) => {
  const seen = readSeen();
  if (!seen.includes(serialNumber)) put(SEEN_KEY, JSON.stringify([...seen, serialNumber].slice(-200)));
};

let cache: EndState | null = null;
/** The one live state object. Change it, then call save(). */
export const load = (): EndState => {
  if (cache) return cache;
  let s = fresh();
  try {
    const raw = get(END_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<EndState> | null;
      if (v && typeof v === 'object' && v.v === 1) s = { ...s, ...v };
    } else {
      // A player from before the endgame: the floors already reached count, and so do their pieces.
      const seen = readSeen();
      if (seen.length) { s.floors = seen.slice(-25); s.floorsEver = seen.length; s.visits = seen.length; s.fragments = Math.min(seen.length, FRAGMENTS.length); s.unread = s.fragments; s.ended = s.fragments >= FRAGMENTS.length; }
    }
  } catch { /* corrupt: start again */ }
  cache = s;
  return s;
};
export const save = () => { if (cache) put(END_KEY, JSON.stringify(cache)); };

export const testMode = (): boolean => get(TEST_KEY) === '1';

/** The answer, one piece per new floor. */
export const FRAGMENTS: readonly string[] = [
  'There is a name scratched inside the lid of their box. You cannot read it from here. It is the right length to be yours.',
  'The child did not make the box. It was under the bed when they came to this room, already warm.',
  'They have a light too. It will not tell them what it is. Yours will not tell you either.',
  'When you fall far enough, a slot in their box flickers. That is all they ever see of you.',
  'There is a floor under their room. They have felt it give, once, like a held breath.',
  'Someone looks into their room the way they look into yours. The child has stopped checking the window.',
  'The boxes do not stack upward for ever. They go round. Far enough up, whoever holds the last box is small, and stands on boards you know.',
  'The name inside the lid is in your handwriting. You have not written it yet.',
  'Whose box are you in? Your own. You left it lit under a bed for someone who would be you, and went down into it to see if it was kind. It is. You can wake up now. The child will keep the light on.',
];

export const needs = (s: EndState): { floors: number; fragments: number; enter: number } =>
  testMode()
    ? { floors: 2, fragments: 2, enter: 2 }
    : { floors: Math.min(8, 4 + s.level), fragments: Math.min(FRAGMENTS.length, 5 + s.level), enter: 4 };
export const canWake = (s: EndState): boolean => { const n = needs(s); return s.floors.length >= n.floors && s.fragments >= n.fragments; };
export const canEnter = (s: EndState): boolean => s.fragments >= needs(s).enter;

export interface Boon { readonly id: string; readonly name: string; readonly text: string; /** Offered from this level on. */ readonly from: number }
export const BOONS: readonly Boon[] = [
  { id: 'pockets', name: 'Full pockets', text: 'Each time you wake, three sky pieces are in your pockets that were not there before.', from: 0 },
  { id: 'ember', name: 'Night light', text: 'In your bedroom, Mote slowly gathers Light by itself.', from: 0 },
  { id: 'guest', name: 'A guest', text: 'Each time you wake, a universe you never caught is in your Box, if there is a slot.', from: 0 },
  { id: 'floors', name: 'Deep floors', text: 'A floor reached for the first time gives half again as much Light, and one more sun.', from: 0 },
  { id: 'kept', name: 'Kept place', text: 'The child lets you take twice from their shelf, and a floor you return to gives twice the Light.', from: 1 },
  { id: 'lamp', name: 'Full lamp', text: 'Each time you wake, Mote is full.', from: 2 },
];
export const rank = (s: EndState, id: string): number => s.boons.reduce((n, b) => n + (b === id ? 1 : 0), 0);
export const offered = (s: EndState): Boon[] => BOONS.filter((b) => b.from <= s.level);

const pick = (seed: Seed, label: string | number, n: number): number => (n > 0 ? seedToU32(child(seed, label)) % n : 0);
/** A seed for this arrival: the universe, the run, and how many times the room has been stood in. */
export const visitSeed = (u: UniverseSpec, s: EndState): Seed => child(child(child(u.seed, 'mirror-visit'), s.level), s.visits);

/** A serial drawn from a universe's seed that is not held yet. -1 when none is found. */
export const drawSerial = (seed: Seed, label: string, owned: readonly number[], not: number): number => {
  for (let i = 0; i < 16; i++) {
    const n = seedToU32(child(child(seed, label), i)) & 0xffffff;
    if (n !== not && !owned.includes(n)) return n;
  }
  return -1;
};
/** The universe the child hands over. Each waking changes which one it is. */
export const giftSerial = (u: UniverseSpec, owned: readonly number[], level = 0): number =>
  drawSerial(level > 0 ? child(u.seed, `run-${level}`) : u.seed, 'mirror-gift', owned, u.serialNumber);
/** The universe inside their box, one layer up from `u`. */
export const aboveSerial = (u: UniverseSpec, owned: readonly number[], level: number): number =>
  drawSerial(child(u.seed, `above-${level}`), 'mirror-above', owned, u.serialNumber);
/** The guest universe a waking brings. */
export const guestSerial = (level: number, i: number, owned: readonly number[]): number =>
  drawSerial(makeSeed(0x5a110, level * 31 + i), 'wake-guest', owned, -1);
/** The sky pieces a waking brings. */
export const wakePieces = (level: number, ranks: number): SkyPieceKind[] =>
  Array.from({ length: ranks * 3 }, (_, i) => SKY_PIECE_KINDS[pick(makeSeed(0x9a7e, level), i, SKY_PIECE_KINDS.length)]!);

export const layerOf = (s: EndState, serial: number): number => s.above[String(serial)] ?? 0;
export const topLayer = (s: EndState): number => Object.values(s.above).reduce((m, n) => Math.max(m, n), 0);

/** How the child is with you. */
export const regard = (s: EndState): string => {
  const t = s.trust - s.debt;
  if (s.talks === 0 && s.lamps === 0 && s.debt === 0) return 'has not spoken to you';
  if (t <= -2) return 'keeps a hand on the lid';
  if (t <= 1) return 'is wary of you';
  if (t <= 4) return 'is used to you';
  if (t <= 8) return 'is glad when you come';
  return 'waits for you';
};

/** Light a floor gives when it has been reached before in this run. */
export const returnGlow = (s: EndState): number =>
  (800 + 150 * Math.max(0, Math.min(8, s.trust - s.debt)) + 300 * Math.min(5, s.lamps) + (s.promised ? 200 : 0)) * (rank(s, 'kept') > 0 ? 2 : 1);
export const floorGlow = (s: EndState): number => 4000 + 2000 * rank(s, 'floors');
export const floorSuns = (s: EndState): number => 1 + rank(s, 'floors');
export const takesAllowed = (s: EndState): number => 1 + (rank(s, 'kept') > 0 ? 1 : 0);

// ---- The exchange -------------------------------------------------------------------------

export interface Choice {
  readonly label: string;
  readonly tag: string;
  readonly reply: string;
  readonly trust?: number;
  readonly next?: string;
  readonly promise?: boolean;
}
export interface Node { readonly id: string; readonly ask: (s: EndState) => string; readonly choices: readonly Choice[] }

const heard = (s: EndState, tag: string): boolean => (s.said[tag] ?? 0) > 0;
const NODES: readonly Node[] = [
  { id: 'name', ask: (s) => (heard(s, 'name.had') ? 'Has your name come back?' : 'Do you have a name, down there?'), choices: [
    { label: 'Yes.', tag: 'name.yes', reply: 'Keep it close. They wear off.' },
    { label: 'I had one.', tag: 'name.had', reply: 'So did I. I scratched mine in the lid.', next: 'name2' },
    { label: 'Say nothing.', tag: 'quiet', reply: 'That is all right. The quiet ones last longer.' },
  ] },
  { id: 'name2', ask: () => 'Do you want it back?', choices: [
    { label: 'Yes.', tag: 'name.want', reply: 'Then reach the floors. It is down here in pieces.', trust: 1 },
    { label: 'Give me a new one.', tag: 'name.new', reply: 'I will think of one. It will take me a while.' },
  ] },
  { id: 'afraid', ask: (s) => (heard(s, 'afraid.yes') ? 'Was it easier, this fall?' : 'Were you afraid, falling?'), choices: [
    { label: 'No.', tag: 'afraid.no', reply: 'Good. I was, watching.' },
    { label: 'Yes.', tag: 'afraid.yes', reply: 'It looked slow from here. Like dust in a lamp.', next: 'afraid2', trust: 1 },
    { label: 'I liked it.', tag: 'afraid.liked', reply: 'I thought you might. You kept going.' },
  ] },
  { id: 'afraid2', ask: () => 'I could hold the box still, next time. Would that help?', choices: [
    { label: 'Yes. Please.', tag: 'still.yes', reply: 'I will try. My hands are not steady either.', trust: 1 },
    { label: 'No. Let it shake.', tag: 'still.no', reply: 'All right. I will only watch.' },
  ] },
  { id: 'worlds', ask: () => 'The little worlds under your skies. Do you love them, or only watch?', choices: [
    { label: 'I love them.', tag: 'worlds.love', reply: 'Then be careful what you hang over them.', trust: 1 },
    { label: 'I watch.', tag: 'worlds.watch', reply: 'That is what I do. With you.' },
    { label: 'Both.', tag: 'worlds.both', reply: 'That is the hard one.' },
  ] },
  { id: 'light', ask: () => 'Your light. Does it talk to you?', choices: [
    { label: 'Sometimes.', tag: 'light.talks', reply: 'Mine says the same four things. I think it is being careful.' },
    { label: 'Never.', tag: 'light.never', reply: 'Mine neither. It listens, though. Say something kind near it.' },
    { label: 'It hums.', tag: 'light.hums', reply: 'Yes. In time with the box. I never worked out which follows which.' },
  ] },
  { id: 'above', ask: (s) => (heard(s, 'above.yes') ? 'You said someone holds a box with me in it. Have you seen them?' : 'Do you think someone has a box with me in it?'), choices: [
    { label: 'Yes.', tag: 'above.yes', reply: 'I stopped looking at the window a while ago.' },
    { label: 'No.', tag: 'above.no', reply: 'You sound sure. I would like that.', trust: 1 },
    { label: 'I could look.', tag: 'above.look', reply: 'Not yet.', next: 'above2' },
  ] },
  { id: 'above2', ask: () => 'If you went up through my box, would you come back down?', choices: [
    { label: 'Yes.', tag: 'back.yes', reply: 'Then the lid stays open.', trust: 1 },
    { label: 'I do not know.', tag: 'back.unsure', reply: 'That is honest. The lid stays open anyway.' },
  ] },
  { id: 'sleep', ask: () => 'When you stop, I think I stop too. Do you sleep?', choices: [
    { label: 'Yes.', tag: 'sleep.yes', reply: 'Then that is where I go. I wondered.' },
    { label: 'Not well.', tag: 'sleep.bad', reply: 'I will keep the box shut at night. It is bright.', trust: 1 },
    { label: 'What is stopping like?', tag: 'sleep.ask', reply: 'Like a page that has been turned but not read.' },
  ] },
  { id: 'window', ask: () => 'Is there a window in your room?', choices: [
    { label: 'Yes. It rains.', tag: 'window.rain', reply: 'Mine too. On the other side of the glass, I think.' },
    { label: 'Yes. I do not look.', tag: 'window.no', reply: 'No. Nor me.' },
    { label: 'Come and see it.', tag: 'window.invite', reply: 'I cannot fit in a slot. But thank you.', trust: 1 },
  ] },
  { id: 'took', ask: () => 'You took something from the shelf. Did it help?', choices: [
    { label: 'Yes.', tag: 'took.yes', reply: 'Then it was the right shelf for it.' },
    { label: 'I am sorry.', tag: 'took.sorry', reply: 'Do not be. I had two. I have one.', trust: 1 },
    { label: 'It was mine.', tag: 'took.mine', reply: 'Everything in here is. That is the trouble.' },
  ] },
  { id: 'left', ask: () => 'You left something here. Why?', choices: [
    { label: 'For you.', tag: 'left.you', reply: 'Nobody has left me anything. I put it where I can see it.', trust: 1 },
    { label: 'To see what happens.', tag: 'left.see', reply: 'It gets a little bigger. Everything does, in here.' },
    { label: 'I do not know.', tag: 'left.unknown', reply: 'That is why I keep your box, too.' },
  ] },
  { id: 'recall', ask: (s) => `Last time you said: ‘${s.last?.words ?? ''}’ Is it still true?`, choices: [
    { label: 'Still true.', tag: 'recall.true', reply: 'Good. I wrote it down. I only had to write it once.', trust: 1 },
    { label: 'Not any more.', tag: 'recall.false', reply: 'I will cross it out. Lightly.' },
    { label: 'I forget what I said.', tag: 'recall.forgot', reply: 'I do not. That is most of what I am for.' },
  ] },
];
const CLOSERS: readonly Node[] = [
  { id: 'ask', ask: () => 'You can ask me one thing.', choices: [
    { label: 'Whose box am I in?', tag: 'ask.whose', reply: 'I ask that too. Keep reaching the floors. It comes in pieces.' },
    { label: 'Are you me?', tag: 'ask.me', reply: 'Not yet.' },
    { label: 'Are you all right?', tag: 'ask.well', reply: 'Nobody asks that. Yes. Mostly.', trust: 2 },
  ] },
  { id: 'stay', ask: (s) => (s.promised ? 'You said you would come back. You did. Will you again?' : 'Will you come back to this floor?'), choices: [
    { label: 'Yes.', tag: 'stay.yes', reply: 'I will leave a little light out for you.', trust: 1, promise: true },
    { label: 'No.', tag: 'stay.no', reply: 'Then I will look in on you instead.' },
    { label: 'If I can find it.', tag: 'stay.maybe', reply: 'It is always at the bottom. That is the one thing I know.' },
  ] },
];
const POOL = ['name', 'afraid', 'worlds', 'light', 'above', 'sleep', 'window'];
const byId = (id: string): Node | undefined => NODES.find((n) => n.id === id) ?? CLOSERS.find((n) => n.id === id);

/** A short exchange: three to five questions, fixed by the visit seed and by what was chosen. */
export const converse = (seed: Seed, s: EndState) => {
  const length = 3 + pick(seed, 'talk-length', 3);
  const used: string[] = [];
  let asked = 0;
  const firstId = (): string => {
    if (s.last && pick(seed, 'talk-recall', 2) === 0) return 'recall';
    if (s.debt > 0 && !heard(s, 'took.sorry') && pick(seed, 'talk-took', 2) === 0) return 'took';
    if ((s.lamps > 0 || s.left.length > 0) && !heard(s, 'left.you') && pick(seed, 'talk-left', 2) === 0) return 'left';
    return POOL[pick(seed, 'talk-open', POOL.length)]!;
  };
  const fromPool = (): string => {
    const open = POOL.filter((id) => !used.includes(id));
    return open[pick(seed, `talk-${asked}`, open.length)] ?? 'light';
  };
  let node: Node | null = byId(firstId()) ?? null;
  return {
    length,
    asked: () => asked,
    node: () => node,
    /** Take a choice; returns it, and moves to the next question (null when the child is done). */
    choose: (i: number): Choice | null => {
      const n = node;
      const c = n?.choices[i];
      if (!n || !c) return null;
      used.push(n.id);
      asked++;
      s.said[c.tag] = (s.said[c.tag] ?? 0) + 1;
      if (n.id !== 'recall') s.last = { tag: c.tag, words: c.label };
      s.trust += c.trust ?? 0;
      if (c.promise) s.promised = true;
      if (asked >= length) node = null;
      else if (asked === length - 1) node = CLOSERS[pick(seed, 'talk-close', CLOSERS.length)]!;
      else node = byId(c.next ?? fromPool()) ?? null;
      if (!node) { s.talks++; }
      return c;
    },
  };
};

// ---- What they have seen you do ----------------------------------------------------------

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Lines about one universe in their box, from its real stats. */
export const seenLines = (u: UniverseSpec, stats: UniverseStats, s: EndState, here: boolean): string[] => {
  const out: string[] = [];
  const layer = layerOf(s, u.serialNumber);
  if (here) out.push('This is the lit one. You are inside it now, and they are looking.');
  if (layer > 0) out.push(`This one was theirs before it was yours. It sits ${plural(layer, 'layer', 'layers')} above your room.`);
  if (stats.deepestFold > 0) out.push(pick(u.seed, 'seen-deep', 2) ? `They watched you fall to fold ${stats.deepestFold} here.` : `Fold ${stats.deepestFold}. They held their breath that far.`);
  else out.push('You have never fallen into this one. They keep it dusted.');
  if (s.floors.includes(u.serialNumber)) out.push('You came out of the bottom of it, into this room. They remember your face.');
  if (stats.worldsTended > 0) out.push(`${plural(stats.worldsTended, 'world', 'worlds')} tended. They counted each time you changed a sky.`);
  if (stats.souls !== undefined && stats.souls > 0) out.push(`${plural(stats.souls, 'soul', 'souls')} on its most watched world, last they looked.`);
  else if (stats.souls === 0) out.push('Its watched world went quiet. They saw. They did not say anything.');
  if (stats.belief && stats.belief !== 'none') out.push(`The people there have a word for you: ${stats.belief}. The child says it sometimes, to hear it.`);
  if (stats.lightFromGlow > 0) out.push(`It has given you ${lightWords(stats.lightFromGlow)}. They saw it leave, a little at a time.`);
  if ((stats.orbiters ?? 0) > 0) out.push(`${plural(stats.orbiters ?? 0, 'thing', 'things')} put into orbit by small hands. They liked that.`);
  if ((stats.enlightenment ?? 0) >= 50) out.push('Someone down there nearly understood. The child leaned in close.');
  if (out.length < 3) out.push(`Laws: ${u.laws.name}. They have read the label more than you have.`);
  // Keep the first (most particular) line, then a seeded few of the rest.
  const head = out.slice(0, 1);
  const rest = out.slice(1);
  const start = pick(u.seed, `seen-${s.visits}`, Math.max(1, rest.length));
  const few = rest.length <= 3 ? rest : [0, 1, 2].map((i) => rest[(start + i) % rest.length]!);
  return [...head, ...few];
};

/** What is on their shelf to take this visit. */
export interface Offer { readonly id: string; readonly label: string; readonly kind: SkyPieceKind | 'light'; readonly n: number; readonly mine: number }
export const shelf = (seed: Seed, s: EndState): Offer[] => {
  const kind = SKY_PIECE_KINDS[pick(seed, 'shelf-kind', SKY_PIECE_KINDS.length)]!;
  const offers: Offer[] = [
    { id: 'piece', label: `Their ${pieceName(kind)}`, kind, n: 1, mine: -1 },
    { id: 'light', label: 'A pip of their Light', kind: 'light', n: 1, mine: -1 },
  ];
  // Something of yours, left on an earlier visit, has grown in their keeping.
  const i = s.left.findIndex((l) => l.visit < s.visits);
  if (i >= 0) offers.unshift({ id: 'mine', label: `Your ${pieceName(s.left[i]!.kind)}, grown`, kind: s.left[i]!.kind, n: 2, mine: i });
  return offers;
};
