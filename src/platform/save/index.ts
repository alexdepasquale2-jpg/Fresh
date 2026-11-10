// Save system (unit 24). IndexedDB first, localStorage when that is shut (private mode), memory as the last
// resort. A write never destroys the save before it: the previous good one is kept beside the new one and
// load() falls back to it. Whole-game export/import (the main save plus every "sallow" localStorage key)
// is staged and applied at the next boot, before anything else has read or rewritten its own keys.
import { getMany, setMany, delMany } from 'idb-keyval';
import type { SaveStoreFactory, SaveState, SaveBundleInfo, SaveBundleResult, SaveStatus } from '@/contracts/platform';
import { SaveStateSchema } from '@/contracts/platform';
import { SkyStateSchema } from '@/contracts/sky';
import { formatSerial, parseSerial } from '@/core/serial';
import { BUNDLE_VERSION, decodeBundle, encodeBundle } from './bundle';
import type { Bundle } from './bundle';

const KEY = 'sallow-save';
const PREV = 'sallow-save.prev';
const NEW = 'sallow-save.new';
const PENDING = 'sallow-save.pending';
const BACKUP = 'sallow-save.backup';
/** localStorage keys under this prefix belong to the save system itself and never ride in an export. */
const INTERNAL = 'sallow-save';
const GAME = 'sallow';
export const CURRENT_VERSION = 1;
const IDB_TIMEOUT_MS = 2500;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : d);

/* ---------- localStorage, never throwing ---------- */
const ls = {
  get: (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string): boolean => { try { localStorage.setItem(k, v); return localStorage.getItem(k) === v; } catch { return false; } },
  del: (k: string): void => { try { localStorage.removeItem(k); } catch { /* blocked */ } },
  keys: (): string[] => {
    const out: string[] = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k !== null) out.push(k); } } catch { /* blocked */ }
    return out;
  },
};
const gameKeys = (): string[] => ls.keys().filter((k) => k.startsWith(GAME) && !k.startsWith(INTERNAL)).sort();
const parse = (raw: string | null): unknown => { if (raw === null) return null; try { return JSON.parse(raw) as unknown; } catch { return null; } };

