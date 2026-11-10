/** App shell: GL canvas, screen layer, router, frame loop, save. */
import '@/ui/tokens.css';
import './app.css';
import type { Screen, ScreenId } from '@/contracts/app';
import { createGlCore, createFrameLoop } from '@/render/gl';
import { TICKS_PER_SECOND } from '@/contracts/time';
import { createApp, STARTER_SERIALS } from './context';

export const boot = async (host: HTMLElement) => {
  const canvas = document.createElement('canvas');
  canvas.className = 'gl';
  const layer = document.createElement('main');
  layer.className = 'screen';
  host.append(canvas, layer);

  const gl = createGlCore(canvas);
  let current: Screen | null = null;
  let saveTimer = 0;

  const go = (to: ScreenId) => {
    current?.unmount();
    layer.replaceChildren();
    layer.dataset.screen = to;
    current = app.screens[to]();
    current.mount(layer, app.ctx);
    app.ctx.bus.emit('navigate', { to });
    app.ctx.audio.setScene(to);
    persist();
  };
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void app.ctx.save.save(app.snapshot()), 300);
  };

  const app = createApp(gl, go, persist);
  const { ctx } = app;
  ctx.input.attach(layer);
  window.addEventListener('pointerdown', () => void ctx.audio.unlock(), { once: true });

  const saved = await ctx.save.load();
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
    },
  }).start();

  // Test hook (also handy in the console).
  (window as unknown as { __sallow: unknown }).__sallow = { go, ctx };
  go('bedroom');
};
