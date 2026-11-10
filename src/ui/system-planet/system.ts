// The Solar system screen: a star, its orbits, a card per world, the sky pieces and the cosmic tools.
import type { ScreenFactory, AppContext } from '@/contracts/app';
import type { SkyPieceKind, CosmicEvent } from '@/contracts/sky';
import type { PlanetSpec } from '@/contracts/system';
import { SKY_PIECE_KINDS, SKY_MAX_PIECES } from '@/contracts/sky';
import { seedToHex } from '@/core/hash';
import { el, backChip, label, button, skyPieceTile, narration, burst, flash, aPiece, pieceName, cap } from '@/ui/kit';
import { ensureSystem, keyOf, seenOf, logOf, addLog } from './shared';

type Cosmic = 'pieces' | 'pull' | 'push' | 'flare' | CosmicEvent;
const LANDS = 'Free. It lands when you next watch that world, and cannot be called back.';
const COSMIC: { mode: Cosmic; label: string; hint: string; cost: string; said: string; log: string }[] = [
  { mode: 'pieces', label: 'Pieces', hint: 'Drag a sky piece from the tray onto an orbit. Tap an orbit to choose that world.', cost: 'Costs the piece. You can take it down again.', said: '', log: '' },
  { mode: 'pull', label: 'Pull in', hint: 'Tap an orbit to draw that world nearer its star. Hotter, harsher years.', cost: 'Free. Three steps at most. Push out undoes it.', said: 'You pull it closer. Its star fills more of their sky.', log: 'Pulled %p in' },
  { mode: 'push', label: 'Push out', hint: 'Tap an orbit to push that world out. Colder and dimmer.', cost: 'Free. Three steps at most. Pull in undoes it.', said: 'You push it out. Their sun shrinks.', log: 'Pushed %p out' },
  { mode: 'flare', label: 'Flare', hint: 'Tap anywhere. The star flares and every world in the system burns a little.', cost: 'Free. It reaches every world here, and cannot be called back.', said: 'The star flares. Every world here will remember it.', log: 'Made the star flare' },
  { mode: 'shower', label: 'Shower', hint: 'Tap an orbit to send five stones down on that world.', cost: LANDS, said: 'Stones are on their way down.', log: 'Sent stones at %p' },
  { mode: 'comet-strike', label: 'Comet', hint: 'Tap an orbit to throw one comet straight at that world. A crater, then rain.', cost: LANDS, said: 'A comet turns toward them.', log: 'Threw a comet at %p' },
  { mode: 'eclipse', label: 'Eclipse', hint: 'Tap an orbit to darken that world. A cold season follows.', cost: LANDS, said: 'Their sun will go dark.', log: 'Darkened the sun of %p' },
  { mode: 'panspermia', label: 'Seed life', hint: 'Tap an orbit to scatter green and two new peoples onto that world.', cost: LANDS, said: 'Seeds of life drift down to them.', log: 'Seeded life on %p' },
];
const PLACE_FAIL: Record<string, string> = { 'none-left': 'None left.', 'sky-full': 'That sky is full.', 'bad-orbit': 'Drop it on an orbit.' };
const STAR_KIND: Record<string, string> = {
  dwarf: 'A small star, slow to burn out.', main: 'A plain star in its middle years.',
  giant: 'A swollen star, near its end.', pulsar: 'A dead star that still ticks.',
};
const starHeat = (h: number) => (h < 70 ? 'Its light is a red ember.' : h < 130 ? 'Its light is the yellow of old paper.' : h < 190 ? 'It burns white.' : 'It burns blue and hard.');
const BIOME: Record<string, string> = { ash: 'ash world', salt: 'salt world', moss: 'moss world', tallow: 'tallow world', glass: 'glass world' };
const seaWord = (s: number) => (s > 150 ? 'mostly sea' : s > 90 ? 'wide seas' : s > 45 ? 'some water' : 'dry');
const ORRERY: readonly { label: string; mult: number }[] = [{ label: 'Still', mult: 0 }, { label: '1×', mult: 1 }, { label: '8×', mult: 8 }, { label: '40×', mult: 40 }];
type Tab = 'worlds' | 'cosmic' | 'log';

