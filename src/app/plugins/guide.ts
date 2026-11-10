/**
 * Mote's guide: the first five minutes. Mote walks a new player through one whole loop
 * (room, box, dive, sky, surface) and stops when the first village has lit its lamp.
 *
 * It only ever watches real game state and points. It never blocks a touch, never clicks
 * for the player, and never throws into the frame loop.
 */
import './guide.css';
import type { Plugin } from '../plugins';
import type { ScreenId } from '@/contracts/app';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { foldFrame, childScreen } from '@/core/fold-layout';

const KEY = 'sallow-guide-v1';

/** The walk, in order. A stage only ever moves forward. */
const S = { Open: 0, Enter: 1, Hold: 2, Steer: 3, Moon: 4, Watch: 5, Speed: 6, Wait: 7, Village: 8, ChronWait: 9, Chron: 10, Try: 11, Outside: 12 } as const;
type Status = 'new' | 'active' | 'done' | 'skipped';
interface Saved { status: Status; stage: number; collapsed: boolean }

interface Rect { x: number; y: number; w: number; h: number }
type Slot = 'above' | 'below' | 'top' | 'bottom';
type Act = 'next' | 'finish' | 'begin' | 'close';
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
  /** The small button beside the line. */
  side?: 'skip' | 'no' | 'none';
  place?: Slot;
  /** The 'top' place sits just under this element instead of under the header. */
  under?: Element | null;
}

const load = (): Saved => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<Saved>;
      const status: Status = o.status === 'active' || o.status === 'done' || o.status === 'skipped' ? o.status : 'new';
      const stage = typeof o.stage === 'number' && o.stage >= S.Open && o.stage <= S.Outside ? Math.floor(o.stage) : S.Open;
      return { status, stage, collapsed: o.collapsed === true };
    }
  } catch { /* storage blocked or damaged: start over quietly */ }
  return { status: 'new', stage: S.Open, collapsed: false };
};

const PAUSED: ReadonlySet<ScreenId> = new Set<ScreenId>(['outside', 'battle', 'mirror']);

