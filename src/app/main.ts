/** App shell: GL canvas, screen layer, router, frame loop, save. */
import '@/ui/tokens.css';
import './app.css';
import type { Screen, ScreenId } from '@/contracts/app';
import { createGlCore, createFrameLoop } from '@/render/gl';
import { TICKS_PER_SECOND } from '@/contracts/time';
import { createApp, STARTER_SERIALS } from './context';
import { createHub } from './hub';
import { plugins } from './plugins';
import type { Shell } from './plugins';

export const boot = async (host: HTMLElement) => {
  const canvas = document.createElement('canvas');
  canvas.className = 'gl';
  const layer = document.createElement('main');
  layer.className = 'screen';
  host.append(canvas, layer);

  const gl = createGlCore(canvas);
  let current: Screen | null = null;
  let saveTimer = 0;

  let currentId: ScreenId | null = null;
  const frameCbs: ((dt: number) => void)[] = [];
  const navCbs: ((from: ScreenId | null, to: ScreenId) => void)[] = [];
  let transition: ((from: ScreenId | null, to: ScreenId, swap: () => void) => void) | null = null;
  let swapping = false;
  let queued: ScreenId | null = null;
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

  createFrameLoop({
    stepMs: 1000 / TICKS_PER_SECOND,
    fixed: () => {},
    frame: (dt) => {
      ctx.perf.sample(dt);
      const ticks = ctx.perf.tickBudget(ctx.clock.advance(dt));
      if (ticks > 0) {
        ctx.pulse().step(ticks, []);
        ctx.sim.step(ticks);
      }
      ctx.audio.setPulse(ctx.pulse());
      ctx.audio.update(dt);
      current?.frame(dt);
      for (const cb of frameCbs) cb(dt);
    },
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
  for (const p of plugins) {
    try { p(shell); } catch (e) { console.error('plugin failed', e); }
  }
  go('bedroom');
};
