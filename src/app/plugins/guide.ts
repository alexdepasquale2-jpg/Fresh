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

type LessonId = 'box' | 'fall' | 'sky' | 'watch' | 'zoom' | 'tools' | 'body' | 'people' | 'chron' | 'skytab' | 'system' | 'deep' | 'depths' | 'flicker' | 'floor'
  | 'outside' | 'battle' | 'merge' | 'manage' | 'room' | 'street' | 'mirror' | 'menu';
/** In the order they are listed and counted ("lesson 3 of 21"). */
const IDS: readonly LessonId[] = ['box', 'fall', 'sky', 'watch', 'zoom', 'tools', 'body', 'people', 'chron', 'skytab', 'system', 'deep', 'depths', 'flicker', 'floor',
  'outside', 'battle', 'merge', 'manage', 'room', 'street', 'mirror', 'menu'];
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
  /** Small things said once: a hub page explained, the end-of-dive summary. */
  told: string[];
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
  /** Take `place` whatever lies under it (a page that fills the screen). */
  fix?: boolean;
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

const fresh = (): Saved => ({ v: 2, core: 'new', active: null, collapsed: false, hints: true, done: {}, seen: {}, told: [] });
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
  if (Array.isArray(o.told)) for (const t of o.told) if (typeof t === 'string' && s.told.length < 64) s.told.push(t);
  const a = o.active;
  if (a && IDS.includes(a.id) && typeof a.step === 'number' && a.step >= 0) s.active = { id: a.id, step: Math.floor(a.step) };
  if (s.core === 'active' && !s.active) s.active = { id: CORE.find((id) => !s.done[id]) ?? 'box', step: 0 };
  return s;
};

