// Light (unit 17): one pip per 5 folds fallen (so ~40 folds from full); glow refills.
// Past full, half of what arrives is banked (up to LIGHT_BANK_MAX points). Once Light has been spent or
// drained, the bank pays back out: every point of new glow brings one banked point with it.
import type { LightFactory, LightTotals } from '@/contracts/game';
import { LIGHT_MAX_PIPS, LIGHT_BANK_MAX } from '@/contracts/game';

export const FOLDS_PER_PIP = 5;
export const GLOW_PER_PIP = 1000;
/** The save schema keeps only pips and partial, so the bank and totals also live here. */
export const LIGHT_EXTRA_KEY = 'sallow-light-extra';

interface Extra { bank: number; earned: number; spent: number; drained: number }
const num = (v: unknown, max = Number.MAX_SAFE_INTEGER) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0);
const readExtra = (): Partial<Extra> => {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(LIGHT_EXTRA_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? (v as Partial<Extra>) : {};
  } catch { return {}; }
};
const writeExtra = (e: Extra) => {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(LIGHT_EXTRA_KEY, JSON.stringify(e)); } catch { /* storage blocked */ }
};

export const factory: LightFactory = () => {
  let pips = LIGHT_MAX_PIPS;
  let partial = 0; // 0..999 progress toward the next pip
  let used = 0; // folds drained toward the next pip loss
  let bank = 0; // 0..LIGHT_BANK_MAX glow points kept past full
  let earned = 0, spent = 0, drained = 0;
  let saved = '';

  /** Pour points in. Whole pips that arrive while full are the overflow; half of that is banked. */
  const pour = (points: number) => {
    partial += points;
    let over = 0;
    while (partial >= GLOW_PER_PIP) {
      partial -= GLOW_PER_PIP;
      if (pips < LIGHT_MAX_PIPS) pips++;
      else over += GLOW_PER_PIP;
    }
    if (pips === LIGHT_MAX_PIPS) partial = Math.min(partial, GLOW_PER_PIP - 1);
    if (over > 0) bank = Math.min(LIGHT_BANK_MAX, bank + (over >> 1));
  };
  const release = (points: number) => {
    const n = pips < LIGHT_MAX_PIPS ? Math.min(bank, Math.max(0, Math.floor(points))) : 0;
    if (n > 0) { bank -= n; pour(n); }
    return n;
  };
  const totals = (): LightTotals => ({ earned, spent, drained, banked: bank });
  return {
    view: () => ({ pips, partial, low: pips <= 2, bank }),
    drainFolds: (n) => {
      used += n;
      while (used >= FOLDS_PER_PIP && pips > 0) {
        used -= FOLDS_PER_PIP;
        pips--;
        drained += GLOW_PER_PIP;
      }
      return pips > 0;
    },
    addGlow: (points) => {
      if (points > 0) earned += points;
      // The bank pays out beside new glow, point for point, while there is room.
      const back = pips < LIGHT_MAX_PIPS ? Math.min(bank, Math.max(0, points)) : 0;
      bank -= back;
      pour(points + back);
    },
    canSpend: (n) => pips >= n,
    spend: (n) => (pips >= n ? ((pips -= n), (spent += n * GLOW_PER_PIP), true) : false),
    snapshot: () => {
      const extra = { bank, earned, spent, drained };
      const sig = JSON.stringify(extra);
      if (sig !== saved) { saved = sig; writeExtra(extra); }
      return { pips, partial, ...extra };
    },
    restore: (s) => {
      // Older saves, and saves read back through the schema, carry pips and partial only.
      const x = s.bank === undefined && s.earned === undefined ? readExtra() : s;
      pips = Math.min(LIGHT_MAX_PIPS, num(s.pips));
      partial = num(s.partial, GLOW_PER_PIP - 1);
      bank = num(x.bank, LIGHT_BANK_MAX);
      earned = num(x.earned);
      spent = num(x.spent);
      drained = num(x.drained);
    },
    bank: () => bank,
    totals,
    bankGlow: (points) => {
      const n = Math.min(LIGHT_BANK_MAX - bank, Math.max(0, Math.floor(points)));
      bank += n;
      return n;
    },
    releaseBank: (points = LIGHT_BANK_MAX) => release(points),
  };
};
