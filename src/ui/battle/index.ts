// Outside and Battle screens (ui/battle). The bedroom layer: find other kids, fight
// with your universes, step into one mid-battle to change it, fuse two, catch theirs.
// Every universe shows as its creature (ui/creature): yours looks right, theirs looks left.
import type { ScreenFactory, AppContext } from '@/contracts/app';
import type { Fighter, BattleAction, StatusKind } from '@/contracts/battle';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import type { FoldNode } from '@/contracts/fold';
import { el, button, backChip, label, narration, tag, lightPips, glyphChar, shake, burst, flash } from '@/ui/kit';
import { creature, type Creature } from '@/ui/creature';
import './battle.css';

type Side = 'you' | 'them';
const other = (s: Side): Side => (s === 'you' ? 'them' : 'you');

const team = (c: AppContext): Fighter[] =>
  c.box.slots()
    .map((s, slot) => (s ? c.battles.fighter(c.universes.fromSerial(s.serialNumber), s.stats, slot) : null))
    .filter((f): f is Fighter => f !== null)
    .sort((a, b) => b.might + b.depth + b.radiance + b.guard - (a.might + a.depth + a.radiance + a.guard))
    .slice(0, 3);

const portrait = (c: AppContext, f: Fighter, size: number, facing: 'left' | 'right' = 'right') =>
  creature(c.universes.fromSerial(f.serialNumber), f, { size, facing }).el;

const outside: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  return {
    id: 'outside',
    mount: (root, c) => {
      ctx = c;
      const mine = team(c);
      root.append(
        el('header', { class: 'row' }, backChip('ROOM', () => c.go('bedroom')), lightPips(c.light.view().pips).el),
        el('h1', { class: 'k-title' }, 'Outside'),
        narration('Mote dims out here. Other kids keep boxes too, and theirs are hungry.'),
        label('YOUR THREE STRONGEST'),
        el('div', { class: 'team' }, ...mine.map((f) => el('div', { class: 'team-row pet-row' },
          portrait(c, f, 64),
          el('div', { class: 'team-info' },
            el('div', { class: 'row start' }, el('span', { class: 'k-narration' }, f.name), tag(f.element)),
            label(`MIGHT ${f.might} · DEPTH ${f.depth} · RAD ${f.radiance} · GUARD ${f.guard} · SPEED ${f.speed}`),
            label(f.traits.map((t) => t.name).join(' · ')),
          ),
        ))),
        label('Tend their worlds to make them stronger: souls and eras give Might, prosperity gives Guard, what they launch gives Speed.'),
        el('div', { class: 'rivals' }, ...c.battles.rivals().map((r) => {
          const beaten = c.rivalsBeaten.has(r.id);
          const locked = r.id > 0 && !c.rivalsBeaten.has(r.id - 1) && !beaten;
          return el('section', { class: `rival${beaten ? ' beaten' : ''}${locked ? ' locked' : ''}` },
            el('div', { class: 'row' }, el('span', { class: 'k-title small' }, locked ? '???' : r.name), label(beaten ? 'BEATEN' : `LEVEL ${r.level}`)),
            el('div', { class: 'row' },
              label(locked ? 'somewhere further out' : r.where),
              locked ? null : el('div', { class: 'rival-pets' }, ...c.battles.rivalTeam(r, (s) => c.universes.fromSerial(s)).map((f) => portrait(c, f, 44, 'left'))),
            ),
            locked ? null : button(beaten ? 'Fight again' : 'Find them', () => {
              c.battle = c.battles.start(r, team(c), c.battles.rivalTeam(r, (s) => c.universes.fromSerial(s)));
              c.go('battle');
            }, { id: `rival-${r.id}`, disabled: mine.length === 0 }),
          );
        })),
      );
    },
    frame: () => ctx?.gl.clear('#17140c'),
    unmount: () => void (ctx = null),
  };
};

const STATUS_LABEL: Record<StatusKind, string> = { burn: 'BURNING', chill: 'CHILLED', ward: 'WARDED', regen: 'REGROWING', expose: 'EXPOSED' };
const PET_SIZE = 136;

