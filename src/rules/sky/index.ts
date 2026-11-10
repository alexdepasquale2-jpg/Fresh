// Sky-to-surface table (unit 07). Sky pieces are elements, the surface is material.
import type { SkyRulesFactory, SurfaceModifiers, SkyState } from '@/contracts/sky';
import type { PlanetSpec } from '@/contracts/system';
import type { SkyRule, ModifierKey } from '@/contracts/atlas';
import { NEUTRAL_MODIFIERS } from '@/contracts/sky';

type Born = 'moon' | 'rings' | 'belt' | 'disc' | 'close' | 'far' | 'comet' | 'rogue' | 'variable' | 'flare' | 'dying' | 'remnant' | 'locked';
/** A SkyRule, optionally needing `min` of its piece, or something the world was `born` with. */
type Rule = SkyRule & { readonly min?: number; readonly born?: Born };

export const RULES: Rule[] = [
  { id: 'moon', when: ['moon'], effects: { tide: 45, seasons: -10, nightLight: 20 }, says: 'A moon pulls the seas into tides.' },
  { id: 'comet', when: ['comet'], effects: { impacts: 35, tide: 5 }, says: 'A comet passes, and stones and water fall.' },
  { id: 'belt', when: ['belt'], effects: { impacts: 20, nightLight: 10 }, says: 'The belt sheds iron on the fields.' },
  { id: 'sun', when: ['sun'], effects: { warmth: 50, seasons: 25 }, says: 'A second sun bakes the land.' },
  { id: 'rings', when: ['rings'], effects: { nightLight: 35, warmth: -10, seasons: 10 }, says: 'The rings light their nights.' },
  { id: 'dust', when: ['dust'], effects: { dimming: 45, warmth: -20, dust: 40 }, says: 'Dust veils the sky.' },
  { id: 'moon-comet', when: ['moon', 'comet'], effects: { impacts: 15, tide: 15 }, says: 'The moon draws the comet low.' },
  { id: 'moon-moon', when: ['moon', 'moon'], effects: { tide: 30 }, says: 'Two moons make the seas restless.' },
  { id: 'comet-rings', when: ['comet', 'rings'], effects: { impacts: 25 }, says: 'The comet breaks the rings into showers.' },
  { id: 'sun-dust', when: ['sun', 'dust'], effects: { warmth: -20, dimming: -15, nightLight: 20 }, says: 'Two suns through dust make ember twilight.' },
  { id: 'sun-moon', when: ['sun', 'moon'], effects: { seasons: -15 }, says: 'The moon steadies the twin-sun years.' },
  { id: 'belt-comet', when: ['belt', 'comet'], effects: { impacts: 30 }, says: 'The comet scatters the belt across the sky.' },
  { id: 'rings-dust', when: ['rings', 'dust'], effects: { dimming: 20, nightLight: -20 }, says: 'Dust dulls the rings to grey.' },
  { id: 'sun-sun', when: ['sun', 'sun'], effects: { warmth: 40 }, says: 'Three suns. Nothing is ever cold.' },
  // ---- counts and combinations (a natural moon, ring, belt or twin sun counts too) ----
  { id: 'moon-three', when: ['moon'], min: 3, effects: { tide: 20, nightLight: 15, seasons: -10 }, says: 'Three moons. The tides never settle.' },
  { id: 'moon-five', when: ['moon'], min: 5, effects: { tide: 25, nightLight: 25, impacts: 15 }, says: 'Five moons crowd the night and grind against each other.' },
  { id: 'rings-belt', when: ['rings', 'belt'], effects: { impacts: 15, nightLight: 15, dust: 10 }, says: 'The belt feeds the rings, and the rings spill.' },
  { id: 'rings-moon', when: ['rings', 'moon'], effects: { tide: -10, nightLight: 15 }, says: 'A shepherd moon keeps the rings sharp and bright.' },
  { id: 'belt-dust', when: ['belt', 'dust'], effects: { dust: 20, dimming: 15, impacts: -10 }, says: 'The belt grinds itself down to haze.' },
  { id: 'comet-comet', when: ['comet', 'comet'], effects: { impacts: 25, seasons: 10 }, says: 'Two comets cross. The sky is never empty.' },
  { id: 'comet-dust', when: ['comet', 'dust'], effects: { dust: 15, nightLight: 10 }, says: 'The comet lights the dust from inside.' },
  { id: 'sun-rings', when: ['sun', 'rings'], effects: { warmth: 10, nightLight: 20, seasons: 10 }, says: 'The rings burn gold under two suns.' },
  { id: 'moon-dust', when: ['moon', 'dust'], effects: { nightLight: -15, tide: 5 }, says: 'The moon rises red through the dust.' },
  { id: 'belt-belt', when: ['belt', 'belt'], effects: { impacts: 25, nightLight: 10 }, says: 'Two belts. Iron falls in every season.' },
  { id: 'dust-dust', when: ['dust', 'dust'], effects: { dimming: 30, warmth: -20, dust: 20 }, says: 'The dust is thick. Noon looks like dusk.' },
  { id: 'sun-belt', when: ['sun', 'belt'], effects: { impacts: 10, warmth: 5 }, says: 'The second sun stirs the belt.' },
  // ---- what a world was born with (see PlanetSpec.sky) ----
  { id: 'born-moon', when: ['moon'], born: 'moon', effects: { tide: 25, nightLight: 10 }, says: 'They were born under a moon. Their seas know it.' },
  { id: 'born-rings', when: ['rings'], born: 'rings', effects: { nightLight: 20, seasons: 5 }, says: 'Their world has always worn a ring.' },
  { id: 'born-belt', when: ['belt'], born: 'belt', effects: { impacts: 15, nightLight: 5 }, says: 'An old belt of stones runs beside their road.' },
  { id: 'born-disc', when: ['dust'], born: 'disc', effects: { dust: 15, dimming: 10, impacts: 5 }, says: 'The old disc of dust dims their star.' },
  { id: 'born-twin', when: ['sun'], born: 'close', effects: { warmth: 25, seasons: 15 }, says: 'Their sun has a twin that never leaves it.' },
  { id: 'born-far-sun', when: ['sun'], born: 'far', effects: { nightLight: 25, warmth: 5 }, says: 'A far second sun turns their nights to dusk.' },
  { id: 'born-comet', when: ['comet'], born: 'comet', effects: { impacts: 10, seasons: 5 }, says: 'A comet older than they are keeps coming back.' },
  { id: 'born-rogue', when: ['moon'], born: 'rogue', effects: { tide: 10, seasons: 15 }, says: 'A stolen world tugs their years out of true.' },
  { id: 'star-variable', when: ['sun'], born: 'variable', effects: { seasons: 25, warmth: 5 }, says: 'Their star swells and fades, and so do their years.' },
  { id: 'star-flare', when: ['sun'], born: 'flare', effects: { warmth: 10, nightLight: 10, impacts: 5 }, says: 'Their star spits fire without warning.' },
  { id: 'star-dying', when: ['sun'], born: 'dying', effects: { warmth: 30, dimming: 10, seasons: 10 }, says: 'Their star is dying, and burns the hotter for it.' },
  { id: 'star-remnant', when: ['sun'], born: 'remnant', effects: { warmth: -35, dimming: 25 }, says: 'Their star is a cinder. It gives little.' },
  { id: 'locked', when: ['sun'], born: 'locked', effects: { seasons: -30, warmth: 10 }, says: 'One face is always to the star. There are no seasons.' },
];

