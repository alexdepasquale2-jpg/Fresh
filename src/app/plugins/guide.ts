/**
 * Mote's guide. A core walk (the Box, Falling, Sky, Watching) for a new player, then small
 * lessons offered the first time the player reaches a place (Body, Zoom, Outside, Battle,
 * Merge, the Deep, the Menu). Every lesson is a list of steps; a step moves on only from
 * real game state, from the player's own touch on a real control, or from Mote's "Go on".
 *
 * Mote only watches and points. It never blocks a touch, never clicks for the player, and
 * never throws into the frame loop. The Tutorial page in the hub lists the lessons, replays
 * any of them, and turns hints off.
 */
import './guide.css';
import type { Plugin } from '../plugins';
import type { ScreenId } from '@/contracts/app';
import { SKY_PIECE_KINDS, SKY_MAX_PIECES } from '@/contracts/sky';
import { foldFrame, childScreen } from '@/core/fold-layout';

/** The old save (one linear walk). Read once and migrated; never written again. */
const KEY_V1 = 'sallow-guide-v1';

type LessonId = 'box' | 'fall' | 'sky' | 'watch' | 'body' | 'zoom' | 'outside' | 'battle' | 'merge' | 'deep' | 'floor' | 'menu';
const IDS: readonly LessonId[] = ['box', 'fall', 'sky', 'watch', 'body', 'zoom', 'outside', 'battle', 'merge', 'deep', 'floor', 'menu'];
const CORE: readonly LessonId[] = ['box', 'fall', 'sky', 'watch'];
type Status = 'new' | 'active' | 'done' | 'skipped';
type Marks = Partial<Record<LessonId, boolean>>;
interface Saved {
  v: 2;
  /** The core walk as a whole. */
  core: Status;
  /** The lesson running now, and the step it has reached. Steps only move forward. */
  active: { id: LessonId; step: number } | null;
  collapsed: boolean;
  /** Off: no lesson is ever offered. Replays from the Tutorial page still work. */
  hints: boolean;
  done: Marks;
  /** Offered once already (taken or declined). */
  seen: Marks;
}

interface Rect { x: number; y: number; w: number; h: number }
type Slot = 'above' | 'below' | 'top' | 'bottom';
type Act = 'next' | 'begin' | 'close';
type Side = 'skip' | 'drop' | 'no' | 'none';
interface Cue {
  text: string;
  /** Element to ring. */
  target?: Element | null;
  /** Or a ring drawn at a place on the canvas (viewport px). */
  box?: Rect | null;
  round?: boolean;
  /** A drifting light from the target to here: "drag it there". */
  dragTo?: { x: number; y: number } | null;
  /** Mote's own button under the line. */
  act?: Act;
  actLabel?: string;
  side?: Side;
  place?: Slot;
  /** The 'top' place sits just under this element instead of under the header. */
  under?: Element | null;
  head?: string;
}
interface Step {
  /** Screens this step is taught on. Elsewhere the lesson shows the way back, or waits. */
  scr: readonly ScreenId[];
  cue(): Cue | null;
  /** True once the player has really done it. */
  done?(scr: ScreenId): boolean;
  /** Label of Mote's own button, when the player may (or must) say "go on". */
  go?: string;
  /** Move on by itself after the card has been readable this long (ms). */
  dwell?: number;
}
interface Lesson {
  id: LessonId;
  title: string;
  blurb: string;
  /** Where a replay starts. */
  home: ScreenId;
  /** Listed on the Tutorial page. */
  listed: boolean;
  /** May this lesson be offered right now, on this screen. */
  when?(scr: ScreenId): boolean;
  steps: Step[];
  /** What to say on a screen the current step is not taught on. */
  route?(scr: ScreenId, need: ScreenId): Cue | null;
}

const fresh = (): Saved => ({ v: 2, core: 'new', active: null, collapsed: false, hints: true, done: {}, seen: {} });
/** Where each stage of the old linear walk lands in the lessons. */
const V1_STAGE: readonly (readonly [LessonId, number])[] = [
  ['box', 0], ['box', 1], ['fall', 0], ['fall', 2], ['sky', 0], ['sky', 1], ['watch', 0], ['watch', 1], ['watch', 1], ['watch', 2], ['watch', 2], ['watch', 5], ['watch', 5],
];
const migrateV1 = (): Saved | null => {
  try {
    const raw = localStorage.getItem(KEY_V1);
    if (!raw) return null;
    const o = JSON.parse(raw) as { status?: unknown; stage?: unknown; collapsed?: unknown };
    const s = fresh();
    if (o.status === 'done') { s.core = 'done'; for (const id of CORE) s.done[id] = true; }
    else if (o.status === 'skipped') { s.core = 'skipped'; s.hints = false; }
    else if (o.status === 'active') {
      const at = V1_STAGE[typeof o.stage === 'number' ? Math.max(0, Math.min(V1_STAGE.length - 1, Math.floor(o.stage))) : 0]!;
      s.core = 'active';
      s.active = { id: at[0], step: at[1] };
      for (const id of CORE) { if (id === at[0]) break; s.done[id] = true; }
      s.collapsed = o.collapsed === true;
    } else return null;
    return s;
  } catch { return null; }
};
/** Whatever was stored, made safe. */
const clean = (o: Partial<Saved> | null): Saved => {
  const s = fresh();
  if (!o || typeof o !== 'object') return s;
  if (o.core === 'active' || o.core === 'done' || o.core === 'skipped') s.core = o.core;
  s.collapsed = o.collapsed === true;
  s.hints = o.hints !== false;
  for (const id of IDS) { if (o.done?.[id] === true) s.done[id] = true; if (o.seen?.[id] === true) s.seen[id] = true; }
  const a = o.active;
  if (a && IDS.includes(a.id) && typeof a.step === 'number' && a.step >= 0) s.active = { id: a.id, step: Math.floor(a.step) };
  if (s.core === 'active' && !s.active) s.active = { id: CORE.find((id) => !s.done[id]) ?? 'box', step: 0 };
  return s;
};

