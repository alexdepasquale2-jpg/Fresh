// Gesture recogniser (unit 26): a press becomes exactly one of tap / hold..release / drag.
// It also turns the keyboard and a standard gamepad into 'key' events, already mapped to what the
// player means. The map (DEFAULT_KEYMAP, changed with setKeymap) is the one source of truth for bindings:
// every help page reads bindings(), and whoever listens decides what "left" or "hold" does on the screen showing.
import type { InputFactory, InputEvent, InputAction, InputBinding, InputKeymap, Point } from '@/contracts/platform';

const HOLD_MS = 250;
const SLOP_PX = 10;

/** Defaults: action to key codes. A "Shift+" prefix means the shifted key. One code may serve two actions that live on different screens (F). */
export const DEFAULT_KEYMAP: InputKeymap = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  hold: ['Space'], confirm: ['Enter', 'NumpadEnter'], back: ['Escape', 'Backspace'], menu: ['KeyM'],
  pause: ['KeyP'], slower: ['Comma'], faster: ['Period'], speed0: ['Shift+Digit1', 'Numpad1'], speed1: ['Shift+Digit2', 'Numpad2'], speed3: ['Shift+Digit3', 'Numpad3'],
  zoomIn: ['KeyE', 'BracketRight'], zoomOut: ['KeyQ', 'BracketLeft'], tabNext: ['Tab'], tabPrev: ['Shift+Tab'],
  journal: ['KeyJ'], codex: ['KeyC'], almanac: ['KeyK'], box: ['KeyB'], eyes: ['KeyF'], fuse: ['KeyF'], guard: ['KeyG'],
  help: ['Shift+Slash', 'F1'], fullscreen: ['Shift+KeyF'],
  tool1: ['Digit1'], tool2: ['Digit2'], tool3: ['Digit3'], tool4: ['Digit4'], tool5: ['Digit5'], tool6: ['Digit6'], tool7: ['Digit7'], tool8: ['Digit8'], tool9: ['Digit9'],
};
/** Standard gamepad mapping: button index to action. */
const PAD: Readonly<Record<number, InputAction>> = { 0: 'hold', 1: 'back', 2: 'confirm', 3: 'pause', 4: 'tabPrev', 5: 'tabNext', 6: 'zoomOut', 7: 'zoomIn', 8: 'help', 9: 'menu', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
/** Either stick steers. */
const STICK: readonly [InputAction, number, number][] = [['left', 0, -1], ['right', 0, 1], ['up', 1, -1], ['down', 1, 1], ['left', 2, -1], ['right', 2, 1], ['up', 3, -1], ['down', 3, 1]];

/** Every action a key can be bound to, in the order a controls page lists them. */
export const ACTIONS: readonly { readonly action: InputAction; readonly does: string; readonly pad: string; readonly where?: string }[] = [
  { action: 'left', does: 'Left: steer the fall, pan a world, walk', pad: 'D-pad or a stick' },
  { action: 'right', does: 'Right: steer the fall, pan a world, walk', pad: 'D-pad or a stick' },
  { action: 'up', does: 'Up: aim at the middle, pan a world, walk', pad: 'D-pad or a stick' },
  { action: 'down', does: 'Down: aim at the middle, pan a world, walk', pad: 'D-pad or a stick' },
  { action: 'hold', does: 'Hold to fall, let go to hover; elsewhere the main button', pad: 'A' },
  { action: 'confirm', does: 'Press the main button, or the one in focus', pad: 'X' },
  { action: 'back', does: 'Go back, or close what is open', pad: 'B' },
  { action: 'menu', does: 'Open or close the menu', pad: 'Start' },
  { action: 'help', does: 'Show the controls for this screen', pad: 'Select' },
  { action: 'zoomIn', does: 'Lean closer', pad: 'RT' },
  { action: 'zoomOut', does: 'Step back', pad: 'LT' },
  { action: 'tabNext', does: 'Next page of a world or a star', pad: 'RB' },
  { action: 'tabPrev', does: 'Previous page', pad: 'LB' },
  { action: 'pause', does: 'Pause or resume a world', pad: 'Y' },
  { action: 'slower', does: 'Slower time', pad: '' },
  { action: 'faster', does: 'Faster time', pad: '' },
  { action: 'speed0', does: 'Time: stopped', pad: '' },
  { action: 'speed1', does: 'Time: 1x', pad: '' },
  { action: 'speed3', does: 'Time: 3x', pad: '' },
  { action: 'journal', does: 'Open the journal', pad: '' },
  { action: 'codex', does: 'Open the codex', pad: '' },
  { action: 'almanac', does: 'Open the almanac', pad: '' },
  { action: 'box', does: 'Go to the Box', pad: '' },
  { action: 'eyes', does: 'Look through the body’s eyes', pad: '', where: 'planet' },
  { action: 'guard', does: 'Guard', pad: '', where: 'battle' },
  { action: 'fuse', does: 'Fuse', pad: '', where: 'battle' },
  { action: 'fullscreen', does: 'Fullscreen on or off', pad: '' },
  { action: 'tool1', does: 'Tool, sky piece or skill 1', pad: '' }, { action: 'tool2', does: 'Tool, sky piece or skill 2', pad: '' },
  { action: 'tool3', does: 'Tool, sky piece or skill 3', pad: '' }, { action: 'tool4', does: 'Tool, sky piece or skill 4', pad: '' },
  { action: 'tool5', does: 'Tool, sky piece or skill 5', pad: '' }, { action: 'tool6', does: 'Tool, sky piece or skill 6', pad: '' },
  { action: 'tool7', does: 'Tool, sky piece or skill 7', pad: '' }, { action: 'tool8', does: 'Tool, sky piece or skill 8', pad: '' },
  { action: 'tool9', does: 'Tool, sky piece or skill 9', pad: '' },
];

const NAMES: Readonly<Record<string, string>> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Escape: 'Esc', Backspace: 'Backspace', Enter: 'Enter', NumpadEnter: 'Num Enter', Tab: 'Tab',
  BracketLeft: '[', BracketRight: ']', Comma: 'Comma', Period: 'Period', Slash: '/', Minus: '-', Equal: '=', Semicolon: ';', Quote: '\'', Backquote: '`', Backslash: '\\',
};
/** A key code as a person would say it: "Shift+Tab", "W", "?". */
export const keyName = (code: string): string => {
  if (code === 'Shift+Slash') return '?';
  if (code.startsWith('Shift+')) return `Shift+${keyName(code.slice(6))}`;
  const n = NAMES[code];
  if (n) return n;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
};
/** Two actions may share a key only when each lives on a different single screen. */
export const clashes = (a: InputAction, b: InputAction): boolean => {
  if (a === b) return false;
  const wa = ACTIONS.find((x) => x.action === a)?.where, wb = ACTIONS.find((x) => x.action === b)?.where;
  return !(wa && wb && wa !== wb);
};

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
  const gates = new Set<(e: InputEvent) => boolean>();
  let el: HTMLElement | null = null;
  /** True when an interceptor took the event. */
  const taken = (e: InputEvent): boolean => {
    for (const g of [...gates]) { try { if (g(e)) return true; } catch (err) { console.error(err); } }
    return false;
  };
  const emit = (e: InputEvent): void => {
    if (gates.size && taken(e)) return;
    for (const s of [...subs]) { try { s(e); } catch (err) { console.error(err); } }
  };

  /* ----- bindings: one map, read by the keyboard and by every help page ----- */
  let map: Partial<Record<InputAction, readonly string[]>> = { ...DEFAULT_KEYMAP };
  let byCode = new Map<string, InputAction[]>();
  const index = () => {
    byCode = new Map();
    for (const { action } of ACTIONS) for (const code of map[action] ?? []) { const l = byCode.get(code); if (l) l.push(action); else byCode.set(code, [action]); }
  };
  index();
  const bindings = (): readonly InputBinding[] =>
    ACTIONS.map((a) => ({ action: a.action, does: a.does, keys: (map[a.action] ?? []).map(keyName).join(' or '), pad: a.pad, ...(a.where ? { where: a.where } : {}) }));

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
    // Only the main button makes a gesture: the right and middle buttons belong to whoever pans with them.
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
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
  /** Physical key held, with the actions its press sent (so the right ones are let go). */
  const down = new Map<string, readonly InputAction[]>();
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || typing(ev.target)) return;
    const actions = (ev.shiftKey ? byCode.get(`Shift+${ev.code}`) : undefined) ?? byCode.get(ev.code);
    if (!actions) return;
    const first = actions[0]!;
    if ((first === 'hold' || first === 'confirm') && onControl(ev.target)) return;
    if (ev.code === 'Backspace' && onControl(ev.target)) return;
    if (ev.code === 'Tab') {
      // Tab keeps its own meaning (moving focus) unless an interceptor takes it. Subscribers never hear it.
      let took = false;
      for (const action of actions) if (taken({ type: 'key', action, phase: 'down', source: 'keyboard' })) took = true;
      if (took) ev.preventDefault();
      return;
    }
    ev.preventDefault();
    if (ev.repeat || down.has(ev.code)) return;
    down.set(ev.code, actions);
    for (const action of actions) emit({ type: 'key', action, phase: 'down', source: 'keyboard' });
  };
  const onKeyUp = (ev: KeyboardEvent) => {
    const sent = down.get(ev.code);
    if (!sent) return;
    down.delete(ev.code);
    for (const action of sent) emit({ type: 'key', action, phase: 'up', source: 'keyboard' });
  };
  const onBlur = () => {
    for (const sent of down.values()) for (const a of sent) emit({ type: 'key', action: a, phase: 'up', source: 'keyboard' });
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
    bindings,
    keymap: () => map,
    defaultKeymap: () => DEFAULT_KEYMAP,
    setKeymap: (next) => {
      map = { ...DEFAULT_KEYMAP };
      if (next) for (const { action } of ACTIONS) { const v = next[action]; if (Array.isArray(v)) map[action] = (v as unknown[]).filter((c): c is string => typeof c === 'string').slice(0, 4); }
      index();
      down.clear();
    },
    intercept: (cb) => {
      gates.add(cb);
      return () => void gates.delete(cb);
    },
  };
};
