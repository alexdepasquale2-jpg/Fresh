// What the room and the Box remember beside the save: names, pins, when each universe was last tended.
import type { AppContext } from '@/contracts/app';
import type { BoxEntry, UniverseStats } from '@/contracts/game';
import type { UniverseSpec } from '@/contracts/universe';
import type { StarRef } from '@/contracts/fold';

export const NAMES_KEY = 'sallow-box-names';
const META_KEY = 'sallow-box-meta';
const ROOM_KEY = 'sallow-room';

const read = <T>(key: string, init: T): T => {
  try {
    const raw = localStorage.getItem(key);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? { ...init, ...(v as T) } : init;
  } catch { return init; }
};
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } };

export interface Meta {
  /** Pinned serial numbers. */
  fav: number[];
  /** Serial -> wall ms it was last tended (its stats last changed, or it was entered). */
  last: Record<string, number>;
  /** Serial -> its stats as last seen, to notice a change. */
  snap: Record<string, string>;
  /** Serials the player has seen in the open Box. */
  seen: number[];
  fresh?: boolean;
}

export const names = {
  all: (): Record<string, string> => read<Record<string, string>>(NAMES_KEY, {}),
  of: (spec: UniverseSpec): string => {
    const n = names.all()[String(spec.serialNumber)];
    return typeof n === 'string' && n.trim() ? n : spec.name;
  },
  set: (serialNumber: number, name: string) => {
    const all = names.all();
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, 24);
    if (clean) all[String(serialNumber)] = clean; else delete all[String(serialNumber)];
    write(NAMES_KEY, all);
  },
};

/**
 * The star last visited in each universe, so Worlds opens the system the player was tending and not the home one.
 * The dive HUD writes the same key when a fall stops at a star.
 */
const LAST_STAR_KEY = 'sallow.last-star.v1';
const isSeed = (v: unknown): v is { hi: number; lo: number } => !!v && typeof v === 'object' && Number.isInteger((v as { hi: unknown }).hi) && Number.isInteger((v as { lo: unknown }).lo);
export const lastStar = {
  of: (spec: UniverseSpec): StarRef | null => {
    const s = read<Record<string, StarRef | undefined>>(LAST_STAR_KEY, {})[String(spec.serialNumber)];
    if (!s || typeof s !== 'object' || !isSeed(s.seed) || !s.address || !isSeed(s.address.universe) || !isSeed(s.address.pathHash)) return null;
    if (!Number.isInteger(s.address.depth) || s.address.depth < 0 || typeof s.heat !== 'number' || !['dwarf', 'main', 'giant', 'pulsar'].includes(s.kind)) return null;
    // A star of some other universe (a merged-away serial reused, a hand-edited store) is not this one's.
    if (s.address.universe.hi !== spec.seed.hi || s.address.universe.lo !== spec.seed.lo) return null;
    return s;
  },
  set: (spec: UniverseSpec, star: StarRef) => {
    if (star.address.universe.hi !== spec.seed.hi || star.address.universe.lo !== spec.seed.lo) return;
    const all = read<Record<string, StarRef>>(LAST_STAR_KEY, {});
    all[String(spec.serialNumber)] = star;
    write(LAST_STAR_KEY, all);
  },
};
/** Note where the player has just been, on arriving in the room or at the Box. */
export const noteStar = (ctx: AppContext) => {
  const u = ctx.selection.universe, s = ctx.selection.star;
  if (u && s) lastStar.set(u, s);
};

export const loadMeta = (): Meta => {
  let fresh = true;
  try { fresh = localStorage.getItem(META_KEY) === null; } catch { /* storage blocked */ }
  const m = read<Meta>(META_KEY, { fav: [], last: {}, snap: {}, seen: [] });
  return { fav: Array.isArray(m.fav) ? m.fav : [], last: m.last ?? {}, snap: m.snap ?? {}, seen: Array.isArray(m.seen) ? m.seen : [], fresh };
};
export const saveMeta = (m: Meta) => write(META_KEY, { fav: m.fav, last: m.last, snap: m.snap, seen: m.seen });

/** Bring the meta up to date with the Box. Returns the meta and the serials not yet seen in the open Box. */
export const sync = (ctx: AppContext, sawBox = false): { meta: Meta; fresh: number[] } => {
  const m = loadMeta();
  const now = Date.now();
  const held: number[] = [];
  for (const e of ctx.box.slots()) {
    if (!e) continue;
    const k = String(e.serialNumber);
    held.push(e.serialNumber);
    const sig = JSON.stringify(e.stats);
    if (m.snap[k] === undefined) m.last[k] = m.last[k] ?? now;
    else if (m.snap[k] !== sig) m.last[k] = now;
    m.snap[k] = sig;
  }
  // The first time, everything already in the box is known.
  if (m.fresh || sawBox) m.seen = held;
  const fresh = held.filter((s) => !m.seen.includes(s));
  m.fav = m.fav.filter((s) => held.includes(s));
  saveMeta(m);
  return { meta: m, fresh };
};
export const touch = (serialNumber: number) => {
  const m = loadMeta();
  m.last[String(serialNumber)] = Date.now();
  saveMeta(m);
};

