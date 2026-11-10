// STUB: replace with the real Box (unit 18). See README.md.
import type { BoxFactory, BoxEntry } from '@/contracts/game';
import { BOX_SLOTS } from '@/contracts/game';

export const factory: BoxFactory = () => {
  let slots: (BoxEntry | null)[] = Array(BOX_SLOTS).fill(null);
  let sel = 0;
  const bump = (i: number, f: (e: BoxEntry) => BoxEntry) => {
    const e = slots[i];
    if (e) slots[i] = f(e);
  };
  return {
    slots: () => slots,
    count: () => slots.filter(Boolean).length,
    selected: () => sel,
    select: (i) => void (sel = i),
    add: (serialNumber) => {
      if (slots.some((s) => s?.serialNumber === serialNumber)) return -1;
      const i = slots.indexOf(null);
      if (i >= 0) slots[i] = { serialNumber, stats: { worldsTended: 0, deepestFold: 0, lightFromGlow: 0 } };
      return i;
    },
    recordDepth: (i, d) => bump(i, (e) => ({ ...e, stats: { ...e.stats, deepestFold: Math.max(e.stats.deepestFold, d) } })),
    recordTended: (i) => bump(i, (e) => ({ ...e, stats: { ...e.stats, worldsTended: e.stats.worldsTended + 1 } })),
    recordLife: (i, life) => bump(i, (e) => ({ ...e, stats: { ...e.stats, souls: life.souls, era: Math.max(e.stats.era ?? 0, life.era), belief: life.belief, enlightenment: Math.max(e.stats.enlightenment ?? 0, life.enlightenment) } })),
    recordGlow: (i, l) => bump(i, (e) => ({ ...e, stats: { ...e.stats, lightFromGlow: e.stats.lightFromGlow + l } })),
    snapshot: () => slots.map((s) => (s ? { ...s, stats: { ...s.stats } } : null)),
    restore: (s) => void (slots = s.map((x) => (x ? { ...x, stats: { ...x.stats } } : null))),
  };
};
