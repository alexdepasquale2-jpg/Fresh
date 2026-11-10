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

export const narration = (text: string) => el('p', { class: 'k-narration' }, text);
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
