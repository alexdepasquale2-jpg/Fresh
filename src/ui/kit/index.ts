/**
 * Shared DOM components. Square corners (except HOLD), 44px targets, tokens
 * only. Units compose these; never edit this file from a unit.
 */
import './kit.css';

type Attrs = Record<string, string | number | boolean | undefined>;
export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (k === 'text') e.textContent = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
};

export const button = (label: string, onClick: () => void, opts: { primary?: boolean; id?: string; disabled?: boolean } = {}) => {
  const b = el('button', { class: opts.primary ? 'k-btn k-btn--primary' : 'k-btn', 'data-id': opts.id, disabled: opts.disabled, type: 'button' }, label);
  b.addEventListener('click', onClick);
  return b;
};

export const backChip = (label: string, onClick: () => void) => {
  const b = el('button', { class: 'k-back', type: 'button', 'data-id': `back-${label.toLowerCase()}` }, label);
  b.addEventListener('click', onClick);
  return b;
};

/** LIGHT pips. Call update(n) to change. */
export const lightPips = (pips: number, max = 8) => {
  const root = el('span', { class: 'k-pips', role: 'meter', 'aria-label': 'Light', 'aria-valuemin': 0, 'aria-valuemax': max }, 'LIGHT ');
  const cells = Array.from({ length: max }, () => root.appendChild(el('i')));
  const update = (n: number) => {
    cells.forEach((c, i) => c.classList.toggle('on', i < n));
    root.classList.toggle('low', n <= 2);
    root.setAttribute('aria-valuenow', String(n));
  };
  update(pips);
  return { el: root, update };
};

export const tag = (text: string) => el('span', { class: 'k-tag' }, text);

export const stat = (value: string | number, label: string) => {
  const b = el('b', {}, String(value));
  const root = el('div', { class: 'k-stat' }, b, el('span', {}, label));
  return { el: root, update: (v: string | number) => void (b.textContent = String(v)) };
};

export const boxSlot = (glyph: string | null, selected: boolean, onClick: () => void) => {
  const b = el('button', { class: glyph ? 'k-slot' : 'k-slot empty', type: 'button', 'aria-selected': selected ? 'true' : 'false', disabled: !glyph }, glyph ?? '');
  b.addEventListener('click', onClick);
  return b;
};

/** Sky-piece tile. Draggable via data-drag (see platform/input). */
export const skyPieceTile = (kind: string, count: number) =>
  el('div', { class: count > 0 ? 'k-tile' : 'k-tile none', 'data-drag': count > 0 ? kind : undefined, 'data-kind': kind }, kind, el('small', {}, `x${count}`));

export const narration = (text: string) => el('p', { class: 'k-narration' }, curly(text));
export const label = (text: string) => el('span', { class: 'k-label' }, text);

export const holdButton = () => el('button', { class: 'k-hold', type: 'button', 'aria-pressed': 'false', 'data-id': 'hold' }, 'HOLD');

/** Map 0..63 glyph indices to a small set of pixel-font characters. */
export const GLYPHS = '◇◆○●□■△▲▽▼☉☽✶✷✸✹⊕⊗⊙⊚⋄∴∵∷≡≣⌘⌬⍟⎔◈◉◊◌◍◎◐◑◒◓◔◕◖◗◘◙◚◛◜◝◞◟◠◡◢◣◤◥◦◧◨◩◪◫◬◭◮◯'.split('');
export const glyphChar = (i: number): string => GLYPHS[i % GLYPHS.length] ?? '◇';

/** A burst of sparks at (x, y) inside host (which must be positioned). Purely decorative. */
export const burst = (host: HTMLElement, x: number, y: number, count = 10, big = false) => {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (i % 2) * 0.4;
    const d = (big ? 46 : 26) * (0.6 + ((i * 37) % 10) / 12);
    const s = el('i', { class: 'spark', style: `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px` });
    host.append(s);
    setTimeout(() => s.remove(), 650);
  }
};
/** Shake an element briefly (impacts, hits). */
export const shake = (target: HTMLElement, hard = false) => {
  target.classList.remove('shake', 'shake-hard');
  void target.offsetWidth;
  target.classList.add(hard ? 'shake-hard' : 'shake');
  setTimeout(() => target.classList.remove('shake', 'shake-hard'), 450);
};
/** A full flash over an element (lightning, merge, flare). */
export const flash = (host: HTMLElement) => {
  const f = el('i', { class: 'flash' });
  host.append(f);
  setTimeout(() => f.remove(), 400);
};

/* ---------- shared words: one way to say Light, a sky piece, a count, a name, a quotation ---------- */

const NUM_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** A small whole number in words ("three"); anything else in figures. */
export const numWord = (n: number): string => (Number.isInteger(n) && n >= 0 && n < NUM_WORDS.length ? NUM_WORDS[n]! : String(n));
/** "1 piece", "3 pieces". Pass words: true for "one piece", "three pieces". */
export const plural = (n: number, one: string, many = `${one}s`, words = false): string => `${words ? numWord(n) : n} ${n === 1 ? one : many}`;
/** First letter upper-cased, the rest untouched. */
export const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** Join clauses into sentences: each starts with a capital and ends with one full stop. */
export const sentences = (...parts: (string | null | undefined | false)[]): string =>
  parts.filter((p): p is string => !!p && !!p.trim()).map((p) => { const t = cap(p.trim()); return /[.!?…][”’)]?$/.test(t) ? t : `${t}.`; }).join(' ');
