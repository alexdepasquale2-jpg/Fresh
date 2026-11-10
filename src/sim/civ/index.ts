// Civilisation (unit 10). Reads the grid, never writes it. Integer and deterministic.
// Villages hold souls, food stores, a mood, a belief shaped by what the sky does to
// them, and a tech era that climbs from huts to star-reaching. People walk the
// surface: farmers to the moss, fishers to the shore, priests at dusk, lamp-bearers
// at night, travellers between villages. Feuds, famines, festivals, migrations.
import type { CivFactory, CivEvent, Village, GridView, Belief, SurfaceEnv, SurfaceEvent, Tool } from '@/contracts/sim';
import { BELIEFS, ENGINE, FIELD, ROLE, SURFACE_TOOLS } from '@/contracts/sim';
import type { SurfaceModifiers } from '@/contracts/sky';
import { child, rng } from '@/core/hash';
import type { Rng } from '@/core/hash';

type V = {
  id: number; x: number; y: number; souls: number; name: string; tech: number; belief: Belief;
  food: number; mood: number; age: number; scores: number[]; progress: number; wet: number;
  starving: boolean; cold: boolean; lastBurn: number; lastLaunch: number; lastFest?: number; lastMove?: number;
  enl?: number; lastOmen?: number; sawStranger?: number;
};
type A = { x: number; y: number; hp: number; tx: number; hitT: number };
const DESTRUCTIVE = new Set<Tool>(['fire', 'meteor', 'lightning', 'quake', 'freeze', 'erase', 'cold', 'heat']);
type P = { x: number; y: number; role: number; home: number; tx: number; wait: number };

const EVAL = 20;
const MAX_PEOPLE = 240;
const WATER = 3, MOSS = 4, SAND = 2, STONE = 1;
const isDay = (day: number) => day > 230 && day < 770;