/* ---------- migrations ---------- */
const KINDS = ['comet', 'moon', 'belt', 'sun', 'rings', 'dust'] as const;
const zeroStats = () => ({ worldsTended: 0, deepestFold: 0, lightFromGlow: 0 });
/** Version 0: saves from before the version field. The box was a list of serials and Light a bare number. */
const v0to1 = (o: Obj): Obj => {
  const box = Array.isArray(o.box) ? o.box.map((e: unknown) => (typeof e === 'number' ? { serialNumber: e, stats: zeroStats() } : e)) : [];
  const light = typeof o.light === 'number' ? { pips: o.light, partial: 0 } : o.light;
  return { ...o, version: 1, box, light, screen: typeof o.screen === 'string' ? o.screen : 'bedroom' };
};
/** Mends what can be mended in a current-version save so one bad field does not cost the whole game. */
const repair = (o: Obj): Obj => {
  const boxIn = Array.isArray(o.box) ? o.box : [];
  const box = Array.from({ length: 25 }, (_, i) => {
    const e: unknown = boxIn[i];
    if (!isObj(e) || typeof e.serialNumber !== 'number') return null;
    const st = isObj(e.stats) ? e.stats : {};
    const stats: Obj = { ...st, worldsTended: int(st.worldsTended), deepestFold: int(st.deepestFold), lightFromGlow: int(st.lightFromGlow) };
    for (const k of ['souls', 'era', 'enlightenment', 'prosperity', 'orbiters']) if (k in stats) { if (typeof stats[k] === 'number') stats[k] = int(stats[k]); else delete stats[k]; }
    if ('belief' in stats && typeof stats.belief !== 'string') delete stats.belief;
    return { serialNumber: int(e.serialNumber), stats };
  });
  const light = isObj(o.light) ? { pips: Math.max(0, int(o.light.pips)), partial: Math.max(0, int(o.light.partial)) } : { pips: 0, partial: 0 };
  const skyIn = isObj(o.sky) ? o.sky : {};
  const invIn = isObj(skyIn.inventory) ? skyIn.inventory : {};
  const inventory = Object.fromEntries(KINDS.map((k) => [k, Math.max(0, int(invIn[k]))]));
  const skies = (Array.isArray(skyIn.skies) ? skyIn.skies : []).filter((s: unknown) => SkyStateSchema.safeParse(s).success);
  const clockIn = isObj(o.clock) ? o.clock : {};
  const speed = clockIn.speed === 0 || clockIn.speed === 3 ? clockIn.speed : 1;
  const out: Obj = {
    ...o,
    version: 1,
    box,
    selected: Math.max(0, Math.min(24, int(o.selected))),
    light,
    sky: { inventory, skies },
    clock: { tick: Math.max(0, int(clockIn.tick)), speed },
    savedAtMs: typeof o.savedAtMs === 'number' && Number.isFinite(o.savedAtMs) ? o.savedAtMs : 0,
  };
  if (Array.isArray(o.rivalsBeaten)) out.rivalsBeaten = o.rivalsBeaten.filter((n: unknown) => Number.isInteger(n));
  else delete out.rivalsBeaten;
  return out;
};
export const migrate = (raw: unknown): SaveState | null => {
  try {
    let v: unknown = raw;
    if (typeof v === 'string') v = parse(v);
    if (!isObj(v)) return null;
    // Something with no box and no light was never a save.
    if (!('box' in v) || !('light' in v)) return null;
    const version = typeof v.version === 'number' ? v.version : 0;
    if (version > CURRENT_VERSION || version < 0) return null;
    let o: Obj = v;
    if (version === 0) o = v0to1(o);
    const fast = SaveStateSchema.safeParse(o);
    if (fast.success) return fast.data;
    const r = SaveStateSchema.safeParse(repair(o));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
};

const universesIn = (s: SaveState | null): number => (s ? s.box.reduce((n, e) => n + (e ? 1 : 0), 0) : 0);

/** Why a snapshot must not be written, or null when it is sound. */
const broken = (s: unknown, last: SaveState | null): string | null => {
  const r = SaveStateSchema.safeParse(s);
  if (!r.success) return 'That save was damaged before it was written. The last good one was kept.';
  if (!Number.isFinite(r.data.savedAtMs) || r.data.savedAtMs <= 0) return 'That save had no date. The last good one was kept.';
  // An empty box at tick zero over a box that held universes is a snapshot taken before the game was restored.
  if (last && universesIn(last) > 0 && universesIn(r.data) === 0 && r.data.clock.tick === 0 && last.clock.tick > 0) return 'An empty save was refused. The last good one was kept.';
  return null;
};

/* ---------- backends ---------- */
const timed = <T>(f: () => Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('indexeddb timeout')), IDB_TIMEOUT_MS);
    // idb-keyval throws synchronously when indexedDB is missing, so the call sits inside the promise.
    Promise.resolve().then(f).then((v) => { clearTimeout(t); resolve(v); }, (e: unknown) => { clearTimeout(t); reject(e instanceof Error ? e : new Error(String(e))); });
  });

const newest = (cands: readonly unknown[]): SaveState | null => {
  let best: SaveState | null = null;
  for (const c of cands) {
    const s = migrate(c);
    if (s && (!best || s.savedAtMs > best.savedAtMs)) best = s;
  }
  return best;
};

interface Pending { kind: 'import' | 'reset'; save: unknown; ls: Record<string, string>; keep: string[] }
const readPending = (): Pending | null => {
  const p = parse(ls.get(PENDING));
  if (!isObj(p) || (p.kind !== 'import' && p.kind !== 'reset')) return null;
  const map: Record<string, string> = {};
  if (isObj(p.ls)) for (const [k, v] of Object.entries(p.ls)) if (typeof v === 'string') map[k] = v;
  return { kind: p.kind, save: p.save ?? null, ls: map, keep: Array.isArray(p.keep) ? p.keep.filter((k): k is string => typeof k === 'string') : [] };
};

