// Villages (unit 10). Read the grid, never write it. Integer and deterministic.
import type { CivFactory, CivEvent, Village, GridView } from '@/contracts/sim';
import { child, rng } from '@/core/hash';
import type { Rng } from '@/core/hash';

type V = { id: number; x: number; y: number; souls: number; name: string; band: number };
const EVAL = 20; // ticks between village evaluations

export const factory: CivFactory = () => {
  let vs: V[] = [];
  let pending: { x: number; y: number }[] = [];
  let tick = 0;
  let nextId = 1;
  let glow = 0;
  let r: Rng = rng({ hi: 1, lo: 1 });
  // Display names come from NameGen.village(child(planet.seed, id + 1)) in the chronicle and UI.
  const nameOf = (id: number) => `#${id}`;

  const at = (g: GridView, x: number, y: number) => (x < 0 || y < 0 || x >= g.width || y >= g.height ? 255 : g.cells[y * g.width + x]!);
  // Classify by id convention from the atlas: 0 empty, 1 stone, 2 sand, 3 water, 4 moss, 5 steam.
  const solidish = (m: number) => m === 1 || m === 2;
  const findGround = (g: GridView, x: number) => {
    for (let y = 1; y < g.height; y++) if (at(g, x, y) !== 0 && at(g, x, y) !== 5) return y - 1;
    return -1;
  };

  return {
    init: (p, surface) => {
      r = rng(child(p.seed, 'civ'));
      vs = [];
      pending = surface.villageSites.map((s) => ({ ...s }));
      tick = 0;
      nextId = 1;
      glow = 0;
    },
    step: (ticks, g, m) => {
      const events: CivEvent[] = [];
      const start = tick;
      tick += ticks;
      for (let t = Math.floor(start / EVAL) + 1; t * EVAL <= tick; t++) {
        const now = t * EVAL;
        // Found pending sites slowly (one every ~5 s), faster under a lit sky.
        if (pending.length && r.int(100) < 8 + Math.max(0, m.nightLight) / 4) {
          const s = pending.shift()!;
          const y = findGround(g, s.x);
          if (y > 0 && at(g, s.x, y + 1) !== 3) {
            const v: V = { id: nextId++, x: s.x, y, souls: 12, name: nameOf(nextId - 1), band: 0 };
            vs.push(v);
            events.push({ kind: 'found', tick: now, villageId: v.id, x: v.x, y: v.y });
          }
        }
        for (const v of [...vs]) {
          const here = at(g, v.x, v.y);
          const below = at(g, v.x, v.y + 1);
          if (solidish(here)) {
            // Sand drifted in: they climb onto the new ground.
            const ny = findGround(g, v.x);
            if (ny > 0 && v.y - ny < 6) { v.y = ny; continue; }
          }
          if (here === 3 || solidish(here)) {
            vs = vs.filter((o) => o !== v);
            events.push({ kind: 'die', tick: now, villageId: v.id, x: v.x, y: v.y });
            continue;
          }
          if (below === 0) {
            // Ground fell away: settle downward.
            v.y = Math.max(0, findGround(g, v.x));
            continue;
          }
          let food = 0;
          for (let k = 0; k < 12; k++) {
            const c = at(g, v.x + r.range(-14, 14), v.y + r.range(-3, 8));
            if (c === 4) food += 2;
            else if (c === 3) food += 1;
          }
          const harsh = Math.max(0, m.warmth - 40) / 10 + Math.max(0, m.dimming - 30) / 10;
          const delta = food >= 3 + harsh ? 1 : food === 0 || food < harsh ? (r.chance(1, 4) ? -1 : 0) : r.chance(1, 4) ? 1 : 0;
          v.souls = Math.max(0, v.souls + delta);
          if (v.souls === 0) {
            vs = vs.filter((o) => o !== v);
            events.push({ kind: 'die', tick: now, villageId: v.id, x: v.x, y: v.y });
            continue;
          }
          const band = Math.floor(v.souls / 15);
          if (band > v.band) events.push({ kind: 'grow', tick: now, villageId: v.id, x: v.x, y: v.y });
          v.band = band;
          if (v.souls >= 60 && vs.length < 8) {
            v.souls = 30;
            v.band = 2;
            const nx = Math.max(4, Math.min(g.width - 5, v.x + (r.chance(1, 2) ? 1 : -1) * r.range(14, 30)));
            pending.push({ x: nx, y: 0 });
            events.push({ kind: 'split', tick: now, villageId: v.id, x: nx, y: v.y });
          }
        }
      }
      const souls = vs.reduce((n, v) => n + v.souls, 0);
      glow = Math.floor((souls * (100 + Math.max(0, m.nightLight))) / 400);
      return events;
    },
    view: () => ({ villages: vs.map(({ band: _b, ...v }): Village => v), souls: vs.reduce((n, v) => n + v.souls, 0), glowPerMinute: glow }),
    snapshot: () => new TextEncoder().encode(JSON.stringify({ vs, pending, tick, nextId, glow })),
    restore: (s) => {
      const o = JSON.parse(new TextDecoder().decode(s)) as { vs: V[]; pending: { x: number; y: number }[]; tick: number; nextId: number; glow: number };
      ({ vs, pending, tick, nextId, glow } = o);
    },
  };
};
