// Civilisation (unit 10). Reads the grid, never writes it. Integer and deterministic.
// Villages hold souls, food stores, a mood, a belief shaped by what the sky does to
// them, and a tech era that climbs from huts to star-reaching. People walk the
// surface: farmers to the moss, fishers to the shore, priests at dusk, lamp-bearers
// at night, travellers between villages. Feuds, famines, festivals, migrations.
import type { CivFactory, CivEvent, Village, GridView, Belief, SurfaceEnv, SurfaceEvent, Tool } from '@/contracts/sim';
import { BELIEFS, ENGINE, FIELD, ROLE, SURFACE_TOOLS, PERSON_STRIDE, YEAR_TICKS } from '@/contracts/sim';
import type { BodyAction, Building, BuildingKind } from '@/contracts/sim';
import type { SurfaceModifiers } from '@/contracts/sky';
import { child, mix, rng, seedToU32 } from '@/core/hash';
import type { Seed } from '@/contracts/seed';
import type { Rng } from '@/core/hash';

type V = {
  id: number; x: number; y: number; souls: number; name: string; tech: number; belief: Belief;
  food: number; mood: number; age: number; scores: number[]; progress: number; wet: number;
  starving: boolean; cold: boolean; lastBurn: number; lastLaunch: number; lastFest?: number; lastMove?: number;
  wealth?: number; goods?: number; ore?: number; bld?: Building[]; planT?: number;
  enl?: number; lastOmen?: number; sawStranger?: number; festUntil?: number; lastPreach?: number;
};
type A = { x: number; y: number; hp: number; tx: number; hitT: number; action: BodyAction | null; actionT: number; preachT: number };
const DESTRUCTIVE = new Set<Tool>(['fire', 'meteor', 'lightning', 'quake', 'freeze', 'erase', 'cold', 'heat']);
type P = { x: number; y: number; role: number; home: number; tx: number; wait: number; id?: number; until?: number; work?: number };

const EVAL = 20;
const MAX_PEOPLE = 240;
const WATER = 3, MOSS = 4, SAND = 2, STONE = 1;
const isDay = (day: number) => day > 230 && day < 770;

