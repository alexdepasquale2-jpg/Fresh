// The whole-game share code: "SALLOW1Z.<payload>.<checksum>".
// Payload is the bundle JSON as UTF-8, deflated when the browser can ("Z") or plain ("J"), in base64url.
// The checksum is over the payload text, so a mistyped, cut-off or foreign code is refused before it is opened.
export const BUNDLE_VERSION = 1;
const MAX_CODE = 4_000_000;

export interface Bundle {
  readonly f: 'sallow';
  readonly v: number;
  /** When it was exported (ms). */
  readonly at: number;
  /** The main save as stored (any version the save store can migrate), or null for a game with none yet. */
  readonly save: unknown;
  /** Every localStorage key starting with "sallow" that is not the save system's own. */
  readonly ls: Record<string, string>;
}

const checksum = (s: string): string => {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = (Math.imul(b ^ (c + i), 0x85ebca6b) >>> 0) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
};

const toB64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const pipe = async (bytes: Uint8Array, through: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> }): Promise<Uint8Array> => {
  const out = new Response(new Blob([bytes as BufferSource]).stream().pipeThrough(through as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)).arrayBuffer();
  return new Uint8Array(await out);
};

export const encodeBundle = async (b: Bundle): Promise<string> => {
  const raw = new TextEncoder().encode(JSON.stringify(b));
  let kind = 'J';
  let bytes = raw;
  if (typeof CompressionStream === 'function') {
    try { bytes = await pipe(raw, new CompressionStream('deflate-raw')); kind = 'Z'; } catch { bytes = raw; kind = 'J'; }
  }
  const payload = toB64(bytes);
  return `SALLOW${BUNDLE_VERSION}${kind}.${payload}.${checksum(payload)}`;
};

export type Decoded = { ok: true; bundle: Bundle } | { ok: false; error: string };
const bad = (error: string): Decoded => ({ ok: false, error });

export const decodeBundle = async (code: string): Promise<Decoded> => {
  try {
    const text = code.replace(/\s+/g, '');
    if (!text) return bad('There is nothing there to read.');
    if (text.length > MAX_CODE) return bad('That is too large to be a SALLOW save.');
    const m = /^SALLOW(\d+)([ZJ])\.([A-Za-z0-9_-]+)\.([0-9a-f]{16})$/.exec(text);
    if (!m) return bad(/^SALLOW/.test(text) ? 'That code is cut short or has stray characters in it.' : 'That is not a SALLOW save code.');
    const version = Number(m[1]);
    if (version > BUNDLE_VERSION) return bad('That code comes from a newer SALLOW. Update the game first.');
    if (checksum(m[3]!) !== m[4]) return bad('That code is damaged: a character is missing or changed. Copy it again.');
    let bytes = fromB64(m[3]!);
    if (m[2] === 'Z') {
      if (typeof DecompressionStream !== 'function') return bad('This browser cannot open a packed code.');
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
    const o = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (typeof o !== 'object' || o === null) return bad('That code holds no save.');
    const r = o as Record<string, unknown>;
    if (r.f !== 'sallow' || typeof r.v !== 'number' || typeof r.at !== 'number') return bad('That code holds no SALLOW save.');
    const ls: Record<string, string> = {};
    if (typeof r.ls === 'object' && r.ls !== null) {
      for (const [k, v] of Object.entries(r.ls as Record<string, unknown>)) if (k.startsWith('sallow') && typeof v === 'string') ls[k] = v;
    }
    return { ok: true, bundle: { f: 'sallow', v: r.v, at: r.at, save: r.save ?? null, ls } };
  } catch {
    return bad('That code could not be opened. Nothing was changed.');
  }
};
