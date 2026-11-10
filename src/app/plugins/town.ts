// The Street: the hub page for the town (errands, pockets, map, tallies), toasts for what happens out there,
// and the way back: a battle begun in the street returns to the street, not to the old list of doors.
// State is owned by src/game/town (localStorage 'sallow-town'); this plugin keeps none of its own.
import type { Plugin } from '../plugins';
import { el } from '@/ui/kit';
import { loadTown, loaded, whenLoaded, type TownMods } from '@/ui/town/lazy';
import './town.css';

export const plugin: Plugin = (shell) => {
  // The town is a chunk of its own: nothing of it is loaded until the street is entered or this page is opened.
  let unseen = 0;

  whenLoaded(({ town, game: { PLACES } }) => town.on((e) => {
    try {
      if (e.type === 'quest') { unseen++; shell.toast(e.text, { title: e.state === 'start' ? `New errand · ${e.name}` : e.state === 'done' ? `Done · ${e.name}` : e.name, sfx: '' }); }
      else if (e.type === 'find') shell.toast(`You pick up ${e.name}. ${e.have} of ${e.of}.`, { title: 'Found', sfx: '' });
      else if (e.type === 'place') { const p = PLACES.find((x) => x.id === e.id); if (p?.stop) shell.toast(`${e.name}. The 4 will bring you back here now.`, { title: 'Bus stop found', sfx: '' }); }
      else if (e.type === 'note') shell.toast(e.text, e.title ? { title: e.title, sfx: '' } : { sfx: '' });
    } catch { /* a toast must never break the walk */ }
  }));

  // A battle that began in the street ends in the street.
  shell.onNavigate((from, to) => {
    try {
      const m = loaded();
      if (!m) return;
      const town = m.town, st = town.state;
      if (!st.fromTown) return;
      if (from === 'battle' && to === 'outside') { st.fromTown = false; town.save(); window.setTimeout(() => shell.ctx.go('town'), 0); }
      else if (to === 'bedroom' || to === 'box' || to === 'mirror' || (to === 'town' && !shell.ctx.battle)) { st.fromTown = false; town.save(); }
    } catch { /* stay where the game put us */ }
  });

  shell.menu.add({
    id: 'street', label: 'Street', hint: 'Errands, pockets and the map of the neighbourhood', order: 12,
    badge: () => (unseen > 0 ? `${unseen} new` : null),
    render: (into, close) => {
      unseen = 0;
      const wait = el('p', { class: 'k-narration street-dim', 'data-id': 'street-loading' }, 'The street…');
      into.append(wait);
      void loadTown().then((m) => { if (!wait.isConnected) return; wait.remove(); try { m.bindTown(shell.ctx); } catch { /* binds again on the street */ } page(m, into, close); }).catch(() => { wait.textContent = 'The street will not come just now.'; });
    },
  });
  const page = ({ town, paintMap, game: { COLLECT, ITEMS, NPCS, QUESTS, PLACES, clockText, dayOf } }: TownMods, into: HTMLElement, close: () => void): void => {
    {
      const st = town.state, f = town.facts();
      const sec = (title: string, ...kids: (HTMLElement | null)[]): HTMLElement => el('section', { class: 'street-sec' }, el('h3', { class: 'k-label' }, title), ...kids);
      const all = town.quests(), active = all.filter((q) => !q.st.done), done = all.filter((q) => q.st.done);
      const go = el('button', { class: 'k-btn k-btn--primary', type: 'button', 'data-id': 'street-go' }, shell.current() === 'town' ? 'Back to the street' : 'Go out to the street');
      go.addEventListener('click', () => { close(); if (shell.current() !== 'town') shell.ctx.go('town'); });
      const map = el('canvas', { class: 'street-map', 'data-id': 'street-map' });
      paintMap(map, town, 2);
      const met = NPCS.filter((n) => (st.talks[n.id] ?? 0) > 0);
      into.append(
        el('p', { class: 'k-narration', 'data-id': 'street-when' }, `Day ${dayOf(st.minutes) + 1}, ${clockText(st.minutes)}, ${town.phase()}. ${st.coins} coin${st.coins === 1 ? '' : 's'}. ${town.districtAt(Math.floor(st.x / 16), Math.floor(st.y / 16))}.`),
        go,
        sec(`Errands · ${active.length} open, ${done.length} of ${QUESTS.length} done`,
          active.length ? null : el('p', { class: 'k-narration street-dim' }, 'Nobody has asked anything of you yet. Ines, two doors along, is watching the street.'),
          ...active.map((q) => el('div', { class: `street-card${q.def.thread === 'main' ? ' main' : ''}`, 'data-id': `street-quest-${q.def.id}` }, el('b', {}, q.def.name), el('small', {}, q.hint), el('span', { class: 'k-label' }, `${q.def.thread === 'main' ? 'THE BOXES' : 'SIDE'} · STEP ${q.st.stage + 1}/${q.def.steps.length}`))),
          ...done.map((q) => el('div', { class: 'street-card done' }, el('b', {}, `✓ ${q.def.name}`), el('small', {}, q.def.end)))),
        sec('Map', map, el('p', { class: 'k-label street-dim' }, `${st.districts.length}/12 districts · ${st.places.filter((p) => PLACES.find((x) => x.id === p)?.stop).length}/5 bus stops · mint is you`)),
        sec('Pockets', ...(ITEMS.filter((i) => st.bag[i.id]).length ? ITEMS.filter((i) => st.bag[i.id]).map((i) => el('div', { class: 'street-card' }, el('b', {}, (st.bag[i.id] ?? 0) > 1 ? `${i.name} ×${st.bag[i.id]}` : i.name), el('small', {}, i.desc))) : [el('p', { class: 'k-narration street-dim' }, 'Empty, apart from lint and a little light.')])),
        sec('Collections', ...COLLECT.map((k) => { const have = st.found.filter((x) => x.startsWith(k.id + '-')).length; return el('div', { class: `street-card${have >= k.count ? ' done' : ''}` }, el('b', {}, `${k.name} · ${have}/${k.count}`), el('div', { class: 'street-pips' }, ...Array.from({ length: k.count }, (_, i) => el('i', { class: i < have ? 'on' : '' }))), el('small', {}, have >= k.count ? k.says : 'Lying about the neighbourhood, where people stopped looking.')); })),
        sec(`People · ${met.length}/${NPCS.length} met`, ...met.map((n) => el('div', { class: 'street-card' }, el('b', {}, n.name), el('small', {}, n.about)))),
        sec('Tallies',
          el('div', { class: 'street-stats' },
            ...([['Steps', st.stats.steps], ['Talks', st.stats.talks], ['Bus rides', st.stats.rides], ['Benches sat', st.stats.sits], ['Best skim', st.skim.best], ['Rivals beaten', f.beaten], ['Deepest fold', f.deepest], ['Universes', f.count]] as const)
              .map(([k, v]) => el('div', { class: 'k-stat' }, el('b', {}, String(v)), el('span', {}, k))))),
      );
    }
  };
};
