// The life of the player's body: standing with each village, the things a body can do where
// they apply, needs and weather, followers, the creed that can form about it, and how it ends.
// Every roll is the civ unit's stateless dice (planet seed + tick + salt), so a life replays
// exactly. What lasts beyond a body (standing, tallies, the creed, a hunt) lives in W.body and
// so in the snapshot; what belongs to one life lives on the avatar and dies with it.
import type { Belief, BodyAction, BodyOption, BodyRole, BodyStanding, BuildingKind, CivEvent, StandingLevel, SurfaceEnv } from '@/contracts/sim';
import { BELIEFS, FIELD } from '@/contracts/sim';

/** The parts of a village the body reads and writes (a structural subset of the civ unit's V). */
export type BV = {
  id: number; x: number; y: number; souls: number; tech: number; belief: Belief; food: number; mood: number; scores: number[]; progress: number; starving: boolean;
  wealth?: number; goods?: number; enl?: number; creed?: number; ruler?: number; plague?: number; plagueDead?: number;
  workK?: number; workT?: number; inv?: number; hardT?: number; raidedT?: number; tributeTo?: number; heretic?: number; hereticT?: number; hereticCause?: number; dreadT?: number; festUntil?: number; songOf?: number;
};
export type BRel = { s: number; pact?: boolean; ally?: boolean; rival?: boolean; war?: number; warCause?: number; lastWar?: number };
export type BP = { x: number; home: number; role: number; fol?: number; wait: number };
/** One life. */
export type Life = {
  bornT: number; hunger: number; tired: number; wound: number; sickT: number; role: number; offer: number; fol: number; folHome: number;
  cd: Record<string, number>; log: string[]; d: number[]; carry?: { from: number; to: number; kind: number }; pack: number; packFrom: number;
  met: Record<string, number>; threat: number; expo: number; shelter: boolean; courted: number; workT: number; how: number;
};
/** What outlives a body. */
export type BodyWorld = {
  st: Record<string, { s: number; d: number[] }>; lives: number; d: number[]; creed: number; creedN: number; schT: number;
  hunt?: { v: number; until: number };
};
export type BA = { x: number; y: number; hp: number; b?: Life };
export const newBodyWorld = (): BodyWorld => ({ st: {}, lives: 0, d: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], creed: 0, creedN: 0, schT: 0 });
const newLife = (tick: number): Life => ({ bornT: tick, hunger: 10, tired: 0, wound: 0, sickT: 0, role: 0, offer: 0, fol: 0, folHome: 0, cd: {}, log: [], d: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], pack: 0, packFrom: 0, met: {}, threat: 0, expo: 0, shelter: false, courted: 0, workT: -9999, how: 1 });

// Deed tallies, by index: what a village (and the world) remembers of the body.
const HELPED = 0, PREACHED = 1, HEALED = 2, FOUGHT = 3, STOLE = 4, FLED = 5, PEACE = 6, HARM = 7, WORKED = 8, TAUGHT = 9;
const REMEMBER = ['fed and helped them', 'spoke to them', 'healed their sick', 'shed their blood', 'stole from them', 'ran from them', 'carried their peace', 'brought them harm', 'worked beside them', 'taught them'];
const ROLES: (BodyRole | null)[] = [null, 'healer', 'envoy', 'prophet'];
const GRACE = 1200;
/** Body event codes carried in CivEvent.detail for kind 'body'. src/sim/chronicle/body.ts keeps the same numbers. */
export const B = { recognised: 1, heal: 2, work: 3, trade: 4, teach: 5, peace: 6, refused: 7, incite: 8, tributeEnd: 9, tributeKept: 10, stood: 11, stoodFell: 12, silenced: 13, mocked: 14, sided: 15, bless: 16, curse: 17, vigil: 18, bury: 19, deliver: 21, found: 22, role: 23, thief: 25, follow: 26, creed: 27, spread: 28, schism: 29, court: 30, hunt: 31, death: 32, ascend: 33, fled: 34, fever: 35 } as const;

export const levelOf = (s: number): StandingLevel => (s <= -40 ? 'hunted' : s <= -10 ? 'shunned' : s < 25 ? 'tolerated' : s < 60 ? 'welcome' : 'followed');

export interface Host<V extends BV, P extends BP> {
  vs(): V[];
  people(): P[];
  bw(): BodyWorld;
  tick(): number;
  era(): number;
  dice(salt: number, n: number): number;
  relOf(a: V, b: V): BRel;
  warOf(v: V): V | undefined;
  has(v: V, k: BuildingKind): boolean;
  trait(v: V): number;
  startPlague(v: V, cause: number, other: number, events: CivEvent[]): void;
  newCreed(belief: Belief): number;
  addCreed(id: number, belief: Belief): void;
  takeCreed(dst: V, src: V): void;
  foundVillage(x: number, belief: Belief, tech: number, souls: number, creed: number): V | null;
  ruins(): { x: number; id: number; t: number }[];
  resettle(ruin: { x: number; id: number }): void;
  worldInv(): number;
  ground(): Int16Array;
  wet(x: number): boolean;
  attackers(): number;
  emit(e: CivEvent): void;
  roles: { attack: number; kneel: number; watch: number; idle: number };
}

