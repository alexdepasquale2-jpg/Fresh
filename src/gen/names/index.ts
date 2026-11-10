// Name grammar (unit 02): Ossuary Minor, Pallid Choir, Tallow, Saltmere, Age of Tides.
// The five first methods are frozen: their outputs for a seed never change (saves, serials and
// golden tests rely on them). Everything wider lives in the optional methods below and in ./grammar.
import type { NameGenFactory } from '@/contracts/universe';
import type { Seed } from '@/contracts/seed';
import { child, rng } from '@/core/hash';
import type { Rng } from '@/core/hash';
import { FAMILIES, WIDE, PATTERNS } from './grammar';
import type { Family } from './grammar';

const W = {
  noun: ['Ossuary', 'Choir', 'Tallow', 'Reliquary', 'Lantern', 'Vigil', 'Censer', 'Hollow', 'Wick', 'Psalter', 'Cairn', 'Orrery', 'Vesper', 'Shroud', 'Sallow', 'Gloam'],
  adj: ['Pallid', 'Minor', 'Major', 'Hollow', 'Ashen', 'Wan', 'Lesser', 'Grey', 'Lambent', 'Quiet', 'Drowned', 'Pale', 'Last', 'Low'],
  pre: ['Salt', 'Ash', 'Wax', 'Bone', 'Moth', 'Fen', 'Cinder', 'Brine', 'Thorn', 'Candle', 'Rook', 'Hob', 'Lich', 'Elder', 'Mire', 'Tal'],
  suf: ['mere', 'low', 'wick', 'fold', 'hithe', 'stead', 'combe', 'well', 'barrow', 'ford', 'mark', 'holm', 'lea', 'tor'],
  age: ['Tides', 'Ash', 'Lamps', 'Quiet', 'Salt', 'Long Night', 'Two Suns', 'Falling Stone', 'Moss', 'Bells', 'Small Fires', 'Rings'],
};
const pick = (r: Rng, k: keyof typeof W) => r.pick(W[k]);
const place = (r: Rng) => `${pick(r, 'pre')}${pick(r, 'suf')}`;
const g = (s: Seed, k: string) => rng(child(s, k));

/* ---------- The wider grammar ---------- */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** No triple letters, no three consonants stuttering at a join. Only ever applied to made-up syllables. */
const tidy = (s: string) => s.replace(/(.)\1\1+/g, '$1$1').replace(/([b-df-hj-np-tv-xz])\1([b-df-hj-np-tv-xz])/g, '$1$2');
const syl = (r: Rng, f: Family, closed: boolean) => `${r.pick(f.onset)}${r.pick(f.vowel)}${closed ? r.pick(f.coda) : ''}`;
/** One or two syllables in the family's sound, lower case. */
const stem = (r: Rng, f: Family, long: boolean) => tidy(long ? syl(r, f, false) + syl(r, f, r.chance(1, 2)) : syl(r, f, true));
const fam = (i: number | undefined, r: Rng): Family => FAMILIES[i === undefined ? r.int(FAMILIES.length) : ((i % FAMILIES.length) + FAMILIES.length) % FAMILIES.length]!;
const VOWEL = /[aeiouy]/;
/** A stem and an ending; a consonant goes between two vowels so the join can be said. */
const join = (r: Rng, f: Family, long: boolean, end: string) => {
  const st = stem(r, f, long);
  return cap(tidy(VOWEL.test(st.slice(-1)) && VOWEL.test(end.charAt(0)) ? st + r.pick(f.coda) + end : st + end));
};
/** Fill a pattern: {s} stem, {S} long stem, {p} place ending, {e} person ending, other {keys} from WIDE or the family. */
const fill = (pattern: string, r: Rng, f: Family): string =>
  pattern
    .replace(/\{([sS])\}\{([pe])\}/g, (_, a: string, b: string) => join(r, f, a === 'S', r.pick(b === 'p' ? f.place : f.person)))
    .replace(/\{(\w+)\}/g, (_, k: string) => {
      if (k === 's') return cap(stem(r, f, false));
      if (k === 'S') return cap(stem(r, f, true));
      if (k === 'p') return r.pick(f.place);
      if (k === 'e') return r.pick(f.person);
      if (k === 'w') return r.pick(f.words);
      const list = (WIDE as Record<string, readonly string[]>)[k];
      return list ? r.pick(list) : '';
    });
