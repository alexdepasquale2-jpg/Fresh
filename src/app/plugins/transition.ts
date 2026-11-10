/**
 * Seamless zoom between screens. The whole game is one continuous zoom, micro to macro:
 * outside < bedroom < box < dive < system < planet (< mirror). Going deeper falls IN toward
 * the point the player last touched; going shallower rises OUT of the point they fell into;
 * sideways moves (outside <-> battle) slide and cross-fade.
 *
 * Everything is done with the Web Animations API, so nothing is ever written to the canvas'
 * or the layer's inline style: cancelling the animations is always a complete clean-up.
 */
import './transition.css';
import type { ScreenId } from '@/contracts/app';
import type { Plugin } from '../plugins';

const DEPTH: Record<ScreenId, number> = { outside: -1, battle: -1, bedroom: 0, box: 1, dive: 2, system: 3, planet: 4, mirror: 5 };

type Kind = 'in' | 'out' | 'side';
interface Phase { ms: number; easing: string; frames: (dir: 1 | -1) => Keyframe[] }
interface Spec { leave: Phase; enter: Phase }

const SPECS: Record<Kind, Spec> = {
  // Fall in: the old screen rushes past, the new one arrives from far and settles.
  in: {
    leave: { ms: 230, easing: 'cubic-bezier(.55,0,.9,.4)', frames: () => [{ transform: 'scale(1)', opacity: 1 }, { opacity: 0.55, offset: 0.6 }, { transform: 'scale(2.8)', opacity: 0 }] },
    enter: { ms: 310, easing: 'cubic-bezier(.12,.7,.25,1)', frames: () => [{ transform: 'scale(.42)', opacity: 0 }, { opacity: 1, offset: 0.55 }, { transform: 'scale(1)', opacity: 1 }] },
  },
  // Rise out: the old screen shrinks away below, the new one closes in around it.
  out: {
    leave: { ms: 230, easing: 'cubic-bezier(.5,0,.85,.45)', frames: () => [{ transform: 'scale(1)', opacity: 1 }, { opacity: 0.5, offset: 0.6 }, { transform: 'scale(.4)', opacity: 0 }] },
    enter: { ms: 310, easing: 'cubic-bezier(.12,.7,.25,1)', frames: () => [{ transform: 'scale(2.4)', opacity: 0 }, { opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }] },
  },
  side: {
    leave: { ms: 150, easing: 'ease-in', frames: (d) => [{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-28 * d}px)`, opacity: 0 }] },
    enter: { ms: 210, easing: 'cubic-bezier(.2,.7,.3,1)', frames: (d) => [{ transform: `translateX(${28 * d}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }] },
  },
};

/** How long a touch stays "the thing that caused this navigation". */
const TOUCH_FRESH_MS = 1200;

