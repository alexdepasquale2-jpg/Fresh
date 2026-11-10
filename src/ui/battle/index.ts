// Outside and Battle screens (ui/battle). The bedroom layer: a ladder of other kids in
// four tiers, fights with your universes, weather, chains, relics, growth and a summary.
// Every universe shows as its creature (ui/creature): yours looks right, theirs looks left.
// Ladder progress, creature XP and relics live in localStorage under `sallow-ladder`
// (the app snapshot only holds rivalsBeaten).
import type { ScreenFactory, AppContext } from '@/contracts/app';
import type { Fighter, BattleAction, StatusKind, BattleReward, LevelInfo, Skill, Rival, Weather } from '@/contracts/battle';
import type { SkyPieceKind } from '@/contracts/sky';
import type { FoldNode } from '@/contracts/fold';
import { el, button, backChip, label, narration, tag, lightPips, glyphChar, shake, burst, flash, displayName, lightLabel, pieceCount, quote, curly } from '@/ui/kit';
import { creature, type Creature } from '@/ui/creature';
import './battle.css';

type Side = 'you' | 'them';
const other = (s: Side): Side => (s === 'you' ? 'them' : 'you');

/** What the ladder remembers between sessions. Keys are rival ids and universe serials. */
interface Ladder {
  v: 1; wins: Record<string, number>; xp: Record<string, number>; relics: string[]; held: Record<string, string>;
  /** The day (local, y-m-d) whose daily prize was taken. */
  daily?: { day: string; done: boolean };
  /** A gauntlet under way: the three ladder rivals and which door is next. */
  gauntlet?: { ids: number[]; stage: number };
  gauntlets?: number;
  /** Battle animation speed (1, 2 or 4) and whether auto-battle is on. */
  speed?: number; auto?: boolean;
}
const KEY = 'sallow-ladder';
const loadLadder = (): Ladder => {
  const blank: Ladder = { v: 1, wins: {}, xp: {}, relics: [], held: {} };
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Ladder> | null;
    if (j && j.v === 1) return { ...j, v: 1, wins: j.wins ?? {}, xp: j.xp ?? {}, relics: j.relics ?? [], held: j.held ?? {} };
  } catch { /* a broken save is an empty ladder */ }
  return blank;
};
const saveLadder = (l: Ladder): void => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* private mode: progress lasts the session */ } };

const grown = (c: AppContext, L: Ladder, base: Fighter): Fighter => {
  const relic = L.held[base.serialNumber];
  // A universe you have truly kept fights a little better for you, and shows it.
  const st = base.slot >= 0 ? c.box.slots()[base.slot]?.stats : undefined;
  const bond = st && c.box.bondOf ? c.box.bondOf(st) : undefined;
  const f = c.battles.grow ? c.battles.grow(base, { xp: L.xp[base.serialNumber] ?? 0, ...(relic ? { relic } : {}), ...(bond !== undefined ? { bond } : {}) }) : base;
  // A universe the player renamed in the Box fights under that name.
  const name = displayName(f.serialNumber, f.name);
  return name === f.name ? f : { ...f, name };
};
const power = (f: Fighter): number => f.maxHp + f.depth + f.radiance;
const team = (c: AppContext, L: Ladder): Fighter[] =>
  c.box.slots()
    .map((s, slot) => (s ? grown(c, L, c.battles.fighter(c.universes.fromSerial(s.serialNumber), s.stats, slot)) : null))
    .filter((f): f is Fighter => f !== null)
    // Strongest first; what a creature holds does not change who stands where.
    .sort((a, b) => power(b) - power(a) || a.slot - b.slot)
    .slice(0, 3);
const levelOf = (c: AppContext, xp: number): LevelInfo => c.battles.levelOf?.(xp) ?? { level: 1, into: 0, need: 1 };
const FORM = ['', 'first form', 'second form', 'third form'];
const dayKey = (): string => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const dayNumber = (): number => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); };
const RARITY_TIP: Record<string, string> = { uncommon: 'An uncommon universe: a little more Might and life.', rare: 'A rare universe: more Might and life, and a ring of light.', epic: 'An epic universe: a good deal more Might and life.', mythic: 'A mythic universe. One in a hundred. Much more of everything.' };
const bondChip = (c: AppContext, f: Fighter, id: string, say: (t: string) => void): HTMLElement | null =>
  (f.bond ?? 0) >= 25 ? chip('∞ BONDED', 'good bond', id, `Bonded (${c.box.bondName?.(f.bond ?? 0) ?? 'kept'}, ${f.bond} of 100): you have kept ${f.name} well, so it is ${Math.round((f.bond ?? 0) * 0.06)}% more of everything. Tend it, dive it, fight beside it.`, say) : null;

const portrait = (c: AppContext, f: Fighter, size: number, facing: 'left' | 'right' = 'right') =>
  creature(c.universes.fromSerial(f.serialNumber), f, { size, facing }).el;
const xpBar = (info: LevelInfo) => el('div', { class: 'xp', 'aria-label': `XP ${info.into} of ${info.need}` }, el('i', { style: `width:${Math.round((info.into / Math.max(1, info.need)) * 100)}%` }));
/** A small tappable chip that explains itself in the hint line. */
const chip = (text: string, cls: string, id: string, tip: string, say: (t: string) => void) => {
  const b = el('button', { class: `k-tag tip ${cls}`, type: 'button', 'data-id': id, 'aria-label': tip }, text);
  b.addEventListener('click', () => say(tip));
  return b;
};

/** The fight being fought: who earns XP, and what it paid once it ended. */
interface Summary {
  readonly won: boolean; readonly reward: BattleReward; readonly turns: number; readonly relicTo: string;
  /** A line about the mode (daily prize, gauntlet door), and whether another gauntlet door waits. */
  readonly note: string; readonly next: boolean;
  readonly rows: readonly { f: Fighter; before: LevelInfo; after: LevelInfo; learned: readonly Skill[]; form: number }[];
}
let roster: number[] = [];
let summary: Summary | null = null;

