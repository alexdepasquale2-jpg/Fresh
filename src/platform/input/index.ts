// Gesture recogniser (unit 26): a press becomes exactly one of tap / hold..release / drag.
// It also turns the keyboard and a standard gamepad into 'key' events, already mapped to what the
// player means (see BINDINGS); whoever listens decides what "left" or "hold" does on the screen showing.
import type { InputFactory, InputEvent, InputAction, InputBinding, Point } from '@/contracts/platform';

const HOLD_MS = 250;
const SLOP_PX = 10;

const KEYS: Readonly<Record<string, InputAction>> = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'hold', Enter: 'confirm', NumpadEnter: 'confirm', Escape: 'back', Backspace: 'back', KeyM: 'menu', Tab: 'menu',
  KeyP: 'pause', BracketLeft: 'slower', Comma: 'slower', BracketRight: 'faster', Period: 'faster',
  Digit1: 'tool1', Digit2: 'tool2', Digit3: 'tool3', Digit4: 'tool4', Digit5: 'tool5', Digit6: 'tool6', Digit7: 'tool7', Digit8: 'tool8', Digit9: 'tool9',
};
/** Standard gamepad mapping: button index to action. */
const PAD: Readonly<Record<number, InputAction>> = { 0: 'hold', 1: 'back', 2: 'confirm', 3: 'pause', 4: 'slower', 5: 'faster', 8: 'menu', 9: 'menu', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const STICK: readonly [InputAction, number, number][] = [['left', 0, -1], ['right', 0, 1], ['up', 1, -1], ['down', 1, 1]];

export const BINDINGS: readonly InputBinding[] = [
  { action: 'left', does: 'Steer the fall, walk the body, move between controls', keys: 'Arrows or W A S D', pad: 'D-pad or left stick' },
  { action: 'hold', does: 'Hold to fall, let go to hover', keys: 'Space', pad: 'A' },
  { action: 'confirm', does: 'Press the main button', keys: 'Enter', pad: 'X' },
  { action: 'back', does: 'Go back, or close the menu', keys: 'Esc or Backspace', pad: 'B' },
  { action: 'menu', does: 'Open or close the menu', keys: 'M', pad: 'Start' },
  { action: 'pause', does: 'Pause or resume a world', keys: 'P', pad: 'Y' },
  { action: 'slower', does: 'Slower and faster time', keys: '[ and ]', pad: 'LB and RB' },
  { action: 'tool1', does: 'Pick a tool or a skill', keys: '1 to 9', pad: '' },
];

const typing = (t: EventTarget | null): boolean => {
  const e = t as HTMLElement | null;
  if (!e || typeof e.tagName !== 'string') return false;
  return e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.tagName === 'SELECT' || e.isContentEditable === true;
};
/** A focused control answers Space and Enter itself. */
const onControl = (t: EventTarget | null): boolean => {
  const e = t as HTMLElement | null;
  if (!e || typeof e.tagName !== 'string') return false;
  return e.tagName === 'BUTTON' || e.tagName === 'A' || e.tagName === 'SUMMARY';
};

export const factory: InputFactory = () => {
  const subs = new Set<(e: InputEvent) => void>();
  let el: HTMLElement | null = null;
  const emit = (e: InputEvent) => { for (const s of [...subs]) { try { s(e); } catch (err) { console.error(err); } } };

  /* ----- pointer ----- */
  type Press = { id: number; x0: number; y0: number; t0: number; target: string | null; payload: string | null; state: 'pending' | 'hold' | 'drag'; timer: ReturnType<typeof setTimeout> | null; far: boolean };
  let press: Press | null = null;
  const at = (ev: PointerEvent): Point => {
    const r = el ? el.getBoundingClientRect() : { left: 0, top: 0 };
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const overOf = (ev: PointerEvent): string | null => {
    const under = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(ev.clientX, ev.clientY) : (ev.target as Element | null);
    return under?.closest?.('[data-drop]')?.getAttribute('data-drop') ?? null;
  };
  const stopTimer = (p: Press) => { if (p.timer !== null) { clearTimeout(p.timer); p.timer = null; } };
  const onDown = (ev: PointerEvent) => {
    if (press || !el) return; // a second finger is ignored
    const t = ev.target as Element | null;
    const p: Press = {
      id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, t0: performance.now(), state: 'pending', timer: null, far: false,
      target: t?.closest?.('[data-id]')?.getAttribute('data-id') ?? null,
      payload: t?.closest?.('[data-drag]')?.getAttribute('data-drag') ?? null,
    };
    const start = at(ev);
    p.timer = setTimeout(() => {
      p.timer = null;
      if (press === p && p.state === 'pending' && !p.far) { p.state = 'hold'; emit({ type: 'hold', at: start }); }
    }, HOLD_MS);
    press = p;
  };
  const onMove = (ev: PointerEvent) => {
    const p = press;
    if (!p || ev.pointerId !== p.id) return;
    if (!p.far && Math.hypot(ev.clientX - p.x0, ev.clientY - p.y0) > SLOP_PX) p.far = true;
    if (p.state === 'pending' && p.far && p.payload !== null) {
      stopTimer(p);
      p.state = 'drag';
      emit({ type: 'drag', phase: 'start', at: at(ev), payload: p.payload, over: overOf(ev) });
    } else if (p.state === 'drag' && p.payload !== null) {
      emit({ type: 'drag', phase: 'move', at: at(ev), payload: p.payload, over: overOf(ev) });
    }
  };
  const finish = (ev: PointerEvent, cancelled: boolean) => {
    const p = press;
    if (!p || ev.pointerId !== p.id) return;
    press = null;
    stopTimer(p);
    const heldMs = Math.round(performance.now() - p.t0);
    if (p.state === 'drag' && p.payload !== null) emit({ type: 'drag', phase: cancelled ? 'cancel' : 'end', at: at(ev), payload: p.payload, over: cancelled ? null : overOf(ev) });
    else if (p.state === 'hold') emit({ type: 'release', at: at(ev), heldMs });
    else if (!cancelled && !p.far) emit({ type: 'tap', at: at(ev), target: p.target });
    else if (!cancelled) { emit({ type: 'hold', at: at(ev) }); emit({ type: 'release', at: at(ev), heldMs }); }
  };
  const onUp = (ev: PointerEvent) => finish(ev, false);
  const onCancel = (ev: PointerEvent) => finish(ev, true);

  /* ----- keyboard ----- */
  const down = new Set<string>();
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || typing(ev.target)) return;
    const action = KEYS[ev.code];
    if (!action) return;
    // Tab keeps its own meaning (moving focus); it is only listed so M has a spare on odd layouts.
    if (ev.code === 'Tab') return;
    if ((action === 'hold' || action === 'confirm') && onControl(ev.target)) return;
    if (ev.code === 'Backspace' && onControl(ev.target)) return;
    ev.preventDefault();
    if (ev.repeat || down.has(ev.code)) return;
    down.add(ev.code);
    emit({ type: 'key', action, phase: 'down', source: 'keyboard' });
  };
  const onKeyUp = (ev: KeyboardEvent) => {
    if (!down.delete(ev.code)) return;
    const action = KEYS[ev.code];
    if (action) emit({ type: 'key', action, phase: 'up', source: 'keyboard' });
  };
  const onBlur = () => {
    for (const code of down) { const a = KEYS[code]; if (a) emit({ type: 'key', action: a, phase: 'up', source: 'keyboard' }); }
    down.clear();
  };

  /* ----- gamepad (polled only while one is plugged in) ----- */
  const padDown = new Set<InputAction>();
  const now = new Set<InputAction>();
  let padTimer: ReturnType<typeof setInterval> | null = null;
  const pollPads = () => {
    now.clear();
    let any = false;
    let pads: readonly (Gamepad | null)[] = [];
    try { pads = navigator.getGamepads?.() ?? []; } catch { pads = []; }
    for (const g of pads) {
      if (!g || !g.connected) continue;
      any = true;
      for (let i = 0; i < g.buttons.length; i++) { const a = PAD[i]; if (a && g.buttons[i]!.pressed) now.add(a); }
      for (const [a, axis, sign] of STICK) if ((g.axes[axis] ?? 0) * sign > 0.55) now.add(a);
    }
    for (const a of now) if (!padDown.has(a)) { padDown.add(a); emit({ type: 'key', action: a, phase: 'down', source: 'gamepad' }); }
    for (const a of [...padDown]) if (!now.has(a)) { padDown.delete(a); emit({ type: 'key', action: a, phase: 'up', source: 'gamepad' }); }
    if (!any && padTimer !== null) { clearInterval(padTimer); padTimer = null; }
  };
  const onPad = () => { if (padTimer === null) padTimer = setInterval(pollPads, 33); };

  const detach = () => {
    if (!el) return;
    el.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('gamepadconnected', onPad);
    if (padTimer !== null) { clearInterval(padTimer); padTimer = null; }
    if (press) { stopTimer(press); press = null; }
    down.clear();
    padDown.clear();
    el = null;
  };
  return {
    attach: (e) => {
      detach();
      el = e;
      e.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      window.addEventListener('gamepadconnected', onPad);
      // A pad that was already in before the page loaded announces nothing.
      try { if ([...(navigator.getGamepads?.() ?? [])].some((g) => g?.connected)) onPad(); } catch { /* no gamepads here */ }
    },
    detach,
    on: (cb) => {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    bindings: () => BINDINGS,
  };
};
