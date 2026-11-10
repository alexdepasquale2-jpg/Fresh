// The room at the bottom of a universe: a kid, a PC, a box. "Whose box are you in?"
import type { ScreenFactory, AppContext } from '@/contracts/app';
import type { UniverseSpec } from '@/contracts/universe';
import { child, seedToU32 } from '@/core/hash';
import { el, backChip, button, narration, label, flash, burst } from '@/ui/kit';
import './mirror.css';

const SEEN_KEY = 'sallow-mirror-seen';
const readSeen = (): number[] => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
  } catch { return []; }
};
const markSeen = (serialNumber: number) => {
  try {
    const seen = readSeen();
    if (!seen.includes(serialNumber)) localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, serialNumber].slice(-200)));
  } catch { /* storage blocked */ }
};

/** The universe the child hands over: one of theirs, fixed by the seed of the one you fell through. */
export const giftSerial = (u: UniverseSpec, owned: readonly number[]): number => {
  for (let i = 0; i < 16; i++) {
    const n = seedToU32(child(child(u.seed, 'mirror-gift'), i)) & 0xffffff;
    if (n !== u.serialNumber && !owned.includes(n)) return n;
  }
  return -1;
};

const NUMBER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five'];

interface Beat {
  /** The line, read when it is spoken. */
  readonly text: () => string;
  /** Milliseconds the line is held before the next comes by itself. 0 = it stays. */
  readonly hold: number;
  readonly peak?: boolean;
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
  let target: { x: number; y: number } | null = null;
  return {
    id: 'mirror',
    mount: (root, c) => {
      ctx = c;
      const slot = c.box.selected();
      const slots = c.box.slots();
      const u = c.selection.universe ?? c.universes.fromSerial(slots[slot]?.serialNumber ?? 0);
      c.selection.universe = u;
      const first = !readSeen().includes(u.serialNumber);
      const count = c.box.count();
      // Their room is yours, seen from the other side.
      prevTransform = c.gl.canvas.style.transform;
      c.gl.canvas.style.transform = `${prevTransform} scaleX(-1)`.trim();
      // The child goes to stand by its box (bottom corner of the room).
      const s = (c.gl.width() - 30) / 60;
      target = { x: 15 + 41 * s, y: 84 + 68 * s };

      const depth = c.dive.view().depth;
      const place = label(depth > 0 ? `FOLD ${depth} · THE FLOOR` : 'THE FLOOR');
      const says = el('div', { class: 'mr-says', 'aria-live': 'polite' });
      const actions = el('div', { class: 'mr-actions' });
      // Their box: your own box, slot for slot. The lit slot is the one you opened.
      const grid = el('div', { class: 'mr-box', hidden: true, 'aria-hidden': 'true' },
        ...Array.from({ length: 25 }, (_, i) => el('i', { class: i === slot ? 'lit' : slots[i] ? 'held' : undefined })));
      const stage = el('div', { class: 'spacer mr-stage', 'data-id': 'mirror-stage' }, grid);

      const say = (b: Beat) => {
        for (const old of Array.from(says.children)) old.classList.add('old');
        while (says.children.length > 2) says.firstElementChild?.remove();
        const p = narration(b.text());
        if (b.peak) p.classList.add('mr-peak');
        p.setAttribute('data-id', b.peak ? 'mirror-peak' : 'mirror-line');
        says.append(p);
      };

      const up = () => { c.selection.star = null; c.selection.system = null; c.go('dive'); };
      const finish = () => {
        actions.replaceChildren(
          button('Rise to the top of the fall', up, { primary: true, id: 'mirror-up' }),
          button('Return to your own box', () => c.go('box'), { id: 'mirror-box' }),
        );
      };

      let gift: UniverseSpec | null = null;
      const give = () => {
        const owned = c.box.slots().flatMap((e) => (e ? [e.serialNumber] : []));
        const serial = giftSerial(u, owned);
        const got = serial >= 0 ? c.box.add(serial) : -1;
        c.light.addGlow(4000);
        c.sky.grant('sun', got >= 0 ? 1 : 2);
        markSeen(u.serialNumber);
        c.persist();
        c.audio.sfx('catch');
        const r = root.getBoundingClientRect();
        burst(root, r.width / 2, r.height * 0.5, 16, true);
        gift = got >= 0 ? c.universes.fromSerial(serial) : null;
      };

      const showBox = () => { grid.hidden = false; };
      const peak: Beat = {
        text: () => 'Whose box are you in?',
        hold: 5200,
        peak: true,
        on: () => { flash(root); c.audio.sfx('land'); try { navigator.vibrate?.([40, 80, 40]); } catch { /* not allowed */ } },
      };
      beats = first
        ? [
          line('A room. Small. The boards are the boards you know.', 3000),
          line('A child is here. It is not you.', 2800),
          line('A machine hums on the desk. Beside the child, a box.', 3000),
          line('Twenty-five slots. One of them is lit.', 3000, showBox),
          line(`In the lit slot: ${u.name}. ${u.serial}.`, 3200),
          line('It is the one they are looking into right now.', 3200),
          line(`Their box holds ${NUMBER[count] ?? String(count)}. So does yours.`, 3000),
          line('The child looks up.', 2600),
          peak,
          line('The child holds something out. One of theirs.', 3200, give),
          { text: () => (gift ? `${gift.name} is in your box now. A sun with it, and light for Mote.` : 'Your box is full. Two suns instead, and light for Mote.'), hold: 0, on: finish },
        ]
        : [
          line('The room again. The child does not turn.', 2600),
          line(`${u.name} is still lit in their box.`, 2800, showBox),
          peak,
          line('Nothing more is given here. Mote gathers a little light.', 0, () => { c.light.addGlow(800); c.persist(); finish(); }),
        ];

      advance = () => {
        if (at >= beats.length - 1) return;
        at++;
        const b = beats[at]!;
        b.on?.();
        say(b);
        wait = b.hold;
        if (!b.peak) c.audio.sfx('tap', 0.3);
      };
      // Tap to hasten. The lines also come by themselves.
      stage.addEventListener('pointerdown', () => advance?.());
      says.addEventListener('pointerdown', () => advance?.());

      root.append(el('header', { class: 'row' }, backChip('UP', up), place), stage, says, actions);
      at = -1;
      advance();
    },
    frame: (dt) => {
      if (!ctx) return;
      if (wait > 0) {
        wait -= Math.min(dt, 250);
        if (wait <= 0) advance?.();
      }
      ctx.renderers.room.draw({ scene: 1, kid: { x: ctx.gl.width() / 2, y: 400 }, target, pulse: ctx.pulse().phase(), lightPips: ctx.light.view().pips }, dt);
    },
    unmount: () => {
      if (ctx) ctx.gl.canvas.style.transform = prevTransform;
      ctx = null;
      advance = null;
      beats = [];
    },
  };
};

export const factory = () => ({ mirror });