const outside: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  return {
    id: 'outside',
    mount: (root, c) => {
      ctx = c;
      const L = loadLadder();
      const all = c.battles.rivals();
      const wins = (id: number) => L.wins[id] ?? 0;
      const beat = (id: number) => wins(id) > 0 || c.rivalsBeaten.has(id);
      const relics = c.battles.relics?.() ?? [];
      let note = 'Win to climb. Every fight gives your creatures XP; bosses guard each tier.';
      // A gauntlet does not survive walking away from it.
      if (L.gauntlet && !c.battle) { delete L.gauntlet; saveLadder(L); }
      const begin = (r: Rival, mineNow: Fighter[]) => {
        roster = mineNow.map((f) => f.serialNumber);
        summary = null;
        c.audio.sfx(r.boss ? 'boss' : 'confirm');
        c.battle = c.battles.start(r, mineNow, c.battles.rivalTeam(r, (s) => c.universes.fromSerial(s)));
        c.go('battle');
      };
      let scroll = 0;
      // The team row whose relic is being asked about (-1: none). Taking one off or swapping it is asked first.
      let asking = -1;
      const render = () => {
        const mine = team(c, L);
        const say = (t: string) => { note = t; hint.textContent = t; };
        const hint = el('p', { class: 'k-label tool-hint', 'data-id': 'outside-hint' }, note);
        const done = all.filter((r) => beat(r.id)).length;
        const list = el('div', { class: 'rivals' });
        let tier = 0;
        for (const r0 of all) {
          const r = c.battles.rematch?.(r0, wins(r0.id)) ?? r0;
          const beaten = beat(r.id);
          const locked = r.id > 0 && !beat(r.id - 1) && !beaten;
          if ((r.tier ?? 1) !== tier) { tier = r.tier ?? 1; list.append(el('div', { class: 'tier-head k-label' }, `TIER ${tier} · ${(r.tierName ?? '').toUpperCase()}`)); }
          const theirs = locked ? [] : c.battles.rivalTeam(r, (s) => c.universes.fromSerial(s));
          const kind = r.boss === 'champion' ? 'CHAMPION' : r.boss ? 'BOSS' : '';
          list.append(el('section', { class: `rival${beaten ? ' beaten' : ''}${locked ? ' locked' : ''}${r.boss ? ' boss' : ''}`, 'data-rival': String(r.id) },
            el('div', { class: 'row' },
              el('span', { class: 'k-title small' }, locked ? (kind ? `??? (${kind.toLowerCase()})` : '???') : r.name),
              label(locked ? 'LOCKED' : `${kind ? `${kind} · ` : ''}LEVEL ${r.level + Math.min(6, wins(r.id))}${wins(r.id) ? ` · WON ×${wins(r.id)}` : beaten ? ' · BEATEN' : ''}`)),
            el('div', { class: 'row' },
              el('div', { class: 'rival-say' },
                label(locked ? 'somewhere further out' : r.where),
                locked ? null : el('span', { class: 'k-narration taunt' }, quote(r.taunt)),
                !locked && r.mechanic ? el('span', { class: 'k-label mech' }, r.mechanic) : null),
              locked ? null : el('div', { class: 'rival-pets' }, ...theirs.map((f) => portrait(c, f, 40, 'left'))),
            ),
            locked ? null : el('div', { class: 'rival-acts' },
              button(beaten ? 'Rematch' : 'Find them', () => begin(r, team(c, L)), { id: `rival-${r.id}`, disabled: mine.length === 0 }),
              beaten ? button('Practice', () => begin({ ...r0, mode: 'practice' }, team(c, L)), { id: `practice-${r.id}`, disabled: mine.length === 0 }) : null),
          ));
        }
        const modes = () => {
          const today = dayKey(), taken = L.daily?.day === today && L.daily.done;
          const avg = mine.reduce((a, f) => a + (f.level ?? 1), 0) / Math.max(1, mine.length);
          const stranger = c.battles.daily?.(dayNumber(), 1 + Math.floor(Math.max(0, avg - 2) * 0.6));
          const pool = all.filter((r) => beat(r.id));
          const mode = (id: string, title: string, sub: string, tip: string, go: (() => void) | null) => {
            const b = el('button', { class: `k-btn mode${go ? '' : ' off'}`, type: 'button', 'data-id': id, 'aria-disabled': String(!go) }, el('b', {}, title), el('small', {}, sub));
            b.addEventListener('click', () => { if (go) go(); else { c.audio.sfx('deny'); say(tip); } });
            return b;
          };
          return el('div', { class: 'modes' },
            stranger ? mode('daily', 'Daily duel', taken ? 'PRIZE TAKEN · XP ONLY' : 'TODAY’S PRIZE WAITS', '', () => { say(`${stranger.name}, ${stranger.where}. Here today only.`); begin(stranger, team(c, L)); }) : null,
            mode('gauntlet', 'Gauntlet', pool.length >= 3 ? `3 DOORS · NO REST${L.gauntlets ? ` · ×${L.gauntlets}` : ''}` : `BEAT ${3 - pool.length} MORE FIRST`, 'The gauntlet is three doors you have already opened, one after another, with no healing between. Beat three rivals on the ladder first.', pool.length >= 3 ? () => {
              // Three of the doors already opened, drawn afresh each run, each as hard as its next rematch.
              const left = [...pool], ids: number[] = [];
              while (ids.length < 3 && left.length) ids.push(left.splice(Math.floor(Math.random() * left.length), 1)[0]!.id);
              L.gauntlet = { ids, stage: 0 };
              saveLadder(L);
              const r0 = all[ids[0]!]!;
              begin({ ...(c.battles.rematch?.(r0, wins(r0.id)) ?? r0), mode: 'gauntlet' }, team(c, L));
            } : null),
          );
        };
        root.replaceChildren(
          el('header', { class: 'row' }, backChip('ROOM', () => c.go('bedroom')), lightPips(c.light.view().pips).el),
          button('Walk out into the street', () => c.go('town'), { id: 'go-town' }),
          el('div', { class: 'row' }, el('h1', { class: 'k-title' }, 'Outside'), el('span', { class: 'k-tag intent', 'data-id': 'ladder-progress' }, `LADDER ${done}/${all.length}`)),
          el('div', { class: 'team' }, ...mine.map((f, i) => {
            const info = levelOf(c, L.xp[f.serialNumber] ?? 0);
            const free = relics.filter((r) => L.relics.includes(r.id) && !Object.entries(L.held).some(([s, id]) => id === r.id && s !== String(f.serialNumber)));
            const rb = el('button', { class: 'k-tag swap relic', type: 'button', 'data-id': `relic-${i}`, disabled: free.length === 0 }, f.relic ? `HOLDS: ${f.relic.name}` : free.length ? 'HOLDS NOTHING · TAP' : 'NO RELIC YET');
            // The next free relic after the one held, then nothing, round and round.
            const next = free[free.findIndex((r) => r.id === f.relic?.id) + 1];
            const hand = () => {
              if (next) L.held[f.serialNumber] = next.id; else delete L.held[f.serialNumber];
              saveLadder(L);
              c.audio.sfx('place');
              note = next ? `${f.name} holds the ${next.name}. ${next.desc}` : `${f.name} holds nothing. The ${f.relic?.name ?? 'relic'} is back with the others.`;
              asking = -1;
              scroll = list.scrollTop;
              render();
            };
            rb.addEventListener('click', () => {
              // Nothing held: there is nothing to lose, so hand the relic over and say what it does.
              if (!f.relic) { hand(); return; }
              // Something held: say what it does and ask before it is taken off or swapped.
              asking = asking === i ? -1 : i;
              c.audio.sfx('tap');
              scroll = list.scrollTop;
              render();
            });
            if (asking === i && f.relic) rb.setAttribute('aria-expanded', 'true');
            const ask = asking === i && f.relic ? el('div', { class: 'relic-ask', 'data-id': `relic-ask-${i}`, role: 'group', 'aria-label': `${f.name}'s relic` },
              el('p', { class: 'k-narration' }, `${f.name} holds the ${f.relic.name}. ${f.relic.desc}`),
              next ? el('p', { class: 'k-narration dim' }, `Next to hand: the ${next.name}. ${next.desc}`) : null,
              el('div', { class: 'row' },
                button('Keep it', () => { asking = -1; scroll = list.scrollTop; render(); }, { id: `relic-keep-${i}` }),
                button(next ? `Swap for ${next.name}` : 'Take it off', hand, { id: `relic-change-${i}` }))) : null;
            return el('div', { class: 'team-row pet-row' },
              portrait(c, f, 56),
              el('div', { class: 'team-info' },
                el('div', { class: 'row start' }, el('span', { class: 'k-narration' }, f.name), tag(f.element), el('span', { class: 'k-tag lv', 'data-id': `level-${i}` }, `LV ${info.level}`), f.rarity && f.rarity !== 'common' ? el('span', { class: `k-tag rar rar-${f.rarity}` }, f.rarity) : null),
                xpBar(info),
                el('span', { class: 'k-label stats' }, `${f.temperament ? `${f.temperament.toUpperCase()} · ` : ''}MGT ${f.might} · DEP ${f.depth} · RAD ${f.radiance} · GRD ${f.guard} · SPD ${f.speed}`),
                el('div', { class: 'row start chips' }, rb, bondChip(c, f, `bond-${i}`, say), chip(`${f.skills.length} SKILLS`, 'trait', `skills-${i}`, `${f.name} knows ${f.skills.map((s) => s.name).join(', ')}. ${(c.battles.skillsOf?.(f.element) ?? []).filter((s) => !f.skills.some((x) => x.id === s.id)).slice(0, 1).map((s) => `Learns ${s.name} at level ${s.learnAt ?? 1}.`).join('')}`, say)),
                ask,
              ),
            );
          })),
          mine.length ? hint : narration('Your box is empty. Catch a universe first.'),
          ...(mine.length ? [modes()] : []),
          list,
        );
        list.scrollTop = scroll;
      };
      render();
    },
    frame: () => ctx?.gl.clear('#17140c'),
    unmount: () => void (ctx = null),
  };
};

