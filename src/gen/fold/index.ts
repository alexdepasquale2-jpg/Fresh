// Fold generator (unit 03). O(1) in depth: everything comes from the pathHash,
// plus the universe's strata layout, which is a function of the universe seed alone.
import type { FoldGenFactory, FoldNode, FoldThingKind, Stratum, StratumMotion } from '@/contracts/fold';
import type { FoldAddress, Seed } from '@/contracts/seed';
import { child, mix, rng, seedToU32 } from '@/core/hash';

const KINDS = ['dwarf', 'main', 'main', 'giant', 'pulsar'] as const;
const MOTIONS: readonly StratumMotion[] = ['still', 'drift', 'churn', 'shiver', 'pull'];
const LAST = 1_000_000;

// Names by how deep the stratum lies: skin, upper, middle, lower, hem.
const NAMES: readonly (readonly string[])[] = [
  ['The Shallows', 'The Lid', 'First Dark', 'The Skin', 'Pale Reach', 'The Threshold'],
  ['The Galleries', 'Lantern Stair', 'The Drift', 'Moth Country', 'The Rafters', 'Thin Water'],
  ['The Churn', 'The Weather', 'Choir Deep', 'The Orchard', 'Salt Reach', 'The Loom'],
  ['The Undertow', 'The Narrows', 'Long Quiet', 'The Cellar', 'Cold Stair', 'The Sink'],
  ['The Hush', 'The Sill', 'Last Rings', 'The Hem', 'Floorward', 'The Lamp Dark'],
];
const MOTION_LINE: Record<StratumMotion, string> = {
  still: 'Nothing moves here.',
  drift: 'Everything leans one way.',
  churn: 'The rings turn against each other.',
  shiver: 'The dark trembles, very slightly.',
  pull: 'The fall is hungrier here.',
};

/** The part of a stratum that depends on the seed alone (so childrenOf needs no UniverseSpec). */
interface Band { from: number; to: number; tier: number; hues: [number, number, number]; dark: number; motion: StratumMotion; starF: number; flickerPm: number; pickupPm: number; hazardPm: number; favour: number }

const bandsOf = (seed: Seed): Band[] => {
  // The floor: the same derivation the dive uses (24..36 folds down).
  const floor = rng(child(seed, 'bottom')).range(24, 36);
  const r = rng(child(seed, 'strata'));
  const n = r.range(4, 5);
  const tiers = n === 5 ? [0, 1, 2, 3, 4] : [0, r.range(1, 2), 3, 4];
  const bands: Band[] = [];
  let from = 0;
  let lastHue = 0;
  let lastMotion: StratumMotion = 'still';
  for (let i = 0; i < n; i++) {
    const to = i === n - 1 ? LAST : Math.max(from + 4, Math.round(((i + 1) * floor) / n) + r.range(-1, 1));
    let a = r.range(1, 12);
    if (a === lastHue) a = (a % 12) + 1;
    lastHue = a;
    const b = ((a + r.range(1, 3)) % 14) + 1;
    const c = ((a + r.range(5, 9)) % 14) + 1;
    let motion = i === 0 ? 'still' : r.pick(MOTIONS);
    if (motion === lastMotion) motion = MOTIONS[(MOTIONS.indexOf(motion) + 1 + (i % 3)) % MOTIONS.length]!;
    lastMotion = motion;
    bands.push({
      from, to, tier: tiers[i]!, hues: [a, b, c], dark: Math.min(80, i * 14 + r.range(0, 14)), motion,
      starF: i === 0 ? 100 : r.range(70, 135),
      flickerPm: r.range(50, 110),
      pickupPm: r.range(70, 150),
      hazardPm: i === 0 ? 35 : Math.min(190, 45 + i * 28 + r.range(0, 30)),
      favour: r.int(4),
    });
    from = to;
  }
  return bands;
};

