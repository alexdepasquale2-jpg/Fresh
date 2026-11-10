// The Planet screen: the surface on top, one line of chronicle, time, then six tabs of controls.
// The tabs are pages of one scroller, so every control stays in the DOM with a real box: a tab only scrolls its page into view.
import type { ScreenFactory, AppContext } from '@/contracts/app';
import type { SkyPieceKind, Heavens } from '@/contracts/sky';
import type { PlanetSpec } from '@/contracts/system';
import type { BodyAction, BodyOption, ChronicleEntry, Village, Tool } from '@/contracts/sim';
import { SKY_PIECE_KINDS, SKY_MAX_PIECES } from '@/contracts/sky';
import { GRID_W, GRID_H, PERSON_STRIDE } from '@/contracts/sim';
import { el, backChip, label, button, stat, narration, burst, shake, flash } from '@/ui/kit';
import { ensureSystem, keyOf, villageName, seenOf, setSeen } from './shared';
import type { Seen } from './shared';
import { TOOLS, GROUPS, BRUSH, applyTool } from './tools';
import type { ToolDef } from './tools';
import './body.css';

// Zoom layers. The first three are the map; the next seven are the close layers before a body's eyes.
const LAYERS: [number, string, string][] = [
  [1, 'World', 'The whole slice of their world.'],
  [3, 'Land', 'Hills, seas and weather.'],
  [6, 'Valley', 'Villages as clusters of roofs.'],
  [8, 'Village', 'Doors, chimney smoke, boats, fields and markets.'],
  [11, 'Street', 'Bricks and shingles, goods on the stalls, sparks from the forge.'],
  [15, 'Yard', 'Window panes, lanterns, rails, tools in their hands.'],
  [20, 'Doorstep', 'Faces, planks, crates. You can see who does what.'],
  [26, 'Workbench', 'Hair and belts, pebbles, the grain of stone.'],
  [32, 'Hands', 'As close as the sky can come.'],
  [40, 'Threshold', 'One more step needs a body.'],
];
const layerOf = (zoom: number) => { let i = 0; for (let k = 0; k < LAYERS.length; k++) if (zoom >= LAYERS[k]![0] - 0.05) i = k; return i; };
const MAX_ZOOM = 40;
const SEASON = ['spring', 'summer', 'autumn', 'winter'];
const tempWord = (t: number) => (t < 96 ? 'freezing' : t < 112 ? 'cold' : t < 145 ? 'mild' : t < 185 ? 'warm' : t < 215 ? 'hot' : 'burning');
const timeWord = (d: number) => (d < 200 || d > 800 ? 'night' : d < 300 ? 'dawn' : d < 700 ? 'day' : 'dusk');
const ERA_NAMES = ['huts', 'fire', 'iron', 'lamps', 'bells', 'star-reaching'];
const moodWord = (m: number) => (m < -60 ? 'furious' : m < -30 ? 'restless' : m < 20 ? 'quiet' : m < 55 ? 'content' : 'joyful');
const mindWord = (e: number) => (e >= 100 ? 'they know you' : e >= 50 ? 'wondering' : e >= 20 ? 'uneasy' : 'afraid of the sky');

