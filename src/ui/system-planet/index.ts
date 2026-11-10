// Solar system and Planet screens (unit 23). The player only ever changes the sky.
import type { ScreenFactory, AppContext } from '@/contracts/app';
import type { StarRef } from '@/contracts/fold';
import type { SkyPieceKind } from '@/contracts/sky';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { child } from '@/core/hash';
import { el, backChip, label, button, skyPieceTile, stat, narration, tag } from '@/ui/kit';

const ensureSystem = (c: AppContext) => {
  const u = c.selection.universe ?? c.universes.fromSerial(c.box.slots()[c.box.selected()]?.serialNumber ?? 0);
  c.selection.universe = u;
  if (!c.selection.star) {
    const star: StarRef = { address: c.fold.root(u), seed: child(u.seed, 'home-star'), kind: 'main', heat: 128 };
    c.selection.star = star;
  }
  if (!c.selection.system) c.selection.system = c.systems.fromStar(c.selection.star, u);
  return { u, sys: c.selection.system };
};

const PLACE_FAIL: Record<string, string> = { 'none-left': 'None left.', 'sky-full': 'That sky is full.', 'bad-orbit': 'Drop it on an orbit.' };

const system: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let drag: { kind: SkyPieceKind; x: number; y: number; overOrbit: number } | null = null;
  return {
    id: 'system',
    mount: (root, c) => {
      ctx = c;
      const { u, sys } = ensureSystem(c);
      const card = el('section', { class: 'detail' });
      const tray = el('div', { class: 'row tray' });
      const note = narration('');
      const local = (e: PointerEvent) => {
        const r = c.gl.canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      const renderCard = () => {
        const p = sys.planets[c.selection.planetIndex] ?? sys.planets[0]!;
        const sky = c.sky.skyOf(p);
        const says = c.skyRules.explain(sky, p);
        card.replaceChildren(
          el('div', { class: 'row' }, el('div', { class: 'k-title' }, p.name), label(`ORBIT ${c.selection.planetIndex + 1}`)),
          el('div', { class: 'row start' }, ...(sky.pieces.length ? sky.pieces.map((k) => tag(k)) : [label('an empty sky')])),
          narration(says[says.length - 1] ?? 'Nothing moves their sky yet.'),
        );
        const inv = c.sky.inventory();
        tray.replaceChildren(...SKY_PIECE_KINDS.map((k) => {
          const t = skyPieceTile(k, inv[k]);
          t.addEventListener('pointerdown', (e) => {
            if (inv[k] <= 0) return;
            t.setPointerCapture(e.pointerId);
            drag = { kind: k, ...local(e), overOrbit: -1 };
          });
          t.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const at = local(e);
            drag = { ...drag, ...at, overOrbit: c.renderers.system.orbitAt(at.x, at.y) };
          });
          const end = () => {
            if (!drag) return;
            const d = drag;
            drag = null;
            if (d.overOrbit < 0) return;
            const res = c.sky.place(d.kind, sys, d.overOrbit);
            if (res.ok) {
              c.selection.planetIndex = d.overOrbit;
              c.bus.emit('sky:changed', { planetKey: res.sky.planetKey });
              c.persist();
              note.textContent = '';
            } else note.textContent = PLACE_FAIL[res.reason]!;
            renderCard();
          };
          t.addEventListener('pointerup', end);
          t.addEventListener('pointercancel', () => (drag = null));
          return t;
        }));
      };
      const field = el('div', { class: 'spacer', 'data-id': 'orbits' });
      field.addEventListener('pointerdown', (e) => {
        const at = local(e);
        const o = c.renderers.system.orbitAt(at.x, at.y);
        if (o >= 0) { c.selection.planetIndex = o; renderCard(); }
      });
      root.append(
        el('header', { class: 'row' }, backChip('DIVE', () => c.go('dive')), label(`${u.name} · FOLD ${sys.star.address.depth}`)),
        el('h1', { class: 'k-title' }, sys.name),
        field,
        card,
        note,
        button('Watch the surface', () => c.go('planet'), { primary: true, id: 'watch' }),
        label('SKY PIECES · drag onto an orbit'),
        tray,
      );
      renderCard();
    },
    frame: (dt) => {
      const s = ctx?.selection;
      if (!ctx || !s?.system || !s.universe) return;
      const skies = s.system.planets.map((p) => ctx!.sky.skyOf(p));
      ctx.renderers.system.draw({ universe: s.universe, system: s.system, skies, selectedOrbit: s.planetIndex, drag, tick: ctx.clock.tick(), pulse: ctx.pulse().phase() }, dt);
    },
    unmount: () => void (ctx = null),
  };
};

const planet: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let ui: { souls: ReturnType<typeof stat>; villages: ReturnType<typeof stat>; glow: ReturnType<typeof stat>; chron: HTMLElement; when: HTMLElement } | null = null;
  let lastTick = -1;
  return {
    id: 'planet',
    mount: (root, c) => {
      ctx = c;
      const { u, sys } = ensureSystem(c);
      const p = sys.planets[c.selection.planetIndex] ?? sys.planets[0]!;
      c.sim.open(u, p);
      c.box.recordTended(c.box.selected());
      c.persist();
      const sky = c.sky.skyOf(p);
      ui = { souls: stat(0, 'souls'), villages: stat(0, 'villages'), glow: stat(0, 'glow to you'), chron: el('ol', { class: 'chronicle' }), when: label('') };
      const speeds = el('div', { class: 'row nowrap' }, ...([0, 1, 3] as const).map((s) => {
        const b = button(s === 0 ? 'Pause' : `${s}x`, () => {
          c.clock.setSpeed(s);
          speeds.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        });
        b.setAttribute('aria-pressed', String(c.clock.speed() === s));
        return b;
      }));
      root.append(
        el('header', { class: 'row' }, backChip('SKY', () => c.go('system')), el('div', { class: 'col right' }, el('span', { class: 'k-title small' }, p.name), ui.when)),
        el('div', { class: 'surface-slot' }),
        el('div', { class: 'row start' }, label('THEIR SKY'), ...(sky.pieces.length ? sky.pieces.map((k) => tag(k)) : [label('empty')])),
        el('div', { class: 'row' }, ui.souls.el, ui.villages.el, ui.glow.el),
        label('THEIR CHRONICLE'),
        ui.chron,
        speeds,
        button('Change their sky', () => c.go('system'), { primary: true, id: 'change-sky' }),
      );
      lastTick = -1;
    },
    frame: (dt) => {
      if (!ctx?.selection.universe || !ui) return;
      const f = ctx.sim.latest();
      if (!f) return;
      ctx.renderers.planet.draw({ universe: ctx.selection.universe, grid: f.grid, civ: f.civ, pulse: ctx.pulse().phase() }, dt);
      if (f.tick === lastTick) return;
      lastTick = f.tick;
      ui.souls.update(f.civ.souls);
      ui.villages.update(f.civ.villages.length);
      ui.glow.update(f.civ.glowPerMinute);
      ui.when.textContent = `${ctx.clock.ageName()} · YEAR ${ctx.clock.year()}`;
      const items = f.chronicle.slice(0, 5).map((e) => el('li', {}, el('span', { class: 'k-label' }, `Y${e.year}`), ' ', narration(e.event), e.reason ? el('small', {}, e.reason) : null));
      if (!items.length) items.push(el('li', {}, narration('Nothing has happened yet. Watch.')));
      ui.chron.replaceChildren(...items);
    },
    unmount: () => {
      ctx?.sim.close();
      ctx = ui = null;
    },
  };
};

export const factory = () => ({ system, planet });
