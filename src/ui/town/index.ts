// The town screen (id `town`): the neighbourhood outside the bedroom, walked top-down.
// World model: src/game/town. This file is the loop: input, walking, camera, and handing scenes to the sheet.
import type { ScreenFactory, AppContext } from '@/contracts/app';
import { el } from '@/ui/kit';
import { town as getTown, T, TILE, MAP_W, MAP_H, PLACES, type Town } from '@/game/town';
import { createRenderer, type Renderer, type View } from './render';
import { createPad, type Pad } from './input';
import { createHud, type Hud } from './hud';
import { createSheet, type Sheet } from './dialog';
import { bindTown, startBattle } from './facts';
import { PAL } from './sprites';
import './town.css';

const STEP: Record<number, string> = { [T.GRASS]: 'step-grass', [T.TALL]: 'step-grass', [T.FLOWER]: 'step-grass', [T.SAND]: 'step-sand', [T.PLANK]: 'step-wood', [T.STONE]: 'step-stone', [T.ROAD]: 'step-stone', [T.PAVE]: 'step-stone', [T.YARD]: 'step-stone', [T.GRAVEL]: 'step-sand', [T.CROSSING]: 'step-stone', [T.TUNNEL]: 'step-water' };

export const factory = (): { town: ScreenFactory } => ({
  town: () => {
    let ctx: AppContext | null = null, tw: Town | null = null, rd: Renderer | null = null, pad: Pad | null = null, hud: Hud | null = null, sheet: Sheet | null = null;
    let off: (() => void) | null = null, ro: ResizeObserver | null = null;
    let pathLen = 0, pathI = 0, pendX = -1, pendY = -1, lastTx = -1, lastTy = -1, stepIn = 0, hudIn = 0, moodIn = 0, walking = false, still = false, clock = 0;
    const view: View = { camX: 0, camY: 0, kidX: 0, kidY: 0, kidDir: 0, kidFrame: 0, moteX: 0, moteY: 0, moteLevel: 1, t: 0, goX: -1, goY: -1, markX: -1, markY: -1, still: false };
    const times = new Float32Array(240), sorted = new Float32Array(240);
    let ti = 0, tn = 0;
    const median = (): number => { if (!tn) return 0; sorted.set(times); const s = sorted.subarray(0, tn).sort(); return s[tn >> 1]!; };

    const stopPath = (): void => { pathLen = 0; pathI = 0; pendX = pendY = -1; view.goX = -1; };
    const interact = (tx: number, ty: number): void => { stopPath(); const s = tw!.interact(tx, ty); if (s) sheet!.show(s); };
    const tapTile = (tx: number, ty: number): void => {
      const t = tw!, kx = Math.floor(t.state.x / TILE), ky = Math.floor(t.state.y / TILE);
      let a = t.actorAt(tx, ty), ay = ty;
      if (!a) { a = t.actorAt(tx, ty + 1); if (a) ay = ty + 1; }
      const target = a !== null || t.blocked(tx, ay) || t.map.tiles[ay * MAP_W + tx] === T.GATE;
      if (target && Math.abs(kx - tx) + Math.abs(ky - ay) <= 1) { interact(tx, ay); return; }
      let len = t.path(kx, ky, tx, ay);
      if (!len && target && !a) {
        // Water out of reach of the bank: walk to the skimming spot beside it instead.
        const sp = PLACES.find((q) => q.skim && Math.abs(q.at[0] - tx) + Math.abs(q.at[1] - ay) <= 5);
        if (sp) { if (kx === sp.at[0] && ky === sp.at[1]) { interact(tx, ay); return; } len = t.path(kx, ky, sp.at[0], sp.at[1]); }
      }
      if (!len) { ctx!.audio.sfx('deny'); stopPath(); return; }
      pathLen = len; pathI = 0; view.goX = tx; view.goY = ay;
      pendX = target ? tx : -1; pendY = target ? ay : -1;
      ctx!.audio.sfx('tap', 0.3);
    };
    const free = (x: number, y: number): boolean => {
      const t = tw!;
      return !t.blocked(Math.floor((x - 4) / TILE), Math.floor((y - 3) / TILE)) && !t.blocked(Math.floor((x + 4) / TILE), Math.floor((y - 3) / TILE))
        && !t.blocked(Math.floor((x - 4) / TILE), Math.floor((y + 3) / TILE)) && !t.blocked(Math.floor((x + 4) / TILE), Math.floor((y + 3) / TILE));
    };
    const snapCamera = (): void => {
      const st = tw!.state, r = rd!;
      view.kidX = st.x; view.kidY = st.y;
      view.camX = Math.max(0, Math.min(MAP_W * TILE - r.vw, st.x - r.vw / 2)); view.camY = Math.max(0, Math.min(MAP_H * TILE - r.vh, st.y - r.vh / 2));
      view.moteX = st.x - 10; view.moteY = st.y - 24;
    };

    return {
      id: 'town',
      mount: (root, c) => {
        ctx = c; tw = getTown();
        bindTown(c);
        const t = tw;
        // Never resume inside a wall (an older save, or a map that has changed).
        if (!free(t.state.x, t.state.y)) { t.state.x = 62 * TILE + 8; t.state.y = 57 * TILE + 8; }
        if (t.state.fromTown && !c.battle) { t.state.fromTown = false; }
        const wrap = el('div', { class: 'town-root', 'data-id': 'town-root' });
        const canvas = el('canvas', { class: 'town-canvas', 'data-id': 'town-canvas' });
        wrap.append(canvas); root.append(wrap);
        rd = createRenderer(canvas, t);
        const size = (): void => { rd!.resize(Math.max(120, wrap.clientWidth || 390), Math.max(160, wrap.clientHeight || 844)); snapCamera(); };
        size();
        ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : null; ro?.observe(wrap);
        pad = createPad(canvas, c.input);
        sheet = createSheet(wrap, t, (n, a) => c.audio.sfx(n, a));
        hud = createHud(wrap, t, {
          run: () => { t.state.run = !t.state.run; hud!.setRun(t.state.run); c.audio.sfx('toggle', t.state.run ? 1 : 0); },
          bag: () => { c.audio.sfx('open'); sheet!.bag(); },
          map: () => { c.audio.sfx('open'); sheet!.map(); },
          home: () => { t.save(); c.go('bedroom'); },
        });
        hud.setRun(t.state.run);
        still = document.documentElement.classList.contains('sallow-reduce-motion') || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
        view.still = still;
        off = t.on((e) => {
          if (e.type === 'sfx') c.audio.sfx(e.name);
          else if (e.type === 'battle') { t.save(); if (!startBattle(c, e.rival)) { t.state.fromTown = false; sheet!.show({ who: '', text: 'You have nothing to field. Their box stays shut.' }); } }
          else if (e.type === 'go') { t.save(); c.go(e.to); }
          else if (e.type === 'moved') { stopPath(); snapCamera(); lastTx = -1; }
          else if (e.type === 'district') hud!.banner(e.name, e.says);
          else if (e.type === 'quest') c.audio.sfx(e.state === 'done' ? 'chapter' : 'confirm');
          else if (e.type === 'coins') c.audio.sfx('gain');
        });
        lastTx = Math.floor(t.state.x / TILE); lastTy = Math.floor(t.state.y / TILE);
        t.moved(lastTx, lastTy);
        hud.update(t.districtAt(lastTx, lastTy));
        (window as unknown as { __sallowTown: unknown }).__sallowTown = {
          town: t, frameMs: median,
          warp: (tx: number, ty: number) => { t.state.x = tx * TILE + 8; t.state.y = ty * TILE + 8; stopPath(); snapCamera(); lastTx = -1; },
          tap: (tx: number, ty: number) => tapTile(tx, ty),
          cam: () => [Math.round(view.camX), Math.round(view.camY), rd?.scale ?? 2],
        };
      },
      frame: (dtRaw) => {
        const c = ctx, t = tw, r = rd, p = pad, h = hud, sh = sheet;
        if (!c || !t || !r || !p || !h || !sh) return;
        const t0 = performance.now();
        c.gl.clear(PAL[0]);
        const dt = Math.min(50, Math.max(0, dtRaw));
        clock += dt; view.t = clock;
        t.tick(dt);
        const st = t.state;
        let moving = false;
        if (sh.open()) {
          p.tapX = -1;
          if (p.confirm) sh.advance();
          if (p.back) sh.close();
          sh.frame(dt);
        } else {
          if (p.tapX >= 0) { tapTile(Math.floor((p.tapX / r.scale + Math.round(view.camX)) / TILE), Math.floor((p.tapY / r.scale + Math.round(view.camY)) / TILE)); p.tapX = -1; }
          const sp = (st.run ? 0.1 : 0.06) * dt;
          if (p.x !== 0 || p.y !== 0) {
            if (pathLen) stopPath();
            const m = Math.hypot(p.x, p.y), k = m > 1 ? 1 / m : 1, dx = p.x * k * sp, dy = p.y * k * sp;
            if (dx !== 0 && free(st.x + dx, st.y)) { st.x += dx; moving = true; }
            if (dy !== 0 && free(st.x, st.y + dy)) { st.y += dy; moving = true; }
            st.dir = Math.abs(p.x) > Math.abs(p.y) ? (p.x < 0 ? 2 : 3) : (p.y < 0 ? 1 : 0);
          } else if (pathI < pathLen) {
            const gx = t.pathX[pathI]! * TILE + 8, gy = t.pathY[pathI]! * TILE + 8, dx = gx - st.x, dy = gy - st.y;
            if (t.blocked(t.pathX[pathI]!, t.pathY[pathI]!)) stopPath();
            else {
              if (Math.abs(dx) <= sp && Math.abs(dy) <= sp) { st.x = gx; st.y = gy; pathI++; }
              else { if (Math.abs(dx) > 0.01) st.x += Math.sign(dx) * Math.min(sp, Math.abs(dx)); else st.y += Math.sign(dy) * Math.min(sp, Math.abs(dy)); }
              st.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0);
              moving = true;
              if (pathI >= pathLen) { const px = pendX, py = pendY; stopPath(); if (px >= 0) { st.dir = Math.abs(px - Math.floor(st.x / TILE)) > 0 ? (px < Math.floor(st.x / TILE) ? 2 : 3) : (py < Math.floor(st.y / TILE) ? 1 : 0); interact(px, py); } }
            }
          }
          if (p.confirm) {
            const kx = Math.floor(st.x / TILE), ky = Math.floor(st.y / TILE);
            const fx = kx + (st.dir === 2 ? -1 : st.dir === 3 ? 1 : 0), fy = ky + (st.dir === 1 ? -1 : st.dir === 0 ? 1 : 0);
            const s = t.interact(fx, fy) ?? t.interact(kx, ky);
            if (s) { stopPath(); sh.show(s); }
          }
        }
        p.confirm = false; p.back = false;
        const tx = Math.floor(st.x / TILE), ty = Math.floor(st.y / TILE);
        if (tx !== lastTx || ty !== lastTy) {
          lastTx = tx; lastTy = ty;
          const s = t.moved(tx, ty);
          if (s) { stopPath(); sh.show(s); }
          else if (pendX >= 0 && Math.abs(pendX - tx) + Math.abs(pendY - ty) <= 1) { const px = pendX, py = pendY; interact(px, py); }
        }
        if (moving) { stepIn -= dt * (st.run ? 1.5 : 1); if (stepIn <= 0) { stepIn = 300; c.audio.sfx(STEP[t.map.tiles[ty * MAP_W + tx]!] ?? 'step', 0.4); } }
        walking = moving;
        // Camera follows; Mote trails behind and above.
        view.kidX = st.x; view.kidY = st.y; view.kidDir = st.dir; view.kidFrame = walking ? ((clock / (st.run ? 130 : 190)) | 0) & 1 : 0;
        const cx = Math.max(0, Math.min(MAP_W * TILE - r.vw, st.x - r.vw / 2)), cy = Math.max(0, Math.min(MAP_H * TILE - r.vh, st.y - r.vh / 2 + 20));
        const ease = still ? 1 : Math.min(1, dt * 0.012);
        view.camX += (cx - view.camX) * ease; view.camY += (cy - view.camY) * ease;
        const mxT = st.x + (st.dir === 3 ? -11 : 11), myT = st.y - 25 + (still ? 0 : Math.sin(clock / 420) * 2.5), me = Math.min(1, dt * 0.006);
        view.moteX += (mxT - view.moteX) * me; view.moteY += (myT - view.moteY) * me;
        hudIn -= dt;
        if (hudIn <= 0) {
          hudIn = 250;
          h.update(t.districtAt(tx, ty));
          if (!sh.open()) { const s = t.pop(); if (s) { stopPath(); sh.show(s); } }
          const lv = c.light.view();
          view.moteLevel = lv.low ? 0.25 : Math.max(0.3, lv.pips / 8);
          const lead = t.lead();
          view.markX = lead?.at ? lead.at[0] : -1; view.markY = lead?.at ? lead.at[1] : -1;
        }
        moodIn -= dt;
        if (moodIn <= 0) { moodIn = 2000; const w = t.weather(); c.audio.setMood?.({ rain: w === 'rain' ? 0.8 : 0, wind: w === 'wind' ? 0.8 : 0.15, day: Math.round(((st.minutes % 1440) / 1440) * 999), light: view.moteLevel }); }
        h.stick(p.stick, p.ox, p.oy, p.kx, p.ky);
        r.draw(view);
        times[ti] = performance.now() - t0; ti = (ti + 1) % times.length; if (tn < times.length) tn++;
      },
      unmount: () => {
        tw?.save();
        off?.(); off = null; ro?.disconnect(); ro = null; pad?.dispose(); rd?.dispose();
        ctx = null; tw = null; rd = null; pad = null; hud = null; sheet = null;
      },
    };
  },
});
