// Bedroom and Box screens (unit 21).
import type { ScreenFactory, AppContext } from '@/contracts/app';
import { el, button, lightPips, narration, label, boxSlot, glyphChar, backChip, tag, stat } from '@/ui/kit';

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
      const floor = el('div', { class: 'spacer floor', 'data-id': 'floor' });
      onDown = (e) => {
        const r = c.gl.canvas.getBoundingClientRect();
        target = { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      floor.addEventListener('pointerdown', onDown);
      root.append(
        el('header', { class: 'row' }, pips.el, label(`BOX ${String(c.box.count()).padStart(2, '0')}/25`)),
        floor,
        narration(c.box.count() > 7 ? 'The box is heavier than it was.' : 'The PC hums. Mote waits by the box.'),
        button('Open the box', () => c.go('box'), { primary: true, id: 'open-box' }),
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
      const render = () => {
        const slots = c.box.slots();
        const sel = c.box.selected();
        const entry = slots[sel];
        const spec = entry ? c.universes.fromSerial(entry.serialNumber) : null;
        const kids: HTMLElement[] = [
          el('header', { class: 'row' }, backChip('ROOM', () => c.go('bedroom')), label(`${String(c.box.count()).padStart(2, '0')}/25`)),
          el('h1', { class: 'k-title' }, 'The Box'),
          el('div', { class: 'mote-card' }, el('span', { class: 'mote-dot' }), el('div', {}, el('div', { class: 'k-title small' }, 'Mote'), label('your light · never goes in the box'))),
          el('div', { class: 'grid5' }, ...slots.map((s, i) => boxSlot(s ? glyphChar(c.universes.fromSerial(s.serialNumber).glyph) : null, i === sel, () => (c.box.select(i), c.persist(), render())))),
        ];
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
                button(`Worlds ${entry.stats.worldsTended}`, () => c.selection.system && c.selection.universe?.serial === spec.serial && c.go('system'), { id: 'worlds', disabled: !(c.selection.system && c.selection.universe?.serial === spec.serial) }),
              ),
            ),
          );
        }
        root.replaceChildren(...kids);
      };
      render();
    },
    frame: () => ctx?.gl.clear('#17140c'),
    unmount: () => void (ctx = null),
  };
};

export const factory = () => ({ bedroom, box });
