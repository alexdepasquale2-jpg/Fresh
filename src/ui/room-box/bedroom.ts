// The bedroom: a home. Walk to the window, the bed, the PC, the shelf, the poster, the box, and use them.
import type { ScreenFactory, AppContext } from '@/contracts/app';
import { ROOM_SPOTS } from '@/contracts/render';
import type { RoomDecor } from '@/contracts/render';
import { el, button, lightPips, narration, label } from '@/ui/kit';
import { names, sync, roomHour, weatherAt, sleepNow, roomState, totals, TROPHIES, mostTended, pick } from './store';
import type { Totals } from './store';
import './room-box.css';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
const SPOT = { window: 0, bed: 1, pc: 2, shelf: 3, poster: 4, box: 5 } as const;
const DAY_MS = 86400000;

const hourWord = (h: number) => (h < 5 ? 'the middle of the night' : h < 7 ? 'first light' : h < 12 ? 'morning' : h < 14 ? 'noon' : h < 18.5 ? 'afternoon' : h < 21 ? 'dusk' : 'night');
const clockText = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

export const bedroom: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let host: HTMLElement | null = null;
  let target: { x: number; y: number } | null = null;
  let pips: ReturnType<typeof lightPips> | null = null;
  let pending = -1;
  let sleepLeft = 0;
  let sayLeft = 0;
  let sayWait = 2600;
  let sayAt = 0;
  let clockWait = 0;
  let lastBx = -1, lastBy = -1;
  let offX = 0, offY = 0;
  let arrive: (spot: number) => void = () => {};
  let wake: () => void = () => {};
  let speak: () => void = () => {};
  let bubble: HTMLElement | null = null;
  const decor: Mutable<RoomDecor> = { hour: 12, weather: 0, trophies: [0, 0, 0, 0, 0], poster: null, asleep: false, moteMood: 0, focus: -1 };
  const start = { x: 195, y: 400 };
  return {
    id: 'bedroom',
    mount: (root, c) => {
      ctx = c;
      host = root;
      const room = c.renderers.room;
      pips = lightPips(c.light.view().pips);
      let muted = false;
      try { muted = localStorage.getItem('sallow-muted') === '1'; } catch { /* storage blocked */ }
      c.audio.setMuted(muted);
      const sound = el('button', { class: 'rb-chip', type: 'button', 'data-id': 'sound' }, muted ? 'SOUND OFF' : 'SOUND ON');
      sound.addEventListener('click', () => {
        muted = !muted;
        c.audio.setMuted(muted);
        sound.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
        try { localStorage.setItem('sallow-muted', muted ? '1' : '0'); } catch { /* storage blocked */ }
      });

      // What the room knows about the box.
      const { meta, fresh } = sync(c);
      let tot: Totals = totals(c);
      const dress = () => {
        tot = totals(c);
        decor.trophies = TROPHIES.map((t) => t.level(tot));
        const best = mostTended(c);
        const spec = best ? c.universes.fromSerial(best.serialNumber) : null;
        decor.poster = spec ? { palette: spec.palette, seed: spec.serialNumber } : null;
        decor.hour = roomHour();
        decor.weather = weatherAt(decor.hour);
      };
      dress();
      decor.moteMood = fresh.length ? 2 : 0;
      start.x = c.gl.width() / 2;

      const floor = el('div', { class: 'spacer floor rb-floor', 'data-id': 'floor' });
      const line = narration('');
      line.dataset.id = 'room-line';
      const shelf = el('div', { class: 'rb-shelf', 'data-id': 'shelf-card', hidden: true });
      const use = button('Use', () => act(), { id: 'use' });
      use.hidden = true;
      bubble = el('p', { class: 'rb-say', 'data-id': 'mote-say', 'aria-live': 'polite', hidden: true });
      let action: (() => void) | null = null;
      const act = () => action?.();
      const show = (text: string, actLabel?: string, fn?: () => void) => {
        line.textContent = text;
        action = fn ?? null;
        use.hidden = !fn;
        if (actLabel) use.textContent = actLabel;
        shelf.hidden = true;
      };
      const idle = () => show(fresh.length ? 'Something in the box is new. Mote will not leave it.' : c.box.count() > 7 ? 'The box is heavier than it was.' : 'The PC hums. Mote waits by the box.');
      idle();

      wake = () => {
        decor.asleep = false;
        root.classList.remove('rb-asleep');
        dress();
        const held = c.box.slots().filter((e) => !!e);
        const n = roomState().nights + c.clock.tick();
        const dreams: string[] = [];
        if (held.length) {
          const e = pick(held, n)!;
          const name = names.of(c.universes.fromSerial(e.serialNumber));
          if ((e.stats.souls ?? 0) > 0) dreams.push(`You dream of ${name}. ${e.stats.souls} souls under a sky you gave them.`);
          if (e.stats.belief && e.stats.belief !== 'none') dreams.push(`You dream they are praying in ${name}. Their word for it is ${e.stats.belief}. It is not your name.`);
          if (e.stats.deepestFold > 0) dreams.push(`You fall through ${name} again, ${e.stats.deepestFold} folds down, and do not land.`);
          if (e.stats.worldsTended > 0) dreams.push(`You dream of a world in ${name}. Someone there looks up, as if they heard you.`);
          dreams.push(`You dream ${name} is open on the desk, and nobody is holding it.`);
        }
        const told = c.sim.latest()?.chronicle[0]?.event;
        if (told) dreams.push(`You dream a line you read once. "${told}"`);
        if (!dreams.length) dreams.push('You dream of the box. Something inside it turns over.');
        show(`${pick(dreams, n * 7 + 3)} You wake. It is ${hourWord(decor.hour)}.`, 'Sleep again', sleep);
        line.dataset.dream = '1';
        sayWait = 1500;
      };
      const sleep = () => {
        if (decor.asleep) return;
        decor.asleep = true;
        target = null;
        pending = -1;
        sleepLeft = 2600;
        root.classList.add('rb-asleep');
        if (bubble) bubble.hidden = true;
        sayLeft = 0;
        if (decor.moteMood === 1) decor.moteMood = 0;
        show('You pull the blanket up. The PC hums on without you.');
        // The night passes: the room clock moves on, and a little of every universe's time with it.
        sleepNow(7);
        const ticks = c.clock.advance(60000);
        if (ticks > 0) { c.pulse().step(ticks, []); c.sim.step(ticks); }
        c.audio.sfx('fold', 0.4);
        c.persist();
      };
      arrive = (spot) => {
        delete line.dataset.dream;
        switch (spot) {
          case SPOT.window: {
            const h = decor.hour, w = decor.weather;
            const skyLine = w === 2 ? 'Rain on the glass.' : w === 1 ? 'Slow cloud going over.' : h < 5 || h >= 21 ? 'A clear sky. The stars are not yours.' : h < 7 ? 'The sky is going red at the edge.' : h >= 18.5 ? 'The light is leaving.' : 'A plain bright sky.';
            show(`${clockText(h)}. Outside it is ${hourWord(h)}. ${skyLine}`);
            break;
          }
          case SPOT.bed:
            show('Your bed. In there, whole ages pass while you sleep.', 'Sleep', sleep);
            break;
          case SPOT.pc:
            show('The PC. It keeps what you have seen.', 'Use the PC', () => {
              const hub = document.querySelector<HTMLElement>('[data-id="hub"]');
              if (!hub) { show('The screen shows only the box.'); return; }
              hub.click();
              // Straight to the journal or the codex, when there is one.
              for (const id of ['hub-journal', 'hub-codex', 'hub-chronicle', 'hub-almanac']) {
                const page = document.querySelector<HTMLElement>(`[data-id="${id}"]`);
                if (page) { page.click(); break; }
              }
            });
            break;
          case SPOT.shelf: {
            dress();
            const got = decor.trophies.filter((l) => l > 0).length;
            show(got === 0 ? 'A bare shelf. It is waiting for what you do.' : got === 5 ? 'The shelf is full. Each thing on it is something you did.' : 'Your shelf. Each thing on it is something you did.');
            const vals: Record<string, number> = { depth: tot.depth, tended: tot.tended, battles: tot.battles, held: tot.held, light: tot.light };
            shelf.replaceChildren(...TROPHIES.map((t, i) => el('div', { class: `rb-trophy lv${decor.trophies[i] ?? 0}`, 'data-id': `trophy-${t.key}`, 'data-level': decor.trophies[i] ?? 0, 'data-value': vals[t.key] ?? 0 }, el('b', {}, String(vals[t.key] ?? 0)), el('span', {}, t.label))));
            shelf.hidden = false;
            break;
          }
          case SPOT.poster: {
            const best = mostTended(c);
            show(best ? `${names.of(c.universes.fromSerial(best.serialNumber))}, in its own colours. You have tended it most.` : 'A bare sheet of paper. Tend a world and it will take that universe\'s colours.');
            break;
          }
          default:
            show(fresh.length ? 'The box. Something in it is new.' : `The box. ${c.box.count()} universes, and room for ${25 - c.box.count()} more.`, 'Open it', () => c.go('box'));
        }
      };

      // What Mote has to say, from what is true now.
      const lines: { text: string; mood: number }[] = [];
      const now = Date.now();
      if (fresh.length) lines.push({ text: fresh.length > 1 ? 'There are new ones in the box. I can hear them.' : `Something new is in the box. ${names.of(c.universes.fromSerial(fresh[0]!))}. I can hear it.`, mood: 2 });
      if (c.light.view().pips <= 2) lines.push({ text: c.light.view().pips <= 0 ? 'I am almost out. Their glow would feed me.' : 'I am dim. Their glow would feed me.', mood: 0 });
      let stale: { name: string; days: number } | null = null, glad: { name: string; souls: number; p: number } | null = null;
      for (const e of c.box.slots()) {
        if (!e) continue;
        const name = names.of(c.universes.fromSerial(e.serialNumber));
        const days = Math.floor((now - (meta.last[String(e.serialNumber)] ?? now)) / DAY_MS);
        if (days >= 1 && (!stale || days > stale.days)) stale = { name, days };
        const p = (e.stats.prosperity ?? 0) + Math.min(40, (e.stats.souls ?? 0) / 5);
        if ((e.stats.souls ?? 0) > 0 && (!glad || p > glad.p)) glad = { name, souls: e.stats.souls ?? 0, p };
      }
      if (stale) lines.push({ text: `No one has looked in on ${stale.name} for ${stale.days === 1 ? 'a day' : `${stale.days} days`}.`, mood: 1 });
      if (glad) lines.push({ text: (glad.p >= 50 ? `${glad.name} is doing well. ${glad.souls} souls, and glad.` : `${glad.souls} souls in ${glad.name}. They are getting by.`), mood: 1 });
      if (tot.tended === 0) lines.push({ text: 'You have not changed a sky yet. They are waiting, though they do not know it.', mood: 1 });
      lines.push({ text: decor.hour >= 21 || decor.hour < 5 ? 'It is late. The box does not sleep.' : decor.hour < 12 ? 'Morning. In there, they have had whole ages since.' : 'The light in here is yours. The light in there is theirs.', mood: 0 });
      lines.push({ text: `${c.box.count()} universes in one box. I still cannot count the worlds.`, mood: 1 });
      speak = () => {
        const l = lines[sayAt % lines.length]!;
        sayAt++;
        if (!bubble) return;
        bubble.textContent = l.text;
        bubble.hidden = false;
        sayLeft = 5200;
        decor.moteMood = l.mood;
        const a = root.getBoundingClientRect(), b = c.gl.canvas.getBoundingClientRect();
        offX = b.left - a.left; offY = b.top - a.top;
        lastBx = -1;
      };

      floor.addEventListener('pointerdown', (e) => {
        if (decor.asleep) { if (sleepLeft < 1800) { sleepLeft = 0; wake(); } return; }
        const r = c.gl.canvas.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        const spot = room.spotAt ? room.spotAt(x, y) : -1;
        if (spot >= 0 && room.standAt) {
          const s = room.standAt(spot);
          target = { x: s.x, y: s.y };
          pending = spot;
          decor.focus = spot;
          if (room.near?.() === spot) { pending = -1; arrive(spot); }
          else show(`To the ${ROOM_SPOTS[spot] === 'pc' ? 'PC' : ROOM_SPOTS[spot]}.`);
        } else {
          target = { x, y };
          pending = -1;
          decor.focus = -1;
          delete line.dataset.dream;
          idle();
        }
      });
      root.append(
        el('header', { class: 'row rb-head' }, pips.el, sound, label(`BOX ${String(c.box.count()).padStart(2, '0')}/25`)),
        floor,
        bubble,
        el('div', { class: 'rb-info' }, line, shelf),
        button('Open the box', () => c.go('box'), { primary: true, id: 'open-box' }),
        el('div', { class: 'row nowrap' }, button('Go outside', () => c.go('outside'), { id: 'go-outside' }), use),
        el('p', { class: 'k-label hint' }, 'Tap the floor to walk · tap a thing to use it'),
      );
    },
    frame: (dt) => {
      if (!ctx) return;
      const step = Math.min(dt, 250);
      pips?.update(ctx.light.view().pips);
      const room = ctx.renderers.room;
      clockWait -= step;
      if (clockWait <= 0) { clockWait = 5000; decor.hour = roomHour(); decor.weather = weatherAt(decor.hour); }
      if (decor.asleep) { sleepLeft -= step; if (sleepLeft <= 0) wake(); }
      if (pending >= 0 && room.near?.() === pending) { const p = pending; pending = -1; arrive(p); }
      if (sayLeft > 0) {
        sayLeft -= step;
        if (sayLeft <= 0 && bubble) { bubble.hidden = true; if (decor.moteMood === 1) decor.moteMood = 0; sayWait = 11000; }
      } else if (!decor.asleep) { sayWait -= step; if (sayWait <= 0) speak(); }
      room.draw({ kid: start, target, pulse: ctx.pulse().phase(), lightPips: ctx.light.view().pips, decor }, dt);
      if (sayLeft > 0 && bubble && host) {
        const m = room.mote();
        const w = host.clientWidth;
        const bx = Math.round(Math.max(8, Math.min(w - 228, m.x + offX - 110))), by = Math.round(m.y + offY - 22);
        if (bx !== lastBx || by !== lastBy) { lastBx = bx; lastBy = by; bubble.style.left = `${bx}px`; bubble.style.top = `${by}px`; }
      }
    },
    unmount: () => { ctx = null; host = null; bubble = null; },
  };
};
