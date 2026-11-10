// The Box: 25 slots, and everything you can do with what is in them.
import type { ScreenFactory, AppContext } from '@/contracts/app';
import type { BoxEntry, UniverseStats } from '@/contracts/game';
import type { UniverseSpec } from '@/contracts/universe';
import type { Thing } from '@/contracts/merge';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { el, button, narration, label, boxSlot, glyphChar, backChip, tag, stat, skyPieceTile, burst, flash } from '@/ui/kit';
import { names, sync, saveMeta, touch, ago, EMPTY_STATS } from './store';
import './room-box.css';

const LAWS: Record<string, string> = {
  'ash-choir': 'Things here burn down to ash, and the ash does not lie still.',
  'cold-fire': 'Fire here gives no warmth. It spreads like frost and leaves things whole but changed.',
  'first-light': 'The plain laws: water falls, fire climbs, stone stays where it is put.',
  'glass-rain': 'The rain here falls as glass. It heaps up, and it cuts.',
  'pale-moss': 'A pale green thing grows over whatever is left alone long enough.',
  'salt-tide': 'The seas here are heavy with salt, and they come and go with their moons.',
  'slow-time': 'Everything here takes longer. A falling stone can be watched.',
  'tallow-bloom': 'Soft wax seeps out of the ground and blooms where it is warm.',
};
const lawLine = (spec: UniverseSpec) => LAWS[spec.laws.id] ?? `It keeps the laws called ${spec.laws.name}. Nothing here behaves quite as it does at home.`;
const ERAS = ['wandering', 'settled', 'bronze', 'iron', 'engines', 'sky'];
const SORTS = ['slot', 'name', 'souls', 'depth', 'tended', 'pinned'] as const;
type Sort = (typeof SORTS)[number];
type Pick = { slot: number } | { piece: (typeof SKY_PIECE_KINDS)[number] };
const VIEW_KEY = 'sallow-box-view';

const chip = (text: string, on: boolean, id: string, fn: () => void) => {
  const b = el('button', { class: 'rb-chip', type: 'button', 'aria-pressed': String(on), 'data-id': id }, text);
  b.addEventListener('click', fn);
  return b;
};

