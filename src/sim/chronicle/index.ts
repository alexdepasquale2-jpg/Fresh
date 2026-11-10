// Chronicle (unit 11). Events are written first; reasons come after, sifted from
// what the surface and sky did before, and told in the voice of the village's faith.
import type { ChronicleFactory, ChronicleEntry, CivEvent, SurfaceEvent, Belief } from '@/contracts/sim';
import { BELIEFS, ERAS } from '@/contracts/sim';
import type { PlanetSpec } from '@/contracts/system';
import { child, mix, seedToU32 } from '@/core/hash';
import type { Seed } from '@/contracts/seed';
import type { SkyState, SurfaceModifiers } from '@/contracts/sky';
import { BODY, bodyReason } from './body';
import { figName, creedName, TELL, SIGN, WORKS, INVENTIONS, LATE_TECH, GRIEF, DOUBT, TEMPER, WHY_WORK, WHY_INVENT, QUIET, EMPTY } from './lore';

type Kind = CivEvent['kind'] | SurfaceEvent['kind'] | 'quiet';
type Entry = ChronicleEntry & { kind: Kind; belief?: Belief; tick: number; who?: Who; e?: CivEvent };
/** What a reader outside the worker is given: the line, and where and what it was about. */
const publish = ({ belief: _b, tick: _t, who: _w, e, ...en }: Entry): ChronicleEntry => (e ? { ...en, x: e.x, y: e.y, villageId: e.villageId } : en);

const EVENT: Partial<Record<Kind, string[]>> = {
  found: ['%v was raised from the dust.', 'They built %v and lit its first lamp.', 'A handful of souls made a home and called it %v.'],
  grow: ['%v grew loud with children.', 'More lamps burned in %v.', '%v outgrew its walls.'],
  split: ['Some left %v to walk the long road.', '%v sent its young to find new ground.'],
  die: ['%v went dark.', 'No one answers in %v now.', 'The last fire of %v went out.'],
  flooded: ['The water rose over %v.', '%v was drowned.'],
  frozen: ['Frost took the edges of %v.', '%v huddled through a killing cold.'],
  burn: ['Fire ran through %v.', '%v burned.'],
  famine: ['%v went hungry.', 'The stores of %v ran empty.'],
  migrate: ['Families left %v for %o.', 'A line of walkers left %v, bound for %o.'],
  feud: ['%v and %o came to blows.', 'Blood between %v and %o.'],
  festival: ['%v sang all night.', 'A festival in %v, under the lit sky.'],
  convert: ['%v turned to the %b.', 'In %v they began to pray to the %b.'],
  tech: ['%v learned %t.', '%v came into the age of %t.'],
  launch: ['From %v a small light rose and did not come down.', '%v sent a lamp into the sky.', '%v put a new star into your sky.'],
  light: ['%v sang toward the sky.'],
  traded: ['Traders from %v sold their wares in %o.', '%v and %o struck a bargain.'],
  struck: ['The stranger struck back at %v, and they ran.', 'Those of %v who raised their hands against the stranger fell.'],
  preached: ['The stranger spoke at %v, and some stayed to listen.', 'In %v they sat down around the stranger and heard it speak.'],
  gift: ['The stranger gave %v bread from its own body.', '%v ate from the hands of the stranger.'],
  merged: ['Two peoples became one and called themselves %v.', 'The walls came down between them. Now there is only %v.'],
  stranger: ['A stranger walked near %v. They kept their distance.', 'In %v they watched a shining stranger and did not know what to do.'],
  attack: ['A stranger came to %v and they met it with stones.', 'The people of %v drove at a shining stranger with spears.'],
  slain: ['%v killed the stranger who walked among them.', 'In %v they struck down the thing that came from the sky.'],
  worship: ['A stranger came to %v and they knelt.', '%v welcomed the one who made their sky.'],
  enlightened: ['%v understood at last what watches them.', 'The people of %v looked up and knew.'],
  blessed: ['A warmth settled on %v.', '%v woke to full stores and quiet hearts.'],
  smitten: ['Death fell on %v from nowhere.', 'Half of %v did not wake.'],
  omen: ['They saw an omen over %v.'],
  quake: ['The ground split and shook.', 'The world trembled.'],
  impact: ['A stone fell from the sky.', 'Something struck the world and the ground shook.'],
  storm: ['A great storm came.', 'The clouds broke open.'],
  freeze: ['The seas froze.', 'Ice closed over the water.'],
  thaw: ['The ice broke.', 'The thaw came.'],
  fire: ['Wildfire spread across the land.'],
  flood: ['The waters rose everywhere.'],
  drought: ['The waters shrank.', 'A long dry.'],
  bloom: ['The moss spread green.'],
  blight: ['The moss withered.'],
  lightning: ['Lightning struck the high ground.'],
};
// Which surface events can explain which hardships.
const FITS: Partial<Record<Kind, Kind[]>> = {
  famine: ['drought', 'blight', 'freeze', 'impact', 'storm'],
  die: ['drought', 'blight', 'freeze', 'impact', 'fire', 'flood', 'storm'],
  burn: ['fire', 'lightning', 'impact', 'drought'],
  flooded: ['flood', 'storm', 'thaw'],
  frozen: ['freeze', 'storm'],
  convert: ['impact', 'storm', 'lightning', 'freeze', 'flood', 'fire', 'bloom', 'thaw'],
};
const LOUD_SURFACE = new Set<Kind>(['quake', 'impact', 'storm', 'freeze', 'thaw', 'fire', 'flood', 'drought', 'bloom', 'blight']);
const TECH = ['huts', 'fire', 'iron', 'lamps', 'bells', 'star-reaching', ...LATE_TECH];
const GOD: Record<Belief, string> = { none: 'nothing', sun: 'sun', moon: 'moon', sea: 'sea', stone: 'falling stones', fire: 'fire', sky: 'storm' };