/** Screens where the core walk keeps quiet. */
const PAUSED: ReadonlySet<ScreenId> = new Set<ScreenId>(['outside', 'battle', 'mirror', 'town']);
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
  // Hints were turned off (here or in Settings, which flips the flag and reloads): whatever was running is put away.
  if (!st.hints) { if (st.core === 'active' || st.core === 'new') st.core = 'skipped'; st.active = null; offer = false; }
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
  root.append(ring, drift, card, arrow, chip);
  host.append(root);
  // Touches on Mote's own buttons must not reach the world beneath.
  for (const b of [dot, side, go, chip]) {
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    // Enter and Space on a focused button of Mote's press it, and nothing else.
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); if (!e.repeat) b.click(); } });
    b.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); } });
  }

  // ---- transient state ----
  /** Card opened by hand where Mote is otherwise quiet. */
  let peek = false;
  /** A parting line, until closed or the next screen. */
  let note = '';
  let cardH = 0;
  let cardDirty = true;
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
    recheck = true;
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
  /** The town, read and never written: the live state when its screen is up, else what it last saved. */
  const townSt = (): { x: number; y: number; steps: number; talks: number } | null => {
    try {
      const live = (window as unknown as { __sallowTown?: { town?: { state?: unknown } } }).__sallowTown?.town?.state;
      const o = (live ?? JSON.parse(localStorage.getItem('sallow-town') ?? 'null')) as { x?: unknown; y?: unknown; stats?: { steps?: unknown; talks?: unknown } } | null;
      if (!o || typeof o !== 'object') return null;
      const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      return { x: n(o.x), y: n(o.y), steps: n(o.stats?.steps), talks: n(o.stats?.talks) };
    } catch { return null; }
  };
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
  const pressedLike = (prefix: string): boolean => { for (const id of pressed) if (id.startsWith(prefix)) return true; return false; };
  const shownEl = (e: Element | null): boolean => e instanceof HTMLElement && !e.hidden && e.offsetWidth > 0;
  const tabOn = (id: string): boolean => byId(id)?.getAttribute('aria-selected') === 'true';
  const rivalBtn = (): Element | null => q('[data-id^="rival-"]:not(:disabled)');
  /** A god tool (not Hands off, not the body) is in the hand. */
  const toolOn = (): boolean => { for (const b of layer.querySelectorAll('[data-id^="tool-"][aria-pressed="true"]')) { const id = b.getAttribute('data-id'); if (id !== 'tool-watch' && id !== 'tool-body') return true; } return false; };
  /** The ring of fold `i` on the canvas, in viewport px. */
  const childBox = (i: number): Rect => {
    const v = ctx.dive.view();
    const cr = canvas.getBoundingClientRect();
    const c = childScreen(foldFrame(ctx.gl.width(), ctx.gl.height(), v.progress, v.aim), i);
    return { x: cr.left + c.x - c.r, y: cr.top + c.y - c.r, w: c.r * 2, h: c.r * 2 };
  };
  const THING: Record<string, string> = { piece: 'a sky piece', well: 'a well of Light', echo: 'an echo', wreck: 'a wreck', storm: 'a storm', undertow: 'an undertow', follower: 'something that watches' };
  const HAZARD: Record<string, string> = { storm: 'It would take a pip of my Light.', undertow: 'It takes the steering from you for a fold.', follower: 'If it sees us it follows, and then we must not stop.' };
  const flickerAt = (): number => ctx.dive.view().children.findIndex((c) => !!c.flicker);

  // ---- a battle, read turn by turn ----
  /** The fight on the table has been decided. (No fight at all is not an ending: Mote waits for one.) */
  const over = (): boolean => !!ctx.battle && ctx.battle.outcome !== 'ongoing';
  const turns = (): number => ctx.battle?.turn ?? 0;
  const energy = (): number => { const b = ctx.battle; return b ? b.mine[b.myActive]?.energy ?? 0 : 0; };
  /** How the last fight Mote watched ended. Kept so the words after it fit. */
  let ended: 'won' | 'lost' | '' = '';
  const SOFT: ReadonlySet<string> = new Set(['SHIELD', 'TEMPO', 'LIGHT', 'CLEANSE', 'MEND']);
  type BState = NonNullable<typeof ctx.battle>;
  type BAct = Parameters<typeof ctx.battles.can>[1];
  /** After a loss, a new fight puts Mote back at its side, reading every turn. */
  const rematch = (scr: ScreenId): boolean => {
    if (scr !== 'battle' || ctx.battle?.outcome !== 'ongoing' || !st.active) return false;
    ended = '';
    st.active.step = 2;
    return true;
  };
  // Mote reads a few turns ahead with the battle's own rules (they are deterministic), once per turn.
  const worth = (s: BState): number => {
    if (s.outcome === 'won') return 10000 - s.turn;
    if (s.outcome === 'lost' || s.outcome === 'fled') return -10000 + s.turn;
    let v = (s.mine[s.myActive]?.energy ?? 0) * 1.5;
    // Harm done counts for more than harm taken: a fight that only holds its ground is a fight lost slowly.
    for (const f of s.mine) v += (f.hp * 60) / Math.max(1, f.maxHp) + (f.hp > 0 ? 40 : 0);
    for (const f of s.theirs) v -= (f.hp * 100) / Math.max(1, f.maxHp) + (f.hp > 0 ? 60 : 0);
    return v;
  };
  const choices = (s: BState): BAct[] => {
    const out: BAct[] = [];
    const me = s.mine[s.myActive];
    if (!me) return out;
    for (const k of me.skills) out.push({ type: 'skill', id: k.id });
    out.push({ type: 'guard' });
    s.mine.forEach((f, i) => { if (i !== s.myActive && f.hp > 0) { out.push({ type: 'swap', target: i }); if (!s.fusedUsed && !me.fused) out.push({ type: 'fuse', target: i }); } });
    return out.filter((x) => { try { return ctx.battles.can(s, x); } catch { return false; } });
  };
  let nodes = 0;
  const ahead = (s: BState, depth: number): number => {
    if (s.outcome !== 'ongoing' || depth <= 0 || nodes > 1400) return worth(s);
    let best = -1e9;
    for (const x of choices(s)) {
      nodes++;
      let n: BState;
      try { n = ctx.battles.act(s, x); } catch { continue; }
      const v = ahead(n, depth - 1);
      if (v > best) best = v;
    }
    return best === -1e9 ? worth(s) : best;
  };
  let planKey = '';
  let plan: BAct | null = null;
  const planFor = (b: BState): BAct | null => {
    const me = b.mine[b.myActive];
    const key = `${b.rival.id}|${b.turn}|${b.myActive}|${b.mine.length}|${me?.hp ?? 0}|${me?.energy ?? 0}`;
    if (key === planKey) return plan;
    planKey = key; plan = null; nodes = 0;
    let best = -1e9;
    try {
      for (const x of choices(b)) {
        const v = ahead(ctx.battles.act(b, x), 2);
        if (v > best) { best = v; plan = x; }
      }
    } catch { plan = null; }
    return plan;
  };
  const coach = (): Cue | null => {
    const b = ctx.battle;
    if (!b || b.outcome !== 'ongoing') return null;
    const me = b.mine[b.myActive], them = b.theirs[b.theirActive];
    if (!me || !them) return null;
    const ia = b.intent.action;
    const their = ia.type === 'skill' ? them.skills.find((s) => s.id === ia.id) : undefined;
    const heavy = !!their && their.cost >= 2;
    const mark = b.intent.label;
    const low = me.hp * 100 < me.maxHp * 40;
    const guardBtn = byId('guard');
    const todo = planFor(b);
    const fusing = isPressed('fuse');
    if (todo?.type === 'fuse') {
      const other = b.mine[todo.target];
      if (other && fusing && byId(`bench-${todo.target}`)) return { text: `Now touch ${other.name}. The two become one, whole, with the moves of both.`, target: byId(`bench-${todo.target}`) };
      if (other && byId('fuse')) return { text: `${low ? `${me.name} is fading. ` : ''}This is when to Fuse: two of yours become one, stronger than either. It can be done once a battle. Press Fuse.`, target: byId('fuse') };
    }
    // Fuse was opened but is not the move for this turn.
    if (fusing && byId('fuse')) return { text: 'Not this turn. Press Cancel, and keep the fusing for when it counts.', target: byId('fuse') };
    if (todo?.type === 'swap') {
      const other = b.mine[todo.target];
      if (other && byId(`bench-${todo.target}`)) return { text: `${me.name} is ${low ? 'fading' : 'the wrong one for this'}. Send ${other.name} forward. Touch its name.`, target: byId(`bench-${todo.target}`) };
    }
    if (todo?.type === 'guard' && guardBtn) {
      if (heavy) return { text: `Their mark reads ${mark}. That is a heavy blow. Guard now: it turns half of it aside and gives one Light back.`, target: guardBtn };
      if (ia.type === 'guard') return { text: 'They mean to guard. A blow now is half wasted. Guard too, and take a Light back for the turn after.', target: guardBtn };
      return { text: `Their mark reads ${mark}. You have ${word(me.energy)} Light. Guard: it softens what comes and gives one Light back for something better.`, target: guardBtn };
    }
    const pick = todo?.type === 'skill' ? me.skills.find((s) => s.id === todo.id) : undefined;
    if (!pick || !byId(`skill-${pick.id}`)) return guardBtn ? { text: `Their mark reads ${mark}. Guard, and gather Light.`, target: guardBtn } : null;
    const kind = (pick.kind ?? '').toUpperCase();
    const cost = pick.cost > 0 ? `${pick.name} costs ${word(pick.cost)} of your ${word(me.energy)} Light.` : `${pick.name} is free.`;
    if (kind === 'MEND') return { text: `${me.hp * 100 < me.maxHp * 60 ? `${me.name} is hurt.` : `Their mark reads ${mark}. Mend before it lands.`} ${pick.name} gives life back. ${cost}`, target: byId(`skill-${pick.id}`) };
    if (SOFT.has(kind)) return { text: `Their mark reads ${mark}. Not a blow this turn: ${pick.name}. ${pick.desc} ${cost}`, target: byId(`skill-${pick.id}`) };
    const lastId = b.last?.you ?? '';
    const lead = heavy ? `Their mark reads ${mark}. Heavy, but a blow of your own is worth more now.` : `Their mark reads ${mark}.${their ? ' Not heavy.' : ''}`;
    const chain = lastId && pick.id !== lastId ? ' A move unlike your last builds the chain, and the chain adds harm.' : '';
    return { text: `${lead} Strike back. ${cost}${chain}`, target: byId(`skill-${pick.id}`) };
  };

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
          cue: () => diveCue({ text: `That is my Light, ${word(ctx.light.view().pips)} of eight. Falling spends it, a little with every fold. At nothing, we rise again.`, target: q('.k-pips'), place: 'below' }),
          done: (scr) => scr === 'system' || scr === 'planet' || (ctx.dive.view().phase === 'stopped' && !!ctx.dive.view().star),
          dwell: 5200,
        },
        { scr: ['dive'], cue: () => diveCue(diveSays()), done: (scr) => scr === 'system' || scr === 'planet' },
      ],
    },
    sky: {
      id: 'sky', title: 'Sky', blurb: 'Their sky is your first and gentlest lever. Your hands are the blunt one.', home: 'system', listed: true, route: coreRoute,
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
        { scr: ['planet'], cue: () => ({ text: 'Their years are slow. Set time to 3x.', target: byId('speed-3') ?? findSpeed() }), done: () => ctx.clock.speed() === 3 },
        {
          scr: ['planet'],
          cue: () => (settle('village', villages() > 0)
            ? { text: `${villages() === 1 ? 'A village' : `${cap(word(villages()))} villages`}. They light their lamps under the sky you gave them. Their glow rises to me, slowly. It becomes your Light.`, target: findStat('glow') ?? byId('surface'), act: 'next' }
            : slow('village')
              ? { text: 'No one has come yet. Some worlds are slow, and some stay empty for ever. Sow sets a people down, if you will not wait.', target: byId('tool-sow'), act: 'next' }
              : { text: 'Now only watch. Someone will come, and they will build.', target: byId('surface') }),
        },
        {
          scr: ['planet'],
          cue: () => (settle('chron', lines() > 0)
            ? { text: 'They write down what befalls them, and why. They do not know you, but they feel their sky. Change it, and the story changes.', target: byId('ticker') ?? q('.chronicle'), act: 'next' }
            : slow('chron')
              ? { text: 'Nothing is written yet. When something befalls them it will be set down here, with its reason.', target: byId('ticker') ?? q('.chronicle'), act: 'next' }
              : { text: 'They write down what befalls them. Watch their chronicle.', target: byId('ticker') ?? q('.chronicle') }),
        },
        {
          scr: ['planet'],
          cue: () => {
            const n = notable();
            if (settle('named', !!n && !!byId('notable-find')) && n) return { text: `The chronicle follows one of them by name. This one is ${n.name}. Press Find.`, target: byId('notable-find') };
            return { text: 'Soon the chronicle will choose one of them to follow by name.', target: findStat('souls') ?? byId('surface'), act: 'next', actLabel: 'Go on' };
          },
          done: () => pressed.has('notable-find'),
        },
        { scr: ['planet'], cue: () => (layerNow() > 1 ? { text: 'There. I will stay with them a few breaths. Press − to climb back out.', target: byId('zoom-out'), act: 'next' } : { text: 'Find carries your eye to the one it names, wherever they have gone. Watch them a few breaths.', act: 'next' }) },
        {
          scr: ['planet', 'system', 'box', 'bedroom', 'dive'],
          cue: () => ({ text: 'That is the whole of it. Fall, hang a sky, watch. The rest I will tell you when we come to it. Past the front door is the street, and the way out to it is in your room. Out there are other children, with boxes of their own.', act: 'next', actLabel: 'I will', side: 'none' }),
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
    tools: {
      id: 'tools', title: 'Tools', blurb: 'A heavier hand: groups, the brush, whole patterns.', home: 'planet', listed: true, route: toPlanet,
      when: (scr) => scr === 'planet' && !!sim(),
      steps: [
        { scr: ['planet'], cue: () => ({ text: 'There is a heavier hand than a sky. It is kept under Tools. Open it.', target: byId('tab-tools') }), done: () => tabOn('tab-tools') || toolOn() },
        { scr: ['planet'], cue: () => ({ text: 'They lie in groups: Souls, Earth, Weather, Wrath, Patterns. Each says what it risks before you use it. Choose Rain.', target: byId('tool-rain') }), done: () => toolOn() },
        { scr: ['planet'], cue: () => ({ text: 'The brush is how wide your hand falls: S, M or L. Choose one.', target: byId('brush-l') }), done: () => pressedLike('brush-'), go: 'Go on' },
        { scr: ['planet'], cue: () => ({ text: 'Now touch their world. Hold your finger down and it repeats. Nothing done here can be undone.', target: byId('surface') }), done: () => pressed.has('surface'), go: 'Go on' },
        { scr: ['planet'], cue: () => ({ text: 'The last group is Patterns: a river, a ring of fire, a wall of cold. One touch draws the whole shape. Choose River, and read what it risks.', target: byId('tool-river') }), done: () => pressedLike('tool-'), go: 'Go on' },
        { scr: ['planet'], cue: () => ({ text: 'Hands off puts every tool away. Their world is safest so.', target: byId('tool-watch'), act: 'next', actLabel: 'Good' }), done: () => pressed.has('tool-watch') },
      ],
    },
    body: {
      id: 'body', title: 'Body', blurb: 'Walk among them, and see through its eyes.', home: 'planet', listed: true, route: toPlanet,
      when: (scr) => scr === 'planet' && !!sim(),
      steps: [
        { scr: ['planet'], cue: () => ({ text: 'You may go down among them. Take a body.', target: byId('tool-body') }), done: () => isPressed('tool-body') || !!avatar() },
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
    people: {
      id: 'people', title: 'People', blurb: 'Their villages and their named, and the way to each.', home: 'planet', listed: true, route: toPlanet,
      when: (scr) => scr === 'planet' && villages() > 0,
      steps: [
        { scr: ['planet'], cue: () => ({ text: 'Everyone who lives here is kept under People. Open it.', target: byId('tab-people') }), done: () => tabOn('tab-people') || pressedLike('village-') },
        {
          scr: ['planet'],
          cue: () => (q('[data-id^="village-"]')
            ? { text: 'Each village has a row. Touch one, and I carry your eye to it.', target: q('[data-id^="village-"]') }
            : { text: 'No one lives here yet. When they come, each village has a row here, and a touch takes you to it.', target: byId('people-say') }),
          done: () => pressedLike('village-'), go: 'Go on',
        },
        { scr: ['planet'], cue: () => ({ text: 'Follow keeps your eye on the one you chose while their years pass.', target: byId('follow') }), done: () => pressed.has('follow'), go: 'Go on' },
        {
          scr: ['planet'],
          cue: () => ({ text: 'Those the chronicle has named are listed too. Touch a name and I find them, if they still live.', target: q('[data-id^="person-"]') ?? (shownEl(byId('notable-find')) ? byId('notable-find') : byId('people-say')), act: 'next', actLabel: 'Good' }),
          done: () => pressedLike('person-') || pressed.has('notable-find'),
        },
      ],
    },
    chron: {
      id: 'chron', title: 'Chronicle', blurb: 'The whole story, one thread at a time.', home: 'planet', listed: true, route: toPlanet,
      when: (scr) => scr === 'planet' && lines() > 0,
      steps: [
        { scr: ['planet'], cue: () => ({ text: 'The newest line they wrote is always here. Touch it, and the whole story opens.', target: byId('ticker') }), done: () => tabOn('tab-chronicle') },
        { scr: ['planet'], cue: () => ({ text: 'These show one thread at a time: lives, wars, faith, works, sky. Try one.', target: byId('chron-lives') }), done: () => ['chron-all', 'chron-lives', 'chron-wars', 'chron-faith', 'chron-works', 'chron-sky'].some((id) => pressed.has(id)), go: 'Go on' },
        {
          scr: ['planet'],
          cue: () => ({ text: 'A line that happened somewhere can be touched. I take you to the place.', target: q('[data-id^="chron-go-"]') ?? byId('chron-list'), act: 'next', actLabel: 'Good' }),
          done: () => pressedLike('chron-go-'),
        },
      ],
    },
    skytab: {
      id: 'skytab', title: 'Sky, from below', blurb: 'What hangs over them, and what you could hang.', home: 'planet', listed: true, route: toPlanet,
      when: (scr) => scr === 'planet' && !!sim(),
      steps: [
        { scr: ['planet'], cue: () => ({ text: 'Their sky can be changed from down here too. Open Sky.', target: byId('tab-sky') }), done: () => tabOn('tab-sky') },
        { scr: ['planet'], cue: () => ({ text: 'First, their sky in their own words. Then what hangs there: touch a piece and it comes down. Then what you hold, or could make from my Light.', target: byId('sky-panel') }), go: 'Go on' },
        { scr: ['planet'], cue: () => ({ text: 'Change their sky takes you up to the orbits, where a piece goes on the ring you choose.', target: byId('change-sky'), act: 'next', actLabel: 'Good' }), done: (scr) => scr === 'system' },
      ],
    },
    system: {
      id: 'system', title: 'The star and its worlds', blurb: 'A card for each world, and what moves them all.', home: 'system', listed: true, route: (scr) => coreRoute(scr, 'system'),
      when: (scr) => scr === 'system' && !!ctx.selection.system,
      steps: [
        {
          scr: ['system'],
          cue: () => {
            const other = q('.sy-head[aria-expanded="false"]');
            return other
              ? { text: 'Every world of this star has a card. The open one is the world you are tending. Touch another.', target: other }
              : { text: 'This star has one world, and this is its card: what hangs over it, who lives there, and the way down.', target: q('.sy-card') };
          },
          done: () => pressedLike('planet-'), go: 'Go on',
        },
        { scr: ['system'], cue: () => ({ text: 'Cosmic holds what acts on the whole system at once. Open it.', target: byId('systab-cosmic') }), done: () => shownEl(byId('page-cosmic')) },
        { scr: ['system'], cue: () => ({ text: 'Pull and Push move a world along its ring. Flare, Shower, Comet strike, Eclipse and Panspermia fall on all of them. Choose one, and read what it costs before you use it.', target: byId('page-cosmic') }), done: () => pressedLike('cosmic-'), go: 'Go on' },
        { scr: ['system'], cue: () => ({ text: 'Log keeps what you have done under this star.', target: byId('systab-log'), act: 'next', actLabel: 'Good' }), done: () => shownEl(byId('page-log')) },
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
    depths: {
      id: 'depths', title: 'Strata and streaks', blurb: 'What the folds hold: layers, gifts, and worse.', home: 'dive', listed: true,
      when: (scr) => scr === 'dive' && ctx.dive.view().phase !== 'surfaced',
      route: (scr) => (scr === 'box' ? { text: 'Enter one, and I will show you what the folds hold.', target: byId('enter') } : null),
      steps: [
        {
          scr: ['dive'],
          cue: () => diveCue({ text: `The folds lie in strata. This one is ${ctx.dive.view().stratum?.name ?? 'the first'}. The marks on the bar show where the next begins, and each has its own weather.`, target: byId('stratum'), place: 'below' }),
          go: 'Go on', dwell: 11000,
        },
        {
          scr: ['dive'],
          cue: () => diveCue({ text: 'Folds fallen without letting go make a streak. It multiplies what I carry back. Stopping breaks it.', target: byId('streak'), place: 'below' }),
          go: 'Go on', dwell: 11000,
        },
        {
          scr: ['dive'],
          cue: () => {
            const v = ctx.dive.view();
            const at = v.progress < 600 ? v.children.findIndex((c) => !!c.thing) : -1;
            const kind = at >= 0 ? v.children[at]!.thing!.kind : '';
            if (at >= 0 && HAZARD[kind]) return diveCue({ text: `That ring holds ${THING[kind]}. ${HAZARD[kind]} Steer into another ring.`, box: childBox(at), round: true, act: 'next', actLabel: 'Good' });
            if (at >= 0) return diveCue({ text: `That ring holds ${THING[kind] ?? 'something'}. Touch it to steer, and fall through it to take it.`, box: childBox(at), round: true, act: 'next', actLabel: 'Good' });
            return diveCue({ text: 'Rings sometimes hold things: sky pieces, wells of Light, echoes, wrecks. And worse: storms, undertow, something that watches. Keep falling. I will point when I see one.', act: 'next', actLabel: 'Good' });
          },
        },
        { scr: ['dive'], cue: () => diveCue({ text: 'When a fall ends I count it up: how deep, what we gathered, and what I carry home as Light.', act: 'next', actLabel: 'Good' }), dwell: 9000 },
      ],
    },
    flicker: {
      id: 'flicker', title: 'Catching a flicker', blurb: 'A universe loose in the folds, and two touches.', home: 'dive', listed: true,
      when: (scr) => scr === 'dive' && flickerAt() >= 0 && ctx.dive.view().reliquaries > 0 && ctx.dive.view().phase !== 'surfaced' && ctx.dive.view().progress < 500,
      route: (scr) => (scr === 'box' ? { text: 'Enter one and fall. When a flicker shows, I will tell you how it is caught.', target: byId('enter') } : null),
      steps: [
        {
          scr: ['dive'],
          cue: () => {
            const at = flickerAt();
            if (at < 0) return diveCue({ text: 'Somewhere in these folds a universe is loose. It shows as a flicker. Keep falling. I will point when I see one.' });
            return diveCue({ text: 'That one is no star. It is a universe, loose in the fold. Let go of the fall, then touch it once. A ring closes on it.', box: childBox(at), round: true });
          },
          done: () => flickerAt() >= 0 && pressed.has('fold-field') && ctx.dive.view().phase !== 'falling',
        },
        {
          scr: ['dive'],
          cue: () => {
            const at = flickerAt();
            return diveCue({ text: 'Now touch it again as the ring crosses the band. That is the throw. Each throw spends a reliquary.', box: at >= 0 ? childBox(at) : null, round: true });
          },
          done: () => {
            // A result left on the field by an earlier throw is not this throw's.
            const res = byId('fold-field')?.getAttribute('data-caught') ? 1 : 0;
            return flickerAt() < 0 || res > first('res', res) || ctx.dive.view().reliquaries < first('rel', ctx.dive.view().reliquaries) || ctx.box.count() > first('box', ctx.box.count());
          },
        },
        {
          scr: ['dive'],
          cue: () => {
            const res = byId('fold-field')?.getAttribute('data-caught');
            return diveCue({
              text: res === 'ok' ? 'Caught. It is in the box now, and it is yours.'
                : res === 'missed' ? 'Wide. The reliquary is gone, the flicker is not. Touch it and throw again, or fall on.'
                  : 'It slipped by. There will be others. One touch, then another as the ring crosses the band.',
              act: 'next', actLabel: 'Good',
            });
          },
          dwell: 10000,
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
    outside: {
      id: 'outside', title: 'Outside', blurb: 'Other children keep boxes too, sixteen of them.', home: 'outside', listed: true,
      when: (scr) => scr === 'outside',
      steps: [
        { scr: ['outside'], cue: () => ({ text: 'Out here each universe fights as its creature. These are your three strongest. LV is what fighting has taught it. HOLDS is a relic, a small thing it may carry.', target: q('.team') }), go: 'Go on', done: (scr) => scr === 'battle' },
        { scr: ['outside'], cue: () => ({ text: 'The children stand in a ladder, sixteen of them, each further out than the last. That mark counts the ones you have beaten.', target: byId('ladder-progress') }), go: 'Go on', done: (scr) => scr === 'battle' },
        { scr: ['outside'], cue: () => ({ text: 'Their boxes are hungry. Find the first of them.', target: rivalBtn() }), done: (scr) => scr === 'battle' },
      ],
    },
    battle: {
      id: 'battle', title: 'A first battle', blurb: 'Their mark, your moves, weather, the chain, and the catch.', home: 'outside', listed: true,
      when: (scr) => scr === 'battle' && ctx.battle?.outcome === 'ongoing',
      route: (scr) => (scr === 'outside' ? { text: 'Find one of them, and I will read the fight with you.', target: rivalBtn() } : null),
      steps: [
        {
          scr: ['battle'],
          cue: () => ({ text: `That mark is what they will do next. Now it reads ${ctx.battle?.intent.label ?? 'nothing'}. I will read it for you every turn.`, target: byId('intent') ?? q('.intent') }),
          go: 'Go on', done: () => over() || turns() > first('turn', turns()),
        },
        {
          scr: ['battle'],
          cue: () => {
            const b = ctx.battle;
            let w = '';
            try { const info = b?.weather ? ctx.battles.weatherInfo?.(b.weather) : undefined; if (info) w = ` Today it is ${info.name}. ${info.desc}`; } catch { /* no weather to read */ }
            return { text: `The field has weather. It lifts one element and blunts another.${w}`, target: byId('weather') };
          },
          go: 'Go on', done: () => over() || turns() > first('turn', turns()),
        },
        {
          scr: ['battle'],
          cue: () => ({ text: `Each move costs Light, written under it. Yours has ${word(energy())} of six. Next to the weather is who moves first, and the chain: moves unlike your last add harm.`, target: q('.skills'), place: 'top' }),
          go: 'Go on', done: () => over() || turns() > first('turn', turns()),
        },
        // The fight itself: one reading per turn, from what is really on the table.
        { scr: ['battle'], cue: () => coach(), done: () => over() },
        {
          scr: ['battle'],
          cue: () => {
            const o = ctx.battle?.outcome;
            if (o === 'won') return { text: 'It is done, and it is yours. The page counts what the fight paid: glow, what yours learned, a relic if one fell. Now their box is open. Choose one of theirs. It comes home with you.', target: q('.catch-row'), place: 'bottom', fix: true };
            if (o === 'lost') return { text: 'It went dark. I dim by one, and that is all it costs. Yours still learned from it. Go home.', target: byId('home') };
            return null;
          },
          done: (scr) => {
            const o = ctx.battle?.outcome;
            if (o === 'won' || o === 'lost') { ended = o; memo.set('ended', 1); }
            // Caught (the battle screen with no battle left), or walked away from a fight that was decided.
            return (scr === 'battle' && !ctx.battle) || (memo.has('ended') && (!ctx.battle || scr !== 'battle'));
          },
        },
        {
          scr: ['battle', 'outside', 'bedroom'],
          cue: () => {
            const scr = shell.current();
            if (ended === 'lost') {
              if (scr === 'bedroom') return { text: 'They are still out there, and they are the same. You need not be. Tend a world, hang a sky, and yours grows. Then go out and find them again.', target: byId('go-outside'), act: 'next', actLabel: 'Later' };
              if (scr === 'outside') return { text: 'There they are. Guard when their mark is heavy, strike when it is not. Find them again.', target: rivalBtn(), act: 'next', actLabel: 'Later' };
              return null;
            }
            if (scr === 'battle') return byId('back-outside') ? { text: 'It starts small with you, at level one. Fighting teaches it: levels, new moves, another shape.', target: byId('back-outside') } : null;
            return { text: 'One more of theirs is in your box. The next child stands further out.', act: 'next', actLabel: 'Good' };
          },
          done: (scr) => (ended === 'lost' ? rematch(scr) : ended === 'won' ? scr === 'outside' || scr === 'bedroom' : scr !== 'battle' || !!ctx.battle),
        },
        {
          scr: ['battle', 'outside', 'bedroom'],
          cue: () => (ctx.battle?.outcome === 'ongoing'
            ? { text: 'Again, then. You know how it goes: read their mark, guard the heavy blows, strike between them. I will keep quiet.', act: 'next', actLabel: 'Good', side: 'none' }
            : { text: 'That is a battle. Win, and one of theirs is yours to keep. Lose, and I dim, and you may come back. Sixteen of them stand out there.', act: 'next', actLabel: 'Good', side: 'none' }),
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
          done: () => !isPressed('merge-mode') || !!byId('confirm-merge') || (!!byId('do-merge') && !(byId('do-merge') as HTMLButtonElement).disabled),
        },
        {
          scr: ['box'],
          cue: () => ({ text: 'Read what they would make, its odds, and where it comes from. Press Merge these. Nothing is spent yet.', target: byId('do-merge') }),
          done: () => !!byId('confirm-merge') || !isPressed('merge-mode'),
        },
        {
          scr: ['box'],
          cue: () => ({ text: 'It asks once more, because it cannot be undone. Yes spends both for good. Not yet leaves them as they are.', target: byId('merge-confirm') ?? byId('confirm-merge') }),
          done: () => pressed.has('confirm-merge') || pressed.has('cancel-merge') || !isPressed('merge-mode'),
        },
        { scr: ['box'], cue: () => ({ text: 'Merging always makes something new, and it remembers what it was made from.', act: 'next', actLabel: 'Good', side: 'none' }) },
      ],
    },
    manage: {
      id: 'manage', title: 'Keeping the Box', blurb: 'Sort, pin, rename, compare.', home: 'box', listed: true,
      when: (scr) => scr === 'box' && ctx.box.count() >= 1,
      steps: [
        { scr: ['box'], cue: () => ({ text: 'The box can be put in order. Sort changes how they are laid out. The marks beside it show only one kind of law.', target: byId('sort') }), done: () => pressed.has('sort') || pressedLike('filter-'), go: 'Go on' },
        { scr: ['box'], cue: () => ({ text: 'Touch one of them.', target: q('.grid5') }), done: () => !!byId('fav') || pressed.has('slot') },
        { scr: ['box'], cue: () => ({ text: 'Pin marks one you want kept close. Pinned ones come first, and can be shown alone.', target: byId('fav') }), done: () => pressed.has('fav'), go: 'Go on' },
        { scr: ['box'], cue: () => ({ text: 'Rename gives it a name of your own. What it is underneath does not change.', target: byId('rename') }), done: () => pressed.has('rename'), go: 'Go on' },
        { scr: ['box'], cue: () => ({ text: 'Compare sets two side by side: their laws, their depth, who lives there.', target: byId('compare'), act: 'next', actLabel: 'Good' }), done: () => pressed.has('compare') },
      ],
    },
    room: {
      id: 'room', title: 'Your room', blurb: 'The window, the bed, the shelf, and what each is for.', home: 'bedroom', listed: true,
      when: (scr) => scr === 'bedroom',
      steps: [
        { scr: ['bedroom'], cue: () => ({ text: 'This room is yours. The window, the bed, the PC, the shelf, the poster: touch one and you walk to it.', place: 'bottom' }), done: () => shownEl(byId('use')), go: 'Go on' },
        {
          scr: ['bedroom'],
          cue: () => (shownEl(byId('use'))
            ? { text: 'You are beside it. Use, and see what it is for.', target: byId('use') }
            : { text: 'When you stand beside a thing, Use appears under the room. The bed passes the night. The window shows the hour. The shelf keeps what you have won.', act: 'next', actLabel: 'Good' }),
          done: () => pressed.has('use'),
        },
        { scr: ['bedroom'], cue: () => ({ text: 'Each thing does something small. None of it is needed. It is only your room.', act: 'next', actLabel: 'Good', side: 'none' }) },
      ],
    },
    street: {
      id: 'street', title: 'The street', blurb: 'Walking, talking, pockets, the map, the hour, and the way home.', home: 'town', listed: true,
      when: (scr) => scr === 'town',
      route: (scr) => (scr === 'bedroom' ? { text: 'The street is past the front door. Go out.', target: byId('go-town') } : null),
      steps: [
        {
          scr: ['town'],
          cue: () => ({ text: 'This is the street. Touch a place and you walk to it. Drag anywhere to steer, or use the arrow keys. Walk a little way.', place: 'top' }),
          done: () => { const t = townSt(); if (!t) return false; const x0 = first('tx', t.x), y0 = first('ty', t.y), n0 = first('tsteps', t.steps); return Math.abs(t.x - x0) + Math.abs(t.y - y0) > 24 || t.steps > n0 + 1; },
        },
        {
          scr: ['town'],
          cue: () => {
            settle('talk', false);
            return slow('talk')
              ? { text: 'Nobody near. When you find someone, touch them and they speak. Some of them want something. Some only remember.', place: 'top', act: 'next', actLabel: 'Go on' }
              : { text: 'People stand about out here. Walk up to one and touch them. They will have something to say.', place: 'top' };
          },
          done: () => { const t = townSt(); if (!t) return false; return t.talks > first('ttalks', t.talks) || (shownEl(byId('town-sheet')) && !!byId('town-say') && !byId('town-map') && !byId('town-bag-note')); },
        },
        {
          scr: ['town'],
          cue: () => (shownEl(byId('town-sheet')) && !byId('town-map')
            ? { text: 'Hear them out. Then I will show you the map.', place: 'top' }
            : { text: 'Bag is what is in your pockets. Map is where you have been: it draws itself as you walk. Open the map.', target: byId('town-map-btn'), place: 'top' }),
          done: () => pressed.has('town-map-btn') || !!byId('town-map'),
        },
        {
          scr: ['town'],
          cue: () => (byId('town-map') ? null : { text: 'The hour up there moves as you do. Shops shut, some people go in, others come out. At night it is a different street.', target: byId('town-time'), place: 'top', act: 'next', actLabel: 'Go on' }),
        },
        {
          scr: ['town'],
          cue: () => ({ text: 'Other children are out here too, each with a box. Find one and they will set theirs against yours where they stand. Home takes us back to your room.', target: byId('town-home'), place: 'top', act: 'next', actLabel: 'Good', side: 'none' }),
          done: (scr) => scr === 'bedroom',
        },
      ],
    },
    mirror: {
      id: 'mirror', title: 'The floor', blurb: 'The room at the bottom, and the child who keeps it.', home: 'mirror', listed: true,
      when: (scr) => scr === 'mirror',
      route: (scr) => (scr === 'dive' ? diveCue({ text: 'The room is at the very bottom of a universe. Keep falling.' }) : null),
      steps: [
        { scr: ['mirror'], cue: () => ({ text: 'This is the floor of a universe. Someone lives here, with a box of their own. Speak, and they answer.', target: byId('mirror-speak') }), done: () => pressedLike('mirror-'), go: 'Go on' },
        { scr: ['mirror'], cue: () => ({ text: 'Their box shows what they hold. Leave sets something of yours on their shelf. Take brings something of theirs home.', target: byId('mirror-look') }), done: () => pressed.has('mirror-look') || pressed.has('mirror-leave') || pressed.has('mirror-take'), go: 'Go on' },
        { scr: ['mirror'], cue: () => ({ text: 'Rise carries us back to the top of the fall. I will remember the way down.', target: byId('mirror-up'), act: 'next', actLabel: 'Good' }), done: (scr) => scr !== 'mirror' },
      ],
    },
    menu: {
      id: 'menu', title: 'The Menu', blurb: 'The mark in the corner, and the pages it keeps.', home: 'bedroom', listed: true,
      when: (scr) => scr === 'bedroom',
      steps: [
        { scr: ['bedroom', 'box', 'system', 'planet', 'outside'], cue: () => ({ text: 'The small mark in the corner is the menu. Everything that is not the world is kept there. Open it.', target: hubBtn(), place: 'top' }), done: () => shell.menu.isOpen() },
        { scr: ['bedroom', 'box', 'system', 'planet', 'outside'], cue: () => null, done: () => !shell.menu.isOpen() },
        {
          scr: ['bedroom', 'box', 'system', 'planet', 'outside'],
          cue: () => ({ text: 'Each page in there I explain once, the first time you open it. What I have shown you is kept under Tutorial, and I can be told to keep quiet in Settings.', place: 'top', act: 'next', actLabel: 'Good', side: 'none' }),
        },
      ],
    },
  };
  const hubBtn = (): Element | null => host.querySelector('[data-id="hub"]');
  const LISTED: readonly LessonId[] = IDS.filter((id) => LESSONS[id].listed);
  /** Offered in this order when more than one fits a screen. */
  const OFFERS: readonly LessonId[] = ['street', 'menu', 'room', 'zoom', 'tools', 'body', 'people', 'chron', 'skytab', 'system', 'merge', 'manage', 'deep', 'depths', 'outside', 'battle', 'mirror'];
  /** These announce themselves in the middle of a fall, not on arrival. */
  const MID: readonly LessonId[] = ['floor', 'flicker'];
  /** What Mote says once about each page of the menu, the first time it is opened. */
  const PAGES: Record<string, string> = {
    street: 'The Street page keeps what you carry out there: errands, pockets, the map so far, and who you have met.',
    journal: 'The Journal keeps the chapters of what you are doing here, and what each one asks of you.',
    almanac: 'The Almanac is today: an omen over the box, small tasks, and what is happening out there. It turns over each day.',
    tutorial: 'Everything I have shown you, and what I have not yet. Touch a lesson and I show it where it happens.',
    codex: 'The Codex keeps what you have met: the laws, the creatures, the things in the folds. It fills as you find them.',
    deeds: 'Deeds are things done once and remembered. Some of them pay.',
    stats: 'The Tally only counts: folds fallen, skies hung, years watched.',
    ascension: 'This page is about the floor of a universe, and what you bring back from it. It stays quiet until you have been down.',
    sound: 'Sound: how loud the room, the folds and I may be.',
    settings: 'Settings. Text can be made smaller or larger here, and the whole game saved out as a code or a file, to carry to another device. Show hints is me.',
    performance: 'If the worlds stutter, ask less of this device here.',
  };

  // ---- moving through lessons ----
  /** After a lesson ends or is put away, nothing new is offered for this long. */
  const REST_MS = 45000;
  let restMs = 0;
  const isCore = (id: LessonId) => CORE.includes(id);
  const resetStep = () => { stepKey = ''; shown = 0; pressed.clear(); memo.clear(); read.clear(); recheck = true; };
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
    restMs = REST_MS;
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
    shell.toast('As you wish. I will keep quiet: Show hints is off now. Turn it back on in Settings, or find me in the menu under Tutorial.', { title: 'Mote', sfx: '' });
    resetStep();
    store();
  };
  /** Not now: this one lesson is put away. It stays on the Tutorial page. */
  const drop = () => { restMs = REST_MS; st.active = null; st.collapsed = false; peek = false; note = ''; resetStep(); store(); };
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
    if (squeezed) { forceMs = 9000; recheck = true; return; }
    if (st.active && st.collapsed) { st.collapsed = false; store(); } else peek = true;
  });
  shell.onNavigate(() => { peek = false; note = ''; recheck = true; orbitPt = null; orbitAge = 999; arrived = 3000; });
  window.addEventListener('resize', () => { cardDirty = true; });
  // A scrolled screen has moved its controls: let the card find the emptiest place again.
  layer.addEventListener('scroll', () => { recheck = true; }, { passive: true, capture: true });

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
    if (arrived <= 0 || overlayUp() || (scr === 'dive' && summaryUp())) return;
    arrived -= frameMs;
    if (st.active || offer || note || shell.menu.isOpen() || !st.hints || st.core === 'new' || st.core === 'active') return;
    for (const id of OFFERS) {
      if (st.done[id] || st.seen[id]) continue;
      // One lesson does not follow hard on another, except the fight that Outside leads into.
      if (restMs > 0 && id !== 'battle') continue;
      if (LESSONS[id].when?.(scr)) { arrived = 0; start(id); return; }
    }
  };
  // The floor and the flicker announce themselves in the middle of a fall, not on arrival.
  const maybeMid = (scr: ScreenId) => {
    if (scr !== 'dive' || st.active || !st.hints || st.core === 'new' || st.core === 'active' || summaryUp()) return;
    for (const id of MID) if (!st.seen[id] && !st.done[id] && LESSONS[id].when?.(scr)) { start(id); return; }
  };

  // ---- other things on the screen ----
  /** Something else has the player's eye (a chapter card, the away report): Mote keeps quiet. */
  const overlayUp = (): boolean => {
    const c = document.querySelector('[data-id="campaign-card"]');
    if (c instanceof HTMLElement && !c.hidden && c.offsetWidth > 0) return true;
    return !!document.querySelector('.away');
  };
  const summaryUp = (): boolean => shownEl(byId('dive-summary'));
  const tell = (key: string) => { if (!st.told.includes(key)) { st.told.push(key); store(); } };
  /** The end of a fall counts itself up. Mote says what the page is, and does not stand in its way. */
  const summaryCue = (): Cue => {
    const r = ctx.dive.view().summary?.reason;
    const where = r === 'star' ? 'A star. We stop here.' : r === 'floor' ? 'The floor.' : 'We have risen.';
    return { text: `${where} This page is the fall, counted: how deep, what we gathered, and what I carry home as Light. It goes on by itself in a few breaths, or press the button.`, target: byId('dive-continue'), side: 'none', head: 'The end of a fall', place: 'bottom', fix: true };
  };
  /** A cue whose target lies on a page that is not showing: bring the page, or point at its tab. */
  let reachKey = '';
  let reachMs = 0;
  const reach = (cue: Cue): Cue => {
    const t = cue.target;
    if (!t?.isConnected || cue.box) return cue;
    const r = t.getBoundingClientRect();
    const mid = r.top + Math.min(r.height, 44) / 2;
    const page = t.closest('[data-id^="page-"]');
    const pager = t.closest('[data-id="pager"]');
    const pr = pager?.getBoundingClientRect();
    const gone = r.width === 0 || r.height === 0;
    const clipped = !gone && !!pr && (mid < pr.top + 2 || mid > pr.bottom - 2);
    const offFrame = !gone && !clipped && (mid > frameRect.bottom - 4 || mid < frameRect.top + 4);
    const key = `${stepKey}|${t.getAttribute('data-id') ?? t.className}`;
    // Once it has been in sight, the player moved away from it by their own hand: it is not pulled back.
    if (!gone && !clipped && !offFrame) { if (reachMs <= 0) reachKey = key; return cue; }
    if (!gone && key !== reachKey) {
      // Once for each thing pointed at: after that the player's own scrolling is left alone.
      reachKey = key; reachMs = 900;
      try { (t as HTMLElement).scrollIntoView({ block: r.height > 300 ? 'start' : 'center', inline: 'nearest' }); } catch { /* it stays where it is */ }
    }
    if (reachMs > 0) { reachMs -= frameMs; return { ...cue, target: null, dragTo: null }; }
    if ((gone || clipped) && page) {
      const name = (page.getAttribute('data-id') ?? '').slice(5);
      const tab = byId(`tab-${name}`) ?? byId(`systab-${name}`);
      const label = tab?.textContent?.trim();
      if (tab && label) return { ...cue, target: tab, dragTo: null, text: `${cue.text} It is kept under ${label}. Touch ${label} first.` };
    }
    return cue;
  };

  const WALK: Cue = { text: 'Shall I walk with you again, from the beginning. The single lessons are in the menu, under Tutorial.', act: 'begin', actLabel: 'Walk with me', side: 'no', place: 'top' };
  let sumMs = 0;
  /** What Mote says and points at on this screen right now, or null to stay quiet. */
  const pickCue = (scr: ScreenId): Cue | null => {
    if (shell.menu.isOpen() || overlayUp()) return null;
    if (scr === 'dive' && summaryUp()) {
      if (!st.active && (!st.hints || st.told.includes('dive-summary'))) return null;
      sumMs += frameMs;
      if (sumMs > 1500 && !st.active) tell('dive-summary');
      return summaryCue();
    }
    sumMs = 0;
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
    const n = LISTED.indexOf(a.id);
    const at = n >= 0 ? `Lesson ${n + 1} of ${LISTED.length} · ` : '';
    cue.head ??= `${at}${L.title}${L.steps.length > 1 ? ` · ${Math.min(a.step + 1, L.steps.length)}/${L.steps.length}` : ''}`;
    return reach(cue);
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
  const hard: Rect[] = [];
  const soft: Rect[] = [];
  const addRect = (list: Rect[], e: Element, pad: number) => {
    if (e instanceof HTMLElement && e.hidden) return;
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > frameRect.top && r.top < frameRect.bottom) list.push({ x: r.left, y: r.top - pad, w: r.width, h: r.height + pad * 2 });
  };
  /** Where the card was last put (viewport y), or null when it must be found again. */
  let cardY: number | null = null;
  let recheck = false;
  /** There was no clear place for the card: it waits as the chip. A tap on the chip shows it anyway for a while. */
  let squeezed = false;
  let forceMs = 0;
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
    const b = frameRect;
    // The chip: Mote, small, waiting to be asked. Never under the menu button.
    const chipOn = (!cue || squeezed) && !offer && !shell.menu.isOpen() && (st.active ? true : scr === 'bedroom');
    show('chip', chip, chipOn);
    if (chipOn) {
      // Off-script screens keep their cards clear: Mote waits beside the way back.
      const aside = PAUSED.has(scr);
      const cx = aside ? b.left + 100 : scr === 'dive' ? b.left + b.width / 2 - 22 : b.right - 52;
      put('chip-t', chip, 'transform', `translate(${Math.round(cx)}px,${Math.round(b.top + (aside ? 16 : 60))}px)`);
    }
    show('card', card, !!cue && !squeezed);
    if (!cue) { show('ring', ring, false); show('drift', drift, false); show('arrow', arrow, false); cardY = null; squeezed = false; return false; }

    // Words and buttons.
    // New words take their place at once; only a card following its target glides.
    const said = txt('line', line, cue.text);
    if (said) { cardDirty = true; recheck = true; }
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
    if (off !== 0) hi = null;
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

    // Where the card sits: never over what it points at, a main button, an open page of the game's own,
    // or the band at the top where notices land. With no such place it folds down to the chip.
    const h = cardH;
    const minY = b.top + 112, maxY = b.bottom - 8 - h;
    hard.length = 0; soft.length = 0;
    if (hi) hard.push({ x: hi.x, y: hi.y - 10, w: hi.w, h: hi.h + 20 });
    if (to) hard.push({ x: to.x - 30, y: to.y - 30, w: 60, h: 60 });
    for (const e of layer.querySelectorAll('.k-btn--primary, [data-id="merge-reveal"], [data-id="reveal-done"], .sum-panel, [data-id="summary"], [data-id="rewards"]')) addRect(hard, e, 6);
    for (const e of layer.querySelectorAll('[data-id="stratum"], [data-id="dive-threat"], [data-id="stratum-banner"], [data-id="star-says"], [data-id="mote-say"], [data-id="uni-name"], [data-id="merge-preview"], [data-id="battle-log"], .depth-bar')) addRect(soft, e, 4);
    if (scr === 'town') {
      // The street: never over the row of buttons, an open sheet, or the kid and Mote in the middle of the view.
      for (const e of layer.querySelectorAll('.town-bar, [data-id="town-sheet"]')) addRect(hard, e, 6);
      const cv = byId('town-canvas')?.getBoundingClientRect();
      if (cv && cv.height > 0) hard.push({ x: cv.left + cv.width / 2 - 50, y: cv.top + cv.height / 2 - 120, w: 100, h: 170 });
      const tt = q('.town-top');
      if (tt) addRect(soft, tt, 4);
    }
    const mid = byId(scr === 'bedroom' ? 'floor' : 'surface')?.getBoundingClientRect();
    // The middle of their world, and the wall of the room where its things hang.
    if (mid && mid.height > 0) soft.push(scr === 'bedroom' ? { x: mid.left, y: mid.top, w: mid.width, h: mid.height * 0.45 } : { x: mid.left, y: mid.top + mid.height * 0.2, w: mid.width, h: mid.height * 0.6 });
    const free = (y: number, list: Rect[]): boolean => { for (const r of list) if (hits(y, h, r)) return false; return true; };
    const under = Math.max(minY, cue.under?.isConnected ? cue.under.getBoundingClientRect().bottom + 10 : minY);
    const wish = cue.place === 'top' ? under : cue.place === 'bottom' ? maxY : hi ? (cue.place === 'above' || (cue.place !== 'below' && hi.y + hi.h / 2 > b.top + b.height / 2) ? hi.y - 18 - h : hi.y + hi.h + 18) : under;
    const good = (y: number): boolean => y >= minY && y <= maxY && free(y, hard);
    if (cardY === null || !good(cardY) || recheck) {
      recheck = false;
      let best = NaN, cost = 1e9;
      const tryY = (y0: number) => {
        const y = Math.round(y0);
        if (!good(y)) return;
        let c = Math.abs(y - wish) / 40 + covered(y, h) * 6;
        for (const r of soft) if (hits(y, h, r)) c += 60;
        // A place already taken is kept unless another is clearly better.
        if (cardY !== null && Math.abs(y - cardY) < 2) c -= 8;
        if (c < cost) { cost = c; best = y; }
      };
      tryY(wish); tryY(under); tryY(maxY);
      if (cardY !== null) tryY(cardY);
      for (let y = minY; y <= maxY; y += 16) tryY(y);
      if (Number.isNaN(best) && forceMs > 0) {
        // Asked for by hand: the least bad place, clear at least of what is pointed at.
        for (let y = minY; y <= maxY; y += 16) { if (hi && hits(y, h, hard[0]!)) continue; const c = covered(y, h); if (c < cost) { cost = c; best = y; } }
        if (Number.isNaN(best)) best = minY;
      }
      cardY = Number.isNaN(best) ? null : best;
    }
    if (cardY === null) {
      // No room to speak: Mote waits as the chip, and the ring still shows the place.
      show('card', card, false);
      squeezed = true;
      return false;
    }
    if (squeezed) { squeezed = false; show('card', card, true); }
    const y = cardY;
    // The arrow is never drawn under the card.
    if (off !== 0) {
      let ay = off > 0 ? b.bottom - 52 : b.top + 8;
      if (ay < y + h && ay + 44 > y) ay = off > 0 ? y - 48 : y + h + 4;
      put('arrow-t', arrow, 'transform', `translate(${Math.round(b.left + b.width / 2 - 22)}px,${Math.round(ay)}px) rotate(${off > 0 ? 0 : 180}deg)`);
    }
    put('card-t', card, 'transform', `translate(${Math.round(b.left + 8)}px,${Math.round(y)}px)`);
    return true;
  };

  // ---- the menu's pages, each explained once, inside the page itself ----
  let tick = 0;
  let pageNow = '';
  let pageEl: HTMLElement | null = null;
  let pageMs = 0;
  host.addEventListener('click', (e) => {
    const id = (e.target as Element | null)?.closest?.('[data-id^="hub-"]')?.getAttribute('data-id');
    if (id && id !== 'hub-back' && id !== 'hub-close') pageNow = id.slice(4);
    else if (id) pageNow = '';
  }, true);
  const pageCard = () => {
    const open = shell.menu.isOpen();
    const title = open ? host.querySelector('.hub-head h2')?.textContent?.trim() ?? '' : '';
    if (!open || title === 'Menu' || !title) pageNow = '';
    // Opened some other way (a key, another page's link): the title names it.
    else if (!pageNow) pageNow = title.toLowerCase() === 'tally' ? 'stats' : title.toLowerCase();
    const key = `page-${pageNow}`;
    const text = pageNow && st.hints && !st.told.includes(key) ? PAGES[pageNow] : undefined;
    if (!text) {
      if (pageEl) { const was = pageEl.dataset.page ?? ''; pageEl.remove(); pageEl = null; if (pageMs > 1200 && was) tell(was); pageMs = 0; }
      return;
    }
    const body = host.querySelector('.hub-body');
    if (!body) return;
    if (pageEl && pageEl.dataset.page !== key) { pageEl.remove(); pageEl = null; pageMs = 0; }
    if (!pageEl) {
      pageEl = mk('div', 'guide-inpage');
      pageEl.dataset.id = 'guide-page-card';
      pageEl.dataset.page = key;
      pageEl.setAttribute('role', 'note');
      const ok = mk('button', 'guide-btn guide-go on', 'Good') as HTMLButtonElement;
      ok.type = 'button';
      ok.dataset.id = 'guide-page-ok';
      ok.addEventListener('click', () => { tell(key); });
      const w = mk('div', 'guide-words');
      const n = LISTED.indexOf('menu');
      w.append(mk('span', 'guide-head', `Lesson ${n + 1} of ${LISTED.length} · The Menu`), mk('p', 'guide-line', text));
      pageEl.append(mk('i', 'guide-mote'), w, ok);
    }
    // A page that redraws itself must not lose the note.
    if (pageEl.parentElement !== body) body.prepend(pageEl);
    pageMs += frameMs;
  };

  shell.onFrame((dt) => {
    try {
      const scr = shell.current();
      if (!scr) return;
      frameMs = Math.min(100, dt);
      measure();
      if (bound) { boundMs -= frameMs; if (scr === bound || boundMs <= 0) bound = null; }
      if (bound) { draw(scr, null); return; }
      if ((tick += frameMs) > 600) { tick = 0; cardDirty = true; recheck = true; }
      if (forceMs > 0) forceMs -= frameMs;
      if (restMs > 0) restMs -= frameMs;
      pageCard();
      if (st.active) advance(scr); else { maybeOffer(scr); maybeMid(scr); }
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