export const box: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  return {
    id: 'box',
    mount: (root, c: AppContext) => {
      ctx = c;
      const meta = sync(c, true).meta;
      let mode: 'view' | 'merge' | 'compare' = 'view';
      let picks: Pick[] = [];
      let confirming = false;
      let renaming = false;
      let other = -1;
      let note = '';
      let sort: Sort = 'slot';
      let filter = '';
      let pinnedOnly = false;
      try {
        const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as { sort?: string };
        if (SORTS.includes(v.sort as Sort)) sort = v.sort as Sort;
      } catch { /* storage blocked */ }

      const specOf = (e: BoxEntry) => c.universes.fromSerial(e.serialNumber);
      const isFav = (e: BoxEntry) => meta.fav.includes(e.serialNumber);
      const lastOf = (e: BoxEntry) => meta.last[String(e.serialNumber)] ?? 0;
      const thingOf = (p: Pick): Thing | null => {
        if ('piece' in p) return { kind: 'piece', piece: p.piece };
        const e = c.box.slots()[p.slot];
        return e ? { kind: 'universe', serialNumber: e.serialNumber } : null;
      };
      const pick = (p: Pick) => {
        const same = (q: Pick) => ('slot' in p && 'slot' in q && p.slot === q.slot);
        if (picks.some(same)) picks = picks.filter((q) => !same(q));
        else if ('piece' in p && picks.filter((q) => 'piece' in q && q.piece === p.piece).length >= c.sky.inventory()[p.piece]) picks = picks.filter((q) => !('piece' in q && q.piece === p.piece));
        else picks = [...picks, p].slice(-2);
        note = '';
        confirming = false;
        render();
      };
      const statsOf = (p: Pick | undefined) => (p && 'slot' in p ? c.box.slots()[p.slot]?.stats : undefined);
      const doMerge = () => {
        const [pa, pb] = picks as [Pick, Pick];
        const a = thingOf(pa), b = thingOf(pb);
        if (!a || !b) return;
        const res = c.merger.merge(a, b);
        const sa = statsOf(pa), sb = statsOf(pb);
        for (const p of picks) { if ('slot' in p) c.box.remove(p.slot); else c.sky.grant(p.piece, -1); }
        if (res.kind === 'piece') c.sky.grant(res.piece, res.count);
        else {
          const slot = c.box.add(res.spec.serialNumber);
          if (slot >= 0) { c.box.setStats(slot, c.merger.combineStats(sa ?? sb ?? EMPTY_STATS, sa ? sb : undefined)); c.box.select(slot); touch(res.spec.serialNumber); }
          c.selection.universe = null; c.selection.star = null; c.selection.system = null;
        }
        if (!c.box.slots()[c.box.selected()]) c.box.select(Math.max(0, c.box.slots().findIndex(Boolean)));
        note = res.says;
        picks = [];
        confirming = false;
        // A new universe is shown at once, on its own card.
        if (res.kind === 'universe') mode = 'view';
        Object.assign(meta, sync(c, true).meta);
        c.audio.sfx('merge');
        c.persist();
        render();
        flash(root);
        burst(root, root.getBoundingClientRect().width / 2, 300 + root.scrollTop, 18, true);
      };

      const statRows = (s: UniverseStats, e: BoxEntry): [string, string][] => [
        ['worlds tended', String(s.worldsTended)],
        ['deepest fold', String(s.deepestFold)],
        ['light from glow', String(s.lightFromGlow)],
        ['souls', String(s.souls ?? 0)],
        ['age', s.souls ? (ERAS[s.era ?? 0] ?? `era ${s.era}`) : 'none yet'],
        ['faith', !s.belief || s.belief === 'none' ? 'none' : s.belief],
        ['wonder', `${s.enlightenment ?? 0}`],
        ['thriving', `${s.prosperity ?? 0}`],
        ['in orbit', String(s.orbiters ?? 0)],
        ['last tended', ago(lastOf(e))],
      ];
      const order = (slots: readonly (BoxEntry | null)[]): number[] => {
        const idx = slots.map((_, i) => i);
        if (sort === 'slot') return idx;
        const key = (e: BoxEntry): number | string => (sort === 'name' ? names.of(specOf(e)).toLowerCase() : sort === 'souls' ? -(e.stats.souls ?? 0) : sort === 'depth' ? -e.stats.deepestFold : sort === 'tended' ? -lastOf(e) : isFav(e) ? 0 : 1);
        return idx.sort((a, b) => {
          const ea = slots[a], eb = slots[b];
          if (!ea || !eb) return ea ? -1 : eb ? 1 : a - b;
          const ka = key(ea), kb = key(eb);
          return ka < kb ? -1 : ka > kb ? 1 : a - b;
        });
      };
      const matches = (e: BoxEntry) => (!filter || specOf(e).laws.tags.includes(filter)) && (!pinnedOnly || isFav(e));

      const render = () => {
        const slots = c.box.slots();
        const sel = c.box.selected();
        const entry = slots[sel] ?? null;
        const spec = entry ? specOf(entry) : null;
        const keepScroll = root.scrollTop;
        const setMode = (m: typeof mode) => { mode = mode === m ? 'view' : m; picks = []; confirming = false; renaming = false; other = -1; note = ''; render(); };
        const tags = [...new Set(slots.flatMap((e) => (e ? specOf(e).laws.tags : [])))].sort();
        if (filter && !tags.includes(filter)) filter = '';
        const shown = slots.filter((e) => e && matches(e)).length;
        const kids: (HTMLElement | null)[] = [
          el('header', { class: 'row rb-head' }, backChip('ROOM', () => c.go('bedroom')),
            chip(mode === 'merge' ? 'MERGING' : 'MERGE', mode === 'merge', 'merge-mode', () => setMode('merge')),
            label(`${String(c.box.count()).padStart(2, '0')}/25`)),
          el('h1', { class: 'k-title' }, 'The Box'),
          el('div', { class: 'mote-card' }, el('span', { class: 'mote-dot' }), el('div', {}, el('div', { class: 'k-title small' }, 'Mote'), label('your light · never goes in the box'))),
          el('div', { class: 'rb-bar', 'data-id': 'box-bar' },
            chip(`SORT · ${sort.toUpperCase()}`, sort !== 'slot', 'sort', () => {
              sort = SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length]!;
              try { localStorage.setItem(VIEW_KEY, JSON.stringify({ sort })); } catch { /* storage blocked */ }
              render();
            }),
            chip('★ PINNED', pinnedOnly, 'filter-pinned', () => { pinnedOnly = !pinnedOnly; render(); }),
            ...tags.map((t) => chip(t, filter === t, `filter-${t.toLowerCase().replace(/\s+/g, '-')}`, () => { filter = filter === t ? '' : t; render(); })),
          ),
          el('div', { class: 'grid5 rb-grid', 'data-id': 'box-grid' }, ...order(slots).map((i) => {
            const s = slots[i] ?? null;
            const picked = mode === 'merge' ? picks.some((p) => 'slot' in p && p.slot === i) : mode === 'compare' ? i === sel || i === other : i === sel;
            const b = boxSlot(s ? glyphChar(specOf(s).glyph) : null, picked, () => {
              if (!s) return;
              if (mode === 'merge') pick({ slot: i });
              else if (mode === 'compare') { if (i !== sel) { other = other === i ? -1 : i; render(); } }
              else { c.box.select(i); c.persist(); renaming = false; note = ''; render(); }
            });
            b.dataset.slot = String(i);
            if (s) {
              b.setAttribute('aria-label', names.of(specOf(s)));
              if (isFav(s)) b.classList.add('rb-fav');
              if (!matches(s)) b.classList.add('rb-dim');
              if (mode === 'compare' && i === other) b.classList.add('rb-other');
            } else {
              // An empty slot is an invitation.
              b.disabled = false;
              b.setAttribute('aria-label', 'Empty slot');
              b.addEventListener('click', () => { note = 'An empty slot. Fall into a universe, find a flicker in the folds, and throw a reliquary at it. What you catch comes home to here.'; render(); });
            }
            return b;
          })),
          (filter || pinnedOnly) ? label(shown ? `${shown} shown · the rest are dimmed` : 'None match. The rest are dimmed.') : null,
        ];

        if (mode === 'merge') {
          const inv = c.sky.inventory();
          const a = picks[0] ? thingOf(picks[0]) : null, b = picks[1] ? thingOf(picks[1]) : null;
          const nameOf = (t: Thing | null) => (!t ? '…' : t.kind === 'piece' ? `a ${t.piece}` : names.of(c.universes.fromSerial(t.serialNumber)));
          const res = a && b ? c.merger.merge(a, b) : null;
          const sa = statsOf(picks[0]), sb = statsOf(picks[1]);
          const made = res?.kind === 'universe' ? c.merger.combineStats(sa ?? sb ?? EMPTY_STATS, sa ? sb : undefined) : null;
          const taken = res?.kind === 'universe' && c.box.slots().some((e) => e?.serialNumber === res.spec.serialNumber);
          kids.push(
            label('SKY PIECES · tap to add to the merge'),
            el('div', { class: 'row tray' }, ...SKY_PIECE_KINDS.map((k) => {
              const t = skyPieceTile(k, inv[k]);
              if (picks.some((p) => 'piece' in p && p.piece === k)) t.classList.add('picked');
              if (inv[k] > 0) t.addEventListener('click', () => pick({ piece: k }));
              return t;
            })),
            el('section', { class: 'detail', 'data-id': 'merge-card' },
              label(res ? 'THIS PAIR WILL MAKE' : 'MERGE · STEP 1 OF 2'),
              el('div', { class: 'rb-pair' },
                el('span', { class: a ? 'rb-thing on' : 'rb-thing' }, nameOf(a)), el('span', { class: 'rb-plus' }, '+'), el('span', { class: b ? 'rb-thing on' : 'rb-thing' }, nameOf(b))),
              !res ? narration(note || 'Pick any two things: universes, sky pieces, or one of each. Merging always makes something new, and both are spent.') : null,
              res?.kind === 'universe' ? el('div', { class: 'rb-preview', 'data-id': 'merge-preview' },
                el('span', { class: 'rb-glyph' }, glyphChar(res.spec.glyph)),
                el('div', { class: 'rb-col' },
                  el('div', { class: 'k-title small' }, res.spec.name),
                  label(`${res.spec.serial} · ${res.spec.laws.name}`),
                  el('div', { class: 'row start' }, ...res.spec.laws.tags.map(tag)))) : null,
              res?.kind === 'universe' ? narration(lawLine(res.spec)) : null,
              made ? label(`starts with · ${made.worldsTended} tended · fold ${made.deepestFold} · ${made.lightFromGlow} light`) : null,
              res?.kind === 'piece' ? el('div', { class: 'rb-preview', 'data-id': 'merge-preview' }, el('span', { class: 'rb-glyph' }, '×2'), el('div', { class: 'rb-col' }, el('div', { class: 'k-title small' }, `Two ${res.piece}s`), narration(res.says))) : null,
              taken ? narration('You already hold what this would make. Nothing would come of it.') : null,
              confirming && res
                ? el('div', { class: 'rb-col', 'data-id': 'merge-confirm' },
                  narration(`${nameOf(a)} and ${nameOf(b)} will be gone for good. This cannot be taken back.`),
                  el('div', { class: 'row nowrap' },
                    button('Not yet', () => { confirming = false; render(); }, { id: 'cancel-merge' }),
                    button('Yes, merge', doMerge, { id: 'confirm-merge' })))
                : button(res ? 'Merge these' : 'Merge', () => { confirming = true; render(); }, { primary: true, id: 'do-merge', disabled: !res || taken }),
            ),
          );
        } else if (mode === 'compare' && spec && entry) {
          const oe = other >= 0 ? slots[other] ?? null : null;
          const os = oe ? specOf(oe) : null;
          const ra = statRows(entry.stats, entry), rb = oe ? statRows(oe.stats, oe) : null;
          const head = (s: UniverseSpec | null) => el('div', { class: 'rb-col rb-side' },
            el('span', { class: 'rb-glyph' }, s ? glyphChar(s.glyph) : '?'),
            el('div', { class: 'k-title small' }, s ? names.of(s) : 'Pick another'),
            label(s ? s.laws.name : 'tap a slot above'));
          const num = (v: string) => (/^-?\d+$/.test(v) ? Number(v) : null);
          kids.push(el('section', { class: 'detail', 'data-id': 'compare-card' },
            el('div', { class: 'row' }, label('SIDE BY SIDE'), chip('DONE', false, 'compare-done', () => setMode('compare'))),
            el('div', { class: 'rb-vs' }, head(spec), head(os)),
            rb ? el('div', { class: 'rb-table' }, ...ra.flatMap(([k, va], i) => {
              const vb = rb[i]![1];
              const na = num(va), nb = num(vb);
              return [
                el('b', { class: na !== null && nb !== null && na > nb ? 'win' : undefined }, va),
                el('span', {}, k),
                el('b', { class: na !== null && nb !== null && nb > na ? 'win' : undefined }, vb),
              ];
            })) : narration('Choose a second universe from the grid to set beside this one.'),
            rb && os ? narration(os.laws.id === spec.laws.id ? 'They keep the same laws. They would understand each other.' : `${spec.laws.name} beside ${os.laws.name}. They would not agree on how a stone falls.`) : null,
          ));
        } else if (spec && entry) {
          const custom = names.of(spec) !== spec.name;
          const input = el('input', { class: 'rb-input', type: 'text', maxlength: 24, value: names.of(spec), 'data-id': 'rename-input', 'aria-label': 'Name' });
          const saveName = () => { names.set(spec.serialNumber, input.value === spec.name ? '' : input.value); renaming = false; note = ''; render(); };
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveName(); });
          kids.push(
            note ? el('div', { class: 'rb-note', 'data-id': 'box-note' }, narration(note)) : null,
            el('section', { class: 'detail', 'data-id': 'detail' },
              el('div', { class: 'rb-preview' },
                el('span', { class: 'rb-glyph' }, glyphChar(spec.glyph)),
                el('div', { class: 'rb-col' },
                  el('div', { class: 'k-title', 'data-id': 'uni-name' }, `${isFav(entry) ? '★ ' : ''}${names.of(spec)}`),
                  label(custom ? `${spec.serial} · once ${spec.name}` : spec.serial))),
              renaming ? el('div', { class: 'row nowrap rb-rename' }, input, button('Save', saveName, { id: 'rename-save' })) : null,
              el('div', { class: 'row start' }, ...spec.laws.tags.map(tag), label(spec.laws.name)),
              narration(lawLine(spec)),
              el('div', { class: 'row' }, stat(entry.stats.worldsTended, 'worlds tended').el, stat(entry.stats.deepestFold, 'deepest fold').el, stat(entry.stats.lightFromGlow, 'light from glow').el),
              el('div', { class: 'rb-facts' }, ...statRows(entry.stats, entry).slice(3).map(([k, v]) => el('span', {}, el('b', {}, v), ` ${k}`))),
              el('div', { class: 'row nowrap' },
                button('Enter', () => {
                  touch(spec.serialNumber);
                  c.selection.universe = spec;
                  c.selection.star = null;
                  c.selection.system = null;
                  c.go('dive');
                }, { primary: true, id: 'enter' }),
                button(`Worlds ${entry.stats.worldsTended}`, () => {
                  // Explore any universe straight away: open its home solar system.
                  touch(spec.serialNumber);
                  if (c.selection.universe?.serial !== spec.serial) { c.selection.star = null; c.selection.system = null; c.selection.planetIndex = 0; }
                  c.selection.universe = spec;
                  c.go('system');
                }, { id: 'worlds' }),
              ),
              el('div', { class: 'row nowrap rb-tools' },
                button(isFav(entry) ? '★ Pinned' : '☆ Pin', () => {
                  meta.fav = isFav(entry) ? meta.fav.filter((s) => s !== entry.serialNumber) : [...meta.fav, entry.serialNumber];
                  saveMeta(meta);
                  render();
                }, { id: 'fav' }),
                button('Rename', () => { renaming = !renaming; render(); if (renaming) root.querySelector<HTMLInputElement>('[data-id="rename-input"]')?.focus(); }, { id: 'rename' }),
                button('Compare', () => setMode('compare'), { id: 'compare', disabled: c.box.count() < 2 }),
              ),
            ),
          );
        } else if (note) kids.push(el('div', { class: 'rb-note', 'data-id': 'box-note' }, narration(note)));
        root.replaceChildren(...kids.filter((x): x is HTMLElement => !!x));
        root.scrollTop = keepScroll;
      };
      render();
    },
    frame: () => ctx?.gl.clear('#17140c'),
    unmount: () => void (ctx = null),
  };
};
