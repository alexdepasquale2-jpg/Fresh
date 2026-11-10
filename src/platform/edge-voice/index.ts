// Edge voice (unit 27). Optional re-voicing of grammar text. OFF by default, and off means untouched:
// revoice and revoiceSync hand back exactly what they were given.
// When switched on: with no endpoint, the local grammar varies the line (no network at all); with an
// endpoint, the line is sent once per (kind, seed), the answer is validated and cached, and anything
// wrong (timeout, bad text, network error) falls back to the grammar. Nothing here ever throws.
import type { EdgeVoice, EdgeVoiceFactory, VoiceKind } from '@/contracts/platform';
import { describe, dreamLine, vary } from './grammar';

export { describe, dreamLine, vary } from './grammar';

const TIMEOUT_MS = 2500;
const MAX_CACHE = 400;

/** Plain sentences only: letters, digits, ordinary punctuation; no links, no markup; not much longer than the original. */
export const valid = (text: unknown, grammarText: string): text is string =>
  typeof text === 'string'
  && text.trim().length >= 3
  && text.length <= Math.max(160, grammarText.length * 2)
  && /^[A-Za-z0-9 .,;:!?'"()\-’\n]+$/.test(text)
  && !/https?:|www\.|\w\.\w{2,}\//i.test(text);

/** The adapter, with the network-free grammar beside it for any unit that wants a fresh line. */
export interface EdgeVoicePlus extends EdgeVoice {
  /** A grammar line describing a kind of thing; index picks among the variants for one seed. */
  describe(kind: VoiceKind, seedHex: string, index?: number): string;
  /** A dream line. */
  dream(seedHex: string, index?: number): string;
}

export const factory: EdgeVoiceFactory = ({ endpoint }): EdgeVoicePlus => {
  let on = false;
  const cache = new Map<string, string>();
  const pending = new Map<string, Promise<string>>();
  const put = (k: string, v: string) => {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(k, v);
    return v;
  };
  const ask = async (kind: VoiceKind, seedHex: string, text: string): Promise<string> => {
    if (!endpoint || typeof fetch !== 'function') return vary(kind, seedHex, text);
    const stop = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => stop?.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, seed: seedHex, text }), signal: stop?.signal });
      if (!res.ok) return text;
      const body: unknown = await res.json();
      const out = body && typeof body === 'object' ? (body as { text?: unknown }).text : null;
      return valid(out, text) ? out.trim() : text;
    } catch {
      return text;
    } finally {
      clearTimeout(timer);
    }
  };
  const voice: EdgeVoicePlus = {
    enabled: () => on,
    setEnabled: (v) => { on = !!v; },
    revoice: (kind, seedHex, grammarText) => {
      if (!on) return Promise.resolve(grammarText);
      const k = `${kind}:${seedHex}`;
      const hit = cache.get(k);
      if (hit !== undefined) return Promise.resolve(hit);
      let p = pending.get(k);
      if (!p) {
        p = ask(kind, seedHex, grammarText).catch(() => grammarText).then((t) => { pending.delete(k); return put(k, t); });
        pending.set(k, p);
      }
      return p;
    },
    revoiceSync: (kind, seedHex, grammarText) => {
      if (!on) return grammarText;
      const hit = cache.get(`${kind}:${seedHex}`);
      if (hit !== undefined) return hit;
      // With no endpoint the grammar answers at once; with one, the cached answer shows up next time.
      if (!endpoint) return put(`${kind}:${seedHex}`, vary(kind, seedHex, grammarText));
      void voice.revoice(kind, seedHex, grammarText);
      return grammarText;
    },
    describe,
    dream: dreamLine,
  };
  return voice;
};