const STATUS_ICON: Record<StatusKind, string> = { burn: '✹', chill: '✶', ward: '◈', regen: '⊕', expose: '◌' };
const STATUS_TIP: Record<StatusKind, string> = {
  burn: 'Burning: loses life at the end of each turn. Water turns it to steam, green things feed it, Backdraft finishes it.',
  chill: 'Chilled: slower, and hits a quarter softer. A Strike or anything heavy shatters it for half again.',
  ward: 'Warded: takes half harm. Avalanche and Landslide go straight through.',
  regen: 'Regrowing: mends at the end of each turn.',
  expose: 'Exposed: every hit lands 40% harder, Fold always crits, and finishers land double.',
};
const PET_SIZE = 112;

const card = (f: Fighter, c: AppContext, side: Side, pet: HTMLElement, say: (t: string) => void) => {
  const spec = c.universes.fromSerial(f.serialNumber);
  const pct = Math.round((f.hp / f.maxHp) * 100);
  const chips: HTMLElement[] = f.traits.map((t) => chip(t.name, 'trait', `trait-${side}-${t.id}`, `${t.name}: ${t.desc}`, say));
  if (f.rarity && RARITY_TIP[f.rarity]) chips.push(chip(f.rarity, `rar rar-${f.rarity}`, `rarity-${side}`, RARITY_TIP[f.rarity]!, say));
  const bc = bondChip(c, f, `bond-${side}`, say);
  if (bc) chips.push(bc);
  if (f.relic) chips.push(chip(`◆ ${f.relic.name}`, 'relic', `relic-${side}`, `${f.relic.name}: ${f.relic.desc}`, say));
  for (const k of Object.keys(STATUS_ICON) as StatusKind[]) if (f.status[k] > 0) chips.push(chip(`${STATUS_ICON[k]} ${f.status[k]}`, `st-${k}`, `st-${side}-${k}`, `${STATUS_TIP[k]} ${f.status[k]} turn${f.status[k] > 1 ? 's' : ''} left.`, say));
  if ((f.shield ?? 0) > 0) chips.push(chip(`◙ ${f.shield}`, 'st-ward', `st-${side}-shield`, `Shielded: the next ${f.shield} harm is soaked before its life is touched.`, say));
  if (f.guarding) chips.push(chip('▣', 'st-ward', `st-${side}-guard`, 'Guarding: takes half harm until it next moves.', say));
  const info = el('div', { class: 'f-info' },
    el('div', { class: 'row nowrap' }, el('span', { class: 'glyph' }, glyphChar(spec.glyph)), el('span', { class: 'k-title small' }, f.name), tag(f.element), el('span', { class: 'k-tag lv' }, `LV ${f.level ?? 1}`)),
    el('div', { class: `hp${pct < 35 ? ' low' : ''}` }, el('i', { style: `width:${pct}%` })),
    el('div', { class: 'row' }, label(`HP ${f.hp}/${f.maxHp}`), el('span', { class: 'energy', 'aria-label': `Light ${f.energy}` }, ...Array.from({ length: 6 }, (_, i) => el('i', { class: i < f.energy ? 'on' : '' })))),
    el('span', { class: 'k-label stats' }, `MGT ${f.might} · DEP ${f.depth} · RAD ${f.radiance} · GRD ${f.guard} · SPD ${f.speed}`),
    el('div', { class: 'row start chips' }, ...chips),
  );
  const slot = el('div', { class: 'f-pet' }, pet);
  return el('div', { class: `fighter pet-card active side-${side}${f.hp <= 0 ? ' down' : ''}${f.fused ? ' fused' : ''}`, 'data-side': side }, ...(side === 'you' ? [slot, info] : [info, slot]));
};

