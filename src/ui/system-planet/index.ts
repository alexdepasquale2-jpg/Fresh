// Solar system and Planet screens (unit 23). The player only ever changes the sky.
import type { ScreenFactory, AppContext } from '@/contracts/app';
import type { StarRef } from '@/contracts/fold';
import type { SkyPieceKind, CosmicEvent } from '@/contracts/sky';
import { seedToHex } from '@/core/hash';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { child } from '@/core/hash';
import { el, backChip, label, button, skyPieceTile, stat, narration, tag, burst, shake, flash } from '@/ui/kit';
import type { Tool, BodyAction } from '@/contracts/sim';
import { GRID_W, GRID_H } from '@/contracts/sim';

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

// Cosmic tools: act on whole worlds from the solar system.
type Cosmic = 'pieces' | 'pull' | 'push' | 'flare' | CosmicEvent;
const COSMIC: { mode: Cosmic; label: string; hint: string }[] = [
  { mode: 'pieces', label: 'Pieces', hint: 'Drag sky pieces onto an orbit.' },
  { mode: 'pull', label: 'Pull in', hint: 'Tap an orbit to draw that world nearer its star. Hotter, harsher years.' },
  { mode: 'push', label: 'Push out', hint: 'Tap an orbit to push that world out. Colder and dimmer.' },
  { mode: 'flare', label: 'Flare', hint: 'Tap anywhere. The star flares and every world in the system burns a little.' },
  { mode: 'shower', label: 'Shower', hint: 'Tap an orbit to send a meteor shower down on that world.' },
  { mode: 'comet-strike', label: 'Comet', hint: 'Tap an orbit to throw a comet straight at that world.' },
  { mode: 'eclipse', label: 'Eclipse', hint: 'Tap an orbit to darken that world for a season.' },
  { mode: 'panspermia', label: 'Seed life', hint: 'Tap an orbit to scatter life onto that world.' },
];
const COSMIC_SAYS: Record<string, string> = {
  pull: 'You pull it closer. Its star fills more of their sky.', push: 'You push it out. Their sun shrinks.',
  flare: 'The star flares. Every world here will remember it.', shower: 'Stones are on their way down.',
  'comet-strike': 'A comet turns toward them.', eclipse: 'Their sun will go dark.', panspermia: 'Seeds of life drift down to them.',
};

const PLACE_FAIL: Record<string, string> = { 'none-left': 'None left.', 'sky-full': 'That sky is full.', 'bad-orbit': 'Drop it on an orbit.' };