// How each faith explains a hardship.
const VOICE: Record<Belief, string> = {
  none: 'They say',
  sun: 'The sun-priests say',
  moon: 'The moon-keepers say',
  sea: 'The tide-callers say',
  stone: 'The stone-readers say',
  fire: 'The fire-tenders say',
  sky: 'The storm-watchers say',
};
const CAUSE: Partial<Record<Kind, string>> = {
  impact: 'the sky threw stones',
  quake: 'the ground split',
  storm: 'the storm was owed',
  freeze: 'the seas froze',
  flood: 'the waters rose',
  drought: 'the waters left',
  fire: 'the fires came',
  blight: 'the moss failed',
  bloom: 'the moss came green',
  lightning: 'lightning chose them',
  thaw: 'the ice broke',
};

// ---- The notable: the one named person the chronicle follows on each world. ----
// The chronicle never sees CivView, so sim/civ packs everything into the event:
//   detail = code + 64 * (calling + 16 * (age + 128 * (arg + 256 * (ord + 4096 * house))))
// and the name is a pure function of (planet.seed, ord, house): ord counts along the line
// of names, house is the family (a child keeps it, anyone else gets the next). The name
// tables and notableName below are an identical copy of the ones in src/sim/civ/index.ts
// (units may not import each other); change both or the card and the chronicle disagree.
type Who = { code: number; calling: string; age: number; arg: number; name: string; short: string; prev: string; village: string };
const CALLINGS = ['wanderer', 'fisher', 'grower', 'prophet', 'smith', 'trader', 'lamp-keeper', 'miner', 'mason', 'bell-ringer'];
const NA = ['Or', 'Wen', 'Tam', 'Fen', 'Is', 'Mar', 'Hal', 'Sel', 'Bry', 'Cor', 'Ed', 'Lin', 'Oss', 'Ru', 'Thess', 'Ane', 'Dov', 'Kes', 'Mir', 'Yar'];
const NB = ['la', '', 'sin', 'na', 'ric', 'wen', 'low', 'a', 'en', 'ith', 'o', 'ra', 'el', 'is', '', 'an'];
const FA = ['Ash', 'Salt', 'Reed', 'Mere', 'Stone', 'Wick', 'Low', 'Marsh', 'Ember', 'Gull', 'Thorn', 'Tarn'];
const FB = ['low', 'mere', 'wick', 'by', 'ley', 'field', 'hallow', 'ward'];
const notableName = (seed: Seed, ord: number, house: number): { short: string; full: string } => {
  const h = seedToU32(mix(child(seed, 'notable-name'), ord));
  const hf = seedToU32(mix(child(seed, 'notable-house'), house));
  const a = NA[h % NA.length]!;
  let b = NB[(h >>> 8) % NB.length]!;
  if (!b && a.length <= 2) b = 'a';
  const first = a + b;
  const fa = FA[hf % FA.length]!;
  let fb = FB[(hf >>> 8) % FB.length]!;
  if (fa.toLowerCase() === fb) fb = 'ward';
  if (hf % 5 < 2) return { short: first, full: `${first} ${fa}${fb}` };
  if ((h >>> 20) % 5 === 0) { const t = `${(h >>> 24) & 1 ? 'Brother' : 'Sister'} ${first}`; return { short: t, full: t }; }
  return { short: first, full: first };
};
const unpack = (detail: number) => {
  let d = Math.max(0, Math.floor(detail));
  const take = (n: number) => { const v = d % n; d = Math.floor(d / n); return v; };
  return { code: take(64), calling: take(16), age: take(128), arg: take(256), ord: take(4096), house: d };
};
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const ONES_TH = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'a hundred', 'a hundred', 'a hundred'];
const TENS_TH = ['', '', 'twentieth', 'thirtieth', 'fortieth', 'fiftieth', 'sixtieth', 'seventieth', 'eightieth', 'ninetieth', 'hundredth', 'hundredth', 'hundredth'];
const years = (n: number) => (n < 20 ? ONES[n] || 'no' : n % 10 && n < 100 ? `${TENS[(n / 10) | 0]}-${ONES[n % 10]}` : TENS[(n / 10) | 0]!);
const nth = (n: number) => (n < 20 ? ONES_TH[n] || 'first' : n % 10 && n < 100 ? `${TENS[(n / 10) | 0]}-${ONES_TH[n % 10]}` : TENS_TH[(n / 10) | 0]!);
// %n name, %s short name, %c calling, %v village, %o other village, %p the one before, %y ordinal age, %a age, %x argument word.
const N_BORN = [
  ['%n came to %v with its first fires, and was soon its %c.', 'Of the first souls of %v, one is named: %n, the %c.'],
  ['%n, child of %p, was born in %v and grew to be its %c.', 'In %v the child of %p came of age: %n, the %c.'],
  ['%n, who learned at the side of %p, took up the work of %c in %v.', '%p left an apprentice in %v: %n, the %c.'],
  ['%n walked into %v out of the dust and stayed as its %c.', 'A stranger to %v, %n the %c, was given a door of their own.'],
];
const BUILT = ['house', 'fire', 'field', 'dock', 'mine', 'workshop', 'market', 'storehouse', 'shrine', 'bell tower', 'thing that points at the sky'];
const ERA_DEED = ['', '%s struck the first fire %v ever kept.', '%s drew the first iron of %v out of the stone.', '%s lit the first lamp on the streets of %v.', '%s hung the first bell of %v.', '%s pointed the first glass of %v at your light.'];
const WORK: string[][] = [
  ['%s walked the whole shore and came back to %v with its shape in mind.', '%s slept a season under the open sky and came home to %v thinner.'],
  ['%s mended every net in %v before the thaw.', '%s brought in a catch %v still measures others against.'],
  ['%s saved the seed of %v through a wet spring.', '%s cut a new field for %v out of the moss.'],
  ['%s fasted on the hill above %v until the sky answered.', '%s taught the children of %v the old prayers.'],
  ['%s forged a blade that would not dull.', '%s kept the forge of %v lit a whole winter.'],
  ['%s came home to %v with more than was sent.', '%s settled a debt older than the market of %v.'],
  ['%s kept the lamps of %v lit through a moonless month.', '%s walked the night watch of %v alone for a year.'],
  ['%s opened a new seam in the hill behind %v.', '%s led the others out when the roof of the mine groaned.'],
  ['%s set a wall in %v that will outlast its builders.', '%s raised a roof in %v in a single day.'],
  ['%s rang %v through a night of fog.', '%s cast a truer bell for %v.'],
];
const N_DEED: Record<number, string[]> = {
  1: ['%s shared out the last of the grain in %v.', '%s opened the last jar in %v and took none.'],
  2: ['%s pulled the children of %v out of the fire.', '%s went back into the smoke at %v, twice.'],
  3: ['%s kept one fire alive in %v through the killing cold.'],
  4: ['%s carried the last of the grain through the flood.', '%s was last up the hill when the water came for %v, with the grain.'],
  5: ['%s walked out from %v to where the stone fell.', '%s saw the stone fall and did not run.'],
  6: ['%s dug the neighbours out when the ground split under %v.'],
  7: ['%s stood between the spears of %v and %o.', '%s buried the dead of %v and of %o alike.'],
  8: ['%s laid the first stone of the %x in %v.', 'The %x of %v was the work of %s.'],
  10: ['%s led the dancing in %v until the lamps burned out.', '%s sang first at the festival of %v, and last.'],
  11: ['%s was the first in %v to pray to the %x.'],
  12: ['%s watched the small light rise and did not look down until morning.', '%s stood on the roofs of %v to watch a lamp go up to you.'],
  13: ['%s walked the young of %v out to new ground and came back alone.'],
  14: ['%s made the long road from %v to %o and came home with coin.', '%s carried the goods of %v to %o on foot.'],
  15: ['%s looked up from %v and knew before the rest.'],
  16: ['%s woke first in %v on the morning the stores were full.'],
  17: ['%s learned the songs of both peoples and sang them as one in %v.'],
  18: ['%s was given the seat nearest the fire in %v.', 'They began to call %s the elder of %v.'],
  20: ['%s was the first in %v to kneel to the stranger.'],
  21: ['%s was the first in %v to raise a hand against the stranger.'],
  22: ['%s stood and watched the stranger longer than anyone in %v.'],
  23: ['%s sat closest when the stranger spoke at %v.'],
  24: ['%s ate from the hands of the stranger.'],
  25: ['%s lived through the day death fell on %v.'],
};
const N_PASSED = [
  ['%n the %c died in the %y year of a long life.', '%n the %c died old in %v, in the %y year.'],
  ['%n the %c was lost when the water took %v.'],
  ['%n the %c died with %v.', '%n the %c was among the last of %v.'],
  ['%n the %c went back into the fire at %v and did not come out.'],
  ['%n the %c was standing where the stone fell.'],
  ['%n the %c gave away a last share and starved in %v.'],
  ['%n the %c was killed in the fighting at %v.'],
  ['%n the %c was among those death took at %v.'],
  ['%n the %c froze at %v, tending a fire for others.'],
  ['%n the %c raised a hand against the stranger and fell.'],
  ['%n the %c walked out of %v one evening and was not seen again.'],
  ['%n the %c was buried when the ground split under %v.'],
];
// How a village mourns, by the calling of the one it lost.
const MOURN = [
  'They left a lamp burning on the road out of %v.', 'The boats of %v stayed on the sand that day.', 'The fields of %v went unworked for a day.', 'No one in %v prayed aloud for a month.',
  'The forge of %v stood cold for three days.', 'The market of %v kept its stalls shut.', 'The lamps of %v burned all night.', 'They sealed the old seam at %v with a stone.',
  'They set a stone for the one who set stones in %v.', 'The bell of %v rang once for every year.',
];

