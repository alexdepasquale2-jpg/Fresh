// The room at the bottom of a universe: a kid, a PC, a box. "Whose box are you in?"
// After the lines, the room is a place: speak, look into their box, leave, take, go up, wake.
import type { ScreenFactory, AppContext } from '@/contracts/app';
import type { UniverseSpec } from '@/contracts/universe';
import type { SkyPieceKind } from '@/contracts/sky';
import type { RoomRenderView } from '@/contracts/render';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { el, backChip, button, narration, label, flash, burst, glyphChar } from '@/ui/kit';
import {
  load, save, markSeen, giftSerial, aboveSerial, visitSeed, converse, seenLines, shelf, layerOf, needs, canWake, canEnter,
  offered, rank, returnGlow, floorGlow, floorSuns, takesAllowed, FRAGMENTS,
} from './endgame';
import './mirror.css';

export { giftSerial };

const NUMBER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five'];
const count = (n: number, one: string, many: string) => `${NUMBER[n] ?? String(n)} ${n === 1 ? one : many}`;
const FLIP = 'scaleX(-1)';
const A_PIECE: Record<string, string> = { comet: 'a comet', moon: 'a moon', belt: 'a belt of stones', sun: 'a small sun', rings: 'a set of rings', dust: 'a veil of dust' };
const aPiece = (k: string) => A_PIECE[k] ?? `a ${k}`;
const THE_PIECE: Record<string, string> = { belt: 'belt of stones', rings: 'set of rings', dust: 'veil of dust' };
const piece1 = (k: string) => THE_PIECE[k] ?? k;
/** The name the player gave a universe in the Box, if any (the Box keeps them in this store). */
const nameOf = (u: UniverseSpec): string => {
  try {
    const all = JSON.parse(localStorage.getItem('sallow-box-names') ?? '{}') as Record<string, unknown> | null;
    const n = all?.[String(u.serialNumber)];
    return typeof n === 'string' && n.trim() ? n : u.name;
  } catch { return u.name; }
};

interface Beat {
  /** The line, read when it is spoken. */
  readonly text: () => string;
  /** Milliseconds the line is held before the next comes by itself. 0 = it stays. */
  readonly hold: number;
  readonly kind?: 'peak' | 'piece';
  readonly on?: () => void;
}
const line = (text: string, hold: number, on?: () => void): Beat => ({ text: () => text, hold, on });

