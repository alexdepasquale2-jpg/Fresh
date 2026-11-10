// The town: one shared world model for the screen (src/ui/town) and the hub page (src/app/plugins/town.ts).
// Pure logic over data tables; no DOM. State lives in localStorage 'sallow-town' (see state.ts).
import { rng, child } from '@/core/hash';
import { T, TILE, MAP_W as W, MAP_H as H, type Actor, type Cond, type Facts, type Phase, type QuestDef, type QuestState, type Reward, type Scene, type TownDeps, type TownEvent, type TownState, type Weather, type Line, type Step } from './types';
import { townMap, solidTile, nearestOpen, SEED, DISTRICTS, GATES, PLACES, type TownMap } from './map';
import { NPCS } from './npcs';
import { QUESTS } from './quests';
import { ITEMS, SHOPS, COLLECT, item } from './items';
import { ENCOUNTERS } from './encounters';
import * as S from './state';

// Content dropped into these folders registers itself by pushing onto the tables above.
import.meta.glob('./{quests,npcs,items,places,encounters}/*.ts', { eager: true });

export * from './types';
export { DISTRICTS, GATES, PLACES, NPCS, QUESTS, ITEMS, SHOPS, COLLECT, ENCOUNTERS, item, townMap };
export { clockText, phaseOf, dayOf, isSeen, STORE_KEY, CELL, CELLS } from './state';

export interface Find { id: string; kind: string; x: number; y: number; taken: boolean }
export interface Town {
  readonly map: TownMap;
  state: TownState;
  readonly actors: Actor[];
  readonly finds: Find[];
  readonly pathX: Int16Array; readonly pathY: Int16Array;
  bind(deps: TownDeps): void;
  on(cb: (e: TownEvent) => void): () => void;
  facts(): Facts;
  tick(dtMs: number): void;
  phase(): Phase; dark(): number; weather(): Weather;
  blocked(tx: number, ty: number): boolean;
  gateOpen(index: number): boolean;
  /** A* from tile to tile; fills pathX/pathY and returns the step count (0 = no way). Stops beside a solid target. */
  path(fx: number, fy: number, tx: number, ty: number): number;
  /** Something that happened by itself (a quest step met elsewhere) and wants saying. Null when nothing. */
  pop(): Scene | null;
  /** Call when the kid stands on a new tile. May return something to read. */
  moved(tx: number, ty: number): Scene | null;
  actorAt(tx: number, ty: number): Actor | null;
  /** Talk to / use whatever is on a tile. */
  interact(tx: number, ty: number): Scene | null;
  skimDone(place: string, skips: number): Scene;
  quests(): { def: QuestDef; st: QuestState; hint: string }[];
  /** The quest step to point at: hint and marker tile. */
  lead(): { name: string; hint: string; at: readonly [number, number] | null } | null;
  use(itemId: string): string;
  districtAt(tx: number, ty: number): string;
  save(): void;
  reset(): void;
  /** Test hooks and plumbing. */
  test(c: Cond | undefined): boolean;
  setMinutes(m: number): void;
}

const BLANK: Facts = { count: 0, deepest: 0, souls: 0, era: 0, rare: 0, floors: 0, wins: 0, beaten: 0, light: 8, lightLow: false, room: 25, firstName: '', bestName: '', beatenIds: [] };
const OPEN_GROUND = new Set<number>([T.GRASS, T.TALL, T.PATH, T.PAVE, T.SAND, T.GRAVEL, T.YARD, T.FLOWER]);

