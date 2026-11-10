// Bedroom and Box screens (unit 21).
import type { ScreenFactory, AppContext } from '@/contracts/app';
import { el, button, lightPips, narration, label, boxSlot, glyphChar, backChip, tag, stat, skyPieceTile, burst, flash } from '@/ui/kit';
import type { Thing } from '@/contracts/merge';
import { SKY_PIECE_KINDS } from '@/contracts/sky';

const bedroom: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let target: { x: number; y: number } | null = null;
  let pips: ReturnType<typeof lightPips> | null = null;
  let onDown: ((e: PointerEvent) => void) | null = null;
  return {
    id: 'bedroom',
    mount: (root, c) => {
      ctx = c;
      pips = lightPips(c.light.view().pips);
      let muted = false;
      try { muted = localStorage.getItem('sallow-muted') === '1'; } catch { /* storage blocked */ }
      c.audio.setMuted(muted);
      const sound = el('button', { class: 'k-tag swap', type: 'button', 'data-id': 'sound' }, muted ? 'SOUND OFF' : 'SOUND ON');
      sound.addEventListener('click', () => {
        muted = !muted;
        c.audio.setMuted(muted);
        sound.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
        try { localStorage.setItem('sallow-muted', muted ? '1' : '0'); } catch { /* storage blocked */ }
      });
      const floor = el('div', { class: 'spacer floor', 'data-id': 'floor' });
      onDown = (e) => {
        const r = c.gl.canvas.getBoundingClientRect();
        target = { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      floor.addEventListener('pointerdown', onDown);
      root.append(
        el('header', { class: 'row' }, pips.el, sound, label(`BOX ${String(c.box.count()).padStart(2, '0')}/25`)),
        floor,
        narration(c.box.count() > 7 ? 'The box is heavier than it was.' : 'The PC hums. Mote waits by the box.'),
        button('Open the box', () => c.go('box'), { primary: true, id: 'open-box' }),
        button('Go outside', () => c.go('outside'), { id: 'go-outside' }),
        el('p', { class: 'k-label hint' }, 'Tap the floor to walk'),
      );
    },
    frame: (dt) => {
      if (!ctx) return;
      pips?.update(ctx.light.view().pips);
      ctx.renderers.room.draw({ kid: { x: ctx.gl.width() / 2, y: 400 }, target, pulse: ctx.pulse().phase(), lightPips: ctx.light.view().pips }, dt);
    },
    unmount: () => void (ctx = null),
  };
};

const box: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  return {
    id: 'box',
    mount: (root, c) => {
      ctx = c;
      let merging = false;
      // Things picked to merge: a Box slot or a sky piece.
      let picks: ({ slot: number } | { piece: (typeof SKY_PIECE_KINDS)[number] })[] = [];
      let lastSays = '';
      const thingOf = (p: (typeof picks)[number]): Thing | null => {
        if ('piece' in p) return { kind: 'piece', piece: p.piece };
        const e = c.box.slots()[p.slot];
        return e ? { kind: 'universe', serialNumber: e.serialNumber } : null;
      };
      const pick = (p: (typeof picks)[number]) => {
        const same = (q: (typeof picks)[number]) => ('slot' in p && 'slot' in q && p.slot === q.slot);
        if (picks.some(same)) picks = picks.filter((q) => !same(q));
        else if ('piece' in p && picks.filter((q) => 'piece' in q && q.piece === p.piece).length >= c.sky.inventory()[p.piece]) picks = picks.filter((q) => !('piece' in q && q.piece === p.piece));
        else picks = [...picks, p].slice(-2);
        lastSays = '';
        render();
      };
      const doMerge = () => {
        const [pa, pb] = picks as [(typeof picks)[number], (typeof picks)[number]];
        const a = thingOf(pa), b = thingOf(pb);
        if (!a || !b) return;
        const res = c.merger.merge(a, b);
        const slots = c.box.slots();
        const statsOf = (p: (typeof picks)[number]) => ('slot' in p ? slots[p.slot]?.stats : undefined);
        const sa = statsOf(pa), sb = statsOf(pb);
        for (const p of picks) { if ('slot' in p) c.box.remove(p.slot); else c.sky.grant(p.piece, -1); }
        if (res.kind === 'piece') c.sky.grant(res.piece, res.count);
        else {
          const slot = c.box.add(res.spec.serialNumber);
          if (slot >= 0) { c.box.setStats(slot, c.merger.combineStats(sa ?? sb ?? { worldsTended: 0, deepestFold: 0, lightFromGlow: 0 }, sa ? sb : undefined)); c.box.select(slot); }
          c.selection.universe = null; c.selection.star = null; c.selection.system = null;
        }
        if (!c.box.slots()[c.box.selected()]) c.box.select(Math.max(0, c.box.slots().findIndex(Boolean)));
        lastSays = res.says;
        picks = [];
        c.audio.sfx('merge');
        c.persist();
        render();
        flash(root);
        const r = root.getBoundingClientRect();
        burst(root, r.width / 2, 300, 18, true);
      };
      const render = () => {
        const slots = c.box.slots();
        const sel = c.box.selected();
        const entry = slots[sel];
        const spec = entry ? c.universes.fromSerial(entry.serialNumber) : null;
        const kids: (HTMLElement | null)[] = [
          el('header', { class: 'row' }, backChip('ROOM', () => c.go('bedroom')), (() => {
            const m = el('button', { class: 'k-tag swap', type: 'button', 'aria-pressed': String(merging), 'data-id': 'merge-mode' }, merging ? 'MERGING' : 'MERGE');
            m.addEventListener('click', () => { merging = !merging; picks = []; lastSays = ''; render(); });
            return m;
          })(), label(`${String(c.box.count()).padStart(2, '0')}/25`)),
          el('h1', { class: 'k-title' }, 'The Box'),
          el('div', { class: 'mote-card' }, el('span', { class: 'mote-dot' }), el('div', {}, el('div', { class: 'k-title small' }, 'Mote'), label('your light · never goes in the box'))),
          el('div', { class: 'grid5' }, ...slots.map((s, i) => boxSlot(s ? glyphChar(c.universes.fromSerial(s.serialNumber).glyph) : null, merging ? picks.some((p) => 'slot' in p && p.slot === i) : i === sel, () => (merging ? pick({ slot: i }) : (c.box.select(i), c.persist(), render()))))),
        ];
        if (merging) {
          const inv = c.sky.inventory();
          const a = picks[0] ? thingOf(picks[0]) : null, b = picks[1] ? thingOf(picks[1]) : null;
          const nameOf = (t: Thing | null) => (!t ? '…' : t.kind === 'piece' ? `a ${t.piece}` : c.universes.fromSerial(t.serialNumber).name);
          const res = a && b ? c.merger.merge(a, b) : null;
          kids.push(
            label('SKY PIECES · tap to add to the merge'),
            el('div', { class: 'row tray' }, ...SKY_PIECE_KINDS.map((k) => {
              const t = skyPieceTile(k, inv[k]);
              const n = picks.filter((p) => 'piece' in p && p.piece === k).length;
              if (n) t.classList.add('picked');
              if (inv[k] > 0) t.addEventListener('click', () => pick({ piece: k }));
              return t;
            })),
            el('section', { class: 'detail' },
              el('div', { class: 'k-title small' }, `${nameOf(a)} + ${nameOf(b)}`),
              narration(lastSays || (res ? (res.kind === 'piece' ? `Makes two ${res.piece}s. ${res.says}` : `Makes ${res.spec.name} (${res.spec.laws.name}). Both are spent.`) : 'Pick any two things: universes, sky pieces, or one of each. Merging always makes something new.')),
              res && res.kind === 'universe' ? el('div', { class: 'row start' }, ...res.spec.laws.tags.map(tag), label(res.spec.serial)) : null,
              button('Merge', doMerge, { primary: true, id: 'do-merge', disabled: !res }),
            ),
          );
          root.replaceChildren(...kids.filter((x): x is HTMLElement => !!x));
          return;
        }
        if (spec && entry) {
          kids.push(
            el('section', { class: 'detail' },
              el('div', { class: 'k-title' }, spec.name),
              label(spec.serial),
              el('div', { class: 'row start' }, ...spec.laws.tags.map(tag)),
              el('div', { class: 'row' }, stat(entry.stats.worldsTended, 'worlds tended').el, stat(entry.stats.deepestFold, 'deepest fold').el, stat(entry.stats.lightFromGlow, 'light from glow').el),
              el('div', { class: 'row nowrap' },
                button('Enter', () => {
                  c.selection.universe = spec;
                  c.selection.star = null;
                  c.selection.system = null;
                  c.go('dive');
                }, { primary: true, id: 'enter' }),
                button(`Worlds ${entry.stats.worldsTended}`, () => {
                  // Explore any universe straight away: open its home solar system.
                  if (c.selection.universe?.serial !== spec.serial) { c.selection.star = null; c.selection.system = null; c.selection.planetIndex = 0; }
                  c.selection.universe = spec;
                  c.go('system');
                }, { id: 'worlds' }),
              ),
            ),
          );
        }
        root.replaceChildren(...kids.filter((x): x is HTMLElement => !!x));
      };
      render();
    },
    frame: () => ctx?.gl.clear('#17140c'),
    unmount: () => void (ctx = null),
  };
};

export const factory = () => ({ bedroom, box });