export const makeBody = <V extends BV, P extends BP>(h: Host<V, P>) => {
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  const st = (v: BV | undefined) => (v ? h.bw().st[v.id]?.s ?? 0 : 0);
  const known = (v: BV) => h.bw().st[v.id] !== undefined;
  const enl = (v: BV) => v.enl ?? 0;
  const sick = (v: BV) => (v.plague ?? 0) > h.tick();
  const hunted = () => { const k = h.bw().hunt; return k && k.until > h.tick() ? k.v : 0; };
  const nearest = (x: number, not?: BV): V | undefined => {
    let best: V | undefined;
    for (const v of h.vs()) if (v !== not && (!best || Math.abs(v.x - x) < Math.abs(best.x - x))) best = v;
    return best;
  };
  const E = (code: number, v: { id: number; x: number; y: number; belief?: Belief }, extra: Partial<CivEvent> = {}) =>
    h.emit({ kind: 'body', tick: h.tick(), villageId: v.id, x: v.x, y: v.y, detail: code, ...(v.belief ? { belief: v.belief } : {}), ...extra });
  const say = (L: Life, line: string) => { if (L.log[L.log.length - 1] !== line) L.log.push(line); if (L.log.length > 14) L.log.shift(); };
  /** Change how a village stands toward the body, and remember why. */
  const gain = (L: Life | undefined, v: BV, n: number, deed = -1) => {
    const w = h.bw();
    const e = (w.st[v.id] ??= { s: 0, d: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    e.s = clamp(e.s + n, -100, 100);
    if (deed >= 0) { e.d[deed] = (e.d[deed] ?? 0) + 1; w.d[deed] = (w.d[deed] ?? 0) + 1; if (L) L.d[deed] = (L.d[deed] ?? 0) + 1; }
  };
  const top = (d: number[]) => { let k = 0; for (let i = 1; i < d.length; i++) if ((d[i] ?? 0) > (d[k] ?? 0)) k = i; return k; };
  const creedAlive = () => { const c = h.bw().creed; return !!c && h.vs().some((v) => v.creed === c); };
  const formCreed = (v: V, deed: number): number => {
    const w = h.bw();
    const id = 1024 + 16 * w.creedN++ + deed;
    h.addCreed(id, 'sky');
    v.belief = 'sky'; v.creed = id;
    for (let k = 0; k < v.scores.length; k++) v.scores[k] = BELIEFS[k] === 'sky' ? 90 : 0;
    w.creed = id;
    E(B.creed, v, { creed: id, cause: deed, belief: 'sky' });
    return id;
  };
  const endWar = (a: V, b: V) => { const rl = h.relOf(a, b); rl.war = 0; rl.lastWar = h.tick(); rl.s = Math.max(rl.s, -30); };

  /** How a village's people meet the body. keep is how far off they stand. */
  const stance = (v: V | undefined): number => {
    if (!v) return h.roles.idle;
    const base = enl(v) >= 100 ? h.roles.kneel : enl(v) >= 50 ? h.roles.watch : h.roles.attack;
    if (hunted() === v.id) return h.roles.attack;
    if (!known(v)) return base;
    const s = st(v);
    if (s >= 60) return h.roles.kneel;
    if (s >= 25) return h.roles.watch;
    if (s <= -40) return h.roles.attack;
    if (s <= -10) return base === h.roles.kneel ? h.roles.watch : base;
    if (s >= 8 && base === h.roles.attack) return h.roles.watch;
    return base;
  };
  const keepOf = (v: V | undefined, role: number) => (role === h.roles.kneel ? 2 : role === h.roles.watch ? (st(v) >= 25 ? 4 : st(v) <= -10 ? 20 : 12) : 0);

  type Opt = { id: BodyAction; ok: boolean; why?: string; does: string; v?: V };
  const CD: Partial<Record<BodyAction, number>> = { heal: 160, work: 120, trade: 80, teach: 600, plead: 400, incite: 800, petition: 600, stand: 600, challenge: 600, side: 600, blessHarvest: 1200, curseHarvest: 1200, vigil: 300, bury: 400, eat: 200, steal: 200, preach: 60 };

  /** Everything that applies where the body stands. The same list drives the view and act(), so the page never lies. */
  const offers = (a: BA): Opt[] => {
    const L = a.b;
    if (!L) return [];
    const out: Opt[] = [];
    const tick = h.tick();
    const v = nearest(a.x);
    const d = v ? Math.abs(v.x - a.x) : 999;
    const near = !!v && d <= 40;
    const atk = h.attackers();
    const s = st(v);
    const role = L.role;
    out.push({ id: 'strike', ok: atk > 0, why: 'No one is striking you.', does: 'Fell the two nearest attackers. The rest run, and they will remember the blood.' });
    out.push({ id: 'preach', ok: true, does: near ? 'Speak. Those near sit and listen, and they think a little better of you.' : 'Speak. There is no one near to hear.' });
    out.push({ id: 'gift', ok: near && a.hp > 10, why: !near ? 'There is no village near enough to feed.' : 'You have too little of yourself left to give.', does: 'Give of your own body: bread and joy for the nearest village. They do not forget it.' });
    out.push({ id: 'shine', ok: a.hp > 6, why: 'You are too faint to shine.', does: 'Show your light. The wise sit down before it; the rest flee and hold it against you.' });
    out.push({ id: 'rest', ok: atk === 0, why: 'You cannot rest while they strike you.', does: L.shelter ? 'Sleep under a roof that welcomes you. Wounds close and weariness lifts.' : 'Mend yourself a little. A welcoming village would let you sleep properly.' });
    if (!v || !near) {
      if (L.carry) out.push({ id: 'deliver', ok: false, why: 'The one it is meant for is not here.', does: 'Hand over what you carry.' });
      const ru = h.ruins().find((q) => Math.abs(q.x - a.x) <= 25);
      if (ru) out.push({ id: 'bury', ok: true, does: 'Bury the dead of this ruin. Good ground will be lived on again.' });
      const need = role === 3 ? 3 : 5;
      if (L.fol > 0) out.push({ id: 'found', ok: L.fol >= need && d > 45 && h.vs().length < 12 && !h.wet(a.x), why: L.fol < need ? `You need ${need} followers. You have ${L.fol}.` : d <= 45 ? 'This is too near another village.' : h.wet(a.x) ? 'Not in the water.' : 'The world is full.', does: 'Stop here. Those who follow you will build, and call it home.' });
      if (L.offer) out.push({ id: 'role', ok: true, does: `Accept what they ask: be their ${ROLES[L.offer]}.` });
      return out;
    }
    const calm = atk === 0;
    const foe = h.warOf(v);
    const others = h.vs().filter((o) => o !== v);
    // Heal.
    const hurt = tick - (v.raidedT ?? -99999) < 1600 || tick - (v.hardT ?? -99999) < 800;
    if (sick(v) || hurt) out.push({ id: 'heal', ok: calm && s > -40, why: !calm ? 'Not while they strike you.' : 'They will not let you near their sick.', v, does: sick(v) ? `Sit with the sick. The fever leaves sooner${role === 1 ? '' : ', and may take hold of you'}.` : 'Bind their wounded. One who would have died will not.' });
    // Work.
    out.push({ id: 'work', ok: calm && s > -40, why: !calm ? 'Not while they strike you.' : 'They would not let you near the fields.', v, does: v.workK ? 'Carry stone for the great work. It is finished sooner, and they feed the hands that help.' : 'Work a field beside them. Their stores grow, and they feed the hands that help.' });
    // Trade.
    const sell = L.pack > 0 && L.packFrom !== v.id;
    if (sell || (v.goods ?? 0) > 0 || h.has(v, 'market')) out.push({ id: 'trade', ok: calm && s > -10 && (sell || ((v.goods ?? 0) > 0 && L.pack < 3)), why: !calm ? 'Not while they strike you.' : s <= -10 ? 'They will not deal with you.' : L.pack >= 3 ? 'Your pack is full, and these are their own goods.' : 'They have nothing to sell today.', v, does: sell ? 'Sell what you carry from elsewhere. Coin for them, bread for you, and the road between the two grows kinder.' : 'Take their goods on trust, to sell in another village.' });
    // Teach.
    const lack = h.worldInv() & ~(v.inv ?? 0);
    if (lack || v.tech < 8) out.push({ id: 'teach', ok: calm && (s >= 8 || role === 3), why: !calm ? 'Not while they strike you.' : 'They do not trust you enough to learn from you.', v, does: lack ? 'Show them a thing another village already knows.' : 'Show them what comes next. Their age turns sooner.' });
    // The ruler.
    if (v.ruler) {
      if (foe) out.push({ id: 'plead', ok: calm && s > -40, why: !calm ? 'Not while they strike you.' : 'The hall is shut to you.', v, does: 'Ask the ruler for peace. The better they know you, the likelier it is heard.' });
      const target = others.filter((o) => !h.warOf(o) && h.relOf(v, o).s < 30).sort((p, q) => h.relOf(v, p).s - h.relOf(v, q).s || p.id - q.id)[0];
      if (!foe && target) out.push({ id: 'incite', ok: calm && s > -10, why: !calm ? 'Not while they strike you.' : 'The ruler will not hear you.', v, does: 'Whisper to the ruler of an old wrong. If it takes, there will be war, and the other side will know who spoke.' });
    }
    const lord = v.tributeTo ? h.vs().find((o) => o.id === v.tributeTo) : undefined;
    const payer = h.vs().find((o) => o.tributeTo === v.id);
    if (lord || payer) out.push({ id: 'petition', ok: calm && s > -40, why: !calm ? 'Not while they strike you.' : 'They will not hear a petition from you.', v, does: lord ? 'Carry their plea against the tribute. It rests on how the ones who take it think of you.' : 'Ask the ruler to forgive the tribute they are owed.' });
    if (foe) out.push({ id: 'stand', ok: a.hp > 30, why: 'You are too hurt to stand in front of spears.', v, does: 'Stand between the two armies. They may lower their spears. They may not.' });
    if (v.heretic) {
      out.push({ id: 'challenge', ok: calm && s > -40, why: !calm ? 'Not while they strike you.' : 'No one here would listen to you.', v, does: 'Answer the heretic in front of everyone. Win, and the old creed holds.' });
      out.push({ id: 'side', ok: calm && s > -40, why: !calm ? 'Not while they strike you.' : 'No one here would listen to you.', v, does: 'Stand beside the heretic. The creed splits today, and those who keep the old one will not forgive it.' });
    }
    out.push({ id: 'blessHarvest', ok: a.hp > 12, why: 'You have too little of yourself left to give.', v, does: 'Lay your light on their fields. A fat harvest, paid for out of your body.' });
    out.push({ id: 'curseHarvest', ok: true, v, does: 'Sour their fields. They go hungry, and they will know whose hand it was.' });
    if (h.has(v, 'shrine')) out.push({ id: 'vigil', ok: calm && s > -10, why: !calm ? 'Not while they strike you.' : 'They would not have you at their shrine.', v, does: 'Keep a night at their shrine. It rests you, and they understand you a little more.' });
    const dead = tick - (v.raidedT ?? -99999) < 2400 ? 1 : (v.plagueDead ?? 0) > 0 ? 2 : 0;
    if (dead) out.push({ id: 'bury', ok: calm && s > -40, why: !calm ? 'Not while they strike you.' : 'They will bury their own.', v, does: dead === 2 ? 'Bury those the fever took. It spreads less. It may reach you.' : 'Bury those the raiders left. Grief is lighter when it is shared.' });
    if (L.carry) {
      const here = L.carry.to === v.id;
      const gone = !h.vs().some((o) => o.id === L.carry!.to);
      out.push({ id: 'deliver', ok: here || gone, why: 'This is not the village it is meant for.', v, does: gone ? 'There is no one left to receive it. Lay it down.' : 'Hand over what you carry, in the name of the ones who sent it.' });
    } else if (others.length) out.push({ id: 'carry', ok: calm && s > -10, why: !calm ? 'Not while they strike you.' : 'They would not trust you with anything.', v, does: foe ? 'Offer to carry words of peace to their enemy.' : 'Offer to carry something to another village for them.' });
    if (L.fol > 0) out.push({ id: 'found', ok: false, why: 'This is too near another village.', does: 'Stop somewhere empty. Those who follow you will build.' });
    if (L.offer) out.push({ id: 'role', ok: true, v, does: `Accept what they ask: be their ${ROLES[L.offer]}.` });
    const fed = s >= 25 || tick - L.workT < 400;
    out.push({ id: 'eat', ok: calm && fed && v.food > 30, why: !calm ? 'Not while they strike you.' : v.food <= 30 ? 'They have nothing to spare.' : 'They do not set a place for you. Work beside them first, or be welcome.', v, does: 'Eat at their table.' });
    out.push({ id: 'steal', ok: v.food > 20, why: 'There is nothing worth taking.', v, does: 'Take bread from their stores. If you are seen, they will not forget it.' });
    return out;
  };

  const waitOf = (L: Life, id: BodyAction) => Math.max(0, (L.cd[id] ?? 0) - h.tick());

  const options = (a: BA): BodyOption[] => {
    const L = a.b;
    if (!L) return [];
    return offers(a).map((o) => {
      const wait = waitOf(L, o.id);
      return { id: o.id, ready: o.ok && wait === 0, wait, does: o.does, ...(o.ok ? {} : { reason: o.why ?? 'Not here.' }), ...(o.v ? { villageId: o.v.id } : {}) };
    });
  };

  /** Do a deed. Returns false if it was not one of ours, or could not be done. */
  const act = (a: BA, id: BodyAction): boolean => {
    const L = a.b;
    if (!L) return false;
    const o = offers(a).find((q) => q.id === id);
    if (!o || !o.ok || waitOf(L, id) > 0) return false;
    const tick = h.tick();
    const v = o.v;
    const role = L.role;
    const cd = CD[id];
    if (cd) L.cd[id] = tick + cd;
    const others = v ? h.vs().filter((q) => q !== v) : [];
    const s = st(v);
    switch (id) {
      case 'heal': {
        if (!v) break;
        if (sick(v)) {
          v.plague = Math.max(tick + 1, (v.plague ?? 0) - (role === 1 ? 240 : 120));
          if (!L.sickT && h.dice(920, role === 1 ? 12 : 4) === 0) { L.sickT = tick + 600; say(L, 'Took the fever from the sick'); }
          E(B.heal, v, { cause: 1 });
        } else { v.mood = Math.min(100, v.mood + 10); v.souls += 1; E(B.heal, v, { cause: 2 }); }
        gain(L, v, role === 1 ? 16 : 10, HEALED); L.tired = Math.min(100, L.tired + 6);
        say(L, 'Healed the sick');
        break;
      }
      case 'work': {
        if (!v) break;
        if (v.workK) { v.workT = (v.workT ?? tick) - 160; E(B.work, v, { cause: 2, count: v.workK - 1 }); say(L, 'Carried stone for a great work'); }
        else { v.food = Math.min(999, v.food + 40); E(B.work, v, { cause: 1 }); say(L, 'Worked a field'); }
        gain(L, v, 4, WORKED); L.workT = tick; L.hunger = Math.max(0, L.hunger - 15); L.tired = Math.min(100, L.tired + 10);
        break;
      }
      case 'trade': {
        if (!v) break;
        if (L.pack > 0 && L.packFrom !== v.id) {
          L.pack--; v.wealth = Math.min(999, (v.wealth ?? 0) + 20); L.hunger = Math.max(0, L.hunger - 25);
          const from = h.vs().find((q) => q.id === L.packFrom);
          if (from) { const rl = h.relOf(v, from); rl.s = clamp(rl.s + 6, -100, 100); from.wealth = Math.min(999, (from.wealth ?? 0) + 8); }
          gain(L, v, 3, HELPED); E(B.trade, v, from ? { other: from.id } : {}); say(L, 'Sold goods from another village');
        } else { v.goods = Math.max(0, (v.goods ?? 0) - 1); v.wealth = Math.min(999, (v.wealth ?? 0) + 4); L.pack++; L.packFrom = v.id; say(L, 'Took goods to sell elsewhere'); }
        break;
      }
      case 'teach': {
        if (!v) break;
        const lack = h.worldInv() & ~(v.inv ?? 0);
        if (lack) { let k = 0; while (!((lack >> k) & 1)) k++; v.inv = (v.inv ?? 0) | (1 << k); E(B.teach, v, { cause: 1, count: k }); }
        else { v.progress += 60; E(B.teach, v, { cause: 2 }); }
        gain(L, v, 8, TAUGHT); say(L, 'Taught them something new');
        break;
      }
      case 'plead': {
        const foe = v && h.warOf(v);
        if (!v || !foe) break;
        const t = h.trait(v);
        if (h.dice(930, 100) < 35 + (s >> 1) + (role === 2 ? 25 : 0) + (t === 0 ? 15 : t === 1 ? -15 : 0)) {
          endWar(v, foe); gain(L, v, 10, PEACE); gain(L, foe, 10, PEACE);
          E(B.peace, v, { other: foe.id, who: v.ruler! }); say(L, 'Asked for peace, and was heard');
        } else { gain(L, v, -5); E(B.refused, v, { other: foe.id, who: v.ruler! }); say(L, 'Asked for peace, and was refused'); }
        break;
      }
      case 'incite': {
        if (!v) break;
        const target = others.filter((q) => !h.warOf(q) && h.relOf(v, q).s < 30).sort((p, q) => h.relOf(v, p).s - h.relOf(v, q).s || p.id - q.id)[0];
        if (!target) break;
        if (h.dice(931, 100) < 30 + (s >> 1) + (h.trait(v) === 1 ? 25 : 0)) {
          const rl = h.relOf(v, target);
          rl.war = tick; rl.warCause = 0; rl.pact = false; rl.ally = false; rl.rival = true; rl.s = Math.min(rl.s, -70);
          gain(L, target, -20, HARM); gain(L, v, 0, HARM);
          E(B.incite, v, { other: target.id, who: v.ruler! }); say(L, 'Talked a ruler into war');
        } else { gain(L, v, -8); say(L, 'Whispered of war, and was sent away'); }
        break;
      }
      case 'petition': {
        if (!v) break;
        const lord = v.tributeTo ? h.vs().find((q) => q.id === v.tributeTo) : v;
        const payer = v.tributeTo ? v : h.vs().find((q) => q.tributeTo === v.id);
        if (!lord || !payer) break;
        if (h.dice(932, 100) < 30 + (st(lord) >> 1) + (role === 2 ? 30 : 0)) {
          payer.tributeTo = 0; const rl = h.relOf(lord, payer); rl.s = clamp(rl.s + 10, -100, 100);
          gain(L, payer, 20, PEACE); gain(L, lord, 2, PEACE);
          E(B.tributeEnd, payer, { other: lord.id }); say(L, 'Ended a tribute');
        } else { gain(L, lord, -4); E(B.tributeKept, payer, { other: lord.id }); say(L, 'Asked for a tribute to end, and was refused'); }
        break;
      }
      case 'stand': {
        const foe = v && h.warOf(v);
        if (!v || !foe) break;
        if (h.dice(933, 100) < 25 + L.fol * 5 + ((s + st(foe)) >> 2) + (role === 3 ? 15 : 0)) {
          endWar(v, foe); gain(L, v, 15, PEACE); gain(L, foe, 15, PEACE);
          E(B.stood, v, { other: foe.id }); say(L, 'Stood between two armies. They went home');
        } else {
          a.hp -= 25; L.wound = Math.min(60, L.wound + 10); L.how = 6;
          gain(L, v, 5, PEACE); gain(L, foe, 5, PEACE);
          E(B.stoodFell, v, { other: foe.id }); say(L, 'Stood between two armies, and was cut down');
        }
        break;
      }
      case 'challenge': {
        if (!v || !v.heretic) break;
        const who = v.heretic;
        if (h.dice(934, 100) < 40 + Math.floor(s / 3) + (role === 3 ? 25 : 0)) { v.heretic = 0; gain(L, v, 10, PREACHED); E(B.silenced, v, { who, ...(v.creed ? { creed: v.creed } : {}) }); say(L, 'Answered a heretic, and won'); }
        else { v.hereticT = (v.hereticT ?? tick) - 200; gain(L, v, -8); E(B.mocked, v, { who }); say(L, 'Answered a heretic, and lost'); }
        break;
      }
      case 'side': {
        if (!v || !v.heretic) break;
        const who = v.heretic, old = v.creed ?? 0, cause = v.hereticCause ?? 0;
        v.heretic = 0;
        v.creed = h.newCreed(v.belief);
        for (const q of others) if (old && q.creed === old && Math.abs(q.x - v.x) <= 130) { const rl = h.relOf(v, q); rl.s = clamp(rl.s - 30, -100, 100); gain(L, q, -15, HARM); }
        v.songOf = 7;
        h.emit({ kind: 'schism', tick, villageId: v.id, x: v.x, y: v.y, who, creed: v.creed, detail: old, belief: v.belief, cause });
        gain(L, v, 6, PREACHED); E(B.sided, v, { who, creed: v.creed }); say(L, 'Stood beside a heretic');
        break;
      }
      case 'blessHarvest': if (v) { a.hp -= 6; v.food = Math.min(999, v.food + 120); v.mood = Math.min(100, v.mood + 8); gain(L, v, 8, HELPED); E(B.bless, v); say(L, 'Blessed a harvest'); } break;
      case 'curseHarvest': if (v) { v.food = Math.max(0, v.food - 150); v.mood -= 15; v.dreadT = tick; v.enl = Math.max(0, enl(v) - 5); gain(L, v, -25, HARM); E(B.curse, v); say(L, 'Cursed a harvest'); } break;
      case 'vigil': if (v) { L.tired = Math.max(0, L.tired - 25); v.mood = Math.min(100, v.mood + 4); v.enl = Math.min(100, enl(v) + 3); gain(L, v, 3, PREACHED); E(B.vigil, v); say(L, 'Kept a night at a shrine'); } break;
      case 'bury': {
        if (!v) {
          const ru = h.ruins().find((q) => Math.abs(q.x - a.x) <= 25);
          if (!ru) break;
          h.resettle(ru);
          const w = h.bw(); w.d[HELPED] = (w.d[HELPED] ?? 0) + 1; L.d[HELPED] = (L.d[HELPED] ?? 0) + 1;
          E(B.bury, { id: ru.id, x: ru.x, y: a.y }, { cause: 3 }); say(L, 'Buried the dead of a ruin');
          break;
        }
        const plague = (v.plagueDead ?? 0) > 0 && !(tick - (v.raidedT ?? -99999) < 2400);
        if (plague) { v.plagueDead = 0; if (sick(v)) v.plague = Math.max(tick + 1, (v.plague ?? 0) - 80); if (!L.sickT && h.dice(921, role === 1 ? 15 : 5) === 0) { L.sickT = tick + 600; say(L, 'Took the fever from the dead'); } }
        else v.raidedT = tick - 2400;
        v.mood = Math.min(100, v.mood + 12); gain(L, v, 10, HELPED); E(B.bury, v, { cause: plague ? 2 : 1 }); say(L, 'Buried their dead');
        break;
      }
      case 'carry': {
        if (!v) break;
        const foe = h.warOf(v);
        const byDist = [...others].sort((p, q) => Math.abs(p.x - v.x) - Math.abs(q.x - v.x) || p.id - q.id);
        const ill = !sick(v) ? byDist.find((q) => sick(q)) : undefined;
        const hungry = v.food > 200 ? byDist.find((q) => q.starving || q.food < 80) : undefined;
        const to = foe ?? ill ?? hungry ?? byDist[0];
        if (!to) break;
        const kind = foe ? 1 : ill ? 3 : hungry ? 2 : 4;
        if (kind === 2) v.food -= 60;
        if (kind === 4) v.goods = Math.max(0, (v.goods ?? 0) - 1);
        L.carry = { from: v.id, to: to.id, kind };
        gain(L, v, 2);
        say(L, ['', 'Took words of peace to carry', 'Took grain to carry', 'Took medicine to carry', 'Took goods and a greeting to carry'][kind]!);
        break;
      }
      case 'deliver': {
        const c = L.carry;
        if (!c) break;
        L.carry = undefined;
        const to = h.vs().find((q) => q.id === c.to), from = h.vs().find((q) => q.id === c.from);
        if (!to) { say(L, 'Laid down what could not be delivered'); break; }
        if (from) {
          const rl = h.relOf(from, to);
          rl.s = clamp(rl.s + [0, 30, 20, 20, 12][c.kind]!, -100, 100);
          if (c.kind === 1 && rl.war && h.dice(935, 100) < 50 + (role === 2 ? 25 : 0)) endWar(from, to);
          gain(L, from, 6, PEACE);
        }
        if (c.kind === 2) to.food = Math.min(999, to.food + 100);
        if (c.kind === 3 && sick(to)) to.plague = Math.max(tick + 1, (to.plague ?? 0) - 200);
        if (c.kind === 4) { to.wealth = Math.min(999, (to.wealth ?? 0) + 25); to.goods = Math.min(99, (to.goods ?? 0) + 2); }
        gain(L, to, 12, c.kind === 1 || c.kind === 4 ? PEACE : HELPED);
        L.hunger = Math.max(0, L.hunger - 10);
        E(B.deliver, to, { other: c.from, cause: c.kind, count: from && !h.relOf(from, to).war ? 1 : 0 }); say(L, 'Delivered what was carried');
        break;
      }
      case 'found': {
        const home = h.vs().find((q) => q.id === L.folHome);
        const mine = creedAlive() ? h.bw().creed : 0;
        const nv = h.foundVillage(a.x, mine ? 'sky' : home?.belief ?? 'none', Math.max(0, (home?.tech ?? 1) - 1), 4 + L.fol, mine || (home?.creed ?? 0));
        if (!nv) break;
        if (home) h.relOf(nv, home).s = 40;
        gain(L, nv, 80, HELPED);
        for (const p of h.people()) if (p.fol) { p.fol = 0; p.home = nv.id; p.wait = 0; }
        E(B.found, nv, { count: L.fol, ...(home ? { other: home.id } : {}), ...(mine ? { creed: mine } : {}) });
        L.fol = 0; say(L, 'Founded a village');
        break;
      }
      case 'role': {
        if (!L.offer) break;
        L.role = L.offer; L.offer = 0;
        const nv = nearest(a.x);
        if (nv) { gain(L, nv, 5); E(B.role, nv, { cause: L.role }); }
        say(L, `Became a ${ROLES[L.role]}`);
        break;
      }
      case 'eat': if (v) { v.food -= 4; L.hunger = Math.max(0, L.hunger - 50); say(L, 'Ate at their table'); } break;
      case 'steal': {
        if (!v) break;
        v.food = Math.max(0, v.food - 20); L.hunger = Math.max(0, L.hunger - 40);
        const night = h.dice(941, 2) === 0;
        if (h.dice(940, night ? 5 : 2) === 0) { gain(L, v, -30, STOLE); E(B.thief, v); say(L, 'Stole bread, and was seen'); }
        else { const w = h.bw(); w.d[STOLE] = (w.d[STOLE] ?? 0) + 1; L.d[STOLE] = (L.d[STOLE] ?? 0) + 1; say(L, 'Stole bread, unseen'); }
        break;
      }
      default: return false;
    }
    return true;
  };

  /** What the five old actions leave behind in memory. Called by the civ unit after it has done them. */
  const noted = (a: BA, id: BodyAction, hit: boolean) => {
    const L = a.b;
    if (!L) return;
    const v = nearest(a.x);
    const near = !!v && Math.abs(v.x - a.x) <= 45;
    if (id === 'strike' && hit && v) { gain(L, v, -15, FOUGHT); say(L, 'Struck down those who came at you'); }
    else if (id === 'preach' && near && v) { gain(L, v, L.role === 3 ? 5 : st(v) >= 0 ? 2 : 1, PREACHED); say(L, 'Spoke to them'); }
    else if (id === 'gift' && hit && v) { gain(L, v, 10, HELPED); L.hunger = Math.min(100, L.hunger + 8); say(L, 'Gave bread from your own body'); }
    else if (id === 'shine' && near && v) { if (enl(v) >= 30) gain(L, v, 3, PREACHED); else gain(L, v, -4, HARM); say(L, 'Showed your light'); }
    else if (id === 'rest' && hit) {
      a.hp = Math.min(100 - L.wound, a.hp);
      L.tired = Math.max(0, L.tired - 30);
      if (L.shelter) { L.tired = 0; L.wound = Math.max(0, L.wound - 10); say(L, 'Slept under a welcoming roof'); }
    }
  };

  const born = (a: BA) => { a.b = newLife(h.tick()); h.bw().lives++; };
  const hit = (a: BA, n: number, home: number) => { const L = a.b; if (L) { L.wound = Math.min(60, L.wound + (n > 1 ? 2 : 1)); L.how = 1; L.threat = home || nearest(a.x)?.id || 0; } };

  /** The end of a life, told by how it was lived. how: 1 killed, 2 hunger, 3 cold, 4 fever, 5 storm, 6 between the spears. */
  const death = (a: BA, by?: V) => {
    const L = a.b;
    if (!L) return;
    const good = L.d[HELPED]! + L.d[HEALED]! + L.d[PEACE]! + L.d[WORKED]! + L.d[TAUGHT]! + L.d[PREACHED]!;
    const bad = L.d[FOUGHT]! + L.d[STOLE]! + L.d[HARM]!;
    const kind = bad >= 3 && bad > good ? 2 : good >= 4 ? 1 : 3;
    // A martyr is mourned where it was loved; anything else is told by those who saw it end.
    const loved = kind === 1 ? h.vs().filter((q) => st(q) >= 25).sort((p, q) => st(q) - st(p) || p.id - q.id)[0] : undefined;
    const v = loved ?? by ?? nearest(a.x);
    for (const q of h.vs()) {
      if (kind === 1 && st(q) >= 25) { gain(undefined, q, 15); q.mood -= 10; q.enl = Math.min(100, enl(q) + 10); }
      if (kind === 2 && st(q) <= -25) q.mood = Math.min(100, q.mood + 10);
    }
    if (v) E(B.death, v, { cause: kind, count: L.how, other: top(L.d) });
    else h.emit({ kind: 'body', tick: h.tick(), villageId: 0, x: a.x, y: a.y, detail: B.death, cause: 3, count: L.how });
    // Those who followed a martyr keep what it did.
    const home = h.vs().find((q) => q.id === L.folHome);
    if (kind === 1 && L.fol >= 1 && home && !creedAlive()) formCreed(home, top(h.bw().d));
    for (const p of h.people()) p.fol = 0;
    const w = h.bw();
    if (w.hunt) w.hunt.until = 0;
  };
  const ascend = (a: BA) => {
    const L = a.b;
    if (!L) return;
    const v = nearest(a.x);
    let sum = 0;
    for (const q of h.vs()) sum += st(q);
    if (v && (L.fol > 0 || Math.abs(sum) >= 25)) E(B.ascend, v, { cause: sum >= 0 ? 1 : 2, count: L.fol });
    for (const p of h.people()) p.fol = 0;
  };

  /** Every 20 ticks while a body walks: needs, weather, fever, meetings, followers, rulers. */
  const step = (a: BA, env: SurfaceEnv, events: CivEvent[]): boolean => {
    const L = a.b;
    if (!L) return true;
    const tick = h.tick();
    const grace = tick - L.bornT < GRACE;
    const v = nearest(a.x);
    const d = v ? Math.abs(v.x - a.x) : 999;
    const s = st(v);
    L.shelter = !!v && d <= 14 && (s >= 25 || (enl(v) >= 100 && s > -10)) && hunted() !== v.id;
    if (tick % 60 === 0) L.hunger = Math.min(100, L.hunger + 1);
    if (tick % 80 === 0) L.tired = Math.min(100, L.tired + 1);
    if (tick % 200 === 0 && L.wound > 0) L.wound = Math.max(0, L.wound - (L.shelter ? 3 : 1));
    const fy = Math.min(env.fieldH - 1, Math.max(0, (a.y / FIELD) | 0)), fx = Math.min(env.fieldW - 1, Math.max(0, (a.x / FIELD) | 0));
    const T = env.temp[fy * env.fieldW + fx] ?? 128;
    L.expo = L.shelter ? 0 : T < 100 ? 1 : env.rain > 150 && (env.lightning < 200 || Math.abs(env.wind) > 60) ? 2 : 0;
    if (L.sickT && tick >= L.sickT) { L.sickT = 0; say(L, 'The fever broke'); }
    const atk = h.attackers();
    if (!grace) {
      let hurt = 0, how = 0;
      if (L.hunger >= 100 ? tick % 40 === 0 : L.hunger >= 80 && tick % 80 === 0) { hurt++; how = 2; }
      if (L.tired >= 85 && tick % 160 === 0) hurt++;
      if (L.expo === 1 && tick % 40 === 0) { hurt++; how = 3; }
      if (L.expo === 2 && tick % 80 === 0) { hurt++; how = 5; }
      if (L.sickT && tick % (L.role === 1 ? 80 : 40) === 0) { hurt++; how = 4; }
      if (hurt) { a.hp -= hurt; if (how) L.how = how; }
    }
    if (!atk && L.hunger < 80 && !L.sickT && !L.expo && a.hp < 100 - L.wound && tick % 40 === 0) a.hp++;
    if (a.hp <= 0) return false;
    // Running from a fight is remembered too.
    if (L.threat && !atk) {
      const tv = h.vs().find((q) => q.id === L.threat);
      if (!tv) L.threat = 0;
      else if (Math.abs(tv.x - a.x) > 50) { L.threat = 0; gain(L, tv, -3, FLED); if (!L.met[`f${tv.id}`]) { L.met[`f${tv.id}`] = 1; E(B.fled, tv); } say(L, 'Ran from those who struck you'); }
    }
    if (!v || d > 45) return true;
    // The one who came before.
    if (!L.met[v.id]) {
      L.met[v.id] = 1;
      if (h.bw().lives > 1 && Math.abs(s) >= 15) { E(B.recognised, v, { cause: s > 0 ? 1 : 2 }); say(L, s > 0 ? 'Was known again, and welcomed' : 'Was known again, and feared'); }
    }
    // Fever passes both ways.
    if (!grace && !L.sickT && sick(v) && d <= 20 && h.dice(900, L.role === 1 ? 120 : 30) === 0) { L.sickT = tick + 600; say(L, 'Caught the fever'); }
    if (L.sickT && !sick(v) && d <= 12 && h.dice(901, 25) === 0) {
      const before = v.plague ?? 0;
      h.startPlague(v, 1, 0, events);
      if ((v.plague ?? 0) !== before) { gain(L, v, -10, HARM); E(B.fever, v); say(L, 'Carried the fever into a village'); }
    }
    // Followers gather where the body is loved, and drift home where it is not.
    if (s >= 60 && d <= 30 && L.fol < 12 && h.dice(902 + v.id, L.role === 3 ? 6 : 14) === 0) {
      L.fol++;
      if (!L.folHome || !h.vs().some((q) => q.id === L.folHome)) L.folHome = v.id;
      if (L.fol === 1 || L.fol === 4 || L.fol === 8) E(B.follow, v, { count: L.fol });
      say(L, L.fol === 1 ? 'One of them began to follow you' : `${L.fol} follow you now`);
    }
    const fh = h.vs().find((q) => q.id === L.folHome);
    if (L.fol > 0 && (!fh || st(fh) < 25) && tick % 200 === 0) L.fol--;
    if (L.fol > 0 && fh) {
      let tagged = 0;
      const ps = h.people();
      for (const p of ps) if (p.fol) tagged++;
      const want = Math.min(L.fol, 5);
      for (let i = 0; i < ps.length && tagged < want; i++) { const p = ps[i]!; if (!p.fol && p.home === fh.id && Math.abs(p.x - a.x) < 60) { p.fol = 1; tagged++; } }
      for (let i = 0; i < ps.length && tagged > want; i++) if (ps[i]!.fol) { ps[i]!.fol = 0; tagged--; }
      // A creed about the body, named for what it has mostly done.
      if (L.fol >= 3 && !creedAlive()) { const w = h.bw(); let n = 0; for (const k of w.d) n += k; if (n >= 5) { formCreed(fh, top(w.d)); say(L, 'A creed formed around you'); } }
    }
    // Roles are offered for what the body has actually done.
    if (!L.role && !L.offer) {
      const off = L.d[HEALED]! >= 2 ? 1 : L.d[PEACE]! >= 2 ? 2 : L.d[PREACHED]! >= 3 && L.fol >= 1 ? 3 : 0;
      if (off && s >= 8) { L.offer = off; say(L, `They ask you to be their ${ROLES[off]}`); }
    }
    // Rulers court what their people love and hunt what they fear.
    if (v.ruler && d <= 30) {
      const w = h.bw();
      if (s >= 50 && !L.courted) {
        L.courted = v.id; L.hunger = 0; L.tired = Math.max(0, L.tired - 30); gain(L, v, 5);
        if (!L.role && !L.offer) L.offer = 2;
        E(B.court, v, { who: v.ruler }); say(L, 'Was called to a ruler\'s table');
      } else if (!hunted() && L.role !== 2 && !grace) {
        const fears = h.trait(v) === 1 && creedAlive() && v.creed !== w.creed && L.fol >= 3 && s < 25;
        if (s <= -50 || fears) { w.hunt = { v: v.id, until: tick + 2400 }; E(B.hunt, v, { who: v.ruler, cause: fears ? 2 : 1 }); say(L, 'A ruler set hunters on you'); }
      }
    }
    return true;
  };

  /** Every 80 ticks, body or no body: memory fades, the creed about the body lives its own life. */
  const worldStep = (events: CivEvent[]) => {
    const w = h.bw();
    const tick = h.tick();
    const vs = h.vs();
    if (tick % 800 === 0) for (const k of Object.keys(w.st)) {
      const e = w.st[k]!;
      if (!vs.some((v) => String(v.id) === k)) { delete w.st[k]; continue; }
      if (e.s > 0) e.s--; else if (e.s < 0) e.s++;
    }
    if (w.hunt && w.hunt.until <= tick) w.hunt = undefined;
    const id = w.creed;
    if (!id) return;
    const holders = vs.filter((v) => v.creed === id);
    if (!holders.length) return;
    for (const hd of holders) for (const o of vs) {
      if (o.creed === id || Math.abs(o.x - hd.x) > 130 || h.warOf(o) === hd) continue;
      const odds = st(o) >= 30 ? 40 : h.relOf(hd, o).s >= 20 ? 240 : 0;
      if (odds && h.dice(910 + o.id * 31 + hd.id, odds) === 0) { h.takeCreed(o, hd); if (events.length < 24) events.push({ kind: 'body', tick, villageId: o.id, x: o.x, y: o.y, detail: B.spread, other: hd.id, creed: id, belief: 'sky' }); }
    }
    // A creed drawn from mixed deeds does not hold together for ever.
    if (holders.length >= 2 && tick - w.schT > 6400 && h.dice(911, 60) === 0) {
      const d = [...w.d];
      const first = id % 16;
      d[first] = -1;
      const second = top(d);
      if ((d[second] ?? 0) > 0) {
        w.schT = tick;
        const v = holders[holders.length - 1]!;
        const nid = 1024 + 16 * w.creedN++ + second;
        h.addCreed(nid, 'sky');
        v.creed = nid;
        for (const o of holders) if (o !== v) { const rl = h.relOf(v, o); rl.s = clamp(rl.s - 25, -100, 100); }
        if (events.length < 24) events.push({ kind: 'body', tick, villageId: v.id, x: v.x, y: v.y, detail: B.schism, creed: nid, cause: second, other: first, belief: 'sky' });
      }
    }
  };

  const standing = (): BodyStanding[] => {
    const w = h.bw();
    const out: BodyStanding[] = [];
    for (const v of h.vs()) {
      const e = w.st[v.id];
      if (!e) continue;
      const order = e.d.map((n, i) => [n, i] as const).filter((q) => q[0] > 0).sort((p, q) => q[0] - p[0] || p[1] - q[1]).slice(0, 3);
      out.push({ villageId: v.id, value: e.s, level: hunted() === v.id ? 'hunted' : levelOf(e.s), remembered: order.map((q) => REMEMBER[q[1]]!) });
    }
    return out.sort((p, q) => Math.abs(q.value) - Math.abs(p.value) || p.villageId - q.villageId).slice(0, 8);
  };
  const carrying = (L: Life) => {
    const parts: string[] = [];
    if (L.carry) parts.push(['', 'words of peace', 'grain', 'medicine', 'goods and a greeting'][L.carry.kind]!);
    if (L.pack) parts.push(`${L.pack} ${L.pack === 1 ? 'bundle' : 'bundles'} of goods to sell`);
    return parts.length ? parts.join(', and ') : null;
  };

  return { stance, keepOf, options, act, noted, born, hit, death, ascend, step, worldStep, standing, carrying, hunted, creedAlive, roleName: (n: number) => ROLES[n] ?? null };
};