interface Pet { readonly key: string; readonly h: Creature }
const petKey = (f: Fighter): string => `${f.serialNumber}:${f.fused ? 'fused' : f.slot}:${f.name}`;

/** The fight is over: pay XP, count the win, hand over Light, a sky piece and perhaps a relic. Once. */
const settleUp = (c: AppContext): Summary => {
  const b = c.battle!;
  const L = loadLadder();
  const won = b.outcome === 'won';
  const before = roster.map((s) => {
    const slot = c.box.slots().findIndex((e) => e?.serialNumber === s);
    return grown(c, L, c.battles.fighter(c.universes.fromSerial(s), c.box.slots()[slot]?.stats, slot));
  });
  const mode = b.rival.mode;
  let reward: BattleReward = c.battles.reward?.(b, mode ? 0 : L.wins[b.rival.id] ?? 0, L.relics) ?? { glow: won ? 1500 : 0, xp: 0 };
  let note = '', next = false;
  if (mode === 'daily') {
    const today = dayKey();
    if (L.daily?.day === today && L.daily.done) { reward = { glow: 0, xp: Math.ceil(reward.xp / 2) }; note = 'Today’s prize is already yours. This one was for the XP.'; }
    else if (won) { L.daily = { day: today, done: true }; note = 'Today’s prize is yours. There will be someone else tomorrow.'; }
    else note = 'They are here until midnight. The prize is still waiting.';
  } else if (mode === 'gauntlet') {
    const G = L.gauntlet;
    const door = (G?.stage ?? 0) + 1, of = G?.ids.length ?? 3;
    if (!won || !G) { reward = { glow: 0, xp: reward.xp }; delete L.gauntlet; note = `The gauntlet ends at door ${door} of ${of}.`; }
    else if (door < of) { reward = { glow: 0, xp: reward.xp }; G.stage = door; next = true; note = `Door ${door} of ${of} is down. No rest: nobody is healed. The next is waiting.`; }
    else { reward = { ...reward, glow: reward.glow * 3 }; delete L.gauntlet; L.gauntlets = (L.gauntlets ?? 0) + 1; note = `All ${of} doors in one breath. Triple Light.`; }
  } else if (mode === 'practice') note = 'Practice. Nothing won, nothing lost, nothing learned but by you.';
  if (mode !== 'practice') for (const s of roster) { const slot = c.box.slots().findIndex((e) => e?.serialNumber === s); if (slot >= 0) c.box.recordBattle?.(slot, won); }
  const was = roster.map((s) => levelOf(c, L.xp[s] ?? 0));
  for (const s of roster) L.xp[s] = (L.xp[s] ?? 0) + reward.xp;
  let relicTo = '';
  if (won) {
    if (!mode) { L.wins[b.rival.id] = (L.wins[b.rival.id] ?? 0) + 1; c.rivalsBeaten.add(b.rival.id); }
    c.light.addGlow(reward.glow);
    if (reward.piece) c.sky.grant(reward.piece.kind as SkyPieceKind, reward.piece.n);
    if (reward.relic && !L.relics.includes(reward.relic.id)) {
      L.relics.push(reward.relic.id);
      // Whoever has empty hands takes it. It can be handed round Outside.
      const taker = before.find((f) => !L.held[f.serialNumber]);
      if (taker) { L.held[taker.serialNumber] = reward.relic.id; relicTo = taker.name; }
    }
  }
  saveLadder(L);
  const rows = before.map((f0, i) => {
    const f = grown(c, L, c.battles.fighter(c.universes.fromSerial(f0.serialNumber), c.box.slots()[f0.slot]?.stats, f0.slot));
    return { f, before: was[i]!, after: levelOf(c, L.xp[f0.serialNumber] ?? 0), learned: f.skills.filter((s) => !f0.skills.some((x) => x.id === s.id)), form: (f.form ?? 1) > (f0.form ?? 1) ? f.form ?? 1 : 0 };
  });
  return { won, reward, turns: b.turn, relicTo, rows, note, next };
};

const summaryView = (c: AppContext, s: Summary, b: NonNullable<AppContext['battle']>) => {
  const r = s.reward;
  const got = [
    r.glow ? `+${lightLabel(r.glow)}` : '',
    r.piece ? `${pieceCount(r.piece.kind, r.piece.n)} for your skies` : '',
    r.relic ? `Relic: ${r.relic.name}${s.relicTo ? ` (${s.relicTo} holds it)` : ''}` : '',
  ].filter(Boolean);
  return el('section', { class: 'summary', 'data-id': 'summary' },
    el('div', { class: 'row' }, el('span', { class: 'k-title small' }, s.won ? `Won in ${s.turns} turns` : `Lost in ${s.turns} turns`), label(`DEALT ${b.tally?.dealt ?? 0} · TOOK ${b.tally?.taken ?? 0} · ${b.tally?.combos ?? 0} COMBOS`)),
    ...s.rows.map((row) => el('div', { class: 'sum-row' },
      portrait(c, row.f, 40),
      el('div', { class: 'team-info' },
        el('div', { class: 'row start' },
          el('span', { class: 'k-narration' }, row.f.name),
          el('span', { class: `k-tag lv${row.after.level > row.before.level ? ' up' : ''}`, 'data-id': row.after.level > row.before.level ? 'level-up' : 'level-same' }, row.after.level > row.before.level ? `LV ${row.before.level} → ${row.after.level}` : `LV ${row.after.level}`),
          r.xp ? label(`+${r.xp} XP`) : null),
        xpBar(row.after),
        row.learned.length || row.form ? el('span', { class: 'k-label learned', 'data-id': 'learned' }, [row.learned.length ? `Learned ${row.learned.map((k) => `${k.name} (${(k.kind ?? '').toLowerCase()})`).join(', ')}.` : '', row.form ? `It has changed: ${FORM[row.form]}.` : ''].filter(Boolean).join(' ')) : null,
      ))),
    s.note ? el('p', { class: 'k-label rewards', 'data-id': 'mode-note' }, s.note) : null,
    got.length ? el('p', { class: 'k-label rewards', 'data-id': 'rewards' }, got.join(' · ')) : null,
    r.relic && s.won ? el('p', { class: 'k-label rewards' }, `${r.relic.name}: ${r.relic.desc}${s.relicTo ? '' : ' Hand it to someone Outside.'}`) : null,
  );
};

