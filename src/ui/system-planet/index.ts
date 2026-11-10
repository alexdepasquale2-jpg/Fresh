// STUB: replace with the real Solar system and Planet screens (unit 23). See README.md.
import type { ScreenFactory, AppContext } from '@/contracts/app';
import type { StarRef } from '@/contracts/fold';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { child } from '@/core/hash';
import { el, backChip, label, button, skyPieceTile, stat, narration } from '@/ui/kit';

const ensureSystem = (c: AppContext) => {
  const u = c.selection.universe ?? c.universes.fromSerial(c.box.slots()[c.box.selected()]?.serialNumber ?? 0);
  c.selection.universe = u;
  if (!c.selection.star) {
    const address = c.fold.root(u);
    const star: StarRef = { address, seed: child(u.seed, 'fallback-star'), kind: 'main', heat: 128 };
    c.selection.star = star;
  }
  if (!c.selection.system) c.selection.system = c.systems.fromStar(c.selection.star, u);
  return { u, sys: c.selection.system };
};

const system: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  return {
    id: 'system',
    mount: (root, c) => {
      ctx = c;
      const { u, sys } = ensureSystem(c);
      const inv = c.sky.inventory();
      root.append(
        el('header', { class: 'row' }, backChip('DIVE', () => c.go('dive')), label(`${u.name} · FOLD ${sys.star.address.depth}`)),
        el('h1', { class: 'k-title' }, sys.name),
        el('div', { class: 'spacer' }),
        button('Watch the surface', () => c.go('planet'), { primary: true, id: 'watch' }),
        label('SKY PIECES'),
        el('div', { class: 'row tray' }, ...SKY_PIECE_KINDS.map((k) => skyPieceTile(k, inv[k]))),
      );
    },
    frame: (dt) => {
      if (!ctx?.selection.system || !ctx.selection.universe) return;
      ctx.renderers.system.draw({ universe: ctx.selection.universe, system: ctx.selection.system, skies: [], selectedOrbit: 0, drag: null, tick: ctx.clock.tick(), pulse: ctx.pulse().phase() }, dt);
    },
    unmount: () => void (ctx = null),
  };
};

const planet: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  return {
    id: 'planet',
    mount: (root, c) => {
      ctx = c;
      const { u, sys } = ensureSystem(c);
      const p = sys.planets[c.selection.planetIndex] ?? sys.planets[0]!;
      c.sim.open(u, p);
      root.append(
        el('header', { class: 'row' }, backChip('SKY', () => c.go('system')), label(`${p.name} · YEAR ${c.clock.year()}`)),
        el('div', { class: 'surface-slot' }),
        el('div', { class: 'row' }, stat(0, 'souls').el, stat(0, 'villages').el, stat(0, 'glow').el),
        label('THEIR CHRONICLE'),
        narration('Nothing has happened yet.'),
        button('Change their sky', () => c.go('system'), { primary: true, id: 'change-sky' }),
      );
    },
    frame: (dt) => {
      if (!ctx?.selection.universe) return;
      const f = ctx.sim.latest();
      if (f) ctx.renderers.planet.draw({ universe: ctx.selection.universe, grid: f.grid, civ: f.civ, pulse: ctx.pulse().phase() }, dt);
    },
    unmount: () => {
      ctx?.sim.close();
      ctx = null;
    },
  };
};

export const factory = () => ({ system, planet });
