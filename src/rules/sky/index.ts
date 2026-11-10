// Sky-to-surface table (unit 07). Sky pieces are elements, the surface is material.
import type { SkyRulesFactory, SurfaceModifiers } from '@/contracts/sky';
import type { SkyRule, ModifierKey } from '@/contracts/atlas';
import { NEUTRAL_MODIFIERS } from '@/contracts/sky';

export const RULES: SkyRule[] = [
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
];

const has = (pieces: readonly string[], when: readonly string[]) => {
  if (when.length === 2 && when[0] === when[1]) return pieces.filter((p) => p === when[0]).length >= 2;
  return when.every((k) => pieces.includes(k));
};

export const factory: SkyRulesFactory = () => {
  const matching = (pieces: readonly string[]) => RULES.filter((r) => has(pieces, r.when));
  return {
    rules: RULES,
    effects: (sky) => {
      const m: Record<ModifierKey, number> = { ...NEUTRAL_MODIFIERS };
      for (const r of matching(sky.pieces)) for (const [k, v] of Object.entries(r.effects) as [ModifierKey, number][]) m[k] += v;
      // A nudged orbit: closer is hotter with harsher seasons, further is colder and dimmer.
      const d = sky.drift ?? 0;
      m.warmth -= d * 20;
      m.seasons += Math.abs(d) * 6;
      if (d > 0) m.dimming += d * 8;
      for (const k of Object.keys(m) as ModifierKey[]) m[k] = Math.max(-100, Math.min(100, m[k]));
      return m as SurfaceModifiers;
    },
    explain: (sky) => {
      const says = matching(sky.pieces).map((r) => r.says);
      const d = sky.drift ?? 0;
      if (d < 0) says.push(d <= -2 ? 'Their world was pulled close to the star. It burns.' : 'Their world was drawn nearer the star.');
      if (d > 0) says.push(d >= 2 ? 'Their world was pushed out into the cold.' : 'Their world was pushed further from the star.');
      return says;
    },
  };
};