export const system: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let drag: { kind: SkyPieceKind; x: number; y: number; overOrbit: number } | null = null;
  let cosmic: Cosmic = 'pieces';
  let align = 0;
  const aligned = new Set<string>();
  let alignLabel: HTMLElement | null = null;
  let noteEl: HTMLElement | null = null;
  let flare = 0;
  let touch: { x: number; y: number; age: number } | null = null;
  let orrery = 1;
  let visTick = 0;
  let lastClock = 0;
  return {
    id: 'system',
    mount: (root, c) => {
      ctx = c;
      const { u, sys } = ensureSystem(c);
      const sysKey = seedToHex(sys.seed);
      if (c.selection.planetIndex < 0 || c.selection.planetIndex >= sys.planets.length) c.selection.planetIndex = 0;
      orrery = 1; visTick = lastClock = c.clock.tick();
      const cards = el('div', { class: 'sy-cards' });
      const tray = el('div', { class: 'row tray' });
      const note = el('p', { class: 'k-narration sy-note', 'data-id': 'sys-note' }, '');
      const logList = el('ol', { class: 'sy-log', 'data-id': 'sys-log' });
      noteEl = note;
      align = Math.min(1, sys.planets.reduce((n, p) => n + (c.sky.skyOf(p).built ?? 0), 0) / 8);
      const local = (e: PointerEvent) => {
        const r = c.gl.canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      const planetOf = (o: number) => sys.planets[sys.orbits[o]?.planet ?? o] ?? sys.planets[0]!;
      const renderLog = () => {
        const l = logOf(sysKey);
        logList.replaceChildren(...(l.length ? l.map((s) => el('li', {}, s)) : [el('li', { class: 'none' }, 'You have not touched this system yet.')]));
      };
      const did = (line: string) => { addLog(sysKey, `Y${c.clock.year()} · ${line}.`); renderLog(); };
      const soulsOf = (p: PlanetSpec): string => {
        const live = c.sim.isOpen(u, p) ? c.sim.latest()?.civ.souls : undefined;
        if (live !== undefined) return `${live} SOULS NOW`;
        const s = seenOf(keyOf(p));
        return s ? `${s.souls} SOULS WHEN LAST SEEN, YEAR ${s.year}` : 'NOT YET WATCHED';
      };
      const select = (pi: number, quiet = false) => {
        if (pi === c.selection.planetIndex) return;
        c.selection.planetIndex = pi;
        if (!quiet) c.audio.sfx('orbit');
        renderCards();
      };
      const renderCards = () => {
        const sel = c.selection.planetIndex;
        cards.replaceChildren(...sys.orbits.map((o) => {
          const pi = o.planet, p = sys.planets[pi]!;
          const sky = c.sky.skyOf(p), key = keyOf(p);
          const open = pi === sel;
          const head = el('button', { class: 'sy-head', type: 'button', 'data-id': `planet-${o.index}`, 'aria-expanded': String(open) },
            el('span', { class: 'k-title small' }, p.name),
            el('span', { class: 'k-label' }, `ORBIT ${o.index + 1} · ${BIOME[p.terrain.biome] ?? p.terrain.biome} · ${sky.pieces.length}/${SKY_MAX_PIECES}`));
          head.addEventListener('click', () => select(pi));
          if (!open) return el('section', { class: 'sy-card', 'data-id': `card-${o.index}` }, head);
          const says = c.skyRules.explain(sky, p);
          const chips = sky.pieces.map((k, i) => {
            const b = el('button', { class: 'sy-chip', type: 'button', 'data-id': `sys-take-${i}`, 'aria-label': `Take down the ${pieceName(k)}` }, k, el('small', {}, 'take'));
            b.addEventListener('click', () => {
              c.sky.remove(key, i); c.sky.grant(k, 1);
              c.audio.sfx('take');
              c.bus.emit('sky:changed', { planetKey: key });
              c.persist();
              note.textContent = `You take the ${pieceName(k)} down from over ${p.name}.`;
              did(`Took ${aPiece(k)} down from ${p.name}`);
              renderAll();
            });
            return b;
          });
          const meta = [
            seaWord(p.terrain.seaLevel).toUpperCase(),
            sky.drift ? `ORBIT ${sky.drift < 0 ? 'PULLED IN' : 'PUSHED OUT'} ${Math.abs(sky.drift)}` : 'ORBIT AS IT WAS',
            sky.built ? `${sky.built} OF THEIR MAKING ALOFT` : null,
            sky.queued?.length ? `${sky.queued.length} ON ITS WAY` : null,
          ].filter(Boolean).join(' · ');
          return el('section', { class: 'sy-card open', 'data-id': `card-${o.index}` },
            head,
            el('div', { class: 'row start sy-chips' }, ...(chips.length ? chips : [label('an empty sky')])),
            narration(says.length ? says.slice(-2).join(' ') : 'Nothing moves their sky yet.'),
            el('span', { class: 'k-label sy-meta' }, meta),
            el('span', { class: 'k-label sy-meta', 'data-id': 'card-souls' }, soulsOf(p)),
            button('Watch the surface', () => c.go('planet'), { primary: true, id: 'watch' }));
        }));
        cards.querySelector('.sy-card.open')?.scrollIntoView({ block: 'nearest' });
      };
      const renderTray = () => {
        const inv = c.sky.inventory();
        tray.replaceChildren(...SKY_PIECE_KINDS.map((k) => {
          const t = skyPieceTile(k, inv[k]);
          t.addEventListener('pointerdown', (e) => {
            if (inv[k] <= 0) return;
            t.setPointerCapture(e.pointerId);
            drag = { kind: k, ...local(e), overOrbit: -1 };
          });
          t.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const at = local(e);
            drag = { ...drag, ...at, overOrbit: c.renderers.system.orbitAt(at.x, at.y) };
          });
          const end = () => {
            if (!drag) return;
            const d = drag;
            drag = null;
            if (d.overOrbit < 0) return;
            const res = c.sky.place(d.kind, sys, d.overOrbit);
            c.audio.sfx(res.ok ? 'place' : 'deny');
            if (res.ok) {
              c.box.recordPieceHung?.(c.box.selected());
              c.selection.planetIndex = sys.orbits[d.overOrbit]?.planet ?? d.overOrbit;
              c.bus.emit('sky:changed', { planetKey: res.sky.planetKey });
              c.persist();
              const p = planetOf(d.overOrbit);
              const says = c.skyRules.explain(res.sky, p);
              note.textContent = says[says.length - 1] ?? `${cap(aPiece(d.kind))} hangs over ${p.name} now.`;
              did(`Hung ${aPiece(d.kind)} over ${p.name}`);
            } else note.textContent = PLACE_FAIL[res.reason]!;
            renderAll();
          };
          t.addEventListener('pointerup', end);
          t.addEventListener('pointercancel', () => (drag = null));
          return t;
        }));
      };
      const renderAll = () => { renderCards(); renderTray(); };

      const field = el('div', { class: 'spacer sy-field', 'data-id': 'orbits' });
      field.addEventListener('pointerdown', (e) => {
        const at = local(e);
        touch = { ...at, age: 0 };
        const o = c.renderers.system.orbitAt(at.x, at.y);
        const tool = COSMIC.find((t) => t.mode === cosmic)!;
        if (cosmic === 'flare') {
          flare = 1;
          c.audio.sfx('flare');
          flash(root);
          for (const p of sys.planets) c.sky.queue(keyOf(p), 'flare');
          note.textContent = tool.said;
          did(tool.log);
          c.persist();
          renderCards();
          return;
        }
        if (o < 0) { if (cosmic !== 'pieces') note.textContent = 'Tap an orbit.'; return; }
        const p = planetOf(o), key = keyOf(p);
        const was = c.selection.planetIndex;
        c.selection.planetIndex = sys.orbits[o]?.planet ?? o;
        if (cosmic === 'pull' || cosmic === 'push') {
          const before = c.sky.skyOf(p).drift ?? 0;
          const sky = c.sky.nudge(key, cosmic === 'pull' ? -1 : 1);
          const moved = (sky.drift ?? 0) !== before;
          c.audio.sfx(moved ? cosmic : 'deny');
          note.textContent = moved ? tool.said : 'It will not go any further.';
          if (moved) did(tool.log.replace('%p', p.name));
          c.bus.emit('sky:changed', { planetKey: key });
        } else if (cosmic !== 'pieces') {
          c.sky.queue(key, cosmic);
          c.audio.sfx(cosmic);
          burst(root, at.x - (root.getBoundingClientRect().left - c.gl.canvas.getBoundingClientRect().left), at.y, 10, true);
          note.textContent = `${tool.said} Watch the surface to see it land.`;
          did(tool.log.replace('%p', p.name));
        } else if (was !== c.selection.planetIndex) c.audio.sfx('orbit');
        c.persist();
        renderCards();
      });
      // Orrery scrub: only the picture turns faster. Their years do not.
      const scrub = el('div', { class: 'sy-scrub' }, label('ORRERY'), ...ORRERY.map((s) => {
        const b = el('button', { class: 'k-tag tool sy-scrub-btn', type: 'button', 'data-id': `orrery-${s.mult}`, 'aria-pressed': String(s.mult === orrery) }, s.label);
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        b.addEventListener('click', () => {
          orrery = s.mult;
          c.audio.sfx('slider', s.mult / 40);
          scrub.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        });
        return b;
      }));
      field.append(scrub);

      // Cosmic picker.
      const cTitle = el('span', { class: 'k-title small' }, COSMIC[0]!.label);
      const cHint = el('p', { class: 'k-narration' }, COSMIC[0]!.hint);
      const cCost = el('span', { class: 'k-label sy-cost', 'data-id': 'cosmic-cost' }, COSMIC[0]!.cost);
      cosmic = 'pieces';
      const grid = el('div', { class: 'sy-cosmic' }, ...COSMIC.map((t) => {
        const b = el('button', { class: 'k-tag tool', type: 'button', 'aria-pressed': String(t.mode === cosmic), 'data-id': `cosmic-${t.mode}` }, t.label);
        b.addEventListener('click', () => {
          cosmic = t.mode;
          cTitle.textContent = t.label; cHint.textContent = t.hint; cCost.textContent = t.cost;
          c.audio.sfx('tap');
          grid.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          modeTag.textContent = t.mode === 'pieces' ? '' : `${t.label} · tap ${t.mode === 'flare' ? 'anywhere' : 'an orbit'}`;
          modeTag.hidden = t.mode === 'pieces';
        });
        return b;
      }));
      const modeTag = el('span', { class: 'k-tag sy-mode', hidden: true }, '');
      field.append(modeTag);

      const pages: Record<Tab, HTMLElement> = {
        worlds: el('div', { class: 'sy-page', 'data-id': 'page-worlds' }, cards),
        cosmic: el('div', { class: 'sy-page', 'data-id': 'page-cosmic', hidden: true }, grid, el('div', { class: 'sy-desc' }, cTitle, cHint, cCost)),
        log: el('div', { class: 'sy-page', 'data-id': 'page-log', hidden: true }, label('WHAT YOU HAVE DONE HERE'), logList),
      };
      const tabs = el('div', { class: 'sp-tabs', role: 'tablist' }, ...(['worlds', 'cosmic', 'log'] as const).map((t) => {
        const b = el('button', { class: 'sp-tab', type: 'button', role: 'tab', 'data-id': `systab-${t}`, 'aria-selected': String(t === 'worlds') }, t === 'worlds' ? `Worlds ${sys.planets.length}` : t === 'cosmic' ? 'Cosmic' : 'Log');
        b.addEventListener('click', () => {
          for (const k of Object.keys(pages) as Tab[]) pages[k].hidden = k !== t;
          tabs.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
          c.audio.sfx('tap');
        });
        return b;
      }));
      const st = sys.star;
      const life = c.box.slots()[c.box.selected()]?.stats;
      root.append(el('div', { class: 'sy' },
        el('header', { class: 'row' }, backChip('DIVE', () => c.go('dive')), c.battle?.outcome === 'ongoing' ? backChip('BATTLE', () => c.go('battle')) : null, label(`${u.name} · FOLD ${st.address.depth}`)),
        el('div', { class: 'sy-title' },
          el('h1', { class: 'k-title' }, sys.name),
          el('p', { class: 'k-narration sy-star', 'data-id': 'star-says' }, `${STAR_KIND[st.kind] ?? 'A star.'} ${starHeat(st.heat)}`),
          el('span', { class: 'k-label' }, `${st.kind.toUpperCase()} · HEAT ${st.heat}${life?.souls !== undefined ? ` · THIS UNIVERSE LAST HELD ${life.souls} SOULS` : ''}`)),
        field,
        (alignLabel = el('span', { class: 'k-label sy-align' }, '')),
        note,
        el('div', { class: 'sy-trayrow' }, label('SKY PIECES · drag onto an orbit'), tray),
        tabs,
        el('div', { class: 'sy-panel' }, pages.worlds, pages.cosmic, pages.log),
      ));
      renderAll();
      renderLog();
    },
    frame: (dt) => {
      const s = ctx?.selection;
      if (!ctx || !s?.system || !s.universe) return;
      const skies = s.system.planets.map((p) => ctx!.sky.skyOf(p));
      flare = Math.max(0, flare - dt / 1500);
      if (touch) { touch = { ...touch, age: touch.age + dt / 700 }; if (touch.age >= 1) touch = null; }
      const total = skies.reduce((n, k) => n + (k.built ?? 0), 0);
      const want = Math.min(1, total / 8);
      align += (want - align) * Math.min(1, dt * 0.001);
      if (alignLabel) alignLabel.textContent = total ? `IN ORBIT ${total} · ALIGNMENT ${Math.round(align * 100)}%` : '';
      if (align > 0.97 && !aligned.has(s.system.name)) {
        // Every world on one line: the whole system rings.
        aligned.add(s.system.name);
        ctx.light.addGlow(3000);
        ctx.sky.grant('sun', 1);
        ctx.audio.sfx('win');
        if (noteEl) noteEl.textContent = 'ALIGNMENT. Every world in this system turns as one. Mote brightens, and a new sun is yours.';
      }
      // The orrery's own time: at 1x it keeps the clock's pace, otherwise it runs on screen time alone.
      const now = ctx.clock.tick();
      if (orrery === 1) visTick += now - lastClock; else visTick += (dt / 50) * orrery;
      lastClock = now;
      ctx.renderers.system.draw({ universe: s.universe, system: s.system, skies, selectedOrbit: s.system.orbits.find((o) => o.planet === s.planetIndex)?.index ?? s.planetIndex, drag, tick: Math.floor(visTick), pulse: ctx.pulse().phase(), flare, touch, align, quality: ctx.perf.resolutionScale() }, dt);
    },
    unmount: () => void (ctx = null),
  };
};
