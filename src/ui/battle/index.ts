// Outside and Battle screens (ui/battle). The bedroom layer: find other kids, fight
// with your universes, step into one mid-battle to change it, catch theirs.
import type { ScreenFactory, AppContext } from '@/contracts/app';
import type { Fighter, BattleAction } from '@/contracts/battle';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import type { FoldNode } from '@/contracts/fold';
import { el, button, backChip, label, narration, tag, lightPips, glyphChar } from '@/ui/kit';

const team = (c: AppContext): Fighter[] =>
  c.box.slots()
    .map((s, slot) => (s ? c.battles.fighter(c.universes.fromSerial(s.serialNumber), s.stats, slot) : null))
    .filter((f): f is Fighter => f !== null)
    .sort((a, b) => b.might + b.depth + b.radiance - (a.might + a.depth + a.radiance))
    .slice(0, 3);

const outside: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  return {
    id: 'outside',
    mount: (root, c) => {
      ctx = c;
      const mine = team(c);
      const power = mine.reduce((n, f) => n + f.might + f.depth + f.radiance, 0);
      root.append(
        el('header', { class: 'row' }, backChip('ROOM', () => c.go('bedroom')), lightPips(c.light.view().pips).el),
        el('h1', { class: 'k-title' }, 'Outside'),
        narration('Mote dims out here. Other kids keep boxes too, and theirs are hungry.'),
        label(`YOUR STRONGEST · ${mine.map((f) => f.name).join(' · ') || 'none'} · POWER ${power}`),
        el('div', { class: 'rivals' }, ...c.battles.rivals().map((r) => {
          const beaten = c.rivalsBeaten.has(r.id);
          const locked = r.id > 0 && !c.rivalsBeaten.has(r.id - 1) && !beaten;
          return el('section', { class: `rival${beaten ? ' beaten' : ''}${locked ? ' locked' : ''}` },
            el('div', { class: 'row' }, el('span', { class: 'k-title small' }, locked ? '???' : r.name), label(beaten ? 'BEATEN' : `LEVEL ${r.level}`)),
            label(locked ? 'somewhere further out' : r.where),
            locked ? null : button(beaten ? 'Fight again' : 'Find them', () => {
              const theirs = c.battles.rivalTeam(r, (s) => c.universes.fromSerial(s));
              c.battle = c.battles.start(r, team(c), theirs);
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

const card = (f: Fighter, c: AppContext, active: boolean) => {
  const spec = c.universes.fromSerial(f.serialNumber);
  const pct = Math.round((f.hp / f.maxHp) * 100);
  return el('div', { class: `fighter${active ? ' active' : ''}${f.hp <= 0 ? ' down' : ''}` },
    el('div', { class: 'row nowrap' }, el('span', { class: 'glyph' }, glyphChar(spec.glyph)), el('span', { class: 'k-title small' }, f.name), tag(f.element)),
    el('div', { class: 'hp' }, el('i', { style: `width:${pct}%` })),
    label(`HP ${f.hp}/${f.maxHp} · MIGHT ${f.might} · DEPTH ${f.depth} · RADIANCE ${f.radiance}${f.ward ? ' · WARDED' : ''}`),
  );
};

const battle: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let bg: { spec: ReturnType<AppContext['universes']['fromSerial']>; children: readonly FoldNode[]; addr: ReturnType<AppContext['fold']['root']> } | null = null;
  let t = 0;
  return {
    id: 'battle',
    mount: (root, c) => {
      ctx = c;
      if (!c.battle) { c.go('outside'); return; }
      // Coming back from inside a universe: fighters become what their worlds are now.
      for (const f of c.battle.mine) {
        const e = c.box.slots()[f.slot];
        if (e) c.battle = c.battles.refresh(c.battle, f.slot, c.battles.fighter(c.universes.fromSerial(e.serialNumber), e.stats, f.slot));
      }
      const render = () => {
        const b = c.battle!;
        const me = b.mine[b.myActive]!, them = b.theirs[b.theirActive]!;
        const spec = c.universes.fromSerial(me.serialNumber);
        if (!bg || bg.spec.serialNumber !== spec.serialNumber) { const addr = c.fold.root(spec); bg = { spec, addr, children: c.fold.childrenOf(addr) }; }
        const act = (a: BattleAction, target?: number) => () => { c.battle = c.battles.act(c.battle!, a, target); after(); };
        const kids: (HTMLElement | null)[] = [
          el('header', { class: 'row' }, backChip('FLEE', () => { c.battle = c.battles.flee(c.battle!); c.battle = null; c.go('outside'); }), label(b.rival.name.toUpperCase())),
          card(them, c, true),
          el('div', { class: 'row start bench' }, ...b.theirs.map((f, i) => (i === b.theirActive ? null : el('span', { class: `k-tag${f.hp <= 0 ? ' down' : ''}` }, f.name))).filter((x): x is HTMLElement => !!x)),
          el('ol', { class: 'battle-log' }, ...b.log.slice(-5).map((l) => el('li', { class: `log-${l.side}` }, l.text))),
          el('div', { class: 'spacer' }),
          card(me, c, true),
          el('div', { class: 'row start bench' }, ...b.mine.map((f, i) => {
            if (i === b.myActive) return null;
            const s = el('button', { class: `k-tag swap${f.hp <= 0 ? ' down' : ''}`, type: 'button', disabled: f.hp <= 0 || b.outcome !== 'ongoing' }, `SWAP: ${f.name}`);
            s.addEventListener('click', act('swap', i));
            return s;
          }).filter((x): x is HTMLButtonElement => !!x)),
        ];
        if (b.outcome === 'ongoing') {
          kids.push(
            el('div', { class: 'row nowrap' }, button('Strike', act('strike'), { id: 'strike' }), button('Fold', act('fold'), { id: 'fold' }), button('Shine', act('shine'), { id: 'shine' })),
            button(`Go into ${me.name}`, () => {
              // The battle waits. Change their sky, bless them, burn them, walk among them.
              c.box.select(me.slot);
              c.selection.universe = spec;
              c.selection.star = null;
              c.selection.system = null;
              c.selection.planetIndex = 0;
              c.go('planet');
            }, { primary: true, id: 'go-in' }),
          );
        } else if (b.outcome === 'won') {
          kids.push(narration('Their box is open. Take one universe home.'),
            el('div', { class: 'row nowrap' }, ...b.theirs.map((f) => button(f.name, () => {
              const slot = c.box.add(f.serialNumber);
              const piece = SKY_PIECE_KINDS[(b.rival.id + f.serialNumber) % SKY_PIECE_KINDS.length]!;
              c.sky.grant(piece, 2);
              c.rivalsBeaten.add(b.rival.id);
              c.light.addGlow(1500);
              c.battle = null;
              c.persist();
              root.replaceChildren(
                el('h1', { class: 'k-title' }, slot >= 0 ? `${f.name} is yours.` : 'Your box is full.'),
                narration(slot >= 0 ? `It sits in slot ${slot + 1}. Mote found two ${piece}s in their box too.` : `You leave it. Mote takes two ${piece}s instead.`),
                button('Back outside', () => c.go('outside'), { primary: true, id: 'back-outside' }),
              );
            }, { id: `catch-${f.serialNumber}` }))));
        } else {
          kids.push(narration('You lost. Mote dims.'), button('Home', () => { c.light.spend(1); c.battle = null; c.persist(); c.go('bedroom'); }, { primary: true, id: 'home' }));
        }
        root.replaceChildren(...kids.filter((x): x is HTMLElement => !!x));
      };
      const after = () => { c.persist(); render(); };
      render();
    },
    frame: (dt) => {
      if (!ctx?.battle || !bg) { ctx?.gl.clear('#17140c'); return; }
      t += dt;
      ctx.renderers.dive.draw({
        dive: { phase: 'hovering', universe: bg.spec, address: bg.addr, depth: 0, best: 0, progress: Math.floor((t / 12) % 1000), children: bg.children, reliquaries: 0, star: null, narration: '' },
        pulse: ctx.pulse().phase(), lightPips: 3,
      }, dt);
    },
    unmount: () => void (ctx = null),
  };
};

export const factory = () => ({ outside, battle });
