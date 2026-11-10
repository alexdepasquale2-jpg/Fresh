// The Box (unit 18): 25 slots, a serial at most once. Beside the stats the save has always kept, each
// universe gathers optional lifetime stats (battles, pieces hung, floors reached, ticks tended), a
// lineage if it was made by merging, and a bond score that comes from all of it.
// Capacity stays at BOX_SLOTS: the contract and the save schema both fix it at 25.
import type { BoxFactory, BoxEntry, Lineage, UniverseStats } from '@/contracts/game';
import { BOX_SLOTS } from '@/contracts/game';

/**
 * The save schema keeps only the older stats, so the newer ones are also kept here, by serial,
 * and laid back over the slots on restore. An older save simply has none.
 */
export const BOX_EXTRA_KEY = 'sallow-box-extra';
const EXTRA = ['battles', 'battlesWon', 'piecesHung', 'floorsReached', 'ticksTended', 'lineage'] as const;
type Extra = Pick<UniverseStats, (typeof EXTRA)[number]>;

const readExtra = (): Record<string, Extra> => {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(BOX_EXTRA_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? (v as Record<string, Extra>) : {};
  } catch { return {}; }
};
const writeExtra = (sig: string) => {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(BOX_EXTRA_KEY, sig); } catch { /* storage blocked */ }
};
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const okLineage = (l: unknown): l is Lineage => !!l && typeof l === 'object' && Array.isArray((l as Lineage).parents) && typeof (l as Lineage).generation === 'number';

/** 0..100 from real use. Each part has a ceiling, so no single habit makes a bond on its own. */
export const bondOf = (s: UniverseStats): number => {
  const part = (v: number, max: number) => Math.min(max, Math.max(0, Math.floor(v)));
  return Math.min(100,
    part(s.worldsTended * 3, 25)
    + part(s.deepestFold / 4, 15)
    + part(Math.sqrt(Math.max(0, s.lightFromGlow)) / 8, 15)
    + part((s.ticksTended ?? 0) / 2400, 15)
    + part((s.battles ?? 0) * 2 + (s.battlesWon ?? 0), 10)
    + part((s.piecesHung ?? 0) * 2, 10)
    + part((s.floorsReached ?? 0) * 5, 5)
    + part((s.enlightenment ?? 0) / 20, 5));
};
export const bondName = (bond: number): string => (bond < 10 ? 'stranger' : bond < 30 ? 'known' : bond < 55 ? 'kept' : bond < 80 ? 'dear' : 'kin');

export const factory: BoxFactory = () => {
  let slots: (BoxEntry | null)[] = Array(BOX_SLOTS).fill(null);
  let sel = 0;
  let saved = '';
  const bump = (i: number, f: (e: BoxEntry) => BoxEntry) => {
    const e = slots[i];
    if (e) slots[i] = f(e);
  };
  const stat = (i: number, f: (s: UniverseStats) => Partial<UniverseStats>) => bump(i, (e) => ({ ...e, stats: { ...e.stats, ...f(e.stats) } }));
  /** Write the newer stats beside the save, when they have changed. */
  const keepExtra = () => {
    const out: Record<string, Extra> = {};
    for (const e of slots) {
      if (!e) continue;
      const x: Record<string, unknown> = {};
      for (const k of EXTRA) if (e.stats[k] !== undefined) x[k] = e.stats[k];
      if (Object.keys(x).length) out[String(e.serialNumber)] = x as Extra;
    }
    const sig = JSON.stringify(out);
    if (sig !== saved) { saved = sig; writeExtra(sig); }
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
    remove: (i) => { slots[i] = null; },
    setStats: (i, stats) => bump(i, (e) => ({ ...e, stats: { ...stats } })),
    recordLife: (i, life) => bump(i, (e) => ({ ...e, stats: { ...e.stats, souls: life.souls, era: Math.max(e.stats.era ?? 0, life.era), belief: life.belief, enlightenment: Math.max(e.stats.enlightenment ?? 0, life.enlightenment), prosperity: life.prosperity ?? e.stats.prosperity ?? 0, orbiters: Math.max(e.stats.orbiters ?? 0, life.orbiters ?? 0) } })),
    recordGlow: (i, l) => bump(i, (e) => ({ ...e, stats: { ...e.stats, lightFromGlow: e.stats.lightFromGlow + l } })),
    snapshot: () => {
      keepExtra();
      return slots.map((s) => (s ? { ...s, stats: { ...s.stats } } : null));
    },
    restore: (s) => {
      const extra = readExtra();
      slots = s.map((x) => {
        if (!x) return null;
        // What the snapshot itself carries wins; the side store only fills what is missing.
        const side = extra[String(x.serialNumber)];
        const stats: UniverseStats = { ...x.stats };
        const filled: { -readonly [K in keyof UniverseStats]?: UniverseStats[K] } = {};
        if (side && typeof side === 'object') {
          for (const k of EXTRA) {
            if (stats[k] !== undefined) continue;
            if (k === 'lineage') { if (okLineage(side.lineage)) filled.lineage = side.lineage; }
            else if (count(side[k]) > 0) filled[k] = count(side[k]);
          }
        }
        return { ...x, stats: { ...stats, ...filled } };
      });
    },

    recordBattle: (i, won) => stat(i, (s) => ({ battles: (s.battles ?? 0) + 1, battlesWon: (s.battlesWon ?? 0) + (won ? 1 : 0) })),
    recordPieceHung: (i, n = 1) => stat(i, (s) => ({ piecesHung: Math.max(0, (s.piecesHung ?? 0) + n) })),
    recordFloor: (i) => stat(i, (s) => ({ floorsReached: (s.floorsReached ?? 0) + 1 })),
    recordTicks: (i, ticks) => { if (ticks > 0) stat(i, (s) => ({ ticksTended: (s.ticksTended ?? 0) + Math.floor(ticks) })); },
    setLineage: (i, lineage) => {
      bump(i, (e) => {
        const { lineage: _old, ...rest } = e.stats;
        return { ...e, stats: lineage ? { ...rest, lineage } : rest };
      });
      keepExtra();
    },
    lineage: (i) => slots[i]?.stats.lineage ?? null,
    bond: (i) => { const e = slots[i]; return e ? bondOf(e.stats) : 0; },
    bondOf,
    bondName,
    slotOf: (serialNumber) => slots.findIndex((s) => s?.serialNumber === serialNumber),
  };
};