export const factory: CivFactory = () => {
  let vs: V[] = [];
  let people: P[] = [];
  let pending: { x: number; belief: Belief; tech: number }[] = [];
  let tick = 0;
  let nextId = 1;
  let glow = 0;
  let era = 0;
  let r: Rng = rng({ hi: 1, lo: 1 });
  let ground = new Int16Array(0);
  let surfQ: SurfaceEvent[] = [];
  let avatar: A | null = null;
  let pendingEv: CivEvent[] = [];
  let attackers = 0;
  let worshippers = 0;
  const peopleBuf = new Int16Array(MAX_PEOPLE * 4);

  const at = (g: GridView, x: number, y: number) => (x < 0 || y < 0 || x >= g.width || y >= g.height ? -1 : g.cells[y * g.width + x]!);
  const solidish = (m: number) => m === STONE || m === SAND || m === ENGINE.ice.id || m === ENGINE.snow.id || m === ENGINE.ash.id || m === ENGINE.ore.id;
  const scanGround = (g: GridView) => {
    if (ground.length !== g.width) ground = new Int16Array(g.width);
    for (let x = 0; x < g.width; x++) {
      // Ground is the first run of 4 non-air cells; drops and ash in the air are not ground.
      const airy = (c: number) => c === 0 || c === 5 || c === ENGINE.fire.id;
      let y = 0;
      while (y < g.height - 4) {
        const i = y * g.width + x, w = g.width;
        if (!airy(g.cells[i]!) && !airy(g.cells[i + w]!) && !airy(g.cells[i + 2 * w]!) && !airy(g.cells[i + 3 * w]!)) break;
        y++;
      }
      ground[x] = y;
    }
  };
  const near = (g: GridView, x: number, y: number, rad: number, want: number, samples: number) => {
    let n = 0;
    for (let k = 0; k < samples; k++) if (at(g, x + r.range(-rad, rad), y + r.range(-3, 8)) === want) n++;
    return n;
  };
  const tempAt = (env: SurfaceEnv, x: number, y: number) => env.temp[Math.min(env.fieldH - 1, (y / FIELD) | 0) * env.fieldW + Math.min(env.fieldW - 1, (x / FIELD) | 0)]!;

  const spawnPerson = (v: V, role: number) => {
    if (people.length >= MAX_PEOPLE) return;
    people.push({ x: v.x, y: v.y, role, home: v.id, tx: v.x, wait: r.int(20) });
  };

  const pickTarget = (p: P, v: V | undefined, g: GridView, day: number) => {
    if (!v) { p.role = ROLE.idle; p.tx = p.x; return; }
    const night = !isDay(day);
    if (p.role === ROLE.travel) return;
    if (night && v.tech >= 3 && p.role !== ROLE.lamp && r.chance(1, 4)) p.role = ROLE.lamp;
    else if (night && p.role !== ROLE.lamp) p.role = ROLE.idle;
    else if (!night && (p.role === ROLE.idle || p.role === ROLE.lamp)) p.role = r.pick([ROLE.farm, ROLE.fish, ROLE.farm, ROLE.idle]);
    if ((day > 700 && day < 780) || (day > 220 && day < 300)) if (v.belief !== 'none' && r.chance(1, 3)) p.role = ROLE.pray;
    switch (p.role) {
      case ROLE.farm: {
        let best = -1;
        for (let d = 0; d < 30 && best < 0; d++) for (const s of [d, -d]) {
          const x = v.x + s;
          if (x >= 0 && x < g.width && at(g, x, ground[x]!) === MOSS) { best = x; break; }
        }
        p.tx = best >= 0 ? best : v.x + r.range(-10, 10);
        break;
      }
      case ROLE.fish: {
        let best = -1;
        for (let d = 0; d < 40 && best < 0; d++) for (const s of [d, -d]) {
          const x = v.x + s;
          if (x >= 1 && x < g.width - 1 && at(g, x, ground[x]!) !== WATER && (at(g, x + 1, ground[x + 1]!) === WATER || at(g, x - 1, ground[x - 1]!) === WATER)) { best = x; break; }
        }
        p.tx = best >= 0 ? best : v.x;
        break;
      }
      case ROLE.pray: p.tx = v.x + r.range(-2, 2); break;
      case ROLE.lamp: p.tx = v.x + r.range(-12, 12); break;
      default: p.tx = v.x + r.range(-6, 6);
    }
    p.tx = Math.max(0, Math.min(g.width - 1, p.tx));
    p.wait = 20 + r.int(60);
  };

  const enl = (v: V) => v.enl ?? 0;
  // How a village's people meet the stranger: kneel, keep away, or attack.
  const stance = (v: V | undefined) => (!v ? ROLE.idle : enl(v) >= 100 ? ROLE.kneel : enl(v) >= 50 ? ROLE.watch : ROLE.attack);

  const moveAvatar = (g: GridView) => {
    if (!avatar) return;
    if (avatar.x !== avatar.tx && tick % 2 === 0) {
      const nx = avatar.x + (avatar.tx > avatar.x ? 1 : -1);
      const ny = ground[nx]! - 1;
      if (Math.abs(ny - avatar.y) <= 5 && at(g, nx, ny + 1) !== WATER) { avatar.x = nx; avatar.y = ny; }
      else avatar.tx = avatar.x;
    }
    if (ground.length && at(g, avatar.x, avatar.y) !== 0) avatar.y = ground[avatar.x]! - 1;
    attackers = 0;
    worshippers = 0;
    for (const p of people) {
      const d = Math.abs(p.x - avatar.x);
      if (p.role === ROLE.attack && d <= 1) attackers++;
      if (p.role === ROLE.kneel && d <= 3) worshippers++;
    }
    if (attackers === 0 && tick % 20 === 0) avatar.hp = Math.min(100, avatar.hp + 1);
    if (attackers > 0 && tick - avatar.hitT >= 20) {
      avatar.hitT = tick;
      avatar.hp -= attackers;
      if (avatar.hp <= 0) {
        const v = vs.reduce<V | null>((b, o) => (!b || Math.abs(o.x - avatar!.x) < Math.abs(b.x - avatar!.x) ? o : b), null);
        if (v) pendingEv.push({ kind: 'slain', tick, villageId: v.id, x: avatar.x, y: avatar.y, belief: v.belief });
        avatar = null;
        for (const p of people) if (p.role === ROLE.attack || p.role === ROLE.kneel || p.role === ROLE.watch) { p.role = ROLE.idle; p.wait = 0; }
      }
    }
  };

  const movePeople = (g: GridView, day: number) => {
    moveAvatar(g);
    for (let i = people.length - 1; i >= 0; i--) {
      const p = people[i]!;
      if (avatar && p.role !== ROLE.travel && Math.abs(p.x - avatar.x) < 45) {
        const s = stance(vs.find((v) => v.id === p.home));
        if (s !== ROLE.idle) {
          p.role = s;
          const keep = s === ROLE.kneel ? 2 : s === ROLE.watch ? 12 : 0;
          const side = p.x <= avatar.x ? -1 : 1;
          p.tx = Math.max(0, Math.min(g.width - 1, avatar.x + side * keep));
          p.wait = 0;
        }
      } else if (p.role === ROLE.attack || p.role === ROLE.kneel || p.role === ROLE.watch) {
        p.role = ROLE.idle;
      }
      if (p.wait > 0) { p.wait--; continue; }
      if (p.x === p.tx) {
        if (p.role === ROLE.attack || p.role === ROLE.kneel || p.role === ROLE.watch) continue;
        if (p.role === ROLE.travel) {
          const dest = vs.find((v) => Math.abs(v.x - p.tx) <= 1);
          const home = vs.find((v) => v.id === p.home);
          if (dest && home && home.souls > 1) { home.souls--; dest.souls++; }
          people.splice(i, 1);
          continue;
        }
        pickTarget(p, vs.find((v) => v.id === p.home), g, day);
        continue;
      }
      if ((tick + i) % 2) continue; // walk at half speed
      const nx = p.x + (p.tx > p.x ? 1 : -1);
      const ny = ground[nx]! - 1;
      const c = at(g, nx, ny + 1);
      // People wade in shallows but do not walk into deep water or up cliffs.
      if (c === WATER && at(g, nx, ny + 3) === WATER) { p.tx = p.x; continue; }
      if (Math.abs(ny - p.y) > 4) { p.tx = p.x; continue; }
      p.x = nx;
      p.y = ny;
    }
  };

  const ev = (events: CivEvent[], kind: CivEvent['kind'], v: V, extra: Partial<CivEvent> = {}) => {
    if (events.length < 24) events.push({ kind, tick, villageId: v.id, x: v.x, y: v.y, ...extra });
  };

  const evaluate = (g: GridView, m: SurfaceModifiers, env: SurfaceEnv, surface: readonly SurfaceEvent[], events: CivEvent[]) => {
    scanGround(g);
    const day = env.day;
    const night = !isDay(day);
    const winter = env.season > 600 && env.season < 900;
    const totalSouls = vs.reduce((n, v) => n + v.souls, 0);
    // Wanderers resettle an empty world every couple of years.
    if (vs.length + pending.length < 2 && tick % 3200 < EVAL) {
      for (let k = 0; k < 30; k++) {
        const x = r.range(8, g.width - 9);
        if (at(g, x, ground[x]!) !== WATER && Math.abs(ground[x - 2]! - ground[x + 2]!) <= 2) { pending.push({ x, belief: 'none', tech: Math.max(0, era - 2) }); break; }
      }
    }
    // Found waiting sites.
    if (pending.length && r.int(100) < 4 + Math.max(0, m.nightLight) / 8) {
      const s = pending.shift()!;
      const x = Math.max(2, Math.min(g.width - 3, s.x));
      const y = ground[x]! - 1;
      if (y > 0 && at(g, x, y + 1) !== WATER && vs.length < 12) {
        const v: V = { id: nextId++, x, y, souls: 10, name: `#${nextId - 1}`, tech: s.tech, belief: s.belief, food: 120, mood: 20, age: 0, scores: BELIEFS.map(() => 0), progress: 0, wet: 0, starving: false, cold: false, lastBurn: -9999, lastLaunch: -99999, enl: 0 };
        if (s.belief !== 'none') v.scores[BELIEFS.indexOf(s.belief)] = 50;
        vs.push(v);
        ev(events, 'found', v, { belief: v.belief });
      }
    }
    for (const v of [...vs]) {
      v.age++;
      // Ground moved under them.
      const here = at(g, v.x, v.y);
      if (solidish(here) || at(g, v.x, v.y + 1) === 0) {
        const ny = ground[v.x]! - 1;
        if (ny > 0 && Math.abs(ny - v.y) < 8) v.y = ny;
      }
      if (at(g, v.x, v.y) === WATER) v.wet++;
      else v.wet = 0;
      if (v.wet >= 2) {
        // Climb to the nearest dry high ground if there is any; otherwise the water wins.
        let best = -1;
        for (let d = 1; d < 30 && best < 0; d++) for (const sx of [v.x - d, v.x + d]) {
          if (sx > 2 && sx < g.width - 3 && at(g, sx, ground[sx]!) !== WATER && ground[sx]! < v.y) { best = sx; break; }
        }
        if (best >= 0 && v.wet < 8) { v.x = best; v.y = ground[best]! - 1; v.souls = Math.max(1, v.souls - 2); v.mood -= 10; if (v.wet === 2) ev(events, 'migrate', v, { detail: v.id }); }
        else if (v.wet >= 8 || best < 0) { ev(events, 'flooded', v); vs = vs.filter((o) => o !== v); continue; }
      }
      // Fire at the doors.
      let fires = 0;
      for (let dx = -3; dx <= 3; dx++) for (let dy = -2; dy <= 1; dy++) if (at(g, v.x + dx, v.y + dy) === ENGINE.fire.id) fires++;
      if (fires > 0) {
        v.souls = Math.max(0, v.souls - 1 - (fires >> 2));
        v.mood -= 8;
        v.scores[BELIEFS.indexOf('fire')]! += 6;
        if (tick - v.lastBurn > 400) { ev(events, 'burn', v); v.lastBurn = tick; }
      }
      // Cold.
      const T = tempAt(env, v.x, v.y);
      if (T < 94 && v.tech < 1) {
        if (!v.cold) ev(events, 'frozen', v);
        v.cold = true;
        if (r.chance(1, 6)) v.souls--;
      } else if (T > 104) v.cold = false;
      // Food.
      const moss = near(g, v.x, v.y, 18, MOSS, 10);
      const water = near(g, v.x, v.y, 22, WATER, 10);
      const farmers = people.filter((p) => p.home === v.id && p.role === ROLE.farm && p.wait > 0).length;
      const fishers = people.filter((p) => p.home === v.id && p.role === ROLE.fish && p.wait > 0).length;
      const ice = near(g, v.x, v.y, 22, ENGINE.ice.id, 6);
      let prod = 2 + (moss * 3 + farmers * 2) * (winter ? 1 : 2) + water + (ice >> 1) + fishers * 2 + (v.tech >= 2 ? 3 : 0) + (m.tide > 20 ? 2 : 0);
      if (T > 200 || T < 96) prod >>= 1;
      const eat = Math.ceil(v.souls / 2);
      v.food = Math.max(0, Math.min(999, v.food + prod - eat));
      if (v.food === 0) {
        if (!v.starving) ev(events, 'famine', v);
        v.starving = true;
        v.mood -= 4;
        if (r.chance(1, 4)) v.souls--;
      } else if (v.food > 220) v.starving = false;
      const capacity = 12 + moss * 6 + water * 3 + v.tech * 9 + (m.tide > 20 ? 5 : 0);
      if (v.food > v.souls * 3 && v.souls < capacity && r.chance(1, 5)) { v.souls++; v.food -= 10; }
      if (v.souls > capacity + 6 && r.chance(1, 4)) { v.mood -= 3; }
      const moodTarget = (v.food > v.souls * 2 ? 30 : v.food > 0 ? 0 : -60) + (m.nightLight > 20 ? 10 : 0) - (m.warmth > 50 ? 15 : 0) - (v.souls > capacity ? 20 : 0) + v.tech * 4;
      v.mood = Math.max(-100, Math.min(100, v.mood + Math.sign(moodTarget - v.mood) * 2));
      // Belief: they read the sky and what it does to them.
      const sc = v.scores;
      const add = (b: Belief, n: number) => { sc[BELIEFS.indexOf(b)]! += n; };
      if (!night && m.warmth > 20) add('sun', 2);
      if (night && (m.nightLight > 15 || m.tide > 20)) add('moon', 2);
      if (water > 4) add('sea', 1);
      if (m.tide > 40) add('sea', 1);
      for (const e of surface) {
        const close = Math.abs(e.x - v.x) < 70;
        if (e.kind === 'impact' && close) add('stone', 25);
        if (e.kind === 'lightning' || e.kind === 'storm') add('sky', close ? 15 : 4);
        if (e.kind === 'fire') add('fire', 10);
        if (e.kind === 'freeze' || e.kind === 'flood') add(m.tide > 20 ? 'moon' : 'sea', 8);
      }
      let top = 0;
      for (let k = 1; k < sc.length; k++) { sc[k] = sc[k]! - (sc[k]! >> 5); if (sc[k]! > sc[top]!) top = k; }
      const nb: Belief = sc[top]! > 24 ? BELIEFS[top]! : v.belief;
      if (nb !== v.belief) { v.belief = nb; ev(events, 'convert', v, { belief: nb }); }
      // Tech.
      const ore = near(g, v.x, v.y, 30, ENGINE.ore.id, 8) > 0 || m.impacts > 25;
      v.progress += 1 + (v.souls >> 4) + (v.mood > 30 ? 1 : 0);
      const need = [260, 700, 1300, 2200, 3400][v.tech] ?? Infinity;
      const can = [v.souls >= 14, v.souls >= 22 && ore, v.souls >= 35, v.souls >= 50 && v.mood > 0, totalSouls >= 140 && vs.filter((o) => o.tech >= 4).length >= 2][v.tech] ?? false;
      if (v.progress >= need && can) {
        v.tech++;
        v.progress = 0;
        era = Math.max(era, v.tech);
        ev(events, 'tech', v, { detail: v.tech });
      }
      if (v.tech >= 5 && tick - v.lastLaunch > 3200 && night && r.chance(1, 20)) {
        v.lastLaunch = tick;
        ev(events, 'launch', v);
      }
      // Enlightenment: high eras, joy, faith, and what they have seen of you.
      const before = enl(v);
      v.enl = Math.max(0, Math.min(100, before + (v.tech >= 3 ? 1 : 0) + (v.tech >= 5 ? 1 : 0) + (v.mood > 50 && r.chance(1, 3) ? 1 : 0) + (v.belief === 'sky' && r.chance(1, 4) ? 1 : 0)));
      if (before < 100 && v.enl >= 100) ev(events, 'enlightened', v, { belief: v.belief });
      if (avatar && Math.abs(avatar.x - v.x) < 45) {
        if ((v.sawStranger ?? -99999) < tick - 3200) { v.sawStranger = tick; ev(events, stance(v) === ROLE.kneel ? 'worship' : stance(v) === ROLE.attack ? 'attack' : 'stranger', v, { belief: v.belief }); }
        if (stance(v) === ROLE.kneel) { v.mood = Math.min(100, v.mood + 2); }
        else if (stance(v) === ROLE.watch) { v.enl = Math.min(100, v.enl + 1); }
      }
      // Festivals.
      if (v.mood > 30 && night && v.food > 150 && tick - (v.lastFest ?? -99999) > 6400 && r.chance(1, 40)) {
        v.lastFest = tick; v.mood -= 30; v.food -= 60; ev(events, 'festival', v, { belief: v.belief }); }
      // Growth landmarks, splits, migration.
      if (v.souls > 0 && v.souls % 20 === 0 && r.chance(1, 4)) ev(events, 'grow', v);
      if (v.souls >= 44 + v.tech * 12 && vs.length + pending.length < 10 && r.chance(1, 3)) {
        v.souls -= 14;
        const nx = Math.max(4, Math.min(g.width - 5, v.x + (r.chance(1, 2) ? 1 : -1) * r.range(18, 40)));
        pending.push({ x: nx, belief: v.belief, tech: Math.max(0, v.tech - 1) });
        ev(events, 'split', v);
      }
      if (v.mood < -40 && vs.length > 1 && tick - (v.lastMove ?? -99999) > 1600 && r.chance(1, 5)) {
        v.lastMove = tick;
        const dest = vs.filter((o) => o !== v).sort((a, b) => b.mood - a.mood)[0]!;
        for (let k = 0; k < 3; k++) {
          if (people.length >= MAX_PEOPLE) break;
          people.push({ x: v.x, y: v.y, role: ROLE.travel, home: v.id, tx: dest.x, wait: k * 10 });
        }
        v.mood += 15;
        ev(events, 'migrate', v, { detail: dest.id });
      }
      if (v.souls <= 0) { ev(events, 'die', v); vs = vs.filter((o) => o !== v); continue; }
    }
    // Feuds between neighbours of different faiths.
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
      const a = vs[i]!, b = vs[j]!;
      if (Math.abs(a.x - b.x) < 60 && a.belief !== b.belief && a.belief !== 'none' && b.belief !== 'none' && a.souls > 18 && b.souls > 18 && r.chance(1, 160)) {
        a.souls -= 3; b.souls -= 3; a.mood -= 25; b.mood -= 25;
        ev(events, 'feud', a, { detail: b.id, belief: a.belief });
      }
    }
    // Keep each village's walkers in proportion to its souls.
    for (const v of vs) {
      const mine = people.filter((p) => p.home === v.id && p.role !== ROLE.travel);
      const want = Math.min(16, Math.ceil(v.souls / 3));
      for (let k = mine.length; k < want; k++) spawnPerson(v, k % 3 === 0 ? ROLE.fish : ROLE.farm);
      for (let k = want; k < mine.length; k++) people.splice(people.indexOf(mine[k]!), 1);
    }
    people = people.filter((p) => p.role === ROLE.travel || vs.some((v) => v.id === p.home));
    const nl = Math.max(0, m.nightLight);
    glow = Math.floor(vs.reduce((n, v) => n + v.souls * (2 + v.tech) * (v.mood > 0 ? 2 : 1) * (enl(v) >= 100 ? 2 : 1), 0) * (100 + nl) / 6400) + worshippers * 2;
  };

  const view = () => {
    const n = Math.min(people.length, MAX_PEOPLE);
    for (let i = 0; i < n; i++) {
      const p = people[i]!;
      peopleBuf[i * 4] = p.x; peopleBuf[i * 4 + 1] = p.y; peopleBuf[i * 4 + 2] = p.role; peopleBuf[i * 4 + 3] = p.home;
    }
    return {
      villages: vs.map((v): Village => ({ id: v.id, x: v.x, y: v.y, souls: v.souls, name: v.name, tech: v.tech, belief: v.belief, food: v.food, mood: v.mood, enlightenment: v.enl ?? 0 })),
      souls: vs.reduce((s, v) => s + v.souls, 0),
      glowPerMinute: glow,
      people: peopleBuf.subarray(0, n * 4),
      peopleCount: n,
      era,
      avatar: avatar ? { x: avatar.x, y: avatar.y, hp: avatar.hp, attackers, worshippers } : null,
    };
  };

  return {
    init: (p, surface) => {
      r = rng(child(p.seed, 'civ'));
      vs = [];
      people = [];
      pending = surface.villageSites.map((s) => ({ x: s.x, belief: 'none' as Belief, tech: 0 }));
      avatar = null;
      pendingEv = [];
      tick = 0;
      nextId = 1;
      glow = 0;
      era = 0;
    },
    step: (ticks, g, m, env, surface) => {
      const events: CivEvent[] = [];
      for (const e of surface) if (surfQ.length < 64) surfQ.push(e);
      for (const e of pendingEv) events.push(e);
      pendingEv = [];
      for (let t = 0; t < ticks; t++) {
        tick++;
        if (tick % EVAL === 0) {
          evaluate(g, m, env, surfQ, events);
          surfQ = [];
        }
        else if (ground.length) movePeople(g, env.day);
      }
      return events;
    },
    view,
    apply: (tool, ax) => {
      const x = Math.round(ax);
      const near = (rad: number) => vs.filter((v) => Math.abs(v.x - x) <= rad);
      const push = (kind: CivEvent['kind'], v: V, detail?: number) => pendingEv.push({ kind, tick, villageId: v.id, x: v.x, y: v.y, belief: v.belief, ...(detail !== undefined ? { detail } : {}) });
      if (tool === 'bless') {
        for (const v of near(30)) { v.enl = Math.min(100, enl(v) + 12); v.mood = Math.min(100, v.mood + 20); v.food = Math.min(999, v.food + 80); push('blessed', v); }
      } else if (tool === 'smite') {
        for (const v of near(20)) { v.souls = Math.max(0, v.souls - Math.max(2, Math.ceil(v.souls * 0.3))); v.mood -= 30; push('smitten', v); }
        people = people.filter((p) => Math.abs(p.x - x) > 6);
        for (const v of vs) v.enl = Math.max(0, enl(v) - 15);
      } else if (tool === 'sow') {
        pending.unshift({ x, belief: 'none', tech: 0 });
      } else if (tool === 'whisper') {
        const v = near(40).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
        if (v) { v.belief = 'sky'; v.scores[BELIEFS.indexOf('sky')] = 80; v.enl = Math.min(100, enl(v) + 6); push('omen', v, 100); }
      } else {
        const bad = DESTRUCTIVE.has(tool);
        for (const v of near(60)) {
          if (bad) { v.enl = Math.max(0, enl(v) - 2); v.mood -= 4; v.scores[BELIEFS.indexOf(tool === 'fire' || tool === 'heat' ? 'fire' : tool === 'meteor' || tool === 'quake' ? 'stone' : 'sky')]! += 12; }
          else { v.mood = Math.min(100, v.mood + 3); if (tool === 'water' || tool === 'rain') v.scores[BELIEFS.indexOf('sea')]! += 6; }
          if (tick - (v.lastOmen ?? -99999) > 400) { v.lastOmen = tick; push('omen', v, SURFACE_TOOLS.indexOf(tool as never)); }
        }
      }
    },
    incarnate: (x) => {
      const cx = Math.max(1, Math.min(Math.max(1, ground.length - 2), Math.round(x)));
      avatar = { x: cx, y: ground.length ? ground[cx]! - 1 : 0, hp: 100, tx: cx, hitT: tick };
    },
    walk: (x) => { if (avatar) avatar.tx = Math.max(1, Math.min(Math.max(1, ground.length - 2), Math.round(x))); },
    ascend: () => {
      avatar = null;
      for (const p of people) if (p.role === ROLE.attack || p.role === ROLE.kneel || p.role === ROLE.watch) { p.role = ROLE.idle; p.wait = 0; }
    },
    snapshot: () => new TextEncoder().encode(JSON.stringify({ vs, people, pending, tick, nextId, glow, era })),
    restore: (s) => {
      const o = JSON.parse(new TextDecoder().decode(s)) as { vs: V[]; people: P[]; pending: typeof pending; tick: number; nextId: number; glow: number; era: number };
      ({ vs, people, pending, tick, nextId, glow, era } = o);
    },
  };
};