export const factory: ChronicleFactory = ({ names }) => {
  let entries: Entry[] = [];
  let nextId = 1;
  let lastText = '';
  let recentSurface: { kind: Kind; tick: number; year: number }[] = [];
  let planet: PlanetSpec | null = null;
  const vname = (id: number) => (planet ? names.village(child(planet.seed, id + 1)) : `the village`);
  // Never the same telling twice running: prefer one not used in the last few lines.
  let recentT: string[] = [];
  const pick = (opts: readonly string[], salt: number) => {
    let t = opts[salt % opts.length]!;
    for (let k = 0; k < opts.length && (t === lastText || recentT.includes(t)); k++) t = opts[(salt + 1 + k) % opts.length]!;
    if (t === lastText && opts.length > 1) t = opts[(salt + 1) % opts.length]!;
    lastText = t;
    recentT.push(t);
    if (recentT.length > 6) recentT.shift();
    return t;
  };
  /** Villages last heard from, newest first: a quiet year is told of one of them. */
  let heard: number[] = [];
  let lastYear = -1;
  const hear = (e: CivEvent) => {
    const gone = (id: number) => { heard = heard.filter((x) => x !== id); };
    gone(e.villageId);
    if (e.kind !== 'die' && e.kind !== 'flooded') heard.unshift(e.villageId);
    if ((e.kind === 'razed' || e.kind === 'absorbed') && e.other !== undefined) gone(e.other);
    if (e.kind === 'merged' && e.detail !== undefined) gone(e.detail);
    if (heard.length > 12) heard.length = 12;
  };
  const souls = (n: number) => (n <= 0 ? 'no one' : n === 1 ? 'one soul' : `${years(Math.min(n, 120))} souls`);
  const add = (en: Entry) => {
    // The same sentence is never written twice running.
    if (entries.length && entries[entries.length - 1]!.event === en.event) return;
    entries.push(en);
    lastYear = en.year;
  };
  // A busy world is not read line by line. Small things give way once a year is already full.
  const SMALL = new Set<Kind>(['grow', 'traded', 'built', 'festival', 'song', 'recovered', 'launch', 'voyage', 'school', 'pact', 'wedding', 'convert', 'migrate', 'feud', 'refugees', 'holy', 'omen', 'raid', 'rivalry']);
  const crowded = (e: CivEvent, year: number) => {
    let n = 0;
    for (let i = entries.length - 1; i >= 0 && entries[i]!.year === year; i--) n++;
    return n >= (SMALL.has(e.kind) ? 7 : 16);
  };
  /** The wider world's events: relations, creeds, hardship, works, named figures. False if this one is not ours to tell. */
  const tellWorld = (e: CivEvent, year: number, p: PlanetSpec): boolean => {
    const table = TELL[e.kind];
    if (!table) return false;
    const idx = e.kind === 'raid' || e.kind === 'festival' || e.kind === 'tech' ? e.detail ?? -1 : e.kind === 'peace' ? (e.cause === 4 ? 4 : 0) : e.cause ?? -1;
    let opts: readonly string[] | undefined = Array.isArray(table) ? (table as readonly string[]) : (table as Record<number, readonly string[]>)[idx];
    opts = opts?.filter((t) => (e.who !== undefined || !/%[wfh]/.test(t)) && (e.creed || !t.includes('%k')) && (e.other !== undefined || !t.includes('%o')));
    if (!opts?.length) return false;
    const recent = entries.slice(-40);
    const sameV = (x: Entry) => x.kind === e.kind && x.e?.villageId === e.villageId;
    if (recent.some((x) => sameV(x) && x.year === year && x.e?.other === e.other && x.e?.detail === e.detail)) return true;
    if (e.kind === 'convert' && recent.some((x) => sameV(x) && year - x.year < 3)) return true;
    if (e.kind !== 'sign' && crowded(e, year)) return true; // what the player hung in the sky is always answered
    if (e.kind === 'sign') {
      const seen = recent.filter((x) => x.kind === 'sign' && x.e?.detail === e.detail && year - x.year <= 1);
      if (seen.length >= 2 || seen.some((x) => x.e?.cause === e.cause)) return true;
    }
    if (e.kind === 'festival' && (((e.count ?? 1) !== 1 && (e.count ?? 1) % 5 !== 0) || recent.some((x) => x.kind === 'festival' && x.year === year))) return true;
    if (e.kind === 'song' && recent.some((x) => x.kind === 'song' && year - x.year < 2)) return true;
    if (e.kind === 'refugees' && !e.count) return true;
    const fig = e.who !== undefined ? figName(p.seed, e.who) : null;
    const k = e.creed ? creedName(p.seed, e.creed, e.belief ?? 'none') : '';
    const x = e.kind === 'sign' ? SIGN[e.detail ?? 0] ?? 'a sign' : e.kind === 'wonder' ? WORKS[e.detail ?? 0] ?? 'great work' : e.kind === 'invention' ? INVENTIONS[e.detail ?? 0] ?? 'a new thing' : '';
    const v = vname(e.villageId), o = e.other !== undefined ? vname(e.other) : 'its neighbour';
    const text = pick(opts, nextId + e.tick + e.villageId)
      .replace(/%v/g, v).replace(/%o/g, o).replace('%w', fig?.full ?? 'someone').replace('%f', fig?.first ?? 'someone').replace('%h', fig?.house ?? 'the old house')
      .replace('%k', k).replace('%j', e.detail ? creedName(p.seed, e.detail, e.belief ?? 'none') : 'the old creed').replace('%b', GOD[e.belief ?? 'none']).replace('%x', x).replace('%n', souls(e.count ?? 0));
    add({ id: nextId++, year, kind: e.kind, tick: e.tick, event: text.charAt(0).toUpperCase() + text.slice(1), e, ...(e.belief ? { belief: e.belief } : {}) });
    return true;
  };
  /** The life of the player's body. Always told, except small deeds repeated in one village in one year. */
  const tellBody = (e: CivEvent, year: number, p: PlanetSpec) => {
    const code = e.detail ?? 0;
    const tale = BODY[code];
    if (!tale) return;
    if (tale.small && entries.slice(-40).some((x) => x.kind === 'body' && x.year === year && x.e?.detail === code && x.e?.villageId === e.villageId)) return;
    const opts = tale.text[e.cause ?? 0] ?? tale.text[e.count ?? 0] ?? tale.text[0] ?? Object.values(tale.text)[0]!;
    const fig = e.who !== undefined ? figName(p.seed, e.who).full : 'the ruler';
    const k = e.creed ? creedName(p.seed, e.creed, e.belief ?? 'sky') : 'a new creed';
    const x = code === 3 ? WORKS[e.count ?? 0] ?? 'great work' : code === 5 ? INVENTIONS[e.count ?? 0] ?? 'a new thing' : '';
    const o = e.other !== undefined ? vname(e.other) : 'its neighbour';
    const text = pick(opts, nextId + e.tick + e.villageId).replace(/%v/g, vname(e.villageId)).replace(/%o/g, o).replace(/%w/g, fig).replace(/%k/g, k).replace(/%x/g, x);
    add({ id: nextId++, year, kind: 'body', tick: e.tick, event: text.charAt(0).toUpperCase() + text.slice(1), e, deed: tale.deed, ...(e.belief ? { belief: e.belief } : {}) });
  };
  const reasonWorld = (en: Entry, sky: SkyState, m: SurfaceModifiers, voice: string): string | undefined => {
    const e = en.e;
    if (!e || !planet) return undefined;
    const seed = planet.seed;
    const k = e.creed ? creedName(seed, e.creed, e.belief ?? 'none') : '';
    const K = k ? k.charAt(0).toUpperCase() + k.slice(1) : '';
    const first = e.who !== undefined ? figName(seed, e.who).first : 'Someone';
    const alt = en.id % 2 === 0;
    const c = e.cause ?? 0, d = e.detail ?? 0;
    if (e.kind === 'body') return bodyReason(d, c, e.count ?? 0, e.other ?? 0, d === 22 && !e.creed ? '' : k, souls(e.count ?? 0), alt);
    const gs = GRIEF[c] ?? GRIEF[0]!;
    const grief = gs[(en.id >> 1) % gs.length]!;
    switch (e.kind) {
      case 'pact': return c === 1 && k ? `Both keep ${k}, and trust came easily.` : c === 3 ? 'A wedding had already joined their houses.' : 'Each had what the other lacked.';
      case 'alliance': return c === 2 ? 'They feared the same neighbour.' : c === 1 && k ? `Both kneel to ${k}.` : 'Long trade had made them kin.';
      case 'wedding': return alt ? 'A marriage costs less than a wall.' : 'The road between them had been kind for years.';
      case 'rivalry': case 'raid': case 'war': return `${voice} ${grief}.`;
      case 'tribute': return alt ? `It began because ${grief}.` : 'It was that or the torch.';
      case 'razed': case 'absorbed': return `It began because ${grief}.`;
      case 'peace': return c === 4 ? 'The years of the debt were counted, and done.' : c === 1 ? 'Too few were left to fight.' : c === 2 ? 'Hunger did what envoys could not.' : 'Neither could break the other.';
      case 'creed': {
        const has = (s: string) => sky.pieces.includes(s as never);
        switch (e.belief) {
          case 'moon': return has('moon') ? 'The moon you hung is the lamp they mean.' : 'They pray to a light the tides remember.';
          case 'sun': return has('sun') ? 'They have two suns to choose from, and chose.' : 'Their sun is the eye they mean.';
          case 'sea': return m.tide > 20 ? 'The tide you gave them comes and goes like a breath.' : 'The water gives and takes, and they wrote that down.';
          case 'stone': return has('belt') || has('comet') ? 'The stones you set circling are its scripture.' : 'It began where a stone fell.';
          case 'fire': return 'It began with a burning.';
          default: return has('dust') || has('rings') ? 'They read the veil you drew across their sky.' : 'It began under a storm.';
        }
      }
      case 'schism': return `${first} said ${DOUBT[c] || DOUBT[0]}. Enough believed it.`;
      case 'heresy': return `${first} said ${DOUBT[c] || DOUBT[0]}.`;
      case 'exile': return alt ? 'They would not kill one of their own.' : 'The creed held. The doubt went elsewhere.';
      case 'holy': return c === 1 ? 'The High Shrine stands there.' : `They saw ${SIGN[d] ?? 'the sign'} from there first.`;
      case 'sign': return c === 3 ? 'Their Star House had already found it.' : c === 1 ? (K ? `${K} teaches that it is a blessing.` : `${voice} it was promised.`)
        : e.belief === 'none' || !e.belief ? 'They had no name for it.' : K ? `${K} has no place for such a thing.` : `${voice} it is a warning.`;
      case 'plague': return ['', 'The road that carries grain carries this too.', 'Too many under too few roofs.', 'The flood left bad water behind.', 'They could not turn them away.'][c] || `${voice} it came on the wind.`;
      case 'plagueEnd': return c === 2 ? 'They had learned to keep the sick apart.' : 'It burned through those it could.';
      case 'refugees': return alt ? 'There was nowhere nearer.' : 'They walked toward the nearest smoke.';
      case 'resettled': return e.who !== undefined ? `${first} led them. Good ground does not stay empty.` : 'The old wells were still sweet.';
      case 'recovered': return alt ? 'The stores were full and the mood had turned.' : 'A quiet season was enough.';
      case 'song': return alt ? 'What they cannot keep, they sing.' : 'So the children will know.';
      case 'wonder': return `${(WHY_WORK[d] ?? 'It was time.').replace('%k', k || 'their god')}${e.who !== undefined ? ` ${first} saw it finished.` : ''}`;
      case 'school': return 'There was coin to spare a few hands from the fields.';
      case 'invention': return WHY_INVENT[d] ?? 'Someone had to be first.';
      case 'ark': return alt ? 'They had been watching your light. Now they go to find it.' : 'The world had grown small.';
      case 'voyage': return 'The sail had made the far shore near.';
      case 'crowned': return `${['', 'A village that large wants one voice.', 'The house held.', 'The old house had lost the people.'][c] ?? ''} ${(TEMPER[d] ?? '').replace('%f', first)}`.trim();
      case 'fell': return c === 1 ? (alt ? 'The years do that.' : 'The gates stood open for a day.') : c === 2 ? 'A ruler who loses seldom outlives it.' : c === 3 ? 'It does not ask who rules.' : c === 4 ? 'They had been miserable too long.' : 'The creed held, and held hard.';
      case 'festival': return d ? (k ? `It is the high day of ${k}.` : 'They have always done it so.') : undefined;
      case 'convert': return c === 1 ? 'It came along the trade road.' : c === 2 ? 'The victors brought their god.' : undefined;
      case 'found': return c === 3 ? (k ? `A creed needs a roof: ${k}.` : 'The doubt needed a roof.') : undefined;
      case 'split': return e.who !== undefined ? 'The old walls were full.' : undefined;
      case 'famine': return c === 6 ? `${voice} the tribute emptied the stores.` : c === 5 ? `${voice} the raiders left nothing.` : c === 3 ? `${voice} there were too many mouths.` : undefined;
      case 'die': return c === 9 ? 'There was no grain, and other smoke on the horizon.' : undefined;
      case 'stranger': case 'attack': case 'worship': return K && c === 1 ? `${K} teaches that the light may walk.` : K && c === 2 ? `${K} calls such a thing a thief of light.` : undefined;
      case 'tech': return d >= 6 ? ['The engine did the work of forty.', 'Now a word crosses the world in a breath.', 'They have learned how to go.'][d - 6] : undefined;
      default: return undefined;
    }
  };
  return {
    record: (events, year, p, surface = []) => {
      planet = p;
      for (const e of surface) {
        recentSurface.push({ kind: e.kind, tick: e.tick, year });
        if (LOUD_SURFACE.has(e.kind) && !entries.slice(-30).some((x) => x.kind === e.kind && year - x.year < 6)) {
          entries.push({ id: nextId++, year, kind: e.kind, tick: e.tick, x: e.x, y: e.y, event: pick(EVENT[e.kind] ?? ['Something happened.'], nextId) });
        }
      }
      recentSurface = recentSurface.filter((s) => year - s.year <= 3).slice(-24);
      if (lastYear < 0) lastYear = year;
      for (const e of events) {
        hear(e);
        if (e.kind === 'born' || e.kind === 'deed' || e.kind === 'passed') {
          const u = unpack(e.detail ?? 0);
          const nm = notableName(p.seed, u.ord, u.house);
          const calling = CALLINGS[u.calling] ?? 'wanderer';
          const prev = u.ord > 1 ? notableName(p.seed, u.ord - 1, u.code === 1 ? u.house : u.house - 1).short : 'the one before';
          const who: Who = { code: u.code, calling, age: u.age, arg: u.arg, name: nm.full, short: nm.short, prev, village: vname(e.villageId) };
          const salt = e.tick + u.ord;
          let t: string;
          if (e.kind === 'born') t = pick(N_BORN[u.code] ?? N_BORN[0]!, salt);
          else if (e.kind === 'passed') t = pick(u.code === 0 && u.age < 46 ? ['%n the %c died young in %v.'] : N_PASSED[u.code] ?? N_PASSED[10]!, salt);
          else t = u.code === 9 ? ERA_DEED[u.arg] || '%s saw a new age come to %v.' : pick(N_DEED[u.code] ?? WORK[u.arg >> 1] ?? ['%s did the work of %v.'], u.code >= 30 ? u.arg & 1 : salt);
          const argWord = u.code === 8 ? BUILT[u.arg] ?? 'new work' : u.code === 11 ? GOD[BELIEFS[u.arg] ?? 'sky'] : '';
          const text = t.replace('%n', who.name).replace('%s', who.short).replace('%c', calling).replace('%p', prev).replace('%y', nth(u.age)).replace('%x', argWord)
            .replace('%v', who.village).replace('%v', who.village).replace('%o', u.arg ? vname(u.arg) : 'its neighbour').replace('%o', u.arg ? vname(u.arg) : 'its neighbour');
          add({ id: nextId++, year, kind: e.kind, tick: e.tick, event: text, who, e, ...(e.belief ? { belief: e.belief } : {}) });
          continue;
        }
        if (e.kind === 'body') { tellBody(e, year, p); continue; }
        if (tellWorld(e, year, p)) continue;
        // One line per village per kind per year is enough.
        if (entries.slice(-40).some((x) => x.kind === e.kind && x.year === year && x.event.includes(vname(e.villageId)))) continue;
        if ((e.kind === 'festival' || e.kind === 'convert' || e.kind === 'grow') && entries.slice(-40).some((x) => x.kind === e.kind && year - x.year < 2)) continue;
        if (!EVENT[e.kind] && e.kind !== 'omen' && e.kind !== 'built') continue;
        if ((e.kind === 'feud' || e.kind === 'traded' || e.kind === 'launch' || e.kind === 'migrate') && entries.slice(-40).some((x) => x.kind === e.kind && year - x.year < 3 && (e.kind === 'launch' || x.e?.villageId === e.villageId))) continue;
        if (crowded(e, year)) continue; // a kind this chronicle has no words for is left unsaid
        const OMEN = ['Water poured from an empty sky near %v.', 'Sand fell like rain on %v.', 'A wall of stone rose near %v.', 'Green came up from dead ground by %v.', 'Fire fell from an open hand over %v.', 'The water froze at a touch near %v.', 'A star was thrown down at %v.', 'Clouds gathered from nothing over %v.', 'The ground heaved under %v.', 'Lightning was called down on %v.', 'The air burned around %v.', 'A cold came to %v from nowhere.', 'Part of the world was taken from %v.'];
        if (e.kind === 'omen') {
          const t = e.detail === 101 ? 'A light too bright to look at stood by %v.' : e.detail === 100 ? 'A voice spoke to %v from above.' : OMEN[e.detail ?? 0] ?? 'They saw an omen over %v.';
          add({ id: nextId++, year, kind: e.kind, tick: e.tick, event: t.replace('%v', vname(e.villageId)), e, ...(e.belief ? { belief: e.belief } : {}) });
          continue;
        }
        if (e.kind === 'built') {
          const B = ['', '', '%v ploughed its first field.', '%v built a dock on the water.', '%v dug a mine into the hill.', '%v raised a workshop. The forge is lit.', '%v opened a market.', '%v built a storehouse.', '%v raised a shrine.', '%v built a bell tower.', '%v cleared a field and built something that points at the sky.'];
          add({ id: nextId++, year, kind: e.kind, tick: e.tick, event: (B[e.detail ?? 0] || '%v built something new.').replace('%v', vname(e.villageId)), e, ...(e.belief ? { belief: e.belief } : {}) });
          continue;
        }
        const opts = e.kind === 'migrate' && e.detail === e.villageId ? ['%v climbed away from the water.', 'The people of %v moved to higher ground.'] : EVENT[e.kind] ?? ['%v endured.'];
        const text = pick(opts, nextId + e.tick)
          .replace('%v', vname(e.villageId))
          .replace('%o', vname(e.detail ?? 0))
          .replace('%b', GOD[e.belief ?? 'none'])
          .replace('%t', TECH[e.detail ?? 0] ?? ERAS[0]);
        add({ id: nextId++, year, kind: e.kind, tick: e.tick, event: text, e, ...(e.belief ? { belief: e.belief } : {}) });
      }
      // A quiet world still turns: when nothing has been written for two years, say so.
      if (year - lastYear >= 2) {
        const h = seedToU32(mix(child(p.seed, 'quiet'), year));
        const v = heard[0];
        const text = v === undefined ? pick(EMPTY, h) : pick(QUIET, h).replace('%v', vname(v));
        add({ id: nextId++, year, kind: 'quiet', tick: 0, event: text });
        lastYear = year;
      }
      if (entries.length > 300) entries = entries.slice(-300);
    },
    explain: (sky, m, says) => {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]!;
        if (e.reason !== undefined) continue;
        const voice = VOICE[e.belief ?? 'none'];
        // Sift: the most recent loud surface event before this one is the cause they remember.
        const fits = FITS[e.kind];
        const prior = [...recentSurface].reverse().find((s) => s.tick <= e.tick && e.tick - s.tick < 3200 && CAUSE[s.kind] && (!fits || fits.includes(s.kind)));
        let reason: string | undefined = reasonWorld(e, sky, m, voice);
        if (reason === undefined) switch (e.kind) {
          case 'quiet':
            reason = !heard.length ? 'There is no one to say why.' : !sky.pieces.length ? 'Their sky was empty, and so was the page.'
              : sky.pieces.includes('moon') && e.id % 2 ? 'The moon kept its hours.' : sky.pieces.includes('rings') ? 'The rings turned overhead and nothing fell.' : says[e.id % Math.max(1, says.length)] ?? 'Nothing fell from the sky worth the ink.';
            break;
          case 'die': case 'famine': case 'burn': case 'flooded': case 'frozen':
            reason = prior ? `${voice} it began when ${CAUSE[prior.kind]}.` : m.impacts > 20 ? `${voice} the sky threw stones.` : m.tide > 30 ? `${voice} the sea came for them.` : m.warmth > 40 ? `${voice} the suns were cruel.` : m.dimming > 30 ? `${voice} the veil starved the fields.`
              : e.e?.cause === 2 ? `${voice} the winter was long.` : e.e?.cause === 4 ? `${voice} the air itself turned on them.` : `${voice} the land was poor.`;
            break;
          case 'convert':
            reason = prior ? `After ${CAUSE[prior.kind]}, it seemed the only answer.` : says[0] ? `They watched the sky. ${says[0]}` : 'No one remembers why.';
            break;
          case 'born': reason = e.who?.code === 1 ? 'A name is the one thing they can leave a child.' : e.who?.code === 2 ? 'The work does not stop for a death.' : `${voice} every village needs one name to remember.`; break;
          case 'passed': {
            const w = e.who;
            if (!w) { reason = ''; break; }
            const mourn = w.code === 1 || w.code === 2 ? 'There was no one left to light a lamp.' : (MOURN[CALLINGS.indexOf(w.calling)] ?? MOURN[0]!).replace('%v', w.village);
            reason = w.code === 0 && w.age >= 46 ? mourn : `${w.short} was ${years(w.age)}. ${mourn}`;
            break;
          }
          case 'deed': {
            const c = e.who?.code ?? 0;
            const sn = e.who?.short ?? 'One of them';
            reason = c === 1 ? (prior ? `It was the year ${CAUSE[prior.kind]}.` : 'No one else would open the last jar.')
              : c === 2 ? 'The others were carrying water.'
              : c === 3 ? 'Sleep would have been easier.'
              : c === 4 ? `${voice} the water was patient. So was ${sn}.`
              : c === 5 ? 'Someone had to see what the sky had sent.'
              : c === 6 ? 'The ground does not ask who is ready.'
              : c === 7 ? 'Each said the other prayed wrong.'
              : c === 8 ? 'There were hands enough, and one pair led.'
              : c === 9 ? 'Many hands, long years, and one who would not stop.'
              : c === 10 ? (sky.pieces.includes('rings') ? 'The rings lit the dancing.' : sky.pieces.includes('moon') ? 'The moon was full.' : 'The year was kind.')
              : c === 11 ? (prior ? `After ${CAUSE[prior.kind]}, someone had to kneel first.` : 'Someone has to kneel first.')
              : c === 12 ? 'They had been watching your light.'
              : c === 13 ? 'The young do not look back. Someone must.'
              : c === 14 ? 'Each had what the other lacked.'
              : c === 15 || c === 20 ? 'They had been watching your light for a long time.'
              : c === 16 ? `${voice} the sky remembered them.`
              : c === 17 ? 'A hand they could not see pressed them together.'
              : c === 18 ? 'Enough winters will do that.'
              : c === 21 ? `${voice} it was a demon wearing light.`
              : c === 22 ? 'Some wanted to kneel. Some wanted to run.'
              : c === 23 ? 'Its voice was like their own, but older.'
              : c === 24 ? 'It grew fainter as they ate.'
              : c === 25 ? `${voice} they had been judged, and one was spared.`
              : 'It is the work, and the work is the life.';
            break;
          }
          case 'feud': reason = 'Each said the other prayed wrong.'; break;
          case 'built': reason = 'There were hands enough, and coin.'; break;
          case 'traded': reason = 'Each had what the other lacked.'; break;
          case 'struck': reason = `${voice} it was never a thing to be fought.`; break;
          case 'preached': reason = 'Its voice was like their own, but older.'; break;
          case 'gift': reason = 'It grew fainter as they ate.'; break;
          case 'merged': reason = 'A hand they could not see pressed them together.'; break;
          case 'attack': case 'slain': reason = `${voice} it was a demon wearing light.`; break;
          case 'stranger': reason = 'Some wanted to kneel. Some wanted to run.'; break;
          case 'worship': case 'enlightened': reason = 'They had been watching your light for a long time.'; break;
          case 'blessed': reason = `${voice} the sky remembered them.`; break;
          case 'smitten': reason = `${voice} they had been judged.`; break;
          case 'omen': reason = e.event.includes('voice') ? 'They turned their faces to the storm.' : `${voice} something is watching.`; break;
          case 'migrate': reason = e.event.includes('higher') || e.event.includes('climbed') ? `${voice} the water was patient.` : 'They went where the stores were fuller.'; break;
          case 'tech': reason = e.event.includes('iron') ? 'The fallen stones were good metal.' : 'Many hands, long years.'; break;
          case 'launch': reason = 'They had been watching your light.'; break;
          case 'festival': reason = sky.pieces.includes('rings') ? 'The rings lit the dancing.' : sky.pieces.includes('moon') ? 'The moon was full.' : 'The year was kind.'; break;
          case 'found': case 'grow':
            reason = m.nightLight > 20 ? `${voice} the night was kind.` : sky.pieces.includes('moon') ? `${voice} the moon brought fish to the flats.` : says[0] ? `${voice}: ${says[0].toLowerCase()}` : `${voice} it was a quiet year.`;
            break;
          default:
            reason = says.length ? says[says.length - 1]! : '';
        }
        entries[i] = { ...e, reason };
      }
    },
    entries: (limit = 50) => entries.slice(-limit).reverse().map(publish),
    snapshot: () => entries.map(publish),
    // What the published lines leave out, and a restore needs to go on exactly: when each line
    // was written, the event behind it (minus what the line already says), and the phrasing memory.
    memory: () => JSON.stringify({
      v: 1, nextId, lastText, recentT, heard, lastYear, recentSurface,
      x: entries.map((en) => {
        let rest: Record<string, unknown> | 0 = 0;
        if (en.e) {
          const { kind: k, tick: t, villageId: _v, x: _x, y: _y, ...more } = en.e;
          rest = { ...(k !== en.kind ? { kind: k } : {}), ...(t !== en.tick ? { tick: t } : {}), ...more };
        }
        return [en.tick, en.belief ?? 0, en.who ?? 0, rest, en.reason === undefined ? 0 : 1];
      }),
    }),
    restore: (list, memory) => {
      heard = [];
      lastYear = -1;
      recentT = [];
      lastText = '';
      recentSurface = [];
      type Mem = { v: number; nextId: number; lastText: string; recentT: string[]; heard: number[]; lastYear: number; recentSurface: typeof recentSurface; x: [number, Belief | 0, Who | 0, (Partial<CivEvent> & Record<string, unknown>) | 0, number][] };
      let mem: Mem | null = null;
      if (memory) {
        try {
          const m = JSON.parse(memory) as Mem;
          if (m && m.v === 1 && Array.isArray(m.x) && m.x.length === list.length && Array.isArray(m.recentT) && Array.isArray(m.heard) && Array.isArray(m.recentSurface) && Number.isFinite(m.nextId) && Number.isFinite(m.lastYear)) mem = m;
        } catch { /* it wakes the old way */ }
      }
      if (mem) {
        const xs = mem.x;
        entries = list.map((en, i): Entry => {
          const [tick, belief, who, rest, reasoned] = xs[i]!;
          const kind = (en.kind ?? 'light') as Kind;
          // Built key by key in the order the line was first written, so it reads back the same.
          const line: { -readonly [K in keyof Entry]: Entry[K] } = { ...en, kind, tick };
          if (rest) {
            // The place and village came from the event; they go back into it.
            line.e = { kind, tick, villageId: en.villageId ?? 0, x: en.x ?? 0, y: en.y ?? 0, ...rest } as CivEvent;
            delete line.x; delete line.y; delete line.villageId;
          }
          if (who) line.who = who;
          if (belief) line.belief = belief;
          if (!reasoned) delete line.reason;
          return line;
        });
        nextId = mem.nextId;
        lastText = String(mem.lastText ?? '');
        recentT = mem.recentT.slice();
        heard = mem.heard.slice();
        lastYear = mem.lastYear;
        recentSurface = mem.recentSurface.slice();
        return;
      }
      // Lines saved before entries carried a kind wake as plain lines; a reason once set is kept.
      entries = list.map((e) => ({ ...e, kind: (e.kind ?? 'light') as Kind, tick: 0, ...(e.reason === undefined ? { reason: '' } : {}) }));
      nextId = entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    },
  };
};
