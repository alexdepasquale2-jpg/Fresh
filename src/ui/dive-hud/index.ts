// Dive HUD (unit 22).
import type { ScreenFactory, AppContext } from '@/contracts/app';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { foldFrame, childAt } from '@/core/fold-layout';
import { seedToU32 } from '@/core/hash';
import { el, backChip, lightPips, label, narration, holdButton, burst } from '@/ui/kit';

const CAPTURE: Record<string, string> = {
  'no-reliquary': 'No reliquaries left.',
  'no-flicker': 'Nothing there to catch.',
  'box-full': 'The box is full.',
  duplicate: 'You already hold that one.',
};

const dive: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let ui: { fold: HTMLElement; bar: HTMLElement; best: HTMLElement; rel: HTMLElement; say: HTMLElement; pips: ReturnType<typeof lightPips> } | null = null;
  let message: { text: string; until: number } | null = null;
  let t = 0;
  let lastGrantDepth = 0;
  let leaving = false;
  let tickMs = 0;
  let lastDepth = 0;
  return {
    id: 'dive',
    mount: (root, c) => {
      ctx = c;
      leaving = false;
      const slot = c.box.selected();
      const u = c.selection.universe ?? c.universes.fromSerial(c.box.slots()[slot]?.serialNumber ?? 0);
      c.selection.universe = u;
      const best = c.box.slots()[slot]?.stats.deepestFold ?? 0;
      c.dive.start(u, best);
      lastGrantDepth = best;
      const hold = holdButton();
      hold.addEventListener('contextmenu', (e) => e.preventDefault());
      const down = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        hold.setPointerCapture(e.pointerId);
        c.dive.hold();
        hold.setAttribute('aria-pressed', 'true');
      };
      const up = () => {
        hold.setAttribute('aria-pressed', 'false');
        c.dive.release();
      };
      hold.addEventListener('pointerdown', down);
      hold.addEventListener('pointerup', up);
      hold.addEventListener('pointercancel', up);
      const field = el('div', { class: 'spacer', 'data-id': 'fold-field' });
      field.addEventListener('pointerdown', (e) => {
        const r = c.gl.canvas.getBoundingClientRect();
        const v = c.dive.view();
        const i = childAt(foldFrame(c.gl.width(), c.gl.height(), v.progress, v.aim), e.clientX - r.left, e.clientY - r.top);
        if (i < 0) return;
        if (!v.children[i]?.flicker) {
          c.dive.aim(i);
          message = { text: v.children[i]?.star ? 'Steering into a star. Fall into it to land.' : i === 0 ? 'Steering to the centre.' : 'Steering into that ring.', until: t + 1600 };
          return;
        }
        const res = c.dive.throwAt(i);
        message = { text: res.ok ? `Caught ${c.universes.fromSerial(res.serialNumber).name}. It is in the box.` : CAPTURE[res.reason]!, until: t + 2500 };
        c.audio.sfx(res.ok ? 'catch' : 'deny');
        if (res.ok) { c.persist(); burst(root, e.clientX - root.getBoundingClientRect().left, e.clientY - root.getBoundingClientRect().top, 14, true); }
      });
      const bar = el('i', { class: 'bar-fill' });
      const bestM = el('i', { class: 'bar-best' });
      ui = { fold: label('FOLD 0'), bar, best: bestM, rel: label('RELIQUARIES 3'), say: narration(''), pips: lightPips(c.light.view().pips) };
      root.append(
        el('header', { class: 'row' }, backChip('SURFACE', () => (c.dive.surface(), c.persist(), c.go('box'))), c.battle?.outcome === 'ongoing' ? backChip('BATTLE', () => (c.dive.surface(), c.go('battle'))) : null, ui.pips.el),
        el('div', { class: 'row' }, ui.fold, ui.rel),
        el('div', { class: 'depth-bar' }, bar, bestM),
        field,
        ui.say,
        el('div', { class: 'center' }, hold),
      );
    },
    frame: (dt) => {
      if (!ctx || !ui) return;
      t += dt;
      // Carry the remainder: at 60 fps a frame is ~17 ms, less than one 50 ms tick.
      tickMs += Math.min(dt, 250);
      const ticks = Math.floor(tickMs / 50);
      tickMs -= ticks * 50;
      if (ticks > 0) ctx.dive.update(ticks);
      const v = ctx.dive.view();
      const pips = ctx.light.view().pips;
      ui.pips.update(pips);
      ui.fold.textContent = `FOLD ${v.depth}`;
      if (v.depth !== lastDepth) { lastDepth = v.depth; ctx.audio.sfx('fold', Math.min(1, v.depth / 40)); try { navigator.vibrate?.(8); } catch { /* not allowed */ } }
      ui.rel.textContent = `RELIQUARIES ${v.reliquaries}`;
      const scale = Math.max(40, v.best + 5);
      ui.bar.style.width = `${(v.depth / scale) * 100}%`;
      ui.best.style.left = `${(v.best / scale) * 100}%`;
      // A new piece of sky every 8 folds past your best.
      if (v.depth >= lastGrantDepth + 8 && v.address) {
        lastGrantDepth = v.depth;
        const kind = SKY_PIECE_KINDS[seedToU32(v.address.pathHash) % SKY_PIECE_KINDS.length]!;
        ctx.sky.grant(kind, 1);
        ctx.audio.sfx('catch');
        message = { text: `Mote found a ${kind} in the fold.`, until: t + 2500 };
      }
      const say = message && message.until > t ? message.text : v.phase === 'falling' && v.children[v.aim]?.star ? 'Falling into a star…' : v.star && v.phase === 'falling' && v.progress < 500 ? 'A star nearby. Let go to stop, or tap it to fall in.' : v.narration;
      if (ui.say.textContent !== say) ui.say.textContent = say;
      ctx.renderers.dive.draw({ dive: v, pulse: ctx.pulse().phase(), lightPips: pips }, dt);
      if (!leaving && v.phase === 'stopped' && v.star) {
        leaving = true;
        ctx.audio.sfx('land');
        ctx.selection.star = v.star;
        ctx.selection.system = null;
        ctx.selection.planetIndex = 0;
        ctx.box.recordDepth(ctx.box.selected(), v.depth);
        ctx.persist();
        setTimeout(() => ctx?.go('system'), 500);
      } else if (!leaving && v.phase === 'surfaced') {
        leaving = true;
        ctx.persist();
        setTimeout(() => ctx?.go('box'), 1200);
        ui.say.textContent = 'You surface.';
      }
    },
    unmount: () => void (ctx = ui = null),
  };
};

export const factory = () => ({ dive });
