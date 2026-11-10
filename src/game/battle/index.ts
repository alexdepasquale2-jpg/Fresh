// Battles on the bedroom layer (game/battle). Pure and seeded: the same state and
// action always give the same next state.
import type { BattlesFactory, Fighter, Rival, BattleState, BattleAction, BattleLogLine, Element, Skill, Trait, Status, Hit } from '@/contracts/battle';
import type { UniverseSpec } from '@/contracts/universe';
import type { UniverseStats } from '@/contracts/game';
import { child, rng, hashString } from '@/core/hash';

type M<T> = { -readonly [K in keyof T]: T[K] };
type F = M<Omit<Fighter, 'status' | 'spent'>> & { status: M<Status>; spent: string[] };

const ELEMENT_OF: Record<string, Element> = {
  'first-light': 'void', 'cold-fire': 'cold', 'slow-time': 'void', 'salt-tide': 'tide',
  'tallow-bloom': 'bloom', 'glass-rain': 'fire', 'ash-choir': 'fire', 'pale-moss': 'bloom',
};
// Each element beats the next: fire > bloom > stone > tide > cold > fire. Void is even with all.
const CYCLE: Element[] = ['fire', 'bloom', 'stone', 'tide', 'cold'];
const advantage = (a: Element, b: Element): number => {
  if (a === 'void' || b === 'void') return 1;
  const i = CYCLE.indexOf(a), j = CYCLE.indexOf(b);
  if ((i + 1) % 5 === j) return 1.5;
  if ((j + 1) % 5 === i) return 0.67;
  return 1;
};

const STRIKE: Skill = { id: 'strike', name: 'Strike', cost: 0, desc: 'A plain blow by Might. Gathers 1 extra Light.' };
const FOLD: Skill = { id: 'fold', name: 'Fold', cost: 2, desc: 'Strikes from inside, by Depth. Can crit; always crits the exposed.' };
const SHINE: Skill = { id: 'shine', name: 'Shine', cost: 2, desc: 'Heals by Radiance, wards for 2 turns, clears burn and chill.' };
const ALIGN: Skill = { id: 'align', name: 'Alignment', cost: 5, desc: 'Everything in one line: a huge blow that empties their Light.' };
const ELEMENT_SKILL: Record<Element, Skill> = {
  fire: { id: 'kindle', name: 'Kindle', cost: 2, desc: 'Burns for 3 turns. Shatters the chilled for half again.' },
  cold: { id: 'rime', name: 'Rime', cost: 2, desc: 'Chills for 2 turns: slower and weaker. Quenches the burning for half again.' },
  tide: { id: 'undertow', name: 'Undertow', cost: 2, desc: 'Hits hard and drinks a third back. Turns the burning to steam: exposed.' },
  stone: { id: 'avalanche', name: 'Avalanche', cost: 2, desc: 'The heaviest blow. Breaks straight through wards.' },
  bloom: { id: 'overgrow', name: 'Overgrow', cost: 2, desc: 'A light blow; you regrow for 3 turns.' },
  void: { id: 'unmake', name: 'Unmake', cost: 2, desc: 'Leaves them exposed for 2 turns: every hit lands harder.' },
};
const ELEMENT_TRAIT: Record<Element, Trait> = {
  fire: { id: 'smoulder', name: 'Smoulder', desc: 'Your burns last a turn longer.' },
  cold: { id: 'stillness', name: 'Stillness', desc: 'Your chills last a turn longer.' },
  tide: { id: 'ebb', name: 'Ebb', desc: 'Heals a little every turn.' },
  stone: { id: 'bedrock', name: 'Bedrock', desc: 'The first hit it takes is halved.' },
  bloom: { id: 'rooted', name: 'Rooted', desc: 'Heals a little every turn; regrowth lasts longer.' },
  void: { id: 'hollow', name: 'Hollow', desc: 'Its Strike ignores Guard.' },
};
const T = {
  thriving: { id: 'thriving', name: 'Thriving', desc: 'Its colony prospers: more life.' },
  awake: { id: 'awake', name: 'Awake', desc: 'Its people are enlightened: starts with 3 Light.' },
  reaching: { id: 'reaching', name: 'Reaching', desc: 'Its worlds are in orbit: faster, and Alignment costs 4.' },
  lamplit: { id: 'lamplit', name: 'Lamplit', desc: 'An age of lamps: heals a quarter more.' },
  legion: { id: 'legion', name: 'Legion', desc: 'A hundred souls: more Might.' },
  fused: { id: 'fused', name: 'Fused', desc: 'Two universes in one.' },
} satisfies Record<string, Trait>;
const NO_STATUS: Status = { burn: 0, chill: 0, ward: 0, regen: 0, expose: 0 };

