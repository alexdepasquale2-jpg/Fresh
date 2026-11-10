// Chronicle (unit 11). Events are written first; reasons come after, sifted from
// what the surface and sky did before, and told in the voice of the village's faith.
import type { ChronicleFactory, ChronicleEntry, CivEvent, SurfaceEvent, Belief } from '@/contracts/sim';
import { BELIEFS, ERAS } from '@/contracts/sim';
import type { PlanetSpec } from '@/contracts/system';
import { child, mix, seedToU32 } from '@/core/hash';
import type { Seed } from '@/contracts/seed';

type Kind = CivEvent['kind'] | SurfaceEvent['kind'];
type Entry = ChronicleEntry & { kind: Kind; belief?: Belief; tick: number; who?: Who };

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
const TECH = ['huts', 'fire', 'iron', 'lamps', 'bells', 'star-reaching'];
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
  const pick = (opts: string[], salt: number) => {
    let t = opts[salt % opts.length]!;
    if (t === lastText && opts.length > 1) t = opts[(salt + 1) % opts.length]!;
    lastText = t;
    return t;
  };
  return {
    record: (events, year, p, surface = []) => {
      planet = p;
      for (const e of surface) {
        recentSurface.push({ kind: e.kind, tick: e.tick, year });
        if (LOUD_SURFACE.has(e.kind) && !entries.slice(-30).some((x) => x.kind === e.kind && year - x.year < 6)) {
          entries.push({ id: nextId++, year, kind: e.kind, tick: e.tick, event: pick(EVENT[e.kind] ?? ['Something happened.'], nextId) });
        }
      }
      recentSurface = recentSurface.filter((s) => year - s.year <= 3).slice(-24);
      for (const e of events) {
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
          entries.push({ id: nextId++, year, kind: e.kind, tick: e.tick, event: text, who, ...(e.belief ? { belief: e.belief } : {}) });
          continue;
        }
        // One line per village per kind per year is enough.
        if (entries.slice(-40).some((x) => x.kind === e.kind && x.year === year && x.event.includes(vname(e.villageId)))) continue;
        if ((e.kind === 'festival' || e.kind === 'convert' || e.kind === 'grow') && entries.slice(-40).some((x) => x.kind === e.kind && year - x.year < 2)) continue;
        const OMEN = ['Water poured from an empty sky near %v.', 'Sand fell like rain on %v.', 'A wall of stone rose near %v.', 'Green came up from dead ground by %v.', 'Fire fell from an open hand over %v.', 'The water froze at a touch near %v.', 'A star was thrown down at %v.', 'Clouds gathered from nothing over %v.', 'The ground heaved under %v.', 'Lightning was called down on %v.', 'The air burned around %v.', 'A cold came to %v from nowhere.', 'Part of the world was taken from %v.'];
        if (e.kind === 'omen') {
          const t = e.detail === 101 ? 'A light too bright to look at stood by %v.' : e.detail === 100 ? 'A voice spoke to %v from above.' : OMEN[e.detail ?? 0] ?? 'They saw an omen over %v.';
          entries.push({ id: nextId++, year, kind: e.kind, tick: e.tick, event: t.replace('%v', vname(e.villageId)), ...(e.belief ? { belief: e.belief } : {}) });
          continue;
        }
        if (e.kind === 'built') {
          const B = ['', '', '%v ploughed its first field.', '%v built a dock on the water.', '%v dug a mine into the hill.', '%v raised a workshop. The forge is lit.', '%v opened a market.', '%v built a storehouse.', '%v raised a shrine.', '%v built a bell tower.', '%v cleared a field and built something that points at the sky.'];
          entries.push({ id: nextId++, year, kind: e.kind, tick: e.tick, event: (B[e.detail ?? 0] || '%v built something new.').replace('%v', vname(e.villageId)), ...(e.belief ? { belief: e.belief } : {}) });
          continue;
        }
        const opts = e.kind === 'migrate' && e.detail === e.villageId ? ['%v climbed away from the water.', 'The people of %v moved to higher ground.'] : EVENT[e.kind] ?? ['%v endured.'];
        const text = pick(opts, nextId + e.tick)
          .replace('%v', vname(e.villageId))
          .replace('%o', vname(e.detail ?? 0))
          .replace('%b', GOD[e.belief ?? 'none'])
          .replace('%t', TECH[e.detail ?? 0] ?? ERAS[0]);
        entries.push({ id: nextId++, year, kind: e.kind, tick: e.tick, event: text, ...(e.belief ? { belief: e.belief } : {}) });
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
        let reason: string | undefined;
        switch (e.kind) {
          case 'die': case 'famine': case 'burn': case 'flooded': case 'frozen':
            reason = prior ? `${voice} it began when ${CAUSE[prior.kind]}.` : m.impacts > 20 ? `${voice} the sky threw stones.` : m.tide > 30 ? `${voice} the sea came for them.` : m.warmth > 40 ? `${voice} the suns were cruel.` : m.dimming > 30 ? `${voice} the veil starved the fields.` : `${voice} the land was poor.`;
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
    entries: (limit = 50) => entries.slice(-limit).reverse().map(({ kind: _k, belief: _b, tick: _t, who: _w, ...e }) => e),
    snapshot: () => entries.map(({ kind: _k, belief: _b, tick: _t, who: _w, ...e }) => e),
    restore: (list) => {
      entries = list.map((e) => ({ ...e, kind: 'light' as const, tick: 0 }));
      nextId = entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    },
  };
};