const infoOf = (b: Bundle, bytes: number): SaveBundleInfo => {
  const s = migrate(b.save);
  return { version: b.v, exportedAtMs: b.at, savedAtMs: s ? s.savedAtMs : null, universes: universesIn(s), lightPips: s ? s.light.pips : null, keys: Object.keys(b.ls).length, bytes };
};

export const factory: SaveStoreFactory = () => {
  let idbOk = true;
  let backend: SaveStatus['backend'] = 'indexeddb';
  let last: SaveState | null = null;
  let memory: SaveState | null = null;
  let lastSavedAtMs: number | null = null;
  let lastError: string | null = null;
  let frozen = false;
  let queued: SaveState | null = null;
  let writing: Promise<void> | null = null;

  // A staged import or reset replaces the small stores now, before any other unit has read its keys.
  let pending = readPending();
  if (pending) {
    const keep = new Set(pending.keep);
    for (const k of gameKeys()) if (!keep.has(k)) ls.del(k);
    for (const [k, v] of Object.entries(pending.ls)) if (k.startsWith(GAME) && !k.startsWith(INTERNAL)) ls.set(k, v);
  }

  const lsWrite = (s: SaveState): boolean => {
    const json = JSON.stringify(s);
    // New beside old first; only once it has read back does it take the old one's place.
    if (!ls.set(NEW, json)) { ls.del(NEW); return false; }
    const old = ls.get(KEY);
    if (old !== null && migrate(old) && !ls.set(PREV, old)) ls.del(PREV);
    if (!ls.set(KEY, json)) return migrate(ls.get(NEW)) !== null;
    ls.del(NEW);
    return true;
  };
  const lsCands = (): unknown[] => [ls.get(KEY), ls.get(NEW), ls.get(PREV)];
  const lsClear = () => { ls.del(KEY); ls.del(NEW); ls.del(PREV); };

  const write = async (s: SaveState): Promise<void> => {
    if (idbOk) {
      try {
        // One transaction: the save it replaces is kept as PREV, or nothing changes at all.
        const prev = last && last !== s ? last : undefined;
        await timed(() => setMany(prev ? [[PREV, prev], [KEY, s]] : [[KEY, s]]));
        backend = 'indexeddb';
        last = s; lastSavedAtMs = s.savedAtMs; lastError = null;
        return;
      } catch {
        idbOk = false;
      }
    }
    if (lsWrite(s)) {
      backend = 'localstorage';
      last = s; lastSavedAtMs = s.savedAtMs; lastError = null;
      return;
    }
    backend = 'memory';
    memory = s; last = s;
    lastError = 'This browser will not keep a save. Export a code before you close the page.';
  };
  const drain = async (): Promise<void> => {
    try {
      while (queued) {
        const s = queued;
        queued = null;
        await write(s);
      }
    } finally {
      writing = null;
    }
  };
  const wipe = async (): Promise<void> => {
    if (idbOk) { try { await timed(() => delMany([KEY, PREV])); } catch { idbOk = false; } }
    lsClear();
    memory = null; last = null; lastSavedAtMs = null;
  };

  const load = async (): Promise<SaveState | null> => {
    if (writing) await writing.catch(() => undefined);
    if (pending) {
      const p = pending;
      const state = p.kind === 'import' ? migrate(p.save) : null;
      await wipe();
      if (state) await write(state);
      pending = null;
      ls.del(PENDING);
      return state;
    }
    const cands: unknown[] = [];
    if (idbOk) {
      try { cands.push(...(await timed(() => getMany<unknown>([KEY, PREV])))); } catch { idbOk = false; backend = 'localstorage'; }
    }
    cands.push(...lsCands(), memory);
    const s = newest(cands);
    if (s) { last = s; lastSavedAtMs = s.savedAtMs; }
    return s;
  };

  const save = (state: SaveState): Promise<void> => {
    if (frozen) return Promise.resolve();
    const why = broken(state, last);
    if (why) { lastError = why; return Promise.resolve(); }
    // Only the newest waiting snapshot is ever written: a burst of saves costs one write.
    queued = state;
    if (!writing) writing = drain().catch(() => undefined);
    return writing;
  };

  const snapshotBundle = async (): Promise<Bundle> => {
    if (writing) await writing.catch(() => undefined);
    const state = last ?? (await load());
    const map: Record<string, string> = {};
    for (const k of gameKeys()) { const v = ls.get(k); if (v !== null) map[k] = v; }
    return { f: 'sallow', v: BUNDLE_VERSION, at: Date.now(), save: state, ls: map };
  };
  const exportAll = async (): Promise<string> => encodeBundle(await snapshotBundle());

  const inspectBundle = async (code: string): Promise<{ ok: true; bundle: Bundle; info: SaveBundleInfo } | { ok: false; error: string }> => {
    const r = await decodeBundle(code);
    if (!r.ok) return r;
    if (r.bundle.save !== null && !migrate(r.bundle.save)) return { ok: false, error: 'That code is whole, but the save inside it cannot be read by this version.' };
    return { ok: true, bundle: r.bundle, info: infoOf(r.bundle, code.trim().length) };
  };

  /** Keeps what is here now as the one backup. False when it could not be kept (then nothing else may proceed). */
  const keepBackup = async (): Promise<boolean> => {
    const b = await snapshotBundle();
    const code = await encodeBundle(b);
    return ls.set(BACKUP, JSON.stringify({ info: infoOf(b, code.length), code }));
  };
  const readBackup = (): { info: SaveBundleInfo; code: string } | null => {
    const b = parse(ls.get(BACKUP));
    if (!isObj(b) || typeof b.code !== 'string' || !isObj(b.info)) return null;
    return { info: b.info as unknown as SaveBundleInfo, code: b.code };
  };
  const stage = (p: Pending): boolean => {
    if (!ls.set(PENDING, JSON.stringify(p))) { ls.del(PENDING); return false; }
    // From here until the reload nothing may overwrite what is about to be replaced.
    frozen = true;
    queued = null;
    return true;
  };
  const NO_ROOM = 'There is no room to keep a backup first, so nothing was changed.';

  const stageBundle = async (found: { bundle: Bundle; info: SaveBundleInfo }, backupFirst: () => Promise<boolean>): Promise<SaveBundleResult> => {
    if (!(await backupFirst())) return { ok: false, error: NO_ROOM };
    if (!stage({ kind: 'import', save: found.bundle.save, ls: found.bundle.ls, keep: [] })) return { ok: false, error: 'There is no room to stage that, so nothing was changed.' };
    return { ok: true, info: found.info };
  };

  return {
    load,
    save,
    clear: wipe,
    migrate,
    exportCode: formatSerial,
    importCode: parseSerial,
    status: () => ({ backend, lastSavedAtMs, lastError }),
    usage: async () => {
      const saveBytes = last ? JSON.stringify(last).length : 0;
      let localBytes = 0;
      for (const k of gameKeys()) localBytes += k.length + (ls.get(k)?.length ?? 0);
      let usedBytes: number | null = null;
      let quotaBytes: number | null = null;
      try {
        const est = await navigator.storage?.estimate?.();
        if (est) { usedBytes = est.usage ?? null; quotaBytes = est.quota ?? null; }
      } catch { /* no estimate here */ }
      return { saveBytes, localBytes, usedBytes, quotaBytes };
    },
    exportAll,
    inspect: async (code) => {
      const r = await inspectBundle(code);
      return r.ok ? { ok: true, info: r.info } : r;
    },
    stageImport: async (code) => {
      const r = await inspectBundle(code);
      if (!r.ok) return r;
      return stageBundle(r, keepBackup);
    },
    stageReset: async (keep = []) => {
      if (!(await keepBackup())) { lastError = NO_ROOM; return false; }
      return stage({ kind: 'reset', save: null, ls: {}, keep: [...keep] });
    },
    backup: () => readBackup()?.info ?? null,
    stageRestore: async () => {
      const b = readBackup();
      if (!b) return { ok: false, error: 'There is no backup to bring back.' };
      const r = await inspectBundle(b.code);
      if (!r.ok) return { ok: false, error: 'The backup is damaged. Nothing was changed.' };
      // What is here now takes the backup's place, so a restore can itself be undone.
      return stageBundle(r, keepBackup);
    },
  };
};
