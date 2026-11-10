/**
 * Where watched worlds are kept between visits: one IndexedDB database, "sallow-worlds".
 *
 * A record is one planet's sand + civ + chronicle packed into a single buffer (gzip when the
 * platform has CompressionStream, raw otherwise), keyed by universe serial + planet seed. A small
 * index beside the records says what is stored without touching the big buffers. Used from the
 * sim Worker (reads and writes) and from the main thread (the index, forget, clear).
 *
 * Nothing here throws: every failure reads as "nothing stored".
 */
import { createStore, get, set, del, clear, keys } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';
import type { StoredWorld } from '@/contracts/worker';
import type { ChronicleEntry } from '@/contracts/sim';
import type { Seed } from '@/contracts/seed';

export const WORLDS_DB = 'sallow-worlds';
export const WORLDS_STORE = 'worlds';
/** Other tabs, the Worker and the sim client hear on this when the store is wiped. */
export const WORLDS_CHANNEL = 'sallow-worlds';
/** Bump when the packed layout changes: older records are then discarded, not restored. */
export const WORLD_FORMAT = 1;
/** The most recently opened worlds kept; older ones are evicted. */
export const MAX_WORLDS = 24;

const INDEX_KEY = 'index';
const recKey = (key: string) => `w:${key}`;
const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');

/** Universe serial + planet seed. */
export const worldKey = (serial: number, planet: Seed): string => `${(serial >>> 0).toString(16)}:${hex(planet.hi)}${hex(planet.lo)}`;

/** What a world is made of when it stands still. */
export interface WorldParts {
  sand: Uint8Array;
  civ: Uint8Array;
  chronicle: ChronicleEntry[];
}

interface WorldRecord {
  v: number;
  key: string;
  lawSet: string;
  width: number;
  height: number;
  tick: number;
  savedAtMs: number;
  comp: 'gzip' | 'raw';
  /** Length of the packed buffer before compression. */
  rawBytes: number;
  data: Uint8Array;
}

/* ---------- packing ---------- */
const MAGIC = 0x53574c44; // 'SWLD'

/** [magic][sand length][civ length][chronicle length][sand][civ][chronicle as JSON]. */
export const pack = (p: WorldParts): Uint8Array => {
  const chron = new TextEncoder().encode(JSON.stringify(p.chronicle));
  const out = new Uint8Array(16 + p.sand.length + p.civ.length + chron.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC);
  dv.setUint32(4, p.sand.length);
  dv.setUint32(8, p.civ.length);
  dv.setUint32(12, chron.length);
  out.set(p.sand, 16);
  out.set(p.civ, 16 + p.sand.length);
  out.set(chron, 16 + p.sand.length + p.civ.length);
  return out;
};

/** Null when the buffer is not a whole packed world. */
export const unpack = (b: Uint8Array): WorldParts | null => {
  try {
    if (b.length < 16) return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (dv.getUint32(0) !== MAGIC) return null;
    const ns = dv.getUint32(4);
    const nc = dv.getUint32(8);
    const nh = dv.getUint32(12);
    if (16 + ns + nc + nh !== b.length) return null;
    const chronicle = JSON.parse(new TextDecoder().decode(b.subarray(16 + ns + nc))) as unknown;
    if (!Array.isArray(chronicle)) return null;
    const ok = chronicle.every((e: unknown) => !!e && typeof e === 'object' && typeof (e as ChronicleEntry).id === 'number' && typeof (e as ChronicleEntry).event === 'string');
    if (!ok) return null;
    // Copies, so the units never hold on to the record's buffer.
    return { sand: b.slice(16, 16 + ns), civ: b.slice(16 + ns, 16 + ns + nc), chronicle: chronicle as ChronicleEntry[] };
  } catch { return null; }
};

const canCompress = (): boolean => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && typeof Response === 'function';
const pipe = async (b: Uint8Array, through: CompressionStream | DecompressionStream): Promise<Uint8Array> => {
  const w = through.writable.getWriter();
  // Not awaited before reading: the stream only drains while someone reads.
  const wrote = w.write(b as unknown as BufferSource).then(() => w.close());
  const [out] = await Promise.all([new Response(through.readable).arrayBuffer(), wrote]);
  return new Uint8Array(out);
};
export const squeeze = async (b: Uint8Array): Promise<{ comp: 'gzip' | 'raw'; data: Uint8Array }> => {
  if (canCompress()) {
    try { return { comp: 'gzip', data: await pipe(b, new CompressionStream('gzip')) }; } catch { /* stored raw */ }
  }
  return { comp: 'raw', data: b };
};
export const unsqueeze = async (comp: string, data: Uint8Array): Promise<Uint8Array | null> => {
  try {
    if (comp === 'raw') return data;
    if (comp === 'gzip' && canCompress()) return await pipe(data, new DecompressionStream('gzip'));
  } catch { /* unreadable */ }
  return null;
};