const system: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let drag: { kind: SkyPieceKind; x: number; y: number; overOrbit: number } | null = null;
  let cosmic: Cosmic = 'pieces';
  let flare = 0;
  let touch: { x: number; y: number; age: number } | null = null;
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
        card.replaceChildren(...[
          el('div', { class: 'row' }, el('div', { class: 'k-title' }, p.name), label(`ORBIT ${c.selection.planetIndex + 1}`)),
          el('div', { class: 'row start' }, ...(sky.pieces.length ? sky.pieces.map((k) => tag(k)) : [label('an empty sky')])),
          narration(says[says.length - 1] ?? 'Nothing moves their sky yet.'),
          (sky.drift ?? 0) !== 0 || sky.queued?.length ? label(`${sky.drift ? `ORBIT ${sky.drift < 0 ? 'PULLED IN' : 'PUSHED OUT'} ${Math.abs(sky.drift)}` : ''}${sky.drift && sky.queued?.length ? ' · ' : ''}${sky.queued?.length ? `${sky.queued.length} COMING` : ''}`) : null,
        ].filter((x): x is HTMLElement => x !== null));
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
            c.audio.sfx(res.ok ? 'place' : 'deny');
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
      const keyOf = (o: number) => seedToHex(sys.planets[sys.orbits[o]!.planet]!.seed);
      field.addEventListener('pointerdown', (e) => {
        const at = local(e);
        touch = { ...at, age: 0 };
        const o = c.renderers.system.orbitAt(at.x, at.y);
        if (cosmic === 'flare') {
          flare = 1;
          c.audio.sfx('flare');
          flash(root);
          for (let i = 0; i < sys.orbits.length; i++) c.sky.queue(keyOf(i), 'flare');
          note.textContent = COSMIC_SAYS.flare!;
          c.persist();
          renderCard();
          return;
        }
        if (o < 0) { if (cosmic !== 'pieces') note.textContent = 'Tap an orbit.'; return; }
        c.selection.planetIndex = o;
        if (cosmic === 'pull' || cosmic === 'push') {
          const sky = c.sky.nudge(keyOf(o), cosmic === 'pull' ? -1 : 1);
          c.audio.sfx(cosmic);
          note.textContent = (sky.drift ?? 0) === (cosmic === 'pull' ? -3 : 3) ? 'It will not go any further.' : COSMIC_SAYS[cosmic]!;
          c.bus.emit('sky:changed', { planetKey: keyOf(o) });
        } else if (cosmic !== 'pieces') {
          c.sky.queue(keyOf(o), cosmic);
          c.audio.sfx(cosmic);
          burst(root, at.x - (root.getBoundingClientRect().left - c.gl.canvas.getBoundingClientRect().left), at.y, 10, true);
          note.textContent = `${COSMIC_SAYS[cosmic]} Watch the surface to see it land.`;
        }
        c.persist();
        renderCard();
      });
      const hint = el('p', { class: 'k-label tool-hint' }, COSMIC[0]!.hint);
      const cosmicRow = el('div', { class: 'tools' }, ...COSMIC.map((t) => {
        const b = el('button', { class: 'k-tag tool', type: 'button', 'aria-pressed': String(t.mode === cosmic), 'data-id': `cosmic-${t.mode}` }, t.label);
        b.addEventListener('click', () => {
          cosmic = t.mode;
          hint.textContent = t.hint;
          cosmicRow.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        });
        return b;
      }));
      root.append(
        el('header', { class: 'row' }, backChip('DIVE', () => c.go('dive')), c.battle?.outcome === 'ongoing' ? backChip('BATTLE', () => c.go('battle')) : null, label(`${u.name} · FOLD ${sys.star.address.depth}`)),
        el('h1', { class: 'k-title' }, sys.name),
        field,
        cosmicRow,
        hint,
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
      flare = Math.max(0, flare - dt / 1500);
      if (touch) { touch = { ...touch, age: touch.age + dt / 700 }; if (touch.age >= 1) touch = null; }
      ctx.renderers.system.draw({ universe: s.universe, system: s.system, skies, selectedOrbit: s.planetIndex, drag, tick: ctx.clock.tick(), pulse: ctx.pulse().phase(), flare, touch }, dt);
    },
    unmount: () => void (ctx = null),
  };
};

// God tools. Paint tools drag; strike tools fire once per tap. 'body' takes a body; 'watch' does nothing.
type Mode = Tool | 'watch' | 'body';
const TOOLS: { mode: Mode; label: string; r: number; paint: boolean; hint: string }[] = [
  { mode: 'watch', label: 'Watch', r: 0, paint: false, hint: 'Only watch. Drag to look around; pinch or + to zoom in close.' },
  { mode: 'body', label: 'Body', r: 0, paint: false, hint: 'Tap to take a body there. Tap again to walk. Zoom all the way in to see through its eyes. Unless they are enlightened, they will try to kill you.' },
  { mode: 'bless', label: 'Bless', r: 0, paint: false, hint: 'Fill their stores, ease their hearts, bring them closer to understanding.' },
  { mode: 'whisper', label: 'Whisper', r: 0, paint: false, hint: 'Speak to the nearest village. They will look up.' },
  { mode: 'sow', label: 'Sow', r: 0, paint: false, hint: 'Set a new people down.' },
  { mode: 'smite', label: 'Smite', r: 0, paint: false, hint: 'Death from nowhere. Everyone will fear you.' },
  { mode: 'merge', label: 'Merge', r: 0, paint: false, hint: 'Tap between two villages. They become one new people, with a new faith if theirs differed.' },
  { mode: 'water', label: 'Water', r: 4, paint: true, hint: 'Pour water.' },
  { mode: 'sand', label: 'Sand', r: 4, paint: true, hint: 'Pour sand.' },
  { mode: 'stone', label: 'Stone', r: 3, paint: true, hint: 'Raise stone.' },
  { mode: 'seed', label: 'Seed', r: 5, paint: true, hint: 'Make green grow.' },
  { mode: 'erase', label: 'Erase', r: 4, paint: true, hint: 'Take part of the world away.' },
  { mode: 'fire', label: 'Fire', r: 3, paint: true, hint: 'Set fire.' },
  { mode: 'freeze', label: 'Freeze', r: 6, paint: true, hint: 'Freeze water, put out fire.' },
  { mode: 'heat', label: 'Heat', r: 10, paint: true, hint: 'Warm the air.' },
  { mode: 'cold', label: 'Cold', r: 10, paint: true, hint: 'Chill the air.' },
  { mode: 'rain', label: 'Rain', r: 16, paint: false, hint: 'Gather clouds.' },
  { mode: 'lightning', label: 'Bolt', r: 1, paint: false, hint: 'Call lightning.' },
  { mode: 'meteor', label: 'Meteor', r: 8, paint: false, hint: 'Throw down a star.' },
  { mode: 'quake', label: 'Quake', r: 8, paint: false, hint: 'Split the ground.' },
];