export const plugin: Plugin = (shell) => {
  const { host, layer, canvas } = shell;
  if (typeof canvas.animate !== 'function') return; // No WAAPI: keep the hard cut.
  const reduce = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  // Last touch, in viewport pixels. One listener for the life of the app.
  let touchX = 0;
  let touchY = 0;
  let touchAt = -Infinity;
  window.addEventListener('pointerdown', (e) => { touchX = e.clientX; touchY = e.clientY; touchAt = performance.now(); }, { capture: true, passive: true });
  /** Where the player fell in from each screen, so rising back out returns to the same point. */
  const fellAt = new Map<ScreenId, { x: number; y: number }>();

  // The one transition in flight.
  let anims: Animation[] = [];
  let fxAnim: Animation | null = null;
  let fx: HTMLElement | null = null;
  let timer = 0;
  /** Set while the old screen is still leaving and its swap has not been called. */
  let pending: (() => void) | null = null;
  let mySwap = false;
  let rush = false;
  /** Bumped by every navigation, so a stale midpoint knows it has been superseded. */
  let gen = 0;

  const cancel = (list: Animation[]) => {
    for (const a of list) { try { a.cancel(); } catch { /* already gone */ } }
  };
  const cleanup = () => {
    clearTimeout(timer);
    timer = 0;
    cancel(anims);
    anims = [];
    if (fxAnim) cancel([fxAnim]);
    fxAnim = null;
    fx?.remove();
    fx = null;
    host.classList.remove('tr-busy', 'tr-lock');
  };

  const play = (el: HTMLElement, phase: Phase, dir: 1 | -1, x: number, y: number, hold: boolean) => {
    const r = el.getBoundingClientRect();
    const origin = `${Math.round(x - r.left)}px ${Math.round(y - r.top)}px`;
    anims.push(el.animate(
      phase.frames(dir).map((k) => ({ ...k, transformOrigin: origin })),
      { duration: phase.ms, easing: phase.easing, fill: hold ? 'forwards' : 'none' },
    ));
  };

  const overlay = (kind: 'in' | 'out', x: number, y: number, ms: number) => {
    const el = document.createElement('div');
    el.className = `tr-fx tr-fx--${kind}`;
    el.setAttribute('aria-hidden', 'true');
    const r = host.getBoundingClientRect();
    el.style.setProperty('--tr-x', `${Math.round(x - r.left)}px`);
    el.style.setProperty('--tr-y', `${Math.round(y - r.top)}px`);
    el.style.setProperty('--tr-ms', `${ms}ms`);
    const beam = document.createElement('i');
    el.append(beam);
    host.append(el);
    fx = el;
    fxAnim = beam.animate(
      kind === 'in'
        ? [{ transform: 'scale(.25) rotate(0deg)', opacity: 0 }, { opacity: 0.75, offset: 0.4 }, { transform: 'scale(1.5) rotate(10deg)', opacity: 0 }]
        : [{ transform: 'scale(1.5)', opacity: 0 }, { opacity: 0.6, offset: 0.45 }, { transform: 'scale(.5)', opacity: 0 }],
      { duration: ms, easing: kind === 'in' ? 'cubic-bezier(.4,0,.6,1)' : 'ease-out', fill: 'both' },
    );
  };

  shell.setTransition((from, to, swap) => {
    // Whatever was still settling from the previous navigation ends now.
    cleanup();
    pending = null;
    const me = ++gen;
    const doSwap = () => {
      pending = null;
      mySwap = true;
      try { swap(); } finally { mySwap = false; }
    };
    if (rush || !from || from === to || reduce?.matches || document.hidden) { doSwap(); return; }

    const d = DEPTH[to] - DEPTH[from];
    const kind: Kind = d > 0 ? 'in' : d < 0 ? 'out' : 'side';
    const spec = SPECS[kind];
    const hostRect = host.getBoundingClientRect();
    let x = hostRect.left + hostRect.width / 2;
    let y = hostRect.top + hostRect.height / 2;
    if (kind === 'in') {
      if (performance.now() - touchAt < TOUCH_FRESH_MS) { x = touchX; y = touchY; }
      fellAt.set(from, { x, y });
    } else if (kind === 'out') {
      const p = fellAt.get(to);
      if (p) { x = p.x; y = p.y; }
    }
    const dir: 1 | -1 = to === 'battle' ? 1 : -1;

    try {
      pending = doSwap;
      // The lock keeps taps off the screen that is leaving; it lifts at the midpoint.
      host.classList.add('tr-busy', 'tr-lock');
      play(canvas, spec.leave, dir, x, y, true);
      play(layer, spec.leave, dir, x, y, true);
      if (kind !== 'side') overlay(kind, x, y, spec.leave.ms + spec.enter.ms);
      if (kind === 'in') shell.ctx.audio.sfx('fold', Math.min(1, Math.max(0, DEPTH[to] / 5)));
      else if (kind === 'out') shell.ctx.audio.sfx('zoom', 0.2);

      timer = window.setTimeout(() => {
        // Midpoint: the old screen has gone into the background colour. Change screens, then arrive.
        const leaving = anims;
        anims = [];
        try {
          doSwap();
        } finally {
          cancel(leaving);
          // A screen may navigate again from inside its own mount; that newer transition owns the stage now.
          if (me === gen) try {
            host.classList.remove('tr-lock');
            play(canvas, spec.enter, dir, x, y, false);
            play(layer, spec.enter, dir, x, y, false);
            timer = window.setTimeout(cleanup, spec.enter.ms + 40);
          } catch { cleanup(); }
        }
      }, spec.leave.ms);
    } catch {
      cleanup();
      if (pending) doSwap();
    }
  });

  // Something navigated while the old screen was still leaving (the shell then swaps at once
  // and skips us). Settle the swap we still owe, then re-issue the newer destination without
  // animation, so the player ends where the latest navigation pointed and nothing is stuck.
  shell.onNavigate((_from, to) => {
    if (mySwap || !pending) return;
    const owed = pending;
    cleanup();
    rush = true;
    try {
      owed();
      if (shell.current() !== to) shell.ctx.go(to);
    } finally { rush = false; }
  });

  // A hidden tab throttles timers: never come back to a half-faded screen.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !timer) return;
    const owed = pending;
    cleanup();
    owed?.();
  });
};