/* ---------- the store ---------- */
let store: UseStore | null = null;
const db = (): UseStore => (store ??= createStore(WORLDS_DB, WORLDS_STORE));
/** IndexedDB can hang (private modes, a blocked upgrade). Nothing here may wait for ever. */
const timed = <T>(f: () => Promise<T>, ms = 4000): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('worlds store timeout')), ms);
    Promise.resolve().then(f).then((v) => { clearTimeout(t); resolve(v); }, (e: unknown) => { clearTimeout(t); reject(e instanceof Error ? e : new Error(String(e))); });
  });

const isInfo = (i: unknown): i is StoredWorld => {
  const x = i as StoredWorld | null;
  return !!x && typeof x === 'object' && typeof x.key === 'string' && Number.isFinite(x.tick) && Number.isFinite(x.savedAtMs) && Number.isFinite(x.openedAtMs);
};
const readIndex = async (): Promise<StoredWorld[]> => {
  const raw = await timed(() => get<unknown>(INDEX_KEY, db()));
  return Array.isArray(raw) ? raw.filter(isInfo) : [];
};

/** What is stored, newest opened first. Never rejects. */
export const listWorlds = async (): Promise<StoredWorld[]> => {
  try { return (await readIndex()).sort((a, b) => b.openedAtMs - a.openedAtMs); } catch { return []; }
};

export interface SaveInput extends WorldParts {
  info: Omit<StoredWorld, 'bytes'>;
  lawSet: string;
  width: number;
  height: number;
  /** Skip compression: the page is going away and the write must be short. */
  urgent?: boolean;
}
/** Write one world and evict past MAX_WORLDS. Resolves with the index as it now stands, or null if nothing was written. */
export const saveWorld = async (w: SaveInput): Promise<StoredWorld[] | null> => {
  try {
    const raw = pack(w);
    const { comp, data } = w.urgent ? { comp: 'raw' as const, data: raw } : await squeeze(raw);
    const rec: WorldRecord = { v: WORLD_FORMAT, key: w.info.key, lawSet: w.lawSet, width: w.width, height: w.height, tick: w.info.tick, savedAtMs: w.info.savedAtMs, comp, rawBytes: raw.length, data };
    await timed(() => set(recKey(w.info.key), rec, db()));
    const index = (await readIndex()).filter((i) => i.key !== w.info.key);
    index.push({ ...w.info, bytes: data.length });
    index.sort((a, b) => b.openedAtMs - a.openedAtMs);
    const gone = index.splice(MAX_WORLDS);
    for (const g of gone) await timed(() => del(recKey(g.key), db())).catch(() => {});
    await timed(() => set(INDEX_KEY, index, db()));
    return index;
  } catch { return null; }
};

/**
 * Read one world. Null when there is none, when it was written by another format, under another
 * law set or for another grid, or when it cannot be read. A record that is there but useless is
 * deleted on the way out.
 */
export const loadWorld = async (key: string, expect: { lawSet: string; width: number; height: number }): Promise<(WorldParts & { tick: number; savedAtMs: number }) | null> => {
  let found = false;
  try {
    const rec = await timed(() => get<WorldRecord>(recKey(key), db()));
    if (rec === undefined) return null;
    found = true;
    if (!rec || typeof rec !== 'object' || rec.v !== WORLD_FORMAT || rec.key !== key || rec.lawSet !== expect.lawSet || rec.width !== expect.width || rec.height !== expect.height) throw new Error('stale');
    if (!(rec.data instanceof Uint8Array) || !Number.isFinite(rec.savedAtMs)) throw new Error('damaged');
    const raw = await unsqueeze(rec.comp, rec.data);
    if (!raw || raw.length !== rec.rawBytes) throw new Error('damaged');
    const parts = unpack(raw);
    if (!parts) throw new Error('damaged');
    return { ...parts, tick: rec.tick, savedAtMs: rec.savedAtMs };
  } catch {
    if (found) await forgetWorld(key);
    return null;
  }
};

/** Delete one world. Resolves with the index as it now stands (null if it could not be read). */
export const forgetWorld = async (key: string): Promise<StoredWorld[] | null> => {
  try {
    await timed(() => del(recKey(key), db()));
    const index = (await readIndex()).filter((i) => i.key !== key);
    await timed(() => set(INDEX_KEY, index, db()));
    return index;
  } catch { return null; }
};

/** Drop records the index does not know (a write that died half way). */
export const sweepWorlds = async (): Promise<void> => {
  try {
    const known = new Set((await readIndex()).map((i) => recKey(i.key)));
    for (const k of await timed(() => keys<string>(db()))) {
      if (typeof k === 'string' && k.startsWith('w:') && !known.has(k)) await timed(() => del(k, db()));
    }
  } catch { /* another day */ }
};

/**
 * Forget every stored world: "Start a new game", and before a whole-game import. Also tells a
 * running sim Worker not to write the world it has open back into the emptied store. Never rejects.
 */
export const clearWorlds = async (): Promise<void> => {
  try {
    if (typeof BroadcastChannel === 'function') {
      const ch = new BroadcastChannel(WORLDS_CHANNEL);
      ch.postMessage({ type: 'cleared' });
      ch.close();
    }
  } catch { /* nobody listening */ }
  try { await timed(() => clear(db())); } catch { /* nothing to clear */ }
};
