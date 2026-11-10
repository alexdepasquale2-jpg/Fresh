// Falling-sand kernel (unit 09). 32x32 chunks, active-chunk stepping, data-driven
// by the universe material and reaction tables. Integer-only and deterministic.
import type { SurfaceSimFactory, GridView } from '@/contracts/sim';
import type { SurfaceModifiers } from '@/contracts/sky';
import type { ModifierKey } from '@/contracts/atlas';
import { GRID_W as W, GRID_H as H, CHUNK } from '@/contracts/sim';

const K = { empty: 0, solid: 1, powder: 2, liquid: 3, gas: 4, fire: 5, life: 6 } as const;
interface Rx { b: number; ta: number; tb: number; num: number; den: number; key: ModifierKey | null; min: number; max: number }

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
  let rx: Rx[][] = [];
  let tick = 0;
  let seed = 0x9e3779b9;
  let water = 0, sand = 0;
  let mods: SurfaceModifiers | null = null;

  const rand = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed;
  };
  const ri = (n: number) => rand() % n;
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
  // Can mover m displace target cell t (moving down if fall, else up)?
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
      if (ri(r.den) >= r.num) continue;
      set(i, r.ta);
      set(j, r.tb);
      return;
    }
  };

  const impact = (m: SurfaceModifiers) => {
    const x = 4 + ri(W - 8);
    let y = 0;
    while (y < H - 1 && kind[cells[y * W + x]!] === K.empty) y++;
    const rad = 3 + ri(3);
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const px = x + dx, py = y + dy;
      if (px < 0 || px >= W || py < 0 || py >= H || dx * dx + dy * dy > rad * rad) continue;
      set(py * W + px, 0);
    }
    // Debris and, if tides or a comet, delivered water.
    for (let k = 0; k < rad * 3; k++) {
      const px = x - rad * 2 + ri(rad * 4 + 1), py = Math.max(0, y - rad - ri(rad * 2));
      if (px >= 0 && px < W && kind[cells[py * W + px]!] === K.empty) set(py * W + px, m.tide > 0 && ri(2) === 0 ? water : sand);
    }
  };

  const stepOnce = (m: SurfaceModifiers) => {
    tick++;
    const t = active; active = next; next = t; next.fill(0);
    if (tick % 20 === 0) active.fill(1);
    if (m.impacts > 0 && ri(4000) < m.impacts) impact(m);
    const now = tick & 0xffff;
    const tideDir = ((tick / 120) | 0) & 1 ? 1 : -1;
    const ltr = (tick & 1) === 0;
    for (let y = H - 1; y >= 0; y--) {
      const cy = (y / CHUNK) | 0;
      for (let k = 0; k < W; k++) {
        const x = ltr ? k : W - 1 - k;
        if (!active[cy * CX + ((x / CHUNK) | 0)]) { k += CHUNK - 1 - (ltr ? x % CHUNK : CHUNK - 1 - (x % CHUNK)); continue; }
        const i = y * W + x;
        const c = cells[i]!;
        if (c === 0 || stamp[i] === now) continue;
        const kd = kind[c]!;
        if (kd === K.powder) {
          if (!tryMove(i, x, y, 0, 1, false)) { const s = ri(2) ? 1 : -1; if (!tryMove(i, x, y, s, 1, false)) tryMove(i, x, y, -s, 1, false); }
        } else if (kd === K.liquid) {
          if (!tryMove(i, x, y, 0, 1, false)) {
            let s = ri(2) ? 1 : -1;
            if (m.tide > 0 && ri(100) < m.tide) s = tideDir;
            if (!tryMove(i, x, y, s, 1, false) && !tryMove(i, x, y, s, 0, false)) tryMove(i, x, y, -s, 0, false);
          }
        } else if (kd === K.gas || kd === K.fire) {
          const s = ri(3) - 1;
          if (!tryMove(i, x, y, s, -1, true)) tryMove(i, x, y, ri(2) ? 1 : -1, 0, true);
        }
        if (stamp[i] !== now && kd !== K.empty) react(i, x, y);
        else if (kd === K.fire || kd === K.life) react(i, x, y);
      }
    }
  };

  const view: GridView = { width: W, height: H, cells, chunksX: CX, chunksY: CY, dirty, clearDirty: () => dirty.fill(0) };
  return {
    init: (planet, universe, surface) => {
      kind.fill(0); dens.fill(0);
      const byName = new Map<string, number>();
      for (const mt of universe.materialTable) { kind[mt.id] = K[mt.kind]; dens[mt.id] = mt.density; byName.set(mt.name, mt.id); }
      water = byName.get('water') ?? 0;
      sand = byName.get('sand') ?? 0;
      rx = [];
      for (const r of universe.reactionTable) {
        const a = byName.get(r.a);
        if (a === undefined) continue;
        (rx[a] ??= []).push({
          b: r.b === '*' ? -1 : byName.get(r.b) ?? -2,
          ta: byName.get(r.becomesA) ?? a,
          tb: byName.get(r.becomesB) ?? 0,
          num: r.chance[0], den: r.chance[1],
          key: r.needs?.key ?? null, min: r.needs?.min ?? -1000, max: r.needs?.max ?? 1000,
        });
      }
      cells.set(surface.cells);
      stamp.fill(0);
      seed = (planet.seed.lo ^ 0x5a17) >>> 0 || 1;
      tick = 0;
      active.fill(1); next.fill(1); dirty.fill(1);
    },
    step: (ticks, m) => {
      mods = m;
      for (let n = 0; n < ticks; n++) stepOnce(m);
    },
    grid: () => view,
    tick: () => tick,
    snapshot: () => {
      const out = new Uint8Array(8 + cells.length);
      const dv = new DataView(out.buffer);
      dv.setUint32(0, tick);
      dv.setUint32(4, seed);
      out.set(cells, 8);
      return out;
    },
    restore: (s) => {
      const dv = new DataView(s.buffer, s.byteOffset);
      tick = dv.getUint32(0);
      seed = dv.getUint32(4);
      cells.set(s.subarray(8));
      active.fill(1); next.fill(1); dirty.fill(1);
    },
  };
};