const BIG = new Set<string>(['meteor', 'quake', 'lightning', 'smite', 'merge']);
const SEASON = ['spring', 'summer', 'autumn', 'winter'];
const tempWord = (t: number) => (t < 96 ? 'freezing' : t < 112 ? 'cold' : t < 145 ? 'mild' : t < 185 ? 'warm' : t < 215 ? 'hot' : 'burning');
const timeWord = (d: number) => (d < 200 || d > 800 ? 'night' : d < 300 ? 'dawn' : d < 700 ? 'day' : 'dusk');
const ERA_NAMES = ['huts', 'fire', 'iron', 'lamps', 'bells', 'star-reaching'];

const planet: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let ui: {
    souls: ReturnType<typeof stat>; villages: ReturnType<typeof stat>; glow: ReturnType<typeof stat>;
    chron: HTMLElement; when: HTMLElement; weather: HTMLElement; vlist: HTMLElement; slot: HTMLElement; era: HTMLElement;
    hint: HTMLElement; body: HTMLElement;
  } | null = null;
  let mode: (typeof TOOLS)[number] = TOOLS[0]!;
  const view: { cx: number; cy: number; zoom: number; fp: { x: number; z: number; yaw: number; pitch: number; bob: number } | null } = { cx: GRID_W / 2, cy: GRID_H / 2, zoom: 1, fp: null };
  let walking = false;
  let stride = 0;
  const zoomLabel = el('span', { class: 'k-label zoom-label' }, '1×');
  let lastPaint = 0;
  let lastBolt = 9999;
  let bodyRow: HTMLElement | null = null;
  let lastHp = 100;
  let walkSent = 0;
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
      // Cosmic events thrown from the solar system land now.
      const landed = c.sky.takeQueued(seedToHex(p.seed));
      for (const ev of landed) {
        const xs = [30, 80, 130, 180, 210];
        if (ev === 'flare') { for (const x of xs) c.sim.tool('heat', x, 60, 24); for (const x of [50, 150]) c.sim.tool('fire', x, 90, 3); }
        else if (ev === 'shower') for (const x of [40, 95, 120, 170, 200]) c.sim.tool('meteor', x, 0, 6);
        else if (ev === 'comet-strike') { c.sim.tool('meteor', 118, 0, 16); c.sim.tool('rain', 118, 0, 30); }
        else if (ev === 'eclipse') for (const x of xs) c.sim.tool('cold', x, 60, 24);
        else if (ev === 'panspermia') { for (const x of xs) c.sim.tool('seed', x, 100, 8); c.sim.tool('sow', 70, 0, 0); c.sim.tool('sow', 170, 0, 0); }
      }
      c.box.recordTended(c.box.selected());
      c.persist();
      const sky = c.sky.skyOf(p);
      ui = {
        souls: stat(0, 'souls'), villages: stat(0, 'villages'), glow: stat(0, 'glow to you'),
        chron: el('ol', { class: 'chronicle' }), when: label(''), weather: label(''), vlist: el('div', { class: 'vlist' }),
        slot: el('div', { class: 'surface-slot big touchable', 'data-id': 'surface' }), era: label('ERA HUTS'),
        hint: el('p', { class: 'k-label tool-hint' }, TOOLS[0]!.hint), body: label(''),
      };
      mode = TOOLS[0]!;
      const slotEl = ui.slot;
      // Touch the world.
      view.cx = GRID_W / 2; view.cy = GRID_H / 2; view.zoom = 1; view.fp = null; walking = false; zoomLabel.textContent = '1×';
      const clampView = () => {
        view.zoom = Math.max(1, Math.min(6, view.zoom));
        const hx = GRID_W / (2 * view.zoom), hy = GRID_H / (2 * view.zoom);
        view.cx = Math.max(hx, Math.min(GRID_W - hx, view.cx));
        view.cy = Math.max(hy, Math.min(GRID_H - hy, view.cy));
        zoomLabel.textContent = view.fp ? 'WALK' : view.zoom < 1.05 ? '1×' : `${view.zoom.toFixed(1)}×`;
      };
      /** Screen point (px inside the slot) to world cell, through the camera. */
      const toGrid = (px: number, py: number) => {
        const r = slotEl.getBoundingClientRect();
        return { gx: view.cx + (px / r.width - 0.5) * (GRID_W / view.zoom), gy: view.cy + (py / r.height - 0.5) * (GRID_H / view.zoom) };
      };
      /** Zoom by a factor, keeping the world point under (px, py) fixed. */
      const zoomAt = (factor: number, px: number, py: number) => {
        const r = slotEl.getBoundingClientRect();
        if (view.fp) {
          // Zooming out of first person rises back to the map.
          if (factor < 0.97) { leaveBody(); c.audio.sfx('nav'); }
          return;
        }
        if (factor > 1.03 && view.zoom >= 5.9) {
          // Zooming in past the map drops you onto the ground, in first person.
          enterBody();
          return;
        }
        const before = toGrid(px, py);
        view.zoom = Math.max(1, Math.min(6, view.zoom * factor));
        c.audio.sfx('zoom', view.zoom / 6);
        view.cx = before.gx - (px / r.width - 0.5) * (GRID_W / view.zoom);
        view.cy = before.gy - (py / r.height - 0.5) * (GRID_H / view.zoom);
        clampView();
      };
      // First person is the body's eyes: no body, no eyes.
      const enterBody = () => {
        const av = c.sim.latest()?.civ.avatar;
        if (!av) {
          ui!.hint.textContent = 'You can only stand on their world in a body. Choose Body, tap the ground, then zoom in (or press Eyes).';
          c.audio.sfx('deny');
          return;
        }
        // Open your eyes facing the nearest village.
        const vs = c.sim.latest()!.civ.villages;
        const nearest = [...vs].sort((p, q) => Math.abs(p.x - av.x) - Math.abs(q.x - av.x))[0];
        const faceLeft = nearest ? nearest.x < av.x : av.x > GRID_W / 2;
        view.fp = { x: av.x, z: 2.5, yaw: (faceLeft ? Math.PI : 0) - 0.12, pitch: -0.05, bob: 0 };
        walkBtn.hidden = false;
        ui!.hint.textContent = 'You see through your body. Drag to look, hold WALK to move, use the body actions below. − leaves your eyes.';
        c.audio.sfx('land');
        clampView();
      };
      const leaveBody = () => { if (!view.fp) return; view.cx = view.fp.x; view.zoom = 4.5; view.fp = null; walking = false; walkBtn.hidden = true; clampView(); };
      const gridAt = (e: PointerEvent) => {
        const r = slotEl.getBoundingClientRect();
        if (!c.sim.latest()) return null;
        const px = e.clientX - r.left, py = e.clientY - r.top;
        if (view.fp) {
          const f = c.sim.latest()!;
          const reach = 10 + (0.5 - py / r.height) * 14;
          const gx = Math.max(1, Math.min(GRID_W - 2, Math.round(view.fp.x + Math.cos(view.fp.yaw + (px / r.width - 0.5) * 1.2) * reach)));
          let gy = 0;
          while (gy < GRID_H - 1 && (f.grid.cells[gy * GRID_W + gx] === 0 || f.grid.cells[gy * GRID_W + gx] === 5)) gy++;
          return { gx, gy: gy - 1, px, py };
        }
        return { ...toGrid(px, py), px, py };
      };
      const ripple = (px: number, py: number, big: boolean) => {
        const d = el('i', { class: `ripple${big ? ' big' : ''}`, style: `left:${px}px;top:${py}px` });
        slotEl.append(d);
        setTimeout(() => d.remove(), 700);
      };
      const use = (e: PointerEvent, first: boolean) => {
        const at = gridAt(e);
        if (!at || mode.mode === 'watch') return;
        if (mode.mode === 'body') {
          if (!first) return;
          const f = c.sim.latest();
          if (f?.civ.avatar) c.sim.walk(at.gx); else { c.sim.incarnate(at.gx); c.audio.sfx('body'); burst(slotEl, at.px, at.py, 12, true); }
          ripple(at.px, at.py, false);
          return;
        }
        if (!mode.paint && !first) return;
        const now = performance.now();
        if (!first && now - lastPaint < 60) return;
        lastPaint = now;
        c.sim.tool(mode.mode, at.gx, at.gy, mode.r);
        ripple(at.px, at.py, !mode.paint);
        c.audio.sfx(mode.mode);
        if (!mode.paint) burst(slotEl, at.px, at.py, 10, BIG.has(mode.mode));
        if (BIG.has(mode.mode)) { shake(slotEl, true); if (mode.mode === 'lightning' || mode.mode === 'smite') flash(slotEl); }
      };
      // One finger: paint, tap a tool, or (in Watch) drag to pan. Two fingers: pinch to zoom and pan.
      const pts = new Map<number, { x: number; y: number }>();
      let pinched = false;
      let moved = 0;
      let pinch = { dist: 1, mx: 0, my: 0 };
      const local = (e: PointerEvent) => { const r = slotEl.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      const two = () => { const [a, b] = [...pts.values()] as [{ x: number; y: number }, { x: number; y: number }]; return { dist: Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
      slotEl.addEventListener('pointerdown', (e) => {
        slotEl.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, local(e));
        if (pts.size === 2) { pinched = true; pinch = two(); }
        else if (pts.size === 1) { pinched = false; moved = 0; if (mode.paint && !view.fp) use(e, true); }
      });
      slotEl.addEventListener('pointermove', (e) => {
        const prev = pts.get(e.pointerId);
        if (!prev) return;
        const now = local(e);
        pts.set(e.pointerId, now);
        const r = slotEl.getBoundingClientRect();
        if (pts.size >= 2) {
          const t = two();
          zoomAt(t.dist / pinch.dist, t.mx, t.my);
          view.cx -= ((t.mx - pinch.mx) / r.width) * (GRID_W / view.zoom);
          view.cy -= ((t.my - pinch.my) / r.height) * (GRID_H / view.zoom);
          clampView();
          pinch = t;
        } else if (!pinched && view.fp) {
          moved += Math.abs(now.x - prev.x) + Math.abs(now.y - prev.y);
          view.fp.yaw += (now.x - prev.x) * 0.007;
          view.fp.pitch = Math.max(-0.7, Math.min(0.7, view.fp.pitch - (now.y - prev.y) * 0.005));
        } else if (!pinched) {
          moved += Math.abs(now.x - prev.x) + Math.abs(now.y - prev.y);
          if (mode.mode === 'watch') {
            view.cx -= ((now.x - prev.x) / r.width) * (GRID_W / view.zoom);
            view.cy -= ((now.y - prev.y) / r.height) * (GRID_H / view.zoom);
            clampView();
          } else if (mode.paint) use(e, false);
        }
      });
      const stop = (e: PointerEvent) => {
        // Strike tools and Body fire on release, so a pinch never throws a meteor by accident.
        if (e.type === 'pointerup' && pts.size === 1 && !pinched && (!mode.paint || view.fp) && moved < 14) use(e, true);
        pts.delete(e.pointerId);
      };
      slotEl.addEventListener('pointerup', stop);
      slotEl.addEventListener('pointercancel', stop);
      slotEl.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e as unknown as PointerEvent); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, p.x, p.y); }, { passive: false });
      const zoomBtn = (text: string, factor: number, id: string) => {
        const b = el('button', { class: 'k-btn zoom-btn', type: 'button', 'data-id': id }, text);
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        b.addEventListener('click', () => { const r = slotEl.getBoundingClientRect(); zoomAt(factor, r.width / 2, r.height / 2); });
        return b;
      };
      const walkBtn = el('button', { class: 'k-btn walk-btn', type: 'button', 'data-id': 'walk', hidden: true }, 'WALK');
      walkBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); walkBtn.setPointerCapture(e.pointerId); walking = true; });
      const walkStop = (e: Event) => { e.stopPropagation(); walking = false; };
      walkBtn.addEventListener('pointerup', walkStop);
      walkBtn.addEventListener('pointercancel', walkStop);
      walkBtn.addEventListener('contextmenu', (e) => e.preventDefault());
      slotEl.append(walkBtn);
      slotEl.append(el('div', { class: 'zoom-ctl' }, zoomBtn('−', 1 / 1.6, 'zoom-out'), zoomLabel, zoomBtn('+', 1.6, 'zoom-in')));
      const palette = el('div', { class: 'tools' }, ...TOOLS.map((t) => {
        const b = el('button', { class: 'k-tag tool', type: 'button', 'aria-pressed': String(t === mode), 'data-id': `tool-${t.mode}` }, t.label);
        b.addEventListener('click', () => {
          mode = t;
          ui!.hint.textContent = t.hint;
          palette.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        });
        return b;
      }));
      const ascend = button('Ascend', () => { leaveBody(); c.sim.ascend(); c.audio.sfx('nav'); }, { id: 'ascend' });
      const ACTS: { a: BodyAction; label: string; sfx: string; hint: string }[] = [
        { a: 'strike', label: 'Strike', sfx: 'crit', hint: 'Fell the two nearest attackers. The rest run, and the village fears you more.' },
        { a: 'preach', label: 'Preach', sfx: 'whisper', hint: 'Speak. Those near sit and listen, and understanding grows.' },
        { a: 'gift', label: 'Gift', sfx: 'bless', hint: 'Give of your own body: food and joy for the nearest village.' },
        { a: 'shine', label: 'Shine', sfx: 'flare', hint: 'Show your light. The wise kneel; the rest flee.' },
        { a: 'rest', label: 'Rest', sfx: 'heal', hint: 'Mend yourself, if no one is striking you.' },
      ];
      bodyRow = el('div', { class: 'tools body-row', hidden: true },
        (() => { const b = el('button', { class: 'k-tag tool', type: 'button', 'data-id': 'eyes' }, 'Eyes'); b.addEventListener('click', () => (view.fp ? leaveBody() : enterBody())); return b; })(),
        ...ACTS.map((t) => {
          const b = el('button', { class: 'k-tag tool', type: 'button', 'data-id': `act-${t.a}` }, t.label);
          b.addEventListener('click', () => {
            c.sim.act(t.a);
            c.audio.sfx(t.sfx);
            ui!.hint.textContent = t.hint;
            const r = slotEl.getBoundingClientRect();
            burst(slotEl, r.width / 2, r.height * 0.6, t.a === 'rest' ? 6 : 12, t.a === 'shine' || t.a === 'strike');
            if (t.a === 'strike') shake(slotEl);
            if (t.a === 'shine') flash(slotEl);
          });
          return b;
        }));
      const speeds = el('div', { class: 'row nowrap' }, ...([0, 1, 3] as const).map((s) => {
        const b = button(s === 0 ? 'Pause' : `${s}x`, () => {
          c.clock.setSpeed(s);
          speeds.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        });
        b.setAttribute('aria-pressed', String(c.clock.speed() === s));
        return b;
      }));
      root.append(
        el('header', { class: 'row' }, backChip('SKY', () => c.go('system')), c.battle?.outcome === 'ongoing' ? backChip('BATTLE', () => c.go('battle')) : null, el('div', { class: 'col right' }, el('span', { class: 'k-title small' }, p.name), ui.when)),
        ui.slot,
        palette,
        el('div', { class: 'row nowrap tool-row' }, ui.hint, ui.body, ascend),
        bodyRow,
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
      if (view.fp) {
        const p = view.fp;
        const av0 = ctx.sim.latest()?.civ.avatar;
        if (!av0) {
          // The body died (or was given up): you are thrown back into the sky.
          view.cx = p.x; view.zoom = 4.5; view.fp = null; walking = false;
          ui.slot.querySelector<HTMLElement>('[data-id=walk]')!.hidden = true;
          zoomLabel.textContent = `${view.zoom.toFixed(1)}×`;
          ui.hint.textContent = 'Your body is gone. You are back above them.';
          flash(ui.slot); shake(ui.slot, true); ctx.audio.sfx('lose');
        } else p.x = av0.x;
        walkSent += dt;
        if (walking && av0) {
          const sp = (dt / 1000) * 6;
          const dir = Math.cos(p.yaw);
          // The body walks along the world; you may also drift a little to either side of it.
          if (walkSent > 120) { walkSent = 0; ctx.sim.walk(Math.abs(dir) > 0.25 ? av0.x + Math.sign(dir) * 4 : av0.x); }
          p.z = Math.max(-12, Math.min(12, p.z + Math.sin(p.yaw) * sp));
          stride += dt;
          if (stride > 330) { stride = 0; ctx.audio.sfx('step'); }
          p.bob = Math.sin(stride / 330 * Math.PI) * 0.12;
        } else { p.bob *= 0.8; if (av0 && walkSent > 200 && walkSent < 1e8) { walkSent = 1e9; ctx.sim.walk(av0.x); } }
      }
      const cr = ctx.gl.canvas.getBoundingClientRect();
      const sr = ui.slot.getBoundingClientRect();
      const sky = ctx.sky.skyOf(planetSpec);
      ctx.renderers.planet.draw({
        universe: ctx.selection.universe, grid: f.grid, civ: f.civ, env: f.env, sky,
        modifiers: ctx.skyRules.effects(sky, planetSpec), pulse: ctx.pulse().phase(),
        rect: { x: sr.left - cr.left, y: sr.top - cr.top, w: sr.width, h: sr.height },
        view,
      }, dt);
      if (f.tick === lastTick) return;
      lastTick = f.tick;
      const e = f.env;
      if (e.lightning < lastBolt) { ctx.audio.sfx('lightning'); flash(ui.slot); }
      lastBolt = e.lightning;
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
      const av = f.civ.avatar;
      ui.body.textContent = av ? `BODY ${av.hp} HP${av.attackers ? ` · ${av.attackers} ATTACKING` : ''}${av.worshippers ? ` · ${av.worshippers} KNEEL` : ''}` : '';
      (ui.body.nextElementSibling as HTMLElement | null)?.toggleAttribute('hidden', !av);
      bodyRow?.toggleAttribute('hidden', !av);
      if (av && av.hp < lastHp) { shake(ui.slot); ui.slot.classList.add('hurt'); setTimeout(() => ui?.slot.classList.remove('hurt'), 250); ctx.audio.sfx('strike'); }
      lastHp = av ? av.hp : 100;
      ui.vlist.replaceChildren(...f.civ.villages.slice(0, 4).map((v) => el('div', { class: 'vrow' },
        el('span', { class: 'k-narration' }, ctx!.names.village(child(planetSpec!.seed, v.id + 1))),
        label(`${v.souls} souls · ${v.belief === 'none' ? 'no faith' : v.belief} · ${ERA_NAMES[v.tech]}${v.enlightenment >= 100 ? ' · enlightened' : v.enlightenment >= 50 ? ' · wondering' : ''} · ${v.food > 300 ? 'fed' : v.food > 60 ? 'lean' : 'hungry'}${v.mood < -30 ? ' · restless' : v.mood > 50 ? ' · joyful' : ''}`),
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
