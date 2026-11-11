/** App shell: GL canvas, screen layer, router, frame loop, save. */
import '@/ui/tokens.css';
import './app.css';
import type { Screen, ScreenId } from '@/contracts/app';
import { createGlCore, createFrameLoop } from '@/render/gl';
import { perfControl, isPhone } from '@/platform/perf';
import type { PerfMode } from '@/platform/perf';
import { TICKS_PER_SECOND } from '@/contracts/time';
import { createApp, STARTER_SERIALS } from './context';
import { createHub } from './hub';
import { loadPlugins } from './plugins';
import type { Shell } from './plugins';
import { stage } from './plugins/desktop';

export const boot = async (host: HTMLElement) => {
  const canvas = document.createElement('canvas');
  canvas.className = 'gl';
  const layer = document.createElement('main');
  layer.className = 'screen';
  host.append(canvas, layer);

  // Desktop mode caps the drawing buffer through stage.glScale (1 in the phone layout). After the
  // device has reset the GPU, safeScale draws fewer pixels so it does not happen again.
  let shellToast: ((t: string, o?: { title?: string; sfx?: string }) => void) | null = null;
  let safeScale = 1;
  try { safeScale = Number(localStorage.getItem('sallow-gpu-safe') ?? '1') || 1; } catch { /* storage blocked */ }
  // If the page last closed while a world was still opening, the device could not hold it: the
  // browser killed the page (it goes white) before anything here could react. Open worlds gently
  // from now on: lowest quality, half resolution. It can be changed back under Menu, Performance.
  const OPENING = 'sallow-opening-world';
  let crashedOpening = false;
  try {
    const raw = localStorage.getItem(OPENING);
    if (raw) {
      localStorage.removeItem(OPENING);
      const m = JSON.parse(raw) as { at: number; frames: number };
      if (Date.now() - m.at < 30 * 60 * 1000) {
        crashedOpening = true;
        safeScale = 0.5;
        localStorage.setItem('sallow-gpu-safe', '0.5');
        perfControl.setMode('minimal');
        localStorage.setItem('sallow-last-error', JSON.stringify({ where: 'world', msg: `The page closed while a world was opening (after ${m.frames} frames). Worlds now open at Minimal quality and half resolution.`, stack: '', at: Date.now(), ua: navigator.userAgent }));
      }
    }
  } catch { /* storage blocked */ }
  // A phone draws one canvas pixel per CSS pixel instead of two or three: the art is pixel art and
  // all text is HTML, so it looks the same, at a quarter (or a ninth) of the GPU work.
  const phoneScale = isPhone() ? 1 / Math.max(1, Math.floor(Math.min(window.devicePixelRatio || 1, 2))) : 1;
  const gl = createGlCore(canvas, { resolutionScale: () => stage.glScale * (phoneScale < 1 ? phoneScale * Math.max(0.75, safeScale) : safeScale) });
  // A phone that cannot keep up resets its GPU: the canvas blinks white and, after a few resets,
  // the browser gives up on the page. Each reset steps quality and resolution down and remembers it.
  let gpuResets = 0;
  canvas.addEventListener('webglcontextlost', () => {
    gpuResets++;
    const ladder: PerfMode[] = ['high', 'medium', 'low', 'minimal'];
    const now = perfControl.mode() === 'auto' ? (['minimal', 'low', 'medium', 'high'] as const)[perfControl.stats().level ?? 3] ?? 'high' : perfControl.mode();
    const next = ladder[Math.min(ladder.length - 1, Math.max(0, ladder.indexOf(now)) + 1)]!;
    perfControl.setMode(next);
    safeScale = Math.max(0.5, Math.round((safeScale - 0.2) * 100) / 100);
    try { localStorage.setItem('sallow-gpu-safe', String(safeScale)); } catch { /* storage blocked */ }
    console.error(`[sallow] the GPU was reset (${gpuResets}); quality set to ${next}, resolution x${safeScale}`);
    try { localStorage.setItem('sallow-last-error', JSON.stringify({ where: 'gpu', msg: `The device reset its GPU (${gpuResets}). Quality now ${next}, resolution x${safeScale}.`, stack: '', at: Date.now(), ua: navigator.userAgent })); } catch { /* storage blocked */ }
    if (gpuResets === 1) shellToast?.('Your device could not keep up, so I dimmed the world a little. You can change it under Menu, Performance.', { title: 'Mote', sfx: '' });
  });
  let current: Screen | null = null;
  let saveTimer = 0;

  let currentId: ScreenId | null = null;
  const frameCbs: ((dt: number) => void)[] = [];
  const navCbs: ((from: ScreenId | null, to: ScreenId) => void)[] = [];
  let transition: ((from: ScreenId | null, to: ScreenId, swap: () => void) => void) | null = null;
  let swapping = false;
  let queued: ScreenId | null = null;
  let worldFrames = 0;
  // Leaving the page on purpose (switching apps, closing the tab) is not a crash.
  const cleared = () => { try { localStorage.removeItem(OPENING); } catch { /* storage blocked */ } };
  window.addEventListener('pagehide', cleared);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') cleared(); });
  const go = (to: ScreenId) => {
    // A navigation that lands while one is animating waits for it, then runs.
    if (swapping) { queued = to; return; }
    const from = currentId;
    let done = false;
    const swap = () => {
      if (done) return;
      done = true;
      swapping = false;
      current?.unmount();
      layer.replaceChildren();
      layer.dataset.screen = to;
      currentId = to;
      worldFrames = 0;
      try { if (to === 'planet') localStorage.setItem(OPENING, JSON.stringify({ at: Date.now(), frames: 0 })); else localStorage.removeItem(OPENING); } catch { /* storage blocked */ }
      current = app.screens[to]();
      current.mount(layer, app.ctx);
      app.ctx.bus.emit('navigate', { to });
      app.ctx.audio.setScene(to);
      app.ctx.audio.sfx('nav');
      persist();
      for (const cb of navCbs) cb(from, to);
      const next = queued;
      queued = null;
      if (next && next !== currentId) go(next);
    };
    if (transition && from) {
      swapping = true;
      try { transition(from, to, swap); } catch { swap(); }
    } else swap();
  };
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void app.ctx.save.save(app.snapshot()), 300);
  };

  const app = createApp(gl, go, persist);
  const { ctx } = app;
  ctx.input.attach(layer);
  window.addEventListener('pointerdown', () => void ctx.audio.unlock(), { once: true, capture: true });
  // Every button answers a touch.
  window.addEventListener('click', (e) => { if ((e.target as HTMLElement | null)?.closest('button')) ctx.audio.sfx('tap'); });

  const saved = await ctx.save.load();
  const resumed = saved ? { awayMs: Math.max(0, Date.now() - saved.savedAtMs) } : null;
  if (saved) {
    app.restore(saved);
    const offline = ctx.clock.catchUp(Date.now() - saved.savedAtMs);
    if (offline > 0) ctx.sim.step(offline);
  } else {
    for (const s of STARTER_SERIALS) ctx.box.add(s);
  }

  // Errors inside a frame are reported once per place and never stop the loop.
  const seen = new Set<string>();
  const report = (where: string, e: unknown) => {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    const key = `${where}|${msg}`;
    if (seen.has(key)) return;
    seen.add(key);
    console.error(`[sallow] ${where} failed:`, e);
    try { localStorage.setItem('sallow-last-error', JSON.stringify({ where, msg, stack: e instanceof Error ? (e.stack ?? '').slice(0, 800) : '', at: Date.now(), ua: navigator.userAgent })); } catch { /* storage blocked */ }
    if (seen.size <= 3) shellToast?.(`Something stumbled (${where}). The game carries on. ${msg.slice(0, 140)}`, { title: 'Mote', sfx: '' });
  };
  const guard = (where: string, fn: () => void) => { try { fn(); } catch (e) { report(where, e); } };

  createFrameLoop({
    stepMs: 1000 / TICKS_PER_SECOND,
    fixed: () => {},
    frame: (dt) => {
      // A world that has drawn for about four seconds has opened safely.
      if (currentId === 'planet' && worldFrames >= 0) {
        worldFrames++;
        if (worldFrames % 30 === 0 && worldFrames < 240) { try { localStorage.setItem(OPENING, JSON.stringify({ at: Date.now(), frames: worldFrames })); } catch { /* storage blocked */ } }
        if (worldFrames >= 240) { cleared(); worldFrames = -1; }
      }
      ctx.perf.sample(dt);
      const ticks = ctx.perf.tickBudget(ctx.clock.advance(dt));
      if (ticks > 0) {
        ctx.pulse().step(ticks, []);
        ctx.sim.step(ticks);
      }
      // Each part of a frame is guarded on its own, so a failing piece (a renderer quirk on one
      // GPU, an audio hiccup, a plugin) cannot take the rest of the game down with it.
      guard('audio', () => { ctx.audio.setPulse(ctx.pulse()); ctx.audio.update(dt); });
      guard(`screen:${currentId ?? '-'}`, () => current?.frame(dt));
      for (let i = 0; i < frameCbs.length; i++) { const cb = frameCbs[i]!; guard(`plugin:${i}`, () => cb(dt)); }
    },
    onError: (e) => report('frame', e),
  }).start();

  // Test hook (also handy in the console).
  (window as unknown as { __sallow: unknown }).__sallow = { go, ctx };
  const shell: Shell = {
    ctx, host, layer, canvas, resumed,
    ...createHub(host, (n) => ctx.audio.sfx(n)),
    current: () => currentId,
    onFrame: (cb) => void frameCbs.push(cb),
    onNavigate: (cb) => void navCbs.push(cb),
    setTransition: (fn) => void (transition = fn),
  };
  shellToast = shell.toast;
  if (crashedOpening) window.setTimeout(() => shell.toast('Last time a world was too much for this device, so I will open them gently now. You can change it under Menu, Performance.', { title: 'Mote', sfx: '' }), 6500);
  for (const p of await loadPlugins()) {
    try { p(shell); } catch (e) { console.error('plugin failed', e); }
  }
  go('bedroom');
};
