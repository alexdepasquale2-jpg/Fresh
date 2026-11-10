// STUB: replace with the real universe generator (unit 01). See README.md.
import type { UniverseGenFactory, UniverseSpec } from '@/contracts/universe';
import { child, rng } from '@/core/hash';
import { formatSerial, serialToSeed } from '@/core/serial';

const PALETTE = ['#17140c', '#231f12', '#2e2a18', '#3d3822', '#6f6535', '#8a7f4e', '#b3a868', '#c9bb62', '#e9dd9a', '#f6f0c8', '#bfeedd', '#5a7a8c', '#3b5566', '#8c5a3b', '#663b2a', '#ffffff'];

export const factory: UniverseGenFactory = ({ atlas, names }) => {
  const fromSeed = (seed: UniverseSpec['seed'], serialNumber: number): UniverseSpec => {
    const r = rng(child(seed, 'spec'));
    const law = r.pick(atlas.lawSets);
    return {
      seed,
      serialNumber,
      serial: formatSerial(serialNumber),
      name: names.universe(seed),
      glyph: r.int(64),
      laws: { id: law.id, name: law.name, tags: [...law.tags] },
      palette: [...PALETTE],
      materialTable: law.materials.map((m) => ({ ...m })),
      reactionTable: law.reactions.map((x) => ({ ...x })),
      pulseMilliHz: law.pulseMilliHz,
    };
  };
  return { fromSeed, fromSerial: (n) => fromSeed(serialToSeed(n), n) };
};
