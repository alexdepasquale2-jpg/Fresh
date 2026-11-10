// Sky pieces (unit 20): the player's inventory, every planet's sky, and makeHeavens,
// the generated description of what a planet sees overhead, natural features included.
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

const STAR_STATE_SAYS: Record<string, string> = {
  variable: 'It swells and fades, slow as breath.', flare: 'Some days it spits fire.', dying: 'It is dying, and burns the brighter for it.', remnant: 'It is what is left of a larger star.',
};
const COMPANION_RGB: Record<string, RGB> = { dwarf: [1, 0.45, 0.3], main: [1, 0.9, 0.66], giant: [1, 0.7, 0.4], pulsar: [0.72, 0.84, 1] };
const COMPANION_WORD: Record<string, string> = { dwarf: 'red', main: 'gold', giant: 'amber', pulsar: 'blue-white' };
/** 'a' or 'an' in front of a word. */
const art = (w: string) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

/** The generated sky over one orbit. Pure in (system, orbit, skies). */
export const makeHeavens = (system: SystemSpec, orbitIndex: number, skyOfKey: (key: string) => SkyState): Heavens => {
  const orbit = system.orbits[orbitIndex] ?? system.orbits[0]!;
  const planet = system.planets[orbit.planet]!;
  const sky = skyOfKey(seedToHex(planet.seed));
  const born = planet.sky ?? {};
  const u = (label: string, i = 0) => seedToU32(mix(child(planet.seed, label), i)) / 0x100000000;
  const us = (label: string) => seedToU32(child(system.seed, label)) / 0x100000000;
  const count = (k: SkyPieceKind) => sky.pieces.filter((p) => p === k).length;
  // Each body carries a weight; the eight most striking are kept, most striking first.
  const all: { w: number; b: SkyBody }[] = [];
  // ---- the star: colour from its kind, heat and state; size from how close this orbit runs ----
  const st = system.star;
  const state = system.starState ?? 'steady';
  const heat = st.heat / 255;
  let rgb: RGB = st.kind === 'dwarf' ? mixRgb([1, 0.42, 0.26], [1, 0.62, 0.38], heat)
    : st.kind === 'giant' ? mixRgb([1, 0.58, 0.3], [1, 0.8, 0.52], heat)
    : st.kind === 'pulsar' ? mixRgb([0.7, 0.82, 1], [0.86, 0.9, 1], heat)
    : mixRgb([1, 0.86, 0.6], [0.86, 0.93, 1], heat);
  if (state === 'dying') rgb = mixRgb(rgb, [1, 0.36, 0.2], 0.45);
  else if (state === 'remnant' && st.kind !== 'pulsar') rgb = mixRgb(rgb, [0.92, 0.94, 1], 0.7);
  else if (state === 'flare') rgb = mixRgb(rgb, [1, 0.5, 0.3], 0.2);
  const kindSize = (st.kind === 'giant' ? 1.9 : st.kind === 'dwarf' ? 0.75 : st.kind === 'pulsar' ? 0.45 : 1) * (state === 'dying' ? 1.3 : state === 'remnant' && st.kind !== 'pulsar' ? 0.6 : 1);
  const dist = Math.max(0.5, orbit.ring + (sky.drift ?? 0) * 0.22);
  const size = Math.max(0.35, Math.min(3, (kindSize * 2.1) / (dist + 1.1)));
  const says: string[] = [`${STAR_SAYS[st.kind] ?? 'Their sun burns'}${size > 1.5 ? ', and it fills the sky' : size < 0.7 ? ', small and far' : ''}.`];
  if (STAR_STATE_SAYS[state] && st.kind !== 'pulsar') says.push(STAR_STATE_SAYS[state]!);
  if (planet.terrain.locked) says.push('It never sets on one side, and never rises on the other.');
  // ---- a companion sun: close ones keep beside the first, far ones own the night ----
  const comp = system.companion;
  if (comp) {
    const c = mixRgb(COMPANION_RGB[comp.kind] ?? [1, 1, 1], [1, 1, 1], (comp.heat / 255) * 0.3);
    const word = COMPANION_WORD[comp.kind] ?? 'pale';
    if (comp.close) {
      all.push({ w: 100, b: { kind: 'inner', size: 2.3 + (comp.heat / 255) * 0.5, turns: 2 + Math.floor(u('twin-turns') * 4), phase: u('twin-phase'), tilt: 0.035 + u('twin-tilt') * 0.03, rgb: c, ringed: false, name: 'second sun' } });
      says.push(`${art(word).replace(/^a/, 'A')} second sun circles the first and never leaves it.`);
    } else {
      all.push({ w: 100, b: { kind: 'world', size: 2.2 + (comp.heat / 255) * 0.4, turns: 1, phase: u('twin-phase'), tilt: u('twin-tilt') * 0.5 - 0.25, rgb: c, ringed: false, name: 'far sun' } });
      says.push(planet.terrain.locked ? `A far ${word} sun is the brightest star over their dark side.` : `A far ${word} sun is the brightest star of their night.`);
    }
  }
  // ---- the moons it was born with, then every moon hung here ----
  const natural = born.moons ?? [];
  const moonNames: string[] = [];
  natural.forEach((m, i) => {
    const sz = 0.55 + (m.size / 255) * 1.4;
    const name = `${SIZE_WORD(sz)} ${MOON_WORD[m.look] ?? 'pale'} moon`.trim();
    moonNames.push(name);
    all.push({ w: 60 + sz * 10, b: { kind: 'moon', size: sz, turns: m.turns, phase: u('born-moon-phase', i), tilt: u('born-moon-tilt', i) * 1.3 - 0.65, rgb: MOON_RGB[m.look] ?? MOON_RGB[0]!, ringed: false, name } });
  });
  if (natural.length) {
    const back = natural.some((m) => m.turns < 0);
    says.push(natural.length === 1 ? `It was born with ${art(moonNames[0]!)}${back ? ' that runs backwards' : ''}.` : `It was born with ${NUM[natural.length]} moons: ${moonNames.map((n) => n.replace(' moon', '')).join(', ')}${back ? '. One runs backwards' : ''}.`);
  }
  const moons = count('moon');
  const hung: SkyBody[] = [];
  for (let i = 0; i < moons; i++) {
    const c = Math.floor(u('moon-hue', i) * MOON_RGB.length);
    const sz = 0.6 + u('moon-size', i) * 1.3;
    const turns = (1 + Math.floor(u('moon-turns', i) * 12)) * (u('moon-dir', i) < 0.15 ? -1 : 1);
    hung.push({ kind: 'moon', size: sz, turns, phase: u('moon-phase', i), tilt: u('moon-tilt', i) * 1.2 - 0.6, rgb: MOON_RGB[c]!, ringed: false, name: `${SIZE_WORD(sz)} ${MOON_WORD[c]} moon`.trim() });
  }
  for (const b of hung) all.push({ w: 62 + b.size * 10, b });
  if (moons) says.push(moons === 1 ? `One ${natural.length ? 'hung ' : ''}moon, ${art(hung[0]!.name)}, crosses ${Math.abs(hung[0]!.turns)} times a year.` : `${moons} ${natural.length ? 'hung ' : ''}moons: ${hung.map((b) => b.name.replace(' moon', '')).join(', ')}.`);
  if (moons + natural.length >= 5) says.push(planet.terrain.locked ? 'The sky is crowded. Some of them hide the others.' : 'The night is crowded. Some of them hide the others.');
  // ---- the rogue: a captured world on a leaning road ----
  const rogue = system.rogue;
  if (rogue) {
    all.push({ w: 50, b: { kind: 'world', size: 1.55, turns: -1, phase: us('rogue-phase'), tilt: (rogue.tilt < 0 ? -1 : 1) * (0.62 + (Math.abs(rogue.tilt) / 70) * 0.36), rgb: mixRgb(BIOME_RGB[rogue.biome] ?? [1, 1, 1], [0.55, 0.5, 0.6], 0.35), ringed: false, name: rogue.name } });
    says.push(`${rogue.name}, a stolen world, crosses far off the others' road, the wrong way.`);
  }
  // ---- the long comet ----
  const lc = system.comet;
  if (lc) {
    const every = Math.max(2, Math.round(lc.periodTicks / orbit.periodTicks));
    all.push({ w: 46, b: { kind: 'comet', size: 1.5, turns: 1, phase: (lc.phase / 255 + orbit.index * 0.17) % 1, tilt: u('long-comet-tilt') * 1.0 - 0.5, rgb: [0.78, 0.95, 1], ringed: false, name: lc.name } });
    says.push(`The comet ${lc.name} comes back every ${every} of their years and hangs its tail across one season.`);
  }
  // ---- the other worlds of this star, and what has been hung on them ----
  for (const o of system.orbits) {
    if (o.index === orbit.index) continue;
    const q = system.planets[o.planet]!;
    const qs = skyOfKey(seedToHex(q.seed));
    const gap = Math.abs(o.ring - orbit.ring) || 1;
    const lit = 1 + Math.min(1, (qs.built ?? 0) / 6) * 0.5;
    const ringed = qs.pieces.includes('rings') || !!q.sky?.rings;
    const qMoons = qs.pieces.filter((k) => k === 'moon').length + (q.sky?.moons?.length ?? 0);
    const sz = Math.min(2.2, (1.5 / gap) * lit * (1 + qMoons * 0.12));
    const uq = (label: string) => seedToU32(child(q.seed, label)) / 0x100000000;
    const inner = o.ring < orbit.ring;
    const res = gap !== 1 ? undefined : inner ? orbit.resonance : o.resonance;
    all.push({ w: sz * 10 + (ringed ? 4 : 0), b: {
      kind: inner ? 'inner' : 'world', size: sz, turns: res ? Math.max(1, Math.abs(res[0] - res[1])) : 1 + Math.floor(uq('sky-turns') * 3), phase: uq('sky-phase'),
      tilt: inner ? 0.05 + 0.035 * (4 - gap) + uq('sky-tilt') * 0.03 : uq('sky-tilt') * 0.7 - 0.35,
      rgb: BIOME_RGB[q.terrain.biome] ?? [1, 1, 1], ringed, name: q.name,
    } });
    says.push(`${q.name} is ${art(BIOME_WORD[q.terrain.biome] ?? 'pale')} ${inner ? 'spark that keeps near the sun' : 'wanderer in the dark'}${ringed ? ', ringed' : ''}${(qs.built ?? 0) > 0 ? ', with lights of its own' : ''}${res ? `, in step with them: ${res[0]} years to ${res[1]}` : ''}.`);
  }
  const comets = count('comet');
  for (let i = 0; i < comets; i++) all.push({ w: 40 - i, b: { kind: 'comet', size: 0.8 + u('comet-size', i) * 0.8, turns: 1, phase: u('comet-phase', i), tilt: u('comet-tilt', i) * 1.2 - 0.6, rgb: mixRgb([0.75, 0.95, 0.9], [1, 0.95, 0.8], u('comet-hue', i)), ringed: false, name: 'comet' } });
  if (comets) says.push(comets === 1 ? 'A comet hangs there for part of each year.' : `${comets} comets trail across the year.`);
  const rings = count('rings'), belt = count('belt'), suns = count('sun'), dust = count('dust');
  // ---- bands: rings round this world, the belts and the disc round the star ----
  if (born.rings) says.push(rings ? 'Its own old ring, and the rings hung over it, arch from edge to edge.' : 'It has always worn a ring. It arches from edge to edge.');
  else if (rings) says.push(rings > 1 ? 'Rings within rings arch from edge to edge.' : 'A ring arches from edge to edge.');
  const nearBelt = (system.belts ?? []).find((b) => b.after === orbit.index || b.after === orbit.index - 1);
  const farBelt = !nearBelt && (system.belts?.length ?? 0) > 0;
  if (nearBelt) says.push(belt ? 'The old belt and the new one cross overhead, two rivers of stones.' : 'An old belt of stones runs beside their road, a band of glints.');
  else {
    if (farBelt) says.push('Far off, a faint band of stones catches the sun.');
    if (belt) says.push(belt > 1 ? 'A thick river of stones glints overhead.' : 'A thin river of stones glints overhead.');
  }
  if (system.disc) says.push('A pale disc of dust lies along the path of the sun.');
  if (suns) says.push(suns > 1 ? `${suns} lesser suns follow the first.` : 'A second, lesser sun follows the first.');
  if (dust) says.push('Dust reddens everything.');
  if ((sky.built ?? 0) > 0) says.push(`${sky.built} of their own lights cross it.`);
  all.sort((a, b) => b.w - a.w);
  const beltStrength = belt * 0.5 + (belt ? 0.25 : 0) + (nearBelt ? 0.4 + (nearBelt.density / 255) * 0.35 : farBelt ? 0.16 : 0) + (system.disc ? 0.08 + (system.disc.density / 255) * 0.14 : 0);
  return {
    star: { rgb, size, strobe: st.kind === 'pulsar', kind: st.kind },
    bodies: all.slice(0, 8).map((x) => x.b),
    rings: { strength: Math.min(1, rings * 0.5 + (rings ? 0.25 : 0) + (born.rings ? 0.6 : 0)), tilt: u('ring-tilt') * 0.8 - 0.4 },
    belt: { strength: Math.min(1, beltStrength), tilt: u('belt-tilt') * 0.8 - 0.4 },
    nebula: { tint: 10 + Math.floor(us('nebula') * 6), offset: us('nebula-at') * 40, strength: Math.min(1, 0.35 + us('nebula-much') * 0.65 + (system.disc ? 0.15 : 0)) },
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