export const plugin: Plugin = (shell) => {
  const { ctx, layer, host, canvas } = shell;
  const st = load();
  const store = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* storage blocked */ } };

  // A fresh player starts at once. A returning one who never met the guide is only asked.
  let offer = false;
  if (st.status === 'new') {
    if (shell.resumed) offer = true;
    else { st.status = 'active'; st.stage = S.Open; st.collapsed = false; store(); }
  }

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
  const line = mk('p', 'guide-line');
  const side = mk('button', 'guide-btn guide-side', 'Skip') as HTMLButtonElement;
  side.type = 'button';
  const go = mk('button', 'guide-btn guide-go', 'Go on') as HTMLButtonElement;
  go.type = 'button';
  const acts = mk('div', 'guide-acts');
  acts.append(go, side);
  card.append(dot, line, acts);
  const chip = mk('button', 'guide-chip') as HTMLButtonElement;
  chip.type = 'button';
  chip.setAttribute('aria-label', 'Ask Mote');
  chip.append(mk('i', 'guide-mote'));
  root.append(ring, drift, arrow, card, chip);
  host.append(root);
  // Touches on Mote's own buttons must not reach the world beneath.
  for (const b of [dot, side, go, chip]) b.addEventListener('pointerdown', (e) => e.stopPropagation());

  // ---- transient state ----
  /** Card opened by hand on a screen where Mote is otherwise quiet. */
  let peek = false;
  /** A parting line after Skip, until the next screen. */
  let note = '';
  let holdDepth = -1;
  let holdFell = 0;
  let cardH = 0;
  let cardDirty = true;
  let slot: Slot | null = null;
  let act: Act | undefined;
  let sideMode: 'skip' | 'no' | 'none' = 'skip';
  let speedBtn: Element | null = null;
  let orbitPt: { x: number; y: number } | null = null;
  let orbitAge = 99;

  const begin = () => {
    st.status = 'active'; st.stage = S.Open; st.collapsed = false;
    offer = false; peek = false; note = '';
    store();
  };
  const finish = (status: 'done' | 'skipped') => {
    st.status = status; st.collapsed = false;
    offer = false; peek = false;
    note = status === 'skipped' && shell.current() !== 'bedroom' ? 'As you wish. I will be in the room if you want me.' : '';
    store();
  };
  const setStage = (n: number) => { if (n > st.stage) { st.stage = n; store(); } };

  go.addEventListener('click', () => {
    if (act === 'next') setStage(st.stage + 1);
    else if (act === 'finish') finish('done');
    else if (act === 'begin') begin();
    else if (act === 'close') { peek = false; note = ''; }
  });
  side.addEventListener('click', () => {
    if (sideMode === 'skip') finish('skipped');
    else if (offer) finish('skipped');
    else { peek = false; note = ''; }
  });
  const quietHere = () => PAUSED.has(shell.current() ?? 'bedroom');
  dot.addEventListener('click', () => {
    if (note) { note = ''; return; }
    if (st.status === 'active' && !quietHere()) { st.collapsed = true; store(); } else peek = false;
  });
  chip.addEventListener('click', () => {
    if (st.status === 'active' && !quietHere()) { st.collapsed = false; store(); } else peek = true;
  });
  shell.onNavigate((_from, to) => {
    peek = false; note = ''; slot = null; speedBtn = null; orbitPt = null; orbitAge = 99;
    if (to === 'dive') { holdDepth = -1; holdFell = 0; }
  });
  window.addEventListener('resize', () => { cardDirty = true; });

  // ---- reading the game ----
  const q = (sel: string): Element | null => layer.querySelector(sel);
  const byId = (id: string) => q(`[data-id="${id}"]`);
  const hasPiece = (): boolean => {
    const sys = ctx.selection.system;
    if (!sys) return false;
    for (const p of sys.planets) if (ctx.sky.skyOf(p).pieces.length > 0) return true;
    return false;
  };
  const villages = (): number => (shell.current() === 'planet' ? ctx.sim.latest()?.civ.villages.length ?? 0 : 0);
  const lines = (): number => (shell.current() === 'planet' ? ctx.sim.latest()?.chronicle.length ?? 0 : 0);
  const findSpeed = (): Element | null => {
    if (speedBtn?.isConnected) return speedBtn;
    speedBtn = byId('speed-3') ?? byId('speed-3x');
    if (!speedBtn) for (const b of layer.querySelectorAll('button')) if (b.textContent?.trim().toLowerCase() === '3x') { speedBtn = b; break; }
    return speedBtn;
  };
  const findGlow = (): Element | null => {
    for (const s of layer.querySelectorAll('.k-stat')) if (s.textContent?.toLowerCase().includes('glow')) return s;
    return null;
  };
  /** A point on the innermost drawn orbit, in viewport px, so the drag hint lands on a real ring. */
  const findOrbit = (): { x: number; y: number } | null => {
    if (orbitAge++ < 30) return orbitPt;
    orbitAge = 0;
    orbitPt = null;
    const field = byId('orbits');
    if (!field) return null;
    const fr = field.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const x = cr.width / 2;
    let any: { x: number; y: number } | null = null;
    for (let y = fr.bottom - 6; y >= fr.top + 6; y -= 6) {
      const o = ctx.renderers.system.orbitAt(x, y - cr.top);
      if (o === 0) { orbitPt = { x: cr.left + x, y }; return orbitPt; }
      if (o > 0 && !any) any = { x: cr.left + x, y };
    }
    orbitPt = any ?? { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 };
    return orbitPt;
  };

  /** Move the stage forward from what the player has really done. */
  const advance = (scr: ScreenId) => {
    if (scr === 'box' && st.stage === S.Open) setStage(S.Enter);
    else if (scr === 'dive') {
      if (st.stage < S.Hold) setStage(S.Hold);
      if (st.stage === S.Hold) {
        const v = ctx.dive.view();
        if (holdDepth < 0) holdDepth = v.depth;
        if (v.phase === 'falling') holdFell++;
        if (v.depth > holdDepth || holdFell > 40) setStage(S.Steer);
      }
    } else if (scr === 'system') {
      if (st.stage < S.Moon) setStage(S.Moon);
      if (st.stage === S.Moon && hasPiece()) setStage(S.Watch);
    } else if (scr === 'planet') {
      if (st.stage <= S.Watch && hasPiece()) setStage(S.Speed);
      if (st.stage === S.Speed && (ctx.clock.speed() === 3 || lines() >= 4)) setStage(S.Wait);
      if (st.stage === S.Wait && villages() > 0) setStage(S.Village);
      if (st.stage === S.ChronWait && lines() > 0) setStage(S.Chron);
    }
  };

  const diveCue = (): Cue => ({ place: 'top', under: q('.depth-bar'), ...diveSays() });
  const diveSays = (): Cue => {
    const v = ctx.dive.view();
    if (st.stage <= S.Hold) return { text: 'Hold, and we fall. I grow dim as we go down, so we cannot fall for ever.', target: byId('hold') };
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

  const systemCue = (): Cue => {
    if (st.stage <= S.Moon) {
      const inv = ctx.sky.inventory();
      const kind = inv.moon > 0 ? 'moon' : SKY_PIECE_KINDS.find((k) => inv[k] > 0);
      const tile = kind ? q(`[data-kind="${kind}"]`) : null;
      if (!kind || !tile) return { text: 'This is their sky. It is the only thing you may touch. For now, watch the surface.', target: byId('watch') };
      return { text: `This is their sky. It is your only lever. Drag the ${kind} up onto a ring.`, target: tile, dragTo: findOrbit(), place: 'top' };
    }
    if (st.stage === S.Watch) return { text: 'It is theirs now. It will pull at their seas and their sleep. Now watch the surface.', target: byId('watch') };
    return { text: 'Watch the surface. We were not done down there.', target: byId('watch') };
  };

  const planetCue = (): Cue => {
    switch (st.stage) {
      case S.Speed: return { text: 'Their years are slow. Set time to 3x, and watch.', target: findSpeed() };
      case S.Wait: return { text: 'Now only watch. Someone will come, and they will build.', target: byId('surface') };
      case S.Village: return { text: 'A village. They have lit a lamp under the sky you gave them. Their glow rises to me. It is your Light.', target: findGlow(), act: 'next' };
      case S.ChronWait: return { text: 'They write down what befalls them. Watch their chronicle.', target: q('.chronicle') };
      case S.Chron: return { text: 'Their first line. They do not know you, but they feel their sky. Change it, and the story changes.', target: q('.chronicle'), act: 'next' };
      case S.Try: return { text: 'You may come closer. Take a Body and walk among them, or press + to lean in. They are not always kind.', target: byId('tool-body'), act: 'next' };
      case S.Outside: return { text: 'One thing more. Outside the room are other children, with boxes of their own. Go when you wish.', act: 'finish', actLabel: 'I will', side: 'none' };
      default: return { text: 'Their sky is empty. Give them something first.', target: byId('change-sky') };
    }
  };

  /** What Mote says and points at on this screen right now, or null to stay quiet. */
  const pickCue = (scr: ScreenId): Cue | null => {
    if (note) return { text: note, act: 'close', actLabel: 'Good', side: 'none' };
    if (offer) return scr === 'bedroom' ? { text: 'You have been here before. Shall I walk with you once, from the beginning.', act: 'begin', actLabel: 'Walk with me', side: 'no', place: 'top' } : null;
    if (st.status !== 'active') return peek ? { text: 'Shall I walk with you again, from the beginning.', act: 'begin', actLabel: 'Walk with me', side: 'no', place: 'top' } : null;
    if (PAUSED.has(scr)) return peek ? { text: 'This is your own business. I will go on when we are home.', act: 'close', actLabel: 'Good', place: 'top' } : null;
    if (st.collapsed) return null;
    if (scr === 'bedroom') {
      if (st.stage === S.Open) return { text: 'I am Mote. I am your light. The box is waiting. Open it.', target: byId('open-box') };
      if (st.stage === S.Outside) return { text: 'One thing more. Outside are other children, with boxes of their own. Go when you wish.', target: byId('go-outside'), act: 'finish', actLabel: 'I will', side: 'none' };
      return { text: 'Open the box. We are not done in there.', target: byId('open-box') };
    }
    if (scr === 'box') {
      if (st.stage >= S.Moon) return { text: 'Worlds takes us straight back to their sky.', target: byId('worlds') ?? byId('enter') };
      const enter = byId('enter');
      return enter ? { text: 'Each mark is a small universe. Choose one, then Enter.', target: enter } : { text: 'Each mark is a small universe. Choose one.', target: q('.k-slot:not(.empty)') };
    }
    if (scr === 'dive') return diveCue();
    if (scr === 'system') return systemCue();
    if (scr === 'planet') return planetCue();
    return null;
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

  const chipShown = (scr: ScreenId, cue: Cue | null): boolean => {
    if (cue || offer) return false;
    if (st.status === 'active') return true;
    return scr === 'bedroom';
  };

  const draw = (scr: ScreenId, cue: Cue | null) => {
    const b = layer.getBoundingClientRect();
    // The chip: Mote, small, waiting to be asked.
    const chipOn = chipShown(scr, cue);
    show('chip', chip, chipOn);
    if (chipOn) {
      const cx = scr === 'dive' ? b.left + b.width / 2 - 22 : b.right - 52;
      put('chip-t', chip, 'transform', `translate(${Math.round(cx)}px,${Math.round(b.top + 60)}px)`);
    }
    show('card', card, !!cue);
    if (!cue) { show('ring', ring, false); show('drift', drift, false); show('arrow', arrow, false); slot = null; return; }

    // Words and buttons.
    if (txt('line', line, cue.text)) { cardDirty = true; slot = null; }
    act = cue.act;
    sideMode = cue.side ?? 'skip';
    if (txt('go', go, cue.act ? cue.actLabel ?? 'Go on' : '')) cardDirty = true;
    cls('go-on', go, 'on', !!cue.act);
    if (txt('side', side, sideMode === 'no' ? 'No' : 'Skip')) cardDirty = true;
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
      if (hi.y + hi.h / 2 > b.bottom - 4) off = 1;
      else if (hi.y + hi.h / 2 < b.top + 4) off = -1;
    }
    show('arrow', arrow, off !== 0);
    if (off !== 0) {
      put('arrow-t', arrow, 'transform', `translate(${Math.round(b.left + b.width / 2 - 22)}px,${Math.round(off > 0 ? b.bottom - 52 : b.top + 8)}px) rotate(${off > 0 ? 0 : 180}deg)`);
      hi = null;
    }
    show('ring', ring, !!hi);
    if (hi) {
      const pad = cue.round ? 2 : 5;
      put('ring-t', ring, 'transform', `translate(${Math.round(hi.x - pad)}px,${Math.round(hi.y - pad)}px)`);
      put('ring-w', ring, 'width', `${Math.round(hi.w + pad * 2)}px`);
      put('ring-h', ring, 'height', `${Math.round(hi.h + pad * 2)}px`);
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

    // Where the card sits: never over what it points at.
    const h = cardH;
    const minY = b.top + 8, maxY = b.bottom - 8 - h;
    const under = cue.under?.isConnected ? cue.under.getBoundingClientRect().bottom + 10 : b.top + 64;
    const yOf = (s: Slot): number => (s === 'top' ? under : s === 'bottom' ? maxY : hi ? (s === 'above' ? hi.y - 18 - h : hi.y + hi.h + 18) : NaN);
    const ok = (s: Slot): boolean => {
      const y = yOf(s);
      if (!(y >= minY && y <= maxY)) return false;
      if (hi && hits(y, h, { x: hi.x, y: hi.y - 14, w: hi.w, h: hi.h + 28 })) return false;
      if (to && hits(y, h, { x: to.x - 30, y: to.y - 30, w: 60, h: 60 })) return false;
      return true;
    };
    if (!slot || !ok(slot)) {
      const low = hi ? hi.y + hi.h / 2 > b.top + b.height / 2 : true;
      const order: Slot[] = low ? ['above', 'below', 'top', 'bottom'] : ['below', 'above', 'bottom', 'top'];
      if (cue.place) order.unshift(cue.place);
      slot = order.find(ok) ?? (low ? 'top' : 'bottom');
    }
    const y = yOf(slot);
    put('card-t', card, 'transform', `translate(${Math.round(b.left + 8)}px,${Math.round(Number.isNaN(y) ? minY : Math.max(minY, Math.min(maxY, y)))}px)`);
  };

  shell.onFrame(() => {
    try {
      const scr = shell.current();
      if (!scr) return;
      if (st.status === 'active') advance(scr);
      draw(scr, pickCue(scr));
    } catch {
      // Mote goes quiet rather than break the game.
      root.hidden = true;
    }
  });
};
