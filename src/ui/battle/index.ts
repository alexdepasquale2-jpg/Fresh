// Outside and Battle screens (ui/battle). The bedroom layer: a ladder of other kids in
// four tiers, fights with your universes, weather, chains, relics, growth and a summary.
// Every universe shows as its creature (ui/creature): yours looks right, theirs looks left.
// Ladder progress, creature XP and relics live in localStorage under `sallow-ladder`
// (the app snapshot only holds rivalsBeaten).
import type { ScreenFactory, AppContext } from '@/contracts/app';
import type { Fighter, BattleAction, StatusKind, BattleReward, LevelInfo, Skill } from '@/contracts/battle';
import type { SkyPieceKind } from '@/contracts/sky';
import type { FoldNode } from '@/contracts/fold';
import { el, button, backChip, label, narration, tag, lightPips, glyphChar, shake, burst, flash } from '@/ui/kit';
import { creature, type Creature } from '@/ui/creature';
import './battle.css';

type Side = 'you' | 'them';
const other = (s: Side): Side => (s === 'you' ? 'them' : 'you');

/** What the ladder remembers between sessions. Keys are rival ids and universe serials. */
interface Ladder { v: 1; wins: Record<string, number>; xp: Record<string, number>; relics: string[]; held: Record<string, string> }
const KEY = 'sallow-ladder';
const loadLadder = (): Ladder => {
  const blank: Ladder = { v: 1, wins: {}, xp: {}, relics: [], held: {} };
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Ladder> | null;
    if (j && j.v === 1) return { v: 1, wins: j.wins ?? {}, xp: j.xp ?? {}, relics: j.relics ?? [], held: j.held ?? {} };
  } catch { /* a broken save is an empty ladder */ }
  return blank;
};
const saveLadder = (l: Ladder): void => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* private mode: progress lasts the session */ } };