/** Screens where the core walk keeps quiet. */
const PAUSED: ReadonlySet<ScreenId> = new Set<ScreenId>(['outside', 'battle', 'mirror']);
/** A waiting line stays at least this long before the line that answers it. */
const READ_MS = 2600;
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five'];
/** Small counts are spoken, the way Mote speaks. */
const word = (n: number): string => WORDS[n] ?? String(n);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const plugin: Plugin = (shell) => {
  const { ctx, layer, host, canvas } = shell;
  const disk = shell.store<Partial<Saved> | null>('guide', null);
  const st: Saved = disk.get() ? clean(disk.get()) : migrateV1() ?? fresh();
  const store = () => disk.set(st);

  // A fresh player starts at once. A returning one who never met the guide is only asked.
  let offer = false;
  if (st.core === 'new') {
    if (shell.resumed) offer = true;
    else { st.core = 'active'; st.active = { id: 'box', step: 0 }; st.collapsed = false; }
  }
  store();

  // ---- DOM (built once) ----
  const mk = (tag: string, cls: string, text = '') => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };
  const root = mk('div', 'guide');
  root.setAttribute('aria-live', 'polite');
  const ring = mk('i', 'guide-ring');
  const drift = mk('i', 'guide-drift');
  const arrow = mk('i', 'guide-arrow');
  const card = mk('section', 'guide-card');
  const dot = mk('button', 'guide-dot') as HTMLButtonElement;
  dot.type = 'button';
  dot.setAttribute('aria-label', 'Hide Mote');
  dot.append(mk('i', 'guide-mote'));
  const head = mk('span', 'guide-head');
  const line = mk('p', 'guide-line');
  const words = mk('div', 'guide-words');
  words.append(head, line);
  const side = mk('button', 'guide-btn guide-side', 'Skip') as HTMLButtonElement;
  side.type = 'button';
  const go = mk('button', 'guide-btn guide-go', 'Go on') as HTMLButtonElement;
  go.type = 'button';
  const acts = mk('div', 'guide-acts');
  acts.append(go, side);
  card.append(dot, words, acts);
  const chip = mk('button', 'guide-chip') as HTMLButtonElement;
  chip.type = 'button';
  chip.setAttribute('aria-label', 'Ask Mote');
  chip.append(mk('i', 'guide-mote'));
  root.append(ring, drift, arrow, card, chip);
  host.append(root);
  // Touches on Mote's own buttons must not reach the world beneath.
  for (const b of [dot, side, go, chip]) b.addEventListener('pointerdown', (e) => e.stopPropagation());

  // ---- transient state ----
  /** Card opened by hand where Mote is otherwise quiet. */
  let peek = false;
  /** A parting line, until closed or the next screen. */
  let note = '';
  let cardH = 0;
  let cardDirty = true;
  let slot: Slot | null = null;
  let act: Act | undefined;
  let sideMode: Side = 'skip';
  let orbitPt: { x: number; y: number } | null = null;
  let orbitAge = 999;
  /** Which step the transient values below belong to. */
  let stepKey = '';
  /** How long the current step's card has been readable (ms). */
  let shown = 0;
  /** data-ids the player has pressed during this step. */
  const pressed = new Set<string>();
  /** Numbers remembered when a step begins (a count before the player changes it). */
  const memo = new Map<string, number>();
  /** Lines that have been shown, and for how long. */
  const read = new Map<string, number>();
  /** A lesson may be offered once per arrival on a screen, in its first moments (ms left). */
  let arrived = 0;
  let frameMs = 16;
  /** A replay is on its way to this screen: nothing is judged until it gets there (or the wait runs out). */
  let bound: ScreenId | null = null;
  let boundMs = 0;

  // The player's own presses on real controls, seen but never taken.
  host.addEventListener('click', (e) => {
    const t = e.target as Element | null;
    if (!t?.closest || root.contains(t)) return;
    const id = t.closest('[data-id]')?.getAttribute('data-id');
    if (id) pressed.add(id);
    // The screen has likely redrawn itself: find the card's place again.
    slot = null;
    if (t.closest('.k-slot')) pressed.add('slot');
    if (t.closest('.k-tile')) pressed.add('tile');
  }, true);

  // ---- reading the game ----
  const q = (sel: string): Element | null => layer.querySelector(sel);
  const byId = (id: string) => q(`[data-id="${id}"]`);
  const isPressed = (id: string) => byId(id)?.getAttribute('aria-pressed') === 'true';
  const sim = () => (shell.current() === 'planet' ? ctx.sim.latest() : null);
  const villages = (): number => sim()?.civ.villages.length ?? 0;
  const lines = (): number => sim()?.chronicle.length ?? 0;
  const avatar = () => sim()?.civ.avatar ?? null;
  const notable = () => sim()?.civ.notable ?? null;
  const planetNow = () => { const sys = ctx.selection.system; return sys ? sys.planets[ctx.selection.planetIndex] ?? sys.planets[0] ?? null : null; };
  /** Pieces hung over the world being watched. */
  const hung = (): number => { const p = planetNow(); return p ? ctx.sky.skyOf(p).pieces.length : 0; };
  /** Pieces hung anywhere in this system. */
  const hungAll = (): number => { let n = 0; const sys = ctx.selection.system; if (sys) for (const p of sys.planets) n += ctx.sky.skyOf(p).pieces.length; return n; };
  const held = (): number => { const inv = ctx.sky.inventory(); let n = 0; for (const k of SKY_PIECE_KINDS) n += inv[k]; return n; };
  /** The first value seen under this name during the current step. */
  const first = (key: string, v: number): number => { const had = memo.get(key); if (had !== undefined) return had; memo.set(key, v); return v; };
  /** The waiting line until `ready`, and never for less than a readable moment once shown. */
  const settle = (key: string, ready: boolean): boolean => { const t = read.get(key) ?? 0; if (ready && (t === 0 || t >= READ_MS)) return true; read.set(key, t + frameMs); return false; };
  /** The wait has gone on long enough that the player may simply go on. */
  const slow = (key: string): boolean => (read.get(key) ?? 0) > 12000;
  const layerNow = (): number => layer.querySelectorAll('.layer-rail i.on').length;
  const inEyes = (): boolean => q('.zoom-label')?.textContent === 'EYES';
  const findSpeed = (): Element | null => { for (const b of layer.querySelectorAll('button')) if (b.textContent?.trim().toLowerCase() === '3x') return b; return null; };
  const findStat = (word: string): Element | null => { for (const s of layer.querySelectorAll('.k-stat')) if (s.textContent?.toLowerCase().includes(word)) return s; return null; };
  /** A point on the innermost drawn orbit, in viewport px, so the drag hint lands on a real ring. */
  const findOrbit = (): { x: number; y: number } | null => {
    // The rings settle as the system opens, so the point is found afresh a few times a second.
    const cr = canvas.getBoundingClientRect();
    const x = cr.width / 2;
    const at = (y: number) => ctx.renderers.system.orbitAt(x, y - cr.top);
    orbitAge += frameMs;
    // A point that is no longer on a ring is thrown away at once.
    if (orbitAge < 250 && orbitPt && at(orbitPt.y) >= 0) return orbitPt;
    orbitAge = 0;
    orbitPt = null;
    const field = byId('orbits');
    if (!field) return null;
    const fr = field.getBoundingClientRect();
    let any = -1;
    for (let y = fr.bottom - 4; y >= fr.top + 4; y -= 4) {
      const o = at(y);
      if (o < 0) continue;
      if (o !== 0) { if (any < 0) any = y; continue; }
      // The middle of the band that counts as this ring, not its edge.
      let top = y;
      while (top - 4 >= fr.top && at(top - 4) === 0) top -= 4;
      orbitPt = { x: cr.left + x, y: (y + top) / 2 };
      return orbitPt;
    }
    orbitPt = any >= 0 ? { x: cr.left + x, y: any - 4 } : null;
    return orbitPt;
  };

  // ---- the dive: looking for a star (also the way back when a later step waits further in) ----
  const diveSays = (): Cue => {
    const v = ctx.dive.view();
    if (v.phase === 'stopped' && v.star) return { text: 'A star. We stop here.' };
    const pips = ctx.light.view().pips;
    const at = v.progress < 600 ? v.children.findIndex((c) => !!c.star) : -1;
    if (at >= 0) {
      if (v.aim === at) return { text: v.phase === 'falling' ? 'Yes. Keep holding. We fall into it.' : 'Now hold, and we fall into it.', target: byId('hold') };
      const cr = canvas.getBoundingClientRect();
      const c = childScreen(foldFrame(ctx.gl.width(), ctx.gl.height(), v.progress, v.aim), at);
      const text = v.phase === 'falling' && v.progress < 500 ? 'There, a star. Let go now, and we stop beside it.' : 'That ring holds a star. Touch it, then hold, and we fall in.';
      return { text, box: { x: cr.left + c.x - c.r, y: cr.top + c.y - c.r, w: c.r * 2, h: c.r * 2 }, round: true };
    }
    if (pips === 0) return { text: 'I am spent. Let go a while. I gather light in the dark.' };
    if (v.phase === 'falling') return { text: v.depth < 2 ? 'Deeper. The stars are further down.' : 'No star in this fold. Keep falling. Touch a ring to steer into it.' };
    return { text: 'Keep falling. Touch any ring to steer into it. We are looking for a star.', target: byId('hold') };
  };
  const diveCue = (c: Cue): Cue => ({ place: 'top', under: q('.depth-bar'), ...c });

  /** The way back into the chain room, box, fall, sky, surface. */
  const coreRoute = (scr: ScreenId, need: ScreenId): Cue | null => {
    if (scr === 'bedroom') return need === 'bedroom' ? null : { text: 'Open the box. We are not done in there.', target: byId('open-box') };
    if (scr === 'box') {
      if (need === 'dive') return { text: 'Choose a universe, then Enter. We were falling.', target: byId('enter') };
      if (need === 'system' || need === 'planet') return { text: 'Worlds takes us straight back to their sky.', target: byId('worlds') ?? byId('enter') };
      return null;
    }
    if (scr === 'dive') return need === 'system' || need === 'planet' ? diveCue(diveSays()) : null;
    if (scr === 'system') return need === 'planet' ? { text: 'Watch the surface. We were not done down there.', target: byId('watch') } : null;
    if (scr === 'planet') return need === 'system' ? { text: 'Their sky is hung from above. Go back up to it.', target: byId('back-sky') } : null;
    return null;
  };
  const toPlanet = (scr: ScreenId): Cue | null => coreRoute(scr, 'planet');

  // ---- the lessons ----
  const LESSONS: Record<LessonId, Lesson> = {
    box: {
      id: 'box', title: 'The Box', blurb: 'Twenty-five small universes, and the one you choose.', home: 'bedroom', listed: true, route: coreRoute,
      steps: [
        { scr: ['bedroom'], cue: () => ({ text: 'I am Mote. I am your light. The box is waiting. Open it.', target: byId('open-box') }), done: (scr) => scr !== 'bedroom' && !PAUSED.has(scr) },
        {
          scr: ['box'],
          cue: () => ({ text: `Each mark is a small universe. You hold ${word(ctx.box.count())} of twenty-five. Touch one, and it tells you what it is.`, target: q('.grid5'), place: 'top' }),
          done: (scr) => pressed.has('slot') || pressed.has('enter') || pressed.has('worlds') || (scr !== 'box' && scr !== 'bedroom' && !PAUSED.has(scr)),
        },
        { scr: ['box'], cue: () => ({ text: 'Its name, its laws, and what you have done there. Enter, and we fall into it.', target: byId('enter'), place: 'top' }), done: (scr) => scr === 'dive' || scr === 'system' || scr === 'planet' },
      ],
    },
    fall: {
      id: 'fall', title: 'Falling', blurb: 'Hold to fall, steer by the rings, stop at a star.', home: 'dive', listed: true, route: coreRoute,
      steps: [
        {
          scr: ['dive'],
          cue: () => diveCue({ text: 'Hold, and we fall. Let go, and we hang where we are.', target: byId('hold') }),
          done: (scr) => {
            if (scr === 'system' || scr === 'planet') return true;
            if (scr !== 'dive') return false;
            const v = ctx.dive.view();
            if (v.phase === 'falling') memo.set('fell', (memo.get('fell') ?? 0) + 1);
            return v.depth > first('depth', v.depth) || (memo.get('fell') ?? 0) > 40;
          },
        },
        {
          scr: ['dive'],
          cue: () => diveCue({ text: `That is my Light, ${word(ctx.light.view().pips)} of eight. Every fold we fall costs me some. At nothing, we rise again.`, target: q('.k-pips'), place: 'below' }),
          done: (scr) => scr === 'system' || scr === 'planet' || (ctx.dive.view().phase === 'stopped' && !!ctx.dive.view().star),
          dwell: 5200,
        },
        { scr: ['dive'], cue: () => diveCue(diveSays()), done: (scr) => scr === 'system' || scr === 'planet' },
      ],
    },
    sky: {
      id: 'sky', title: 'Sky', blurb: 'Their sky is the only thing you may touch.', home: 'system', listed: true, route: coreRoute,
      steps: [
        {
          scr: ['system'],
          cue: () => {
            const inv = ctx.sky.inventory();
            const kind = inv.moon > 0 ? 'moon' : SKY_PIECE_KINDS.find((k) => inv[k] > 0);
            const tile = kind ? q(`[data-kind="${kind}"]`) : null;
            if (!kind || !tile) return { text: 'This is their sky. It is your only lever. You hold no pieces now, so watch the surface. One can be made there.', target: byId('watch') };
            return { text: `This is their sky. It is your only lever. Drag the ${kind} up onto a ring.`, target: tile, dragTo: findOrbit(), place: 'top' };
          },
          done: (scr) => (scr === 'system' && hungAll() > first('all', hungAll())) || (scr === 'planet' && held() === 0),
        },
        { scr: ['system'], cue: () => ({ text: 'It is theirs now. It will pull at their seas and their sleep. Now watch the surface.', target: byId('watch') }), done: (scr) => scr === 'planet' },
        { scr: ['planet'], cue: () => ({ text: 'These words are their sky as they see it: their sun, their wanderers, and what you hung there.', target: q('.sky-says') }), go: 'Go on' },
        {
          scr: ['planet'],
          cue: () => {
            const inv = ctx.sky.inventory();
            const kind = SKY_PIECE_KINDS.find((k) => inv[k] > 0);
            if (kind) return { text: `You can hang a piece from here too. Hang the ${kind}.`, target: byId(`sky-add-${kind}`) };
            return { text: 'You hold nothing, but I can make a piece out of my own Light. It costs one. Hang any of them.', target: q('.sky-add:not(:disabled)') ?? byId('sky-panel') };
          },
          done: (scr) => scr === 'planet' && (hung() > first('hung', hung()) || hung() >= SKY_MAX_PIECES || (held() === 0 && !ctx.light.canSpend(1))),
        },
        {
          scr: ['planet'],
          cue: () => ({ text: `A sky holds ${word(SKY_MAX_PIECES)}. Touch one that hangs there and it comes down, back into your hand.`, target: byId('sky-take-0') ?? byId('sky-panel') }),
          done: (scr) => scr === 'planet' && (hung() < first('hung', hung()) || hung() === 0),
          go: 'Go on',
        },
      ],
    },
    watch: {
      id: 'watch', title: 'Watching', blurb: 'Time, villages, their chronicle, and the one it names.', home: 'planet', listed: true, route: coreRoute,
      steps: [
        { scr: ['planet'], cue: () => ({ text: 'Their years are slow. Further down, set time to 3x.', target: findSpeed() }), done: () => ctx.clock.speed() === 3 },
        {
          scr: ['planet'],
          cue: () => (settle('village', villages() > 0)
            ? { text: `${villages() === 1 ? 'A village' : `${cap(word(villages()))} villages`}. They light their lamps under the sky you gave them. Their glow rises to me. It is your Light.`, target: findStat('glow'), act: 'next' }
            : slow('village')
              ? { text: 'No one has come yet. Some worlds are slow, and some stay empty for ever. Sow sets a people down, if you will not wait.', target: byId('tool-sow'), act: 'next' }
              : { text: 'Now only watch. Someone will come, and they will build.', target: byId('surface') }),
        },
        {
          scr: ['planet'],
          cue: () => (settle('chron', lines() > 0)
            ? { text: 'They write down what befalls them, and why. They do not know you, but they feel their sky. Change it, and the story changes.', target: q('.chronicle'), act: 'next' }
            : slow('chron')
              ? { text: 'Nothing is written yet. When something befalls them it will be set down here, with its reason.', target: q('.chronicle'), act: 'next' }
              : { text: 'They write down what befalls them. Watch their chronicle.', target: q('.chronicle') }),
        },
        {
          scr: ['planet'],
          cue: () => {
            const n = notable();
            if (settle('named', !!n) && n) return { text: `The chronicle follows one of them by name. This one is ${n.name}. Press Find.`, target: byId('notable-find') };
            return { text: 'Soon the chronicle will choose one of them to follow by name.', target: findStat('souls'), act: 'next', actLabel: 'Go on' };
          },
          done: () => pressed.has('notable-find'),
        },
        { scr: ['planet'], cue: () => ({ text: 'There. I will stay with them a few breaths. Press − to climb back out.', target: byId('surface'), act: 'next' }) },
        {
          scr: ['planet', 'system', 'box', 'bedroom', 'dive'],
          cue: () => ({ text: 'That is the whole of it. Fall, hang a sky, watch. The rest I will tell you when we come to it. Outside the room there are other children, with boxes of their own.', act: 'next', actLabel: 'I will', side: 'none' }),
        },
      ],
    },
    body: {
      id: 'body', title: 'Body', blurb: 'Walk among them, and see through its eyes.', home: 'planet', listed: true, route: toPlanet,
      when: (scr) => scr === 'planet' && !!sim(),
      steps: [
        { scr: ['planet'], cue: () => ({ text: 'You may go down among them. Choose Body.', target: byId('tool-body') }), done: () => isPressed('tool-body') || !!avatar() },
        { scr: ['planet'], cue: () => ({ text: 'Now touch the ground where you would stand.', target: byId('surface') }), done: () => !!avatar() },
        {
          scr: ['planet'],
          cue: () => ({ text: 'You have a body. Unless they are wise, they will try to kill it. Strike, Preach, Gift, Shine and Rest are yours. Try one.', target: q('.body-row') }),
          done: () => !avatar() || ['act-strike', 'act-preach', 'act-gift', 'act-shine', 'act-rest'].some((id) => pressed.has(id)),
        },
        { scr: ['planet'], cue: () => ({ text: 'Eyes opens its eyes. You will stand where it stands.', target: byId('eyes') }), done: () => !avatar() || inEyes() },
        { scr: ['planet'], cue: () => ({ text: 'Drag to look. Hold WALK to move. Press − to leave its eyes.', target: byId('zoom-out') }), done: () => !avatar() || !inEyes() },
        {
          scr: ['planet'],
          cue: () => (avatar()
            ? { text: 'Ascend gives the body up when you are done with it. They will remember that you came.', target: byId('ascend'), act: 'next', actLabel: 'Good' }
            : { text: 'The body is gone. They are not always kind. You may take another whenever you wish.', act: 'next', actLabel: 'Good' }),
          done: () => pressed.has('ascend'),
        },
      ],
    },
    zoom: {
      id: 'zoom', title: 'Zoom layers', blurb: 'Ten layers, from the whole world down to their hands.', home: 'planet', listed: true, route: toPlanet,
      when: (scr) => scr === 'planet' && !!sim(),
      steps: [
        { scr: ['planet'], cue: () => ({ text: 'Press + to lean in. Each press is one layer closer.', target: byId('zoom-in') }), done: () => layerNow() > Math.max(1, first('layer', layerNow())) || inEyes() },
        { scr: ['planet'], cue: () => ({ text: 'The marks down the side count the layers. There are ten. Go as far as the Village.', target: q('.layer-rail') }), done: () => layerNow() >= 4 || inEyes() },
        { scr: ['planet'], cue: () => ({ text: 'Doors, smoke, boats. Past the last layer you need a body to go on. Press − to climb back to the World.', target: byId('zoom-out') }), done: () => layerNow() <= 1 && !inEyes(), go: 'Go on' },
      ],
    },
    outside: {
      id: 'outside', title: 'Outside', blurb: 'Other children keep boxes too.', home: 'outside', listed: true,
      when: (scr) => scr === 'outside',
      steps: [
        { scr: ['outside'], cue: () => ({ text: 'Out here each universe fights as its creature. These are your three strongest. Tend their worlds and they grow.', target: q('.team') }), go: 'Go on', done: (scr) => scr === 'battle' },
        { scr: ['outside'], cue: () => ({ text: 'Their boxes are hungry. Find one of them.', target: q('.rival button:not(:disabled)') }), done: (scr) => scr === 'battle' },
      ],
    },
    battle: {
      id: 'battle', title: 'A first battle', blurb: 'Their intent, your moves, guard, fuse, swap, and the catch.', home: 'outside', listed: true,
      when: (scr) => scr === 'battle' && ctx.battle?.outcome === 'ongoing',
      route: (scr) => (scr === 'outside' ? { text: 'Find one of them, and I will show you how it goes.', target: q('.rival button:not(:disabled)') } : null),
      steps: [
        {
          scr: ['battle'],
          cue: () => ({ text: `That mark is what they will do next. Now it reads ${ctx.battle?.intent.label ?? 'nothing'}. Whoever is faster acts first.`, target: q('.intent') }),
          go: 'Go on', done: () => over() || turns() > first('turn', turns()),
        },
        {
          scr: ['battle'],
          cue: () => ({ text: `Each move costs Light, written under it. Yours has ${word(energy())} of six, the small lamps by its HP. Strike is free. Make a move.`, target: q('.skills'), place: 'top' }),
          done: () => over() || turns() > first('turn', turns()),
        },
        {
          scr: ['battle'],
          cue: () => ({ text: 'Guard turns most of a blow aside and gives one Light back. Use it when their mark shows something heavy.', target: byId('guard') }),
          go: 'Go on', done: () => over() || pressed.has('guard'),
        },
        {
          scr: ['battle'],
          cue: () => (byId('fuse')
            ? { text: 'Swap sends another of yours forward. Fuse makes two of yours one, with both their skills. Once a battle.', target: byId('fuse') }
            : { text: 'With more than one universe you could Swap another forward, or Fuse two into one.', target: byId('go-in') }),
          go: 'Go on', done: () => over(),
        },
        {
          scr: ['battle'],
          cue: () => ({ text: 'The fight waits if you go inside your universe and change it. What they become down there, it becomes up here.', target: byId('go-in') }),
          go: 'Go on', done: () => over(),
        },
        {
          scr: ['battle'],
          cue: () => {
            const o = ctx.battle?.outcome;
            if (o === 'won') return { text: 'Their box is open. Choose one of theirs. It comes home with you.', target: q('.catch-row') };
            if (o === 'lost') return { text: 'It went dark. I dim by one. Tend their worlds and come back stronger.', target: byId('home') };
            return null;
          },
          done: (scr) => {
            if (over()) memo.set('ended', 1);
            // Caught (the battle screen with no battle left), or walked away from a fight that was decided.
            return (scr === 'battle' && !ctx.battle) || (memo.has('ended') && (!ctx.battle || scr !== 'battle'));
          },
        },
        {
          scr: ['battle', 'outside', 'bedroom'],
          cue: () => ({ text: 'That is a battle. Win, and one of theirs is yours to keep. Lose, and I dim. The next one is always further out.', act: 'next', actLabel: 'Good', side: 'none' }),
        },
      ],
    },
    merge: {
      id: 'merge', title: 'Merge', blurb: 'Two things in the box can be made into one.', home: 'box', listed: true,
      when: (scr) => scr === 'box' && ctx.box.count() >= 2,
      steps: [
        { scr: ['box'], cue: () => ({ text: 'Two things in the box can be made into one new thing. Press Merge.', target: byId('merge-mode') }), done: () => isPressed('merge-mode') },
        {
          scr: ['box'],
          cue: () => ({ text: 'Touch any two: universes, sky pieces, or one of each. I will tell you what they would make before you agree.', target: q('.grid5') }),
          done: () => !isPressed('merge-mode') || (!!byId('do-merge') && !(byId('do-merge') as HTMLButtonElement).disabled),
        },
        {
          scr: ['box'],
          cue: () => ({ text: 'Read what it makes. Both are spent, and it cannot be undone. Merge, or press Merging to leave them be.', target: byId('do-merge') }),
          done: () => pressed.has('do-merge') || !isPressed('merge-mode'),
        },
        { scr: ['box'], cue: () => ({ text: 'Merging always makes something new, and never the same thing twice.', act: 'next', actLabel: 'Good', side: 'none' }) },
      ],
    },
    deep: {
      id: 'deep', title: 'The Deep', blurb: 'Every universe has a floor.', home: 'dive', listed: true,
      when: (scr) => scr === 'dive',
      route: (scr) => (scr === 'box' ? { text: 'Enter one, and I will tell you what lies under it.', target: byId('enter') } : null),
      steps: [
        {
          scr: ['dive'],
          cue: () => {
            const v = ctx.dive.view();
            const n = v.toBottom === undefined ? '' : ` This one lies ${v.depth + v.toBottom} folds down.`;
            return diveCue({ text: `The folds do not go on for ever. Every universe has a floor.${n} I cannot reach it in one breath. Their glow is how I grow.`, act: 'next' });
          },
          dwell: 12000,
        },
      ],
    },
    floor: {
      id: 'floor', title: 'The floor', blurb: '', home: 'dive', listed: false,
      when: (scr) => scr === 'dive' && (ctx.dive.view().toBottom ?? 99) <= 6 && ctx.dive.view().phase !== 'surfaced',
      steps: [
        {
          scr: ['dive'],
          cue: () => diveCue({ text: 'Something is below. That mark on the bar is the floor. Keep falling. Someone is down there.', target: q('.depth-bar'), place: 'below' }),
          done: (scr) => scr !== 'dive' || !!ctx.dive.view().bottom || ctx.dive.view().phase === 'surfaced',
        },
      ],
    },
    menu: {
      id: 'menu', title: 'The Menu', blurb: 'The mark in the corner, and what it keeps.', home: 'bedroom', listed: true,
      when: (scr) => scr === 'bedroom',
      steps: [
        { scr: ['bedroom', 'box', 'system', 'planet', 'outside'], cue: () => ({ text: 'The small mark in the corner is the menu. Everything that is not the world is kept there. Open it.', target: hubBtn(), place: 'top' }), done: () => shell.menu.isOpen() },
        { scr: ['bedroom', 'box', 'system', 'planet', 'outside'], cue: () => null, done: () => !shell.menu.isOpen() },
        {
          scr: ['bedroom', 'box', 'system', 'planet', 'outside'],
          cue: () => ({ text: 'What I have shown you is kept under Tutorial. Any lesson can be walked again from there, and I can be told to keep quiet.', target: hubBtn(), place: 'top', act: 'next', actLabel: 'Good', side: 'none' }),
        },
      ],
    },
  };
  const hubBtn = (): Element | null => host.querySelector('[data-id="hub"]');
  /** The fight on the table has been decided. (No fight at all is not an ending: Mote waits for one.) */
  const over = (): boolean => !!ctx.battle && ctx.battle.outcome !== 'ongoing';
  const turns = (): number => ctx.battle?.turn ?? 0;
  const energy = (): number => { const b = ctx.battle; return b ? b.mine[b.myActive]?.energy ?? 0 : 0; };
  /** Offered in this order when more than one fits a screen. */
  const OFFERS: readonly LessonId[] = ['menu', 'body', 'zoom', 'merge', 'deep', 'floor', 'outside', 'battle'];

  // ---- moving through lessons ----
  const isCore = (id: LessonId) => CORE.includes(id);
  const resetStep = () => { stepKey = ''; shown = 0; pressed.clear(); memo.clear(); read.clear(); slot = null; };
  const start = (id: LessonId) => { st.active = { id, step: 0 }; st.seen[id] = true; st.collapsed = false; peek = false; note = ''; resetStep(); store(); };
  const begin = () => {
    st.core = 'active';
    // Asking for the walk is asking for Mote: hints come back on.
    st.hints = true;
    for (const id of CORE) delete st.done[id];
    offer = false;
    start('box');
  };
  const endLesson = () => {
    const a = st.active;
    if (!a) return;
    st.done[a.id] = true;
    st.active = null;
    if (isCore(a.id) && st.core === 'active') {
      const next = CORE.find((id) => !st.done[id]);
      if (next) st.active = { id: next, step: 0 };
      else st.core = 'done';
    }
    resetStep();
    store();
  };
  const nextStep = () => {
    const a = st.active;
    if (!a) return;
    a.step++;
    resetStep();
    if (a.step >= LESSONS[a.id].steps.length) endLesson(); else store();
  };
  /** Skip: the walk ends and Mote keeps quiet until asked. */
  const skipAll = () => {
    st.core = 'skipped'; st.active = null; st.collapsed = false; st.hints = false;
    offer = false; peek = false;
    note = '';
    // A parting line that asks nothing and takes no touch.
    shell.toast('As you wish. I will keep quiet. I am in the menu, under Tutorial, if you want me.', { title: 'Mote', sfx: '' });
    resetStep();
    store();
  };
  /** Not now: this one lesson is put away. It stays on the Tutorial page. */
  const drop = () => { st.active = null; st.collapsed = false; peek = false; note = ''; resetStep(); store(); };
  const travel = (to: ScreenId) => {
    bound = to; boundMs = 5000;
    try { ctx.go(to); } catch { bound = null; /* the way there is shut: Mote points instead */ }
  };
  const replay = (id: LessonId) => {
    const L = LESSONS[id];
    offer = false;
    if (st.core === 'new') st.core = 'skipped';
    // Walking one lesson again is not the whole walk.
    if (st.core === 'active') st.core = CORE.every((c) => st.done[c] || c === id) ? 'done' : 'skipped';
    start(id);
    const scr = shell.current();
    const s0 = L.steps[0];
    if (scr && s0 && !s0.scr.includes(scr)) travel(L.home);
  };

  go.addEventListener('click', () => {
    // Mote has just finished speaking: no new lesson starts in the same breath.
    if (act === 'next') { arrived = 0; nextStep(); }
    else if (act === 'begin') begin();
    else if (act === 'close') { peek = false; note = ''; }
  });
  side.addEventListener('click', () => {
    if (sideMode === 'skip') skipAll();
    else if (sideMode === 'drop') drop();
    else if (offer) { offer = false; st.core = 'skipped'; store(); }
    else { peek = false; note = ''; }
  });
  dot.addEventListener('click', () => {
    if (note) { note = ''; return; }
    if (st.active && !peek) { st.collapsed = true; store(); } else peek = false;
  });
  chip.addEventListener('click', () => {
    if (st.active && st.collapsed) { st.collapsed = false; store(); } else peek = true;
  });
  shell.onNavigate(() => { peek = false; note = ''; slot = null; orbitPt = null; orbitAge = 999; arrived = 3000; });
  window.addEventListener('resize', () => { cardDirty = true; });
  // A scrolled screen has moved its controls: let the card find the emptiest place again.
  layer.addEventListener('scroll', () => { slot = null; }, { passive: true, capture: true });

  /** Move the running lesson forward from what the player has really done. */
  const advance = (scr: ScreenId) => {
    for (let guard = 0; guard < 8; guard++) {
      const a = st.active;
      if (!a) return;
      const L = LESSONS[a.id];
      const s = L.steps[a.step];
      if (!s) { endLesson(); continue; }
      const key = `${a.id}:${a.step}`;
      if (key !== stepKey) { resetStep(); stepKey = key; }
      if (s.done?.(scr) || (s.dwell !== undefined && shown >= s.dwell)) { nextStep(); continue; }
      return;
    }
  };
  /** The first time the player reaches a place, a lesson for it may begin. */
  const maybeOffer = (scr: ScreenId) => {
    if (arrived <= 0) return;
    arrived -= frameMs;
    if (st.active || offer || note || shell.menu.isOpen() || !st.hints || st.core === 'new' || st.core === 'active') return;
    for (const id of OFFERS) {
      if (st.done[id] || st.seen[id]) continue;
      if (LESSONS[id].when?.(scr)) { arrived = 0; start(id); return; }
    }
  };
  // The floor announces itself in the middle of a fall, not on arrival.
  const maybeFloor = (scr: ScreenId) => {
    if (scr !== 'dive' || st.active || !st.hints || st.seen.floor || st.core === 'new' || st.core === 'active') return;
    if (LESSONS.floor.when?.(scr)) start('floor');
  };

  const WALK: Cue = { text: 'Shall I walk with you again, from the beginning. The single lessons are in the menu, under Tutorial.', act: 'begin', actLabel: 'Walk with me', side: 'no', place: 'top' };
  /** What Mote says and points at on this screen right now, or null to stay quiet. */
  const pickCue = (scr: ScreenId): Cue | null => {
    if (shell.menu.isOpen()) return null;
    if (note) return { text: note, act: 'close', actLabel: 'Good', side: 'none', place: 'top' };
    if (offer) return scr === 'bedroom' ? { text: 'You have been here before. Shall I walk with you once, from the beginning.', act: 'begin', actLabel: 'Walk with me', side: 'no', place: 'top' } : null;
    const a = st.active;
    if (!a) return peek ? WALK : null;
    if (st.collapsed) return null;
    const L = LESSONS[a.id];
    const s = L.steps[a.step];
    if (!s) return null;
    const core = isCore(a.id);
    const walking = core && st.core === 'active';
    let cue: Cue | null = null;
    if (!(core && PAUSED.has(scr))) cue = s.scr.includes(scr) ? s.cue() : L.route?.(scr, s.scr[0] ?? L.home) ?? null;
    if (!cue) {
      if (!peek) return null;
      return core
        ? { text: 'This is your own business. I will go on when we are home.', act: 'close', actLabel: 'Good', side: walking ? 'skip' : 'drop', place: 'top' }
        : { text: `${L.title}. I am waiting until we are there again.`, act: 'close', actLabel: 'Good', side: 'drop', place: 'top' };
    }
    if (s.go && !cue.act) { cue.act = 'next'; cue.actLabel = s.go; }
    // Skip ends the whole first walk. A lesson walked again on its own is only put away.
    cue.side ??= walking ? 'skip' : 'drop';
    cue.head ??= L.steps.length > 1 ? `${L.title} · ${Math.min(a.step + 1, L.steps.length)}/${L.steps.length}` : L.title;
    return cue;
  };

  // ---- drawing (writes only what changed) ----
  const last = new Map<string, string>();
  const put = (key: string, e: HTMLElement, prop: 'transform' | 'width' | 'height', v: string) => {
    if (last.get(key) === v) return;
    last.set(key, v);
    e.style[prop] = v;
  };
  const cls = (key: string, e: HTMLElement, name: string, on: boolean) => {
    const v = on ? '1' : '0';
    if (last.get(key) === v) return;
    last.set(key, v);
    e.classList.toggle(name, on);
  };
  const show = (key: string, e: HTMLElement, on: boolean) => cls(key, e, 'on', on);
  const txt = (key: string, e: HTMLElement, v: string) => {
    if (last.get(key) === v) return false;
    last.set(key, v);
    e.textContent = v;
    return true;
  };
  const hits = (y: number, h: number, r: Rect) => y < r.y + r.h && y + h > r.y;
  /** How many of the screen's own controls a card at this height would lie over. */
  const covered = (y: number, h: number): number => {
    let n = 0;
    for (const e of layer.querySelectorAll('button, [data-drag], input')) {
      const r = e.getBoundingClientRect();
      if (r.height > 0 && r.top < y + h && r.bottom > y) n++;
    }
    return n;
  };
  const SIDE_LABEL: Record<Side, string> = { skip: 'Skip', drop: 'Not now', no: 'No', none: '' };
  /** The 390x844 play frame, centred in the window. Steady even while a screen is mid-transition. */
  const frameRect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const measure = () => {
    const hr = host.getBoundingClientRect();
    const cs = getComputedStyle(layer);
    const w = Math.min(hr.width, parseFloat(cs.maxWidth) || 390, 390), h = Math.min(hr.height, 844);
    frameRect.width = w; frameRect.height = h;
    frameRect.left = hr.left + (hr.width - w) / 2; frameRect.top = hr.top + (hr.height - h) / 2;
    frameRect.right = frameRect.left + w; frameRect.bottom = frameRect.top + h;
  };

  const draw = (scr: ScreenId, cue: Cue | null): boolean => {
    measure();
    const b = frameRect;
    // The chip: Mote, small, waiting to be asked. Never under the menu button.
    const chipOn = !cue && !offer && !shell.menu.isOpen() && (st.active ? true : scr === 'bedroom');
    show('chip', chip, chipOn);
    if (chipOn) {
      // Off-script screens keep their cards clear: Mote waits beside the way back.
      const aside = PAUSED.has(scr);
      const cx = aside ? b.left + 100 : scr === 'dive' ? b.left + b.width / 2 - 22 : b.right - 52;
      put('chip-t', chip, 'transform', `translate(${Math.round(cx)}px,${Math.round(b.top + (aside ? 16 : 60))}px)`);
    }
    show('card', card, !!cue);
    if (!cue) { show('ring', ring, false); show('drift', drift, false); show('arrow', arrow, false); slot = null; return false; }

    // Words and buttons.
    // New words take their place at once; only a card following its target glides.
    const said = txt('line', line, cue.text);
    if (said) { cardDirty = true; slot = null; }
    cls('snap', card, 'snap', said);
    if (txt('head', head, cue.head ?? '')) cardDirty = true;
    act = cue.act;
    sideMode = cue.side ?? 'skip';
    if (txt('go', go, cue.act ? cue.actLabel ?? 'Go on' : '')) cardDirty = true;
    cls('go-on', go, 'on', !!cue.act);
    if (txt('side', side, SIDE_LABEL[sideMode])) cardDirty = true;
    cls('side-on', side, 'on', sideMode !== 'none');
    const w = Math.round(b.width - 16);
    if (last.get('card-w') !== `${w}px`) cardDirty = true;
    put('card-w', card, 'width', `${w}px`);
    if (cardDirty) { cardH = card.offsetHeight; cardDirty = false; }

    // The thing pointed at.
    let hi: Rect | null = null;
    if (cue.box) hi = cue.box;
    else if (cue.target?.isConnected) {
      const r = cue.target.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) hi = { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    // Scrolled out of sight: point the way instead of ringing it.
    let off = 0;
    if (hi && !cue.box) {
      if (hi.y + Math.min(hi.h, 44) / 2 > b.bottom - 4) off = 1;
      else if (hi.y + hi.h - Math.min(hi.h, 44) / 2 < b.top + 4) off = -1;
    }
    show('arrow', arrow, off !== 0);
    if (off !== 0) {
      put('arrow-t', arrow, 'transform', `translate(${Math.round(b.left + b.width / 2 - 22)}px,${Math.round(off > 0 ? b.bottom - 52 : b.top + 8)}px) rotate(${off > 0 ? 0 : 180}deg)`);
      hi = null;
    }
    show('ring', ring, !!hi);
    if (hi) {
      // The ring is clipped to the frame so a tall or wide target never draws outside it.
      const pad = cue.round ? 2 : 5;
      const x0 = Math.max(b.left + 1, hi.x - pad), y0 = Math.max(b.top + 1, hi.y - pad);
      const x1 = Math.min(b.right - 1, hi.x + hi.w + pad), y1 = Math.min(b.bottom - 1, hi.y + hi.h + pad);
      put('ring-t', ring, 'transform', `translate(${Math.round(x0)}px,${Math.round(y0)}px)`);
      put('ring-w', ring, 'width', `${Math.max(0, Math.round(x1 - x0))}px`);
      put('ring-h', ring, 'height', `${Math.max(0, Math.round(y1 - y0))}px`);
      cls('ring-round', ring, 'round', !!cue.round || !!cue.target?.classList.contains('k-hold'));
    }
    const to = hi && cue.dragTo ? cue.dragTo : null;
    show('drift', drift, !!to);
    if (hi && to) {
      const sx = hi.x + hi.w / 2, sy = hi.y + hi.h / 2;
      put('drift-t', drift, 'transform', `translate(${Math.round(sx)}px,${Math.round(sy)}px)`);
      const d = `${Math.round(to.x - sx)}px,${Math.round(to.y - sy)}px`;
      if (last.get('drift-d') !== d) {
        last.set('drift-d', d);
        drift.style.setProperty('--dx', `${Math.round(to.x - sx)}px`);
        drift.style.setProperty('--dy', `${Math.round(to.y - sy)}px`);
      }
    }

    // Where the card sits: never over what it points at, never under the menu button.
    const h = cardH;
    const minY = b.top + 58, maxY = b.bottom - 8 - h;
    const under = Math.max(minY, cue.under?.isConnected ? cue.under.getBoundingClientRect().bottom + 10 : b.top + 64);
    const yOf = (s: Slot): number => (s === 'top' ? under : s === 'bottom' ? maxY : hi ? (s === 'above' ? hi.y - 18 - h : hi.y + hi.h + 18) : NaN);
    const clear = (y: number): boolean => {
      if (hi && hits(y, h, { x: hi.x, y: hi.y - 10, w: hi.w, h: hi.h + 20 })) return false;
      if (to && hits(y, h, { x: to.x - 30, y: to.y - 30, w: 60, h: 60 })) return false;
      return true;
    };
    const ok = (s: Slot): boolean => { const y = yOf(s); return y >= minY && y <= maxY && clear(y); };
    if (!slot || !ok(slot)) {
      const low = hi ? hi.y + hi.h / 2 > b.top + b.height / 2 : true;
      const order: Slot[] = low ? ['above', 'below', 'top', 'bottom'] : ['below', 'above', 'bottom', 'top'];
      if (cue.place) order.unshift(cue.place);
      // Of the places that stand clear of the target, take the one that covers the fewest things to press.
      let best: Slot | null = null, cost = 1e9;
      for (const s of order) {
        if (!ok(s)) continue;
        const c = covered(yOf(s), h);
        if (c < cost) { best = s; cost = c; }
      }
      slot = best ?? (low ? 'top' : 'bottom');
    }
    let y = yOf(slot);
    y = Number.isNaN(y) ? minY : Math.max(minY, Math.min(maxY, y));
    // A target too large to stand clear of: sit on whichever edge hides least of it.
    if (hi && !clear(y)) y = hi.y + hi.h / 2 > b.top + b.height / 2 ? (clear(minY) ? minY : y) : (clear(maxY) ? maxY : y);
    put('card-t', card, 'transform', `translate(${Math.round(b.left + 8)}px,${Math.round(y)}px)`);
    return true;
  };

  shell.onFrame((dt) => {
    try {
      const scr = shell.current();
      if (!scr) return;
      frameMs = Math.min(100, dt);
      if (bound) { boundMs -= frameMs; if (scr === bound || boundMs <= 0) bound = null; }
      if (bound) { draw(scr, null); return; }
      if (st.active) advance(scr); else { maybeOffer(scr); maybeFloor(scr); }
      const on = draw(scr, pickCue(scr));
      if (on && st.active && !note) shown += frameMs;
    } catch (e) {
      // Mote goes quiet rather than break the game.
      root.hidden = true;
      console.error('guide', e);
    }
  });

  // ---- the Tutorial page in the hub ----
  shell.menu.add({
    id: 'tutorial',
    label: 'Tutorial',
    hint: 'What Mote has shown you. Walk any of it again.',
    order: 20,
    render: (into, close) => {
      const page = mk('div', 'guide-page');
      const list = mk('div', 'guide-list');
      const hints = mk('button', 'hub-item guide-switch') as HTMLButtonElement;
      hints.type = 'button';
      hints.dataset.id = 'tutorial-hints';
      const walk = mk('button', 'hub-item') as HTMLButtonElement;
      walk.type = 'button';
      walk.dataset.id = 'tutorial-walk';
      const paint = () => {
        const count = IDS.filter((id) => LESSONS[id].listed && st.done[id]).length;
        const total = IDS.filter((id) => LESSONS[id].listed).length;
        hints.setAttribute('aria-pressed', String(st.hints));
        const hl = mk('span', '', 'Hints');
        hl.append(mk('small', '', st.hints ? 'Mote speaks up the first time you reach a new place.' : 'Mote keeps quiet until you ask here.'));
        hints.replaceChildren(hl, mk('b', '', st.hints ? 'ON' : 'OFF'));
        const wl = mk('span', '', 'Walk with me');
        wl.append(mk('small', '', `The first walk again, from the room. ${cap(word(count))} of ${word(total)} lessons learned.`));
        walk.replaceChildren(wl);
        list.replaceChildren(...IDS.filter((id) => LESSONS[id].listed).map((id) => {
          const L = LESSONS[id];
          const b = mk('button', `hub-item guide-lesson${st.done[id] ? ' done' : ''}${st.active?.id === id ? ' now' : ''}`) as HTMLButtonElement;
          b.type = 'button';
          b.dataset.id = `tutorial-${id}`;
          const mark = mk('i', 'guide-mark', st.done[id] ? '✓' : '');
          mark.setAttribute('aria-label', st.done[id] ? 'learned' : 'not yet');
          const t = mk('span', '', L.title);
          t.append(mk('small', '', L.blurb));
          b.append(mark, t);
          if (st.active?.id === id) b.append(mk('b', '', 'NOW'));
          b.addEventListener('click', () => { close(); replay(id); });
          return b;
        }));
      };
      hints.addEventListener('click', () => {
        st.hints = !st.hints;
        // Turning hints off also puts away whatever Mote was in the middle of.
        if (!st.hints) { if (st.core === 'active' || st.core === 'new') st.core = 'skipped'; st.active = null; offer = false; resetStep(); }
        store();
        paint();
      });
      walk.addEventListener('click', () => { close(); begin(); if (shell.current() !== 'bedroom') travel('bedroom'); });
      paint();
      page.append(mk('p', 'guide-page-says', 'Each lesson teaches one thing. Touch one and I will show it to you again, where it happens.'), hints, walk, mk('span', 'guide-page-label', 'Lessons'), list);
      into.append(page);
    },
  });
};