const RIVALS: Omit<Rival, 'id' | 'serials' | 'level'>[] = [
  { name: 'The twins next door', where: 'over the garden fence', taunt: 'Ours are bigger.' },
  { name: 'A girl in the attic', where: 'up the folding ladder', taunt: 'I found mine in the walls.' },
  { name: 'The boy under the stairs', where: 'behind the coats', taunt: 'Mine bite.' },
  { name: 'Someone in the garden shed', where: 'past the wet grass', taunt: 'Shut the door. They get out.' },
  { name: 'A kid by the canal', where: 'down the towpath', taunt: 'Mine came out of the water.' },
  { name: 'The old man at the window', where: 'across the street', taunt: 'I had a box like yours once.' },
  { name: 'The child in the cellar', where: 'down where it is cold', taunt: 'Mine are hungry.' },
  { name: 'Whoever lives in the lamp', where: 'inside the streetlight', taunt: 'Whose box do you think you are in?' },
];

export const factory: BattlesFactory = ({ seed }) => {
  const rivals: Rival[] = RIVALS.map((r, id) => {
    const g = rng(child(seed, `rival-${id}`));
    return { ...r, id, level: id + 1, serials: Array.from({ length: id < 2 ? 2 : 3 }, () => g.int(0x1000000)) };
  });
  const has = (f: Pick<Fighter, 'traits'>, id: string) => f.traits.some((t) => t.id === id);
  const costOf = (f: Pick<Fighter, 'traits'>, s: Skill) => (s.id === 'align' && has(f, 'reaching') ? 4 : s.cost);

  const fighter = (spec: UniverseSpec, st: UniverseStats | undefined, slot: number): Fighter => {
    const souls = st?.souls ?? 0, era = st?.era ?? 0, enl = st?.enlightenment ?? 0, pros = st?.prosperity ?? 0, orb = st?.orbiters ?? 0;
    const element = ELEMENT_OF[spec.laws.id] ?? 'stone';
    const traits: Trait[] = [ELEMENT_TRAIT[element]];
    if (pros >= 60) traits.push(T.thriving);
    if (enl >= 100) traits.push(T.awake);
    if (orb >= 3) traits.push(T.reaching);
    if (era >= 3) traits.push(T.lamplit);
    if (souls >= 100) traits.push(T.legion);
    const tr = (id: string) => traits.some((t) => t.id === id);
    const might = Math.round((8 + Math.floor(souls / 6) + era * 6 + (st?.worldsTended ?? 0)) * (tr('legion') ? 1.1 : 1));
    const depth = 4 + Math.floor((st?.deepestFold ?? 0) / 2);
    const radiance = 4 + Math.floor((st?.lightFromGlow ?? 0) / 40) + Math.floor(enl / 10) * 2;
    const maxHp = Math.round((30 + might * 2 + depth) * (tr('thriving') ? 1.15 : 1));
    return {
      serialNumber: spec.serialNumber, name: spec.name, element, might, depth, radiance,
      guard: Math.floor(pros / 8), speed: 5 + orb * 2 + Math.floor(depth / 6) + (tr('reaching') ? 4 : 0),
      maxHp, hp: maxHp, energy: tr('awake') ? 3 : 1, status: NO_STATUS,
      skills: [STRIKE, ELEMENT_SKILL[element], FOLD, SHINE, ALIGN], traits, guarding: false, spent: [], slot, fused: false,
    };
  };

  const copy = (f: Fighter): F => ({ ...f, status: { ...f.status }, spent: [...f.spent], skills: f.skills, traits: f.traits });
  const alive = (fs: readonly Fighter[]) => fs.findIndex((f) => f.hp > 0);

  /** The rival decides its next move from what it can see. */
  const plan = (st: Pick<BattleState, 'rival' | 'mine' | 'theirs' | 'myActive' | 'theirActive' | 'turn'>): BattleState['intent'] => {
    const me = st.theirs[st.theirActive]!, foe = st.mine[st.myActive]!;
    const g = rng(child(child(seed, `plan-${st.rival.id}`), st.turn));
    const el = me.skills[1]!;
    const skill = (s: Skill, hint: string): BattleState['intent'] => ({ action: { type: 'skill', id: s.id }, label: `${s.name}${hint ? ` (${hint})` : ''}` });
    if (me.energy >= costOf(me, ALIGN)) return skill(ALIGN, 'a huge blow');
    if (me.hp < me.maxHp * 0.35 && me.energy >= 2 && me.status.ward === 0 && g.chance(7, 10)) return skill(SHINE, 'heal and ward');
    const better = st.theirs.findIndex((f, i) => i !== st.theirActive && f.hp > 0 && advantage(f.element, foe.element) > 1);
    if (advantage(me.element, foe.element) < 1 && better >= 0 && g.chance(2, 5)) return { action: { type: 'swap', target: better }, label: `Swap to ${st.theirs[better]!.name}` };
    if (foe.energy >= 4 && g.chance(2, 5)) return { action: { type: 'guard' }, label: 'Guard' };
    if (me.energy >= 2 && g.chance(13, 20)) return me.depth > me.might && g.chance(1, 2) ? skill(FOLD, 'from inside') : skill(el, me.element);
    return skill(STRIKE, '');
  };

  const act = (st0: BattleState, action: BattleAction): BattleState => {
    const mine = st0.mine.map(copy), theirs = st0.theirs.map(copy);
    let myActive = st0.myActive, theirActive = st0.theirActive, fusedUsed = st0.fusedUsed;
    let outcome: BattleState['outcome'] = 'ongoing';
    const log: BattleLogLine[] = [];
    const hits: Hit[] = [];
    const g = rng(child(child(seed, `battle-${st0.rival.id}`), st0.turn));
    const team = (side: 'you' | 'them') => (side === 'you' ? mine : theirs);
    const activeOf = (side: 'you' | 'them') => team(side)[side === 'you' ? myActive : theirActive]!;
    const other = (side: 'you' | 'them') => (side === 'you' ? 'them' : 'you') as 'you' | 'them';

    const hurt = (side: 'you' | 'them', a: F, d: F, base: number, o: { pierce?: boolean; noGuard?: boolean; crit?: boolean; tag?: string } = {}) => {
      let dmg = base * advantage(a.element, d.element) * (90 + g.int(21)) / 100;
      if (a.status.chill > 0) dmg *= 0.75;
      if (d.status.expose > 0) dmg *= 1.4;
      if (d.status.ward > 0 && !o.pierce) dmg *= 0.5;
      if (d.guarding) dmg *= 0.5;
      if (has(d, 'bedrock') && !d.spent.includes('bedrock')) { dmg *= 0.5; d.spent.push('bedrock'); }
      if (!o.noGuard) dmg -= d.guard / 4;
      const n = Math.max(1, Math.round(dmg));
      d.hp = Math.max(0, d.hp - n);
      hits.push({ to: other(side), amount: n, crit: !!o.crit, heal: false, tag: o.tag ?? '' });
      return n;
    };
    const heal = (side: 'you' | 'them', f: F, amount: number, tag = '') => {
      const n = Math.max(0, Math.min(f.maxHp - f.hp, Math.round(amount * (has(f, 'lamplit') ? 1.25 : 1))));
      f.hp += n;
      if (n > 0) hits.push({ to: side, amount: n, crit: false, heal: true, tag });
      return n;
    };

    const perform = (side: 'you' | 'them', a0: BattleAction) => {
      if (outcome !== 'ongoing') return;
      const say = (text: string) => log.push({ side, text });
      const us = team(side);
      let me = activeOf(side);
      if (me.hp <= 0) return;
      me.guarding = false;
      if (a0.type === 'guard') { me.guarding = true; me.energy = Math.min(6, me.energy + 1); say(`${me.name} braces and gathers Light.`); return; }
      if (a0.type === 'swap') {
        const t = us[a0.target];
        if (!t || t.hp <= 0) return;
        if (side === 'you') myActive = a0.target; else theirActive = a0.target;
        say(`${t.name} steps forward.`);
        return;
      }
      if (a0.type === 'fuse') {
        const b = us[a0.target];
        if (!b || b.hp <= 0 || b === me || fusedUsed || side !== 'you') return;
        const [w1, w2] = [me.name.split(' ')[0]!, b.name.split(' ').slice(-1)[0]!];
        const name = w1 === w2 ? `${w1} Twice` : `${w1} ${w2}`;
        const extra = b.skills[1]!;
        const fusedF: F = {
          ...me, name, slot: -1, fused: true,
          might: Math.round((me.might + b.might) * 0.72), depth: Math.round((me.depth + b.depth) * 0.72), radiance: Math.round((me.radiance + b.radiance) * 0.72),
          guard: Math.max(me.guard, b.guard), speed: Math.max(me.speed, b.speed) + 1,
          maxHp: Math.round((me.maxHp + b.maxHp) * 0.82), hp: 0, energy: Math.min(6, me.energy + b.energy + 1),
          status: { ...NO_STATUS }, spent: [],
          skills: me.skills.some((s) => s.id === extra.id) ? me.skills : [me.skills[0]!, me.skills[1]!, extra, ...me.skills.slice(2)],
          traits: [...me.traits, ...b.traits.filter((t) => !me.traits.some((x) => x.id === t.id)), T.fused],
        };
        fusedF.hp = Math.min(fusedF.maxHp, me.hp + b.hp);
        const keep = us.filter((f) => f !== me && f !== b);
        us.length = 0;
        us.push(fusedF, ...keep);
        myActive = 0;
        fusedUsed = true;
        say(`${me.name} and ${b.name} fold into each other. ${name} opens its eyes.`);
        hits.push({ to: 'you', amount: fusedF.hp, crit: true, heal: true, tag: 'FUSED' });
        return;
      }
      const skill = me.skills.find((s) => s.id === a0.id) ?? STRIKE;
      const cost = costOf(me, skill);
      const use = me.energy >= cost ? skill : STRIKE;
      me.energy -= me.energy >= cost ? cost : 0;
      const d = activeOf(other(side));
      const adv = advantage(me.element, d.element);
      const tail = adv > 1 ? ' It burns through.' : adv < 1 ? ' It barely lands.' : '';
      me = activeOf(side);
      switch (use.id) {
        case 'strike': { const n = hurt(side, me, d, me.might, { noGuard: has(me, 'hollow') }); me.energy = Math.min(6, me.energy + 1); say(`${me.name} strikes ${d.name} for ${n}.${tail}`); break; }
        case 'kindle': { const sh = d.status.chill > 0; const n = hurt(side, me, d, me.might * 0.9 * (sh ? 1.5 : 1), { tag: sh ? 'SHATTER' : 'BURN', crit: sh }); if (sh) d.status.chill = 0; d.status.burn = has(me, 'smoulder') ? 4 : 3; say(sh ? `${me.name} sets the frost alight. ${d.name} shatters for ${n} and burns.` : `${me.name} kindles ${d.name} for ${n}. It burns.`); break; }
        case 'rime': { const q = d.status.burn > 0; const n = hurt(side, me, d, me.might * 0.8 * (q ? 1.5 : 1), { tag: q ? 'QUENCH' : 'CHILL', crit: q }); if (q) d.status.burn = 0; d.status.chill = has(me, 'stillness') ? 3 : 2; say(q ? `${me.name} quenches the fire in ${d.name} for ${n}. It goes still.` : `${me.name} rimes ${d.name} for ${n}. It slows.`); break; }
        case 'undertow': { const stm = d.status.burn > 0; const n = hurt(side, me, d, me.might * 1.1, { tag: stm ? 'STEAM' : '' }); heal(side, me, n / 3); if (stm) { d.status.burn = 0; d.status.expose = 2; } say(stm ? `${me.name} drags ${d.name} under for ${n}. Fire and water: it stands exposed in the steam.` : `${me.name} drags ${d.name} under for ${n} and drinks.`); break; }
        case 'avalanche': { const broke = d.status.ward > 0; const n = hurt(side, me, d, me.might * 1.3, { pierce: true, tag: broke ? 'BREAK' : '' }); say(`${me.name} comes down on ${d.name} for ${n}${broke ? ', straight through its ward' : ''}.${tail}`); break; }
        case 'overgrow': { const n = hurt(side, me, d, me.might * 0.6); me.status.regen = has(me, 'rooted') ? 4 : 3; say(`${me.name} grows over ${d.name} for ${n} and takes root.`); break; }
        case 'unmake': { const n = hurt(side, me, d, me.might, { tag: 'EXPOSE' }); d.status.expose = 2; say(`${me.name} unmakes part of ${d.name} for ${n}. It stands exposed.`); break; }
        case 'fold': { const crit = d.status.expose > 0 || g.int(100) < Math.round((me.depth * 100) / (me.depth + 30)); const n = hurt(side, me, d, me.depth * 1.5 * (crit ? 2 : 1), { crit, tag: crit ? 'CRIT' : '' }); say(crit ? `${me.name} folds and strikes from ${me.depth} layers down. ${n}!` : `${me.name} folds and strikes from inside for ${n}.`); break; }
        case 'shine': { const n = heal(side, me, me.radiance * 1.8 + 6, 'SHINE'); me.status.ward = 2; me.status.burn = 0; me.status.chill = 0; say(`${me.name} shines. Its worlds sing it whole (+${n}), and it is warded.`); break; }
        case 'align': { const n = hurt(side, me, d, (me.might + me.depth + me.radiance) * 0.85 + me.speed, { crit: true, tag: 'ALIGNMENT' }); d.energy = 0; say(`Every world in ${me.name} falls into one line. ${n}! ${d.name} loses its Light.`); break; }
      }
    };

    const settle = () => {
      if (outcome !== 'ongoing') return;
      const ko = (side: 'you' | 'them') => {
        const fs = team(side);
        const idx = side === 'you' ? myActive : theirActive;
        if (fs[idx]!.hp > 0) return;
        log.push({ side: 'world', text: `${fs[idx]!.name} goes dark.` });
        const n = alive(fs);
        if (n < 0) { outcome = side === 'you' ? 'lost' : 'won'; return; }
        if (side === 'you') myActive = n; else theirActive = n;
        log.push({ side, text: `${fs[n]!.name} rises to fight.` });
      };
      ko('them');
      if (outcome === 'ongoing') ko('you');
    };

    // Guarding, swapping and fusing are quick; otherwise the faster acts first.
    const quick = (a: BattleAction) => a.type !== 'skill';
    const spd = (f: F) => f.speed - (f.status.chill > 0 ? 5 : 0);
    const theirA = st0.intent.action;
    const first: 'you' | 'them' = quick(action) ? 'you' : quick(theirA) ? 'them' : spd(activeOf('you')) >= spd(activeOf('them')) ? 'you' : 'them';
    for (const side of [first, other(first)] as const) { perform(side, side === 'you' ? action : theirA); settle(); }
    // End of turn: burns bite, roots mend, statuses fade, Light gathers.
    if (outcome === 'ongoing') {
      for (const side of ['you', 'them'] as const) {
        const f = activeOf(side);
        if (f.status.burn > 0) { const n = Math.max(1, Math.round(3 + f.maxHp * 0.05)); f.hp = Math.max(0, f.hp - n); hits.push({ to: side, amount: n, crit: false, heal: false, tag: 'BURN' }); }
        if (f.hp > 0 && f.status.regen > 0) heal(side, f, f.maxHp * 0.06 + f.radiance / 3, 'REGROW');
        if (f.hp > 0 && (has(f, 'ebb') || has(f, 'rooted'))) heal(side, f, f.maxHp * 0.035);
        for (const k of ['burn', 'chill', 'ward', 'regen', 'expose'] as const) f.status[k] = Math.max(0, f.status[k] - 1);
        f.energy = Math.min(6, f.energy + 1);
      }
      settle();
    }
    const done = outcome as BattleState['outcome'];
    if (done === 'won') log.push({ side: 'world', text: `${st0.rival.name} goes quiet. Their box is open to you.` });
    if (done === 'lost') log.push({ side: 'world', text: 'Your box falls dark. Mote pulls you home.' });
    const next = { rival: st0.rival, mine, theirs, myActive, theirActive, turn: st0.turn + 1 };
    return { ...next, log: [...st0.log, ...log].slice(-30), hits, intent: done === 'ongoing' ? plan(next) : st0.intent, fusedUsed, outcome: done };
  };

  const can = (st: BattleState, a: BattleAction): boolean => {
    if (st.outcome !== 'ongoing') return false;
    const me = st.mine[st.myActive]!;
    if (a.type === 'guard') return true;
    if (a.type === 'swap') return a.target !== st.myActive && (st.mine[a.target]?.hp ?? 0) > 0;
    if (a.type === 'fuse') return !st.fusedUsed && a.target !== st.myActive && (st.mine[a.target]?.hp ?? 0) > 0;
    const s = me.skills.find((x) => x.id === a.id);
    return !!s && me.energy >= costOf(me, s);
  };

  return {
    rivals: () => rivals,
    fighter,
    advantage,
    can,
    rivalTeam: (rival, specOf) => rival.serials.map((serial) => {
      const spec = specOf(serial);
      const g = rng(child(spec.seed, `rival-${rival.id}-${hashString(rival.name)}`));
      const l = rival.level;
      return fighter(spec, {
        worldsTended: l, deepestFold: l * 6 + g.int(8), lightFromGlow: l * 45 + g.int(40), souls: l * 13 + g.int(14),
        era: Math.min(5, l >> 1), enlightenment: Math.min(100, l * 9 + (l >= 7 ? 40 : 0)), prosperity: Math.min(100, l * 9), orbiters: l > 5 ? l - 4 : 0,
      }, -1);
    }),
    start: (rival, mine, theirs) => {
      const base = { rival, mine, theirs, myActive: Math.max(0, alive(mine)), theirActive: 0, turn: 0 };
      return { ...base, log: [{ side: 'them', text: `${rival.name}: "${rival.taunt}"` }], hits: [], intent: plan(base), fusedUsed: false, outcome: 'ongoing' };
    },
    act: (st, action) => (can(st, action) ? act(st, action) : st),
    refresh: (st, slot, fresh) => ({
      ...st,
      mine: st.mine.map((f) => {
        if (f.slot !== slot || f.fused) return f;
        const lost = f.maxHp - f.hp;
        return { ...fresh, hp: Math.max(1, Math.min(fresh.maxHp, fresh.maxHp - lost)), energy: f.energy, status: f.status, spent: f.spent, guarding: f.guarding };
      }),
    }),
    flee: (st) => ({ ...st, outcome: 'fled', log: [...st.log, { side: 'you' as const, text: 'You shut the box and run.' }] }),
  };
};