// One-entry memo: a dive stays in one universe. Pure either way.
let memoHi = -1, memoLo = -1, memo: Band[] = [];
const bands = (seed: Seed): Band[] => {
  if (seed.hi !== memoHi || seed.lo !== memoLo) { memo = bandsOf(seed); memoHi = seed.hi; memoLo = seed.lo; }
  return memo;
};
const bandAt = (bs: Band[], depth: number): Band => {
  for (let i = 0; i < bs.length; i++) if (depth < bs[i]!.to) return bs[i]!;
  return bs[bs.length - 1]!;
};

const PICKUPS: readonly FoldThingKind[] = ['piece', 'well', 'echo', 'wreck'];
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export const factory: FoldGenFactory = () => ({
  root: (u) => ({ universe: u.seed, pathHash: u.seed, depth: 0 }),
  childrenOf: (a): FoldNode[] => {
    const band = bandAt(bands(a.universe), a.depth + 1);
    // Star density per mille: none at the top, rising to a plateau by fold 12, bent by the stratum.
    const starPm = a.depth < 2 ? 0 : Math.round((Math.min(220, 40 + a.depth * 15) * band.starF) / 100);
    const hazardPm = a.depth < 3 ? 0 : band.hazardPm;
    let hazards = 0;
    const out: FoldNode[] = [];
    for (let index = 0; index < 7; index++) {
      const address: FoldAddress = { universe: a.universe, pathHash: mix(a.pathHash, index), depth: a.depth + 1 };
      const r = rng(child(address.pathHash, 'content'));
      const roll = r.int(1000);
      if (index > 0 && roll < starPm) { out.push({ index, address, star: { address, seed: child(address.pathHash, 'star'), kind: r.pick(KINDS), heat: r.int(256) } }); continue; }
      if (index > 0 && roll >= 1000 - band.flickerPm) { out.push({ index, address, flicker: { address, serialNumber: seedToU32(child(address.pathHash, 'flicker')) & 0xffffff } }); continue; }
      const t = rng(child(address.pathHash, 'thing'));
      const roll2 = t.int(1000);
      const power = t.int(256);
      const key = t.u32();
      // Never wall the player in: at most four hazards in a fold.
      if (roll2 < hazardPm && hazards < 4) {
        hazards++;
        const k = t.int(100);
        const kind: FoldThingKind = k < 45 ? 'storm' : k < 80 || band.from === 0 ? 'undertow' : 'follower';
        out.push({ index, address, thing: { kind, power, key } });
        continue;
      }
      if (index > 0 && roll2 >= 1000 - band.pickupPm) {
        // Each stratum favours one kind of thing.
        const k = t.int(100);
        const kind = k < 30 ? PICKUPS[band.favour]! : PICKUPS[t.int(4)]!;
        out.push({ index, address, thing: { kind, power, key } });
        continue;
      }
      out.push({ index, address });
    }
    return out;
  },
  strata: (u): Stratum[] => {
    const bs = bandsOf(u.seed);
    const r = rng(child(u.seed, 'strata-names'));
    // One stratum carries the universe's law in its name.
    const tagAt = r.int(bs.length);
    const tag = u.laws.tags[0] ?? '';
    return bs.map((b, index) => {
      let name = r.pick(NAMES[b.tier]!);
      if (index === tagAt && tag && tag.length <= 10) name = `${tag.split(' ').map(title).join(' ')} ${name.replace(/^The /, '')}`;
      const starPm = Math.round((220 * b.starF) / 100);
      const hint = b.hazardPm >= 120 ? ' Mind what waits in the rings.' : b.starF >= 115 ? ' Stars crowd close.' : b.pickupPm >= 115 ? ' Things were left here.' : b.starF <= 85 ? ' Stars are few.' : '';
      return { index, name, from: b.from, to: b.to, hues: b.hues, dark: b.dark, motion: b.motion, starPm, flickerPm: b.flickerPm, pickupPm: b.pickupPm, hazardPm: b.hazardPm, line: MOTION_LINE[b.motion] + hint };
    });
  },
});