const create = (): Town => {
  const map = townMap();
  let st = S.load();
  let deps: TownDeps | null = null;
  let facts: Facts = BLANK;
  const subs: ((e: TownEvent) => void)[] = [];
  const emit = (e: TownEvent) => { for (const cb of subs) { try { cb(e); } catch { /* a listener must not break the walk */ } } };
  let dirty = false, saveIn = 0, slow = 0, lastPhase: Phase = S.phaseOf(st.minutes);
  const gateState = new Uint8Array(GATES.length + 1);
  let gateStamp = 0;
  const wr = rng(child(SEED, 'wander'));

  /* ---- Conditions ---- */
  const qstate = (id: string): QuestState | undefined => st.quests[id];
  const foundOf = (kind: string): number => { let n = 0; for (const f of st.found) if (f.startsWith(kind + '-')) n++; return n; };
  const test = (c: Cond | undefined): boolean => {
    if (!c) return true;
    if (c.phase) { const p = S.phaseOf(st.minutes); if (typeof c.phase === 'string' ? c.phase !== p : !c.phase.includes(p)) return false; }
    if (c.weather && S.weatherOf(st.minutes) !== c.weather) return false;
    if (c.quest) { const q = qstate(c.quest[0]), w = c.quest[1]; const ok = w === 'none' ? !q : w === 'done' ? !!q?.done : w === 'active' ? !!q && !q.done : !!q && !q.done && q.stage === w; if (!ok) return false; }
    if (c.has) { if (typeof c.has === 'string' ? !S.has(st, c.has) : !S.has(st, c.has[0], c.has[1])) return false; }
    if (c.flag && !st.flags[c.flag]) return false;
    if (c.noFlag && st.flags[c.noFlag]) return false;
    if (c.fact) { const v = facts[c.fact[0]], n = c.fact[2]; if (c.fact[1] === '>=' ? v < n : c.fact[1] === '<' ? v >= n : v !== n) return false; }
    if (c.found && foundOf(c.found[0]) < c.found[1]) return false;
    if (c.districts !== undefined && st.districts.length < c.districts) return false;
    if (c.beat !== undefined && !facts.beatenIds.includes(c.beat)) return false;
    if (c.any && !c.any.some(test)) return false;
    if (c.not && test(c.not)) return false;
    return true;
  };
  const fill = (t: string): string => t.replace(/\{(\w+)\}/g, (_, k: string) => (k === 'first' ? facts.firstName || 'it' : k === 'best' ? facts.bestName || 'that one' : String((facts as unknown as Record<string, unknown>)[k] ?? '')));

  /* ---- Rewards ---- */
  const give = (r: Reward | undefined): string => {
    if (!r) return '';
    const got: string[] = [];
    if (r.coins) { st.coins += r.coins; got.push(`${r.coins} coin${r.coins === 1 ? '' : 's'}`); emit({ type: 'coins', n: r.coins }); }
    for (const [id, n] of r.take ?? []) S.addItem(st, id, -n);
    for (const [id, n] of r.items ?? []) { S.addItem(st, id, n); got.push(n > 1 ? `${item(id).name} ×${n}` : item(id).name); emit({ type: 'item', id, name: item(id).name, n }); }
    for (const [kind, n] of r.sky ?? []) { deps?.grantSky(kind, n); got.push(`${n} ${kind} for your skies`); }
    if (r.glow) { deps?.addGlow(r.glow); got.push('Light'); }
    if (r.universe) { const name = deps?.addUniverse(r.universe) ?? null; got.push(name ? `a universe: ${name}` : 'a universe (your Box was full; it waits at the pit)'); if (!name) S.setFlag(st, `owed-${r.universe}`); }
    for (const f of r.flags ?? []) S.setFlag(st, f);
    dirty = true;
    return got.join(', ');
  };

  /* ---- Quests ---- */
  const stepOf = (q: QuestDef): Step | null => { const s = qstate(q.id); return s && !s.done ? q.steps[s.stage] ?? null : null; };
  const advance = (q: QuestDef): string => {
    const s = st.quests[q.id]!, step = q.steps[s.stage]!;
    let got = give(step.give);
    s.stage++; s.day = S.dayOf(st.minutes);
    if (s.stage >= q.steps.length) {
      s.done = true;
      const r = give(q.reward);
      got = [got, r].filter(Boolean).join(', ');
      st.log.push(`${q.name}: ${q.end}`);
      emit({ type: 'quest', id: q.id, name: q.name, state: 'done', text: got ? `${q.end} You got: ${got}.` : q.end });
    } else emit({ type: 'quest', id: q.id, name: q.name, state: 'step', text: q.steps[s.stage]!.hint });
    dirty = true;
    return got;
  };
  const checkConds = (): Scene | null => {
    let said: Scene | null = null;
    for (let guard = 0; guard < 8; guard++) {
      let moved = false;
      for (const q of QUESTS) {
        const step = stepOf(q); if (!step) continue;
        const s = st.quests[q.id]!;
        if ((step.on.type === 'cond' && test(step.on.need)) || (step.on.type === 'wait' && S.dayOf(st.minutes) >= s.day + step.on.days)) {
          if (step.on.say && !said) said = { who: q.name, text: step.on.say };
          advance(q); moved = true;
        }
      }
      if (!moved) break;
    }
    return said;
  };
  const startQuest = (q: QuestDef): void => {
    st.quests[q.id] = { stage: 0, done: false, day: S.dayOf(st.minutes) };
    give(q.start);
    emit({ type: 'quest', id: q.id, name: q.name, state: 'start', text: q.steps[0]!.hint });
    dirty = true;
  };

  /* ---- Actors ---- */
  const actors: Actor[] = [];
  const mk = (id: string, name: string, kind: Actor['kind'], look: Actor['look'], roam: number, rival: number): Actor => ({ id, name, kind, look, x: 0, y: 0, tx: 0, ty: 0, hx: -1, hy: -1, dir: 0, moving: false, here: false, roam, next: 0, rival });
  for (const n of NPCS) actors.push(mk(n.id, n.name, 'npc', n.look, n.roam ?? 1, -1));
  ENCOUNTERS.forEach((e, i) => actors.push(mk(`rival-${i}`, 'A kid', 'rival', e.look, 1, e.rival)));
  const questActor = mk('quest-actor', '', 'quest', { hair: 3, top: 3, legs: 3, kind: 'cat' }, 0, -1);
  actors.push(questActor);
  const place = (a: Actor, post: readonly [number, number] | null | undefined): void => {
    if (!post) { a.here = false; a.hx = -1; return; }
    if (a.hx === post[0] && a.hy === post[1] && a.here) return;
    const p = nearestOpen(map, post[0], post[1]);
    a.hx = post[0]; a.hy = post[1]; a.tx = p[0]; a.ty = p[1]; a.x = p[0] * TILE + 8; a.y = p[1] * TILE + 8; a.here = true; a.moving = false;
  };
  const refreshActors = (): void => {
    const ph = S.phaseOf(st.minutes), rivals = deps?.rivals() ?? [];
    let k = 0;
    for (const n of NPCS) { const a = actors[k++]!; place(a, test(n.when) ? n.at[ph] : null); }
    for (const e of ENCOUNTERS) {
      const a = actors[k++]!, r = rivals[e.rival];
      if (!r || !test(e.when)) { a.here = false; continue; }
      a.name = r.name;
      // Bosses keep to the dark.
      place(a, r.boss && ph !== 'dusk' && ph !== 'night' ? null : e.at[ph] ?? (r.boss ? e.at.night ?? e.at.dusk : null));
    }
    let shown = false;
    for (const q of QUESTS) { const step = stepOf(q); if (step?.actor && step.on.type === 'reach') { questActor.look = step.actor; place(questActor, step.on.at); shown = true; break; } }
    if (!shown) questActor.here = false;
  };
  const moveActors = (dt: number, now: number): void => {
    for (const a of actors) {
      if (!a.here) continue;
      if (a.moving) {
        const gx = a.tx * TILE + 8, gy = a.ty * TILE + 8, sp = dt * 0.022;
        const dx = gx - a.x, dy = gy - a.y;
        if (Math.abs(dx) <= sp && Math.abs(dy) <= sp) { a.x = gx; a.y = gy; a.moving = false; }
        else { a.x += Math.sign(dx) * Math.min(sp, Math.abs(dx)); a.y += Math.sign(dy) * Math.min(sp, Math.abs(dy)); }
      } else if (a.roam > 0 && now >= a.next && (Math.abs(a.x - st.x) > 40 || Math.abs(a.y - st.y) > 40)) {
        a.next = now + 1800 + wr.int(5000);
        const d = wr.int(4), nx = a.tx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = a.ty + (d === 2 ? 1 : d === 3 ? -1 : 0);
        a.dir = d === 2 ? 0 : d === 3 ? 1 : d === 1 ? 2 : 3;
        if (Math.abs(nx - a.hx) <= a.roam + 1 && Math.abs(ny - a.hy) <= a.roam + 1 && !blocked(nx, ny) && map.tiles[ny * W + nx] !== T.GATE) { a.tx = nx; a.ty = ny; a.moving = true; }
      }
    }
  };

  /* ---- Finds ---- */
  const finds: Find[] = [];
  { const used = new Set<number>();
    for (const k of COLLECT) {
      const r = rng(child(SEED, `find-${k.id}`));
      const allowed = k.districts ? k.districts.map((d) => DISTRICTS.findIndex((x) => x.id === d)) : null;
      for (let n = 0; n < k.count; n++) {
        for (let tries = 0; tries < 4000; tries++) {
          const x = 3 + r.int(W - 6), y = 3 + r.int(H - 6), i = y * W + x;
          if (!map.reach[i] || !OPEN_GROUND.has(map.tiles[i]!) || used.has(i) || (allowed && !allowed.includes(map.district[i]!))) continue;
          used.add(i); finds.push({ id: `${k.id}-${n}`, kind: k.id, x, y, taken: false }); break;
        }
      }
    } }
  const syncFinds = (): void => { for (const f of finds) f.taken = st.found.includes(f.id); };
  syncFinds();

  /* ---- Gates and walking ---- */
  const refreshGates = (): void => { for (let i = 0; i < GATES.length; i++) { const o = test(GATES[i]!.open) ? 1 : 0; if (gateState[i + 1] !== o) { gateState[i + 1] = o; gateStamp++; } } };
  const blocked = (tx: number, ty: number): boolean => {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
    const i = ty * W + tx, t = map.tiles[i]!;
    if (t === T.GATE) { const g = map.gate[i]!; return g > 0 && gateState[g] === 0; }
    return solidTile(t);
  };
  const N = W * H;
  const gScore = new Int32Array(N), came = new Int32Array(N), stamp = new Uint16Array(N), heap = new Int32Array(N * 2), heapF = new Int32Array(N * 2);
  const pathX = new Int16Array(4096), pathY = new Int16Array(4096);
  let gen = 0, lastKey = -1, lastLen = 0, lastStamp = -1;
  const path = (fx: number, fy: number, tx: number, ty: number): number => {
    if (fx < 0 || fy < 0 || fx >= W || fy >= H || tx < 0 || ty < 0 || tx >= W || ty >= H) return 0;
    const key = ((fy * W + fx) * N + (ty * W + tx));
    if (key === lastKey && gateStamp === lastStamp) return lastLen;
    lastKey = key; lastStamp = gateStamp; lastLen = 0;
    const goal = ty * W + tx, start = fy * W + fx, goalSolid = blocked(tx, ty);
    if (start === goal) return 0;
    if (++gen > 65000) { stamp.fill(0); gen = 1; }
    let hn = 0;
    const push = (n: number, f: number) => { let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (heapF[p]! <= f) break; heap[i] = heap[p]!; heapF[i] = heapF[p]!; i = p; } heap[i] = n; heapF[i] = f; };
    const pop = (): number => { const top = heap[0]!; const n = heap[--hn]!, f = heapF[hn]!; let i = 0; for (;;) { let c = i * 2 + 1; if (c >= hn) break; if (c + 1 < hn && heapF[c + 1]! < heapF[c]!) c++; if (heapF[c]! >= f) break; heap[i] = heap[c]!; heapF[i] = heapF[c]!; i = c; } heap[i] = n; heapF[i] = f; return top; };
    stamp[start] = gen; gScore[start] = 0; came[start] = -1; push(start, 0);
    let found = -1, seen = 0;
    while (hn > 0 && seen++ < 14000) {
      const c = pop(), cx = c % W, cy = (c / W) | 0;
      if (c === goal || (goalSolid && Math.abs(cx - tx) + Math.abs(cy - ty) === 1)) { found = c; break; }
      const g = gScore[c]! + 1;
      for (let d = 0; d < 4; d++) {
        const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (blocked(nx, ny)) continue;
        const n = ny * W + nx;
        if (stamp[n] === gen && gScore[n]! <= g) continue;
        stamp[n] = gen; gScore[n] = g; came[n] = c;
        // Roads and paths are a little cheaper to think about, so routes keep to them.
        const t = map.tiles[n]!;
        push(n, g + Math.abs(nx - tx) + Math.abs(ny - ty) + (t === T.TALL ? 1 : 0));
      }
    }
    if (found < 0) return 0;
    let len = 0;
    for (let c = found; c !== start && len < 4096; c = came[c]!) len++;
    if (len >= 4096) return 0;
    let i = len;
    for (let c = found; c !== start; c = came[c]!) { i--; pathX[i] = c % W; pathY[i] = (c / W) | 0; }
    lastLen = len;
    return len;
  };

  /* ---- Scenes ---- */
  const say = (who: string, text: string, look?: Actor['look']): Scene => ({ who, text, ...(look ? { look } : {}) });
  const withGot = (text: string, got: string): string => (got ? `${text}\n(${got}.)` : text);
  const shopScene = (shopId: string, who: string, note = ''): Scene => {
    const shop = SHOPS.find((s) => s.id === shopId)!;
    if (!shop.open.includes(S.phaseOf(st.minutes))) return say(shop.name, 'Closed. The sign has been turned, and turned neatly.');
    return {
      who: shop.name, text: `${note || `${who} waits.`} You have ${st.coins} coin${st.coins === 1 ? '' : 's'}.`,
      choices: [...shop.stock.map((k) => {
        const sold = k.limit !== undefined && (st.bought[`${shop.id}:${k.item}`] ?? 0) >= k.limit;
        return { text: `${item(k.item).name} · ${sold ? 'sold' : `${k.price}c`}`, off: sold || st.coins < k.price, pick: (): Scene => {
          if (sold || st.coins < k.price) { emit({ type: 'sfx', name: 'deny' }); return shopScene(shopId, who, sold ? 'There was only the one.' : 'Not enough coins.'); }
          st.coins -= k.price; S.addItem(st, k.item, 1); st.bought[`${shop.id}:${k.item}`] = (st.bought[`${shop.id}:${k.item}`] ?? 0) + 1; dirty = true;
          emit({ type: 'sfx', name: 'gain' }); emit({ type: 'item', id: k.item, name: item(k.item).name, n: 1 });
          checkConds();
          return shopScene(shopId, who, `${item(k.item).name}. ${item(k.item).desc}`);
        } };
      }), { text: 'That is all', pick: () => null }],
    };
  };
  const pickLine = (lines: readonly Line[], id: string): Line | null => {
    let best = -1e9; const c: Line[] = [];
    for (const l of lines) {
      if (!test(l.when) || (l.once && st.flags[l.once])) continue;
      const w = l.weight ?? 0;
      if (w > best) { best = w; c.length = 0; }
      if (w === best) c.push(l);
    }
    return c.length ? c[(st.talks[id] ?? 0) % c.length]! : null;
  };
  const talkNpc = (a: Actor): Scene => {
    const def = NPCS.find((n) => n.id === a.id)!;
    st.stats.talks++; dirty = true;
    const done = (s: Scene): Scene => { st.talks[a.id] = (st.talks[a.id] ?? 0) + 1; return { ...s, look: a.look }; };
    // 1. A quest step that wants this person.
    for (const q of QUESTS) {
      const step = stepOf(q);
      if (!step || step.on.type !== 'talk' || step.on.npc !== a.id) continue;
      const on = step.on;
      if (!test(on.need)) { if (on.wait) return done(say(a.name, on.wait)); continue; }
      if (on.choices) {
        return done({ who: a.name, text: on.say, choices: on.choices.map((c) => ({ text: c.text, pick: (): Scene => {
          const pass = c.set?.includes('pass');
          const got = pass ? advance(q) : '';
          const after = pass ? checkConds() : null;
          return { who: a.name, text: withGot(c.say ?? '…', got), look: a.look, ...(after ? { choices: [{ text: '…', pick: () => after }] } : {}) };
        } })) });
      }
      const got = advance(q); checkConds();
      return done(say(a.name, withGot(on.say, got)));
    }
    // 2. A quest they can offer.
    for (const q of QUESTS) {
      if (q.giver !== a.id || qstate(q.id) || !test(q.needs)) continue;
      return done({ who: a.name, text: q.offer, choices: [
        { text: 'I will.', pick: (): Scene => { startQuest(q); const more = checkConds(); return more ?? say(a.name, q.accept ?? 'Good. I will be here.', a.look); } },
        { text: 'Not now.', pick: (): Scene => say(a.name, 'Then it will keep. Most things do, here.', a.look) },
      ] });
    }
    // 3. What they have to say.
    const l = pickLine(def.lines, a.id);
    const text = l ? fill(l.text) : '…';
    let got = '';
    if (l) { if (l.once) S.setFlag(st, l.once); for (const f of l.set ?? []) S.setFlag(st, f); got = give(l.give); checkConds(); }
    const choices: { text: string; pick: () => Scene | null }[] = (l?.choices ?? []).filter((c) => test(c.need)).map((c) => ({ text: c.text, pick: (): Scene | null => {
      for (const f of c.set ?? []) S.setFlag(st, f);
      S.setFlag(st, `${a.id}:said`);
      const g = give(c.give); dirty = true;
      return c.say ? say(a.name, withGot(c.say, g), a.look) : null;
    } }));
    if (def.shop) { const sid = def.shop; choices.push({ text: 'What do you sell?', pick: () => shopScene(sid, a.name) }, { text: 'Nothing today', pick: () => null }); }
    return done({ who: a.name, text: withGot(text, got), ...(choices.length ? { choices } : {}) });
  };
  const talkRival = (a: Actor): Scene => {
    const enc = ENCOUNTERS[Number(a.id.slice(6))]!, all = deps?.rivals() ?? [], r = all[enc.rival];
    if (!r) return say('A kid', 'They look through you.');
    const beat = facts.beatenIds.includes(r.id);
    const prev = all[enc.rival - 1];
    const locked = enc.rival > 0 && !!prev && !facts.beatenIds.includes(prev.id) && !beat;
    if (locked) return say(r.name, `${enc.before} "Not you. Not yet. ${prev!.name} first. Then me."`, a.look);
    if (facts.count === 0) return say(r.name, `${enc.before} "You have not even got one. Go home and look on your desk."`, a.look);
    return { who: r.name, look: a.look, text: beat ? `${enc.after} "${r.beaten ?? r.again ?? 'Again? Fine.'}"` : `${enc.before} "${r.taunt}"`, choices: [
      { text: beat ? 'Rematch' : 'Open your Box', pick: () => { st.fromTown = true; S.store(st); emit({ type: 'battle', rival: r.id }); return null; } },
      { text: 'Walk on', pick: () => null },
    ] };
  };
  const nextPhaseAt = (): number => { const h = (st.minutes % S.DAY) / 60, d = S.dayOf(st.minutes) * S.DAY; return h < 5 ? d + 300 : h < 7 ? d + 420 : h < 18 ? d + 1080 : h < 20 ? d + 1200 : d + S.DAY + 300; };
  const PHASE_NAME: Record<Phase, string> = { dawn: 'dawn', day: 'morning', dusk: 'dusk', night: 'night' };
  const bench = (): Scene => ({ who: 'A bench', text: 'Cold slats, a brass plate worn blank. Sit?', choices: [
    { text: 'Sit a while (one hour)', pick: () => sit(st.minutes + 60) },
    { text: `Sit until ${PHASE_NAME[S.phaseOf(nextPhaseAt())]}`, pick: () => sit(nextPhaseAt() + 5) },
    { text: 'Get up', pick: () => null },
  ] });
  const sit = (until: number): Scene => {
    const day = S.dayOf(st.minutes);
    st.minutes = until; st.stats.sits++; dirty = true;
    let extra = '';
    if (!st.flags[`sat-${day}`]) { S.setFlag(st, `sat-${day}`); deps?.addGlow(250); extra = ' Mote settles on the armrest and is a little brighter for it.'; }
    emit({ type: 'sfx', name: 'rest' });
    everySecond();
    const ph = S.phaseOf(st.minutes);
    return say('A bench', `${ph === 'night' ? 'The lamps come on one at a time, as if being counted.' : ph === 'dawn' ? 'The sky goes the colour of milk in tea.' : ph === 'dusk' ? 'The shadows all lean the same way, then a little further.' : 'The street gets on with being a street.'} It is ${S.clockText(st.minutes)}.${extra}`);
  };
  const bus = (here: string): Scene => {
    const ph = S.phaseOf(st.minutes), free = S.has(st, 'bus-pass');
    if (ph === 'night') return say('Bus stop', 'The last bus has gone. The timetable says so in a different hand each night.');
    const known = PLACES.filter((p) => p.stop && p.id !== here && st.places.includes(p.id));
    if (!known.length) return say('Bus stop', 'The 4. It only goes to stops you have found on foot. You have found this one.');
    return { who: 'Bus stop', text: `The 4 ${ph === 'dusk' ? 'is on its last run' : 'comes when you look away'}. ${free ? 'Your pass rides free.' : `One coin a ride. You have ${st.coins}.`}`, choices: [
      ...known.map((p) => ({ text: p.name, off: !free && st.coins < 1, pick: (): Scene => {
        if (!free && st.coins < 1) return say('Bus stop', 'Carrow looks at your empty hand, kindly, and shuts the doors.');
        if (!free) st.coins--;
        const t = nearestOpen(map, p.at[0], p.at[1] - 1);
        st.x = t[0] * TILE + 8; st.y = t[1] * TILE + 8; st.minutes += 20; st.stats.rides++; dirty = true;
        if (ph === 'dusk' && p.id === 'stop-mere') S.setFlag(st, 'last-bus');
        emit({ type: 'sfx', name: 'door' }); emit({ type: 'moved' });
        everySecond();
        const after = checkConds();
        return after ?? say('The 4', `${p.name}. The doors fold shut behind you and the bus is already small.`);
      } })),
      { text: 'Not today', pick: () => null },
    ] };
  };
  const EPITAPH = ['AGNES, WHO WAITED', 'A CHILD OF THIS PARISH. KEPT.', 'T. SULL. HE DREW SQUARES.', 'HERE LIES NOTHING. THE STONE IS ENOUGH.', 'ADA THURSDAY AND, IN TIME, HER DOG', 'RETURNED TO SENDER', 'ELEVEN OF LOWMERE, UNDER OTHER WATER', 'THE NAME HAS BEEN POLISHED OFF, CAREFULLY'];
  const interact = (tx: number, ty: number): Scene | null => {
    const a = actorAt(tx, ty);
    if (a) { emit({ type: 'sfx', name: 'whisper' }); return a.kind === 'rival' ? talkRival(a) : a.kind === 'npc' ? talkNpc(a) : say('', 'It watches you come, and goes on ahead.'); }
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return null;
    const i = ty * W + tx, t = map.tiles[i]!;
    if (t === T.GATE) { const g = map.gate[i]!; return g > 0 && gateState[g] === 0 ? say('', GATES[g - 1]!.shut) : null; }
    const pl = PLACES.find((p) => p.at[0] === tx && p.at[1] === ty);
    if (t === T.SIGN) return say('A sign', pl?.sign ?? 'The paint has gone. Only the screws are left, very bright.');
    if (t === T.BENCH) return bench();
    if (t === T.STOP) return bus(pl?.id ?? '');
    if (t === T.DOOR) {
      emit({ type: 'sfx', name: 'door' });
      if (tx === 62 && ty === 55) return { who: 'Your front door', text: 'Home. The hall light is on. Along the Row are the other doorsteps, and the kids who sit on them.', choices: [
        { text: 'Go in (your room)', pick: () => { emit({ type: 'go', to: 'bedroom' }); return null; } },
        { text: 'The doorsteps (the old list of doors)', pick: () => { emit({ type: 'go', to: 'outside' }); return null; } },
        { text: 'Stay out', pick: () => null },
      ] };
      const d = map.doors.find((k) => k.x === tx && k.y === ty), keeper = NPCS.find((n) => n.shop && SHOPS.find((s) => s.id === n.shop)?.name === d?.label);
      if (keeper?.shop) return shopScene(keeper.shop, keeper.name);
      const ph = S.phaseOf(st.minutes), n = map.noise[i]! % 4;
      const lines = ph === 'night' ? ['A light is on upstairs. A small one, the size of a box lid.', 'Dark. Something inside is ticking that is not a clock.', 'The letterbox lifts a little, and lowers.', 'Nobody. The mat says WELCOME and has been turned to face in.']
        : ['Nobody answers. A curtain moves.', 'A radio is on, between stations.', 'The bell rings somewhere much further in than the house goes.', 'A milk bottle on the step, with a note in it. The note is blank.'];
      return say(d?.label ?? 'A door', lines[n]!);
    }
    if (t === T.WATER || t === T.DEEP || t === T.REED) {
      const sp = PLACES.find((p) => p.skim && Math.abs(p.at[0] - tx) + Math.abs(p.at[1] - ty) <= 5);
      if (sp) return { who: sp.name, text: 'Flat water. A good stone by your shoe.', skim: sp.id };
      return say('', ty > 134 ? 'Lowmere. Flat, and darker than its depth explains.' : 'The creek. It runs the same way whichever bank you stand on.');
    }
    if (t === T.GRAVE) return say('A stone', `${EPITAPH[map.noise[i]! % EPITAPH.length]!}.`);
    if (t === T.MAST) return say('The mast', 'It hums in your teeth. The dish at the top points down.');
    if (t === T.PIT) return say('The pit', S.phaseOf(st.minutes) === 'night' ? 'Lights, a long way down, laid out in streets.' : 'By day it is only dark. It is the wrong sort of dark for a hole.');
    if (t === T.CHURCH || t === T.WINDOW) return say('', t === T.CHURCH ? 'St Orrin\'s. The clock has one hand. It is right more often than you would think.' : 'You look in. Somebody has just left the room.');
    if (t === T.CROP || t === T.SOIL) return say('', 'Beans, mostly. They turn their leaves to the mast, not the sun.');
    if (t === T.STUMP) return say('A stump', 'Rings. You count them and get a different number each time.');

    if (t === T.SHED) return say('A shed', 'Padlocked. Through the gap: seed trays, twine, a child\'s shoe.');
    for (const n of actors) if (n.here && !n.moving && Math.abs(n.x - (tx * TILE + 8)) < 26 && Math.abs(n.y - (ty * TILE + 8)) < 26) return interact(n.tx, n.ty);
    return null;
  };
  const actorAt = (tx: number, ty: number): Actor | null => {
    for (const a of actors) if (a.here && Math.abs(a.x - (tx * TILE + 8)) < 10 && Math.abs(a.y - (ty * TILE + 8)) < 10) return a;
    return null;
  };
  const moved = (tx: number, ty: number): Scene | null => {
    let out: Scene | null = null;
    st.stats.steps++;
    if (S.markSeen(st, tx, ty)) dirty = true;
    const d = DISTRICTS[map.district[ty * W + tx]!]!;
    if (!st.districts.includes(d.id)) { st.districts.push(d.id); dirty = true; emit({ type: 'district', id: d.id, name: d.name, says: d.says }); }
    for (const p of PLACES) {
      if (st.places.includes(p.id) || p.sign || p.bench || Math.abs(p.at[0] - tx) > 2 || Math.abs(p.at[1] - ty) > 2) continue;
      st.places.push(p.id); dirty = true; emit({ type: 'place', id: p.id, name: p.name });
      if (p.hidden) { st.coins += 2; emit({ type: 'note', title: 'A hidden place', text: `${p.name}. Two coins, in a place nobody would look.` }); }
    }
    for (const f of finds) {
      if (f.taken || f.x !== tx || f.y !== ty) continue;
      f.taken = true; st.found.push(f.id); dirty = true;
      const k = COLLECT.find((c) => c.id === f.kind)!;
      const have = foundOf(k.id);
      if (k.id === 'penny') st.coins += 1 + (map.noise[ty * W + tx]! % 3);
      emit({ type: 'sfx', name: 'pickup' });
      emit({ type: 'find', kind: k.id, name: k.one, have, of: k.count });
      if (have >= k.count) { const got = give(k.reward); out = say(k.name, withGot(k.says, got)); }
    }
    for (const q of QUESTS) {
      const step = stepOf(q);
      if (!step || step.on.type !== 'reach') continue;
      const on = step.on, r = on.r ?? 1;
      if (Math.abs(on.at[0] - tx) > r || Math.abs(on.at[1] - ty) > r || !test(on.need)) continue;
      const got = advance(q);
      refreshActors();
      if (on.say) out = say(q.name, withGot(on.say, got));
    }
    const c = checkConds();
    return out ?? c;
  };
  const everySecond = (): void => {
    if (deps) { try { facts = deps.facts(); } catch { /* keep the last facts */ } }
    refreshGates(); refreshActors();
  };
  let pending: Scene | null = null;

  const town: Town = {
    map, get state() { return st; }, set state(v: TownState) { st = v; }, actors, finds, pathX, pathY,
    bind: (d) => { deps = d; everySecond();
      // A universe that was owed while the Box was full.
      for (const k of Object.keys(st.flags)) if (k.startsWith('owed-') && st.flags[k]) { const name = d.addUniverse(k.slice(5)); if (name) { delete st.flags[k]; dirty = true; emit({ type: 'note', title: 'From the pit', text: `There is room now. ${name} is in your Box.` }); } }
    },
    on: (cb) => { subs.push(cb); return () => { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); }; },
    facts: () => facts,
    tick: (dt) => {
      st.minutes += (dt / 1000) * 2;
      slow += dt; saveIn += dt;
      if (slow >= 1000) {
        slow = 0; everySecond();
        const ph = S.phaseOf(st.minutes);
        if (ph !== lastPhase) { lastPhase = ph; emit({ type: 'note', title: S.clockText(st.minutes), text: ph === 'night' ? 'Night. The lamps are lit. The gates are shut.' : ph === 'dusk' ? 'Dusk. The kids are called in, one name at a time.' : ph === 'dawn' ? 'Dawn. The shutters go up on the Parade.' : 'Day. The Row is itself again.' }); }
        const s = checkConds(); if (s) pending = s;
      }
      moveActors(dt, st.minutes * 500);
      if (saveIn >= 3000) { saveIn = 0; if (dirty) { dirty = false; S.store(st); } }
    },
    phase: () => S.phaseOf(st.minutes), dark: () => S.darkOf(st.minutes), weather: () => S.weatherOf(st.minutes),
    blocked, gateOpen: (i) => gateState[i + 1] === 1, path,
    moved: (tx, ty) => { const s = moved(tx, ty) ?? pending; pending = null; return s; },
    actorAt, interact,
    pop: () => { const s = pending; pending = null; return s; },
    skimDone: (placeId, skips) => {
      const day = S.dayOf(st.minutes);
      st.skim.throws++; dirty = true;
      let text = skips <= 0 ? 'Plop. One ring, widening.' : skips < 4 ? `${skips} skip${skips === 1 ? '' : 's'}. The water takes it.` : skips < 7 ? `${skips} skips. A good one.` : `${skips} skips. On the last it seemed to climb.`;
      if (skips > st.skim.best) { st.skim.best = skips; text += ' Your best yet.'; }
      if (skips >= 7) S.setFlag(st, 'skim-7');
      if (skips >= 4 && st.skim.day !== day) { st.skim.day = day; const c = Math.min(6, skips - 2); st.coins += c; text += ` Something glints where it sank and washes in: ${c} coins. (Once a day.)`; emit({ type: 'coins', n: c }); }
      const after = checkConds();
      return { who: PLACES.find((p) => p.id === placeId)?.name ?? 'The water', text, choices: [{ text: 'Another stone', pick: () => ({ who: '', text: 'You pick another.', skim: placeId }) }, { text: 'Enough', pick: () => after }] };
    },
    quests: () => QUESTS.filter((q) => qstate(q.id)).map((q) => { const s = qstate(q.id)!; return { def: q, st: s, hint: s.done ? q.end : q.steps[s.stage]!.hint }; }),
    lead: () => {
      let pick: QuestDef | null = null;
      for (const q of QUESTS) { if (!stepOf(q)) continue; if (!pick || (q.thread === 'main' && pick.thread !== 'main')) pick = q; }
      if (!pick) {
        const offer = QUESTS.find((q) => q.thread === 'main' && !qstate(q.id) && test(q.needs));
        const g = offer ? actors.find((a) => a.id === offer.giver) : null;
        return offer ? { name: offer.name, hint: `${NPCS.find((n) => n.id === offer.giver)?.name ?? 'Someone'} wants a word.`, at: g?.here ? [g.tx, g.ty] : null } : null;
      }
      const step = stepOf(pick)!;
      let at: readonly [number, number] | null = step.mark ?? null;
      if (!at && step.on.type === 'reach') at = step.on.at;
      if (!at && step.on.type === 'talk') { const npc = step.on.npc; const a = actors.find((x) => x.id === npc); const def = NPCS.find((n) => n.id === npc); at = a?.here ? [a.tx, a.ty] : (def?.at.day ?? def?.at.night ?? def?.at.dusk ?? null) as readonly [number, number] | null; }
      return { name: pick.name, hint: step.hint, at };
    },
    use: (id) => {
      const it = item(id);
      if (it.kind !== 'food' || !S.has(st, id)) return it.desc;
      S.addItem(st, id, -1); deps?.addGlow(it.value ?? 50); dirty = true; emit({ type: 'sfx', name: 'heal' });
      return `${it.name}. Mote brightens a little, as if it had been you who was hungry.`;
    },
    districtAt: (tx, ty) => DISTRICTS[map.district[Math.max(0, Math.min(H - 1, ty)) * W + Math.max(0, Math.min(W - 1, tx))]!]!.name,
    save: () => { dirty = false; S.store(st); },
    reset: () => { st = S.fresh(); syncFinds(); everySecond(); S.store(st); },
    test, setMinutes: (m) => { st.minutes = m; dirty = true; everySecond(); },
  };
  return town;
};

let shared: Town | null = null;
/** The one town of this page. */
export const town = (): Town => shared ?? (shared = create());
export const factory = (): Town => town();
