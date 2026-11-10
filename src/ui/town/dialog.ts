// The bottom sheet: talk with choices, shops, the skimming game, the bag and the map.
import { el } from '@/ui/kit';
import { COLLECT, ITEMS, PLACES, type Scene, type Town } from '@/game/town';
import { sheet as lookSheet, CELL_W } from './sprites';
import { paintMap } from './render';

export interface Sheet {
  show(s: Scene | null): void;
  open(): boolean;
  /** Confirm key: continue, or take the first choice. */
  advance(): void;
  close(): void;
  bag(): void;
  map(): void;
  frame(dtMs: number): void;
}

export const createSheet = (root: HTMLElement, town: Town, sfx: (n: string, a?: number) => void): Sheet => {
  const box = el('section', { class: 'town-sheet', 'data-id': 'town-sheet', hidden: true });
  root.append(box);
  let current: Scene | null = null, kind: 'scene' | 'skim' | 'bag' | 'map' | null = null;
  let skimP = 0, skimDir = 1, marker: HTMLElement | null = null, skimPlace = '';
  const close = (): void => { box.hidden = true; box.replaceChildren(); current = null; kind = null; marker = null; };
  const head = (who: string, look?: Scene['look']): HTMLElement => {
    const h = el('header', { class: 'town-sheet-head' });
    if (look) { const c = el('canvas', { class: 'town-face', width: CELL_W, height: 14 }); c.getContext('2d')!.drawImage(lookSheet(look), 0, look.tall ? 3 : 6, CELL_W, 14, 0, 0, CELL_W, 14); h.append(c); }
    h.append(el('span', { class: 'k-label' }, who));
    return h;
  };
  const show = (s: Scene | null): void => {
    if (!s) { close(); return; }
    if (s.skim) { skim(s); return; }
    current = s; kind = 'scene'; box.hidden = false; box.className = 'town-sheet';
    const kids: HTMLElement[] = [];
    if (s.who) kids.push(head(s.who, s.look));
    kids.push(el('p', { class: 'k-narration town-say', 'data-id': 'town-say' }, s.text));
    if (s.choices?.length) {
      const list = el('div', { class: 'town-choices' });
      s.choices.forEach((c, i) => {
        const b = el('button', { class: `k-btn town-choice${c.off ? ' off' : ''}`, type: 'button', 'data-id': `town-choice-${i}` }, c.text);
        b.addEventListener('click', (e) => { e.stopPropagation(); sfx('tap'); show(c.pick()); });
        list.append(b);
      });
      kids.push(list);
    } else kids.push(el('span', { class: 'k-label town-more', 'data-id': 'town-more' }, 'TAP TO GO ON'));
    box.replaceChildren(...kids);
    sfx('whisper');
  };
  box.addEventListener('click', () => { if (kind === 'scene' && current && !current.choices?.length) { sfx('tap'); close(); } });

  const skim = (s: Scene): void => {
    kind = 'skim'; current = s; skimPlace = s.skim!; box.hidden = false; box.className = 'town-sheet';
    const wide = (town.state.bag['best-stone'] ?? 0) > 0;
    marker = el('i', { class: 'town-skim-mark' });
    const bar = el('div', { class: `town-skim${wide ? ' wide' : ''}`, 'data-id': 'town-skim' }, el('b', {}), marker);
    const go = el('button', { class: 'k-btn town-choice', type: 'button', 'data-id': 'town-throw' }, 'Throw');
    go.addEventListener('click', (e) => {
      e.stopPropagation();
      const off = Math.abs(skimP - 0.5) * 2, zone = wide ? 0.3 : 0.2;
      const skips = off <= zone ? 7 + Math.round((1 - off / zone) * 3) : Math.max(0, Math.round((1 - off) * 6.4));
      sfx('water'); sfx('pickup', 0.5);
      show(town.skimDone(skimPlace, skips));
    });
    const stop = el('button', { class: 'k-btn town-choice', type: 'button', 'data-id': 'town-skim-leave' }, 'Leave it');
    stop.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    box.replaceChildren(head(PLACES.find((p) => p.id === skimPlace)?.name ?? 'The water'), el('p', { class: 'k-narration town-say' }, `${s.text} Throw when the mark is in the bright part. Best: ${town.state.skim.best}.`), bar, el('div', { class: 'town-choices' }, go, stop));
  };

  const closer = (): HTMLElement => { const b = el('button', { class: 'k-btn town-choice', type: 'button', 'data-id': 'town-sheet-close' }, 'Close'); b.addEventListener('click', (e) => { e.stopPropagation(); close(); }); return b; };
  const bag = (): void => {
    kind = 'bag'; current = null; box.hidden = false; box.className = 'town-sheet tall';
    const st = town.state, note = el('p', { class: 'k-narration town-say', 'data-id': 'town-bag-note' }, `${st.coins} coin${st.coins === 1 ? '' : 's'} in your pocket.`);
    const list = el('div', { class: 'town-list' });
    for (const it of ITEMS) {
      const n = st.bag[it.id] ?? 0; if (!n) continue;
      const row = el('div', { class: 'town-row' }, el('div', {}, el('b', {}, n > 1 ? `${it.name} ×${n}` : it.name), el('small', {}, it.desc)));
      if (it.kind === 'food') { const b = el('button', { class: 'k-btn', type: 'button', 'data-id': `town-eat-${it.id}` }, 'Eat'); b.addEventListener('click', (e) => { e.stopPropagation(); const t = town.use(it.id); bag(); box.querySelector('[data-id="town-bag-note"]')!.textContent = t; }); row.append(b); }
      list.append(row);
    }
    for (const k of COLLECT) { const have = st.found.filter((f) => f.startsWith(k.id + '-')).length; list.append(el('div', { class: 'town-row' }, el('div', {}, el('b', {}, `${k.name} ${have}/${k.count}`), el('small', {}, have >= k.count ? k.says : `Found lying about. ${k.count - have} still out there.`)))); }
    box.replaceChildren(head('Your pockets'), note, list, el('div', { class: 'town-choices' }, closer()));
  };
  const map = (): void => {
    kind = 'map'; current = null; box.hidden = false; box.className = 'town-sheet tall';
    const c = el('canvas', { class: 'town-map', 'data-id': 'town-map' });
    paintMap(c, town, 2);
    const lead = town.lead();
    box.replaceChildren(head(`The neighbourhood · ${town.state.districts.length}/12 districts`), c,
      el('p', { class: 'k-label town-legend' }, 'MINT you · GOLD + your errand · RUST bus stops · PALE places'),
      el('p', { class: 'k-narration town-say' }, lead ? `${lead.name}: ${lead.hint}` : 'Nothing is asked of you just now.'),
      el('div', { class: 'town-choices' }, closer()));
  };
  return {
    show, open: () => !box.hidden, close, bag, map,
    advance: () => { if (kind === 'scene' && current) { if (current.choices?.length) show(current.choices[0]!.pick()); else close(); } else if (kind === 'bag' || kind === 'map') close(); },
    frame: (dt) => {
      if (kind !== 'skim' || !marker) return;
      skimP += skimDir * dt * 0.0008; if (skimP > 1) { skimP = 1; skimDir = -1; } else if (skimP < 0) { skimP = 0; skimDir = 1; }
      marker.style.left = `${(skimP * 100).toFixed(1)}%`;
    },
  };
};
