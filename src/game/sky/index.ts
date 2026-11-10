// STUB: replace with the real sky-piece game logic (unit 20). See README.md.
import type { SkyGameFactory, SkyPieceKind, SkyState, Heavens, SkyBody } from '@/contracts/sky';
import { SKY_MAX_PIECES } from '@/contracts/sky';
import type { SystemSpec } from '@/contracts/system';
import { seedToHex, seedToU32, child, mix } from '@/core/hash';

type RGB = readonly [number, number, number];
const BIOME_RGB: Record<string, RGB> = { ash: [0.62, 0.6, 0.64], salt: [0.96, 0.93, 0.84], moss: [0.5, 0.82, 0.5], tallow: [0.97, 0.8, 0.48], glass: [0.58, 0.86, 0.97] };
const BIOME_WORD: Record<string, string> = { ash: 'grey', salt: 'white', moss: 'green', tallow: 'amber', glass: 'pale blue' };
const MOON_RGB: readonly RGB[] = [[0.93, 0.92, 0.86], [0.8, 0.78, 0.72], [0.95, 0.82, 0.62], [0.72, 0.84, 0.92], [0.9, 0.66, 0.56], [0.74, 0.9, 0.78]];
const MOON_WORD = ['bone', 'ash', 'honey', 'ice', 'rust', 'jade'];
const SIZE_WORD = (s: number) => (s > 1.45 ? 'great' : s < 0.8 ? 'small' : '');
const STAR_SAYS: Record<string, string> = {
  dwarf: 'Their sun is a red ember', main: 'Their sun is a steady lamp', giant: 'Their sun is swollen and old', pulsar: 'Their sun is a cold star that beats',
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** The generated sky over one orbit. Pure in (system, orbit, skies). */
const makeHeavens = (system: SystemSpec, orbitIndex: number, skyOfKey: (key: string) => SkyState): Heavens => {
  const orbit = system.orbits[orbitIndex] ?? system.orbits[0]!;
  const planet = system.planets[orbit.planet]!;
  const sky = skyOfKey(seedToHex(planet.seed));
  const u = (label: string, i = 0) => seedToU32(mix(child(planet.seed, label), i)) / 0x100000000;
  const count = (k: SkyPieceKind) => sky.pieces.filter((p) => p === k).length;
  // ---- the star: colour from its kind and heat, size from how close this orbit runs ----
  const st = system.star;
  const heat = st.heat / 255;
  const rgb: RGB = st.kind === 'dwarf' ? mixRgb([1, 0.42, 0.26], [1, 0.62, 0.38], heat)
    : st.kind === 'giant' ? mixRgb([1, 0.58, 0.3], [1, 0.8, 0.52], heat)
    : st.kind === 'pulsar' ? mixRgb([0.7, 0.82, 1], [0.86, 0.9, 1], heat)
    : mixRgb([1, 0.86, 0.6], [0.86, 0.93, 1], heat);
  const kindSize = st.kind === 'giant' ? 1.9 : st.kind === 'dwarf' ? 0.75 : st.kind === 'pulsar' ? 0.45 : 1;
  const dist = Math.max(0.5, orbit.ring + (sky.drift ?? 0) * 0.22);
  const size = Math.max(0.35, Math.min(3, (kindSize * 2.1) / (dist + 1.1)));
  const says: string[] = [`${STAR_SAYS[st.kind] ?? 'Their sun burns'}${size > 1.5 ? ', and it fills the sky' : size < 0.7 ? ', small and far' : ''}.`];
  const bodies: SkyBody[] = [];
  // ---- every moon placed here is its own moon ----
  const moons = count('moon');
  for (let i = 0; i < moons; i++) {
    const c = Math.floor(u('moon-hue', i) * MOON_RGB.length);
    const sz = 0.6 + u('moon-size', i) * 1.3;
    const turns = (1 + Math.floor(u('moon-turns', i) * 12)) * (u('moon-dir', i) < 0.15 ? -1 : 1);
    bodies.push({ kind: 'moon', size: sz, turns, phase: u('moon-phase', i), tilt: u('moon-tilt', i) * 1.2 - 0.6, rgb: MOON_RGB[c]!, ringed: false, name: `${SIZE_WORD(sz)} ${MOON_WORD[c]} moon`.trim() });
  }
  if (moons) says.push(moons === 1 ? `One moon, a ${bodies[0]!.name}, crosses ${Math.abs(bodies[0]!.turns)} times a year.` : `${moons} moons: ${bodies.slice(0, moons).map((b) => b.name.replace(' moon', '')).join(', ')}.`);
  // ---- the other worlds of this star, and what has been hung on them ----
  const worlds: SkyBody[] = [];
  for (const o of system.orbits) {
    if (o.index === orbit.index) continue;
    const q = system.planets[o.planet]!;
    const qs = skyOfKey(seedToHex(q.seed));
    const gap = Math.abs(o.ring - orbit.ring) || 1;
    const lit = 1 + Math.min(1, (qs.built ?? 0) / 6) * 0.5;
    const ringed = qs.pieces.includes('rings');
    const sz = Math.min(2.2, (1.5 / gap) * lit * (1 + qs.pieces.filter((k) => k === 'moon').length * 0.12));
    const uq = (label: string) => seedToU32(child(q.seed, label)) / 0x100000000;
    const inner = o.ring < orbit.ring;
    worlds.push({
      kind: inner ? 'inner' : 'world', size: sz, turns: 1 + Math.floor(uq('sky-turns') * 3), phase: uq('sky-phase'),
      tilt: inner ? 0.05 + 0.035 * (4 - gap) + uq('sky-tilt') * 0.03 : uq('sky-tilt') * 0.7 - 0.35,
      rgb: BIOME_RGB[q.terrain.biome] ?? [1, 1, 1], ringed, name: q.name,
    });
    says.push(`${q.name} is a ${BIOME_WORD[q.terrain.biome] ?? 'pale'} ${inner ? 'spark that keeps near the sun' : 'wanderer in the dark'}${ringed ? ', ringed' : ''}${(qs.built ?? 0) > 0 ? ', with lights of its own' : ''}.`);
  }
  worlds.sort((a, b) => b.size - a.size);
  bodies.push(...worlds);
  const comets = count('comet');
  for (let i = 0; i < comets; i++) bodies.push({ kind: 'comet', size: 0.8 + u('comet-size', i) * 0.8, turns: 1, phase: u('comet-phase', i), tilt: u('comet-tilt', i) * 1.2 - 0.6, rgb: mixRgb([0.75, 0.95, 0.9], [1, 0.95, 0.8], u('comet-hue', i)), ringed: false, name: 'comet' });
  if (comets) says.push(comets === 1 ? 'A comet hangs there for part of each year.' : `${comets} comets trail across the year.`);
  const rings = count('rings'), belt = count('belt'), suns = count('sun'), dust = count('dust');
  if (rings) says.push(rings > 1 ? 'Rings within rings arch from edge to edge.' : 'A ring arches from edge to edge.');
  if (belt) says.push(belt > 1 ? 'A thick river of stones glints overhead.' : 'A thin river of stones glints overhead.');
  if (suns) says.push(suns > 1 ? `${suns} lesser suns follow the first.` : 'A second, lesser sun follows the first.');
  if (dust) says.push('Dust reddens everything.');
  if ((sky.built ?? 0) > 0) says.push(`${sky.built} of their own lights cross it.`);
  return {
    star: { rgb, size, strobe: st.kind === 'pulsar', kind: st.kind },
    bodies: bodies.slice(0, 8),
    rings: { strength: Math.min(1, rings * 0.5 + (rings ? 0.25 : 0)), tilt: u('ring-tilt') * 0.8 - 0.4 },
    belt: { strength: Math.min(1, belt * 0.5 + (belt ? 0.25 : 0)), tilt: u('belt-tilt') * 0.8 - 0.4 },
    nebula: { tint: 10 + Math.floor((seedToU32(child(system.seed, 'nebula')) / 0x100000000) * 6), offset: (seedToU32(child(system.seed, 'nebula-at')) / 0x100000000) * 40, strength: 0.35 + (seedToU32(child(system.seed, 'nebula-much')) / 0x100000000) * 0.65 },
    says,
  };
};

export const factory: SkyGameFactory = () => {
  let inventory: Record<SkyPieceKind, number> = { comet: 2, moon: 2, belt: 1, sun: 0, rings: 1, dust: 0 };
  let skies = new Map<string, SkyState>();
  const get = (key: string): SkyState => skies.get(key) ?? { planetKey: key, pieces: [] };
  return {
    inventory: () => inventory,
    grant: (k, n) => void (inventory[k] += n),
    place: (kind, system, orbitIndex) => {
      const orbit = system.orbits[orbitIndex];
      if (!orbit) return { ok: false, reason: 'bad-orbit' };
      if (inventory[kind] <= 0) return { ok: false, reason: 'none-left' };
      const key = seedToHex(system.planets[orbit.planet]!.seed);
      const sky = get(key);
      if (sky.pieces.length >= SKY_MAX_PIECES) return { ok: false, reason: 'sky-full' };
      const next = { ...sky, planetKey: key, pieces: [...sky.pieces, kind] };
      skies.set(key, next);
      inventory[kind]--;
      return { ok: true, sky: next };
    },
    remove: (key, i) => {
      const s = get(key);
      skies.set(key, { ...s, planetKey: key, pieces: s.pieces.filter((_, j) => j !== i) });
    },
    skyOf: (planet) => get(seedToHex(planet.seed)),
    heavens: (system, orbitIndex) => makeHeavens(system, orbitIndex, get),
    nudge: (key, delta) => {
      const sky = get(key);
      const next = { ...sky, drift: Math.max(-3, Math.min(3, (sky.drift ?? 0) + Math.sign(delta))) };
      skies.set(key, next);
      return next;
    },
    queue: (key, event) => {
      const sky = get(key);
      const next = { ...sky, queued: [...(sky.queued ?? []), event].slice(-8) };
      skies.set(key, next);
      return next;
    },
    build: (key, n) => {
      const sky = get(key);
      const next = { ...sky, built: Math.max(0, Math.min(12, (sky.built ?? 0) + n)) };
      skies.set(key, next);
      return next;
    },
    takeQueued: (key) => {
      const sky = get(key);
      if (!sky.queued?.length) return [];
      skies.set(key, { ...sky, queued: [] });
      return [...sky.queued];
    },
    snapshot: () => ({ inventory: { ...inventory }, skies: [...skies.values()] }),
    restore: (s) => {
      inventory = { ...s.inventory };
      skies = new Map(s.skies.map((x) => [x.planetKey, x]));
    },
  };
};
