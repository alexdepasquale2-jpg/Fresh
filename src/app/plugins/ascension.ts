/**
 * Ascension: what follows the room at the bottom. The mirror room (src/ui/mirror) keeps the state
 * (floors, pieces of the answer, the child, the layers above); this plugin applies the boons kept
 * on waking, says which layer you are on, and shows it all on one hub page.
 *
 * A waking never wipes the Box or the save. It raises the level, grants the boon, clears the floors
 * of the run and changes which universes the room hands over.
 *
 * TEST ONLY: localStorage 'sallow-ascension-test' = '1' lowers the conditions (2 floors, 2 pieces).
 */
import './ascension.css';
import type { Plugin } from '../plugins';
import { el, label, narration, stat, displayName, pieceCount, quote, plural as count } from '@/ui/kit';
import { load, save, readSeen, needs, canWake, canEnter, BOONS, FRAGMENTS, rank, regard, topLayer, layerOf, wakePieces, guestSerial, testMode } from '@/ui/mirror/endgame';

/** Glow points a second (1000 = one pip) the night light gives per rank, in the bedroom. */
const EMBER_PER_S = 8;
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const plugin: Plugin = (shell) => {
  const { ctx } = shell;
  const visited = () => { const s = load(); return s.floorsEver > 0 || s.visits > 0 || readSeen().length > 0; };

  /** Apply what was kept, once, after a waking. */
  const applyWake = () => {
    const s = load();
    if (!s.wakePending) return;
    s.wakePending = false;
    const got: string[] = [];
    const pieces = wakePieces(s.level, rank(s, 'pockets'));
    for (const k of pieces) ctx.sky.grant(k, 1);
    if (pieces.length) got.push(`${count(pieces.length, 'sky piece', 'sky pieces', true)} in your pockets`);
    let guests = 0;
    for (let i = 0; i < rank(s, 'guest'); i++) {
      const owned = ctx.box.slots().flatMap((e) => (e ? [e.serialNumber] : []));
      const serial = guestSerial(s.level, i, owned);
      if (serial >= 0 && ctx.box.add(serial) >= 0) guests++;
    }
    if (guests) got.push(guests === 1 ? 'a universe you never caught' : `${count(guests, 'universe', 'universes', true)} you never caught`);
    if (rank(s, 'lamp') > 0) { ctx.light.addGlow(8000); got.push('Mote full of Light'); }
    save();
    ctx.persist();
    shell.toast(`You wake. The ${ORDINAL[s.level - 1] ?? `${s.level}th`} waking.${got.length ? ` You have ${got.join(', ')}.` : ' Your boon is with you.'}`, { title: `Run ${s.level + 1}`, sfx: 'chapter' });
  };

  let emberMs = 0;
  let booted = false;
  shell.onFrame((dt) => {
    try {
      if (!booted) { booted = true; if (shell.current() === 'bedroom') applyWake(); }
      if (shell.current() !== 'bedroom') return;
      emberMs += Math.min(dt, 250);
      if (emberMs < 1000) return;
      emberMs -= 1000;
      const r = rank(load(), 'ember');
      if (r > 0 && ctx.light.view().pips < 8) ctx.light.addGlow(EMBER_PER_S * r);
    } catch { /* never into the frame loop */ }
  });

  shell.onNavigate((_from, to) => {
    try {
      if (to === 'bedroom') applyWake();
      if (to === 'dive') {
        const u = ctx.selection.universe;
        const layer = u ? layerOf(load(), u.serialNumber) : 0;
        if (u && layer > 0) shell.toast(`${displayName(u)} came out of their box. You are ${plural(layer, 'layer', 'layers')} above your own room.`, { title: `Layer ${layer} up`, sfx: 'zoom-out' });
      }
    } catch { /* a notice is not worth a crash */ }
  });

  shell.menu.add({
    id: 'ascension',
    get label() { return visited() ? 'Ascension' : '· · · · ·'; },
    get hint() { return visited() ? 'Whose box are you in?' : 'Something at the bottom of a universe.'; },
    order: 60,
    badge: () => { const s = load(); return s.unread > 0 ? `${s.unread} new` : canWake(s) ? 'wake' : null; },
    render: (into) => {
      if (!visited()) {
        into.append(el('div', { class: 'asc-page', 'data-id': 'asc-locked' },
          narration('Nothing is written here yet.'),
          narration('Every universe has a floor. Hold on past the last fold and see what is under it.')));
        return;
      }
      const s = load();
      if (s.unread) { s.unread = 0; save(); }
      const n = needs(s);
      const top = topLayer(s);
      const bar = (have: number, need: number, what: string) => el('div', { class: 'asc-prog' },
        el('span', {}, what), el('div', { class: 'asc-bar' }, el('i', { style: `width:${Math.min(100, Math.round((have / Math.max(1, need)) * 100))}%` })), el('b', {}, `${Math.min(have, need)}/${need}`));
      const held = BOONS.filter((b) => rank(s, b.id) > 0);
      const fact = (n: number, one: string, many: string) => el('span', {}, el('b', {}, String(n)), ` ${n === 1 ? one : many}`);
      // Things taken are stored as words; older saves hold "a rings", "a dust".
      const carried = (what: string) => { const m = /^an? (comet|moon|belt|sun|rings|dust)$/.exec(what); return m ? pieceCount(m[1]!, 1) : what === 'a pip of light' ? 'a pip of Light' : what; };
      const aboveNames = Object.keys(s.above).map((k) => { try { return `${displayName(ctx.universes.fromSerial(Number(k)))} (${plural(s.above[k] ?? 1, 'layer', 'layers')} up)`; } catch { return ''; } }).filter(Boolean);
      into.append(el('div', { class: 'asc-page', 'data-id': 'asc-page' },
        el('div', { class: 'asc-stats' },
          stat(s.level + 1, 'run').el, stat(s.level, 'wakings').el, stat(s.floors.length, 'floors').el, stat(`${s.fragments}/${FRAGMENTS.length}`, 'pieces').el),
        el('section', { class: 'asc-card' },
          label(canWake(s) ? 'You can wake' : 'To wake'),
          bar(s.floors.length, n.floors, 'Floors this run'),
          bar(s.fragments, n.fragments, 'Pieces found'),
          narration(canWake(s)
            ? 'Go down to any floor and choose to wake up. You keep one thing. Your Box stays as it is.'
            : 'Reach the floors of different universes. Each new floor gives one piece of the answer.'),
          testMode() ? el('p', { class: 'asc-test', 'data-id': 'asc-test' }, 'Test flag on: conditions lowered.') : null),
        el('section', { class: 'asc-card' },
          label(`Boons held · ${s.boons.length}`),
          ...(held.length
            ? held.map((b) => el('div', { class: 'asc-boon', 'data-id': `asc-boon-${b.id}` }, el('b', {}, rank(s, b.id) > 1 ? `${b.name} ×${rank(s, b.id)}` : b.name), el('span', {}, b.text)))
            : [narration('None yet. A boon is kept each time you wake.')])),
        el('section', { class: 'asc-card' },
          label('The layers'),
          narration(top > 0
            ? `You have gone ${plural(top, 'layer', 'layers')} up through their box. ${aboveNames.join('. ')}.`
            : canEnter(s) ? 'Their box will open for you now. It leads one layer up.' : `Your own room is layer 0. Their box opens after ${plural(n.enter, 'piece', 'pieces')} of the answer.`)),
        el('section', { class: 'asc-card' },
          label('The other child'),
          narration(`The child ${regard(s)}.`),
          el('div', { class: 'asc-facts' },
            fact(s.talks, 'talk', 'talks'),
            fact(s.lamps, 'pip left burning', 'pips left burning'),
            fact(s.left.length, 'piece on their shelf', 'pieces on their shelf'),
            fact(s.debt, 'thing taken', 'things taken'),
            fact(s.watched.length, 'universe shown', 'universes shown')),
          narration(s.promised ? 'You promised to come back.' : 'You have not promised to come back.'),
          s.last ? narration(`The last thing you told them: ${quote(s.last.words)}`) : null,
          s.taken.length ? narration(`Carried up: ${s.taken.slice(-4).map((t) => carried(t.what)).join(', ')}.`) : null),
        el('section', { class: `asc-card asc-story${s.ended ? ' end' : ''}`, 'data-id': 'asc-story' },
          label(s.ended ? 'Whose box are you in? · the answer' : 'Whose box are you in? · so far'),
          ...FRAGMENTS.map((f, i) => (i < s.fragments
            ? el('p', { class: 'asc-frag', 'data-id': `asc-frag-${i}` }, el('b', {}, String(i + 1)), f)
            : el('p', { class: 'asc-frag missing' }, el('b', {}, String(i + 1)), 'A floor not reached yet.'))))));
    },
  });
};
