// STUB: replace with the real Bedroom and Box screens (unit 21). See README.md.
import type { ScreenFactory, AppContext } from '@/contracts/app';
import { el, button, lightPips, narration, label, boxSlot, glyphChar, backChip, tag, stat } from '@/ui/kit';

const bedroom: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  return {
    id: 'bedroom',
    mount: (root, c) => {
      ctx = c;
      root.append(
        el('header', { class: 'row' }, lightPips(c.light.view().pips).el, label(`BOX ${String(c.box.count()).padStart(2, '0')}/25`)),
        el('div', { class: 'spacer' }),
        narration('The PC hums. Mote waits by the Box.'),
        button('Open the box', () => c.go('box'), { primary: true, id: 'open-box' }),
      );
    },
    frame: (dt) => ctx?.renderers.room.draw({ kid: { x: 195, y: 420 }, target: null, pulse: ctx.pulse().phase(), lightPips: ctx.light.view().pips }, dt),
    unmount: () => void (ctx = null),
  };
};

const box: ScreenFactory = () => ({
  id: 'box',
  mount: (root, c) => {
    const render = () => {
      root.replaceChildren();
      const slots = c.box.slots();
      const sel = c.box.selected();
      const entry = slots[sel];
      const spec = entry ? c.universes.fromSerial(entry.serialNumber) : null;
      root.append(...[
        el('header', { class: 'row' }, backChip('ROOM', () => c.go('bedroom')), label(`${String(c.box.count()).padStart(2, '0')}/25`)),
        el('h1', { class: 'k-title' }, 'The Box'),
        el('div', { class: 'grid5' }, ...slots.map((s, i) => boxSlot(s ? glyphChar(c.universes.fromSerial(s.serialNumber).glyph) : null, i === sel, () => (c.box.select(i), render())))),
        spec && entry
          ? el('section', { class: 'detail' },
              el('div', { class: 'k-title' }, spec.name),
              label(spec.serial),
              el('div', { class: 'row' }, ...spec.laws.tags.map(tag)),
              el('div', { class: 'row' }, stat(entry.stats.worldsTended, 'worlds tended').el, stat(entry.stats.deepestFold, 'deepest fold').el, stat(entry.stats.lightFromGlow, 'light from glow').el),
              button('Enter', () => {
                c.selection.universe = spec;
                c.go('dive');
              }, { primary: true, id: 'enter' }),
            )
          : null,
      ].filter((x): x is HTMLElement => x !== null));
    };
    render();
  },
  frame: () => {},
  unmount: () => {},
});

export const factory = () => ({ bedroom, box });
