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

const SEASON = ['spring', 'summer', 'autumn', 'winter'];
const tempWord = (t: number) => (t < 96 ? 'freezing' : t < 112 ? 'cold' : t < 145 ? 'mild' : t < 185 ? 'warm' : t < 215 ? 'hot' : 'burning');
const timeWord = (d: number) => (d < 200 || d > 800 ? 'night' : d < 300 ? 'dawn' : d < 700 ? 'day' : 'dusk');
const ERA_NAMES = ['huts', 'fire', 'iron', 'lamps', 'bells', 'star-reaching'];

const planet: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let ui: {
    souls: ReturnType<typeof stat>; villages: ReturnType<typeof stat>; glow: ReturnType<typeof stat>;
    chron: HTMLElement; when: HTMLElement; weather: HTMLElement; vlist: HTMLElement; slot: HTMLElement; era: HTMLElement;
  } | null = null;
  let lastTick = -1;
  let planetSpec: import('@/contracts/system').PlanetSpec | null = null;
  return {
    id: 'planet',
    mount: (root, c) => {
      ctx = c;
      const { u, sys } = ensureSystem(c);
      const p = sys.planets[c.selection.planetIndex] ?? sys.planets[0]!;
      planetSpec = p;
      c.sim.open(u, p);
      c.box.recordTended(c.box.selected());
      c.persist();
      const sky = c.sky.skyOf(p);
      ui = {
        souls: stat(0, 'souls'), villages: stat(0, 'villages'), glow: stat(0, 'glow to you'),
        chron: el('ol', { class: 'chronicle' }), when: label(''), weather: label(''), vlist: el('div', { class: 'vlist' }),
        slot: el('div', { class: 'surface-slot big' }), era: label('ERA HUTS'),
      };
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
        ui.slot,
        el('div', { class: 'row' }, ui.weather, ui.era),
        el('div', { class: 'row start' }, label('THEIR SKY'), ...(sky.pieces.length ? sky.pieces.map((k) => tag(k)) : [label('empty')])),
        el('div', { class: 'row' }, ui.souls.el, ui.villages.el, ui.glow.el),
        ui.vlist,
        label('THEIR CHRONICLE'),
        ui.chron,
        speeds,
        button('Change their sky', () => c.go('system'), { primary: true, id: 'change-sky' }),
      );
      lastTick = -1;
    },
    frame: (dt) => {
      if (!ctx?.selection.universe || !ui || !planetSpec) return;
      const f = ctx.sim.latest();
      if (!f) return;
      const cr = ctx.gl.canvas.getBoundingClientRect();
      const sr = ui.slot.getBoundingClientRect();
      const sky = ctx.sky.skyOf(planetSpec);
      ctx.renderers.planet.draw({
        universe: ctx.selection.universe, grid: f.grid, civ: f.civ, env: f.env, sky,
        modifiers: ctx.skyRules.effects(sky, planetSpec), pulse: ctx.pulse().phase(),
        rect: { x: sr.left - cr.left, y: sr.top - cr.top, w: sr.width, h: sr.height },
      }, dt);
      if (f.tick === lastTick) return;
      lastTick = f.tick;
      const e = f.env;
      ui.souls.update(f.civ.souls);
      ui.villages.update(f.civ.villages.length);
      ui.glow.update(f.civ.glowPerMinute);
      ui.when.textContent = `${ctx.clock.ageName()} · YEAR ${ctx.clock.year()}`;
      let tsum = 0;
      for (let i = 0; i < e.temp.length; i++) tsum += e.temp[i]!;
      const t = tsum / e.temp.length;
      const wx = e.lightning < 40 ? 'storm' : e.rain > 30 ? (e.snowing ? 'snow' : 'rain') : Math.abs(e.wind) > 50 ? 'wind' : 'clear';
      ui.weather.textContent = `${SEASON[Math.floor(e.season / 250)]} ${timeWord(e.day)} · ${tempWord(t)} · ${wx}`.toUpperCase();
      ui.era.textContent = `ERA ${ERA_NAMES[f.civ.era] ?? ''}`.toUpperCase();
      ui.vlist.replaceChildren(...f.civ.villages.slice(0, 4).map((v) => el('div', { class: 'vrow' },
        el('span', { class: 'k-narration' }, ctx!.names.village(child(planetSpec!.seed, v.id + 1))),
        label(`${v.souls} souls · ${v.belief === 'none' ? 'no faith' : v.belief} · ${ERA_NAMES[v.tech]} · ${v.food > 300 ? 'fed' : v.food > 60 ? 'lean' : 'hungry'}${v.mood < -30 ? ' · restless' : v.mood > 50 ? ' · joyful' : ''}`),
      )));
      const items = f.chronicle.slice(0, 8).map((en) => el('li', {}, el('span', { class: 'k-label' }, `Y${en.year}`), ' ', narration(en.event), en.reason ? el('small', {}, en.reason) : null));
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
