// System generator (unit 04). Everything here is a pure function of the StarRef.
// The 1 to 4 orbits are the player's; companions, belts, discs, moons, rings, a rogue
// world and a long comet are natural features carried in optional fields.
import type { SystemGenFactory, PlanetSpec, NaturalMoon, NaturalBelt, StarState, CompanionStar, Orbit } from '@/contracts/system';
import { child, rng } from '@/core/hash';

type Biome = PlanetSpec['terrain']['biome'];
type Form = NonNullable<PlanetSpec['terrain']['form']>;
const BIOMES: readonly Biome[] = ['ash', 'salt', 'moss', 'tallow', 'glass'];
const RESONANCES: readonly (readonly [number, number])[] = [[2, 1], [3, 2], [5, 3], [3, 1], [5, 2]];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const factory: SystemGenFactory = ({ names }) => ({
  fromStar: (star) => {
    const seed = child(star.seed, 'system');
    const r = rng(seed);
    const n = star.kind === 'dwarf' ? r.range(1, 2) : star.kind === 'giant' ? r.range(3, 4) : r.range(2, 4);
    // ---- the star's state and anything that shares its light ----
    const nr = rng(child(seed, 'nature'));
    const roll = nr.int(12);
    const starState: StarState = star.kind === 'pulsar' ? 'remnant'
      : star.kind === 'giant' ? (roll < 4 ? 'dying' : roll < 7 ? 'variable' : 'steady')
      : star.kind === 'dwarf' ? (roll < 4 ? 'flare' : roll < 5 ? 'remnant' : roll < 6 ? 'variable' : 'steady')
      : roll < 2 ? 'variable' : roll < 3 ? 'flare' : 'steady';
    let companion: CompanionStar | undefined;
    if (nr.chance(2, 9)) {
      const close = nr.chance(1, 2);
      const kind = nr.chance(3, 5) ? 'dwarf' : nr.chance(1, 4) ? 'pulsar' : 'main';
      companion = { kind, heat: nr.range(30, 230), close, periodTicks: close ? nr.range(160, 420) : nr.range(26000, 60000) };
    }
    // How warm it is on ring i: the star, plus a little from a close companion, falling off outward.
    const kindHeat = star.kind === 'giant' ? 40 : star.kind === 'dwarf' ? -30 : star.kind === 'pulsar' ? -70 : 0;
    const stateHeat = starState === 'dying' ? 30 : starState === 'remnant' ? -40 : 0;
    const warmthAt = (i: number) => star.heat + 80 + kindHeat + stateHeat + (companion?.close ? companion.heat >> 2 : 0) - i * 70;
    const habitableAt = (i: number) => { const h = warmthAt(i); return h >= 70 && h <= 185; };
    // ---- belts, disc, rogue, comet ----
    const belts: NaturalBelt[] = [];
    for (let i = -1; i < n && belts.length < 2; i++) {
      // Between two orbits, or just past the last; rarely inside the first.
      if (nr.chance(i === -1 ? 1 : i === n - 1 ? 3 : 2, 11)) belts.push({ after: i, density: nr.range(70, 255) });
    }
    const disc = nr.chance(starState === 'dying' || starState === 'remnant' ? 5 : 2, 11) ? { density: nr.range(60, 255) } : undefined;
    const rogueRoll = nr.chance(1, 6);
    const rogueBits = { tilt: nr.range(25, 70) * (nr.chance(1, 2) ? 1 : -1), stretch: nr.range(90, 220), biome: nr.pick(BIOMES), period: nr.range(5200, 11000) };
    const cometRoll = nr.chance(2, 7);
    const cometBits = { period: nr.range(9000, 20000), axis: nr.int(360), phase: nr.int(256) };

    // ---- the worlds on the player's orbits ----
    const planets: PlanetSpec[] = [];
    const orbits: Orbit[] = [];
    let prevPeriod = 0;
    for (let i = 0; i < n; i++) {
      const s = child(seed, i);
      const pr = rng(s);
      const hot = warmthAt(i);
      const habitable = habitableAt(i);
      // Inner planets run hot (glass, ash), outer ones cold (salt); the habitable band grows things.
      const biome: Biome = hot > 215 ? (pr.chance(1, 2) ? 'glass' : 'ash')
        : hot < 45 ? (pr.chance(3, 4) ? 'salt' : pr.chance(1, 2) ? 'ash' : 'glass')
        : habitable ? pr.pick(['moss', 'moss', 'moss', 'tallow', 'tallow', 'salt', 'ash', 'glass'] as const)
        : pr.pick(BIOMES);
      const cold = hot < 45;
      const forms: readonly Form[] = cold ? ['iceshell', 'iceshell', 'iceshell', 'crater', 'highlands', 'canyon', 'ocean']
        : hot > 215 ? ['crater', 'crater', 'canyon', 'canyon', 'pangaea', 'highlands', 'continents']
        : habitable ? ['continents', 'continents', 'archipelago', 'archipelago', 'pangaea', 'ocean', 'highlands', 'canyon']
        : ['continents', 'archipelago', 'pangaea', 'canyon', 'crater', 'highlands', 'ocean', 'crater'];
      const form = pr.pick(forms);
      const [lo, hi] = form === 'archipelago' ? [140, 205] : form === 'ocean' ? [200, 245] : form === 'pangaea' ? [20, 70]
        : form === 'canyon' ? [20, 90] : form === 'crater' ? [10, 80] : form === 'iceshell' ? [150, 230] : form === 'highlands' ? [40, 130] : [70, 170];
      const seaLevel = clamp(pr.range(lo, hi) + (hot > 215 ? -30 : 0), 5, 250);
      const gravity = clamp((pr.int(256) + pr.int(256)) >> 1, 0, 255);
      const roughness = clamp(pr.int(256) + (form === 'highlands' || form === 'canyon' ? 50 : 0) + ((128 - gravity) >> 2), 0, 255);
      const locked = i === 0 && (star.kind === 'dwarf' || hot > 215 || !!companion?.close) ? pr.chance(1, 2) : i === 0 && pr.chance(1, 9);
      // Moons and rings: outer, heavier worlds keep more.
      const moons: NaturalMoon[] = [];
      const moonRoll = pr.int(100) + i * 8 + (gravity >> 4) - (locked ? 30 : 0);
      const nm = moonRoll < 58 ? 0 : moonRoll < 96 ? 1 : moonRoll < 118 ? 2 : 3;
      for (let m = 0; m < nm; m++) moons.push({ size: pr.range(40, 255), look: pr.int(6), turns: pr.range(1, 12) * (pr.chance(1, 7) ? -1 : 1) });
      const rings = pr.chance(1 + i, 12);
      const belt = belts.some((b) => b.after === i || b.after === i - 1);
      const period = (() => {
        const base = Math.round((600 * (i + 1) * (i + 1) * pr.range(88, 116)) / 100);
        if (i === 0) return { ticks: base, res: undefined };
        if (pr.chance(2, 5)) {
          const res = pr.pick(RESONANCES);
          return { ticks: Math.round((prevPeriod * res[0]) / res[1]), res };
        }
        return { ticks: Math.max(base, Math.round((prevPeriod * 13) / 9) + 7), res: undefined };
      })();
      prevPeriod = period.ticks;
      planets.push({
        seed: s,
        name: names.planet(s),
        terrain: { seaLevel, roughness, biome, form, gravity, ...(locked ? { locked: true } : {}), ...(habitable ? { habitable: true } : {}) },
        sky: {
          ...(moons.length ? { moons } : {}),
          ...(rings ? { rings: true } : {}),
          ...(belt ? { belt: true } : {}),
          ...(disc ? { disc: true } : {}),
          ...(companion ? { companion: companion.close ? 'close' as const : 'far' as const } : {}),
          ...(cometRoll ? { comet: true } : {}),
          ...(rogueRoll ? { rogue: true } : {}),
          star: starState,
        },
      });
      orbits.push({ index: i, ring: i + 1, planet: i, periodTicks: period.ticks, ...(period.res ? { resonance: period.res } : {}), ...(habitable ? { habitable: true } : {}) });
    }
    return {
      seed,
      name: names.system(seed),
      star,
      orbits,
      planets,
      starState,
      ...(companion ? { companion } : {}),
      ...(belts.length ? { belts } : {}),
      ...(disc ? { disc } : {}),
      ...(rogueRoll ? { rogue: { name: names.planet(child(seed, 'rogue')), biome: rogueBits.biome, tilt: rogueBits.tilt, stretch: rogueBits.stretch, periodTicks: rogueBits.period } } : {}),
      ...(cometRoll ? { comet: { name: names.planet(child(seed, 'comet')), periodTicks: cometBits.period, axis: cometBits.axis, phase: cometBits.phase } } : {}),
    };
  },
});
