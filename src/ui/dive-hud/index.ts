// Dive HUD (unit 22): the fall's controls, what each ring holds, the streak, and the reckoning.
import type { ScreenFactory, AppContext } from '@/contracts/app';
import type { ScreenId } from '@/contracts/platform';
import type { DiveEvent, DiveSummary, DiveView } from '@/contracts/game';
import type { FoldNode, FoldThingKind, StarRef } from '@/contracts/fold';
import type { DiveRenderView } from '@/contracts/render';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { foldFrame, childAt, childScreen } from '@/core/fold-layout';
import { el, backChip, button, lightPips, label, narration, holdButton, burst, flash, shake, stat } from '@/ui/kit';
import './dive-hud.css';

const CAPTURE: Record<string, string> = {
  'no-reliquary': 'No reliquaries left.',
  'no-flicker': 'Nothing there to catch.',
  'box-full': 'The box is full.',
  duplicate: 'You already hold that one.',
  missed: 'The throw goes wide. The reliquary is gone. The flicker is still there.',
  grazed: 'It slips the rim. The reliquary comes back to your hand. Try again.',
};
const TAG: Record<FoldThingKind, string> = { piece: 'SKY PIECE', well: 'LIGHT WELL', echo: 'ECHO', wreck: 'WRECK', storm: '! STORM', undertow: '! UNDERTOW', follower: '! IT WATCHES' };
const HAZARD_NAME: Partial<Record<FoldThingKind, string>> = { storm: 'storm', undertow: 'undertow', follower: 'watcher' };
const HIT: Partial<Record<FoldThingKind, string>> = {
  storm: 'A storm. It takes a pip of Light.',
  undertow: 'The undertow has you. No steering for one fold.',
  follower: 'Something turns to look. It follows now. Do not stop.',
};
const WRECKS = ['A dead lantern, launched long ago.', 'A station, cold, turning slowly.', 'A probe with a name scratched on it.', 'A sail of foil, torn. Someone aimed it at their star.'];
const VOICES = ['We counted the rings. We stopped counting.', 'There is a floor. We did not like it.', 'Leave the lamp on.', 'It follows if you stop.', 'The wells are kind.', 'We sent a lantern down. It did not come back up.'];
const PIECE: Record<string, string> = { comet: 'a comet', moon: 'a moon', belt: 'a belt of stones', sun: 'a small sun', rings: 'a set of rings', dust: 'a veil of dust' };
const named = (kind: string) => PIECE[kind] ?? `a ${kind}`;
const ENDS: Record<DiveSummary['reason'], string> = { star: 'A star. Mote settles beside it.', surface: 'You surface.', floor: 'The folds end. There is a floor.' };

// Pieces and wrecks already taken from a universe stay taken (so a dive cannot be farmed).
const TAKEN_KEY = 'sallow.dive.taken.v1';
const TAKEN_MAX = 400;
const loadTaken = (): Record<string, number[]> => {
  try {
    const raw = JSON.parse(localStorage.getItem(TAKEN_KEY) ?? '{}') as unknown;
    return raw && typeof raw === 'object' ? (raw as Record<string, number[]>) : {};
  } catch { return {}; }
};
const saveTaken = (all: Record<string, number[]>) => {
  try { localStorage.setItem(TAKEN_KEY, JSON.stringify(all)); } catch { /* storage full or blocked */ }
};

// The star last stopped at in each universe, so the Box can open that system again (read by ui/room-box).
const LAST_STAR_KEY = 'sallow.last-star.v1';
const rememberStar = (serialNumber: number, star: StarRef) => {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_STAR_KEY) ?? '{}') as unknown;
    const all = raw && typeof raw === 'object' ? (raw as Record<string, StarRef>) : {};
    all[String(serialNumber)] = star;
    localStorage.setItem(LAST_STAR_KEY, JSON.stringify(all));
  } catch { /* storage full or blocked */ }
};
const sameStar = (a: StarRef, b: StarRef) => a.seed.hi === b.seed.hi && a.seed.lo === b.seed.lo && a.address.depth === b.address.depth;