/* ---------- The room clock: the real hour, pushed on a little by sleep. ---------- */
interface RoomState { sleptAt: number; hours: number; nights: number }
const SLEEP_FADE_MS = 3 * 3600 * 1000;
export const roomState = (): RoomState => read<RoomState>(ROOM_KEY, { sleptAt: 0, hours: 0, nights: 0 });
export const sleepNow = (hours: number) => {
  const r = roomState();
  write(ROOM_KEY, { sleptAt: Date.now(), hours, nights: (r.nights | 0) + 1 });
};
/** Hour of day 0..24. Sleep pushes it on; the push fades as the real clock catches up. */
export const roomHour = (): number => {
  const d = new Date();
  const r = roomState();
  const left = Math.max(0, 1 - (Date.now() - r.sleptAt) / SLEEP_FADE_MS);
  return (d.getHours() + d.getMinutes() / 60 + (r.hours || 0) * left) % 24;
};
const mixInt = (a: number) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 13)) >>> 0; };
/** 0 clear, 1 cloud, 2 rain. Holds for three hours at a time. */
export const weatherAt = (hour: number): number => {
  const day = Math.floor(Date.now() / 86400000);
  const r = mixInt(day * 8 + Math.floor(hour / 3)) % 10;
  return r < 5 ? 0 : r < 8 ? 1 : 2;
};
export const pick = <T>(list: readonly T[], n: number): T => list[mixInt(n) % list.length]!;

/* ---------- Totals across the box (the shelf). ---------- */
export interface Totals { depth: number; tended: number; battles: number; held: number; light: number }
export const totals = (ctx: AppContext): Totals => {
  let depth = 0, tended = 0, light = 0;
  for (const e of ctx.box.slots()) if (e) { depth = Math.max(depth, e.stats.deepestFold); tended += e.stats.worldsTended; light += e.stats.lightFromGlow; }
  return { depth, tended, battles: ctx.rivalsBeaten.size, held: ctx.box.count(), light };
};
const level = (v: number, a: number, b: number, c: number) => (v >= c ? 3 : v >= b ? 2 : v >= a ? 1 : 0);
export const TROPHIES = [
  { key: 'depth', label: 'fold', level: (t: Totals) => level(t.depth, 3, 12, 30) },
  { key: 'tended', label: 'tended', level: (t: Totals) => level(t.tended, 1, 5, 15) },
  { key: 'battles', label: 'won', level: (t: Totals) => level(t.battles, 1, 3, 6) },
  { key: 'held', label: 'held', level: (t: Totals) => level(t.held, 8, 14, 22) },
  { key: 'light', label: 'pips', level: (t: Totals) => level(Math.floor(t.light / 1000), 1, 8, 30) },
] as const;

/** The universe tended most, or null when none has been tended. */
export const mostTended = (ctx: AppContext): BoxEntry | null => {
  let best: BoxEntry | null = null;
  for (const e of ctx.box.slots()) {
    if (!e || e.stats.worldsTended <= 0) continue;
    if (!best || e.stats.worldsTended > best.stats.worldsTended || (e.stats.worldsTended === best.stats.worldsTended && e.stats.lightFromGlow > best.stats.lightFromGlow)) best = e;
  }
  return best;
};
export const ago = (ms: number | undefined): string => {
  if (!ms) return 'never';
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 48) return `${Math.floor(m / 60)} h ago`;
  return `${Math.floor(m / 1440)} days ago`;
};
export const EMPTY_STATS: UniverseStats = { worldsTended: 0, deepestFold: 0, lightFromGlow: 0 };

/* ---------- The collection: recipes found, set rewards paid, what has ever been held. ---------- */
export const COLLECT_KEY = 'sallow-box-recipes';
export interface Collection {
  /** Recipe ids found by merging. */
  found: string[];
  /** Set ids whose reward has been paid. */
  paid: string[];
  /** Law set ids ever held. */
  laws: string[];
  /** Rarity -> how many different universes of it have ever been held. */
  seen: Record<string, number>;
  /** Serials already counted in `seen` (the newest 400). */
  serials: number[];
  /** Universes made by merging. */
  made: number;
}
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
export const loadCollection = (): Collection => {
  const r = read<Partial<Collection>>(COLLECT_KEY, {});
  const seen: Record<string, number> = {};
  if (r.seen && typeof r.seen === 'object') for (const [k, v] of Object.entries(r.seen)) if (typeof v === 'number' && v > 0) seen[k] = Math.floor(v);
  return { found: strs(r.found), paid: strs(r.paid), laws: strs(r.laws), seen, serials: Array.isArray(r.serials) ? r.serials.filter((x): x is number => typeof x === 'number') : [], made: typeof r.made === 'number' && r.made > 0 ? Math.floor(r.made) : 0 };
};
export const saveCollection = (col: Collection) => write(COLLECT_KEY, { ...col, serials: col.serials.slice(-400) });
