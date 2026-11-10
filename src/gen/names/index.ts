// Name grammar (unit 02): Ossuary Minor, Pallid Choir, Tallow, Saltmere, Age of Tides.
import type { NameGenFactory } from '@/contracts/universe';
import type { Seed } from '@/contracts/seed';
import { child, rng } from '@/core/hash';
import type { Rng } from '@/core/hash';

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

export const factory: NameGenFactory = () => ({
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
});
