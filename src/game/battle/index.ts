// Battles on the bedroom layer (game/battle). Pure and seeded.
import type { BattlesFactory, Fighter, Rival, BattleState, BattleAction, BattleLogLine, Element } from '@/contracts/battle';
import type { UniverseSpec } from '@/contracts/universe';
import { child, rng, hashString } from '@/core/hash';

const ELEMENT_OF: Record<string, Element> = {
  'first-light': 'void', 'cold-fire': 'cold', 'slow-time': 'void', 'salt-tide': 'tide',
  'tallow-bloom': 'bloom', 'glass-rain': 'fire', 'ash-choir': 'fire', 'pale-moss': 'bloom',
};
// Each element beats the next: fire > bloom > stone > tide > cold > fire. Void is even with all.
const CYCLE: Element[] = ['fire', 'bloom', 'stone', 'tide', 'cold'];
export const advantage = (a: Element, b: Element): number => {
  if (a === 'void' || b === 'void') return 1;
  const i = CYCLE.indexOf(a), j = CYCLE.indexOf(b);
  if ((i + 1) % 5 === j) return 1.5;
  if ((j + 1) % 5 === i) return 0.67;
  return 1;
};

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
    const s = child(seed, `rival-${id}`);
    const g = rng(s);
    const n = id < 2 ? 2 : 3;
    return { ...r, id, level: id + 1, serials: Array.from({ length: n }, () => g.int(0x1000000)) };
  });

  const fighter = (spec: UniverseSpec, st: Parameters<ReturnType<BattlesFactory>['fighter']>[1], slot: number): Fighter => {
    const souls = st?.souls ?? 0, era = st?.era ?? 0, enl = st?.enlightenment ?? 0;
    const might = 8 + Math.floor(souls / 6) + era * 6 + (st?.worldsTended ?? 0);
    const depth = 4 + Math.floor((st?.deepestFold ?? 0) / 2);
    const radiance = 4 + Math.floor((st?.lightFromGlow ?? 0) / 40) + Math.floor(enl / 10) * 2;
    const maxHp = 30 + might * 2 + depth;
    return { serialNumber: spec.serialNumber, name: spec.name, element: ELEMENT_OF[spec.laws.id] ?? 'stone', might, depth, radiance, maxHp, hp: maxHp, ward: 0, slot };
  };

  const alive = (fs: readonly Fighter[]) => fs.findIndex((f) => f.hp > 0);
  const roll = (st: BattleState, salt: string) => rng(child(child(seed, `battle-${st.rival.id}`), `${st.turn}-${salt}`));

  const hit = (atk: Fighter, def: Fighter, base: number, g: ReturnType<typeof rng>) => {
    const spread = 80 + g.int(41);
    let dmg = Math.round((base * advantage(atk.element, def.element) * spread) / 100);
    if (def.ward > 0) dmg = Math.round(dmg / 2);
    return Math.max(1, dmg);
  };

  const doAction = (st: BattleState, side: 'you' | 'them', action: BattleAction, target: number | undefined, log: BattleLogLine[]): BattleState => {
    const mineSide = side === 'you';
    const us = [...(mineSide ? st.mine : st.theirs)];
    const them = [...(mineSide ? st.theirs : st.mine)];
    let ai = mineSide ? st.myActive : st.theirActive;
    const di = mineSide ? st.theirActive : st.myActive;
    const a = us[ai]!, d = them[di]!;
    const g = roll(st, side + action);
    const say = (text: string) => log.push({ side, text });
    if (action === 'swap' && target !== undefined && us[target] && us[target]!.hp > 0 && target !== ai) {
      ai = target;
      say(`${us[ai]!.name} steps forward.`);
    } else if (action === 'shine') {
      const heal = Math.round(a.radiance * 1.6 + 4);
      us[ai] = { ...a, hp: Math.min(a.maxHp, a.hp + heal), ward: 2 };
      say(`${a.name} shines. Its worlds sing it whole (+${heal}) and it is warded.`);
    } else if (action === 'fold') {
      const crit = g.int(100) < Math.round((a.depth * 100) / (a.depth + 30));
      const dmg = hit(a, d, a.depth * (crit ? 2.6 : 1.3), g);
      them[di] = { ...d, hp: Math.max(0, d.hp - dmg) };
      say(crit ? `${a.name} folds into itself and strikes from ${a.depth} layers down. ${dmg}!` : `${a.name} folds and strikes from inside for ${dmg}.`);
    } else {
      const dmg = hit(a, d, a.might, g);
      them[di] = { ...d, hp: Math.max(0, d.hp - dmg) };
      const adv = advantage(a.element, d.element);
      say(`${a.name} throws its ${a.element === 'void' ? 'weight' : a.element} at ${d.name} for ${dmg}${adv > 1 ? '. It burns through.' : adv < 1 ? '. It barely lands.' : '.'}`);
    }
    // Wards fade on the actor's side each of its turns.
    for (let i = 0; i < us.length; i++) if (i !== ai || action !== 'shine') us[i] = { ...us[i]!, ward: Math.max(0, us[i]!.ward - (i === ai ? 1 : 0)) };
    let next: BattleState = mineSide
      ? { ...st, mine: us, theirs: them, myActive: ai }
      : { ...st, theirs: us, mine: them, theirActive: ai };
    // Knockouts.
    const ko = (fs: readonly Fighter[], idx: number, who: 'you' | 'them') => {
      if (fs[idx]!.hp > 0) return idx;
      log.push({ side: 'world', text: `${fs[idx]!.name} goes dark.` });
      const n = alive(fs);
      if (n >= 0) log.push({ side: who, text: `${fs[n]!.name} rises to fight.` });
      return n;
    };
    const mi = ko(next.mine, next.myActive, 'you');
    const ti = ko(next.theirs, next.theirActive, 'them');
    next = { ...next, myActive: Math.max(0, mi), theirActive: Math.max(0, ti) };
    if (ti < 0) next = { ...next, outcome: 'won' };
    else if (mi < 0) next = { ...next, outcome: 'lost' };
    return next;
  };

  const rivalChoice = (st: BattleState): BattleAction => {
    const me = st.theirs[st.theirActive]!, foe = st.mine[st.myActive]!;
    const g = roll(st, 'ai');
    if (me.hp < me.maxHp * 0.35 && me.ward === 0 && g.chance(2, 3)) return 'shine';
    if (advantage(me.element, foe.element) < 1) {
      const better = st.theirs.findIndex((f, i) => i !== st.theirActive && f.hp > 0 && advantage(f.element, foe.element) > 1);
      if (better >= 0 && g.chance(1, 2)) return 'swap';
    }
    return me.depth > me.might && g.chance(2, 3) ? 'fold' : g.chance(1, 4) ? 'fold' : 'strike';
  };

  return {
    rivals: () => rivals,
    fighter,
    rivalTeam: (rival, specOf) => rival.serials.map((serial) => {
      const spec = specOf(serial);
      const g = rng(child(spec.seed, `rival-${rival.id}-${hashString(rival.name)}`));
      const lvl = rival.level;
      const might = 5 + lvl * 4 + g.int(4), depth = 3 + lvl * 3 + g.int(4), radiance = 3 + lvl * 2 + g.int(3);
      const maxHp = 20 + lvl * 4 + might * 2 + depth;
      return { ...fighter(spec, undefined, -1), might, depth, radiance, maxHp, hp: maxHp };
    }),
    start: (rival, mine, theirs) => ({
      rival,
      mine,
      theirs: theirs.length ? theirs : [],
      myActive: Math.max(0, alive(mine)),
      theirActive: 0,
      turn: 0,
      log: [{ side: 'them', text: `${rival.name}: "${rival.taunt}"` }],
      outcome: 'ongoing',
    }),
    act: (st, action, target) => {
      if (st.outcome !== 'ongoing') return st;
      const log: BattleLogLine[] = [];
      let next = doAction(st, 'you', action, target, log);
      if (next.outcome === 'ongoing') {
        const ra = rivalChoice(next);
        const better = next.theirs.findIndex((f, i) => i !== next.theirActive && f.hp > 0 && advantage(f.element, next.mine[next.myActive]!.element) > 1);
        next = doAction(next, 'them', ra, ra === 'swap' ? better : undefined, log);
      }
      if (next.outcome === 'won') log.push({ side: 'world', text: `${st.rival.name} goes quiet. Their box is open to you.` });
      if (next.outcome === 'lost') log.push({ side: 'world', text: 'Your box falls dark. Mote pulls you home.' });
      return { ...next, turn: st.turn + 1, log: [...st.log, ...log].slice(-30) };
    },
    refresh: (st, slot, fresh) => ({
      ...st,
      mine: st.mine.map((f) => {
        if (f.slot !== slot) return f;
        const lost = f.maxHp - f.hp;
        return { ...fresh, hp: Math.max(1, Math.min(fresh.maxHp, fresh.maxHp - lost)), ward: f.ward };
      }),
      log: [...st.log, { side: 'world' as const, text: `${fresh.name} comes back changed.` }].slice(-30),
    }),
    flee: (st) => ({ ...st, outcome: 'fled', log: [...st.log, { side: 'you' as const, text: 'You shut the box and run.' }] }),
  };
};

