// Light (unit 17): one pip per 5 folds fallen (so ~40 folds from full); glow refills.
import type { LightFactory } from '@/contracts/game';
import { LIGHT_MAX_PIPS } from '@/contracts/game';

export const FOLDS_PER_PIP = 5;
export const GLOW_PER_PIP = 1000;

export const factory: LightFactory = () => {
  let pips = LIGHT_MAX_PIPS;
  let partial = 0; // 0..999 progress toward the next pip
  let used = 0; // folds drained toward the next pip loss
  return {
    view: () => ({ pips, partial, low: pips <= 2 }),
    drainFolds: (n) => {
      used += n;
      while (used >= FOLDS_PER_PIP && pips > 0) {
        used -= FOLDS_PER_PIP;
        pips--;
      }
      return pips > 0;
    },
    addGlow: (points) => {
      partial += points;
      while (partial >= GLOW_PER_PIP) {
        partial -= GLOW_PER_PIP;
        if (pips < LIGHT_MAX_PIPS) pips++;
      }
      if (pips === LIGHT_MAX_PIPS) partial = Math.min(partial, GLOW_PER_PIP - 1);
    },
    canSpend: (n) => pips >= n,
    spend: (n) => (pips >= n ? ((pips -= n), true) : false),
    snapshot: () => ({ pips, partial }),
    restore: (s) => void ({ pips, partial } = s),
  };
};