const card = (f: Fighter, c: AppContext, side: Side, pet: HTMLElement) => {
  const spec = c.universes.fromSerial(f.serialNumber);
  const pct = Math.round((f.hp / f.maxHp) * 100);
  const statuses = (Object.keys(STATUS_LABEL) as StatusKind[]).filter((k) => f.status[k] > 0).map((k) => el('span', { class: `k-tag st-${k}` }, `${STATUS_LABEL[k]} ${f.status[k]}`));
  if (f.guarding) statuses.push(el('span', { class: 'k-tag st-ward' }, 'GUARDING'));
  const info = el('div', { class: 'f-info' },
    el('div', { class: 'row nowrap' }, el('span', { class: 'glyph' }, glyphChar(spec.glyph)), el('span', { class: 'k-title small' }, f.name), tag(f.element)),
    el('div', { class: `hp${pct < 35 ? ' low' : ''}` }, el('i', { style: `width:${pct}%` })),
    el('div', { class: 'row' }, label(`HP ${f.hp}/${f.maxHp}`), el('span', { class: 'energy', 'aria-label': `Light ${f.energy}` }, ...Array.from({ length: 6 }, (_, i) => el('i', { class: i < f.energy ? 'on' : '' })))),
    label(`MIGHT ${f.might} · DEPTH ${f.depth} · RAD ${f.radiance} · GUARD ${f.guard} · SPEED ${f.speed}`),
    el('div', { class: 'row start chips' }, ...f.traits.map((t) => el('span', { class: 'k-tag trait', title: t.desc }, t.name)), ...statuses),
  );
  const slot = el('div', { class: 'f-pet' }, pet);
  return el('div', { class: `fighter pet-card active side-${side}${f.hp <= 0 ? ' down' : ''}${f.fused ? ' fused' : ''}`, 'data-side': side }, ...(side === 'you' ? [slot, info] : [info, slot]));
};

interface Pet { readonly key: string; readonly h: Creature }
const petKey = (f: Fighter): string => `${f.serialNumber}:${f.fused ? 'fused' : f.slot}:${f.name}`;

