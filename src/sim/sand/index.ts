// Surface sim (unit 09). Falling sand plus a living climate:
// - 32x32 active chunks; powders, liquids, gases, fire, life by material table
// - coarse temperature field (4x4 cells) with day/night, seasons, sky warmth and fire heat
// - phase changes: water freezes and boils, ice and snow melt, moss burns and dies of frost
// - water cycle: evaporation -> humidity per column -> clouds drift on the wind -> rain or snow
// - storms with lightning; tides; impacts that dig craters, scatter debris, deliver water or ore
// - erosion: running water lifts sand and lays it down elsewhere; wind drifts surface powders
// Integer-only and deterministic: same planet + same steps = same world.
import type { SurfaceSimFactory, GridView, SurfaceEnv, SurfaceEvent, SurfaceEventKind } from '@/contracts/sim';
import type { SurfaceModifiers } from '@/contracts/sky';
import type { ModifierKey } from '@/contracts/atlas';
import { GRID_W as W, GRID_H as H, CHUNK, FIELD, ENGINE, DAY_TICKS, YEAR_TICKS } from '@/contracts/sim';
import { fxSin, FX_ONE } from '@/core/fixed';

const K = { empty: 0, solid: 1, powder: 2, liquid: 3, gas: 4, fire: 5, life: 6 } as const;
interface Rx {
  b: number; ta: number; tb: number; num: number; den: number; key: ModifierKey | null; min: number; max: number;
  /** Optional gates (law-set primitives). g is false for a plain reaction, which then runs exactly as it always did. */
  g: boolean; dir: number; y0: number; y1: number; light: number; t0: number; t1: number; w0: number; w1: number; h0: number; h1: number; heat: number; wet: number;
}
const LIGHT = { day: 1, night: 2, lit: 3, dark: 4 } as const;
const DIR = { up: 1, down: 2, side: 3 } as const;

const FW = Math.ceil(W / FIELD);
const FH = Math.ceil(H / FIELD);
const ICE = ENGINE.ice.id, SNOW = ENGINE.snow.id, ORE = ENGINE.ore.id, FIRE = ENGINE.fire.id, ASH = ENGINE.ash.id;

/** sin of a 0..999 phase, as -1000..1000 integer. */
const isin = (phase: number) => Math.trunc((fxSin(Math.trunc((phase * FX_ONE) / 1000)) * 1000) / FX_ONE);