const made = (kind: keyof typeof PATTERNS, r: Rng, f: Family): string => {
  // Try a few patterns so a long draw falls back to a shorter one: names stay within 24 characters.
  for (let i = 0; i < 6; i++) {
    const s = fill(r.pick(PATTERNS[kind]), r, f).replace(/\s+/g, ' ').trim();
    // Within 24 characters, no word said twice ("Lamp Lamp"), no run of four vowels.
    if (s.length >= 3 && s.length <= 24 && !/\b(\w{3,})\b.*\b\1\b/i.test(s) && !/[aeiou]{4}/i.test(s)) return s;
  }
  return cap(stem(r, f, true));
};
const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
/** Same opening four letters, or at most one letter apart. */
export const nearAlike = (a: string, b: string): boolean => {
  const x = letters(a), y = letters(b);
  if (x === y) return true;
  if (x.length >= 4 && y.length >= 4 && x.slice(0, 4) === y.slice(0, 4)) return true;
  if (Math.abs(x.length - y.length) > 1) return false;
  // Edit distance <= 1, in one pass.
  let i = 0, j = 0, edits = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (x.length > y.length) i++; else if (y.length > x.length) j++; else { i++; j++; }
  }
  return edits + (x.length - i) + (y.length - j) <= 1;
};
/** `count` names from one seed, none near-alike. Each slot retries on its own seeded sequence. */
const setOf = (seed: Seed, label: string, count: number, one: (s: Seed) => string): string[] => {
  const out: string[] = [];
  const base = child(seed, label);
  for (let i = 0; i < count; i++) {
    let name = '';
    for (let k = 0; k < 24; k++) {
      name = one(child(child(base, i), k));
      if (!out.some((o) => nearAlike(o, name))) break;
    }
    out.push(name);
  }
  return out;
};

export const factory: NameGenFactory = () => {
  const family = (s: Seed) => rng(child(s, 'family')).int(FAMILIES.length);
  const wide = (kind: keyof typeof PATTERNS, label: string) => (s: Seed, f?: number) => {
    const r = g(s, label);
    return made(kind, r, fam(f, r));
  };
  const planetIn = wide('planet', 'planet-wide');
  const villageIn = wide('village', 'village-wide');
  const person = wide('person', 'person');
  return {
    universe: (s) => {
      const r = g(s, 'universe');
      return r.chance(1, 2) ? `${pick(r, 'noun')} ${pick(r, 'adj')}` : `${pick(r, 'adj')} ${pick(r, 'noun')}`;
    },
    system: (s) => {
      const r = g(s, 'system');
      return r.chance(1, 3) ? `The ${pick(r, 'noun')}` : `${pick(r, 'noun')} of ${place(r)}`;
    },
    planet: (s) => place(g(s, 'planet')),
    village: (s) => place(g(s, 'village')),
    age: (s) => `Age of ${pick(g(s, 'age'), 'age')}`,

    families: () => FAMILIES.length,
    family,
    person,
    creed: wide('creed', 'creed'),
    universeWide: (s) => { const r = g(s, 'universe-wide'); return made('universe', r, fam(family(s), r)); },
    systemIn: wide('system', 'system-wide'),
    planetIn,
    villageIn,
    ageWide: (s) => { const r = g(s, 'age-wide'); return made('age', r, fam(undefined, r)); },
    planetSet: (s, count, f) => setOf(s, 'planet-set', count, (x) => planetIn(x, f)),
    villageSet: (s, count, f) => setOf(s, 'village-set', count, (x) => villageIn(x, f)),
    peopleSet: (s, count, f) => setOf(s, 'people-set', count, (x) => person(x, f)),
    nearAlike,
  };
};