/** Sea level (0..255) at or under which a world reads as dry: the same line the system screen draws. */
const DRY_SEA = 45;
// The same rules, said truthfully on a world with almost no water, or one that never turns.
// Only the sentence changes; the effects are the numbers above.
const DRY_SAYS: Record<string, string> = {
  moon: 'A moon pulls at what little water they have.',
  'moon-moon': 'Two moons tug at the dry ground. There is little sea to answer.',
  'moon-three': 'Three moons. What water there is never settles.',
  'born-moon': 'They were born under a moon. Their dry ground still feels it.',
  comet: 'A comet passes, and stones and ice fall.',
};
const LOCKED_SAYS: Record<string, string> = {
  rings: 'The rings light their dark side.',
  'moon-five': 'Five moons crowd the sky and grind against each other.',
  'born-far-sun': 'A far second sun turns their dark side to dusk.',
  'moon-dust': 'The moon hangs red in the dust.',
  'dust-dust': 'The dust is thick. Their endless noon looks like dusk.',
};
/** What a matched rule says over this world. */
const saysFor = (r: Rule, p: PlanetSpec): string =>
  (p.terrain.locked ? LOCKED_SAYS[r.id] : undefined) ?? (p.terrain.seaLevel <= DRY_SEA ? DRY_SAYS[r.id] : undefined) ?? r.says;