/** "a", "a and b", "a, b and c". */
export const listWords = (items: readonly string[]): string =>
  items.length <= 1 ? items[0] ?? '' : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]!}`;

/** Straight quotes to proper pairs: "Yes." becomes “Yes.”, it's becomes it’s. Safe on text that is already curly. */
export const curly = (text: string): string =>
  text
    .replace(/(^|[\s([{—–:-])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s([{—–“])'(?=\S)/g, '$1‘')
    .replace(/'/g, '’');
/** Text from elsewhere, made fit to show: proper quotes, and a capital after every full stop. */
export const tidy = (text: string): string => curly(text).replace(/([.!?]["”’]?\s+)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
/** A spoken line in proper quotation marks. */
export const quote = (text: string): string => `“${curly(text)}”`;

/** Points of glow in one pip of Light (the same number as game/light's GLOW_PER_PIP). */
export const POINTS_PER_PIP = 1000;
const pipFigure = (points: number): string => {
  const p = points / POINTS_PER_PIP;
  if (p >= 100) return String(Math.round(p));
  const s = p.toFixed(points % 100 === 0 || p >= 10 ? 1 : 2).replace(/\.?0+$/, '');
  return s === '' || s === '0' ? (points > 0 ? '0.01' : '0') : s;
};
/**
 * The one way to say an amount of Light in a sentence. The meter is Light. It is counted in pips, and a
 * pip is a thousand light: "a pip of Light", "three pips of Light", "half a pip of Light", "300 light"
 * (anything else under a pip), "1.2 pips of Light". Glow is only what a world gives off before it is Light.
 */
export const lightWords = (points: number): string => {
  const n = Math.max(0, Math.round(points));
  if (n === 0) return 'no Light';
  if (n % POINTS_PER_PIP === 0) { const p = n / POINTS_PER_PIP; return p === 1 ? 'a pip of Light' : `${numWord(p)} pips of Light`; }
  if (n < POINTS_PER_PIP) return n === 500 ? 'half a pip of Light' : `${n} light`;
  if (n % POINTS_PER_PIP === 500 && n < 13000) { const p = (n - 500) / POINTS_PER_PIP; return p === 1 ? 'a pip and a half of Light' : `${numWord(p)} and a half pips of Light`; }
  return `${pipFigure(n)} pips of Light`;
};
/** The same amount for a label or a chip, in figures: "300 light", "1 pip", "1.2 pips", "115 pips". */
export const lightShort = (points: number): string => {
  const n = Math.max(0, Math.round(points));
  if (n > 0 && n < POINTS_PER_PIP) return `${n} light`;
  const f = pipFigure(n);
  return `${f} ${f === '1' ? 'pip' : 'pips'}`;
};

/** For a reward line or a tally, where the word Light must be in it: "900 light", "1 pip of Light", "1.5 pips of Light". */
export const lightLabel = (points: number): string => { const s = lightShort(points); return s.endsWith('light') ? s : `${s} of Light`; };

const PIECE_ONE: Record<string, string> = { comet: 'comet', moon: 'moon', belt: 'belt of stones', sun: 'sun', rings: 'set of rings', dust: 'veil of dust' };
const PIECE_MANY: Record<string, string> = { comet: 'comets', moon: 'moons', belt: 'belts of stones', sun: 'suns', rings: 'sets of rings', dust: 'veils of dust' };
/** A sky piece as a noun without its article: "set of rings", "veil of dust", "belt of stones", "sun". */
export const pieceName = (kind: string): string => PIECE_ONE[kind] ?? kind;
/** A sky piece being hung in a sky or taken down from one: "a set of rings", "a veil of dust", "a belt of stones", "a second sun", "a moon", "a comet". */
export const aPiece = (kind: string): string => { const n = kind === 'sun' ? 'second sun' : pieceName(kind); return `${/^[aeiou]/i.test(n) ? 'an' : 'a'} ${n}`; };
/** Sky pieces held, paid or carried, counted: "a moon", "a sun", "a veil of dust", "two sets of rings", "three suns". */
export const pieceCount = (kind: string, n: number): string => {
  const one = pieceName(kind);
  return n === 1 ? `${/^[aeiou]/i.test(one) ? 'an' : 'a'} ${one}` : `${numWord(n)} ${PIECE_MANY[kind] ?? `${kind}s`}`;
};

/** Where the Box keeps the names the player gave (room-box/store NAMES_KEY): { [serialNumber]: name }. */
export const BOX_NAMES_KEY = 'sallow-box-names';
/**
 * The name to show for a universe: the one the player gave it in the Box, else its own.
 * Pass the spec, or a serial number with the name to fall back on.
 */
export const displayName = (u: { readonly serialNumber: number; readonly name: string } | number, fallback = ''): string => {
  const serial = typeof u === 'number' ? u : u.serialNumber;
  const own = typeof u === 'number' ? fallback : u.name;
  try {
    const all = JSON.parse(localStorage.getItem(BOX_NAMES_KEY) ?? '{}') as Record<string, unknown> | null;
    const n = all?.[String(serial)];
    return typeof n === 'string' && n.trim() ? n.trim() : own;
  } catch { return own; }
};