// ---- The notable: one named person per world, followed through a whole life. ----
// Naming scheme (shared with src/sim/chronicle, which keeps an identical copy of
// notableName and of the detail packing, because units may not import each other):
//   name   = notableName(planet.seed, ord, house)   ord: 1, 2, 3.. along the line of names;
//                                                   house: the family, kept by a child, +1 otherwise
//   detail = code + 64 * (calling + 16 * (age + 128 * (arg + 256 * (ord + 4096 * house))))
// so every 'born' / 'deed' / 'passed' CivEvent carries all the chronicle needs to write
// a proper named line: who (ord, house), what they are (calling), how old, what happened
// (code: relation for 'born', deed for 'deed', cause for 'passed') and one small argument
// (other village id, building kind, tech level or belief index).
type N = { pid: number; ord: number; house: number; calling: number; bornT: number; home: number; deeds: string[]; metYou: boolean; lastDeedT: number; aged: number; done: number[]; works: number };
type Line = { ord: number; house: number; nextAt: number; lastHome: number; lastCalling: number };
const CALLINGS = ['wanderer', 'fisher', 'grower', 'prophet', 'smith', 'trader', 'lamp-keeper', 'miner', 'mason', 'bell-ringer'];
const NA = ['Or', 'Wen', 'Tam', 'Fen', 'Is', 'Mar', 'Hal', 'Sel', 'Bry', 'Cor', 'Ed', 'Lin', 'Oss', 'Ru', 'Thess', 'Ane', 'Dov', 'Kes', 'Mir', 'Yar'];
const NB = ['la', '', 'sin', 'na', 'ric', 'wen', 'low', 'a', 'en', 'ith', 'o', 'ra', 'el', 'is', '', 'an'];
const FA = ['Ash', 'Salt', 'Reed', 'Mere', 'Stone', 'Wick', 'Low', 'Marsh', 'Ember', 'Gull', 'Thorn', 'Tarn'];
const FB = ['low', 'mere', 'wick', 'by', 'ley', 'field', 'hallow', 'ward'];
const notableName = (seed: Seed, ord: number, house: number): { short: string; full: string } => {
  const h = seedToU32(mix(child(seed, 'notable-name'), ord));
  const hf = seedToU32(mix(child(seed, 'notable-house'), house));
  const a = NA[h % NA.length]!;
  let b = NB[(h >>> 8) % NB.length]!;
  if (!b && a.length <= 2) b = 'a';
  const first = a + b;
  const fa = FA[hf % FA.length]!;
  let fb = FB[(hf >>> 8) % FB.length]!;
  if (fa.toLowerCase() === fb) fb = 'ward';
  if (hf % 5 < 2) return { short: first, full: `${first} ${fa}${fb}` };
  if ((h >>> 20) % 5 === 0) { const t = `${(h >>> 24) & 1 ? 'Brother' : 'Sister'} ${first}`; return { short: t, full: t }; }
  return { short: first, full: first };
};
const BUILT = ['house', 'fire', 'field', 'dock', 'mine', 'workshop', 'market', 'storehouse', 'shrine', 'bell tower', 'launch field'];
const ERA_DEED = ['', 'Struck the first kept fire', 'Drew the first iron from the stone', 'Lit the first street lamp', 'Hung the first bell', 'Pointed the first tube at your light'];
const WORK: string[][] = [
  ['Walked the whole shore and back', 'Slept a season under the open sky'],
  ['Mended every net before the thaw', 'Brought in the biggest catch anyone remembered'],
  ['Saved the seed through a wet spring', 'Cut a new field out of the moss'],
  ['Fasted until the sky answered', 'Taught the children the old prayers'],
  ['Forged a blade that would not dull', 'Kept the forge lit a whole winter'],
  ['Came home with more than was sent', 'Settled a debt older than the market'],
  ['Kept the lamps lit through a moonless month', 'Walked the night watch alone for a year'],
  ['Opened a new seam in the hill', 'Led the others out when the roof groaned'],
  ['Set a wall that would outlast its builders', 'Raised a roof in a single day'],
  ['Rang the village through a night of fog', 'Cast a truer bell'],
];
/** Short card lines for CivView.notable.deeds, by deed code. */
const deedLine = (code: number, arg: number): string => {
  switch (code) {
    case 1: return 'Shared out the last of the grain';
    case 2: return 'Pulled the children out of the fire';
    case 3: return 'Kept one fire alive through the killing cold';
    case 4: return 'Carried the last of the grain through the flood';
    case 5: return 'Walked out to where the stone fell';
    case 6: return 'Dug the neighbours out when the ground split';
    case 7: return 'Stood between the spears';
    case 8: return `Laid the first stone of the ${BUILT[arg] ?? 'new work'}`;
    case 9: return ERA_DEED[arg] || 'Saw a new age come in';
    case 10: return 'Led the dancing at the festival';
    case 11: return `Was first to pray to the ${['', 'sun', 'moon', 'sea', 'falling stones', 'fire', 'storm'][arg] || 'sky'}`;
    case 12: return 'Watched a lamp rise and not come down';
    case 13: return 'Walked the young out to new ground';
    case 14: return 'Made the long road to market and back';
    case 15: return 'Looked up and knew before the rest';
    case 16: return 'Woke first on the morning of full stores';
    case 17: return 'Learned the songs of both peoples';
    case 18: return 'Was given the seat nearest the fire';
    case 20: return 'Was first to kneel to you';
    case 21: return 'Was first to raise a hand against you';
    case 22: return 'Stood and watched you longer than anyone';
    case 23: return 'Sat closest when you spoke';
    case 24: return 'Ate from your hand';
    case 25: return 'Lived through the day death fell';
    default: return WORK[arg >> 1]?.[arg & 1] ?? 'Did the work';
  }
};

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
  const peopleBuf = new Int16Array(MAX_PEOPLE * PERSON_STRIDE);
  let nextPid = 1;
  let launches = 0;
  let lastLaunchT = -99999;
  let pseed: Seed = { hi: 1, lo: 1 };
  let nseed: Seed = { hi: 1, lo: 1 };
  let notable: N | null = null;
  let line: Line = { ord: 0, house: 0, nextAt: 0, lastHome: -1, lastCalling: 0 };
  let evSeen = 0;
  let nTrade = 0;

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
    p.work = 0;
    // Festival: everyone dances by the fire.
    if ((v.festUntil ?? 0) > tick) { p.role = ROLE.dance; p.tx = Math.max(0, Math.min(g.width - 1, v.x + r.range(-5, 5))); p.wait = 4 + r.int(8); return; }
    // Deep night: all but the lamp-bearers go home to sleep.
    if ((day < 150 || day > 850) && p.role !== ROLE.lamp && !(v.tech >= 3 && r.chance(1, 5))) { p.role = ROLE.sleep; p.tx = v.x + r.range(-3, 3); p.wait = 30 + r.int(30); return; }
    if (p.role === ROLE.sleep || p.role === ROLE.dance || p.role === ROLE.carry || p.role === ROLE.chat || p.role === ROLE.flee || p.role === ROLE.listen) p.role = ROLE.idle;
    if (night && v.tech >= 3 && p.role !== ROLE.lamp && r.chance(1, 4)) p.role = ROLE.lamp;
    else if (night && p.role !== ROLE.lamp) p.role = ROLE.idle;
    else if (!night && (p.role === ROLE.idle || p.role === ROLE.lamp)) {
      // The village's buildings decide what work there is.
      const has = (k: BuildingKind) => v.bld?.some((b) => b.kind === k);
      const jobs: number[] = [ROLE.farm, ROLE.fish, ROLE.farm, ROLE.idle];
      if (has('mine')) jobs.push(ROLE.mine, ROLE.mine);
      if (has('workshop') && (v.ore ?? 0) > 0) jobs.push(ROLE.craft, ROLE.craft);
      if (has('market') && (v.goods ?? 0) > 0 && vs.length > 1) jobs.push(ROLE.trade, ROLE.trade);
      p.role = r.pick(jobs);
    }
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
      case ROLE.pray: p.tx = (v.bld?.find((b) => b.kind === 'shrine')?.x ?? v.x) + r.range(-2, 2); break;
      case ROLE.mine: p.tx = (v.bld?.find((b) => b.kind === 'mine')?.x ?? v.x) + r.range(-1, 1); break;
      case ROLE.craft: p.tx = (v.bld?.find((b) => b.kind === 'workshop')?.x ?? v.x) + r.range(-1, 1); break;
      case ROLE.build: break;
      case ROLE.trade: {
        // Carry goods to the nearest other village's market.
        const other = vs.filter((o) => o !== v).sort((a, b) => Math.abs(a.x - v.x) - Math.abs(b.x - v.x))[0];
        p.tx = other ? (other.bld?.find((b) => b.kind === 'market')?.x ?? other.x) : v.x;
        if (other) v.goods = Math.max(0, (v.goods ?? 0) - 1);
        break;
      }
      case ROLE.lamp: p.tx = v.x + r.range(-12, 12); break;
      default: {
        // Idle hands: some wander, some find a neighbour to talk to.
        const mates = people.filter((o) => o.home === p.home && o !== p && o.role !== ROLE.sleep);
        if (mates.length && r.chance(1, 2)) { p.role = ROLE.chat; p.tx = r.pick(mates).x + (r.chance(1, 2) ? 1 : -1); }
        else p.tx = v.x + r.range(-6, 6);
      }
    }
    p.tx = Math.max(0, Math.min(g.width - 1, p.tx));
    p.wait = p.role === ROLE.farm || p.role === ROLE.fish || p.role === ROLE.chat || p.role === ROLE.mine || p.role === ROLE.craft || p.role === ROLE.trade ? r.int(10) : 20 + r.int(60);
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
        for (const p of people) if (p.role === ROLE.attack || p.role === ROLE.kneel || p.role === ROLE.watch || p.role === ROLE.listen || p.role === ROLE.flee) { p.role = ROLE.idle; p.wait = 0; }
      }
    }
  };

  const movePeople = (g: GridView, day: number) => {
    moveAvatar(g);
    for (let i = people.length - 1; i >= 0; i--) {
      const p = people[i]!;
      if ((p.role === ROLE.flee || p.role === ROLE.listen) && (p.until ?? 0) > tick) {
        // Still running, or still listening.
        if (p.role === ROLE.flee && avatar) p.tx = Math.max(0, Math.min(g.width - 1, p.x + (p.x >= avatar.x ? 30 : -30)));
        if (p.role === ROLE.listen) continue;
      } else if (avatar && p.role !== ROLE.travel && p.role !== ROLE.sleep && Math.abs(p.x - avatar.x) < 45) {
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
        const hv = vs.find((v) => v.id === p.home);
        // Work has stages: walk out, work a while, carry it home.
if ((p.role === ROLE.mine || p.role === ROLE.craft || p.role === ROLE.build) && !p.work) { p.work = 1; p.wait = 40 + r.int(30); continue; }
        if (p.role === ROLE.mine && hv) { hv.ore = Math.min(99, (hv.ore ?? 0) + 2); p.role = ROLE.carry; p.work = 0; p.tx = hv.bld?.find((b) => b.kind === 'workshop')?.x ?? hv.x; continue; }
        if (p.role === ROLE.craft && hv) { if ((hv.ore ?? 0) > 0) { hv.ore = (hv.ore ?? 0) - 1; hv.goods = Math.min(99, (hv.goods ?? 0) + 2); hv.wealth = Math.min(999, (hv.wealth ?? 0) + 2); } p.role = ROLE.carry; p.work = 0; p.tx = hv.bld?.find((b) => b.kind === 'market')?.x ?? hv.x; continue; }
        if (p.role === ROLE.trade && hv) {
          // Sold: coin for both sides, and a little goodwill.
          const there = vs.find((o) => o !== hv && Math.abs((o.bld?.find((b) => b.kind === 'market')?.x ?? o.x) - p.x) <= 2);
          hv.wealth = Math.min(999, (hv.wealth ?? 0) + 22);
          if (there && notable && p.id === notable.pid) nTrade = there.id;
          if (there) { there.wealth = Math.min(999, (there.wealth ?? 0) + 5); there.mood = Math.min(100, there.mood + 1); if (r.chance(1, 12)) pendingEv.push({ kind: 'traded', tick, villageId: hv.id, x: hv.x, y: hv.y, detail: there.id }); }
          p.role = ROLE.carry; p.work = 0; p.tx = hv.x; continue;
        }
        if ((p.role === ROLE.farm || p.role === ROLE.fish) && !p.work) { p.work = 1; p.wait = 30 + r.int(30); continue; }
        if ((p.role === ROLE.farm || p.role === ROLE.fish) && hv) { p.role = ROLE.carry; p.work = 0; p.tx = hv.x; continue; }
        if (p.role === ROLE.carry && hv) { hv.food = Math.min(999, hv.food + 3); }
        if (p.role === ROLE.chat && !p.work) { p.work = 1; p.wait = 30 + r.int(40); continue; }
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
      if (p.role !== ROLE.flee && (tick + i) % 2) continue; // walk at half speed; the frightened run
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
      // What they have built. Each new kind of building is an event, and brings builders.
      if (tick - (v.planT ?? -9999) >= 100) {
        v.planT = tick;
        const old = v.bld ?? [];
        const bld: Building[] = [];
        const put = (kind: BuildingKind, x: number, seed = 0) => {
          const cx = Math.max(2, Math.min(g.width - 3, Math.round(x)));
          const prev = old.find((b) => b.kind === kind && b.seed === seed);
          bld.push(prev ?? { kind, x: cx, seed });
          if (!prev && kind !== 'house' && kind !== 'fire' && old.length) {
            ev(events, 'built', v, { detail: ['house', 'fire', 'farm', 'dock', 'mine', 'workshop', 'market', 'store', 'shrine', 'tower', 'pad'].indexOf(kind) });
            let sent = 0;
            for (const p of people) if (sent < 2 && p.home === v.id && (p.role === ROLE.idle || p.role === ROLE.farm || p.role === ROLE.chat)) { p.role = ROLE.build; p.tx = cx + (sent ? 1 : -1); p.wait = 0; p.work = 0; sent++; }
          }
        };
        const houses = Math.min(7, 1 + (v.souls >> 3));
        for (let k = 0; k < houses; k++) put('house', v.x + (k % 2 ? -1 : 1) * (4 + (k >> 1) * 7), k);
        if (v.tech >= 1) put('fire', v.x);
        const scan = (want: (x: number) => boolean, max: number) => { for (let d = 3; d < max; d++) for (const sx of [v.x + d, v.x - d]) if (sx > 2 && sx < g.width - 3 && want(sx)) return sx; return -1; };
        const field = scan((x) => at(g, x, ground[x]!) === MOSS && at(g, x + 1, ground[x + 1]!) === MOSS, 34);
        if (field >= 0) put('farm', field); else { const o = old.find((b) => b.kind === 'farm'); if (o) bld.push(o); }
        const shore = scan((x) => at(g, x, ground[x]!) !== WATER && (at(g, x + 1, ground[x + 1]!) === WATER || at(g, x - 1, ground[x - 1]!) === WATER), 44);
        if (shore >= 0) put('dock', shore); else { const o = old.find((b) => b.kind === 'dock'); if (o) bld.push(o); }
        if (v.tech >= 1) put('store', v.x - 11);
        if (v.tech >= 1 && v.souls >= 16) put('market', v.x + 11);
        if (v.tech >= 2) { put('mine', v.x + (v.id % 2 ? 19 : -19)); put('workshop', v.x + (v.id % 2 ? -17 : 17)); }
        if (v.belief !== 'none') put('shrine', v.x + (v.id % 2 ? 25 : -25));
        if (v.tech >= 4) put('tower', v.x + 2);
        if (v.tech >= 2 && ((v.wealth ?? 0) >= 60 || old.some((b) => b.kind === 'pad'))) put('pad', v.x + (v.id % 2 ? -27 : 27));
        v.bld = bld;
      }
      // Markets turn stores into coin; coin feeds craft and learning.
      if (v.bld?.some((b) => b.kind === 'market') && v.food > 400) { v.food -= 6; v.wealth = Math.min(999, (v.wealth ?? 0) + 1); }
      // Coin buys food from traders when the stores run low, so craft and trade can feed a village.
      if (v.food < 120 && (v.wealth ?? 0) >= 4 && v.bld?.some((b) => b.kind === 'market')) { v.wealth = (v.wealth ?? 0) - 4; v.food += 45; }
      // Tech.
      const ore = near(g, v.x, v.y, 30, ENGINE.ore.id, 8) > 0 || m.impacts > 25;
      v.progress += 1 + (v.souls >> 4) + (v.mood > 30 ? 1 : 0) + ((v.wealth ?? 0) >> 6);
      const need = [260, 700, 1300, 2200, 3400][v.tech] ?? Infinity;
      const can = [v.souls >= 14, v.souls >= 22 && ore, v.souls >= 35, v.souls >= 50 && v.mood > 0, totalSouls >= 140 && vs.filter((o) => o.tech >= 4).length >= 2][v.tech] ?? false;
      if (v.progress >= need && can) {
        v.tech++;
        v.progress = 0;
        era = Math.max(era, v.tech);
        ev(events, 'tech', v, { detail: v.tech });
      }
      // A launch pad and enough coin puts something into orbit: first lanterns, later stations.
      if (v.bld?.some((b) => b.kind === 'pad') && (v.wealth ?? 0) >= 150 && tick - v.lastLaunch > 2400) {
        v.wealth = (v.wealth ?? 0) - 130;
        launches++;
        lastLaunchT = tick;
        v.lastLaunch = tick;
        ev(events, 'launch', v, { detail: v.tech >= 5 ? 1 : 0 });
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
        v.lastFest = tick;
        v.festUntil = tick + 320; v.mood -= 30; v.food -= 60; ev(events, 'festival', v, { belief: v.belief }); }
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
      for (let k = want; k < mine.length; k++) if (!notable || mine[k]!.id !== notable.pid) people.splice(people.indexOf(mine[k]!), 1);
    }
    people = people.filter((p) => p.role === ROLE.travel || vs.some((v) => v.id === p.home));
    tendNotable(events, surface);
    const nl = Math.max(0, m.nightLight);
    glow = Math.floor(vs.reduce((n, v) => n + v.souls * (2 + v.tech) * (v.mood > 0 ? 2 : 1) * (enl(v) >= 100 ? 2 : 1), 0) * (100 + nl) / 6400) + worshippers * 2;
  };

  // Stateless dice for the notable: a pure function of (planet seed, tick, salt), so this
  // never disturbs the villages' own rng stream and survives snapshot/restore.
  const roll = (salt: number, n: number) => seedToU32(mix(mix(nseed, tick), salt)) % n;
  const pack = (code: number, n: { calling: number; ord: number; house: number }, age: number, arg = 0) =>
    code + 64 * (n.calling + 16 * (Math.max(0, Math.min(127, age)) + 128 * ((arg > 255 || arg < 0 ? 0 : arg) + 256 * (n.ord + 4096 * n.house))));
  const callingFor = (p: P, v: V): number => {
    const has = (k: BuildingKind) => !!v.bld?.some((b) => b.kind === k);
    const c: number[] = [];
    const byRole: Record<number, number> = { [ROLE.fish]: 1, [ROLE.farm]: 2, [ROLE.pray]: 3, [ROLE.craft]: 4, [ROLE.trade]: 5, [ROLE.lamp]: 6, [ROLE.mine]: 7, [ROLE.build]: 8 };
    const mine = byRole[p.role];
    if (mine !== undefined) c.push(mine, mine, mine);
    if (v.belief !== 'none' && has('shrine')) c.push(3);
    if (has('workshop')) c.push(4);
    if (has('market')) c.push(5);
    if (v.tech >= 3) c.push(6, 6);
    if (has('mine')) c.push(7);
    if (has('tower')) c.push(9, 9);
    if (has('dock')) c.push(1);
    if (has('farm')) c.push(2);
    if (!c.length) c.push(0);
    return c[roll(13, c.length)]!;
  };
  const tendNotable = (events: CivEvent[], surface: readonly SurfaceEvent[]) => {
    const from = evSeen;
    evSeen = events.length;
    if (!notable) {
      // Choose someone: first soon after the first village stands, later a child or an
      // apprentice of the one before, a year or two after the death.
      if (!vs.length || tick < line.nextAt) return;
      const kin = line.ord > 0 ? vs.find((o) => o.id === line.lastHome) : undefined;
      const v = kin ?? [...vs].sort((a, b) => b.souls - a.souls || a.id - b.id)[0]!;
      if (v.age < 8) return;
      const cand = people.filter((p) => p.home === v.id && p.role !== ROLE.travel && p.role !== ROLE.attack && p.role !== ROLE.flee);
      if (!cand.length) return;
      const p = cand[roll(11, cand.length)]!;
      p.id ??= nextPid++;
      const rel = line.ord === 0 ? 0 : !kin ? 3 : roll(12, 2) ? 1 : 2;
      line.ord++;
      if (rel !== 1) line.house++;
      const age0 = 14 + roll(14, 6);
      const n: N = { pid: p.id, ord: line.ord, house: line.house, calling: rel === 2 ? line.lastCalling : callingFor(p, v), bornT: tick - age0 * YEAR_TICKS, home: v.id, deeds: [], metYou: false, lastDeedT: tick - 1600, aged: age0, done: [], works: 0 };
      notable = n;
      events.push({ kind: 'born', tick, villageId: v.id, x: p.x, y: p.y, detail: pack(rel, n, age0), belief: v.belief });
      evSeen = events.length;
      return;
    }
    const n = notable;
    const age = Math.floor((tick - n.bornT) / YEAR_TICKS);
    const p = people.find((q) => q.id === n.pid);
    const fresh = events.slice(from);
    const pass = (cause: number, x: number, y: number, belief: Belief) => {
      events.push({ kind: 'passed', tick, villageId: n.home, x, y, detail: pack(cause, n, age), belief });
      line.lastHome = n.home;
      line.lastCalling = n.calling;
      line.nextAt = tick + YEAR_TICKS + roll(91, YEAR_TICKS);
      notable = null;
      evSeen = events.length;
    };
    const home = p ? vs.find((v) => v.id === p.home) : undefined;
    if (!p || !home) {
      // Gone with their village, or taken by something that removes people outright.
      const mineEv = (k: CivEvent['kind']) => fresh.find((e) => e.kind === k && e.villageId === n.home);
      const gone = mineEv('flooded') ?? mineEv('die');
      const cause = mineEv('flooded') ? 1 : mineEv('die') ? 2 : mineEv('smitten') ? 7 : fresh.some((e) => e.kind === 'struck') ? 9 : !vs.some((v) => v.id === n.home) ? 2 : 10;
      const hv = vs.find((v) => v.id === n.home);
      pass(cause, p?.x ?? gone?.x ?? hv?.x ?? 0, p?.y ?? gone?.y ?? hv?.y ?? 0, hv?.belief ?? 'none');
      return;
    }
    n.home = home.id;
    const die = (cause: number) => {
      people.splice(people.indexOf(p), 1);
      if (home.souls > 1) home.souls--;
      pass(cause, p.x, p.y, home.belief);
    };
    const deed = (code: number, arg = 0) => {
      n.deeds.push(`At ${age}: ${deedLine(code, arg)}.`);
      if (n.deeds.length > 6) n.deeds = n.deeds.slice(-6);
      n.lastDeedT = tick;
      events.push({ kind: 'deed', tick, villageId: home.id, x: p.x, y: p.y, detail: pack(code, n, age, arg), belief: home.belief });
      evSeen = events.length;
    };
    // Years.
    if (age > n.aged) {
      n.aged = age;
      if (age >= 46 && roll(77, 100) < (age - 44) * 4) { die(0); return; }
    }
    // Meeting the player's body: the first to kneel, to raise a hand, or just to stare.
    if (avatar && !n.metYou) {
      const d = Math.abs(p.x - avatar.x);
      const c = p.role === ROLE.kneel && d <= 4 ? 20 : p.role === ROLE.attack && d <= 3 ? 21 : p.role === ROLE.watch && d <= 14 ? 22 : p.role === ROLE.listen && d <= 30 ? 23 : 0;
      if (c) { n.metYou = true; deed(c); return; }
    }
    // What really happened to them and their village since last time.
    const best = { pri: -1, code: 0, arg: 0, die: 0, cause: 0 };
    // Each kind of deed is told once in a life; a second famine can still kill, but is not a second line.
    const risk = { die: 0, cause: 0, code: 0 };
    const offer = (pri: number, code: number, arg = 0, dieIn = 0, cause = 0) => {
      if (dieIn && (!risk.die || dieIn < risk.die)) { risk.die = dieIn; risk.cause = cause; risk.code = code; }
      if (!n.done.includes(code) && pri > best.pri) { best.pri = pri; best.code = code; best.arg = arg; best.die = dieIn; best.cause = cause; }
    };
    for (const e of fresh) {
      const mine = e.villageId === n.home;
      switch (e.kind) {
        case 'famine': if (mine) offer(8, 1, 0, 8, 5); break;
        case 'burn': if (mine) offer(9, 2, 0, 5, 3); break;
        case 'frozen': if (mine) offer(8, 3, 0, 8, 8); break;
        case 'migrate': if (mine && e.detail === e.villageId) offer(9, 4, 0, 6, 1); break;
        case 'feud': if (mine || e.detail === n.home) offer(7, 7, mine ? e.detail ?? 0 : e.villageId, 6, 6); break;
        case 'smitten': if (mine) offer(9, 25); break;
        case 'built': if (mine && (p.role === ROLE.build || n.calling === 8 || n.calling === 4 || roll(31, 2) === 0)) offer(4, 8, e.detail ?? 0); break;
        case 'tech': if (mine) offer(6, 9, e.detail ?? 0); break;
        case 'festival': if (mine) offer(3, 10); break;
        case 'convert': if (mine) offer(5, 11, BELIEFS.indexOf(e.belief ?? 'none')); break;
        case 'launch': offer(6, 12, mine ? 0 : e.villageId); break;
        case 'split': if (mine) offer(3, 13); break;
        case 'enlightened': if (mine) offer(6, 15); break;
        case 'blessed': if (mine) offer(4, 16); break;
        case 'merged': if (mine) offer(5, 17); break;
        case 'gift': if (mine && avatar && Math.abs(p.x - avatar.x) < 45) offer(7, 24); break;
        default: break;
      }
    }
    for (const s of surface) {
      const d = Math.abs(s.x - p.x);
      if (s.kind === 'impact' && d < 30) offer(10, 5, 0, d < 10 ? 4 : 0, 4);
      if (s.kind === 'quake' && d < 30) offer(8, 6, 0, 8, 11);
    }
    if (nTrade) { offer(5, 14, nTrade); nTrade = 0; }
    if (risk.die && roll(40 + risk.code, risk.die) === 0) { die(risk.cause); return; }
    const quiet = tick - n.lastDeedT;
    if (best.pri >= 0 && quiet >= (best.die || best.code === 25 || best.code === 24 ? 800 : best.pri >= 6 ? 1600 : 3200)) {
      if (best.code === 24) n.metYou = true;
      n.done.push(best.code);
      deed(best.code, best.arg);
    } else if (age >= 50 && !n.done.includes(18) && quiet >= 1600) {
      n.done.push(18);
      deed(18);
    } else if (quiet >= 6 * YEAR_TICKS && n.works < 2) {
      // A quiet life still leaves a mark: the work of their calling (two tellings at most).
      deed(30, n.calling * 2 + ((n.ord + n.works++) & 1));
    }
  };

  const prosperityOf = (v: V) => Math.round(Math.min(30, (v.food / 600) * 30) + Math.min(40, ((v.wealth ?? 0) / 300) * 40) + ((Math.max(-100, Math.min(100, v.mood)) + 100) / 200) * 30);
  const view = () => {
    const n = Math.min(people.length, MAX_PEOPLE);
    for (let i = 0; i < n; i++) {
      const p = people[i]!;
      p.id ??= nextPid++;
      const k = i * PERSON_STRIDE;
      peopleBuf[k] = p.x; peopleBuf[k + 1] = p.y; peopleBuf[k + 2] = p.role === ROLE.farm && !p.work ? ROLE.idle : p.role; peopleBuf[k + 3] = p.home; peopleBuf[k + 4] = p.id % 30000;
    }
    return {
      villages: vs.map((v): Village => ({ id: v.id, x: v.x, y: v.y, souls: v.souls, name: v.name, tech: v.tech, belief: v.belief, food: v.food, mood: v.mood, enlightenment: v.enl ?? 0, wealth: v.wealth ?? 0, goods: v.goods ?? 0, prosperity: prosperityOf(v), buildings: v.bld ?? [] })),
      souls: vs.reduce((s, v) => s + v.souls, 0),
      glowPerMinute: glow,
      people: peopleBuf.subarray(0, n * PERSON_STRIDE),
      peopleCount: n,
      era,
      prosperity: vs.length ? Math.round(vs.reduce((n, v) => n + prosperityOf(v), 0) / vs.length) : 0,
      launches,
      launchAge: tick - lastLaunchT,
      notable: notable ? { personId: notable.pid % 30000, name: notableName(pseed, notable.ord, notable.house).full, calling: CALLINGS[notable.calling] ?? 'wanderer', age: Math.floor((tick - notable.bornT) / YEAR_TICKS), villageId: notable.home, deeds: notable.deeds.slice(), metYou: notable.metYou } : null,
      avatar: avatar ? { x: avatar.x, y: avatar.y, hp: avatar.hp, attackers, worshippers, action: avatar.action, actionAge: tick - avatar.actionT } : null,
    };
  };

  return {
    init: (p, surface) => {
      r = rng(child(p.seed, 'civ'));
      pseed = p.seed;
      nseed = child(p.seed, 'notable');
      notable = null;
      line = { ord: 0, house: 0, nextAt: 0, lastHome: -1, lastCalling: 0 };
      nTrade = 0;
      nextPid = 1;
      vs = [];
      people = [];
      pending = surface.villageSites.map((s) => ({ x: s.x, belief: 'none' as Belief, tech: 0 }));
      avatar = null;
      pendingEv = [];
      tick = 0;
      nextId = 1;
      glow = 0;
      era = 0;
      launches = 0;
      lastLaunchT = -99999;
    },
    step: (ticks, g, m, env, surface) => {
      const events: CivEvent[] = [];
      evSeen = 0;
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
      } else if (tool === 'merge') {
        // The two villages nearest the touch become one new people.
        const two = [...vs].sort((p, q) => Math.abs(p.x - x) - Math.abs(q.x - x)).slice(0, 2);
        if (two.length === 2) {
          const [a, b] = two as [V, V];
          const mx = Math.round((a.x * a.souls + b.x * b.souls) / Math.max(1, a.souls + b.souls));
          // Two faiths that meet make a third.
          const others = BELIEFS.filter((k) => k !== 'none' && k !== a.belief && k !== b.belief);
          const belief = a.belief === b.belief ? a.belief : others[(a.id * 7 + b.id * 3) % others.length]!;
          const v: V = { id: nextId++, x: mx, y: ground.length ? ground[mx]! - 1 : a.y, souls: a.souls + b.souls, name: `#${nextId - 1}`, tech: Math.min(5, Math.max(a.tech, b.tech) + (a.tech === b.tech ? 1 : 0)), belief, food: Math.min(999, a.food + b.food), mood: 40, age: 0, scores: BELIEFS.map((k) => (k === belief ? 80 : 0)), progress: 0, wet: 0, starving: false, cold: false, lastBurn: -9999, lastLaunch: -99999, enl: Math.min(100, Math.max(enl(a), enl(b)) + 10) };
          vs = vs.filter((o) => o !== a && o !== b);
          vs.push(v);
          era = Math.max(era, v.tech);
          for (const p of people) if (p.home === a.id || p.home === b.id) { p.home = v.id; p.wait = 0; p.tx = v.x; }
          pendingEv.push({ kind: 'merged', tick, villageId: v.id, x: v.x, y: v.y, belief, detail: a.id });
        }
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
      avatar = { x: cx, y: ground.length ? ground[cx]! - 1 : 0, hp: 100, tx: cx, hitT: tick, action: null, actionT: tick, preachT: -999 };
    },
    walk: (x) => { if (avatar) avatar.tx = Math.max(1, Math.min(Math.max(1, ground.length - 2), Math.round(x))); },
    act: (action) => {
      if (!avatar) return;
      const a = avatar;
      a.action = action;
      a.actionT = tick;
      const nearV = (rad: number) => vs.filter((v) => Math.abs(v.x - a.x) <= rad);
      const closest = [...vs].sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x))[0];
      const push = (kind: CivEvent['kind'], v: V, detail?: number) => pendingEv.push({ kind, tick, villageId: v.id, x: v.x, y: v.y, belief: v.belief, ...(detail !== undefined ? { detail } : {}) });
      if (action === 'strike') {
        // Fell the two nearest attackers; the rest lose their nerve and run.
        const foes = people.filter((p) => p.role === ROLE.attack && Math.abs(p.x - a.x) <= 3).sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x));
        for (const f of foes.slice(0, 2)) {
          const hv = vs.find((v) => v.id === f.home);
          if (hv) hv.souls = Math.max(0, hv.souls - 1);
          people.splice(people.indexOf(f), 1);
        }
        if (foes.length) {
          for (const p of people) if (p.role === ROLE.attack && Math.abs(p.x - a.x) < 16) { p.role = ROLE.flee; p.until = tick + 160; p.wait = 0; }
          for (const v of nearV(50)) { v.enl = Math.max(0, enl(v) - 6); v.mood -= 12; }
          if (closest) push('struck', closest);
        }
      } else if (action === 'preach') {
        if (tick - a.preachT < 60) return;
        a.preachT = tick;
        for (const p of people) {
          if (Math.abs(p.x - a.x) > 30 || p.role === ROLE.sleep || p.role === ROLE.flee) continue;
          if (p.role !== ROLE.attack || r.chance(1, 2)) { p.role = ROLE.listen; p.until = tick + 120; p.tx = p.x; p.wait = 0; }
        }
        for (const v of nearV(45)) {
          v.enl = Math.min(100, enl(v) + 5);
          if (tick - (v.lastPreach ?? -99999) > 1600) { v.lastPreach = tick; push('preached', v); }
        }
      } else if (action === 'gift') {
        if (closest && Math.abs(closest.x - a.x) < 40 && a.hp > 10) {
          a.hp -= 8;
          closest.food = Math.min(999, closest.food + 90);
          closest.mood = Math.min(100, closest.mood + 15);
          closest.enl = Math.min(100, enl(closest) + 3);
          push('gift', closest);
        }
      } else if (action === 'shine') {
        if (a.hp <= 6) return;
        a.hp -= 5;
        // The wise kneel to the light. The rest cannot bear it.
        for (const p of people) {
          if (Math.abs(p.x - a.x) > 40 || p.role === ROLE.sleep) continue;
          const hv = vs.find((v) => v.id === p.home);
          if (hv && enl(hv) >= 30) { p.role = ROLE.listen; p.until = tick + 100; p.tx = p.x; } else { p.role = ROLE.flee; p.until = tick + 160; }
          p.wait = 0;
        }
        for (const v of nearV(45)) { v.scores[BELIEFS.indexOf('sky')]! += 30; if (tick - (v.lastOmen ?? -99999) > 400) { v.lastOmen = tick; push('omen', v, 101); } }
      } else if (action === 'rest') {
        if (attackers === 0) a.hp = Math.min(100, a.hp + 15);
      }
    },
    ascend: () => {
      avatar = null;
      for (const p of people) if (p.role === ROLE.attack || p.role === ROLE.kneel || p.role === ROLE.watch || p.role === ROLE.listen || p.role === ROLE.flee) { p.role = ROLE.idle; p.wait = 0; }
    },
    snapshot: () => new TextEncoder().encode(JSON.stringify({ vs, people, pending, tick, nextId, glow, era, nextPid, notable, line })),
    restore: (s) => {
      const o = JSON.parse(new TextDecoder().decode(s)) as { vs: V[]; people: P[]; pending: typeof pending; tick: number; nextId: number; glow: number; era: number };
      ({ vs, people, pending, tick, nextId, glow, era } = o);
      const x = o as { nextPid?: number; notable?: N | null; line?: Line };
      nextPid = x.nextPid ?? people.reduce((m, p) => Math.max(m, p.id ?? 0), 0) + 1;
      notable = x.notable ?? null;
      line = x.line ?? { ord: 0, house: 0, nextAt: 0, lastHome: -1, lastCalling: 0 };
    },
  };
};
