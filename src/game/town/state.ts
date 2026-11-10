// The town's save: one JSON value under localStorage 'sallow-town', owned by this unit.
import { TILE, type TownState, type Phase, type Weather } from './types';
import { hashString } from '@/core/hash';

export const STORE_KEY = 'sallow-town';
export const SPAWN: readonly [number, number] = [62, 57];
export const CELL = 8;
export const CELLS = 20;

export const fresh = (): TownState => ({
  v: 2, x: SPAWN[0] * TILE + 8, y: SPAWN[1] * TILE + 8, dir: 0, minutes: 7 * 60 + 30, coins: 4, bag: {}, quests: {}, flags: {}, talks: {},
  found: [], seen: '0'.repeat(CELLS * CELLS), places: [], districts: [], bought: {}, run: false, fromTown: false,
  skim: { best: 0, day: -1, throws: 0 }, stats: { steps: 0, talks: 0, rides: 0, sits: 0 }, log: [],
});

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const rec = <V>(v: unknown): Record<string, V> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, V>) : {});
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

/** Accepts any older or damaged shape and returns a whole state. v1 kept tile positions; v2 keeps pixels. */
export const migrate = (raw: unknown): TownState => {
  const f = fresh();
  if (!raw || typeof raw !== 'object') return f;
  const j = raw as Record<string, unknown>;
  const v1 = j.v === 1;
  const sk = rec<number>(j.skim), st = rec<number>(j.stats);
  const seen = typeof j.seen === 'string' && j.seen.length === f.seen.length ? j.seen : f.seen;
  return {
    v: 2,
    x: v1 ? num(j.x, SPAWN[0]) * TILE + 8 : num(j.x, f.x), y: v1 ? num(j.y, SPAWN[1]) * TILE + 8 : num(j.y, f.y), dir: num(j.dir, 0),
    minutes: Math.max(0, num(j.minutes, f.minutes)), coins: Math.max(0, Math.floor(num(j.coins, f.coins))),
    bag: rec<number>(j.bag), quests: rec(j.quests), flags: rec<number>(j.flags), talks: rec<number>(j.talks),
    found: strs(j.found), seen, places: strs(j.places), districts: strs(j.districts), bought: rec<number>(j.bought),
    run: j.run === true, fromTown: j.fromTown === true,
    skim: { best: num(sk.best, 0), day: num(sk.day, -1), throws: num(sk.throws, 0) },
    stats: { steps: num(st.steps, 0), talks: num(st.talks, 0), rides: num(st.rides, 0), sits: num(st.sits, 0) },
    log: strs(j.log).slice(-40),
  };
};

export const load = (): TownState => {
  try { return migrate(JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) ?? 'null')); } catch { return fresh(); }
};
export const store = (s: TownState): void => {
  try { globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* private mode: the walk lasts the session */ }
};

/* ---- Reducers (they change the state in place; the factory saves). ---- */
export const addItem = (s: TownState, id: string, n: number): void => {
  const v = (s.bag[id] ?? 0) + n;
  if (v <= 0) delete s.bag[id]; else s.bag[id] = v;
};
export const has = (s: TownState, id: string, n = 1): boolean => (s.bag[id] ?? 0) >= n;
export const setFlag = (s: TownState, f: string): void => { s.flags[f] = (s.flags[f] ?? 0) + 1; };
export const markSeen = (s: TownState, tx: number, ty: number): boolean => {
  let changed = false;
  const cx = Math.floor(tx / CELL), cy = Math.floor(ty / CELL);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= CELLS || y >= CELLS) continue;
    const i = y * CELLS + x;
    if (s.seen.charCodeAt(i) !== 49) { s.seen = s.seen.slice(0, i) + '1' + s.seen.slice(i + 1); changed = true; }
  }
  return changed;
};
export const isSeen = (s: TownState, tx: number, ty: number): boolean => s.seen.charCodeAt(Math.floor(ty / CELL) * CELLS + Math.floor(tx / CELL)) === 49;

/* ---- Time and weather: pure functions of the minute count. ---- */
export const DAY = 24 * 60;
export const dayOf = (minutes: number): number => Math.floor(minutes / DAY);
export const hourOf = (minutes: number): number => Math.floor((minutes % DAY) / 60);
export const phaseOf = (minutes: number): Phase => {
  const h = (minutes % DAY) / 60;
  return h < 5 ? 'night' : h < 7 ? 'dawn' : h < 18 ? 'day' : h < 20 ? 'dusk' : 'night';
};
/** 0 full day .. 1 deep night, eased through dawn and dusk. */
export const darkOf = (minutes: number): number => {
  const h = (minutes % DAY) / 60;
  if (h >= 7 && h < 18) return 0;
  if (h >= 18 && h < 20.5) return (h - 18) / 2.5;
  if (h >= 4.5 && h < 7) return 1 - (h - 4.5) / 2.5;
  return 1;
};
const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
export const clockText = (minutes: number): string => { const m = Math.floor(minutes % 60); return `${pad(hourOf(minutes))}:${pad(m - (m % 5))}`; };
/** Weather holds for six hours at a time. Seeded by the day and the slot, so it is the same on every device. */
export const weatherOf = (minutes: number): Weather => {
  const slot = Math.floor(minutes / 360);
  if (slot < 2) return 'clear';
  const r = hashString(`sallow-town-weather-${slot}`) % 100;
  return r < 52 ? 'clear' : r < 70 ? 'wind' : r < 86 ? 'rain' : 'fog';
};