const battle: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let bg: { spec: ReturnType<AppContext['universes']['fromSerial']>; children: readonly FoldNode[]; addr: ReturnType<AppContext['fold']['root']> } | null = null;
  let t = 0;
  let fusing = false;
  let detail = 'Pick a move. Their next move is shown above; faster acts first.';
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
      for (const f of c.battle.mine) {
        const e = c.box.slots()[f.slot];
        if (e && !f.fused) c.battle = c.battles.refresh(c.battle, f.slot, c.battles.fighter(c.universes.fromSerial(e.serialNumber), e.stats, f.slot));
      }
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
            st.h.play(h.heal ? (h.tag === 'FUSED' ? 'fuse' : 'heal') : h.crit ? 'crit' : 'hit');
            if (dies) later(440, () => fall(h.to));
            if (!host) return;
            // Numbers fly off whoever was hit or healed.
            const n = el('span', { class: `float${h.heal ? ' heal' : ''}${h.crit ? ' crit' : ''}` }, `${h.heal ? '+' : '−'}${h.amount}${h.tag ? ` ${h.tag}` : ''}`);
            const x = 14 + ((i * 37) % 44);
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
        const big = b.hits.some((h) => h.crit && !h.heal);
        c.audio.sfx(b.outcome === 'won' ? 'win' : b.outcome === 'lost' ? 'lose' : sfx);
        if (b.hits.some((h) => h.to === 'you' && !h.heal)) setTimeout(() => c.audio.sfx(big ? 'crit' : 'strike'), 300);
        c.persist();
        render(false);
        animate(a, theirA, old);
        if (a.type === 'fuse') { flash(root); burst(root, root.clientWidth / 2, 420, 24, true); }
        if (b.outcome === 'won') { flash(root); burst(root, root.clientWidth / 2, 300, 22, true); }
      };
      const SKILL_SFX: Record<string, string> = { strike: 'strike', kindle: 'fire', rime: 'freeze', undertow: 'water', avalanche: 'quake', overgrow: 'seed', unmake: 'erase', fold: 'fold', shine: 'heal', align: 'flare' };
      const render = (sync = true) => {
        const b = c.battle!;
        const me = b.mine[b.myActive]!, them = b.theirs[b.theirActive]!;
        const spec = c.universes.fromSerial(me.serialNumber);
        if (!bg || bg.spec.serialNumber !== spec.serialNumber) { const addr = c.fold.root(spec); bg = { spec, addr, children: c.fold.childrenOf(addr) }; }
        const adv = c.battles.advantage(me.element, them.element);
        const kids: (HTMLElement | null)[] = [
          el('header', { class: 'row' }, backChip('FLEE', () => { c.battle = c.battles.flee(c.battle!); c.battle = null; c.go('outside'); }), label(`${b.rival.name.toUpperCase()} · TURN ${b.turn + 1}`)),
          card(them, c, 'them', petFor('them', them, sync).el),
          el('div', { class: 'row' },
            el('span', { class: 'k-tag intent' }, b.outcome === 'ongoing' ? `NEXT: ${b.intent.label.toUpperCase()}` : '—'),
            el('div', { class: 'row start bench' }, ...b.theirs.map((f, i) => (i === b.theirActive ? null : el('span', { class: `k-tag${f.hp <= 0 ? ' down' : ''}` }, f.name))).filter((x): x is HTMLElement => !!x)),
          ),
          el('ol', { class: 'battle-log' }, ...b.log.slice(-3).map((l) => el('li', { class: `log-${l.side}` }, l.text))),
          card(me, c, 'you', petFor('you', me, sync).el),
        ];
        if (b.outcome === 'ongoing') {
          const bench = b.mine.map((f, i) => ({ f, i })).filter((x) => x.i !== b.myActive);
          kids.push(
            label(adv > 1 ? `${me.element.toUpperCase()} BEATS ${them.element.toUpperCase()}` : adv < 1 ? `${me.element.toUpperCase()} IS WEAK TO ${them.element.toUpperCase()}` : 'EVEN ELEMENTS'),
            el('div', { class: 'skills' }, ...me.skills.map((s) => {
              const a: BattleAction = { type: 'skill', id: s.id };
              const ok = c.battles.can(b, a);
              const cost = s.id === 'align' && me.traits.some((x) => x.id === 'reaching') ? 4 : s.cost;
              const btn = el('button', { class: `k-btn skill${s.id === 'align' ? ' ult' : ''}`, type: 'button', 'data-id': `skill-${s.id}`, disabled: !ok }, el('b', {}, s.name), el('small', {}, cost ? `${cost} LIGHT` : 'FREE'));
              btn.addEventListener('click', () => play(a, SKILL_SFX[s.id] ?? 'strike'));
              btn.addEventListener('pointerenter', () => { detail = `${s.name}: ${s.desc}`; hint.textContent = detail; });
              return btn;
            }), (() => {
              const g = el('button', { class: 'k-btn skill', type: 'button', 'data-id': 'guard' }, el('b', {}, 'Guard'), el('small', {}, '+1 LIGHT'));
              g.addEventListener('click', () => play({ type: 'guard' }, 'stone'));
              return g;
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
            ),
            hint,
            button(`Go into ${me.name}`, () => {
              // The battle waits. Change their sky, bless them, burn them, walk among them.
              c.box.select(me.slot);
              c.selection.universe = spec;
              c.selection.star = null;
              c.selection.system = null;
              c.selection.planetIndex = 0;
              c.go('planet');
            }, { id: 'go-in', disabled: me.fused }),
          );
          hint.textContent = detail;
        } else if (b.outcome === 'won') {
          kids.push(narration('Their box is open. Take one universe home.'),
            el('div', { class: 'row nowrap catch-row' }, ...b.theirs.map((f) => el('div', { class: 'catch' },
              // Shown as it will be once it is yours: on its feet again.
              portrait(c, { ...f, hp: f.maxHp, guarding: false, status: { burn: 0, chill: 0, ward: 0, regen: 0, expose: 0 } }, 72),
              button(f.name, () => {
                const slot = c.box.add(f.serialNumber);
                const piece = SKY_PIECE_KINDS[(b.rival.id + f.serialNumber) % SKY_PIECE_KINDS.length]!;
                c.sky.grant(piece, 2);
                c.rivalsBeaten.add(b.rival.id);
                c.light.addGlow(1500);
                c.battle = null;
                c.audio.sfx('catch');
                c.persist();
                const caught = creature(c.universes.fromSerial(f.serialNumber), undefined, { size: 150 });
                clearPets();
                root.replaceChildren(
                  el('h1', { class: 'k-title' }, slot >= 0 ? `${f.name} is yours.` : 'Your box is full.'),
                  el('div', { class: 'center caught' }, slot >= 0 ? caught.el : null),
                  narration(slot >= 0 ? `It sits in slot ${slot + 1}. Mote found two ${piece}s in their box too.` : `You leave it. Mote takes two ${piece}s instead.`),
                  button('Back outside', () => c.go('outside'), { primary: true, id: 'back-outside' }),
                );
                if (slot >= 0) caught.play('enter');
              }, { id: `catch-${f.serialNumber}` }),
            ))));
        } else {
          kids.push(narration('You lost. Mote dims.'), button('Home', () => { c.light.spend(1); c.battle = null; c.persist(); c.go('bedroom'); }, { primary: true, id: 'home' }));
        }
        root.replaceChildren(...kids.filter((x): x is HTMLElement => !!x));
      };
      const hint = el('p', { class: 'k-label tool-hint' }, detail);
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
