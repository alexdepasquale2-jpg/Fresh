// STUB: replace with the real sky-to-surface table (unit 07). See README.md.
import type { SkyRulesFactory, SurfaceModifiers } from '@/contracts/sky';
import type { SkyRule, ModifierKey } from '@/contracts/atlas';
import { NEUTRAL_MODIFIERS } from '@/contracts/sky';

const RULES: SkyRule[] = [{ id: 'moon-tides', when: ['moon'], effects: { tide: 40 }, says: 'A moon pulls the seas into tides.' }];

export const factory: SkyRulesFactory = () => {
  const matching = (pieces: readonly string[]) => RULES.filter((r) => r.when.every((k) => pieces.includes(k)));
  return {
    rules: RULES,
    effects: (sky) => {
      const m: Record<ModifierKey, number> = { ...NEUTRAL_MODIFIERS };
      for (const r of matching(sky.pieces)) {
        for (const [k, v] of Object.entries(r.effects) as [ModifierKey, number][]) m[k] = Math.max(-100, Math.min(100, m[k] + v));
      }
      return m as SurfaceModifiers;
    },
    explain: (sky) => matching(sky.pieces).map((r) => r.says),
  };
};
