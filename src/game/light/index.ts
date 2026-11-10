// STUB: replace with the real Light economy (unit 17). See README.md.
import type { LightFactory } from '@/contracts/game';
import { LIGHT_MAX_PIPS } from '@/contracts/game';

export const factory: LightFactory = () => {
  let pips = LIGHT_MAX_PIPS;
  let partial = 0;
  return {
    view: () => ({ pips, partial, low: pips <= 2 }),
    drainFolds: () => pips > 0,
    addGlow: () => {},
    canSpend: (n) => pips >= n,
    spend: (n) => (pips >= n ? ((pips -= n), true) : false),
    snapshot: () => ({ pips, partial }),
    restore: (s) => void ({ pips, partial } = s),
  };
};