const mirror: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let beats: Beat[] = [];
  let at = -1;
  let wait = 0;
  let advance: (() => void) | null = null;
  let prevTransform = '';
  // One view object, changed in place each frame.
  let view: { -readonly [K in keyof RoomRenderView]: RoomRenderView[K] } | null = null;
  return {
    id: 'mirror',
    mount: (root, c) => {
      ctx = c;
      const s = load();
      const slot = c.box.selected();
      const slots = c.box.slots();
      const u = c.selection.universe ?? c.universes.fromSerial(slots[slot]?.serialNumber ?? 0);
      c.selection.universe = u;
      const newFloor = !s.floors.includes(u.serialNumber);
      const veryFirst = s.floorsEver === 0;
      const held = c.box.count();
      const layer = layerOf(s, u.serialNumber);
      s.visits++;
      save();
      const seed = visitSeed(u, s);
      // Their room is yours, seen from the other side. Whatever happens, leaving puts the canvas back as it was.
      prevTransform = c.gl.canvas.style.transform.replace(FLIP, '').trim();
      c.gl.canvas.style.transform = `${prevTransform} ${FLIP}`.trim();
      // The child goes to stand by its box (bottom corner of the room).
      const sc = (c.gl.width() - 30) / 60;
      view = { scene: 1, kid: { x: c.gl.width() / 2, y: 400 }, target: { x: 15 + 41 * sc, y: 84 + 68 * sc }, pulse: c.pulse().phase(), lightPips: c.light.view().pips };

      const depth = c.dive.view().depth;
      const place = label(`${depth > 0 ? `FOLD ${depth} · ` : ''}THE FLOOR${layer > 0 ? ` · ${layer} UP` : ''}`);
      place.setAttribute('data-id', 'mirror-place');
      const says = el('div', { class: 'mr-says', 'aria-live': 'polite', 'data-id': 'mirror-says' });
      const actions = el('div', { class: 'mr-actions' });
      // Their box: your own box, slot for slot. The lit slot is the one you opened.
      const grid = el('div', { class: 'mr-box', hidden: true, 'aria-hidden': 'true' },
        ...Array.from({ length: 25 }, (_, i) => el('i', { class: i === slot ? 'lit' : slots[i] ? 'held' : undefined })));
      const panel = el('div', { class: 'mr-panel', hidden: true });
      const stage = el('div', { class: 'spacer mr-stage', 'data-id': 'mirror-stage' }, grid, panel);
      let boxShown = false;

      const put = (text: string, cls = '', id = 'mirror-line') => {
        const p = narration(text);
        if (cls) p.classList.add(cls);
        p.setAttribute('data-id', id);
        says.append(p);
        return p;
      };
      const say = (text: string, cls = '', id = 'mirror-line') => {
        for (const old of Array.from(says.children)) old.classList.add('old');
        while (says.children.length > 2) says.firstElementChild?.remove();
        return put(text, cls, id);
      };
      /** Replace everything said with these lines (the newest reads brightest). */
      const sayAll = (lines: readonly string[], cls = '') => {
        says.replaceChildren();
        lines.forEach((t) => put(t, cls));
      };
      const theirs = (text: string) => say(`“${text}”`, 'mr-child', 'mirror-child');
      const sparks = (n = 10) => { const r = root.getBoundingClientRect(); burst(root, r.width / 2, r.height * 0.42, n, n > 12); };
      const pieces = (n: number) => `${count(n, 'more piece', 'more pieces')} of the answer`;

      const up = () => { c.selection.star = null; c.selection.system = null; c.go('dive'); };
      const back = (id = 'mirror-back') => button('Back', () => { c.audio.sfx('back'); menu(); }, { id });
      const small = (text: string, fn: () => void, id: string, disabled = false) => {
        const b = button(text, fn, { id, disabled });
        b.classList.add('mr-small');
        return b;
      };
      const showPanel = (...kids: HTMLElement[]) => { panel.replaceChildren(...kids); panel.hidden = kids.length === 0; grid.hidden = kids.length > 0 || !boxShown; };

      // ---- The room, once the lines are done ----
      const menu = () => {
        showPanel();
        actions.replaceChildren(
          el('div', { class: 'mr-menu' },
            small('Speak', speak, 'mirror-speak'),
            small('Their box', look, 'mirror-look'),
            small('Leave', leave, 'mirror-leave'),
            small('Take', take, 'mirror-take'),
            small('Enter box', enter, 'mirror-enter'),
            small('Wake up', wake, 'mirror-wake')),
          button('Rise to the top of the fall', up, { primary: true, id: 'mirror-up' }),
          button('Return to your own box', () => c.go('box'), { id: 'mirror-box' }),
        );
      };

      // Speak: a short exchange. What is chosen is kept.
      const talk = converse(seed, s);
      let talkPaid = false;
      const speak = () => {
        const node = talk.node();
        if (!node) { say('The child has said what they will say, this time.'); c.audio.sfx('deny'); return; }
        c.audio.sfx('whisper');
        theirs(node.ask(s));
        const ask = () => {
          const n = talk.node();
          if (!n) return;
          actions.replaceChildren(
            label(`${talk.asked() + 1} OF ${talk.length}`),
            ...n.choices.map((ch, i) => button(ch.label, () => {
              const picked = talk.choose(i);
              if (!picked) return;
              c.audio.sfx('confirm');
              say(`You: ${picked.label}`, 'mr-you');
              theirs(picked.reply);
              const next = talk.node();
              if (next) { theirs(next.ask(s)); ask(); } else {
                if (!talkPaid) { talkPaid = true; c.light.addGlow(300); }
                say('The child turns back to the box. Mote is a little brighter for the talking.');
                c.audio.sfx('gain');
                menu();
              }
              save();
              c.persist();
            }, { id: `mirror-choice-${i}` })),
            back(),
          );
        };
        ask();
      };

      // Their box: your universes, and what they have seen you do in each.
      const look = () => {
        c.audio.sfx('open');
        const now = c.box.slots();
        const cells = now.map((e, i) => {
          if (!e) return el('button', { class: 'mr-slot', type: 'button', disabled: true, 'aria-label': 'Empty slot' });
          const spec = c.universes.fromSerial(e.serialNumber);
          const b = el('button', { class: `mr-slot held${e.serialNumber === u.serialNumber ? ' lit' : ''}${layerOf(s, e.serialNumber) > 0 ? ' above' : ''}`, type: 'button', 'data-id': `mirror-slot-${i}`, 'aria-label': nameOf(spec) }, glyphChar(spec.glyph));
          b.addEventListener('click', () => {
            for (const o of cells) o.removeAttribute('aria-pressed');
            b.setAttribute('aria-pressed', 'true');
            const fresh = !s.watched.includes(e.serialNumber);
            const lines = seenLines(spec, e.stats, s, e.serialNumber === u.serialNumber);
            sayAll([`${nameOf(spec)}. ${spec.serial}.`, ...lines]);
            if (fresh) {
              s.watched = [...s.watched, e.serialNumber].slice(-200);
              c.light.addGlow(150);
              save();
              c.persist();
              put('Being seen warms Mote a little.', 'mr-note');
              c.audio.sfx('star');
            } else c.audio.sfx('tap', 0.5);
          });
          return b;
        });
        showPanel(el('div', { class: 'mr-their', 'data-id': 'mirror-their' }, ...cells));
        sayAll(['Their box. Yours, slot for slot.', 'Touch one. They will tell you what they saw.']);
        actions.replaceChildren(back());
      };

      // Leave: one thing a visit, on their shelf or by their bed.
      let leftHere = false;
      const leave = () => {
        if (leftHere) { say('The shelf has room for one new thing at a time.'); c.audio.sfx('deny'); return; }
        const inv = c.sky.inventory();
        const kinds = SKY_PIECE_KINDS.filter((k) => inv[k] > 0);
        const done = (text: string, sfx: string) => {
          leftHere = true;
          s.trust++;
          save();
          c.persist();
          c.audio.sfx(sfx);
          sparks(8);
          say(text);
          menu();
        };
        say(kinds.length || c.light.canSpend(2) ? 'What will you leave in their room?' : 'Your pockets are empty, and Mote has no Light to spare.');
        actions.replaceChildren(
          el('div', { class: 'mr-menu' },
            ...kinds.map((k) => small(`${k} ×${inv[k]}`, () => {
              if (c.sky.inventory()[k] <= 0) return;
              c.sky.grant(k, -1);
              s.left = [...s.left, { serial: u.serialNumber, kind: k, visit: s.visits }].slice(-12);
              done(`You set ${aPiece(k)} on their shelf. The child moves it a little to the left.`, 'gift');
            }, `mirror-leave-${k}`)),
            small('A pip of Light', () => {
              if (!c.light.spend(1)) return;
              s.lamps++;
              done('A pip of Light, left burning by their bed. The room is easier to see.', 'shine');
            }, 'mirror-leave-light', !c.light.canSpend(2))),
          back(),
        );
      };

      // Take: from their shelf. They notice.
      const take = () => {
        const key = String(u.serialNumber);
        const used = s.tookAt[key] ?? 0;
        if (used >= takesAllowed(s)) { say('You have taken from this floor already. The child is watching your hands.'); c.audio.sfx('deny'); return; }
        const offers = shelf(seed, s);
        say('Their shelf. A few things, set out in a row.');
        actions.replaceChildren(
          ...offers.map((o, i) => button(o.label, () => {
            s.tookAt[key] = used + 1;
            if (o.kind === 'light') c.light.addGlow(1000 * o.n);
            else c.sky.grant(o.kind as SkyPieceKind, o.n);
            if (o.mine >= 0) {
              s.left = s.left.filter((_, j) => j !== o.mine);
              say(`Your ${piece1(o.kind)} again. It grew in their keeping: there are two now.`);
            } else {
              s.debt++;
              s.taken = [...s.taken, { serial: u.serialNumber, what: o.kind === 'light' ? 'a pip of light' : aPiece(o.kind) }].slice(-30);
              say(o.kind === 'light' ? 'You take a pip of their light. Their room is a little darker. The child says nothing.' : `You take their ${piece1(o.kind)}. The child watches it go, and counts what is left.`);
            }
            save();
            c.persist();
            c.audio.sfx('pickup');
            sparks(8);
            menu();
          }, { id: `mirror-take-${i}` })),
          back(),
        );
      };

      // Enter: their box opens one layer up.
      const enter = () => {
        if (!canEnter(s)) { say(`The lid will not lift for you yet. It wants ${pieces(needs(s).enter - s.fragments)}.`); c.audio.sfx('deny'); return; }
        const owned = c.box.slots().flatMap((e) => (e ? [e.serialNumber] : []));
        const doorKey = `${u.serialNumber}:${s.level}`;
        let serial = s.doors[doorKey] ?? -1;
        let at = serial >= 0 ? c.box.slots().findIndex((e) => e?.serialNumber === serial) : -1;
        if (at < 0) {
          serial = aboveSerial(u, owned, s.level);
          at = serial >= 0 ? c.box.add(serial) : -1;
          if (at < 0) { say('Your box has no empty slot. Their box will not open into a full one.'); c.audio.sfx('deny'); return; }
          s.above[String(serial)] = layer + 1;
          s.doors = { ...s.doors, [doorKey]: serial };
          save();
        }
        const spec = c.universes.fromSerial(serial);
        c.box.select(at);
        c.selection.universe = spec;
        c.selection.star = null;
        c.selection.system = null;
        c.persist();
        flash(root);
        c.audio.sfx('zoom-in');
        c.go('dive');
      };

      // Wake: keep one thing, and begin again.
      const wake = () => {
        const n = needs(s);
        if (!canWake(s)) {
          const f = Math.max(0, n.floors - s.floors.length);
          const p = Math.max(0, n.fragments - s.fragments);
          say(`You cannot wake yet. It wants ${[f ? count(f, 'more floor', 'more floors') : '', p ? pieces(p) : ''].filter(Boolean).join(', and ')}.`);
          c.audio.sfx('deny');
          return;
        }
        let chosen = '';
        const confirm = button('Wake with this', () => {
          if (!chosen) return;
          s.level++;
          s.boons = [...s.boons, chosen];
          s.floors = [];
          s.tookAt = {};
          s.wakePending = true;
          save();
          c.persist();
          flash(root);
          c.audio.sfx('level');
          c.go('bedroom');
        }, { primary: true, id: 'mirror-wake-confirm', disabled: true });
        const opts = offered(s).map((b) => {
          const r = rank(s, b.id);
          const btn = small(r ? `${b.name} +${r}` : b.name, () => {
            chosen = b.id;
            for (const o of opts) o.removeAttribute('aria-pressed');
            btn.setAttribute('aria-pressed', 'true');
            confirm.disabled = false;
            sayAll(['You keep one thing when you wake.', b.text]);
            c.audio.sfx('toggle', 1);
          }, `mirror-boon-${b.id}`);
          return btn;
        });
        sayAll(['“You can wake up now, if you like. Everything stays where you put it.”', 'You keep one thing when you wake. Choose it.']);
        c.audio.sfx('chapter');
        actions.replaceChildren(el('div', { class: 'mr-menu' }, ...opts), confirm, back());
      };

      // ---- The lines ----
      let gift: UniverseSpec | null = null;
      let piece = -1;
      const give = () => {
        const owned = c.box.slots().flatMap((e) => (e ? [e.serialNumber] : []));
        const serial = giftSerial(u, owned, s.level);
        const got = serial >= 0 ? c.box.add(serial) : -1;
        c.light.addGlow(floorGlow(s));
        c.sky.grant('sun', floorSuns(s) + (got >= 0 ? 0 : 1));
        markSeen(u.serialNumber);
        s.floors = [...s.floors, u.serialNumber];
        s.floorsEver++;
        if (s.fragments < FRAGMENTS.length) { piece = s.fragments; s.fragments++; s.unread++; if (s.fragments >= FRAGMENTS.length) s.ended = true; }
        save();
        c.persist();
        c.audio.sfx('catch');
        sparks(16);
        gift = got >= 0 ? c.universes.fromSerial(serial) : null;
      };
      const showBox = () => { boxShown = true; grid.hidden = !panel.hidden; };
      const peak: Beat = {
        text: () => 'Whose box are you in?',
        hold: 5200,
        kind: 'peak',
        on: () => { flash(root); c.audio.sfx('land'); try { navigator.vibrate?.([40, 80, 40]); } catch { /* not allowed */ } },
      };
      const given: Beat = line('The child holds something out. One of theirs.', 3200, give);
      const got: Beat = { text: () => (gift ? `${nameOf(gift)} is in your box now. ${floorSuns(s) > 1 ? 'Suns' : 'A sun'} with it, and light for Mote.` : 'Your box is full. Suns instead, and light for Mote.'), hold: 3600 };
      const answer: Beat = {
        text: () => (piece >= 0 ? FRAGMENTS[piece]! : 'There are no more pieces down here. The answer is whole. The child knows you know.'),
        hold: 0,
        kind: 'piece',
        on: () => { c.audio.sfx(piece === FRAGMENTS.length - 1 ? 'shine' : 'chapter'); if (piece === FRAGMENTS.length - 1) flash(root); menu(); },
      };
      const upLine = layer > 0 ? [line(`You are ${count(layer, 'layer', 'layers')} above your own room. The boards are the same boards.`, 3200)] : [];
      const shelfLine = s.left.length ? [line(`Your ${piece1(s.left[s.left.length - 1]!.kind)} is still on their shelf. It looks larger.`, 2800)] : s.lamps ? [line(`${s.lamps === 1 ? 'The pip you left is' : 'The pips you left are'} still burning by their bed.`, 2800)] : [];
      beats = !newFloor
        ? [
          line('The room again. The child does not turn.', 2600),
          ...upLine,
          line(`${nameOf(u)} is still lit in their box.`, 2800, showBox),
          ...shelfLine,
          peak,
          line(s.promised ? 'A little light has been left out for you, as promised. Mote gathers it.' : 'Nothing more is given here. Mote gathers a little light.', 0, () => { c.light.addGlow(returnGlow(s)); c.persist(); menu(); }),
        ]
        : veryFirst
          ? [
            line('A room. Small. The boards are the boards you know.', 3000),
            line('A child is here. It is not you.', 2800),
            line('A machine hums on the desk. Beside the child, a box.', 3000),
            line('Twenty-five slots. One of them is lit.', 3000, showBox),
            line(`In the lit slot: ${nameOf(u)}. ${u.serial}.`, 3200),
            line('It is the one they are looking into right now.', 3200),
            line(`Their box holds ${NUMBER[held] ?? String(held)}. So does yours.`, 3000),
            line('The child looks up.', 2600),
            peak, given, got, answer,
          ]
          : [
            line(s.level > 0 ? 'The room. You have woken from it before. It has waited.' : 'The room, under another universe. The same boards.', 3000),
            ...upLine,
            line(`In the lit slot now: ${nameOf(u)}. ${u.serial}.`, 3000, showBox),
            ...shelfLine,
            line('The child looks up sooner, this time.', 2600),
            peak, given, got, answer,
          ];

      advance = () => {
        if (at >= beats.length - 1) return;
        at++;
        const b = beats[at]!;
        b.on?.();
        if (b.kind === 'piece') {
          says.replaceChildren();
          if (piece >= 0) says.append(Object.assign(label(`A piece of the answer · ${piece + 1} of ${FRAGMENTS.length}`), { className: 'k-label mr-kicker' }));
          put(b.text(), 'mr-piece', 'mirror-fragment');
        } else say(b.text(), b.kind === 'peak' ? 'mr-peak' : '', b.kind === 'peak' ? 'mirror-peak' : 'mirror-line');
        wait = b.hold;
        if (!b.kind) c.audio.sfx('tap', 0.3);
      };
      // Tap to hasten. The lines also come by themselves.
      stage.addEventListener('pointerdown', (e) => { if (!(e.target instanceof Element && e.target.closest('button'))) advance?.(); });
      says.addEventListener('pointerdown', () => advance?.());

      root.append(el('header', { class: 'row start mr-head' }, backChip('UP', up), place), stage, says, actions);
      // Until the lines are done the only way on is a tap; say so where the buttons will be.
      actions.replaceChildren(el('p', { class: 'k-label mr-hint', 'data-id': 'mirror-hint' }, 'Tap the room to hear the next line.'));
      at = -1;
      advance();
    },
    frame: (dt) => {
      if (!ctx || !view) return;
      if (wait > 0) {
        wait -= Math.min(dt, 250);
        if (wait <= 0) advance?.();
      }
      view.pulse = ctx.pulse().phase();
      view.lightPips = ctx.light.view().pips;
      ctx.renderers.room.draw(view, dt);
    },
    unmount: () => {
      if (ctx) ctx.gl.canvas.style.transform = prevTransform;
      ctx = null;
      view = null;
      advance = null;
      beats = [];
    },
  };
};

export const factory = () => ({ mirror });