const grown = (c: AppContext, L: Ladder, base: Fighter): Fighter => {
  const relic = L.held[base.serialNumber];
  return c.battles.grow ? c.battles.grow(base, { xp: L.xp[base.serialNumber] ?? 0, ...(relic ? { relic } : {}) }) : base;
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
      let scroll = 0;
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
                locked ? null : el('span', { class: 'k-narration taunt' }, `"${r.taunt}"`),
                !locked && r.mechanic ? el('span', { class: 'k-label mech' }, r.mechanic) : null),
              locked ? null : el('div', { class: 'rival-pets' }, ...theirs.map((f) => portrait(c, f, 40, 'left'))),
            ),
            locked ? null : button(beaten ? 'Rematch · harder' : 'Find them', () => {
              const now = team(c, L);
              roster = now.map((f) => f.serialNumber);
              summary = null;
              c.battle = c.battles.start(r, now, theirs);
              c.go('battle');
            }, { id: `rival-${r.id}`, disabled: mine.length === 0 }),
          ));
        }
        root.replaceChildren(
          el('header', { class: 'row' }, backChip('ROOM', () => c.go('bedroom')), lightPips(c.light.view().pips).el),
          el('div', { class: 'row' }, el('h1', { class: 'k-title' }, 'Outside'), el('span', { class: 'k-tag intent', 'data-id': 'ladder-progress' }, `LADDER ${done}/${all.length}`)),
          el('div', { class: 'team' }, ...mine.map((f, i) => {
            const info = levelOf(c, L.xp[f.serialNumber] ?? 0);
            const free = relics.filter((r) => L.relics.includes(r.id) && !Object.entries(L.held).some(([s, id]) => id === r.id && s !== String(f.serialNumber)));
            const rb = el('button', { class: 'k-tag swap relic', type: 'button', 'data-id': `relic-${i}`, disabled: free.length === 0 }, f.relic ? `HOLDS: ${f.relic.name}` : free.length ? 'HOLDS NOTHING · TAP' : 'NO RELIC YET');
            rb.addEventListener('click', () => {
              // Tap to hand it the next free relic, then nothing, round and round.
              const at = free.findIndex((r) => r.id === f.relic?.id);
              const next = free[at + 1];
              if (next) L.held[f.serialNumber] = next.id; else delete L.held[f.serialNumber];
              saveLadder(L);
              c.audio.sfx('place');
              note = next ? `${f.name} holds the ${next.name}. ${next.desc}` : `${f.name} holds nothing.`;
              scroll = list.scrollTop;
              render();
            });
            return el('div', { class: 'team-row pet-row' },
              portrait(c, f, 56),
              el('div', { class: 'team-info' },
                el('div', { class: 'row start' }, el('span', { class: 'k-narration' }, f.name), tag(f.element), el('span', { class: 'k-tag lv', 'data-id': `level-${i}` }, `LV ${info.level}`)),
                xpBar(info),
                label(`MGT ${f.might} · DEP ${f.depth} · RAD ${f.radiance} · GRD ${f.guard} · SPD ${f.speed}`),
                el('div', { class: 'row start chips' }, rb, chip(`${f.skills.length} SKILLS`, 'trait', `skills-${i}`, `${f.name} knows ${f.skills.map((s) => s.name).join(', ')}. ${(c.battles.skillsOf?.(f.element) ?? []).filter((s) => !f.skills.some((x) => x.id === s.id)).slice(0, 1).map((s) => `Learns ${s.name} at level ${s.learnAt ?? 1}.`).join('')}`, say)),
              ),
            );
          })),
          mine.length ? hint : narration('Your box is empty. Catch a universe first.'),
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
  if (f.relic) chips.push(chip(`◆ ${f.relic.name}`, 'relic', `relic-${side}`, `${f.relic.name}: ${f.relic.desc}`, say));
  for (const k of Object.keys(STATUS_ICON) as StatusKind[]) if (f.status[k] > 0) chips.push(chip(`${STATUS_ICON[k]} ${f.status[k]}`, `st-${k}`, `st-${side}-${k}`, `${STATUS_TIP[k]} ${f.status[k]} turn${f.status[k] > 1 ? 's' : ''} left.`, say));
  if ((f.shield ?? 0) > 0) chips.push(chip(`◙ ${f.shield}`, 'st-ward', `st-${side}-shield`, `Shielded: the next ${f.shield} harm is soaked before its life is touched.`, say));
  if (f.guarding) chips.push(chip('▣', 'st-ward', `st-${side}-guard`, 'Guarding: takes half harm until it next moves.', say));
  const info = el('div', { class: 'f-info' },
    el('div', { class: 'row nowrap' }, el('span', { class: 'glyph' }, glyphChar(spec.glyph)), el('span', { class: 'k-title small' }, f.name), tag(f.element), el('span', { class: 'k-tag lv' }, `LV ${f.level ?? 1}`)),
    el('div', { class: `hp${pct < 35 ? ' low' : ''}` }, el('i', { style: `width:${pct}%` })),
    el('div', { class: 'row' }, label(`HP ${f.hp}/${f.maxHp}`), el('span', { class: 'energy', 'aria-label': `Light ${f.energy}` }, ...Array.from({ length: 6 }, (_, i) => el('i', { class: i < f.energy ? 'on' : '' })))),
    label(`MGT ${f.might} · DEP ${f.depth} · RAD ${f.radiance} · GRD ${f.guard} · SPD ${f.speed}`),
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
  const reward = c.battles.reward?.(b, L.wins[b.rival.id] ?? 0, L.relics) ?? { glow: won ? 1500 : 0, xp: 0 };
  const was = roster.map((s) => levelOf(c, L.xp[s] ?? 0));
  for (const s of roster) L.xp[s] = (L.xp[s] ?? 0) + reward.xp;
  let relicTo = '';
  if (won) {
    L.wins[b.rival.id] = (L.wins[b.rival.id] ?? 0) + 1;
    c.rivalsBeaten.add(b.rival.id);
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
  return { won, reward, turns: b.turn, relicTo, rows };
};

const summaryView = (c: AppContext, s: Summary, b: NonNullable<AppContext['battle']>) => {
  const r = s.reward;
  const got = [
    r.glow ? `Light +${r.glow} glow` : '',
    r.piece ? `${r.piece.n} ${r.piece.kind}${r.piece.n > 1 ? 's' : ''} for your skies` : '',
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
          label(`+${r.xp} XP`)),
        xpBar(row.after),
        row.learned.length || row.form ? el('span', { class: 'k-label learned', 'data-id': 'learned' }, [row.learned.length ? `Learned ${row.learned.map((k) => `${k.name} (${(k.kind ?? '').toLowerCase()})`).join(', ')}.` : '', row.form ? `It has changed: ${FORM[row.form]}.` : ''].filter(Boolean).join(' ')) : null,
      ))),
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
  const clearPets = () => {
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
      const later = (ms: number, fn: () => void) => void timers.push(setTimeout(fn, ms));
      /** The creature for a side's active fighter. Kept across renders so it keeps breathing. */
      const petFor = (side: Side, f: Fighter, sync: boolean): Creature => {
        const key = petKey(f);
        let p = pets[side];
        if (!p || p.key !== key) {
          p = pets[side] = { key, h: creature(c.universes.fromSerial(f.serialNumber), f, { size: PET_SIZE, facing: side === 'them' ? 'left' : 'right' }) };
          p.h.play('enter');
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
          st.h.play('faint');
          const next = st.next;
          if (next) later(860, () => { const slot = slotOf(s); st.h.dispose(); if (slot && pets[s]?.h === next) { slot.replaceChildren(next.el); next.play('enter'); } });
        };
        const acted: Record<Side, BattleAction> = { you: a, them: theirA };
        for (const s of ['you', 'them'] as const) {
          if (last[s] >= 0) continue;
          if (stage[s].f.hp <= 0) fall(s); else stage[s].h.update(stage[s].f);
          if (acted[s].type === 'guard' && stage[s].f.guarding) stage[s].h.play('guard');
        }
        const kindled: Record<Side, boolean> = { you: false, them: false };
        b.hits.forEach((h, i) => {
          const from = other(h.to), fa = acted[from];
          // A burn tick has no attacker; a Kindle does (its first BURN hit).
          let lunge = !h.heal;
          if (lunge && h.tag === 'BURN') { lunge = fa.type === 'skill' && fa.id === 'kindle' && !kindled[from]; kindled[from] = true; }
          const at = i * 300;
          if (lunge) later(at, () => stage[from].h.play('attack'));
          later(at + (lunge ? 170 : 0), () => {
            const st = stage[h.to], host = slotOf(h.to);
            const dies = i === last[h.to] && st.f.hp <= 0;
            if (i === last[h.to] && !dies) st.h.update(st.f);
            st.h.play(h.heal ? (h.tag === 'FUSED' ? 'fuse' : h.tag === 'SHIELD' ? 'guard' : 'heal') : h.crit ? 'crit' : 'hit');
            if (dies) later(440, () => fall(h.to));
            if (!host) return;
            // Numbers fly off whoever was hit or healed, with a word for how it landed.
            const word = h.tag || (h.eff === 'strong' ? 'HITS HARD' : h.eff === 'weak' ? 'BARELY LANDS' : '');
            const n = el('span', { class: `float${h.heal ? ' heal' : ''}${h.crit ? ' crit' : ''}${h.eff ? ` ${h.eff}` : ''}` }, `${h.heal ? '+' : '−'}${h.amount}`, word ? el('small', {}, word) : null);
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
      };

      const play = (a: BattleAction, sfx: string) => {
        if (!c.battles.can(c.battle!, a)) { c.audio.sfx('deny'); return; }
        const theirA = c.battle!.intent.action;
        const old = { ...pets };
        timers.forEach(clearTimeout);
        timers = [];
        c.battle = c.battles.act(c.battle!, a);
        const b = c.battle;
        fusing = false;
        if (b.outcome !== 'ongoing' && !summary) summary = settleUp(c);
        const big = b.hits.some((h) => h.crit && !h.heal);
        c.audio.sfx(b.outcome === 'won' ? 'win' : b.outcome === 'lost' ? 'lose' : sfx);
        if (b.hits.some((h) => h.to === 'you' && !h.heal)) setTimeout(() => c.audio.sfx(big ? 'crit' : 'strike'), 300);
        c.persist();
        render(false);
        animate(a, theirA, old);
        if (a.type === 'fuse' || theirA.type === 'fuse') { flash(root); burst(root, root.clientWidth / 2, 420, 24, true); }
        if (b.outcome === 'won') { flash(root); burst(root, root.clientWidth / 2, 300, 22, true); }
      };
      const SKILL_SFX: Record<string, string> = { strike: 'strike', kindle: 'fire', rime: 'freeze', undertow: 'water', avalanche: 'quake', overgrow: 'seed', unmake: 'erase', fold: 'fold', shine: 'heal', align: 'flare' };
      const ELEMENT_SFX: Record<string, string> = { fire: 'fire', cold: 'freeze', tide: 'water', stone: 'quake', bloom: 'seed', void: 'erase' };
      const say = (text: string) => { detail = text; hint.textContent = text; };
      const leave = () => { c.battle = null; summary = null; roster = []; c.persist(); };
      const render = (sync = true) => {
        const b = c.battle!;
        const me = b.mine[b.myActive]!, them = b.theirs[b.theirActive]!;
        const spec = c.universes.fromSerial(me.serialNumber);
        if (!bg || bg.spec.serialNumber !== spec.serialNumber) { const addr = c.fold.root(spec); bg = { spec, addr, children: c.fold.childrenOf(addr) }; }
        const adv = c.battles.advantage(me.element, them.element);
        const w = b.weather ? c.battles.weatherInfo?.(b.weather) : undefined;
        const chainN = b.chain?.you ?? 0;
        const logEl = el('ol', { class: 'battle-log', 'data-id': 'battle-log' }, ...b.log.slice(-6).map((l) => el('li', { class: `log-${l.side}` }, l.text)));
        const over = b.outcome !== 'ongoing';
        const kids: (HTMLElement | null)[] = [
          el('header', { class: 'row' }, backChip(over ? 'LEAVE' : 'FLEE', () => { if (!over) c.battle = c.battles.flee(c.battle!); leave(); c.go('outside'); }), el('span', { class: 'k-label who' }, `${b.rival.name.toUpperCase()} · TURN ${b.turn + 1}`)),
          el('div', { class: 'row field' },
            w ? chip(`☁ ${w.name}`, `weather w-${w.id}${me.element === w.up ? ' good' : me.element === w.down ? ' bad' : ''}`, 'weather', `${w.name}. ${w.desc}${me.element === w.up ? ' It is with you.' : me.element === w.down ? ' It is against you.' : ''}`, say) : null,
            over ? null : chip(b.first === 'them' ? 'THEY MOVE FIRST' : 'YOU MOVE FIRST', `order${b.first === 'them' ? ' bad' : ' good'}`, 'turn-order', `${b.first === 'them' ? `${them.name} is faster (speed ${them.speed} to ${me.speed}).` : `${me.name} is faster (speed ${me.speed} to ${them.speed}).`} Guard, swap, fuse and TEMPO moves go before everything. Chill slows by 5.`, say),
            chip(`CHAIN ${chainN}`, `chain${chainN ? ' good' : ''}`, 'chain', `Chain ${chainN} of 3. Use a different move from your last one and every blow lands 10% harder per link. Repeating a move, guarding or swapping breaks it.`, say),
          ),
          over && b.outcome === 'won' ? null : card(them, c, 'them', petFor('them', them, sync).el, say),
          over ? null : el('div', { class: 'row' },
            el('span', { class: 'k-tag intent', 'data-id': 'intent' }, `NEXT: ${b.intent.label.toUpperCase()}`),
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
              const g = el('button', { class: 'k-btn skill', type: 'button', 'data-id': 'guard' }, el('b', {}, 'Guard'), el('small', {}, '+1◇ FIRST'));
              g.addEventListener('click', () => { if (asking) say('Guard: goes first, halves the harm you take this turn, and gathers 1 Light. Breaks your chain.'); else play({ type: 'guard' }, 'stone'); });
              return g;
            })(), (() => {
              const q = el('button', { class: 'k-btn skill ask', type: 'button', 'data-id': 'info', 'aria-pressed': String(asking) }, el('b', {}, '?'), el('small', {}, asking ? 'TAP A MOVE' : 'WHAT IS IT'));
              q.addEventListener('click', () => { asking = !asking; if (asking) detail = 'Tap any move to read what it does. Tap ? again to fight.'; render(false); });
              return q;
            })()),
            el('div', { class: 'row start bench' },
              ...bench.map(({ f, i }) => {
                const s = el('button', { class: `k-tag swap${f.hp <= 0 ? ' down' : ''}${fusing ? ' picked' : ''}`, type: 'button', disabled: f.hp <= 0, 'data-id': `bench-${i}` }, `${fusing ? 'FUSE WITH' : 'SWAP'}: ${f.name} ${f.hp}/${f.maxHp}`);
                s.addEventListener('click', () => (fusing ? play({ type: 'fuse', target: i }, 'merge') : play({ type: 'swap', target: i }, 'place')));
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
