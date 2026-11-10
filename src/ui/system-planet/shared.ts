// Shared by the Solar system and Planet screens: selection, names, and a small memory of what was last seen.
import type { AppContext } from '@/contracts/app';
import type { StarRef } from '@/contracts/fold';
import type { PlanetSpec } from '@/contracts/system';
import { child, seedToHex } from '@/core/hash';

export const ensureSystem = (c: AppContext) => {
  const u = c.selection.universe ?? c.universes.fromSerial(c.box.slots()[c.box.selected()]?.serialNumber ?? 0);
  c.selection.universe = u;
  if (!c.selection.star) {
    const star: StarRef = { address: c.fold.root(u), seed: child(u.seed, 'home-star'), kind: 'main', heat: 128 };
    c.selection.star = star;
  }
  if (!c.selection.system) c.selection.system = c.systems.fromStar(c.selection.star, u);
  return { u, sys: c.selection.system };
};

export const keyOf = (p: PlanetSpec) => seedToHex(p.seed);
/** The key a system's LOG is kept under. */
export const sysKeyOf = (sys: { readonly seed: PlanetSpec['seed'] }) => seedToHex(sys.seed);
export const villageName = (c: AppContext, p: PlanetSpec, id: number) => c.names.village(child(p.seed, id + 1));

/** What this device last saw of a world, and what was done to a system. Cosmetic only: never part of what a universe is. */
export interface Seen { souls: number; year: number; v: Record<string, number> }
interface Mem { seen: Record<string, Seen>; log: Record<string, string[]> }
const KEY = 'sallow.screens.v1';
let mem: Mem | null = null;
const load = (): Mem => {
  if (mem) return mem;
  mem = { seen: {}, log: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Mem> | null;
    if (raw && typeof raw === 'object') mem = { seen: raw.seen && typeof raw.seen === 'object' ? raw.seen : {}, log: raw.log && typeof raw.log === 'object' ? raw.log : {} };
  } catch { /* private mode or bad json: start empty */ }
  return mem;
};
const store = () => {
  try {
    const m = load();
    // Keep it small: the newest 40 worlds and 20 systems.
    const trim = <T>(r: Record<string, T>, n: number) => { const ks = Object.keys(r); for (const k of ks.slice(0, Math.max(0, ks.length - n))) delete r[k]; };
    trim(m.seen, 40); trim(m.log, 20);
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch { /* nothing to do */ }
};
export const seenOf = (key: string): Seen | null => {
  const s = load().seen[key];
  return s && typeof s.souls === 'number' && s.v && typeof s.v === 'object' ? s : null;
};
export const setSeen = (key: string, s: Seen) => { const m = load(); delete m.seen[key]; m.seen[key] = s; store(); };
export const logOf = (sysKey: string): readonly string[] => { const l = load().log[sysKey]; return Array.isArray(l) ? l : []; };
export const addLog = (sysKey: string, line: string) => {
  const m = load();
  const l = Array.isArray(m.log[sysKey]) ? m.log[sysKey]! : [];
  delete m.log[sysKey];
  m.log[sysKey] = [line, ...l].slice(0, 30);
  store();
};
