// STUB: replace with the real Dive HUD (unit 22). See README.md.
import type { ScreenFactory, AppContext } from '@/contracts/app';
import { el, backChip, lightPips, label, narration, holdButton } from '@/ui/kit';

const dive: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let fold: HTMLElement | null = null;
  return {
    id: 'dive',
    mount: (root, c) => {
      ctx = c;
      const u = c.selection.universe ?? c.universes.fromSerial(c.box.slots()[c.box.selected()]?.serialNumber ?? 0);
      c.selection.universe = u;
      c.dive.start(u, 0);
      fold = label('FOLD 0');
      const hold = holdButton();
      hold.addEventListener('pointerdown', () => (c.dive.hold(), hold.setAttribute('aria-pressed', 'true')));
      const up = () => {
        hold.setAttribute('aria-pressed', 'false');
        c.dive.release();
        const v = c.dive.view();
        if (v.phase === 'stopped' && v.star) {
          c.selection.star = v.star;
          c.go('system');
        }
      };
      hold.addEventListener('pointerup', up);
      hold.addEventListener('pointercancel', up);
      root.append(
        el('header', { class: 'row' }, backChip('SURFACE', () => (c.dive.surface(), c.go('box'))), lightPips(c.light.view().pips).el),
        el('div', { class: 'row' }, fold, label('RELIQUARIES 3')),
        el('div', { class: 'spacer' }),
        narration(c.dive.view().narration),
        el('div', { class: 'center' }, hold),
      );
    },
    frame: (dt) => {
      if (!ctx) return;
      ctx.dive.update(1);
      const v = ctx.dive.view();
      if (fold) fold.textContent = `FOLD ${v.depth}`;
      ctx.renderers.dive.draw({ dive: v, pulse: ctx.pulse().phase(), lightPips: ctx.light.view().pips }, dt);
    },
    unmount: () => void (ctx = fold = null),
  };
};

export const factory = () => ({ dive });