const battle: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let bg: { spec: ReturnType<AppContext['universes']['fromSerial']>; children: readonly FoldNode[]; addr: ReturnType<AppContext['fold']['root']> } | null = null;
  let t = 0;
  let fusing = false;
  let asking = false;
  let detail = 'Pick a move. Their next move is shown above. Tap ? then a move to read it.';
  const pets: Partial<Record<Side, Pet>> = {};
  let timers: ReturnType<typeof setTimeout>[] = [];
  let autoTimer: ReturnType<typeof setTimeout> | undefined;
  const clearPets = () => {
    clearTimeout(autoTimer);
    timers.forEach(clearTimeout);
    timers = [];
    for (const s of ['you', 'them'] as const) { pets[s]?.h.dispose(); delete pets[s]; }
  };
  return {
    id: 'battle',
    mount: (root, c) => {
      ctx = c;
      clearPets();
      if (!c.battle) { c.go('outside'); return; }
      // Coming back from inside a universe: fighters become what their worlds are now.
      const L0 = loadLadder();
      for (const f of c.battle.mine) {
        const e = c.box.slots()[f.slot];
        if (e && !f.fused) c.battle = c.battles.refresh(c.battle, f.slot, grown(c, L0, c.battles.fighter(c.universes.fromSerial(e.serialNumber), e.stats, f.slot)));
      }
      if (!roster.length) roster = c.battle.mine.filter((f) => !f.fused).map((f) => f.serialNumber);
      const prefs = { speed: [1, 2, 4].includes(L0.speed ?? 1) ? L0.speed ?? 1 : 1, auto: !!L0.auto };
      const savePrefs = () => { const L = loadLadder(); L.speed = prefs.speed; L.auto = prefs.auto; saveLadder(L); };
      const rate = () => prefs.speed;
      const later = (ms: number, fn: () => void) => void timers.push(setTimeout(fn, ms / rate()));
      const autoOn = () => prefs.auto && !!c.battle && !c.battle.rival.boss && c.battle.outcome === 'ongoing';
      /** Auto-battle: the sensible script takes the next turn once this one has played out. */
      const queueAuto = () => {
        clearTimeout(autoTimer);
        if (!autoOn()) return;
        autoTimer = setTimeout(() => {
          if (ctx !== c || !autoOn() || asking) return;
          const a = c.battles.suggest?.(c.battle!, 'sensible') ?? { type: 'skill', id: 'strike' };
          play(a, sfxFor(a, c.battle!.mine[c.battle!.myActive]!));
        }, Math.max(260, 1500 / rate()));
      };
      /** The creature for a side's active fighter. Kept across renders so it keeps breathing. */
      const petFor = (side: Side, f: Fighter, sync: boolean): Creature => {
        const key = petKey(f);
        let p = pets[side];
        if (!p || p.key !== key) {
          p = pets[side] = { key, h: creature(c.universes.fromSerial(f.serialNumber), f, { size: PET_SIZE, facing: side === 'them' ? 'left' : 'right' }) };
          p.h.play('enter', rate());
        } else if (sync) p.h.update(f);
        return p.h;
      };

      /** Play a finished turn on the creatures: lunges, recoils, numbers, faints. */
      const animate = (a: BattleAction, theirA: BattleAction, old: Partial<Record<Side, Pet>>) => {
        const b = c.battle!;
        const slotOf = (s: Side) => root.querySelector<HTMLElement>(`.fighter[data-side=${s}] .f-pet`);
        const active: Record<Side, Fighter> = { you: b.mine[b.myActive]!, them: b.theirs[b.theirActive]! };
        // Who stands on each side while this turn plays. A fighter that went dark stays until it has fallen.
        const stage = {} as Record<Side, { h: Creature; f: Fighter; next: Creature | null }>;
        for (const s of ['you', 'them'] as const) {
          const was = old[s], now = pets[s]!;
          const dead = was && was !== now ? (s === 'you' ? b.mine : b.theirs).find((f) => petKey(f) === was.key && f.hp <= 0) : undefined;
          if (was && dead) { slotOf(s)?.replaceChildren(was.h.el); stage[s] = { h: was.h, f: dead, next: now.h }; }
          else { if (was && was !== now) was.h.dispose(); stage[s] = { h: now.h, f: active[s], next: null }; }
        }
        const last: Record<Side, number> = { you: -1, them: -1 };
        b.hits.forEach((h, i) => { last[h.to] = i; });
        const fall = (s: Side) => {
          const st = stage[s];
          st.h.update(st.f);
          st.h.play('faint', rate());
          c.audio.sfx('faint');
          const next = st.next;
          if (next) later(860, () => { const slot = slotOf(s); st.h.dispose(); if (slot && pets[s]?.h === next) { slot.replaceChildren(next.el); next.play('enter', rate()); } });
        };
        const acted: Record<Side, BattleAction> = { you: a, them: theirA };
        for (const s of ['you', 'them'] as const) {
          if (last[s] >= 0) continue;
          if (stage[s].f.hp <= 0) fall(s); else stage[s].h.update(stage[s].f);
          if (acted[s].type === 'guard' && stage[s].f.guarding) stage[s].h.play('guard', rate());
        }
        const kindled: Record<Side, boolean> = { you: false, them: false };
        b.hits.forEach((h, i) => {
          const from = other(h.to), fa = acted[from];
          // A burn tick has no attacker; a Kindle does (its first BURN hit).
          let lunge = !h.heal;
          if (lunge && h.tag === 'BURN') { lunge = fa.type === 'skill' && fa.id === 'kindle' && !kindled[from]; kindled[from] = true; }
          // End-of-turn ticks come after the blows, set apart by a beat.
          const at = i * 300 + (h.tick ? 260 : 0);
          if (lunge) later(at, () => stage[from].h.play('attack', rate()));
          later(at + (lunge ? 170 : 0), () => {
            const st = stage[h.to], host = slotOf(h.to);
            const dies = i === last[h.to] && st.f.hp <= 0;
            if (i === last[h.to] && !dies) st.h.update(st.f);
            st.h.play(h.heal ? (h.tag === 'FUSED' ? 'fuse' : h.tag === 'SHIELD' ? 'guard' : 'heal') : h.crit ? 'crit' : 'hit', rate());
            c.audio.sfx(h.tick ? (h.heal ? 'regen' : 'burn') : h.heal ? (h.tag === 'SHIELD' ? 'ward' : h.tag === 'FUSED' ? 'merge' : 'heal') : h.crit ? 'crit' : 'hit', Math.min(1, (h.amount / Math.max(1, st.f.maxHp)) * 3));
            if (dies) later(440, () => fall(h.to));
            if (!host) return;
            // Numbers fly off whoever was hit or healed, with a word for how it landed.
            const word = h.tag || (h.eff === 'strong' ? 'HITS HARD' : h.eff === 'weak' ? 'BARELY LANDS' : '');
            const n = el('span', { class: `float${h.heal ? ' heal' : ''}${h.crit ? ' crit' : ''}${h.eff ? ` ${h.eff}` : ''}${h.tick ? ' tick' : ''}` }, `${h.heal ? '+' : '−'}${h.amount}`, word ? el('small', {}, word) : null);
            const x = 8 + ((i * 37) % 40);
            n.style.left = `${x}%`;
            host.append(n);
            later(1100, () => n.remove());
            if (!h.heal) {
              burst(host, PET_SIZE * (0.3 + x / 250), PET_SIZE * 0.5, h.crit ? 14 : 7, h.crit);
              if (h.crit) { const cardEl = host.closest<HTMLElement>('.fighter'); if (cardEl) shake(cardEl, true); }
            }
          });
        });
        // Whoever is left standing on your side takes the win its own way.
        if (b.outcome === 'won') later(b.hits.length * 300 + 700, () => pets.you?.h.play('victory', rate()));
      };

      const SKILL_SFX: Record<string, string> = { strike: 'strike', kindle: 'fire', rime: 'freeze', undertow: 'water', avalanche: 'quake', overgrow: 'seed', unmake: 'erase', fold: 'fold', shine: 'heal', align: 'flare' };
      const ELEMENT_SFX: Record<string, string> = { fire: 'fire', cold: 'freeze', tide: 'water', stone: 'quake', bloom: 'seed', void: 'erase' };
      const WEATHER_SFX: Record<Weather, string> = { heat: 'heat', frost: 'cold', tide: 'rain', dust: 'wind', spring: 'rain', dark: 'eclipse' };
      const sfxFor = (a: BattleAction, me: Fighter): string => (a.type === 'guard' ? 'guard' : a.type === 'swap' ? 'swap' : a.type === 'fuse' ? 'merge' : SKILL_SFX[a.id] ?? ELEMENT_SFX[me.element] ?? 'strike');
      const KINDS: readonly StatusKind[] = ['burn', 'chill', 'ward', 'regen', 'expose'];

      const play = (a: BattleAction, sfx: string) => {
        if (!c.battles.can(c.battle!, a)) { c.audio.sfx('deny'); return; }
        const theirA = c.battle!.intent.action;
        const prev = c.battle!;
        const old = { ...pets };
        timers.forEach(clearTimeout);
        timers = [];
        c.battle = c.battles.act(c.battle!, a);
        const b = c.battle;
        fusing = false;
        if (b.outcome !== 'ongoing' && !summary) summary = settleUp(c);
        c.audio.sfx(b.outcome === 'won' ? 'win' : b.outcome === 'lost' ? 'lose' : sfx);
        // A status newly laid on either side, and a change in the weather, each have their own sound.
        const fresh = KINDS.find((k) => (b.mine[b.myActive]!.status[k] > (prev.mine[prev.myActive]?.status[k] ?? 0) && b.mine[b.myActive]!.name === prev.mine[prev.myActive]?.name) || (b.theirs[b.theirActive]!.status[k] > (prev.theirs[prev.theirActive]?.status[k] ?? 0) && b.theirs[b.theirActive]!.name === prev.theirs[prev.theirActive]?.name));
        if (fresh && b.outcome === 'ongoing') setTimeout(() => c.audio.sfx(fresh), 380 / rate());
        if (b.weather && b.weather !== prev.weather && b.outcome === 'ongoing') setTimeout(() => c.audio.sfx(WEATHER_SFX[b.weather!]), 620 / rate());
        if (summary?.rows.some((r) => r.after.level > r.before.level)) setTimeout(() => c.audio.sfx('level'), 1100 / rate());
        c.persist();
        render(false);
        animate(a, theirA, old);
        if (a.type === 'fuse' || theirA.type === 'fuse') { flash(root); burst(root, root.clientWidth / 2, 420, 24, true); }
        if (b.outcome === 'won') { flash(root); burst(root, root.clientWidth / 2, 300, 22, true); }
        queueAuto();
      };
      const say = (text: string) => { detail = text; hint.textContent = text; };
      const leave = () => { clearTimeout(autoTimer); if (c.battle?.rival.mode === 'gauntlet') { const L = loadLadder(); delete L.gauntlet; saveLadder(L); } c.battle = null; summary = null; roster = []; c.persist(); };
      const render = (sync = true) => {
        const b = c.battle!;
        const me = b.mine[b.myActive]!, them = b.theirs[b.theirActive]!;
        const spec = c.universes.fromSerial(me.serialNumber);
        if (!bg || bg.spec.serialNumber !== spec.serialNumber) { const addr = c.fold.root(spec); bg = { spec, addr, children: c.fold.childrenOf(addr) }; }
        const adv = c.battles.advantage(me.element, them.element);
        const w = b.weather ? c.battles.weatherInfo?.(b.weather) : undefined;
        const chainN = b.chain?.you ?? 0;
        const logEl = el('ol', { class: 'battle-log', 'data-id': 'battle-log' }, ...b.log.slice(-7).map((l) => el('li', { class: `log-${l.side}${l.text.startsWith('Turn’s end') || l.text.startsWith("Turn's end") ? ' log-tick' : ''}` }, curly(l.text))));
        const over = b.outcome !== 'ongoing';
        const threat = over ? 0 : c.battles.threat?.(b) ?? 0;
        const wipe = 2 - (b.turn % 3);
        const lastName = b.intent.label.endsWith('(your own move)') ? me.skills.find((x) => x.id === b.last?.you)?.name : undefined;
        const [mechText, mechTip] = b.rival.boss === 'champion' ? [wipe === 0 ? 'WIPES CLEAN NOW' : `WIPE IN ${wipe}`, wipe === 0 ? 'At the end of this turn it wipes the board: every burn, chill and exposure on its creature is gone, and yours is smeared for a quarter of its life and left exposed. Guard now and it barely touches you; a shield soaks it; or put its creature out this turn and there is no wipe. Do not lay a status now.' : `In ${wipe} turn${wipe > 1 ? 's' : ''} it wipes the board: its creature made clean, yours smeared and left exposed unless it is guarding. Statuses laid now will not last.`]
          : b.rival.boss === 'mirror' ? [lastName ? `MIRROR: ${lastName.toUpperCase()}` : 'MIRROR: EMPTY', lastName ? `It holds your ${lastName} and gives it back soft, for nothing. Use ${lastName} again and it comes back double. Change your blow every turn; guard or mend and the glass goes empty.` : 'The glass is empty: it has no blow of yours to give back this turn. It only keeps blows.']
            : b.rival.boss === 'fuse' ? [b.theirFused ? 'SEWN: 2 IN 1' : 'WILL SEW', b.theirFused ? 'She has sewn two into one. It has the life of both. She cannot do it twice.' : 'When NEXT shows Sew, she spends that whole turn sewing her creature to another: one body with the life of both. Land one hard blow that turn (an eighth of its life) and the thread snaps; she threads the needle again three turns on. A Strike repeated will not do it.']
              : ['TURNS THE SKY', 'The weather changes at the end of every turn. Read the weather chip before each move.'];
        const kids: (HTMLElement | null)[] = [
          el('header', { class: 'row' }, backChip(over ? 'LEAVE' : 'FLEE', () => { if (!over) { c.battle = c.battles.flee(c.battle!); c.audio.sfx('flee'); } leave(); c.go('outside'); }), el('span', { class: 'k-label who' }, `${b.rival.mode === 'daily' ? 'DAILY · ' : b.rival.mode === 'practice' ? 'PRACTICE · ' : b.rival.mode === 'gauntlet' ? `DOOR ${(loadLadder().gauntlet?.stage ?? 0) + (over && b.outcome === 'won' && summary?.next ? 0 : 1)}/3 · ` : ''}${b.rival.name.toUpperCase()} · TURN ${b.turn + 1}`)),
          el('div', { class: 'row field' },
            w ? chip(`☁ ${w.name}`, `weather w-${w.id}${me.element === w.up ? ' good' : me.element === w.down ? ' bad' : ''}`, 'weather', `${w.name}. ${w.desc}${me.element === w.up ? ' It is with you.' : me.element === w.down ? ' It is against you.' : ''}`, say) : null,
            over ? null : chip(b.first === 'them' ? 'THEY FIRST' : 'YOU FIRST', `order${b.first === 'them' ? ' bad' : ' good'}`, 'turn-order', `${b.first === 'them' ? `${them.name} is faster (speed ${them.speed} to ${me.speed}).` : `${me.name} is faster (speed ${me.speed} to ${them.speed}).`} Guard, swap, fuse and TEMPO moves go before everything. Chill slows by 5.`, say),
            chip(`CHAIN ${chainN}`, `chain${chainN ? ' good' : ''}`, 'chain', `Chain ${chainN} of 3. Use a different move from your last one and every blow lands 10% harder per link. Repeating a move, guarding or swapping breaks it.`, say),
            (() => {
              const sp = el('button', { class: 'k-tag tip ctl', type: 'button', 'data-id': 'speed', 'aria-label': `Animation speed ${prefs.speed} times` }, `▶ ${prefs.speed}×`);
              sp.addEventListener('click', () => { prefs.speed = prefs.speed === 1 ? 2 : prefs.speed === 2 ? 4 : 1; savePrefs(); c.audio.sfx('toggle', prefs.speed > 1 ? 1 : 0); detail = `Speed ${prefs.speed}×: ${prefs.speed === 1 ? 'every blow at its own pace.' : prefs.speed === 2 ? 'twice as quick.' : 'as quick as it goes.'}`; render(false); });
              return sp;
            })(),
            over ? null : (() => {
              const boss = !!b.rival.boss;
              const au = el('button', { class: `k-tag tip ctl${prefs.auto && !boss ? ' good' : ''}${boss ? ' off' : ''}`, type: 'button', 'data-id': 'auto', 'aria-pressed': String(prefs.auto && !boss) }, boss ? 'AUTO ✕' : prefs.auto ? 'AUTO ON' : 'AUTO');
              au.addEventListener('click', () => {
                if (boss) { c.audio.sfx('deny'); say('No auto-battle against a boss. This one you fight yourself.'); return; }
                prefs.auto = !prefs.auto; savePrefs(); c.audio.sfx('toggle', prefs.auto ? 1 : 0);
                detail = prefs.auto ? 'Auto-battle: it reads their next move, guards the big ones and uses what hits hardest. Tap AUTO again to take over.' : 'You have it again.';
                render(false); queueAuto();
              });
              return au;
            })(),
          ),
          over && b.outcome === 'won' ? null : card(them, c, 'them', petFor('them', them, sync).el, say),
          over ? null : el('div', { class: 'row' },
            el('span', { class: `k-tag intent${threat >= 2 ? ' danger' : ''}`, 'data-id': 'intent', 'data-threat': String(threat) }, `NEXT: ${b.intent.label.toUpperCase()}${threat >= 2 ? ' · BIG HIT, GUARD' : ''}`),
            b.rival.boss ? chip(mechText, 'mech bad', 'mechanic', `${b.rival.name}: ${b.rival.mechanic ?? ''} ${mechTip}`, say) : null,
            el('div', { class: 'row start bench' }, ...b.theirs.map((f, i) => (i === b.theirActive ? null : el('span', { class: `k-tag${f.hp <= 0 ? ' down' : ''}` }, f.name))).filter((x): x is HTMLElement => !!x)),
          ),
          logEl,
          card(me, c, 'you', petFor('you', me, sync).el, say),
        ];
        if (!over) {
          const bench = b.mine.map((f, i) => ({ f, i })).filter((x) => x.i !== b.myActive);
          kids.push(
            label(adv > 1 ? `${me.element.toUpperCase()} BEATS ${them.element.toUpperCase()}: YOUR BLOWS HIT HARD` : adv < 1 ? `${me.element.toUpperCase()} IS WEAK TO ${them.element.toUpperCase()}: YOUR BLOWS BARELY LAND` : 'EVEN ELEMENTS'),
            el('div', { class: 'skills' }, ...me.skills.map((s) => {
              const a: BattleAction = { type: 'skill', id: s.id };
              const ok = c.battles.can(b, a);
              const cost = s.id === 'align' && me.traits.some((x) => x.id === 'reaching') ? 4 : s.cost;
              const btn = el('button', { class: `k-btn skill${s.id === 'align' ? ' ult' : ''}${s.kind ? ` kind-${s.kind.toLowerCase()}` : ''}`, type: 'button', 'data-id': `skill-${s.id}`, disabled: !ok && !asking }, el('b', {}, s.name), el('small', {}, `${cost ? `${cost}◇` : 'FREE'}${s.kind ? ` ${s.kind}` : ''}`));
              const tip = `${s.name} (${cost ? `${cost} Light` : 'free'}): ${s.desc}`;
              btn.addEventListener('click', () => { if (asking) say(tip); else play(a, SKILL_SFX[s.id] ?? ELEMENT_SFX[me.element] ?? 'strike'); });
              btn.addEventListener('pointerenter', () => say(tip));
              return btn;
            }), (() => {
              const g = el('button', { class: `k-btn skill${threat >= 2 ? ' wanted' : ''}`, type: 'button', 'data-id': 'guard' }, el('b', {}, 'Guard'), el('small', {}, '+1◇ FIRST'));
              g.addEventListener('click', () => { if (asking) say('Guard: goes first, halves the harm you take this turn, and gathers 1 Light. Breaks your chain.'); else play({ type: 'guard' }, 'guard'); });
              return g;
            })(), (() => {
              const q = el('button', { class: 'k-btn skill ask', type: 'button', 'data-id': 'info', 'aria-pressed': String(asking) }, el('b', {}, '?'), el('small', {}, asking ? 'TAP A MOVE' : 'WHAT IS IT'));
              q.addEventListener('click', () => { asking = !asking; if (asking) detail = 'Tap any move to read what it does. Tap ? again to fight.'; render(false); });
              return q;
            })()),
            el('div', { class: 'row start bench' },
              ...bench.map(({ f, i }) => {
                const s = el('button', { class: `k-tag swap${f.hp <= 0 ? ' down' : ''}${fusing ? ' picked' : ''}`, type: 'button', disabled: f.hp <= 0, 'data-id': `bench-${i}` }, `${fusing ? 'FUSE WITH' : 'SWAP'}: ${f.name} ${f.hp}/${f.maxHp}`);
                s.addEventListener('click', () => (fusing ? play({ type: 'fuse', target: i }, 'merge') : play({ type: 'swap', target: i }, 'swap')));
                return s;
              }),
              !b.fusedUsed && bench.some((x) => x.f.hp > 0) ? (() => {
                const fz = el('button', { class: 'k-tag swap', type: 'button', 'aria-pressed': String(fusing), 'data-id': 'fuse' }, fusing ? 'CANCEL' : 'FUSE');
                fz.addEventListener('click', () => { fusing = !fusing; detail = fusing ? 'Fuse: pick an ally. The two become one new universe for this fight, with both their skills and traits. Once per battle.' : detail; render(false); });
                return fz;
              })() : null,
              (() => {
                const go = el('button', { class: 'k-tag swap', type: 'button', 'data-id': 'go-in', disabled: me.fused }, 'GO INSIDE');
                go.addEventListener('click', () => {
                  // The battle waits. Change their sky, bless them, burn them, walk among them.
                  c.box.select(me.slot);
                  c.selection.universe = spec;
                  c.selection.star = null;
                  c.selection.system = null;
                  c.selection.planetIndex = 0;
                  c.go('planet');
                });
                return go;
              })(),
            ),
            hint,
          );
          hint.textContent = detail;
        } else if (b.outcome === 'won' && b.rival.mode) {
          if (summary) kids.push(summaryView(c, summary, b));
          const G = loadLadder().gauntlet;
          if (b.rival.mode === 'gauntlet' && summary?.next && G) {
            kids.push(button('Next door', () => {
              const all = c.battles.rivals(), L = loadLadder();
              const r0 = all[G.ids[G.stage]!] ?? all[0]!;
              const r: Rival = { ...(c.battles.rematch?.(r0, L.wins[r0.id] ?? 0) ?? r0), mode: 'gauntlet' };
              // Nobody is healed. The dark stay dark; burns and wards are left at the last door.
              const carried = b.mine.map((f) => ({ ...f, status: { burn: 0, chill: 0, ward: 0, regen: 0, expose: 0 }, guarding: false, spent: [] }));
              summary = null;
              clearPets();
              c.audio.sfx('boss');
              c.battle = c.battles.start(r, carried, c.battles.rivalTeam(r, (s) => c.universes.fromSerial(s)));
              c.persist();
              detail = `${r.name}, ${r.where}. Your creatures are as the last door left them.`;
              render();
              queueAuto();
            }, { primary: true, id: 'gauntlet-next' }));
            kids.push(button('Give up the gauntlet', () => { leave(); c.go('outside'); }, { id: 'leave-them' }));
          } else kids.push(button('Back outside', () => { leave(); c.go('outside'); }, { primary: true, id: 'leave-them' }));
        } else if (b.outcome === 'won') {
          if (summary) kids.push(summaryView(c, summary, b));
          kids.push(el('p', { class: 'k-label' }, 'Their box is open. Take one universe home, or leave them be.'),
            el('div', { class: 'row nowrap catch-row' }, ...b.theirs.map((f) => el('div', { class: 'catch' },
              // Shown as it will be once it is yours: on its feet again.
              portrait(c, { ...f, hp: f.maxHp, guarding: false, shield: 0, status: { burn: 0, chill: 0, ward: 0, regen: 0, expose: 0 } }, 56),
              button(f.name, () => {
                const slot = f.fused ? -1 : c.box.add(f.serialNumber);
                leave();
                c.audio.sfx('catch');
                const caught = creature(c.universes.fromSerial(f.serialNumber), undefined, { size: 150 });
                clearPets();
                root.replaceChildren(
                  el('h1', { class: 'k-title' }, slot >= 0 ? `${f.name} is yours.` : f.fused ? 'It comes apart in your hands.' : 'Your box is full.'),
                  el('div', { class: 'center caught' }, slot >= 0 ? caught.el : null),
                  narration(slot >= 0 ? `It sits in slot ${slot + 1}. It starts small with you: level 1.` : 'You leave it where it lies.'),
                  button('Back outside', () => c.go('outside'), { primary: true, id: 'back-outside' }),
                );
                if (slot >= 0) caught.play('enter');
              }, { id: `catch-${f.serialNumber}` }),
            ))),
            button('Leave them be', () => { leave(); c.go('outside'); }, { id: 'leave-them' }));
        } else {
          if (summary) kids.push(summaryView(c, summary, b));
          kids.push(narration('You lost. Mote dims. They learned something all the same.'), button('Home', () => { c.light.spend(1); leave(); c.go('bedroom'); }, { primary: true, id: 'home' }));
        }
        root.replaceChildren(...kids.filter((x): x is HTMLElement => !!x));
        logEl.scrollTop = logEl.scrollHeight;
      };
      const hint = el('p', { class: 'k-label tool-hint', 'data-id': 'battle-hint' }, detail);
      render();
      queueAuto();
    },
    frame: (dt) => {
      if (!ctx?.battle || !bg) { ctx?.gl.clear('#17140c'); return; }
      t += dt;
      ctx.renderers.dive.draw({
        dive: { phase: 'hovering', universe: bg.spec, address: bg.addr, depth: 0, best: 0, progress: Math.floor((t / 12) % 1000), children: bg.children, reliquaries: 0, star: null, narration: '', aim: 0, cameFrom: 0 },
        pulse: ctx.pulse().phase(), lightPips: 3,
      }, dt);
    },
    unmount: () => { clearPets(); ctx = null; },
  };
};

export const factory = () => ({ outside, battle });
