// Universe generator (unit 01). Palette convention per index:
// 0 void,1 shade,2 dark,3 line,4 stone,5 earth,6 sand,7 gold,8 paper,9 pale,10 glow,11 water,12 deep,13 fire,14 ember,15 life
import type { UniverseGenFactory, UniverseSpec } from '@/contracts/universe';
import { child, rng } from '@/core/hash';
import { formatSerial, serialToSeed } from '@/core/serial';
import { character } from './character';

export { RARITY_ODDS, TRAITS, rarityOf, sumMods } from './character';

const BASE = ['#17140c', '#231f12', '#2e2a18', '#6f6535', '#8a7f4e', '#5a4a2a', '#c9bb62', '#c9a04a', '#e9dd9a', '#f6f0c8', '#bfeedd', '#4f7f86', '#2c4a52', '#d8743a', '#8c3b22', '#7f9a52'];
// Indices tinted by the law set hue (water, deep, life, glow stay readable).
const TINT = [11, 12, 15];

const hsl = (h: number, s: number, l: number) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
};
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 3 + ((n >> 8) & 255) * 6 + (n & 255)) / 2550;
};

export const factory: UniverseGenFactory = ({ atlas, names }) => {
  const fromSeed = (seed: UniverseSpec['seed'], serialNumber: number): UniverseSpec => {
    const r = rng(child(seed, 'spec'));
    const law = r.pick(atlas.lawSets);
    const hue = ((law.hue ?? 40) + r.range(-25, 25) + 360) % 360;
    const palette = BASE.map((c, i) => (TINT.includes(i) ? hsl((hue + (i === 15 ? 60 : i >= 11 ? 150 : 0)) % 360, 0.25 + r.int(20) / 100, Math.min(0.75, Math.max(0.15, lum(c)))) : c));
    const name = names.universe(seed);
    return {
      seed,
      serialNumber,
      serial: formatSerial(serialNumber),
      name,
      glyph: r.int(64),
      laws: { id: law.id, name: law.name, tags: [...law.tags] },
      palette,
      materialTable: law.materials.map((m) => ({ ...m })),
      reactionTable: law.reactions.map((x) => ({ ...x })),
      pulseMilliHz: law.pulseMilliHz,
      // Character comes from its own seed streams; it cannot touch the fields above.
      ...character(seed, name, law.tags, names),
    };
  };
  return { fromSeed, fromSerial: (n) => fromSeed(serialToSeed(n), n) };
};