const CATCH_MS = 1200; // one closing of the ring
const CATCH_ROUNDS = 3;
/** Ring scale over time: 2.2 closing to 0.2; 1 is the catch. */
const catchScale = (ms: number) => 2.2 - 2 * ((ms % CATCH_MS) / CATCH_MS);
const catchAccuracy = (scale: number) => Math.max(0, Math.round(1000 - Math.abs(scale - 1) * 1400));

interface Ui {
  root: HTMLElement; fold: HTMLElement; bar: HTMLElement; best: HTMLElement; floor: HTMLElement; wrap: HTMLElement; rel: HTMLElement; say: HTMLElement;
  pips: ReturnType<typeof lightPips>; field: HTMLElement; tags: HTMLElement[]; ticks: HTMLElement[]; stratum: HTMLElement; streak: HTMLElement; threat: HTMLElement;
  banner: HTMLElement; bannerName: HTMLElement; bannerLine: HTMLElement; summary: HTMLElement;
}

const dive: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let ui: Ui | null = null;
  let message: { text: string; until: number } | null = null;
  let t = 0;
  let leaving = false;
  let tickMs = 0;
  let lastDepth = 0;
  let offX = 0, offY = 0, fieldW = 0, fieldH = 0;
  const tagW = [0, 0, 0, 0, 0, 0, 0];
  let bannerUntil = 0;
  let exitTo: ScreenId | null = null;
  let exitToken = 0;
  let shownAt = 0;
  let catching: { index: number; start: number; depth: number } | null = null;
  let taken = new Set<number>();
  let takenAll: Record<string, number[]> = {};
  let takenId = '';
  // Reused every frame so the renderer is handed nothing new.
  const ring = { index: -1, scale: 1 };
  const rv = { dive: null as unknown as DiveView, pulse: 0, lightPips: 0, catchRing: null as { index: number; scale: number } | null, quality: 1 };
  const tagText: string[] = ['', '', '', '', '', '', ''];
  let threatText = '';
  let streakText = '';
  let stratumText = '';

  const quiet = () => !message || message.until <= t;
  const say = (text: string, ms = 2600) => { message = { text, until: t + ms }; };
  const take = (key: number) => {
    taken.add(key);
    const list = (takenAll[takenId] ??= []);
    list.push(key);
    if (list.length > TAKEN_MAX) list.splice(0, list.length - TAKEN_MAX);
    saveTaken(takenAll);
  };
  const pieceOf = (key: number) => SKY_PIECE_KINDS[(key >>> 0) % SKY_PIECE_KINDS.length]!;
  const echo = (c: AppContext, v: DiveView, key: number): string => {
    const others = c.box.slots().filter((s) => s && s.serialNumber !== v.universe?.serialNumber);
    const pick = key % 3;
    if (pick === 0 && (v.toBottom ?? 0) > 0) return `An echo, from below: "${v.toBottom} more rings. Then a room."`;
    if (pick === 1 && others.length > 0) {
      const o = others[(key >>> 3) % others.length]!;
      const name = c.universes.fromSerial(o.serialNumber).name;
      return o.stats.deepestFold > 0 ? `An echo from ${name}: "You fell ${o.stats.deepestFold} folds into us. We felt it."` : `An echo from ${name}: "${VOICES[(key >>> 5) % VOICES.length]!}"`;
    }
    if (v.best > v.depth) return `An echo of your own fall: fold ${v.best}, and a breath held.`;
    return `An echo: "${VOICES[(key >>> 5) % VOICES.length]!}"`;
  };
  const onEvent = (c: AppContext, u: Ui, v: DiveView, e: DiveEvent) => {
    switch (e.type) {
      case 'stratum':
        u.bannerName.textContent = e.stratum.name;
        u.bannerLine.textContent = e.stratum.line;
        u.banner.classList.add('on');
        u.banner.setAttribute('data-stratum', String(e.stratum.index));
        bannerUntil = t + 3400;
        c.audio.sfx('fold', 1);
        if (quiet()) say(`${e.stratum.name}. ${e.stratum.line}`, 3400);
        break;
      case 'pickup': {
        c.audio.sfx(e.kind === 'echo' ? 'tap' : 'catch');
        const r = u.root.getBoundingClientRect();
        burst(u.root, r.width / 2, r.height * 0.47, e.kind === 'well' ? 16 : 10, e.kind === 'well');
        u.field.setAttribute('data-picked', e.kind);
        if (e.kind === 'piece') {
          const kind = pieceOf(e.key);
          c.sky.grant(kind, 1);
          take(e.key);
          { const n = named(kind); say(`${n.charAt(0).toUpperCase()}${n.slice(1)}, adrift. Mote takes it.`); }
        } else if (e.kind === 'well') say('A well of light. Mote drinks.');
        else if (e.kind === 'echo') say(echo(c, v, e.key), 3800);
        else {
          const what = WRECKS[e.power % WRECKS.length]!;
          take(e.key);
          if (e.reward === 'reliquary') say(`${what} A reliquary was still aboard.`, 3400);
          else { const kind = pieceOf(e.key); c.sky.grant(kind, 1); say(`${what} It carried ${named(kind)}. Yours now.`, 3400); }
        }
        break;
      }
      case 'hazard':
        c.audio.sfx('deny');
        try { navigator.vibrate?.([20, 40, 20]); } catch { /* not allowed */ }
        shake(u.field, e.kind === 'storm');
        if (e.kind === 'storm') flash(u.root);
        u.field.setAttribute('data-hit', e.kind);
        say(HIT[e.kind] ?? '', 3200);
        break;
      case 'dodge':
        if (quiet()) say(e.kind === 'follower' ? 'It did not see you.' : `You slip past the ${HAZARD_NAME[e.kind] ?? 'dark'}.`, 1800);
        break;
      case 'follower':
        if (e.state === 'caught') { c.audio.sfx('deny'); shake(u.root, true); say('It reached you. It took a pip of Light and went back down.', 3400); }
        else { c.audio.sfx('catch'); say('Whatever followed has fallen behind.', 2800); }
        break;
      case 'milestone':
        c.audio.sfx('catch');
        if (e.reward === 'piece') { const kind = pieceOf(e.key); c.sky.grant(kind, 1); say(`Fold ${e.depth}. New ground. Mote finds ${named(kind)}.`, 3000); }
        else if (e.reward === 'reliquary') say(`Fold ${e.depth}. A reliquary, left on a ledge.`, 3000);
        else say(`Fold ${e.depth}. The dark gives a little Light back.`, 3000);
        break;
      case 'streak':
        if (quiet()) say(`Streak ×${e.multiplier}. The fall quickens.`, 1800);
        break;
      case 'streak-lost':
        if (quiet()) say(`The streak of ${e.streak} is gone.`, 1800);
        break;
    }
  };
  const leave = () => {
    if (!exitTo || !ctx) return;
    const to = exitTo;
    exitTo = null;
    ctx.go(to);
  };
  const showSummary = (u: Ui, s: DiveSummary) => {
    const got: string[] = [];
    if (s.pieces) got.push(`${s.pieces} sky piece${s.pieces > 1 ? 's' : ''}`);
    if (s.wells) got.push(`${s.wells} well${s.wells > 1 ? 's' : ''}`);
    if (s.echoes) got.push(`${s.echoes} echo${s.echoes > 1 ? 'es' : ''}`);
    if (s.wrecks) got.push(`${s.wrecks} wreck${s.wrecks > 1 ? 's' : ''}`);
    if (s.flickers) got.push(`${s.flickers} universe${s.flickers > 1 ? 's' : ''} caught`);
    const line = (k: string, text: string, id: string) => el('p', { class: 'sum-line', 'data-id': id }, el('span', { class: 'k-label' }, k), text);
    u.summary.replaceChildren(
      el('div', { class: 'sum-panel' },
        el('p', { class: 'k-title' }, ENDS[s.reason]),
        el('div', { class: 'row nowrap' }, stat(s.depth, 'depth').el, stat(s.best, s.newBest ? 'new deepest' : 'best').el, stat(s.bestStreak, 'best streak').el),
        line('STRATA', s.strata.length > 1 ? `${s.strata.length - 1} crossed: ${s.strata.join(' › ')}` : `None crossed. You stayed in ${s.strata[0] ?? 'the dark'}.`, 'sum-strata'),
        line('COLLECTED', got.length ? got.join(', ') : 'Nothing this time.', 'sum-collected'),
        line('HAZARDS', `${s.hazardsHit} met, ${s.hazardsDodged} slipped`, 'sum-hazards'),
        line('LIGHT', s.lightBack > 0 ? `Haul ${s.haul}. Mote carries back ${(s.lightBack / 1000).toFixed(1)} pips.` : 'Nothing to carry back.', 'sum-light'),
        el('div', { class: 'center' }, button(s.reason === 'star' ? 'To the star' : s.reason === 'floor' ? 'Step onto the floor' : 'Back to the box', () => {
          // A steering tap still in flight when the summary appears must not dismiss it.
          if (performance.now() - shownAt > 600) leave();
        }, { primary: true, id: 'dive-continue' })),
      ),
    );
    u.summary.hidden = false;
    shownAt = performance.now();
  };
  /** The dive is over: show what it was, then go on. */
  const finish = (c: AppContext, u: Ui, v: DiveView, to: ScreenId, quickMs: number) => {
    leaving = true;
    catching = null;
    c.persist();
    exitTo = to;
    const s = v.summary;
    const shown = !!s && s.folds > 0;
    if (s && shown) showSummary(u, s);
    // Real time, not frame time: a slow device must not be left waiting on the summary.
    const token = ++exitToken;
    // The reckoning stays long enough to be read; its button leaves at once.
    setTimeout(() => { if (token === exitToken) leave(); }, shown ? 24000 : quickMs);
  };

  return {
    id: 'dive',
    mount: (root, c) => {
      ctx = c;
      leaving = false;
      lastDepth = 0;
      message = null;
      catching = null;
      exitTo = null;
      bannerUntil = 0;
      tagText.fill('');
      threatText = streakText = stratumText = '';
      const slot = c.box.selected();
      const u = c.selection.universe ?? c.universes.fromSerial(c.box.slots()[slot]?.serialNumber ?? 0);
      c.selection.universe = u;
      const best = c.box.slots()[slot]?.stats.deepestFold ?? 0;
      takenAll = loadTaken();
      takenId = String(u.serialNumber);
      taken = new Set(takenAll[takenId] ?? []);
      c.dive.bindTaken?.(taken);
      // Back from the system of the star this dive stopped at: the fall goes on from that fold.
      // Anything else (Enter in the Box, rising from the floor, another universe) starts at the top.
      const at = c.selection.star;
      const dv = c.dive.view();
      const resume = !!at && dv.phase === 'stopped' && !dv.bottom && dv.universe?.serialNumber === u.serialNumber && dv.children.some((ch) => !!ch.star && sameStar(ch.star, at));
      if (!resume && dv.phase !== 'surfaced') c.dive.surface();
      c.dive.start(u, best);
      const resumed = resume && c.dive.view().depth === dv.depth && c.dive.view().phase === 'hovering';
      root.setAttribute('data-resumed', resumed ? String(dv.depth) : '');
      if (resumed) say(dv.depth > 0 ? `Fold ${dv.depth} again, beside the star. Hold to fall on.` : 'Beside the star again. Hold to fall on.', 3200);
      lastDepth = c.dive.view().depth;
      const hold = holdButton();
      hold.addEventListener('contextmenu', (e) => e.preventDefault());
      const down = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        hold.setPointerCapture(e.pointerId);
        c.dive.hold();
        hold.setAttribute('aria-pressed', 'true');
      };
      const up = () => {
        hold.setAttribute('aria-pressed', 'false');
        c.dive.release();
      };
      hold.addEventListener('pointerdown', down);
      hold.addEventListener('pointerup', up);
      hold.addEventListener('pointercancel', up);
      const tags = Array.from({ length: 7 }, (_, i) => el('i', { class: 'fold-tag', 'data-id': `fold-tag-${i}`, hidden: true }));
      const bannerName = el('b', {});
      const bannerLine = el('span', {});
      const banner = el('div', { class: 'stratum-banner', 'data-id': 'stratum-banner', 'aria-live': 'polite' }, bannerName, bannerLine);
      const field = el('div', { class: 'spacer fold-field', 'data-id': 'fold-field' }, banner, ...tags);
      field.addEventListener('pointerdown', (e) => {
        if (leaving) return;
        const r = c.gl.canvas.getBoundingClientRect();
        const v = c.dive.view();
        const i = childAt(foldFrame(c.gl.width(), c.gl.height(), v.progress, v.aim), e.clientX - r.left, e.clientY - r.top);
        if (catching) {
          const at = catching;
          catching = null;
          if (i === at.index && v.children[i]?.flicker) {
            // The second tap is the throw: how near the closing ring is to the band decides it.
            const res = c.dive.throwAt(i, catchAccuracy(catchScale(t - at.start)));
            say(res.ok ? `Caught ${c.universes.fromSerial(res.serialNumber).name}. It is in the box.` : CAPTURE[res.reason]!, 3000);
            c.audio.sfx(res.ok ? 'catch' : 'deny');
            field.setAttribute('data-caught', res.ok ? 'ok' : res.reason);
            if (res.ok) { c.persist(); const rr = root.getBoundingClientRect(); burst(root, e.clientX - rr.left, e.clientY - rr.top, 14, true); }
            else if (res.reason === 'missed') shake(field);
            return;
          }
        }
        if (i < 0) return;
        if (v.children[i]?.flicker) {
          if (v.reliquaries <= 0) { say(CAPTURE['no-reliquary']!); c.audio.sfx('deny'); return; }
          catching = { index: i, start: t, depth: v.depth };
          c.audio.sfx('tap');
          say('A ring closes on it. Tap it again as the ring crosses the band.', 3600);
          return;
        }
        if (v.steerLocked) { say('The undertow has the steering.', 1400); return; }
        c.dive.aim(i);
        const th = v.children[i]?.thing;
        say(v.children[i]?.star ? 'Steering into a star. Fall into it to land.' : th ? (HAZARD_NAME[th.kind] ? `Steering into the ${HAZARD_NAME[th.kind]}. Are you sure?` : `Steering for the ${TAG[th.kind].toLowerCase()}.`) : i === 0 ? 'Steering to the centre.' : 'Steering into that ring.', 1600);
      });
      const bar = el('i', { class: 'bar-fill' });
      const bestM = el('i', { class: 'bar-best' });
      const floorM = el('i', { class: 'bar-floor', hidden: true });
      const ticks = Array.from({ length: 5 }, () => el('i', { class: 'bar-stratum', hidden: true }));
      const wrap = el('div', { class: 'depth-bar' }, bar, ...ticks, bestM, floorM);
      const stratum = el('span', { class: 'k-label dive-stratum', 'data-id': 'stratum' }, '');
      const streak = el('span', { class: 'k-label dive-streak', 'data-id': 'streak' }, '');
      const threat = el('span', { class: 'k-label dive-threat', 'data-id': 'dive-threat', role: 'status' }, '');
      const summary = el('div', { class: 'dive-summary', 'data-id': 'dive-summary', hidden: true });
      const sayEl = narration('');
      sayEl.classList.add('dive-say');
      ui = { root, floor: floorM, wrap, fold: label('FOLD 0'), bar, best: bestM, rel: label('RELIQUARIES 3'), say: sayEl, pips: lightPips(c.light.view().pips), field, tags, ticks, stratum, streak, threat, banner, bannerName, bannerLine, summary };
      ui.rel.setAttribute('data-id', 'reliquaries');
      ui.fold.setAttribute('data-id', 'fold-count');
      root.append(
        el('header', { class: c.battle?.outcome === 'ongoing' ? 'row dive-head tight' : 'row dive-head' }, backChip('SURFACE', () => { if (!leaving) c.dive.surface(); }), c.battle?.outcome === 'ongoing' ? backChip('BATTLE', () => (c.dive.surface(), c.go('battle'))) : null, ui.pips.el),
        el('div', { class: 'row' }, ui.fold, ui.rel),
        wrap,
        el('div', { class: 'row nowrap dive-status' }, stratum, streak),
        threat,
        field,
        ui.say,
        el('div', { class: 'center' }, hold),
        summary,
      );
    },
    frame: (dt) => {
      if (!ctx || !ui) return;
      const c = ctx, u = ui;
      t += dt;
      // Carry the remainder: at 60 fps a frame is ~17 ms, less than one 50 ms tick.
      tickMs += Math.min(dt, 250);
      const ticks = Math.floor(tickMs / 50);
      tickMs -= ticks * 50;
      if (ticks > 0) c.dive.update(ticks);
      const v = c.dive.view();
      const events = c.dive.takeEvents?.();
      if (events && events.length) for (const e of events) onEvent(c, u, v, e);
      const pips = c.light.view().pips;
      u.pips.update(pips);
      const foldText = v.bottom ? `FOLD ${v.depth} · THE FLOOR` : `FOLD ${v.depth}`;
      if (u.fold.textContent !== foldText) u.fold.textContent = foldText;
      if (v.depth !== lastDepth) { lastDepth = v.depth; c.audio.sfx('fold', Math.min(1, v.depth / 40)); try { navigator.vibrate?.(8); } catch { /* not allowed */ } }
      const relText = `RELIQUARIES ${v.reliquaries}`;
      if (u.rel.textContent !== relText) u.rel.textContent = relText;
      const scale = Math.max(40, v.best + 5);
      // The floor shows on the bar only once it is close.
      const toBottom = v.toBottom ?? 99;
      const near = toBottom <= 6 && v.phase !== 'surfaced';
      if (u.floor.hidden === near) {
        u.floor.hidden = !near;
        u.wrap.classList.toggle('near-floor', near);
        if (near && !v.bottom) { c.audio.sfx('fold', 1); say('Something is below.', 2200); }
      }
      if (near) u.floor.style.left = `${Math.min(100, ((v.depth + toBottom) / scale) * 100)}%`;
      u.bar.style.width = `${Math.min(100, (v.depth / scale) * 100)}%`;
      u.best.style.left = `${Math.min(100, (v.best / scale) * 100)}%`;

      // Strata: where each begins on the bar (those reached, plus the next), and where you are.
      const strata = v.strata ?? [];
      const here = v.stratum ?? null;
      for (let i = 0; i < u.ticks.length; i++) {
        const s = strata[i];
        const show = !!s && s.from > 0 && !!here && s.index <= here.index + 1 && s.from <= scale;
        const tk = u.ticks[i]!;
        if (tk.hidden === show) tk.hidden = !show;
        if (show && s) { const left = `${(s.from / scale) * 100}%`; if (tk.style.left !== left) tk.style.left = left; }
      }
      const sText = here ? `${here.name} · ${here.index + 1}/${strata.length}` : '';
      if (sText !== stratumText) { stratumText = sText; u.stratum.textContent = sText; }
      const streak = v.streak ?? 0, mult = v.multiplier ?? 1;
      const kText = streak > 0 ? `STREAK ${streak} ×${mult} · HAUL ${v.haul ?? 0}` : `HAUL ${v.haul ?? 0}`;
      if (kText !== streakText) { streakText = kText; u.streak.textContent = kText; u.streak.classList.toggle('hot', mult > 1); }
      if (bannerUntil && t > bannerUntil) { bannerUntil = 0; u.banner.classList.remove('on'); }

      // What each ring holds, written on it.
      // Measured every frame: the canvas and the field move on resize, rotation, text size and screen transitions,
      // and a tag drawn from a stale offset sits on the wrong ring.
      {
        const cr = c.gl.canvas.getBoundingClientRect(), fr = u.field.getBoundingClientRect();
        offX = cr.left - fr.left;
        offY = cr.top - fr.top;
        fieldW = fr.width;
        fieldH = fr.height;
      }
      const f = foldFrame(c.gl.width(), c.gl.height(), v.progress, v.aim);
      let ahead = '';
      for (let i = 0; i < 7; i++) {
        const ch: FoldNode | undefined = v.children[i];
        const th = ch?.thing;
        const text = leaving || v.phase === 'surfaced' ? '' : ch?.star ? 'STAR' : ch?.flicker ? 'FLICKER' : th ? TAG[th.kind] : '';
        const tg = u.tags[i]!;
        if (text !== tagText[i]) {
          tagText[i] = text;
          tg.textContent = text;
          tg.hidden = text === '';
          tg.classList.toggle('bad', text.charAt(0) === '!');
          tagW[i] = text === '' ? 0 : tg.offsetWidth;
        }
        if (text !== '') {
          const s = childScreen(f, i);
          // On the lower part of its ring, and never off the field: a ring half out of view keeps its tag in view.
          const x = s.x + offX, y = s.y + offY, half = tagW[i]! / 2 + 2;
          const seen = x + s.r > 8 && x - s.r < fieldW - 8 && y + s.r > 8 && y - s.r < fieldH - 8;
          const tx = Math.round(Math.max(half, Math.min(fieldW - half, x)));
          const ty = Math.round(Math.max(Math.max(2, y - s.r), Math.min(Math.min(fieldH - 18, y + s.r - 16), y + s.r * 0.56)));
          tg.style.transform = `translate(${tx}px, ${ty}px) translate(-50%, 0)`;
          tg.style.opacity = !seen || (f.zoom > 1.9 && i !== v.aim) ? '0' : '1';
          const hz = th ? HAZARD_NAME[th.kind] : undefined;
          if (hz) ahead += (ahead ? ', ' : '') + (i === 0 ? `${hz} dead ahead` : hz);
        }
      }
      const follower = v.follower ?? 0;
      const threat = leaving ? '' : follower > 0 ? `IT FOLLOWS · ${follower} BEHIND · KEEP FALLING` : v.steerLocked ? 'UNDERTOW · NO STEERING' : ahead ? `HERE: ${ahead}` : '';
      if (threat !== threatText) { threatText = threat; u.threat.textContent = threat; u.threat.classList.toggle('on', threat !== ''); }

      // A throw being timed.
      if (catching && (v.depth !== catching.depth || !v.children[catching.index]?.flicker || t - catching.start > CATCH_MS * CATCH_ROUNDS)) {
        if (t - catching.start > CATCH_MS * CATCH_ROUNDS) say('The ring lets go. Nothing was thrown.', 1800);
        catching = null;
      }
      if (catching) {
        ring.index = catching.index;
        ring.scale = catchScale(t - catching.start);
        u.field.setAttribute('data-catch', String(Math.round(ring.scale * 100)));
      } else if (u.field.hasAttribute('data-catch')) u.field.removeAttribute('data-catch');

      const text = message && message.until > t ? message.text : v.phase === 'falling' && v.children[v.aim]?.star ? 'Falling into a star…' : v.star && v.phase === 'falling' && v.progress < 500 ? 'A star nearby. Let go to stop, or tap it to fall in.' : v.narration;
      if (!leaving && u.say.textContent !== text) u.say.textContent = text;
      rv.dive = v;
      rv.pulse = c.pulse().phase();
      rv.lightPips = pips;
      rv.catchRing = catching ? ring : null;
      rv.quality = c.perf.resolutionScale();
      c.renderers.dive.draw(rv as DiveRenderView, dt);

      if (leaving) {
        // Waiting on the summary; leave() runs from its button or its timer.
      } else if (v.bottom) {
        // The bottom of the universe: a floor, and a room on it.
        const r = u.root.getBoundingClientRect();
        c.audio.sfx('land');
        try { navigator.vibrate?.([30, 60, 30]); } catch { /* not allowed */ }
        flash(u.root);
        burst(u.root, r.width / 2, r.height * 0.42, 18, true);
        message = null;
        u.say.textContent = v.narration;
        c.box.recordDepth(c.box.selected(), v.depth);
        // Once per landing: this branch cannot run again until another dive reaches the floor.
        c.box.recordFloor?.(c.box.selected());
        finish(c, u, v, 'mirror', 1500);
      } else if (v.phase === 'stopped' && v.star) {
        c.audio.sfx('land');
        c.selection.star = v.star;
        if (v.universe) rememberStar(v.universe.serialNumber, v.star);
        c.selection.system = null;
        c.selection.planetIndex = 0;
        c.box.recordDepth(c.box.selected(), v.depth);
        u.say.textContent = 'A star. Mote settles beside it.';
        finish(c, u, v, 'system', 500);
      } else if (v.phase === 'surfaced') {
        u.say.textContent = 'You surface.';
        finish(c, u, v, 'box', 0);
      }
    },
    unmount: () => { exitToken++; exitTo = null; ctx = null; ui = null; },
  };
};

export const factory = () => ({ dive });
