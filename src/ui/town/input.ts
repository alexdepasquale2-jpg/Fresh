// Walking input: tap a tile, hold and drag for a stick, or keys. Own pointer listeners on the town canvas;
// keyboard through ctx.input 'key' events with a plain keydown fallback for arrows and WASD.
import type { Input } from '@/contracts/platform';

export interface Pad {
  /** Stick or keys, each -1..1. */
  x: number; y: number;
  /** A tap waiting to be taken, in canvas CSS px; -1 when none. */
  tapX: number; tapY: number;
  /** Stick origin and knob, for drawing; active while dragging. */
  stick: boolean; ox: number; oy: number; kx: number; ky: number;
  confirm: boolean; back: boolean;
  dispose(): void;
}

export const createPad = (el: HTMLElement, input: Input): Pad => {
  const keys = { left: false, right: false, up: false, down: false };
  let id = -1, sx = 0, sy = 0, st = 0, sdx = 0, sdy = 0;
  const pad: Pad = { x: 0, y: 0, tapX: -1, tapY: -1, stick: false, ox: 0, oy: 0, kx: 0, ky: 0, confirm: false, back: false, dispose: () => {} };
  const sync = (): void => {
    const kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), ky = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    pad.x = pad.stick ? sdx : kx; pad.y = pad.stick ? sdy : ky;
  };
  const local = (e: PointerEvent): [number, number] => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e: PointerEvent): void => { if (id !== -1) return; id = e.pointerId; [sx, sy] = local(e); st = e.timeStamp; try { el.setPointerCapture(id); } catch { /* fine */ } };
  const move = (e: PointerEvent): void => {
    if (e.pointerId !== id) return;
    const [x, y] = local(e), dx = x - sx, dy = y - sy, d = Math.hypot(dx, dy);
    if (!pad.stick && d > 14) { pad.stick = true; pad.ox = sx; pad.oy = sy; }
    if (pad.stick) { const m = Math.min(1, d / 44); sdx = d ? (dx / d) * m : 0; sdy = d ? (dy / d) * m : 0; pad.kx = sx + sdx * 44; pad.ky = sy + sdy * 44; sync(); }
  };
  const up = (e: PointerEvent): void => {
    if (e.pointerId !== id) return;
    id = -1;
    if (pad.stick) { pad.stick = false; sdx = sdy = 0; sync(); }
    else if (e.type === 'pointerup' && e.timeStamp - st < 600) { const [x, y] = local(e); pad.tapX = x; pad.tapY = y; }
  };
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  const setKey = (k: string, on: boolean): boolean => { if (k === 'left' || k === 'right' || k === 'up' || k === 'down') { keys[k] = on; sync(); return true; } return false; };
  const off = input.on((e) => {
    if (e.type !== 'key') return;
    if (setKey(e.action, e.phase === 'down')) return;
    if (e.phase === 'down' && (e.action === 'confirm' || e.action === 'hold')) pad.confirm = true;
    if (e.phase === 'down' && e.action === 'back') pad.back = true;
  });
  const CODES: Record<string, string> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
  const kd = (e: KeyboardEvent): void => { const k = CODES[e.code]; if (k) setKey(k, true); else if (e.code === 'KeyE') pad.confirm = true; };
  const ku = (e: KeyboardEvent): void => { const k = CODES[e.code]; if (k) setKey(k, false); };
  const blur = (): void => { keys.left = keys.right = keys.up = keys.down = false; sync(); };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', blur);
  pad.dispose = () => {
    off(); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur);
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
  };
  return pad;
};