const TABS = ['watch', 'tools', 'body', 'sky', 'people', 'chronicle'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { watch: 'Watch', tools: 'Tools', body: 'Body', sky: 'Sky', people: 'People', chronicle: 'Chronicle' };

// Chronicle kinds. An entry that carries a kind is filed by it; the words are only read for one that does not.
const KINDS: readonly { id: string; label: string; re: RegExp }[] = [
  { id: 'all', label: 'All', re: /./ },
  { id: 'lives', label: 'Lives', re: /made a home|is named|came of age|did not wake|no one answers|last fire|door of their own|elder|long road|families left|walkers|more lamps|first lamp|born|died|passed|found|grow|split|die|migrate/i },
  { id: 'wars', label: 'Wars', re: /blood between|threw stones|with stones|spears|struck|marched|war between|raid|tribute|raised their hands|death fell|drove at|feud|attack|slain|smit/i },
  { id: 'faith', label: 'Faith', re: /pray|creed|faith|heretic|shrine|knelt|looked up and knew|omen|priests|keepers|callers|readers|tenders|watchers|festival|listen|heard it speak|warmth|convert|worship|enlighten|bless|preach/i },
  { id: 'works', label: 'Works', re: /built|the work of|traders|forge|market|boats|fields|seam|light rose|lamp burning|tech|trade|launch/i },
  { id: 'sky', label: 'Sky', re: /sky|storm|clouds|froze|frost|ice|thaw|wildfire|waters|water rose|moss|lightning|stone fell|ground|trembled|fire ran|sun|moon|comet|flood|drought|quake|impact/i },
];
const FILE: Record<string, string> = {};
for (const [id, list] of Object.entries({
  lives: 'found grow split die migrate born deed passed refugees resettled recovered crowned fell famine plague plagueEnd wedding quiet',
  wars: 'feud attack slain struck smitten rivalry raid war peace tribute razed absorbed',
  faith: 'convert festival preached omen worship enlightened blessed creed schism heresy exile holy sign light stranger gift',
  works: 'tech built traded launch song wonder school invention ark voyage pact alliance merged',
  sky: 'impact flood drought freeze thaw fire storm bloom blight ore lightning quake flooded frozen burn',
})) for (const k of list.split(' ')) FILE[k] = id;
const BODY_FILE: Record<string, string> = { creed: 'faith', 'creed-spread': 'faith', 'creed-schism': 'faith', vigil: 'faith', challenge: 'faith', 'challenge-lost': 'faith', side: 'faith', bless: 'faith', curse: 'faith', peace: 'wars', refused: 'wars', incite: 'wars', stand: 'wars', 'stand-fell': 'wars', hunt: 'wars', tribute: 'wars', 'tribute-kept': 'wars', fled: 'wars', work: 'works', trade: 'works', teach: 'works', deliver: 'works' };
/** Does this entry belong under that filter? */
const filed = (en: ChronicleEntry, k: { id: string; re: RegExp }): boolean => {
  if (k.id === 'all') return true;
  const home = en.kind === 'body' ? BODY_FILE[en.deed ?? ''] ?? 'lives' : en.kind ? FILE[en.kind] : undefined;
  return home ? home === k.id : k.re.test(en.event);
};

interface Named { id: number; name: string; calling: string; villageId: number }
/** Any other named people a newer CivView may carry. Read by shape; nothing here is assumed to exist. */
const namedPeople = (civ: unknown, skipId: number | undefined): Named[] => {
  const out: Named[] = [];
  const c = civ as Record<string, unknown>;
  for (const k of ['notables', 'named', 'figures', 'heroes', 'elders', 'persons']) {
    const list = c[k];
    if (!Array.isArray(list)) continue;
    for (const raw of list.slice(0, 12)) {
      const p = raw as { personId?: unknown; id?: unknown; name?: unknown; calling?: unknown; role?: unknown; villageId?: unknown } | null;
      if (!p || typeof p.name !== 'string') continue;
      const id = typeof p.personId === 'number' ? p.personId : typeof p.id === 'number' ? p.id : -1;
      if (id === skipId || out.some((o) => o.name === p.name)) continue;
      out.push({ id, name: p.name, calling: typeof p.calling === 'string' ? p.calling : typeof p.role === 'string' ? p.role : '', villageId: typeof p.villageId === 'number' ? p.villageId : -1 });
    }
  }
  return out;
};

type Target = { kind: 'village'; id: number; name: string } | { kind: 'person'; id: number; name: string };

export const planet: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let planetSpec: PlanetSpec | null = null;
  let mode: ToolDef = TOOLS[0]!;
  let brush = 1;
  const view: { cx: number; cy: number; zoom: number; fp: { x: number; z: number; yaw: number; pitch: number; bob: number } | null } = { cx: GRID_W / 2, cy: GRID_H / 2, zoom: 1, fp: null };
  let walking = false, stride = 0, walkSent = 0;
  let lastBolt = 9999, lastLayer = 0, zoomGoal = 0, lastHp = 100, lastTick = -1;
  let lastFrame: unknown = null;
  let settle = false;
  let heavens: Heavens | null = null;
  let skyKey = '';
  let focus: Target | null = null;
  let follow = false;
  let nFollow = 0;
  let photo = false;
  let filter = 'all';
  let prevSeen: Seen | null = null;
  let later: { t: number; fn: () => void }[] = [];
  /** Things mount() builds and frame() needs. */
  let m: {
    slot: HTMLElement; hint: HTMLElement; did: HTMLElement; when: HTMLElement; zoomLabel: HTMLElement; rail: HTMLElement; walkBtn: HTMLElement;
    souls: ReturnType<typeof stat>; villages: ReturnType<typeof stat>; glow: ReturnType<typeof stat>;
    tick: (dt: number) => void; onTick: () => void; renderSky: () => void; skyKeyNow: () => string;
  } | null = null;

  return {
    id: 'planet',
    mount: (root, c) => {
      ctx = c;
      const { u, sys } = ensureSystem(c);
      if (c.selection.planetIndex < 0 || c.selection.planetIndex >= sys.planets.length) c.selection.planetIndex = 0;
      const p = sys.planets[c.selection.planetIndex]!;
      planetSpec = p;
      const pKey = keyOf(p);
      // A world already open (the box dreamed it while you were away) is kept as it stands.
      if (!c.sim.isOpen(u, p)) c.sim.open(u, p);
      // Cosmic events thrown from the solar system land now.
      const landed = c.sky.takeQueued(pKey);
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
      mode = TOOLS[0]!; brush = 1; focus = null; follow = false; nFollow = 0; photo = false; filter = 'all'; later = [];
      prevSeen = seenOf(pKey);
      view.cx = GRID_W / 2; view.cy = GRID_H / 2; view.zoom = 1; view.fp = null; walking = false;
      lastTick = -1; lastLayer = 0; zoomGoal = 0; lastHp = 100; lastBolt = 9999;
      const vname = (id: number) => villageName(c, p, id);

      /* ---------- the surface and what floats over it ---------- */
      const slotEl = el('div', { class: 'surface-slot big touchable', 'data-id': 'surface' });
      const hint = el('p', { class: 'k-label tool-hint pl-hint', 'data-id': 'hint' }, TOOLS[0]!.hint);
      const did = el('p', { class: 'k-narration pl-did', 'data-id': 'did' }, 'Nothing has been touched.');
      const zoomLabel = el('span', { class: 'k-label zoom-label' }, 'WORLD');
      const rail = el('div', { class: 'layer-rail' }, ...LAYERS.map((_, k) => el('i', { class: k === 0 ? 'on' : '' })));
      const setLayer = (li: number) => {
        lastLayer = li;
        c.audio.sfx('zoom', li / LAYERS.length);
        hint.textContent = `${LAYERS[li]![1]}: ${LAYERS[li]![2]}`;
        rail.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k <= li));
      };
      const clampView = () => {
        view.zoom = Math.max(1, Math.min(MAX_ZOOM, view.zoom));
        const li = layerOf(view.zoom);
        if (li !== lastLayer && !view.fp) setLayer(li);
        const hx = GRID_W / (2 * view.zoom), hy = GRID_H / (2 * view.zoom);
        view.cx = Math.max(hx, Math.min(GRID_W - hx, view.cx));
        view.cy = Math.max(hy, Math.min(GRID_H - hy, view.cy));
        zoomLabel.textContent = view.fp ? 'EYES' : LAYERS[layerOf(view.zoom)]![1].toUpperCase();
      };
      /** Screen point (px inside the slot) to world cell, through the camera. */
      const toGrid = (px: number, py: number) => {
        const r = slotEl.getBoundingClientRect();
        return { gx: view.cx + (px / r.width - 0.5) * (GRID_W / view.zoom), gy: view.cy + (py / r.height - 0.5) * (GRID_H / view.zoom) };
      };
      const solidAt = (x: number, y: number) => { const v = c.sim.latest()?.grid.cells[y * GRID_W + x]; return v !== undefined && v !== 0 && v !== 5; };
      const ground = (x: number) => {
        const gx = Math.max(0, Math.min(GRID_W - 1, Math.round(x)));
        let gy = 0;
        while (gy < GRID_H - 1 && !solidAt(gx, gy)) gy++;
        return gy;
      };
      /** Zoom by a factor, keeping the world point under (px, py) fixed. */
      const zoomAt = (factor: number, px: number, py: number) => {
        const r = slotEl.getBoundingClientRect();
        if (view.fp) {
          // Zooming out of first person rises back to the map.
          if (factor < 0.97) { leaveBody(); c.audio.sfx('zoom-out'); }
          return;
        }
        if (factor > 1.03 && view.zoom >= MAX_ZOOM - 0.1) { enterBody(); return; }
        zoomGoal = 0;
        const before = toGrid(px, py);
        view.zoom = Math.max(1, Math.min(MAX_ZOOM, view.zoom * factor));
        view.cx = before.gx - (px / r.width - 0.5) * (GRID_W / view.zoom);
        view.cy = before.gy - (py / r.height - 0.5) * (GRID_H / view.zoom);
        clampView();
      };
      // First person is the body's eyes: no body, no eyes.
      const enterBody = () => {
        const av = c.sim.latest()?.civ.avatar;
        if (!av) {
          hint.textContent = 'You can only stand on their world in a body. Choose Take a body, tap the ground, then press Eyes.';
          c.audio.sfx('deny');
          return;
        }
        // Open your eyes facing the nearest village.
        const vs = c.sim.latest()!.civ.villages;
        const nearest = [...vs].sort((a, b) => Math.abs(a.x - av.x) - Math.abs(b.x - av.x))[0];
        const faceLeft = nearest ? nearest.x < av.x : av.x > GRID_W / 2;
        view.fp = { x: av.x, z: 2.5, yaw: (faceLeft ? Math.PI : 0) - 0.12, pitch: -0.05, bob: 0 };
        walkBtn.hidden = false;
        compass.hidden = false;
        slotEl.classList.add('fp');
        hint.textContent = 'You see through your body. Drag to look, hold WALK to move. The marks above point to the nearest village and to the one they name.';
        c.audio.sfx('land');
        clampView();
      };
      const leaveBody = () => {
        if (!view.fp) return;
        view.cx = view.fp.x; view.zoom = 20; view.fp = null; walking = false; walkBtn.hidden = true; compass.hidden = true;
        slotEl.classList.remove('fp');
        clampView();
      };
      const gridAt = (px: number, py: number) => {
        const r = slotEl.getBoundingClientRect();
        if (!c.sim.latest()) return null;
        if (view.fp) {
          const reach = 10 + (0.5 - py / r.height) * 14;
          const gx = Math.max(1, Math.min(GRID_W - 2, Math.round(view.fp.x + Math.cos(view.fp.yaw + (px / r.width - 0.5) * 1.2) * reach)));
          return { gx, gy: ground(gx) - 1 };
        }
        return toGrid(px, py);
      };
      const ripple = (px: number, py: number, big: boolean) => {
        const d = el('i', { class: `ripple${big ? ' big' : ''}`, style: `left:${px}px;top:${py}px` });
        slotEl.append(d);
        setTimeout(() => d.remove(), 700);
      };
      const nearestVillage = (x: number): Village | null => {
        const vs = c.sim.latest()?.civ.villages ?? [];
        let best: Village | null = null;
        for (const v of vs) if (!best || Math.abs(v.x - x) < Math.abs(best.x - x)) best = v;
        return best;
      };
      // What just happened, in one line. There is no undo; the line says so by being plain about it.
      let didKey = '', didN = 0;
      const say = (def: ToolDef, gx: number) => {
        const v = nearestVillage(gx);
        const d = v ? Math.abs(v.x - gx) : 999;
        const where = !v ? 'on an empty world' : d < 14 ? `on ${vname(v.id)}` : d < 45 ? `near ${vname(v.id)}` : 'far from anyone';
        const key = `${def.mode}|${where}`;
        didN = key === didKey ? didN + 1 : 1;
        didKey = key;
        did.textContent = `${def.did} ${where}${didN > 1 ? `, ${didN} times` : ''}. ${v && d < 60 ? 'They saw it.' : 'No one saw.'}`;
      };
      let lastPaint = 0;
      const toolEnv = {
        tool: (t: Tool, x: number, y: number, r: number) => c.sim.tool(t, x, y, r),
        later: (ms: number, fn: () => void) => void later.push({ t: ms, fn }),
        ground,
        get wind() { return c.sim.latest()?.env.wind ?? 0; },
      };
      const use = (px: number, py: number, first: boolean) => {
        const at = gridAt(px, py);
        if (!at || mode.mode === 'watch') return;
        if (mode.mode === 'body') {
          if (!first) return;
          const f = c.sim.latest();
          if (f?.civ.avatar) { c.sim.walk(at.gx); c.audio.sfx('step'); did.textContent = 'Your body walks.'; }
          else { c.sim.incarnate(at.gx); c.audio.sfx('body'); burst(slotEl, px, py, 12, true); did.textContent = 'You took a body. They can see you now.'; openTab('body'); }
          ripple(px, py, false);
          return;
        }
        if (!mode.paint && !first) return;
        const now = performance.now();
        if (!first && now - lastPaint < 60) return;
        lastPaint = now;
        applyTool(mode, at.gx, at.gy, brush, toolEnv);
        ripple(px, py, !mode.paint);
        c.audio.sfx(mode.sfx);
        if (!mode.paint) burst(slotEl, px, py, 10, !!mode.big);
        if (mode.big) { shake(slotEl, true); if (mode.mode === 'lightning' || mode.mode === 'smite' || mode.mode === 'tempest') flash(slotEl); }
        say(mode, at.gx);
      };
      /** Move the camera to a column and lean in to at least `zoom`. */
      const flyTo = (x: number, zoom = 8): boolean => {
        if (view.fp) { hint.textContent = 'Leave your eyes (−) to look from above.'; c.audio.sfx('deny'); return false; }
        if (photo) setPhoto(false);
        view.cx = x + 0.5;
        if (view.zoom < zoom) zoomGoal = zoom;
        clampView();
        c.audio.sfx('nav');
        return true;
      };

      // One finger: paint, tap a tool, or (hands off) drag to pan. Two fingers: pinch to zoom and pan.
      const pts = new Map<number, { x: number; y: number }>();
      let pinched = false, moved = 0;
      let pinch = { dist: 1, mx: 0, my: 0 };
      let hold: { x: number; y: number; t: number; n: number } | null = null;
      let lastTap = { x: 0, y: 0, t: -1e9 };
      const local = (e: { clientX: number; clientY: number }) => { const r = slotEl.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      const two = () => { const [a, b] = [...pts.values()] as [{ x: number; y: number }, { x: number; y: number }]; return { dist: Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
      const isTool = () => mode.mode !== 'watch' && mode.mode !== 'body';
      slotEl.addEventListener('pointerdown', (e) => {
        settle = false;
        if (photo) { setPhoto(false); return; }
        slotEl.setPointerCapture(e.pointerId);
        const at = local(e);
        pts.set(e.pointerId, at);
        if (pts.size === 2) { pinched = true; pinch = two(); hold = null; }
        else if (pts.size === 1) {
          pinched = false; moved = 0;
          hold = isTool() && !view.fp ? { ...at, t: 0, n: 0 } : null;
          if (mode.paint && !view.fp) use(at.x, at.y, true);
        }
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
          if (hold) { hold.x = now.x; hold.y = now.y; if (!mode.paint && moved >= 14) hold = null; }
          if (mode.mode === 'watch') {
            view.cx -= ((now.x - prev.x) / r.width) * (GRID_W / view.zoom);
            view.cy -= ((now.y - prev.y) / r.height) * (GRID_H / view.zoom);
            if (moved > 14 && follow) setFollow(false);
            nFollow = 0;
            clampView();
          } else if (mode.paint) use(now.x, now.y, false);
        }
      });
      const stop = (e: PointerEvent) => {
        const at = pts.get(e.pointerId);
        const tap = e.type === 'pointerup' && pts.size === 1 && !pinched && moved < 14 && !!at;
        // Strike tools and Body fire on release, so a pinch never throws a meteor by accident. A held strike has already fired.
        if (tap && (!mode.paint || view.fp) && !(hold && hold.n > 0)) use(at!.x, at!.y, true);
        if (tap && mode.mode === 'watch' && !view.fp) {
          // Double-tap leans in two layers on that spot; at the closest layer it steps all the way back.
          const now = performance.now();
          if (now - lastTap.t < 340 && Math.hypot(at!.x - lastTap.x, at!.y - lastTap.y) < 30) {
            const g = toGrid(at!.x, at!.y);
            const li = layerOf(zoomGoal || view.zoom);
            lastTap.t = -1e9;
            if (li >= LAYERS.length - 1) zoomGoal = 1;
            else { view.cx = g.gx; view.cy = g.gy; zoomGoal = LAYERS[Math.min(LAYERS.length - 1, li + 2)]![0]; clampView(); }
            ripple(at!.x, at!.y, false);
          } else lastTap = { ...at!, t: now };
        }
        pts.delete(e.pointerId);
        if (!pts.size) hold = null;
      };
      slotEl.addEventListener('pointerup', stop);
      slotEl.addEventListener('pointercancel', stop);
      slotEl.addEventListener('wheel', (e) => { e.preventDefault(); const q = local(e); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, q.x, q.y); }, { passive: false });
      const over = (b: HTMLElement) => { b.addEventListener('pointerdown', (e) => e.stopPropagation()); return b; };
      const zoomBtn = (text: string, dir: number, id: string) => {
        const b = over(el('button', { class: 'k-btn zoom-btn', type: 'button', 'data-id': id, 'aria-label': dir > 0 ? 'Closer' : 'Further' }, text));
        b.addEventListener('click', () => {
          const r = slotEl.getBoundingClientRect();
          if (view.fp) { zoomAt(dir > 0 ? 1.2 : 0.8, r.width / 2, r.height / 2); return; }
          // Step one defined layer at a time; the camera glides there.
          const li = layerOf(zoomGoal || view.zoom);
          if (dir > 0 && li >= LAYERS.length - 1) { zoomGoal = 0; zoomAt(1.2, r.width / 2, r.height / 2); return; }
          zoomGoal = LAYERS[Math.max(0, Math.min(LAYERS.length - 1, li + dir))]![0];
        });
        return b;
      };
      const walkBtn = el('button', { class: 'k-btn walk-btn', type: 'button', 'data-id': 'walk', hidden: true }, 'WALK');
      walkBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); walkBtn.setPointerCapture(e.pointerId); walking = true; });
      const walkStop = (e: Event) => { e.stopPropagation(); walking = false; };
      walkBtn.addEventListener('pointerup', walkStop);
      walkBtn.addEventListener('pointercancel', walkStop);
      walkBtn.addEventListener('contextmenu', (e) => e.preventDefault());
      // Minimap: the whole world as a strip, with the camera's window on it. Only while leaned in.
      const mini = el('canvas', { class: 'pl-mini', 'data-id': 'minimap', width: GRID_W, height: 40, hidden: true, 'aria-label': 'The whole world. Tap to move there.' });
      const miniCtx = mini.getContext('2d');
      const css = getComputedStyle(root);
      const tok = (n: string) => css.getPropertyValue(n).trim();
      const INK = { land: tok('--ink-off'), dim: tok('--line-dim'), glow: tok('--glow'), gold: tok('--gold'), bg: tok('--bg') };
      const heights = new Uint8Array(GRID_W);
      let miniAge = 1e9;
      const miniJump = (e: PointerEvent) => {
        e.stopPropagation();
        const r = mini.getBoundingClientRect();
        view.cx = ((e.clientX - r.left) / r.width) * GRID_W;
        if (follow) setFollow(false);
        nFollow = 0;
        clampView();
      };
      mini.addEventListener('pointerdown', (e) => { settle = false; mini.setPointerCapture(e.pointerId); miniJump(e); c.audio.sfx('tap'); });
      mini.addEventListener('pointermove', (e) => { if (mini.hasPointerCapture(e.pointerId)) miniJump(e); });
      const drawMini = (dt: number) => {
        const show = !view.fp && !photo && view.zoom > 1.4;
        if (mini.hidden === show) mini.hidden = !show;
        const f = c.sim.latest();
        if (!show || !miniCtx || !f) return;
        miniAge += dt;
        if (miniAge > 700) {
          miniAge = 0;
          for (let x = 0; x < GRID_W; x++) heights[x] = ground(x);
        }
        const H = 40, k = H / GRID_H;
        miniCtx.fillStyle = INK.bg; miniCtx.fillRect(0, 0, GRID_W, H);
        miniCtx.fillStyle = INK.land;
        for (let x = 0; x < GRID_W; x++) miniCtx.fillRect(x, heights[x]! * k, 1, H);
        miniCtx.fillStyle = INK.gold;
        for (const v of f.civ.villages) miniCtx.fillRect(Math.round(v.x) - 1, Math.max(0, v.y * k - 5), 3, 5);
        const av = f.civ.avatar;
        if (av) { miniCtx.fillStyle = INK.glow; miniCtx.fillRect(Math.round(av.x) - 1, Math.max(0, av.y * k - 8), 2, 8); }
        const w = GRID_W / view.zoom, h = (GRID_H / view.zoom) * k;
        miniCtx.strokeStyle = INK.glow; miniCtx.lineWidth = 1.5;
        miniCtx.strokeRect(Math.max(1, view.cx - w / 2), Math.max(1, view.cy * k - h / 2), Math.max(4, w - 1), Math.max(4, h));
      };
      // Photo: nothing over the surface until it is tapped.
      const wrap = el('div', { class: 'pl' });
      const setPhoto = (on: boolean) => {
        photo = on;
        wrap.classList.toggle('photo', on);
        c.audio.sfx('toggle', on ? 1 : 0);
        if (!on) hint.textContent = mode.hint;
      };
      const photoBtn = over(el('button', { class: 'k-btn pl-over-btn pl-photo', type: 'button', 'data-id': 'photo', 'aria-label': 'Photo: hide everything over the surface' }, 'Photo'));
      photoBtn.addEventListener('click', () => setPhoto(true));
      // The tool in hand, shown on the surface. Tap it to put the tool down.
      const chip = over(el('button', { class: 'k-btn pl-over-btn pl-chip', type: 'button', 'data-id': 'tool-chip', hidden: true }, ''));
      chip.addEventListener('click', () => pick(TOOLS[0]!));
      // First person compass.
      const cVil = el('i', { class: 'pl-mark vil' }), cNot = el('i', { class: 'pl-mark not' });
      const cText = el('span', { class: 'k-label' }, '');
      const compass = el('div', { class: 'pl-compass', 'data-id': 'compass', hidden: true }, el('div', { class: 'pl-compass-bar' }, cVil, cNot), cText);
      slotEl.append(walkBtn, el('div', { class: 'zoom-ctl' }, zoomBtn('−', -1, 'zoom-out'), zoomLabel, zoomBtn('+', 1, 'zoom-in')), rail, mini, photoBtn, chip, compass);

      /* ---------- tabs: pages of one scroller ---------- */
      const pager = el('div', { class: 'pl-pager', 'data-id': 'pager' });
      const pages = {} as Record<Tab, HTMLElement>;
      const tabBtns = {} as Record<Tab, HTMLElement>;
      let tab: Tab = 'watch';
      const markTab = (t: Tab) => { tab = t; for (const k of TABS) tabBtns[k].setAttribute('aria-selected', String(k === t)); };
      const openTab = (t: Tab) => { pager.scrollTop = pages[t].offsetTop; markTab(t); };
      const tabStrip = el('div', { class: 'sp-tabs', role: 'tablist' }, ...TABS.map((t) => {
        const b = el('button', { class: 'sp-tab', type: 'button', role: 'tab', 'data-id': `tab-${t}`, 'aria-selected': String(t === tab) }, TAB_LABEL[t]);
        b.addEventListener('click', () => { openTab(t); c.audio.sfx('tap'); });
        tabBtns[t] = b;
        return b;
      }));
      pager.addEventListener('scroll', () => {
        // Whatever page holds the top of the scroller is the open tab (a click on a control elsewhere scrolls here too).
        const y = pager.scrollTop + 24;
        let cur: Tab = 'watch';
        for (const t of TABS) if (pages[t].offsetTop <= y) cur = t;
        if (cur !== tab) markTab(cur);
      }, { passive: true });

      /* ---------- Watch ---------- */
      const when = label('');
      const calendar = el('p', { class: 'k-narration pl-cal', 'data-id': 'calendar' }, '');
      const dayBar = el('i', {});
      const weather = el('span', { class: 'k-label', 'data-id': 'weather' }, '');
      const era = el('span', { class: 'k-label', 'data-id': 'era' }, 'ERA HUTS');
      const toolBtns = new Map<ToolDef, HTMLElement>();
      const selHint = el('p', { class: 'k-narration pl-sel-hint' }, mode.hint);
      const selRisk = el('span', { class: 'k-label pl-risk', 'data-id': 'tool-risk' }, mode.risk);
      const pick = (t: ToolDef) => {
        mode = t;
        hint.textContent = t.hint;
        selHint.textContent = t.hint; selRisk.textContent = t.risk;
        for (const [d, b] of toolBtns) b.setAttribute('aria-pressed', String(d === t));
        chip.hidden = t.mode === 'watch';
        chip.textContent = t.mode === 'body' ? 'Body ×' : `${t.label} ×`;
        slotEl.classList.toggle('armed', t.mode !== 'watch');
      };
      const toolBtn = (t: ToolDef, cls = 'k-tag tool pl-tool') => {
        const b = el('button', { class: cls, type: 'button', 'aria-pressed': String(t === mode), 'data-id': `tool-${t.mode}`, title: t.risk }, t.label);
        b.addEventListener('click', () => { pick(t); c.audio.sfx('tap', 0.4); });
        toolBtns.set(t, b);
        return b;
      };
      const speedDefs = [[0, 'Pause'], [1, '1x'], [3, '3x']] as const;
      const speeds = el('div', { class: 'pl-speeds' }, ...speedDefs.map(([s, text]) => {
        const b = el('button', { class: 'k-btn pl-speed', type: 'button', 'data-id': `speed-${s}`, 'aria-pressed': String(c.clock.speed() === s) }, text);
        b.addEventListener('click', () => {
          c.clock.setSpeed(s);
          c.audio.sfx('toggle', s ? 1 : 0);
          speeds.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        });
        return b;
      }));
      const photoBtn2 = button('Photo', () => setPhoto(true), { id: 'photo-2' });
      pages.watch = el('section', { class: 'pl-page', 'data-id': 'page-watch' },
        calendar,
        el('div', { class: 'pl-daybar', 'aria-hidden': 'true' }, dayBar),
        el('div', { class: 'pl-lines' }, weather, era),
        el('div', { class: 'row nowrap' }, toolBtn(TOOLS[0]!, 'k-btn pl-wide'), photoBtn2),
        el('p', { class: 'k-label pl-tip' }, 'Drag to look. Pinch, or double-tap, to lean in. The strip over the surface is the whole world: tap it to move. Their clock has three paces and no faster one.'),
      );

      /* ---------- Tools ---------- */
      const brushRow = el('div', { class: 'pl-brush' }, label('BRUSH'), ...BRUSH.map((bz) => {
        const b = el('button', { class: 'k-tag tool pl-brush-btn', type: 'button', 'data-id': `brush-${bz.label.toLowerCase()}`, 'aria-pressed': String(bz.mult === brush), 'aria-label': `Brush ${bz.label}` }, bz.label);
        b.addEventListener('click', () => {
          brush = bz.mult;
          c.audio.sfx('slider', bz.mult / 2);
          brushRow.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          brushSay.textContent = bz.mult < 1 ? 'A fine touch.' : bz.mult > 1 ? 'A heavy hand.' : 'An even hand.';
        });
        return b;
      }));
      const brushSay = el('span', { class: 'k-label pl-brush-say' }, 'An even hand.');
      brushRow.append(brushSay);
      pages.tools = el('section', { class: 'pl-page', 'data-id': 'page-tools' },
        el('div', { class: 'pl-toolhead' }, did, el('div', { class: 'pl-sel' }, selHint, selRisk), brushRow),
        ...GROUPS.flatMap((g) => [
          el('span', { class: 'k-label pl-group' }, g.label),
          el('div', { class: 'pl-grid' }, ...TOOLS.filter((t) => t.group === g.id).map((t) => toolBtn(t))),
        ]),
        el('p', { class: 'k-label pl-tip' }, 'Hold a finger down and the tool repeats. Nothing here can be undone.'),
      );

      /* ---------- Body ---------- */
      const ACTS: { a: BodyAction; label: string; sfx: string; hint: string; wait: number }[] = [
        { a: 'strike', label: 'Strike', sfx: 'crit', hint: 'Fell the two nearest attackers. The rest run, and the village fears you more.', wait: 0 },
        { a: 'preach', label: 'Preach', sfx: 'preach', hint: 'Speak. Those near sit and listen, and understanding grows.', wait: 60 },
        { a: 'gift', label: 'Gift', sfx: 'gift', hint: 'Give of your own body: food and joy for the nearest village.', wait: 0 },
        { a: 'shine', label: 'Shine', sfx: 'shine', hint: 'Show your light. The wise kneel; the rest flee.', wait: 0 },
        { a: 'rest', label: 'Rest', sfx: 'rest', hint: 'Mend yourself, if no one is striking you.', wait: 0 },
      ];
      const NOBODY = 'You have no body. Choose Take a body, then tap the ground where you want to stand.';
      const bodyState = el('p', { class: 'k-narration pl-body-say', 'data-id': 'body-state' }, NOBODY);
      const hpFill = el('i', {});
      const hpText = el('span', { class: 'k-label', 'data-id': 'body-hp' }, '');
      const hpRow = el('div', { class: 'pl-hp', hidden: true }, el('div', { class: 'pl-bar' }, hpFill), hpText);
      const think = el('p', { class: 'k-narration pl-think', 'data-id': 'body-think', hidden: true }, '');
      const lastAct = el('span', { class: 'k-label', 'data-id': 'body-last' }, '');
      const eyes = el('button', { class: 'k-tag tool pl-tool', type: 'button', 'data-id': 'eyes' }, 'Eyes');
      eyes.addEventListener('click', () => (view.fp ? leaveBody() : enterBody()));
      const actBtns = new Map<BodyAction, HTMLElement>();
      const bodyRow = el('div', { class: 'pl-grid body-row', hidden: true }, eyes, ...ACTS.map((t) => {
        const b = el('button', { class: 'k-tag tool pl-tool', type: 'button', 'data-id': `act-${t.a}` }, t.label);
        b.addEventListener('click', () => {
          c.sim.act(t.a);
          c.audio.sfx(t.sfx);
          // Say truthfully what it did, or why it did nothing.
          const o = c.sim.latest()?.civ.avatar?.options?.find((q) => q.id === t.a);
          const said = o && !o.ready ? (o.wait > 0 ? `${t.label} is not ready for ${Math.ceil(o.wait / 20)}s.` : o.reason ?? t.hint) : o?.does ?? t.hint;
          hint.textContent = said;
          bodyHint.textContent = said;
          const r = slotEl.getBoundingClientRect();
          burst(slotEl, r.width / 2, r.height * 0.6, t.a === 'rest' ? 6 : 12, t.a === 'shine' || t.a === 'strike');
          if (t.a === 'strike') shake(slotEl);
          if (t.a === 'shine') flash(slotEl);
        });
        actBtns.set(t.a, b);
        return b;
      }));
      const bodyHint = el('p', { class: 'k-label pl-tip' }, 'Eyes looks through the body. Zooming all the way in does the same.');
      const ascend = button('Ascend', () => { leaveBody(); c.sim.ascend(); c.audio.sfx('zoom-out'); pick(TOOLS[0]!); }, { id: 'ascend' });
      ascend.hidden = true;
      // Needs, and what the body is: role, followers, load, weather.
      const need = (name: string, id: string) => {
        const fill = el('i', {});
        const text = el('span', { class: 'k-label', 'data-id': `body-${id}` }, name);
        return { fill, text, name, box: el('div', { class: 'pl-need' }, text, el('div', { class: 'pl-bar' }, fill)) };
      };
      const needs = [need('Hunger', 'hunger'), need('Weariness', 'weariness'), need('Wounds', 'wound')] as const;
      const needRow = el('div', { class: 'pl-needs', 'data-id': 'body-needs', hidden: true }, ...needs.map((n) => n.box));
      const bodyTags = el('p', { class: 'k-label pl-bodytags', 'data-id': 'body-tags', hidden: true }, '');
      // What can be done here: only what applies, each with what it will do, or why not yet.
      const DEEDS: Record<string, [string, string]> = {
        heal: ['Heal', 'rest'], work: ['Work beside them', 'step'], trade: ['Trade', 'gift'], teach: ['Teach', 'preach'], plead: ['Ask the ruler for peace', 'preach'],
        incite: ['Incite a war', 'crit'], petition: ['Plead against the tribute', 'preach'], stand: ['Stand between the armies', 'shine'], challenge: ['Challenge the heretic', 'preach'],
        side: ['Side with the heretic', 'preach'], blessHarvest: ['Bless the harvest', 'shine'], curseHarvest: ['Curse the harvest', 'crit'], vigil: ['Keep vigil at the shrine', 'rest'],
        bury: ['Bury the dead', 'step'], carry: ['Carry for them', 'gift'], deliver: ['Deliver', 'gift'], found: ['Found a village', 'body'], role: ['Accept the role', 'tap'], eat: ['Eat with them', 'rest'], steal: ['Steal bread', 'tap'],
      };
      const OLD = new Set<string>(ACTS.map((t) => t.a));
      const deedsLabel = el('span', { class: 'k-label pl-group', hidden: true }, 'HERE YOU CAN');
      const deedsBox = el('div', { class: 'pl-deeds', 'data-id': 'body-deeds', hidden: true });
      const deedBtns = new Map<string, { b: HTMLElement; sub: HTMLElement }>();
      const waitWord = (w: number) => `Ready in ${Math.ceil(w / 20)}s.`;
      const subOf = (o: BodyOption) => (o.ready ? o.does ?? '' : o.wait > 0 ? waitWord(o.wait) : o.reason ?? 'Not here.');
      const setText = (n: HTMLElement, t: string) => { if (n.textContent !== t) n.textContent = t; };
      let deedKey = '';
      const renderDeeds = (opts: readonly BodyOption[]) => {
        const mine = opts.filter((o) => !OLD.has(o.id) && DEEDS[o.id]);
        const key = mine.map((o) => o.id).join();
        if (key !== deedKey) {
          deedKey = key;
          deedBtns.clear();
          deedsBox.replaceChildren(...mine.map((o) => {
            const sub = el('span', {}, '');
            const b = el('button', { class: 'k-tag pl-deed', type: 'button', 'data-id': `act-${o.id}` }, el('b', {}, DEEDS[o.id]![0]), sub);
            b.addEventListener('click', () => {
              const now = c.sim.latest()?.civ.avatar?.options?.find((q) => q.id === o.id);
              if (!now) return;
              if (!now.ready) { bodyHint.textContent = `${DEEDS[o.id]![0]}: ${subOf(now)}`; c.audio.sfx('tap'); return; }
              c.sim.act(o.id);
              c.audio.sfx(DEEDS[o.id]![1]);
              const said = now.does ?? '';
              hint.textContent = said; bodyHint.textContent = said;
              const r = slotEl.getBoundingClientRect();
              burst(slotEl, r.width / 2, r.height * 0.6, 8, o.id === 'blessHarvest' || o.id === 'stand');
            });
            deedBtns.set(o.id, { b, sub });
            return b;
          }));
        }
        for (const o of mine) {
          const d = deedBtns.get(o.id);
          if (!d) continue;
          setText(d.sub, subOf(o));
          d.b.classList.toggle('cooling', !o.ready && o.wait > 0);
          d.b.classList.toggle('off', !o.ready && o.wait === 0);
          d.b.setAttribute('aria-disabled', String(!o.ready));
        }
        deedsLabel.hidden = deedsBox.hidden = !mine.length;
      };
      // How each village that knows the body stands toward it, and why.
      const standLabel = el('span', { class: 'k-label pl-group', hidden: true }, 'HOW THEY STAND TOWARD YOU');
      const standList = el('ul', { class: 'pl-standing', 'data-id': 'body-standing', hidden: true });
      const LEVEL_SAY: Record<string, string> = { hunted: 'wants you dead', shunned: 'turns its back on you', tolerated: 'lets you pass', welcome: 'makes room for you at the fire', followed: 'would follow you anywhere' };
      let standKey = '';
      const logLabel = el('span', { class: 'k-label pl-group', hidden: true }, 'THIS LIFE');
      const logList = el('ol', { class: 'pl-bodylog', 'data-id': 'body-log', hidden: true });
      let logKey = '';
      const toldLabel = el('span', { class: 'k-label pl-group', hidden: true }, 'WHAT THEY WRITE OF YOU');
      const toldList = el('ol', { class: 'pl-told', 'data-id': 'body-told', hidden: true });
      let toldKey = '';
      const renderTold = (all: readonly ChronicleEntry[]) => {
        const mine = all.filter((e) => e.kind === 'body' || e.kind === 'slain').slice(0, 4);
        const key = mine.map((e) => `${e.id}${e.reason ? 'r' : ''}`).join();
        if (key === toldKey) return;
        toldKey = key;
        toldList.replaceChildren(...mine.map((e) => el('li', {}, e.event, ...(e.reason ? [el('small', {}, e.reason)] : []))));
        toldLabel.hidden = toldList.hidden = !mine.length;
      };
      pages.body = el('section', { class: 'pl-page', 'data-id': 'page-body' },
        bodyState,
        el('div', { class: 'row nowrap' }, toolBtn(TOOLS[1]!, 'k-btn pl-wide'), ascend),
        hpRow, needRow, bodyTags, think, bodyRow, lastAct, bodyHint,
        deedsLabel, deedsBox, standLabel, standList, logLabel, logList, toldLabel, toldList,
      );

      /* ---------- Sky ---------- */
      const skyPanel = el('div', { class: 'sky-panel', 'data-id': 'sky-panel' });
      const skyKeyNow = () => {
        const sky = c.sky.skyOf(p), inv = c.sky.inventory();
        return `${sky.pieces.join()}|${sky.built ?? 0}|${sky.drift ?? 0}|${SKY_PIECE_KINDS.map((k) => inv[k]).join()}|${c.light.view().pips}`;
      };
      const renderSky = () => {
        const orbit = sys.orbits.find((o) => o.planet === c.selection.planetIndex) ?? sys.orbits[0]!;
        const sky = c.sky.skyOf(p), inv = c.sky.inventory();
        heavens = c.sky.heavens(sys, orbit.index);
        skyKey = skyKeyNow();
        const full = sky.pieces.length >= SKY_MAX_PIECES;
        const changed = (sfx: string, line: string) => {
          c.audio.sfx(sfx);
          c.bus.emit('sky:changed', { planetKey: pKey });
          c.persist();
          flash(slotEl); burst(slotEl, slotEl.clientWidth / 2, 30, 10);
          did.textContent = line;
          renderSky();
        };
        const take = (k: SkyPieceKind, i: number) => {
          const b = el('button', { class: 'sky-take', type: 'button', 'data-id': `sky-take-${i}`, 'aria-label': `Take down the ${k}` }, k, el('small', {}, 'take'));
          b.addEventListener('click', () => { c.sky.remove(pKey, i); c.sky.grant(k, 1); changed('take', `You took the ${k} down. Their sky is lighter by one.`); });
          return b;
        };
        const add = (k: SkyPieceKind) => {
          const have = inv[k] > 0;
          const b = el('button', { class: have ? 'sky-add' : 'sky-add make', type: 'button', 'data-id': `sky-add-${k}` }, k, el('small', {}, have ? `x${inv[k]}` : '1 light')) as HTMLButtonElement;
          b.disabled = full || (!have && !c.light.canSpend(1));
          b.addEventListener('click', () => {
            if (!have) {
              // Nothing left to hang: make one out of your own Light.
              if (!c.light.spend(1)) { c.audio.sfx('deny'); return; }
              c.sky.grant(k, 1);
              c.bus.emit('light:changed', { pips: c.light.view().pips });
            }
            const res = c.sky.place(k, sys, orbit.index);
            if (!res.ok) { c.audio.sfx('deny'); renderSky(); return; }
            c.box.recordPieceHung?.(c.box.selected());
            changed('place', `You hung a ${k} in their sky${have ? '' : ', made from your own light'}.`);
          });
          return b;
        };
        const drift = sky.drift ?? 0;
        skyPanel.replaceChildren(
          el('div', { class: 'row start' }, label(`THEIR SKY ${sky.pieces.length}/${SKY_MAX_PIECES}`), ...(sky.pieces.length ? sky.pieces.map(take) : [label('nothing hung there yet')])),
          el('div', { class: 'row start' }, label(full ? 'FULL' : 'HANG'), ...SKY_PIECE_KINDS.map(add)),
          el('p', { class: 'k-narration sky-says' }, heavens.says.join(' ')),
          drift || sky.built ? label(`${drift ? `ORBIT ${drift < 0 ? 'PULLED IN' : 'PUSHED OUT'} ${Math.abs(drift)}` : ''}${drift && sky.built ? ' · ' : ''}${sky.built ? `${sky.built} OF THEIR MAKING ALOFT` : ''}`) : '',
        );
      };
      pages.sky = el('section', { class: 'pl-page', 'data-id': 'page-sky' }, skyPanel, button('Change their sky', () => c.go('system'), { primary: true, id: 'change-sky' }));

      /* ---------- People ---------- */
      const nName = el('span', { class: 'k-narration notable-name' });
      const nMeta = el('span', { class: 'k-label notable-meta' });
      const nDeeds = el('p', { class: 'k-narration notable-deeds' });
      const nFind = el('button', { class: 'k-btn notable-find', type: 'button', 'data-id': 'notable-find' }, 'Find');
      const nCard = el('div', { class: 'notable-card', 'data-id': 'notable', hidden: true }, el('div', { class: 'notable-head' }, el('div', { class: 'notable-who' }, nName, nMeta), nFind), nDeeds);
      let nKey = '';
      /** Where a person stands right now (grid cells), from the people buffer. */
      const personAt = (id: number | undefined) => {
        const civ = c.sim.latest()?.civ;
        if (!civ || id === undefined || id < 0) return null;
        for (let i = 0; i < civ.peopleCount; i++) if (civ.people[i * PERSON_STRIDE + 4] === id) return { x: civ.people[i * PERSON_STRIDE]! + 0.5, y: civ.people[i * PERSON_STRIDE + 1]! };
        return null;
      };
      const followBtn = el('button', { class: 'k-btn pl-follow', type: 'button', 'data-id': 'follow', 'aria-pressed': 'false' }, 'Follow') as HTMLButtonElement;
      followBtn.disabled = true;
      const followSay = el('span', { class: 'k-label pl-follow-say', 'data-id': 'follow-say' }, 'Tap a village or a name to go there.');
      const setFollow = (on: boolean) => {
        follow = on && !!focus;
        followBtn.setAttribute('aria-pressed', String(follow));
        followBtn.disabled = !focus;
        followSay.textContent = !focus ? 'Tap a village or a name to go there.' : follow ? `The sky stays over ${focus.name}.` : `Looking at ${focus.name}. Follow keeps the sky over them.`;
      };
      const setFocus = (t: Target) => { focus = t; setFollow(follow); };
      followBtn.addEventListener('click', () => { setFollow(!follow); c.audio.sfx('toggle', follow ? 1 : 0); });
      const findPerson = (id: number, name: string) => {
        const at = personAt(id);
        if (!at) { c.audio.sfx('deny'); followSay.textContent = `${name} cannot be seen right now.`; return; }
        if (!flyTo(at.x - 0.5, 11)) return;
        view.cy = at.y - 2;
        nFollow = 4000;
        setFocus({ kind: 'person', id, name });
      };
      nFind.addEventListener('click', () => { const nb = c.sim.latest()?.civ.notable; if (nb) findPerson(nb.personId, nb.name); });
      const others = el('div', { class: 'pl-others', 'data-id': 'named' });
      const vlist = el('div', { class: 'vlist pl-vlist', 'data-id': 'villages' });
      const peopleSay = el('p', { class: 'k-narration pl-people-say', 'data-id': 'people-say' }, 'No one lives here yet.');
      let vKey = '', oKey = '';
      let baseline: Record<string, number> | null = prevSeen ? prevSeen.v : null;
      const lacks = (v: Village) => {
        const l: string[] = [];
        if (v.food < 60) l.push('food'); else if (v.food < 200) l.push('full stores');
        if (v.mood < -30) l.push('peace');
        if (v.belief === 'none') l.push('a faith');
        if (v.wealth < 15 && v.tech >= 2) l.push('coin');
        if (!v.buildings.some((b) => b.kind === 'fire') && v.tech < 1) l.push('fire');
        return l.length ? `lacks ${l.slice(0, 2).join(' and ')}` : 'lacks nothing';
      };
      const renderPeople = () => {
        const f = c.sim.latest();
        if (!f) return;
        const civ = f.civ;
        baseline ??= Object.fromEntries(civ.villages.map((v) => [String(v.id), v.souls]));
        const key = civ.villages.map((v) => `${v.id}:${v.souls}:${v.belief}:${v.tech}:${Math.round(v.mood / 10)}:${Math.round(v.food / 40)}:${Math.round(v.enlightenment / 10)}:${v.wealth < 15}`).join('|') + `|${focus?.kind}${focus?.id}`;
        if (key !== vKey) {
          vKey = key;
          const total = civ.souls, was = prevSeen?.souls;
          peopleSay.textContent = !civ.villages.length ? 'No one lives here yet.'
            : `${total} souls in ${civ.villages.length} ${civ.villages.length === 1 ? 'village' : 'villages'}.${was !== undefined ? (total > was ? ` ${total - was} more than when you last looked.` : total < was ? ` ${was - total} fewer than when you last looked.` : ' As many as when you last looked.') : ''}`;
          vlist.replaceChildren(...[...civ.villages].sort((a, b) => b.souls - a.souls).slice(0, 12).map((v) => {
            const name = vname(v.id);
            const b0 = baseline![String(v.id)];
            const d = b0 === undefined ? null : v.souls - b0;
            const trend = d === null ? 'new' : d > 0 ? `+${d}` : d < 0 ? `${d}` : '=';
            const row = el('button', { class: 'pl-vrow', type: 'button', 'data-id': `village-${v.id}`, 'aria-pressed': String(focus?.kind === 'village' && focus.id === v.id) },
              el('span', { class: 'pl-vhead' }, el('span', { class: 'k-narration' }, name), el('b', { class: d === null || d > 0 ? 'up' : d < 0 ? 'down' : '' }, `${v.souls} · ${trend}`)),
              el('span', { class: 'k-label' }, `${moodWord(v.mood)} · ${v.belief === 'none' ? 'no faith' : `pray to the ${v.belief}`} · ${ERA_NAMES[v.tech] ?? ''} · ${mindWord(v.enlightenment)}`),
              el('span', { class: 'k-label pl-lack' }, `${lacks(v)}${v.wealth ? ` · ${v.wealth} coin` : ''}`));
            row.addEventListener('click', () => {
              if (!flyTo(v.x, 8)) return;
              setFocus({ kind: 'village', id: v.id, name });
              vKey = '';
            });
            return row;
          }));
        }
        const nb = civ.notable;
        const nk = nb ? `${nb.name}|${nb.calling}|${nb.age}|${nb.villageId}|${nb.deeds?.length ?? 0}|${nb.deeds?.[nb.deeds.length - 1] ?? ''}|${nb.metYou}` : '';
        if (nk !== nKey) {
          nKey = nk;
          nCard.hidden = !nb;
          if (nb) {
            nName.textContent = nb.name;
            nMeta.textContent = `${nb.calling} · ${nb.age} · ${vname(nb.villageId)}${nb.metYou ? ' · has seen you' : ''}`.toUpperCase();
            nDeeds.textContent = nb.deeds?.length ? nb.deeds.slice(-2).join(' ') : 'Nothing is told of them yet.';
          }
        }
        const more = namedPeople(civ, nb?.personId);
        const ok = more.map((o) => `${o.id}${o.name}${o.calling}`).join('|');
        if (ok !== oKey) {
          oKey = ok;
          others.replaceChildren(...more.map((o) => {
            const b = el('button', { class: 'pl-vrow', type: 'button', 'data-id': `person-${o.id}` },
              el('span', { class: 'pl-vhead' }, el('span', { class: 'k-narration' }, o.name), el('b', {}, 'Find')),
              el('span', { class: 'k-label' }, `${o.calling}${o.villageId >= 0 ? ` · ${vname(o.villageId)}` : ''}`));
            b.addEventListener('click', () => findPerson(o.id, o.name));
            return b;
          }));
        }
      };
      pages.people = el('section', { class: 'pl-page', 'data-id': 'page-people' },
        peopleSay,
        el('div', { class: 'pl-followrow' }, followBtn, followSay),
        nCard, others, vlist,
      );

      /* ---------- Chronicle ---------- */
      const story = el('p', { class: 'k-narration pl-story', 'data-id': 'story' }, 'Nothing has happened yet. Watch.');
      const chronList = el('ol', { class: 'pl-chron', 'data-id': 'chron-list' });
      const filters = el('div', { class: 'pl-filters' }, ...KINDS.map((k) => {
        const b = el('button', { class: 'k-tag tool pl-filter', type: 'button', 'data-id': `chron-${k.id}`, 'aria-pressed': String(k.id === filter) }, k.label);
        b.addEventListener('click', () => {
          filter = k.id; cKey = '';
          c.audio.sfx('tap');
          filters.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          renderChron();
        });
        return b;
      }));
      const ticker = el('li', {}, narration('Nothing has happened yet. Watch.'));
      const tickerBox = el('button', { class: 'pl-ticker', type: 'button', 'data-id': 'ticker', 'aria-label': 'Their chronicle. Open the whole story.' }, label('THEIR CHRONICLE'), el('ol', { class: 'chronicle' }, ticker));
      tickerBox.addEventListener('click', () => { openTab('chronicle'); c.audio.sfx('tap'); });
      /** Where an entry happened, if it can be told: its own x should one appear, else the village it names. */
      const whereOf = (en: ChronicleEntry): { x: number; v: Village | null } | null => {
        const vs = c.sim.latest()?.civ.villages ?? [];
        const byId = en.villageId !== undefined ? vs.find((v) => v.id === en.villageId) : undefined;
        if (byId) return { x: byId.x, v: byId };
        if (en.x !== undefined && en.x >= 0 && en.x < GRID_W) return { x: en.x, v: null };
        const hit = vs.find((v) => en.event.includes(vname(v.id)));
        return hit ? { x: hit.x, v: hit } : null;
      };
      let cKey = '', topId = -1;
      const renderChron = () => {
        const f = c.sim.latest();
        if (!f) return;
        const all = f.chronicle;
        const key = `${filter}|${all.length}|${all[0]?.id ?? -1}|${all.filter((e) => e.reason).length}|${f.civ.villages.length}`;
        if (key === cKey) return;
        cKey = key;
        const top = all[0];
        if (top && top.id !== topId) {
          if (topId !== -1) c.audio.sfx('soul');
          topId = top.id;
          ticker.replaceChildren(el('span', { class: 'k-label' }, `Y${top.year}`), ' ', narration(top.event));
        }
        const count = (id: string) => { const k = KINDS.find((q) => q.id === id)!; return all.filter((e) => filed(e, k)).length; };
        if (all.length) {
          const first = all[all.length - 1]!;
          const parts = [[count('lives'), 'of lives'], [count('wars'), 'of blood'], [count('faith'), 'of faith'], [count('works'), 'of their works'], [count('sky'), 'of the sky']] as const;
          const told = parts.filter(([n]) => n > 0).map(([n, w]) => `${n} ${w}`);
          story.textContent = `The story so far: ${all.length} ${all.length === 1 ? 'line' : 'lines'} since year ${first.year}${told.length ? `; ${told.join(', ')}` : ''}. It began: "${first.event}"`;
        }
        const kf = KINDS.find((k) => k.id === filter)!;
        const shown = all.filter((e) => filed(e, kf)).slice(0, 30);
        chronList.replaceChildren(...(shown.length ? shown.map((en) => {
          const at = whereOf(en);
          const body = [el('span', { class: 'k-label' }, `Y${en.year}`), ' ', narration(en.event), en.reason ? el('small', {}, en.reason) : null];
          if (!at) return el('li', { 'data-id': `chron-entry-${en.id}` }, ...body);
          const b = el('button', { class: 'pl-chron-go', type: 'button', 'data-id': `chron-go-${en.id}`, 'aria-label': `${en.event} Go there.` }, ...body, el('i', { class: 'k-label' }, 'go there'));
          b.addEventListener('click', () => {
            if (!flyTo(at.x, 8)) return;
            if (at.v) setFocus({ kind: 'village', id: at.v.id, name: vname(at.v.id) });
          });
          return el('li', { 'data-id': `chron-entry-${en.id}` }, b);
        }) : [el('li', {}, narration(all.length ? 'Nothing of that kind has been written.' : 'Nothing has happened yet. Watch.'))]));
      };
      pages.chronicle = el('section', { class: 'pl-page', 'data-id': 'page-chronicle' }, story, filters, chronList);

      /* ---------- assemble ---------- */
      const souls = stat(0, 'souls'), villages = stat(0, 'villages'), glow = stat(0, 'glow');
      const hop = (d: number) => {
        const n = sys.planets.length;
        c.selection.planetIndex = (c.selection.planetIndex + d + n) % n;
        c.audio.sfx('orbit');
        c.go('planet');
      };
      const sib = (text: string, d: number, id: string) => {
        const to = sys.planets[(c.selection.planetIndex + d + sys.planets.length) % sys.planets.length]!;
        const b = el('button', { class: 'k-back pl-sib', type: 'button', 'data-id': id, 'aria-label': `${d < 0 ? 'Previous' : 'Next'} world: ${to.name}` }, text);
        b.addEventListener('click', () => hop(d));
        return b;
      };
      for (const t of TABS) pager.append(pages[t]);
      wrap.append(
        el('header', { class: 'row pl-header' },
          backChip('SKY', () => c.go('system')),
          c.battle?.outcome === 'ongoing' ? backChip('BATTLE', () => c.go('battle')) : null,
          sys.planets.length > 1 ? sib('‹', -1, 'sib-prev') : null,
          sys.planets.length > 1 ? sib('›', 1, 'sib-next') : null,
          el('div', { class: 'col right pl-name' }, el('span', { class: 'k-title small' }, p.name), when)),
        slotEl,
        tickerBox,
        el('div', { class: 'pl-status' }, souls.el, villages.el, glow.el, speeds),
        tabStrip,
        pager,
      );
      root.append(wrap);

      /* ---------- per frame, per tick ---------- */
      let seenSouls = -1;
      let wall = performance.now();
      const tick = (frameDt: number) => {
        // Holds and unfolding patterns run on real time, so a slow frame does not slow the hand.
        const nowMs = performance.now();
        const dt = Math.max(frameDt, Math.min(1000, nowMs - wall));
        wall = nowMs;
        // Patterns that unfold over time.
        if (later.length) {
          for (const l of later) l.t -= dt;
          const due = later.filter((l) => l.t <= 0);
          if (due.length) { later = later.filter((l) => l.t > 0); for (const l of due) l.fn(); }
        }
        // Hold to repeat.
        if (hold && pts.size === 1 && !pinched && isTool() && !view.fp) {
          hold.t += dt;
          const every = mode.paint ? 110 : 380;
          if (hold.t > (mode.paint ? 140 : 520)) { hold.t -= every; hold.n++; use(hold.x, hold.y, true); }
        }
        // Follow: the sky stays over a village or a person.
        if (follow && focus && !view.fp && !pts.size) {
          const f = c.sim.latest();
          const tx = focus.kind === 'village' ? f?.civ.villages.find((v) => v.id === focus!.id)?.x : personAt(focus.id)?.x;
          if (tx === undefined) { if (focus.kind === 'village') { setFollow(false); followSay.textContent = `${focus.name} is gone.`; } }
          else { view.cx += (tx + 0.5 - view.cx) * Math.min(1, dt * 0.005); clampView(); }
        }
        if (nFollow > 0 && !view.fp && focus?.kind === 'person') {
          // Find: keep the camera on them while it glides in.
          nFollow -= dt;
          const at = personAt(focus.id);
          if (at) {
            const hx = GRID_W / (2 * view.zoom), hy = GRID_H / (2 * view.zoom);
            view.cx = Math.max(hx, Math.min(GRID_W - hx, at.x));
            if (view.zoom < 7) view.cy = Math.max(hy, Math.min(GRID_H - hy, at.y - 2));
          } else nFollow = 0;
        }
        drawMini(dt);
        // Compass: where the nearest village and the named one stand, against where the body is looking.
        if (view.fp) {
          const f = c.sim.latest();
          const av = f?.civ.avatar;
          if (f && av) {
            const place = (mark: HTMLElement, tx: number | undefined) => {
              mark.hidden = tx === undefined;
              if (tx === undefined) return '';
              let a = (tx >= av.x ? 0 : Math.PI) - view.fp!.yaw;
              a = Math.atan2(Math.sin(a), Math.cos(a));
              mark.style.left = `${Math.max(3, Math.min(97, 50 + (a / 1.2) * 100))}%`;
              mark.classList.toggle('behind', Math.abs(a) > Math.PI / 2);
              return Math.abs(a) < 0.35 ? 'ahead' : Math.abs(a) > Math.PI / 2 ? 'behind you' : a > 0 ? 'to your right' : 'to your left';
            };
            const nv = nearestVillage(av.x);
            const dv = place(cVil, nv?.x);
            const nb = f.civ.notable;
            const dn = place(cNot, nb ? personAt(nb.personId)?.x : undefined);
            const text = `${nv ? `${vname(nv.id)} ${Math.round(Math.abs(nv.x - av.x))} paces ${dv}` : 'no village'}${nb && dn ? ` · ${nb.name} ${dn}` : ''}`;
            if (cText.textContent !== text) cText.textContent = text;
          }
        }
      };
      const onTick = () => {
        const f = c.sim.latest();
        if (!f) return;
        if (skyKeyNow() !== skyKey) renderSky();
        const e = f.env;
        if (e.lightning < lastBolt) { c.audio.sfx('lightning'); flash(slotEl); }
        lastBolt = e.lightning;
        souls.update(f.civ.souls);
        villages.update(f.civ.villages.length);
        glow.update(f.civ.glowPerMinute);
        when.textContent = `${c.clock.ageName()} · YEAR ${c.clock.year()}`;
        let tsum = 0;
        for (let i = 0; i < e.temp.length; i++) tsum += e.temp[i]!;
        const t = e.temp.length ? tsum / e.temp.length : 128;
        const wx = e.lightning < 40 ? 'storm' : e.rain > 30 ? (e.snowing ? 'snow' : 'rain') : Math.abs(e.wind) > 50 ? 'wind' : 'clear';
        const season = SEASON[Math.min(3, Math.floor(e.season / 250))]!;
        const cal = `Year ${c.clock.year()}, ${season}, day ${Math.min(4, Math.floor(e.season / 250) + 1)} of 4. It is ${timeWord(e.day)}.`;
        if (calendar.textContent !== cal) calendar.textContent = cal;
        dayBar.style.width = `${e.day / 10}%`;
        dayBar.classList.toggle('night', e.day < 250 || e.day > 750);
        weather.textContent = `${tempWord(t)} · ${wx} · wind ${e.wind > 8 ? 'east' : e.wind < -8 ? 'west' : 'still'}${c.clock.speed() === 0 ? ' · time is held' : ''}`.toUpperCase();
        era.textContent = `ERA ${ERA_NAMES[f.civ.era] ?? ''} · PROSPERITY ${f.civ.prosperity ?? 0}${f.civ.launches ? ` · ${f.civ.launches} IN ORBIT` : ''}`.toUpperCase();
        const av = f.civ.avatar;
        bodyRow.hidden = !av; ascend.hidden = !av; hpRow.hidden = !av; think.hidden = !av;
        if (av) {
          bodyState.textContent = view.fp ? 'You are looking through its eyes.' : 'You have a body down there. Tap the ground to walk it.';
          hpFill.style.width = `${Math.max(0, Math.min(100, av.hp))}%`;
          hpFill.classList.toggle('low', av.hp < 35);
          hpText.textContent = `BODY ${av.hp} HP`;
          const nv = nearestVillage(av.x);
          const name = nv ? vname(nv.id) : '';
          think.textContent = av.attackers ? `${av.attackers} of ${name || 'them'} are striking you. They think you a thing to be killed.`
            : av.worshippers ? `${av.worshippers} kneel before you${name ? ` in ${name}` : ''}.`
              : !nv ? 'There is no one here to see you.'
                : nv.enlightenment >= 100 ? `${name} knows what you are, and is not afraid.`
                  : nv.enlightenment >= 50 ? `${name} is wondering what you are.` : `${name} fears you. Come close and they will raise their hands.`;
          const opts = av.options;
          const a = av.action ? ACTS.find((x) => x.a === av.action) ?? { a: av.action, label: DEEDS[av.action]?.[0] ?? av.action, wait: 0 } : undefined;
          const left = a ? opts?.find((o) => o.id === a.a)?.wait ?? Math.max(0, a.wait - av.actionAge) : 0;
          lastAct.textContent = a ? `LAST: ${a.label} · ${Math.round(av.actionAge / 20)}s AGO${left > 0 ? ` · AGAIN IN ${Math.ceil(left / 20)}s` : a.wait ? ` · ${a.label} IS READY` : ''}`.toUpperCase() : '';
          for (const x of ACTS) {
            const o = opts?.find((q) => q.id === x.a);
            const b = actBtns.get(x.a)!;
            b.classList.toggle('cooling', o ? o.wait > 0 : !!a && x.a === a.a && left > 0);
            b.classList.toggle('off', !!o && !o.ready && o.wait === 0);
          }
          // The life the sim gives the body: needs, role, what applies here, standing, the log.
          const has = av.hunger !== undefined;
          needRow.hidden = !has;
          if (has) {
            const vals = [av.hunger ?? 0, av.weariness ?? 0, av.wound ?? 0];
            needs.forEach((n, i) => {
              const val = vals[i]!;
              n.fill.style.width = `${Math.max(0, Math.min(100, i === 2 ? val * 100 / 60 : val))}%`;
              n.fill.classList.toggle('bad', i === 2 ? val >= 30 : val >= 80);
              setText(n.text, `${n.name} ${val}`.toUpperCase());
            });
          }
          const tags: string[] = [];
          if (av.role) tags.push(av.role);
          else if (av.roleOffer) tags.push(`they ask you to be their ${av.roleOffer}`);
          if (av.followers) tags.push(`${av.followers} follow you`);
          if (av.carrying) tags.push(`carrying ${av.carrying}${av.carryingTo ? ` for ${vname(av.carryingTo)}` : ''}`);
          if (av.sick) tags.push('fever');
          if (av.exposure) tags.push(av.exposure === 'cold' ? 'the cold is hurting you' : 'the storm is hurting you');
          if (av.sheltered) tags.push('under a welcoming roof');
          if (av.huntedBy) tags.push(`hunted by ${vname(av.huntedBy)}`);
          if (av.creed) tags.push(`they keep ${av.creed}`);
          if ((av.lives ?? 1) > 1) tags.push(`body ${av.lives}`);
          bodyTags.hidden = !tags.length;
          setText(bodyTags, tags.join(' · ').toUpperCase());
          renderDeeds(opts ?? []);
          const stand = av.standing ?? [];
          const sk = stand.map((x) => `${x.villageId}:${x.value}:${x.level}:${x.remembered.length}`).join();
          if (sk !== standKey) {
            standKey = sk;
            standList.replaceChildren(...stand.map((x) => el('li', { class: x.value < -9 ? 'bad' : '' }, el('b', {}, vname(x.villageId)), el('em', {}, `${x.level} ${x.value > 0 ? '+' : ''}${x.value}`), el('span', {}, x.remembered.length ? `You ${x.remembered.join(', ')}.` : 'They have only seen you.'))));
            standLabel.hidden = standList.hidden = !stand.length;
          }
          const here = nv ? stand.find((x) => x.villageId === nv.id) : undefined;
          if (here && nv && !av.attackers && !av.worshippers) think.textContent = `${name} ${LEVEL_SAY[here.level] ?? 'watches you'}.`;
          const lg = av.log ?? [];
          const lk = `${lg.length}:${lg[lg.length - 1] ?? ''}`;
          if (lk !== logKey) {
            logKey = lk;
            logList.replaceChildren(...lg.slice(-6).map((t) => el('li', {}, `${t}.`)));
            logLabel.hidden = logList.hidden = !lg.length;
          }
          if (av.hp < lastHp) { shake(slotEl); slotEl.classList.add('hurt'); setTimeout(() => slotEl.classList.remove('hurt'), 250); c.audio.sfx('strike'); }
        } else {
          if (bodyState.textContent !== NOBODY) bodyState.textContent = NOBODY;
          lastAct.textContent = '';
          needRow.hidden = bodyTags.hidden = deedsLabel.hidden = deedsBox.hidden = standLabel.hidden = standList.hidden = logLabel.hidden = logList.hidden = true;
          standKey = logKey = '';
        }
        lastHp = av ? av.hp : 100;
        renderTold(f.chronicle);
        renderPeople();
        renderChron();
        if (f.civ.souls !== seenSouls && f.tick > 200) {
          // Remember what was here, for the next look and for the system's cards. A world just opened has nothing to tell yet.
          seenSouls = f.civ.souls;
          setSeen(pKey, { souls: f.civ.souls, year: c.clock.year(), v: Object.fromEntries(f.civ.villages.map((v) => [String(v.id), v.souls])) });
        }
      };
      m = { slot: slotEl, hint, did, when, zoomLabel, rail, walkBtn, souls, villages, glow, tick, onTick, renderSky, skyKeyNow };
      renderSky();
      // An empty sky is the first thing to mend: open on Sky. Otherwise, watch.
      if (!c.sky.skyOf(p).pieces.length) openTab('sky');
    },
    frame: (dt) => {
      if (!ctx?.selection.universe || !m || !planetSpec) return;
      const f = ctx.sim.latest();
      if (!f) return;
      const slot = m.slot;
      if (zoomGoal && !view.fp) {
        const k = Math.pow(zoomGoal / view.zoom, Math.min(1, dt * 0.007));
        const before = view.zoom;
        view.zoom = Math.max(1, Math.min(MAX_ZOOM, view.zoom * k));
        // Keep the centre fixed while gliding; re-clamp and refresh the label.
        const hx = GRID_W / (2 * view.zoom), hy = GRID_H / (2 * view.zoom);
        view.cx = Math.max(hx, Math.min(GRID_W - hx, view.cx)); view.cy = Math.max(hy, Math.min(GRID_H - hy, view.cy));
        const li = layerOf(view.zoom);
        if (li !== lastLayer) { lastLayer = li; ctx.audio.sfx('zoom', li / LAYERS.length); m.hint.textContent = `${LAYERS[li]![1]}: ${LAYERS[li]![2]}`; m.rail.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i <= li)); }
        m.zoomLabel.textContent = LAYERS[li]![1].toUpperCase();
        if (Math.abs(view.zoom - zoomGoal) < 0.03 || Math.abs(view.zoom - before) < 0.0005) { view.zoom = zoomGoal; zoomGoal = 0; }
      }
      // Close layers keep their feet on the ground: the camera follows the terrain under its
      // centre, and while gliding it drifts onto the nearest village.
      if (!view.fp && view.zoom >= 7) {
        const g0 = f.grid;
        const cx = Math.max(0, Math.min(GRID_W - 1, Math.round(view.cx)));
        let gy = 0;
        // Ground is a run of solid cells: rain, cloud and fire in the air are not ground.
        const solid = (y: number) => { const m = g0.cells[y * GRID_W + cx]!; return m !== 0 && m !== 5 && m !== 253; };
        while (gy < GRID_H - 4 && !(solid(gy) && solid(gy + 1) && solid(gy + 2) && solid(gy + 3))) gy++;
        const viewH = GRID_H / view.zoom;
        const k = Math.min(1, dt * 0.006);
        if (zoomGoal && zoomGoal > view.zoom) settle = true;
        const vs = f.civ.villages;
        let near: Village | null = null;
        for (const v of vs) if (!near || Math.abs(v.x - view.cx) < Math.abs(near.x - view.cx)) near = v;
        // Going in, the camera settles on the nearest village and stays on it: the deepest layers
        // show only a few cells, so "nearly there" would be empty sky and rock.
        if (settle) {
          if (near && Math.abs(near.x - view.cx) < 40) { view.cx += (near.x + 0.5 - view.cx) * Math.min(1, k * 2); if (Math.abs(near.x + 0.5 - view.cx) < 0.05 && !zoomGoal) settle = false; }
          else settle = false;
        }
        // A village's own floor is a truer anchor than a column scan when it is right under the view.
        if (near && Math.abs(near.x + 0.5 - view.cx) < 3) gy = near.y + 1;
        view.cy += (gy - viewH * 0.24 - view.cy) * k;
      }
      if (view.fp) {
        const p = view.fp;
        const av0 = f.civ.avatar;
        if (!av0) {
          // The body died (or was given up): you are thrown back into the sky.
          view.cx = p.x; view.zoom = 20; view.fp = null; walking = false;
          m.walkBtn.hidden = true;
          slot.classList.remove('fp');
          const comp = slot.querySelector<HTMLElement>('[data-id=compass]');
          if (comp) comp.hidden = true;
          m.zoomLabel.textContent = LAYERS[layerOf(view.zoom)]![1].toUpperCase();
          m.hint.textContent = 'Your body is gone. You are back above them.';
          m.did.textContent = 'Your body is gone. You are back above them.';
          flash(slot); shake(slot, true); ctx.audio.sfx('lose');
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
      m.tick(dt);
      const cr = ctx.gl.canvas.getBoundingClientRect();
      const sr = slot.getBoundingClientRect();
      const sky = ctx.sky.skyOf(planetSpec);
      ctx.renderers.planet.draw({
        universe: ctx.selection.universe, grid: f.grid, civ: f.civ, env: f.env, sky,
        modifiers: ctx.skyRules.effects(sky, planetSpec), pulse: ctx.pulse().phase(),
        heavens: heavens ?? undefined,
        planet: planetSpec,
        rect: { x: sr.left - cr.left, y: sr.top - cr.top, w: sr.width, h: sr.height },
        view,
        quality: ctx.perf.resolutionScale(),
      }, dt);
      // A deed answers with a new frame on the same tick: the page must not wait for the next one to say so.
      if (f.tick === lastTick && f === lastFrame) return;
      lastTick = f.tick; lastFrame = f;
      m.onTick();
    },
    unmount: () => {
      ctx?.sim.close();
      later = [];
      ctx = null; m = null;
    },
  };
};
