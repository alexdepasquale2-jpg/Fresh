// STUB: replace with the real name grammar (unit 02). See README.md.
import type { NameGenFactory } from '@/contracts/universe';
import { child, rng } from '@/core/hash';

const WORDS = ['Ossuary', 'Pallid', 'Choir', 'Tallow', 'Saltmere', 'Minor', 'Wick', 'Ember'] as const;
export const factory: NameGenFactory = () => {
  const w = (s: Parameters<typeof child>[0], k: string) => rng(child(s, k)).pick(WORDS);
  return {
    universe: (s) => `${w(s, 'u1')} ${w(s, 'u2')}`,
    system: (s) => `${w(s, 's1')} ${w(s, 's2')}`,
    planet: (s) => w(s, 'p'),
    village: (s) => w(s, 'v'),
    age: (s) => `Age of ${w(s, 'a')}`,
  };
};