/** Does the planet have this by birth? */
const bornWith = (p: PlanetSpec, what: Born): boolean => {
  const n = p.sky;
  if (what === 'locked') return !!p.terrain.locked;
  if (!n) return false;
  if (what === 'moon') return (n.moons?.length ?? 0) > 0;
  if (what === 'close' || what === 'far') return n.companion === what;
  if (what === 'variable' || what === 'flare' || what === 'dying' || what === 'remnant') return n.star === what;
  return !!n[what];
};

/** Hung pieces, plus the natural things that behave like them when counting and combining. */
const everything = (sky: SkyState, p: PlanetSpec): string[] => {
  const out: string[] = [...sky.pieces];
  const n = p.sky;
  if (!n) return out;
  for (let i = 0; i < (n.moons?.length ?? 0); i++) out.push('moon');
  if (n.rings) out.push('rings');
  if (n.belt) out.push('belt');
  if (n.companion) out.push('sun');
  return out;
};

const matches = (r: Rule, sky: SkyState, all: readonly string[], p: PlanetSpec): boolean => {
  if (r.born) return bornWith(p, r.born);
  // A single piece's own rule speaks only for a piece the player hung.
  if (r.when.length === 1 && !r.min) return sky.pieces.includes(r.when[0]!);
  if (r.min) return all.filter((k) => k === r.when[0]).length >= r.min;
  if (r.when[0] === r.when[1]) return all.filter((k) => k === r.when[0]).length >= 2;
  return r.when.every((k) => all.includes(k));
};

export const factory: SkyRulesFactory = () => {
  const matching = (sky: SkyState, planet: PlanetSpec) => {
    const all = everything(sky, planet);
    return RULES.filter((r) => matches(r, sky, all, planet));
  };
  return {
    rules: RULES,
    effects: (sky, planet) => {
      const m: Record<ModifierKey, number> = { ...NEUTRAL_MODIFIERS };
      for (const r of matching(sky, planet)) for (const [k, v] of Object.entries(r.effects) as [ModifierKey, number][]) m[k] += v;
      // A nudged orbit: closer is hotter with harsher seasons, further is colder and dimmer.
      const d = sky.drift ?? 0;
      m.warmth -= d * 20;
      m.seasons += Math.abs(d) * 6;
      if (d > 0) m.dimming += d * 8;
      for (const k of Object.keys(m) as ModifierKey[]) m[k] = Math.max(-100, Math.min(100, m[k]));
      return m as SurfaceModifiers;
    },
    explain: (sky, planet) => {
      // What it was born with comes first, so the last line is always about the newest thing hung.
      const hit = matching(sky, planet);
      const old = new Set(sky.pieces.length ? matching({ ...sky, pieces: [] }, planet) : hit);
      const says = [...hit.filter((r) => old.has(r)), ...hit.filter((r) => !old.has(r))].map((r) => saysFor(r, planet));
      const d = sky.drift ?? 0;
      if (d < 0) says.push(d <= -2 ? 'Their world was pulled close to the star. It burns.' : 'Their world was drawn nearer the star.');
      if (d > 0) says.push(d >= 2 ? 'Their world was pushed out into the cold.' : 'Their world was pushed further from the star.');
      return says;
    },
  };
};
