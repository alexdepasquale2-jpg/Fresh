// Merging (game/merge). Any two things make a third, new thing. Pure and seeded.
import type { MergerFactory, Thing, MergeResult } from '@/contracts/merge';
import type { SkyPieceKind } from '@/contracts/sky';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { serialToSeed } from '@/core/serial';
import { child, mix, seedToU32 } from '@/core/hash';

// The law set each sky piece pulls a universe toward.
const SIGN: Record<SkyPieceKind, string> = {
  comet: 'cold-fire', moon: 'salt-tide', belt: 'ash-choir', sun: 'glass-rain', rings: 'slow-time', dust: 'pale-moss',
};
// Piece + piece. Same kinds climb to something greater; different kinds make the third they imply.
const FUSE: Record<string, [SkyPieceKind, string]> = {
  'comet+comet': ['belt', 'Two comets shatter into a belt.'],
  'moon+moon': ['rings', 'Two moons grind each other into rings.'],
  'belt+belt': ['moon', 'The belts gather into a moon.'],
  'sun+sun': ['dust', 'Two suns burn out into dust.'],
  'rings+rings': ['sun', 'The rings fall inward and catch light.'],
  'dust+dust': ['comet', 'The dust freezes into a comet.'],
  'comet+moon': ['rings', 'The comet breaks on the moon and rings it.'],
  'belt+comet': ['dust', 'Comet and belt grind to dust.'],
  'comet+sun': ['dust', 'The sun boils the comet to dust.'],
  'comet+rings': ['moon', 'The comet gathers the rings into a moon.'],
  'comet+dust': ['belt', 'Ice and dust clot into a belt.'],
  'belt+moon': ['rings', 'The moon pulls the belt into rings.'],
  'moon+sun': ['comet', 'A sunlit moon sheds a comet.'],
  'moon+rings': ['belt', 'Moon and rings scatter into a belt.'],
  'dust+moon': ['comet', 'Dust on a cold moon makes a comet.'],
  'belt+sun': ['rings', 'The sun melts the belt into rings.'],
  'belt+rings': ['sun', 'Belt and rings fall together and ignite.'],
  'belt+dust': ['moon', 'Belt and dust settle into a moon.'],
  'rings+sun': ['dust', 'The sun burns the rings to dust.'],
  'dust+sun': ['moon', 'Dust around a sun cools to a moon.'],
  'dust+rings': ['comet', 'Ring ice and dust make a comet.'],
};

export const factory: MergerFactory = ({ universes }) => {
  /** Among 24 seeded candidates, pick the first with a wanted law set that is not a parent. */
  const candidate = (seed: ReturnType<typeof serialToSeed>, wanted: string[], not: number[]) => {
    let fallback = -1;
    for (let k = 0; k < 24; k++) {
      const serial = seedToU32(child(seed, k)) & 0xffffff;
      if (not.includes(serial)) continue;
      if (fallback < 0) fallback = serial;
      if (wanted.includes(universes.fromSerial(serial).laws.id)) return serial;
    }
    return fallback;
  };
  return {
    merge: (a: Thing, b: Thing): MergeResult => {
      if (a.kind === 'piece' && b.kind === 'piece') {
        const [x, y] = [a.piece, b.piece].sort();
        const [piece, says] = FUSE[`${x}+${y}`] ?? [SKY_PIECE_KINDS.find((k) => k !== x && k !== y)!, 'They become something else.'];
        return { kind: 'piece', piece, count: 2, says };
      }
      if (a.kind === 'universe' && b.kind === 'universe') {
        const [lo, hi] = [a.serialNumber, b.serialNumber].sort((p, q) => p - q) as [number, number];
        const pa = universes.fromSerial(lo), pb = universes.fromSerial(hi);
        const seed = mix(mix(child(serialToSeed(lo), 'merge'), hi), 0x6d657267);
        const spec = universes.fromSerial(candidate(seed, [pa.laws.id, pb.laws.id], [lo, hi]));
        return { kind: 'universe', spec, says: `${pa.name} and ${pb.name} fold into each other. ${spec.name} opens where they were.` };
      }
      const u = a.kind === 'universe' ? a : (b as Extract<Thing, { kind: 'universe' }>);
      const p = a.kind === 'piece' ? a : (b as Extract<Thing, { kind: 'piece' }>);
      const parent = universes.fromSerial(u.serialNumber);
      const seed = child(child(serialToSeed(u.serialNumber), 'imbue'), p.piece);
      const spec = universes.fromSerial(candidate(seed, [SIGN[p.piece]], [u.serialNumber]));
      return { kind: 'universe', spec, says: `The ${p.piece} sinks into ${parent.name}. It is reborn as ${spec.name}.` };
    },
    combineStats: (a, b) => ({
      worldsTended: a.worldsTended + (b?.worldsTended ?? 0),
      deepestFold: Math.max(a.deepestFold, b?.deepestFold ?? 0),
      lightFromGlow: a.lightFromGlow + (b?.lightFromGlow ?? 0),
      souls: (a.souls ?? 0) + (b?.souls ?? 0),
      era: Math.max(a.era ?? 0, b?.era ?? 0),
      belief: a.belief ?? b?.belief ?? 'none',
      enlightenment: Math.max(a.enlightenment ?? 0, b?.enlightenment ?? 0),
    }),
  };
};