export const factory: SurfaceSimFactory = () => {
  const cells = new Uint8Array(W * H);
  const stamp = new Uint16Array(W * H);
  const CX = Math.ceil(W / CHUNK);
  const CY = Math.ceil(H / CHUNK);
  const dirty = new Uint8Array(CX * CY);
  let active = new Uint8Array(CX * CY);
  let next = new Uint8Array(CX * CY);
  const kind = new Uint8Array(256);
  const dens = new Uint8Array(256);
  // Law-set material behaviours: movement kind (a powder may flow by night), inverted gravity, wind drift, thickness.
  const mv = new Uint8Array(256);
  const up = new Uint8Array(256);
  const drift = new Uint8Array(256);
  const visc = new Uint8Array(256);
  const flow = new Uint8Array(256);
  const flowIds: number[] = [];
  const lightOk = new Uint8Array(5);
  const temp = new Uint8Array(FW * FH);
  const heat = new Int16Array(FW * FH); // per-tick heat sources (fire) accumulated in the pass
  const hum = new Uint8Array(FW);
  const humTmp = new Uint8Array(FW);
  let rx: Rx[][] = [];
  let tick = 0;
  let seed = 0x9e3779b9;
  let WATER = 3, SAND = 2, MOSS = 4, STEAM = 5, STONE = 1;
  let mods: SurfaceModifiers | null = null;
  let wind = 0;
  let rain = 0;
  let snowing = false;
  let lightning = 9999;
  let events: SurfaceEvent[] = [];
  const counts = { water: 0, ice: 0, fire: 0, moss: 0 };
  let lastCounts = { water: -1, ice: 0, fire: 0, moss: 0 };
  let stormy = false;

  const rand = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed;
  };
  const ri = (n: number) => rand() % n;
  const emit = (kindE: SurfaceEventKind, x: number, y: number, size: number) => {
    if (events.length < 64) events.push({ kind: kindE, tick, x, y, size });
  };
  const wake = (x: number, y: number) => {
    const cx = (x / CHUNK) | 0, cy = (y / CHUNK) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const a = cx + dx, b = cy + dy;
      if (a >= 0 && b >= 0 && a < CX && b < CY) next[b * CX + a] = 1;
    }
    dirty[cy * CX + cx] = 1;
  };
  const set = (i: number, m: number) => {
    if (cells[i] === m) return;
    cells[i] = m;
    stamp[i] = tick & 0xffff;
    wake(i % W, (i / W) | 0);
  };
  const swap = (i: number, j: number) => {
    const t = cells[i]!;
    cells[i] = cells[j]!;
    cells[j] = t;
    stamp[i] = stamp[j] = tick & 0xffff;
    wake(i % W, (i / W) | 0);
    wake(j % W, (j / W) | 0);
  };
  const canSink = (m: number, t: number) => { const k = kind[t]!; return k === K.empty || ((k === K.liquid || k === K.gas || k === K.fire) && dens[t]! < dens[m]!); };
  const canRise = (m: number, t: number) => { const k = kind[t]!; return k === K.empty || ((k === K.liquid || k === K.gas) && dens[t]! > dens[m]!); };
  const tryMove = (i: number, x: number, y: number, dx: number, dy: number, rise: boolean) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) return false;
    const j = ny * W + nx;
    if (!(rise ? canRise(cells[i]!, cells[j]!) : canSink(cells[i]!, cells[j]!))) return false;
    swap(i, j);
    return true;
  };
  const tAt = (x: number, y: number) => temp[((y / FIELD) | 0) * FW + ((x / FIELD) | 0)]!;
  const surfaceY = (x: number) => {
    let y = 0;
    while (y < H - 1) {
      const k = kind[cells[y * W + x]!];
      if (k !== K.empty && k !== K.gas) break;
      y++;
    }
    return y;
  };

  const react = (i: number, x: number, y: number) => {
    const list = rx[cells[i]!];
    if (!list || list.length === 0) return;
    const d = ri(4);
    const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) return;
    const j = ny * W + nx;
    for (const r of list) {
      if (r.b >= 0 && r.b !== cells[j]) continue;
      if (r.key && mods) { const v = mods[r.key]; if (v < r.min || v > r.max) continue; }
      if (r.g) {
        if (r.dir !== 0 && r.dir !== (d === 3 ? 1 : d === 2 ? 2 : 3)) continue;
        if (y < r.y0 || y > r.y1) continue;
        if (r.light !== 0 && lightOk[r.light] === 0) continue;
        const T = temp[((y / FIELD) | 0) * FW + ((x / FIELD) | 0)]!;
        if (T < r.t0 || T > r.t1) continue;
        const wp = wind < 0 ? -wind : wind;
        if (wp < r.w0 || wp > r.w1) continue;
        const hc = hum[(x / FIELD) | 0]!;
        if (hc < r.h0 || hc > r.h1) continue;
        if (ri(r.den) >= r.num) continue;
        if (r.heat !== 0) { const hk = ((y / FIELD) | 0) * FW + ((x / FIELD) | 0); heat[hk] = heat[hk]! + r.heat; }
        if (r.wet !== 0) { const cx = (x / FIELD) | 0; const h = hc + r.wet; hum[cx] = h < 0 ? 0 : h > 255 ? 255 : h; }
        set(i, r.ta);
        if (r.tb >= 0) set(j, r.tb);
        return;
      }
      if (ri(r.den) >= r.num) continue;
      set(i, r.ta);
      set(j, r.tb);
      return;
    }
  };

  // Climate rules that hold in every universe, applied by temperature and light.
  const climate = (i: number, x: number, y: number, c: number, T: number, daylight: number) => {
    if (c === WATER) {
      if (T < 100 && ri(30) === 0) {
        // Freeze from the top down: only water with air or ice above.
        const up = y > 0 ? cells[i - W]! : 0;
        if (up === 0 || up === ICE || up === SNOW) set(i, ICE);
      } else if (T > 205 && ri(25) === 0) set(i, STEAM);
    } else if (c === ICE) {
      if (T > 112 && ri(40) === 0) set(i, WATER);
    } else if (c === SNOW) {
      if (T > 108 && ri(25) === 0) set(i, WATER);
    } else if (c === MOSS) {
      if (T > 215 && ri(40) === 0) set(i, FIRE);
      else if (T < 92 && ri(300) === 0) set(i, SAND);
      else if (daylight > 300 && T > 105 && T < 190 && ri(700) === 0) {
        // Growth toward light: moss creeps onto wet sand nearby.
        const j = i + (ri(2) ? 1 : -1) + (ri(3) - 1) * W;
        if (j > 0 && j < W * H && cells[j] === SAND) {
          for (let k = -2; k <= 2; k++) if (cells[j + k] === WATER || cells[j + k + W] === WATER) { set(j, MOSS); break; }
        }
      }
    } else if (c === FIRE) {
      { const hk = ((y / FIELD) | 0) * FW + ((x / FIELD) | 0); heat[hk] = heat[hk]! + 6; }
      const r = ri(12);
      if (r === 0) set(i, ri(3) === 0 ? ASH : 0);
      else if (r < 5) {
        const j = i + (ri(2) ? 1 : -1) + (ri(3) - 1) * W;
        if (j > 0 && j < W * H) {
          const t = cells[j]!;
          if (t === MOSS || (kind[t] === K.life)) set(j, FIRE);
          else if (t === WATER) { set(i, STEAM); }
          else if (t === ICE || t === SNOW) set(j, WATER);
        }
      }
    } else if (c === STEAM) {
      if (y < 8) {
        set(i, 0);
        const cx = (x / FIELD) | 0;
        hum[cx] = Math.min(255, hum[cx]! + 4);
      } else if (T < 110 && ri(80) === 0) set(i, WATER);
    }
  };

  const impact = (m: SurfaceModifiers, atX = -1, big = 0) => {
    const x = atX >= 0 ? Math.max(4, Math.min(W - 5, atX)) : 4 + ri(W - 8);
    const y = surfaceY(x);
    const rad = 3 + ri(3) + (m.impacts > 50 ? 2 : 0) + big;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const px = x + dx, py = y + dy;
      if (px < 0 || px >= W || py < 0 || py >= H || dx * dx + dy * dy > rad * rad) continue;
      const pi = py * W + px;
      // Molten rim, ore at the floor when the sky is iron-rich (impacts + night light from a belt).
      if (dx * dx + dy * dy >= (rad - 1) * (rad - 1) && py > y && ri(3) === 0) set(pi, m.nightLight > 0 && ri(2) ? ORE : STONE);
      else set(pi, 0);
    }
    for (let k = 0; k < rad * 4; k++) {
      const px = x - rad * 2 + ri(rad * 4 + 1), py = Math.max(0, y - rad - ri(rad * 3));
      if (px < 0 || px >= W || kind[cells[py * W + px]!] !== K.empty) continue;
      const roll = ri(10);
      set(py * W + px, roll < 2 ? FIRE : m.tide > 0 && roll === 2 ? WATER : roll < 5 && m.nightLight > 0 ? ORE : SAND);
    }
    const cx = (x / FIELD) | 0;
    hum[cx] = Math.min(255, hum[cx]! + 40); // impacts throw up vapour
    emit('impact', x, y, rad);
    if (m.nightLight > 0) emit('ore', x, y, rad);
  };

  const strike = (atX = -1) => {
    // Lightning hits the highest point under the wettest cloud.
    let best = 0;
    for (let c = 1; c < FW; c++) if (hum[c]! > hum[best]!) best = c;
    const x = atX >= 0 ? Math.max(0, Math.min(W - 1, atX)) : Math.min(W - 1, best * FIELD + ri(FIELD));
    const y = surfaceY(x);
    if (y >= H - 1) return;
    const i = y * W + x;
    const c = cells[i]!;
    if (c === MOSS || kind[c] === K.life || c === SAND) set(Math.max(0, i - W), FIRE);
    if (c === MOSS) set(i, FIRE);
    lightning = 0;
    emit('lightning', x, y, 1);
  };

  const updateClimate = (m: SurfaceModifiers) => {
    const day = tick % DAY_TICKS;
    const season = tick % YEAR_TICKS;
    const sunUp = -isin(Math.trunc((day * 1000) / DAY_TICKS) + 250); // -1000 midnight .. 1000 noon
    const seasonal = isin(Math.trunc((season * 1000) / YEAR_TICKS)); // +summer, -winter
    const amp = 18 + Math.max(-10, m.seasons) / 2;
    const base = 132 + Math.trunc((m.warmth * 8) / 10) - Math.trunc((m.dimming * 4) / 10) + Math.trunc((seasonal * amp) / 1000);
    const daily = Math.trunc((sunUp * (10 - Math.trunc(m.dimming / 20))) / 1000);
    // Wind: seasonal swing plus dust storms.
    wind = Math.max(-100, Math.min(100, Math.trunc(isin(Math.trunc((tick * 7) % 1000)) / 25) + Math.trunc(m.dust / 2) * (isin(Math.trunc((season * 3000) / YEAR_TICKS) % 1000) > 0 ? 1 : -1)));
    for (let fy = 0; fy < FH; fy++) {
      // High air is colder; deep ground holds a steady warmth.
      const depthAdj = fy < 4 ? -8 + fy * 2 : fy > FH - 8 ? Math.trunc((140 - base) / 2) : 0;
      for (let fx = 0; fx < FW; fx++) {
        const k = fy * FW + fx;
        const cloud = hum[fx]! > 120 ? -4 : 0;
        const amb = base + daily + depthAdj + cloud;
        let t = temp[k]!;
        // Diffuse with neighbours, relax to ambient, add fire heat.
        const n = (fx > 0 ? temp[k - 1]! : t) + (fx < FW - 1 ? temp[k + 1]! : t) + (fy > 0 ? temp[k - FW]! : t) + (fy < FH - 1 ? temp[k + FW]! : t);
        t = t + Math.trunc((n - 4 * t) / 8) + Math.trunc((amb - t) / 6) + heat[k]!;
        temp[k] = t < 0 ? 0 : t > 255 ? 255 : t;
      }
    }
    heat.fill(0);
  };

  const updateWeather = (_m: SurfaceModifiers) => {
    // Evaporation from warm open water.
    for (let k = 0; k < 20; k++) {
      const x = ri(W);
      const y = surfaceY(x);
      if (y >= H - 1) continue;
      const i = y * W + x;
      if (cells[i] === WATER && tAt(x, y) > 112 && ri(3) === 0) {
        set(i, 0);
        const cx = (x / FIELD) | 0;
        hum[cx] = Math.min(255, hum[cx]! + 4);
      }
    }
    // Clouds drift on the wind and spread.
    if (tick % 6 === 0) {
      // Exact-flux transfers so no moisture is created or lost. The sky wraps around the world.
      for (let c = 0; c < FW; c++) {
        const n = c === FW - 1 ? 0 : c + 1;
        const f = Math.trunc((hum[c]! - hum[n]!) / 6);
        hum[c] = hum[c]! - f;
        hum[n] = hum[n]! + f;
      }
      const dir = wind > 0 ? 1 : -1;
      const pow = Math.abs(wind);
      if (pow > 10) {
        humTmp.set(hum);
        for (let c = 0; c < FW; c++) {
          const f = Math.trunc((humTmp[c]! * pow) / 400);
          const n = (c + dir + FW) % FW;
          hum[c] = hum[c]! - f;
          hum[n] = Math.min(255, hum[n]! + f);
        }
      }
    }
    // Rain or snow from heavy cloud.
    rain = 0;
    snowing = false;
    for (let c = 0; c < FW; c++) {
      const h = hum[c]!;
      if (h <= 70) continue;
      rain += h - 70;
      if (ri(160) < h - 70) {
        const x = Math.min(W - 1, c * FIELD + ri(FIELD));
        const cold = tAt(x, 2) < 104;
        if (cold) snowing = true;
        if (cells[x] === 0) {
          set(x, cold ? SNOW : WATER);
          hum[c] = h - 4;
        }
      }
    }
    rain = Math.min(255, rain >> 2);
    lightning++;
    const storm = rain > 90;
    if (storm && !stormy) emit('storm', W >> 1, 0, rain);
    stormy = storm;
    if (storm && ri(500) === 0) strike();
  };

  const tally = () => {
    counts.water = counts.ice = counts.fire = counts.moss = 0;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]!;
      if (c === WATER) counts.water++;
      else if (c === ICE) counts.ice++;
      else if (c === FIRE) counts.fire++;
      else if (c === MOSS) counts.moss++;
    }
    const L = lastCounts;
    if (L.water >= 0) {
      if (counts.ice > 200 && L.ice <= 200) emit('freeze', W >> 1, H >> 1, counts.ice);
      if (counts.ice < 60 && L.ice >= 60) emit('thaw', W >> 1, H >> 1, L.ice);
      if (counts.fire > 40 && L.fire <= 40) emit('fire', W >> 1, H >> 1, counts.fire);
      if (counts.water > L.water + 400) emit('flood', W >> 1, H >> 1, counts.water - L.water);
      if (counts.water + 400 < L.water) emit('drought', W >> 1, H >> 1, L.water - counts.water);
      if (counts.moss > L.moss + 120) emit('bloom', W >> 1, H >> 1, counts.moss - L.moss);
      if (counts.moss + 120 < L.moss) emit('blight', W >> 1, H >> 1, L.moss - counts.moss);
    }
    lastCounts = { ...counts };
  };

  const stepOnce = (m: SurfaceModifiers) => {
    tick++;
    const t = active; active = next; next = t; next.fill(0);
    if (tick % 20 === 0) active.fill(1);
    if (tick % 4 === 0) updateClimate(m);
    updateWeather(m);
    if (tick % 200 === 0) tally();
    if (m.impacts > 0 && ri(30000) < m.impacts) impact(m);
    const now = tick & 0xffff;
    const tidePhase = isin(Math.trunc(((tick % 240) * 1000) / 240));
    const tideDir = tidePhase > 0 ? 1 : -1;
    const daylight = Math.max(0, -isin(Math.trunc(((tick % DAY_TICKS) * 1000) / DAY_TICKS) + 250));
    const windDir = wind > 0 ? 1 : -1;
    const windPow = Math.abs(wind);
    const ltr = (tick & 1) === 0;
    // Light for gated reactions: a dimmed sun is no day; a bright night sky is not dark.
    const sunEff = Math.trunc((daylight * (100 - Math.max(0, Math.min(100, m.dimming)))) / 100);
    lightOk[1] = sunEff > 250 ? 1 : 0;
    lightOk[2] = daylight === 0 ? 1 : 0;
    lightOk[4] = sunEff < 80 && m.nightLight < 20 ? 1 : 0;
    lightOk[3] = lightOk[4] ? 0 : 1;
    for (let f = 0; f < flowIds.length; f++) { const id = flowIds[f]!; mv[id] = (flow[id] === 2) === (daylight === 0) ? K.liquid : K.powder; }
    for (let y = H - 1; y >= 0; y--) {
      const cy = (y / CHUNK) | 0;
      for (let k = 0; k < W; k++) {
        const x = ltr ? k : W - 1 - k;
        if (!active[cy * CX + ((x / CHUNK) | 0)]) { k += CHUNK - 1 - (ltr ? x % CHUNK : CHUNK - 1 - (x % CHUNK)); continue; }
        const i = y * W + x;
        const c = cells[i]!;
        if (c === 0 || stamp[i] === now) continue;
        const kd = mv[c]!;
        if (up[c] !== 0 && (kd === K.powder || kd === K.liquid)) {
          // Inverted gravity: it falls into the sky and pools under roofs.
          if (!tryMove(i, x, y, 0, -1, true)) {
            const s = ri(2) ? 1 : -1;
            if (!tryMove(i, x, y, s, -1, true) && kd === K.liquid) { if (!tryMove(i, x, y, s, 0, true)) tryMove(i, x, y, -s, 0, true); }
          }
        } else if (kd === K.powder) {
          if (drift[c] !== 0 && windPow > 10 && ri(4000) < drift[c]! * windPow) {
            // Wind-borne grains skip along the ground or sail when loose.
            if (!tryMove(i, x, y, windDir, 0, false)) tryMove(i, x, y, windDir, -1, true);
          } else if (!tryMove(i, x, y, 0, 1, false)) {
            const s = ri(2) ? 1 : -1;
            if (!tryMove(i, x, y, s, 1, false) && !tryMove(i, x, y, -s, 1, false)) {
              // Wind lifts loose surface powder.
              if (windPow > 30 && y > 0 && cells[i - W] === 0 && ri(400) < windPow - 30) tryMove(i, x, y, windDir, -1, true);
            }
          }
        } else if (kd === K.liquid) {
          // Deep water (liquid above and below) rarely needs to move.
          if (y > 0 && y < H - 1 && cells[i - W] === c && cells[i + W] === c && ((i + tick) & 15) !== 0) continue;
          if (!tryMove(i, x, y, 0, 1, false)) {
            let s = ri(2) ? 1 : -1;
            if (m.tide > 0 && ri(100) < m.tide) s = tideDir;
            if (visc[c] !== 0 && (i + tick) % visc[c]! !== 0) { /* thick: it waits */ }
            else if (!tryMove(i, x, y, s, 1, false)) {
              const below = y < H - 1 ? cells[i + W]! : 0;
              if (tryMove(i, x, y, s, 0, false) || tryMove(i, x, y, -s, 0, false)) {
                // Erosion: running water picks up the sand it runs over.
                if (below === SAND && ri(260) === 0) {
                  const j = i + W;
                  if (cells[i] === 0) swap(i, j);
                }
              }
            }
          }
        } else if (kd === K.gas || kd === K.fire) {
          if (drift[c] !== 0 && windPow > 10 && ri(2000) < drift[c]! * windPow) tryMove(i, x, y, windDir, 0, true);
          const s = ri(3) - 1 + (windPow > 40 && ri(3) === 0 ? windDir : 0);
          if (!tryMove(i, x, y, Math.max(-1, Math.min(1, s)), -1, true)) tryMove(i, x, y, ri(2) ? 1 : -1, 0, true);
        }
        const slow = kd === K.solid || kd === K.life || kd === K.powder;
        if (slow ? ((i + tick) & 7) === 0 : stamp[i] !== now || kd === K.fire) {
          const cc = cells[i]!;
          if (cc !== 0) {
            climate(i, x, y, cc, tAt(x, y), daylight);
            if (cells[i] === cc) react(i, x, y);
          }
        }
      }
    }
  };

  const env: SurfaceEnv = {
    get day() { return Math.trunc(((tick % DAY_TICKS) * 1000) / DAY_TICKS); },
    get season() { return Math.trunc(((tick % YEAR_TICKS) * 1000) / YEAR_TICKS); },
    fieldW: FW,
    fieldH: FH,
    temp,
    humidity: hum,
    get wind() { return wind; },
    get rain() { return rain; },
    get snowing() { return snowing; },
    get lightning() { return lightning; },
  };

  const view: GridView = { width: W, height: H, cells, chunksX: CX, chunksY: CY, dirty, clearDirty: () => dirty.fill(0) };
  return {
    init: (planet, universe, surface) => {
      kind.fill(0); dens.fill(0);
      const byName = new Map<string, number>();
      up.fill(0); drift.fill(0); visc.fill(0); flow.fill(0); flowIds.length = 0;
      for (const mt of universe.materialTable) {
        kind[mt.id] = K[mt.kind]; dens[mt.id] = mt.density; byName.set(mt.name, mt.id);
        if (mt.rises) up[mt.id] = 1;
        if (mt.drift) drift[mt.id] = mt.drift;
        if (mt.viscosity) visc[mt.id] = mt.viscosity;
        if (mt.flows && mt.kind === 'powder') { flow[mt.id] = mt.flows === 'night' ? 2 : 1; flowIds.push(mt.id); }
      }
      kind[ICE] = K.solid; dens[ICE] = 90;
      kind[SNOW] = K.powder; dens[SNOW] = 60;
      kind[ORE] = K.solid; dens[ORE] = 255;
      kind[FIRE] = K.fire; dens[FIRE] = 2;
      kind[ASH] = K.powder; dens[ASH] = 80;
      WATER = byName.get('water') ?? 3;
      SAND = byName.get('sand') ?? 2;
      MOSS = byName.get('moss') ?? 4;
      STEAM = byName.get('steam') ?? 5;
      STONE = byName.get('stone') ?? 1;
      byName.set('ice', ICE).set('snow', SNOW).set('ore', ORE).set('fire', FIRE).set('ash', ASH);
      mv.set(kind);
      const pct = (p: number) => Math.trunc((p * (H - 1)) / 100);
      rx = [];
      for (const r of universe.reactionTable) {
        const a = byName.get(r.a);
        if (a === undefined) continue;
        (rx[a] ??= []).push({
          b: r.b === '*' ? -1 : byName.get(r.b) ?? -2,
          ta: byName.get(r.becomesA) ?? a,
          tb: r.becomesB === '*' ? -1 : byName.get(r.becomesB) ?? 0, // "*" leaves the neighbour as it is
          num: r.chance[0], den: r.chance[1],
          key: r.needs?.key ?? null, min: r.needs?.min ?? -1000, max: r.needs?.max ?? 1000,
          g: r.becomesB === '*' || !!(r.temp || r.light || r.depth || r.dir || r.wind || r.humid || r.heat || r.vapour),
          dir: r.dir ? DIR[r.dir] : 0,
          y0: pct(r.depth?.min ?? 0), y1: pct(r.depth?.max ?? 100),
          light: r.light ? LIGHT[r.light] : 0,
          t0: r.temp?.min ?? 0, t1: r.temp?.max ?? 255,
          w0: r.wind?.min ?? 0, w1: r.wind?.max ?? 100,
          h0: r.humid?.min ?? 0, h1: r.humid?.max ?? 255,
          heat: r.heat ?? 0, wet: r.vapour ?? 0,
        });
      }
      cells.set(surface.cells);
      stamp.fill(0);
      seed = (planet.seed.lo ^ 0x5a17) >>> 0 || 1;
      tick = 0;
      temp.fill(132);
      hum.fill(18);
      events = [];
      lastCounts = { water: -1, ice: 0, fire: 0, moss: 0 };
      active.fill(1); next.fill(1); dirty.fill(1);
    },
    step: (ticks, m) => {
      mods = m;
      for (let n = 0; n < ticks; n++) stepOnce(m);
    },
    grid: () => view,
    tick: () => tick,
    env: () => env,
    apply: (tool, ax, ay, r) => {
      const m = mods ?? { tide: 0, nightLight: 0, impacts: 40, seasons: 0, dimming: 0, warmth: 0, dust: 0 };
      const x0 = Math.max(0, Math.min(W - 1, Math.round(ax)));
      const y0 = Math.max(0, Math.min(H - 1, Math.round(ay)));
      const rad = Math.max(1, Math.min(24, Math.round(r)));
      const disk = (f: (i: number, c: number, px: number, py: number) => void) => {
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
          if (dx * dx + dy * dy > rad * rad) continue;
          const px = x0 + dx, py = y0 + dy;
          if (px < 0 || px >= W || py < 0 || py >= H) continue;
          const i = py * W + px;
          f(i, cells[i]!, px, py);
        }
      };
      const field = (delta: number) => {
        const fx0 = (x0 / FIELD) | 0, fy0 = (y0 / FIELD) | 0, fr = Math.max(1, (rad / FIELD) | 0) + 1;
        for (let fy = fy0 - fr; fy <= fy0 + fr; fy++) for (let fx = fx0 - fr; fx <= fx0 + fr; fx++) {
          if (fx < 0 || fy < 0 || fx >= FW || fy >= FH) continue;
          const k = fy * FW + fx;
          temp[k] = Math.max(0, Math.min(255, temp[k]! + delta));
        }
      };
      switch (tool) {
        case 'water': disk((i, c) => { if (c === 0 && ri(3) === 0) set(i, WATER); }); break;
        case 'sand': disk((i, c) => { if (c === 0 && ri(3) === 0) set(i, SAND); }); break;
        case 'stone': disk((i, c) => { if (c === 0 || kind[c] === K.powder) set(i, STONE); }); break;
        case 'erase': disk((i, c) => { if (c !== 0) set(i, 0); }); break;
        case 'seed': disk((i, c, px, py) => {
          if ((c === SAND || c === ASH || c === STONE) && py > 0 && cells[i - W] === 0) set(i, MOSS);
          else if (c === 0 && py < H - 1 && cells[i + W] === SAND && ri(2) === 0) set(i + W, MOSS);
          void px;
        }); break;
        case 'fire': disk((i, c) => { if ((c === 0 && ri(4) === 0) || c === MOSS || kind[c] === K.life) set(i, FIRE); }); field(30); break;
        case 'freeze': disk((i, c) => { if (c === WATER) set(i, ICE); else if (c === 0 && ri(6) === 0) set(i, SNOW); else if (c === FIRE) set(i, 0); }); field(-60); break;
        case 'meteor': impact(m, x0, Math.min(8, rad >> 1)); break;
        case 'rain': for (let c = Math.max(0, ((x0 - rad) / FIELD) | 0); c <= Math.min(FW - 1, ((x0 + rad) / FIELD) | 0); c++) hum[c] = Math.min(255, hum[c]! + 90); break;
        case 'lightning': strike(x0); break;
        case 'heat': field(70); break;
        case 'cold': field(-70); break;
        case 'quake': {
          // Cracks and slides: stone shatters to sand, everything loose jumps.
          for (let k = 0; k < rad * rad * 3; k++) {
            const px = x0 + ri(rad * 4 + 1) - rad * 2, py = y0 + ri(rad * 2 + 1) - rad;
            if (px < 1 || px >= W - 1 || py < 1 || py >= H - 1) continue;
            const i = py * W + px;
            if (cells[i] === STONE && ri(3) === 0) set(i, SAND);
            else if (kind[cells[i]!] === K.powder || kind[cells[i]!] === K.liquid) swap(i, i + (ri(2) ? 1 : -1) - W);
          }
          for (let cy = 0; cy < CY; cy++) for (let cx = 0; cx < CX; cx++) next[cy * CX + cx] = 1;
          emit('quake', x0, y0, rad);
          break;
        }
      }
      for (let cy = 0; cy < CY; cy++) for (let cx = 0; cx < CX; cx++) next[cy * CX + cx] = 1;
    },
    drainEvents: () => {
      const e = events;
      events = [];
      return e;
    },
    snapshot: () => {
      const out = new Uint8Array(8 + cells.length + temp.length + hum.length);
      const dv = new DataView(out.buffer);
      dv.setUint32(0, tick);
      dv.setUint32(4, seed);
      out.set(cells, 8);
      out.set(temp, 8 + cells.length);
      out.set(hum, 8 + cells.length + temp.length);
      return out;
    },
    restore: (s) => {
      const dv = new DataView(s.buffer, s.byteOffset);
      tick = dv.getUint32(0);
      seed = dv.getUint32(4);
      cells.set(s.subarray(8, 8 + cells.length));
      if (s.length >= 8 + cells.length + temp.length + hum.length) {
        temp.set(s.subarray(8 + cells.length, 8 + cells.length + temp.length));
        hum.set(s.subarray(8 + cells.length + temp.length));
      }
      active.fill(1); next.fill(1); dirty.fill(1);
    },
  };
};
