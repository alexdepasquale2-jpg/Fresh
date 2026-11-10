/**
 * The campaign: six chapters laid over the sandbox, a Journal page in the hub, and an
 * ending. Nothing here is self-reported or timed. Every objective is a predicate over
 * real game state (the Box and its stats, every sky, the open surface, the dive, the
 * battle, the screens you have stood on), sampled a few times a second.
 *
 * Facts that can only be seen while they are true (a body, a battle won, the floor of a
 * universe) are remembered the moment they are seen, whatever chapter is open, so a
 * chapter you reach late fills in at once with what you have already done.
 *
 * Other plugins may read `window.__sallowCampaign` ({ chapter, done }).
 */
import './campaign.css';
import { el, button } from '@/ui/kit';
import type { ScreenId, SimFrame } from '@/contracts/app';
import type { BoxEntry } from '@/contracts/game';
import type { SkyPieceKind, SkyState } from '@/contracts/sky';
import type { BattleState } from '@/contracts/battle';
import type { DiveView } from '@/contracts/game';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { DAY_TICKS } from '@/contracts/sim';
import type { Plugin } from '../plugins';

const CHECK_MS = 300;
const SOULS_GOAL = 120;
const WALK_GOAL = 12;
const ORBIT_GOAL = 6;
const ALIGN_GOAL = 8;
const TEND_GOAL = 5;
const KEEP_GOAL = 12;
const RIVALS_GOAL = 3;
/** Written by the mirror room when the child at the bottom hands a universe over. Read only. */
const MIRROR_KEY = 'sallow-mirror-seen';

/** Everything an objective may look at. Rebuilt on every check from live state. */
interface World {
  readonly screen: ScreenId | null;
  /** Screens the player has stood on since the journal began. */
  readonly been: ReadonlySet<string>;
  readonly entries: readonly BoxEntry[];
  readonly boxCount: number;
  readonly maxDepth: number;
  readonly tended: number;
  readonly tendedUniverses: number;
  readonly glow: number;
  readonly bestSouls: number;
  readonly bestEra: number;
  readonly skies: readonly SkyState[];
  readonly maxPieces: number;
  readonly orbiters: number;
  /** Things in orbit across the solar system the player is in now. */
  readonly systemOrbiters: number;
  readonly frame: SimFrame | null;
  readonly dive: DiveView;
  readonly battle: BattleState | null;
  readonly beaten: number;
  /** True while the planet screen is showing the world through the body's eyes. */
  readonly eyes: boolean;
  /** Columns walked from where the current body was taken. */
  readonly walked: number;
  /** Sim ticks the current body has lived. */
  readonly bodyTicks: number;
  readonly mirrorGifts: number;
  /** A universe arrived in the Box while falling: a flicker caught in a reliquary. */
  readonly caughtFalling: boolean;
}

interface Objective {
  readonly id: string;
  readonly text: string;
  /** One line for the Journal while the objective is open. */
  readonly hint: string;
  test(w: World): boolean;
  /** [have, want] shown beside an open objective. */
  count?(w: World): readonly [number, number];
}
interface Reward {
  readonly glow: number;
  readonly pieces: readonly (readonly [SkyPieceKind, number])[];
  /** A universe that arrives in the Box, if there is room and it is not already there. */
  readonly universe?: number;
  readonly says: string;
}
interface Chapter {
  readonly id: string;
  readonly title: string;
  readonly intro: string;
  readonly outro: string;
  readonly objectives: readonly Objective[];
  readonly reward: Reward;
}

const went = (w: World, s: ScreenId) => w.been.has(s);
const villages = (w: World) => w.frame?.civ.villages.length ?? 0;
const souls = (w: World) => Math.max(w.bestSouls, w.frame?.civ.souls ?? 0);
const avatar = (w: World) => w.frame?.civ.avatar ?? null;

const CHAPTERS: readonly Chapter[] = [
  {
    id: 'box',
    title: 'The Box',
    intro: 'There is a box on your PC. It was not there yesterday. Mote says it has always been there. Open it, and fall.',
    outro: 'You have been inside. The box is warmer than it was.',
    objectives: [
      { id: 'box.open', text: 'Open the Box', hint: 'In the bedroom, press OPEN THE BOX.', test: (w) => went(w, 'box') || w.maxDepth > 0 || w.tended > 0 },
      { id: 'box.enter', text: 'Enter a universe', hint: 'Choose a slot in the Box and press ENTER.', test: (w) => went(w, 'dive') || w.maxDepth > 0 || w.tended > 0 },
      { id: 'box.fall', text: 'Fall three folds deep', hint: 'Hold HOLD to fall. Each fold costs a little Light.', test: (w) => w.maxDepth >= 3, count: (w) => [w.maxDepth, 3] },
      { id: 'box.star', text: 'Stop at a star', hint: 'Let go of HOLD while a star is near.', test: (w) => went(w, 'system') || w.tended > 0 || (w.dive.phase === 'stopped' && !!w.dive.star) },
      { id: 'box.watch', text: 'Watch a surface', hint: 'At a star, choose a world and press WATCH THE SURFACE.', test: (w) => w.tended > 0 || (w.screen === 'planet' && !!w.frame) },
    ],
    reward: { glow: 1000, pieces: [['moon', 1], ['comet', 1]], says: 'A pip of Light, a moon and a comet.' },
  },
  {
    id: 'sky',
    title: 'Sky',
    intro: 'You cannot touch them. You can only change what hangs over them. They will look up, and decide what it means.',
    outro: 'They have a sky now, and a reason for it. They made the reason up.',
    objectives: [
      { id: 'sky.hang', text: 'Hang a piece in a sky', hint: 'At a star, drag a sky piece onto an orbit. On a surface, press one beside HANG.', test: (w) => w.maxPieces >= 1 },
      { id: 'sky.three', text: 'Hang three pieces over one world', hint: 'One sky holds up to eight. Three is enough to change a faith.', test: (w) => w.maxPieces >= 3, count: (w) => [w.maxPieces, 3] },
      { id: 'sky.nudge', text: 'Move a world nearer its star, or further', hint: 'At a star, use PULL or PUSH on an orbit.', test: (w) => w.skies.some((s) => (s.drift ?? 0) !== 0) },
      { id: 'sky.village', text: 'See a new village founded', hint: 'Watch a surface and let the years run. A crowded village sends its young to find new ground.', test: (w) => villages(w) >= 2, count: (w) => [villages(w), 2] },
      { id: 'sky.souls', text: `Reach ${SOULS_GOAL} souls on one world`, hint: 'Mild seasons, water and food. Run the clock at 3x and leave them be.', test: (w) => souls(w) >= SOULS_GOAL, count: (w) => [souls(w), SOULS_GOAL] },
      { id: 'sky.fire', text: 'See a people learn fire', hint: 'Villages that eat well and stay glad learn. Give them time.', test: (w) => Math.max(w.bestEra, w.frame?.civ.era ?? 0) >= 1 },
      { id: 'sky.glow', text: 'Let a world feed your Light', hint: 'Souls glow. Keep watching a living world and Mote brightens.', test: (w) => w.glow > 0 },
    ],
    reward: { glow: 1500, pieces: [['sun', 1], ['rings', 1], ['dust', 1]], universe: 0x51ca11, says: 'Light, a sun, rings, dust, and a universe that was waiting behind the others.' },
  },
  {
    id: 'body',
    title: 'Body',
    intro: 'Mote says there is a way down that is not falling. You take a body. It is small, and it is cold, and they can see it.',
    outro: 'Someone down there knows your face. You did not know you had one.',
    objectives: [
      { id: 'body.take', text: 'Take a body', hint: 'On a surface, choose the Body tool and tap the ground.', test: (w) => !!avatar(w) },
      { id: 'body.walk', text: 'Walk among them', hint: 'With a body, tap further along the ground to walk there.', test: (w) => w.walked >= WALK_GOAL, count: (w) => [w.walked, WALK_GOAL] },
      { id: 'body.eyes', text: 'Open its eyes', hint: 'With a body, press Eyes, or zoom all the way in.', test: (w) => w.eyes },
      { id: 'body.act', text: 'Do something with its hands', hint: 'Strike, Preach, Gift, Shine or Rest appear while you have a body.', test: (w) => !!avatar(w)?.action },
      { id: 'body.day', text: 'Live one whole day in it', hint: 'Stay in one body for a full turn of their sun. They may not let you.', test: (w) => w.bodyTicks >= DAY_TICKS, count: (w) => [Math.floor((w.bodyTicks * 100) / DAY_TICKS), 100] },
      { id: 'body.seen', text: 'Be seen by the one the chronicle names', hint: 'A world with a named person shows their card. Press Find, then walk your body to them.', test: (w) => !!w.frame?.civ.notable?.metYou },
    ],
    reward: { glow: 2000, pieces: [['moon', 2], ['belt', 1]], universe: 0xb0d1e5, says: 'Two pips of Light, two moons, a belt, and a universe that smells of rain.' },
  },
  {
    id: 'outside',
    title: 'Outside',
    intro: 'Other kids have boxes too. They do not talk about it at school. Go outside. Bring your three strongest.',
    outro: 'Their universes sit in your box now. They are quiet. They are listening to yours.',
    objectives: [
      { id: 'out.go', text: 'Go outside', hint: 'In the bedroom, press GO OUTSIDE.', test: (w) => went(w, 'outside') || w.beaten > 0 },
      { id: 'out.fight', text: 'Stand against another box', hint: 'Outside, choose a kid. The first is always willing.', test: (w) => !!w.battle || w.beaten > 0 },
      { id: 'out.enter', text: 'Step into your universe while the battle waits', hint: 'In a battle, press the button that takes you inside your fighter.', test: (w) => w.battle?.outcome === 'ongoing' && (w.screen === 'planet' || w.screen === 'system' || w.screen === 'dive') },
      { id: 'out.fuse', text: 'Fuse two of yours into one', hint: 'In a battle, press FUSE, then a universe on your bench. Once per battle.', test: (w) => !!w.battle && (w.battle.fusedUsed || w.battle.mine.some((f) => f.fused)) },
      { id: 'out.win', text: 'Win a battle', hint: 'Watch what they mean to do next. Guard when it is a huge blow.', test: (w) => w.battle?.outcome === 'won' || w.beaten > 0 },
      { id: 'out.catch', text: 'Take one of their universes home', hint: 'When you win, their box is open. Choose one.', test: (w) => w.beaten >= 1 },
      { id: 'out.three', text: `Beat ${RIVALS_GOAL} rivals`, hint: 'Each kid you beat lets you find the next.', test: (w) => w.beaten >= RIVALS_GOAL, count: (w) => [w.beaten, RIVALS_GOAL] },
    ],
    reward: { glow: 2500, pieces: [['belt', 2], ['comet', 2], ['dust', 1]], says: 'Light, two belts, two comets and dust.' },
  },
  {
    id: 'deep',
    title: 'Deep',
    intro: 'Every universe has a bottom. Mote does not like to say what is there. Fall until the folds stop.',
    outro: 'There was a room. There was a kid, and a PC, and a box. You know whose box you are in.',
    objectives: [
      { id: 'deep.ten', text: 'Fall past fold 10', hint: 'Fill your Light before a long fall. It drains by the fold.', test: (w) => w.maxDepth >= 10, count: (w) => [w.maxDepth, 10] },
      { id: 'deep.twenty', text: 'Fall past fold 20', hint: 'A glowing world pays for the fall. Watch one first.', test: (w) => w.maxDepth >= 20, count: (w) => [w.maxDepth, 20] },
      { id: 'deep.flicker', text: 'Catch a flicker as you fall', hint: 'A flicker is a loose universe. Tap it mid-fall to throw a reliquary.', test: (w) => w.caughtFalling },
      { id: 'deep.floor', text: 'Reach the floor of a universe', hint: 'Somewhere past fold 24 the narration changes. Keep holding.', test: (w) => !!w.dive.bottom || went(w, 'mirror') || w.mirrorGifts > 0 },
      { id: 'deep.room', text: 'Stand in the room at the bottom', hint: 'At the floor, wait. The room comes to you.', test: (w) => went(w, 'mirror') || w.mirrorGifts > 0 },
      { id: 'deep.gift', text: 'Take what the other child hands you', hint: 'In the room, stay until the end of what they say.', test: (w) => w.mirrorGifts > 0 },
    ],
    reward: { glow: 3000, pieces: [['sun', 2], ['rings', 1]], universe: 0x0dee9f, says: 'Three pips of Light, two suns, rings, and a universe from very far down.' },
  },
  {
    id: 'align',
    title: 'Alignment',
    intro: 'They have started to look up on purpose. Soon they will send things. Keep them fed, keep them glad, and let every world turn as one.',
    outro: 'Every world in the system turns as one. Above them, something small and bright is pleased.',
    objectives: [
      { id: 'align.launch', text: 'See a world put something into orbit', hint: 'A star-reaching people build a pad. Keep them prosperous and watch.', test: (w) => w.orbiters >= 1 || (w.frame?.civ.launches ?? 0) >= 1 },
      { id: 'align.reach', text: 'Raise a star-reaching people', hint: 'Six eras: huts, fire, iron, lamps, bells, star-reaching.', test: (w) => Math.max(w.bestEra, w.frame?.civ.era ?? 0) >= 5, count: (w) => [Math.max(w.bestEra, w.frame?.civ.era ?? 0), 5] },
      { id: 'align.bright', text: 'Keep a world both prosperous and enlightened', hint: 'Prosperity 60 and a village that fully understands what you are. Preach, bless, feed.', test: (w) => w.entries.some((e) => (e.stats.prosperity ?? 0) >= 60 && (e.stats.enlightenment ?? 0) >= 100) },
      { id: 'align.orbit', text: `Have ${ORBIT_GOAL} things in orbit across your skies`, hint: 'Lanterns first, then stations. Every launch stays up.', test: (w) => w.orbiters >= ORBIT_GOAL, count: (w) => [w.orbiters, ORBIT_GOAL] },
      { id: 'align.system', text: 'Align a solar system', hint: `${ALIGN_GOAL} things in orbit around one star, then stand at that star.`, test: (w) => w.systemOrbiters >= ALIGN_GOAL, count: (w) => [w.systemOrbiters, ALIGN_GOAL] },
      { id: 'align.tend', text: `Tend worlds in ${TEND_GOAL} universes`, hint: 'Watch a surface in each. The Box remembers which you have tended.', test: (w) => w.tendedUniverses >= TEND_GOAL, count: (w) => [w.tendedUniverses, TEND_GOAL] },
      { id: 'align.keep', text: `Keep ${KEEP_GOAL} universes in the Box`, hint: 'Catch flickers, win them outside, or take them from the room at the bottom.', test: (w) => w.boxCount >= KEEP_GOAL, count: (w) => [w.boxCount, KEEP_GOAL] },
    ],
    reward: { glow: 8000, pieces: SKY_PIECE_KINDS.map((k) => [k, 2] as const), says: 'All the Light Mote can hold, and two of every piece of sky.' },
  },
];
const ALL = CHAPTERS.flatMap((c) => c.objectives);
const ENDING = {
  title: 'The Box is open',
  text: 'Somewhere above your ceiling a kid looks at a small glow on a screen and is pleased with you. You look at yours. It goes all the way down, and it goes all the way up, and you are in the middle, tending.',
  after: 'There is nothing left to be told. The box is yours to keep.',
};

interface Saved {
  v: 1;
  /** Index of the open chapter; CHAPTERS.length once the last one is closed. */
  chapter: number;
  /** Objectives completed and rewarded. */
  done: string[];
  /** Objectives seen to be true, in any chapter. */
  met: string[];
  been: string[];
  /** Chapters whose intro card has been shown (CHAPTERS.length is the ending). */
  intro: number[];
  /** Marks made since the Journal was last read. */
  fresh: number;
  /** Objective and chapter ids already paid for. Kept through "Start over", so nothing pays twice. */
  paid: string[];
}
const blank = (): Saved => ({ v: 1, chapter: 0, done: [], met: [], been: [], intro: [], fresh: 0, paid: [] });
const clean = (raw: unknown): Saved => {
  const s = blank();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Partial<Record<keyof Saved, unknown>>;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  if (typeof r.chapter === 'number' && Number.isInteger(r.chapter)) s.chapter = Math.max(0, Math.min(CHAPTERS.length, r.chapter));
  s.done = strs(r.done);
  s.met = strs(r.met);
  s.been = strs(r.been);
  s.paid = strs(r.paid);
  s.intro = Array.isArray(r.intro) ? r.intro.filter((x): x is number => typeof x === 'number') : [];
  if (typeof r.fresh === 'number' && r.fresh > 0) s.fresh = Math.floor(r.fresh);
  return s;
};

export const plugin: Plugin = (shell) => {
  const { ctx } = shell;
  const store = shell.store<Saved>('campaign', blank());
  let st = clean(store.get());
  const done = new Set(st.done);
  const met = new Set(st.met);
  const been = new Set(st.been);
  const save = () => {
    st.done = [...done];
    st.met = [...met];
    st.been = [...been];
    store.set(st);
  };
  const publish = () => {
    const snap = Object.freeze({ chapter: st.chapter, done: Object.freeze([...done]) as readonly string[] });
    (window as unknown as { __sallowCampaign: unknown }).__sallowCampaign = snap;
  };
  publish();

  // ---- what can only be seen while it happens ----
  let bodyTicks = 0;
  let bodyFrom = -1;
  let walked = 0;
  let lastTick = -1;
  let lastBoxCount = -1;
  let caughtFalling = false;
  let lastWorld: World | null = null;
  let journal: (() => void) | null = null;

  const mirrorGifts = (): number => {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(MIRROR_KEY) ?? '[]');
      return Array.isArray(v) ? v.length : 0;
    } catch { return 0; }
  };

  const look = (): World => {
    const screen = shell.current();
    const entries = ctx.box.slots().filter((e): e is BoxEntry => !!e);
    let maxDepth = 0, tended = 0, tendedUniverses = 0, glow = 0, bestSouls = 0, bestEra = 0;
    for (const e of entries) {
      const s = e.stats;
      if (s.deepestFold > maxDepth) maxDepth = s.deepestFold;
      tended += s.worldsTended;
      if (s.worldsTended > 0) tendedUniverses++;
      glow += s.lightFromGlow;
      if ((s.souls ?? 0) > bestSouls) bestSouls = s.souls ?? 0;
      if ((s.era ?? 0) > bestEra) bestEra = s.era ?? 0;
    }
    const dive = ctx.dive.view();
    if (screen === 'dive' && dive.depth > maxDepth) maxDepth = dive.depth;
    const skies = ctx.sky.snapshot().skies;
    let maxPieces = 0, orbiters = 0;
    for (const s of skies) {
      if (s.pieces.length > maxPieces) maxPieces = s.pieces.length;
      orbiters += s.built ?? 0;
    }
    const sys = ctx.selection.system;
    let systemOrbiters = 0;
    if (sys) for (const p of sys.planets) systemOrbiters += ctx.sky.skyOf(p).built ?? 0;

    // The surface only counts while it is the one on screen.
    const frame = screen === 'planet' ? ctx.sim.latest() : null;
    const av = frame?.civ.avatar ?? null;
    if (frame && av && av.hp > 0) {
      if (bodyFrom < 0 || lastTick < 0 || frame.tick < lastTick) { bodyFrom = av.x; bodyTicks = 0; walked = 0; }
      else bodyTicks += frame.tick - lastTick;
      walked = Math.max(walked, Math.abs(av.x - bodyFrom));
      lastTick = frame.tick;
    } else { bodyFrom = -1; bodyTicks = 0; walked = 0; lastTick = -1; }
    const walkBtn = screen === 'planet' && av ? shell.layer.querySelector<HTMLElement>('[data-id=walk]') : null;
    const eyes = !!walkBtn && !walkBtn.hidden;

    const boxCount = ctx.box.count();
    if (lastBoxCount >= 0 && boxCount > lastBoxCount && screen === 'dive') caughtFalling = true;
    lastBoxCount = boxCount;

    return {
      screen, been, entries, boxCount, maxDepth, tended, tendedUniverses, glow, bestSouls, bestEra,
      skies, maxPieces, orbiters, systemOrbiters, frame, dive, battle: ctx.battle, beaten: ctx.rivalsBeaten.size,
      eyes, walked, bodyTicks, mirrorGifts: mirrorGifts(), caughtFalling,
    };
  };

  // ---- rewards ----
  const give = (id: string, r: Reward): string => {
    if (st.paid.includes(id)) return 'Mote has already paid you for this.';
    st.paid.push(id);
    ctx.light.addGlow(r.glow);
    for (const [k, n] of r.pieces) ctx.sky.grant(k, n);
    let says = r.says;
    if (r.universe !== undefined && ctx.box.add(r.universe) < 0) {
      // No room, or it is already here: a sun instead.
      ctx.sky.grant('sun', 1);
      says = `${says} The box had no room for it, so Mote kept a sun instead.`;
    }
    ctx.bus.emit('light:changed', { pips: ctx.light.view().pips });
    ctx.bus.emit('box:changed', { count: ctx.box.count() });
    ctx.persist();
    return says;
  };
  /** A small thank-you for one mark: a little glow, and now and then a piece. */
  const tip = (o: Objective) => {
    if (st.paid.includes(o.id)) return;
    st.paid.push(o.id);
    const i = ALL.indexOf(o);
    ctx.light.addGlow(120);
    if (i % 3 === 2) ctx.sky.grant(SKY_PIECE_KINDS[i % SKY_PIECE_KINDS.length]!, 1);
    ctx.bus.emit('light:changed', { pips: ctx.light.view().pips });
  };

  const check = () => {
    const w = look();
    lastWorld = w;
    let changed = false;
    for (const o of ALL) {
      if (met.has(o.id)) continue;
      let ok = false;
      try { ok = o.test(w); } catch { ok = false; }
      if (ok) { met.add(o.id); changed = true; }
    }
    const ch = CHAPTERS[st.chapter];
    if (ch) {
      const now = ch.objectives.filter((o) => met.has(o.id) && !done.has(o.id));
      if (now.length) {
        for (const o of now) { done.add(o.id); tip(o); }
        st.fresh += now.length;
        changed = true;
        const left = ch.objectives.filter((o) => !done.has(o.id)).length;
        if (left > 0) {
          if (now.length === 1) shell.toast(now[0]!.text, { title: `Journal · ${ch.title}`, sfx: 'gain' });
          else shell.toast(now.length === 2 ? `${now[0]!.text}. ${now[1]!.text}.` : `${now.length} marks at once. The Journal has them.`, { title: `Journal · ${ch.title}`, sfx: 'gain' });
          ctx.persist();
        } else {
          const says = give(`chapter:${ch.id}`, ch.reward);
          st.chapter++;
          shell.toast(`${ch.outro} ${says}`, { title: `Chapter ${st.chapter} closed · ${ch.title}`, sfx: 'win' });
        }
      }
    }
    if (changed) {
      if (journal) st.fresh = 0;
      save(); publish(); journal?.();
    }
  };

  // ---- the card that opens a chapter (and the one that ends the book) ----
  const frameEl = el('div', { class: 'camp-frame' });
  const cardKicker = el('span', { class: 'k-label camp-kicker' });
  const cardTitle = el('h2', { class: 'camp-title' });
  const cardText = el('p', { class: 'camp-text' });
  const cardFoot = el('span', { class: 'camp-foot' }, 'Tap to go on. It is all in the Journal.');
  const card = el('button', { class: 'camp-card', type: 'button', 'data-id': 'campaign-card' }, cardKicker, cardTitle, cardText, cardFoot);
  card.hidden = true;
  frameEl.append(card);
  shell.host.append(frameEl);
  card.addEventListener('pointerdown', (e) => e.stopPropagation());
  let cardFor = -1;
  const hideCard = () => { card.hidden = true; cardFor = -1; };
  card.addEventListener('click', () => {
    if (cardFor >= 0 && !st.intro.includes(cardFor)) { st.intro.push(cardFor); save(); }
    hideCard();
  });
  const busy = () => shell.menu.isOpen() || !!document.querySelector('.guide .guide-card.on, .away, .away-note');
  const cards = () => {
    const screen = shell.current();
    const quiet = (screen === 'bedroom' || screen === 'box') && !busy();
    if (!card.hidden) {
      // Never talk over Mote or the away report, and never follow the player off these two screens.
      if (!quiet || cardFor !== st.chapter) hideCard();
      return;
    }
    if (!quiet || st.intro.includes(st.chapter)) return;
    const ch = CHAPTERS[st.chapter];
    cardFor = st.chapter;
    cardKicker.textContent = ch ? `Chapter ${st.chapter + 1} of ${CHAPTERS.length}` : 'The last page';
    cardTitle.textContent = ch ? ch.title : ENDING.title;
    cardText.textContent = ch ? ch.intro : ENDING.text;
    card.classList.toggle('end', !ch);
    card.hidden = false;
  };

  // ---- the Journal ----
  const fraction = (ch: Chapter) => ch.objectives.filter((o) => done.has(o.id)).length;
  const rewardLine = (ch: Chapter) => el('p', { class: 'camp-reward' }, el('span', { class: 'k-label' }, 'When it closes'), ch.reward.says);
  const objective = (o: Objective, w: World | null, open: boolean) => {
    const isDone = done.has(o.id);
    let count = '';
    if (!isDone && open && o.count && w) {
      try { const [have, want] = o.count(w); count = `${Math.max(0, Math.min(have, want))} / ${want}`; } catch { count = ''; }
    }
    return el('li', { class: isDone ? 'camp-obj done' : 'camp-obj', 'data-id': `obj-${o.id}` },
      el('i', { class: 'camp-mark', 'aria-hidden': 'true' }, isDone ? '✓' : ''),
      el('div', { class: 'camp-what' },
        el('span', { class: 'camp-line' }, o.text, count ? el('b', {}, count) : null),
        !isDone && open ? el('small', {}, o.hint) : null,
      ),
    );
  };

  const openPast = new Set<number>();
  let confirming = false;
  const startOver = () => {
    const paid = st.paid;
    st = blank();
    st.paid = paid;
    done.clear(); met.clear(); been.clear(); openPast.clear();
    caughtFalling = false;
    const now = shell.current();
    if (now) been.add(now);
    hideCard();
    save(); publish();
  };

  const renderJournal = (into: HTMLElement) => {
    const w = lastWorld;
    const kids: (Node | null)[] = [];
    const total = ALL.length;
    kids.push(el('p', { class: 'camp-sum', 'data-id': 'journal-sum' },
      st.chapter >= CHAPTERS.length ? 'Every chapter is closed.' : `Chapter ${st.chapter + 1} of ${CHAPTERS.length}`,
      el('b', {}, `${done.size} / ${total} marks`)));

    const cur = CHAPTERS[st.chapter];
    if (cur) {
      const n = fraction(cur);
      const bar = el('div', { class: 'camp-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': cur.objectives.length, 'aria-valuenow': n }, el('i', {}));
      (bar.firstElementChild as HTMLElement).style.width = `${Math.round((n * 100) / cur.objectives.length)}%`;
      kids.push(el('section', { class: 'camp-chapter now', 'data-id': 'journal-now' },
        el('h3', { class: 'camp-title' }, cur.title),
        el('p', { class: 'camp-text' }, cur.intro),
        el('div', { class: 'camp-prog' }, bar, el('span', { class: 'k-label' }, `${n} of ${cur.objectives.length}`)),
        el('ul', { class: 'camp-list' }, ...cur.objectives.map((o) => objective(o, w, true))),
        rewardLine(cur),
      ));
    } else {
      kids.push(el('section', { class: 'camp-chapter now end', 'data-id': 'journal-end' },
        el('h3', { class: 'camp-title' }, ENDING.title),
        el('p', { class: 'camp-text' }, ENDING.text),
        el('p', { class: 'camp-reward' }, ENDING.after),
      ));
    }

    CHAPTERS.forEach((ch, i) => {
      if (i === st.chapter) return;
      if (i > st.chapter) {
        kids.push(el('div', { class: 'camp-row locked', 'data-id': `journal-locked-${i}` }, el('span', { class: 'k-label' }, `Chapter ${i + 1}`), el('span', { class: 'camp-name' }, ch.title), el('span', { class: 'k-label' }, 'Not yet')));
        return;
      }
      const isOpen = openPast.has(i);
      const head = el('button', { class: 'camp-row past', type: 'button', 'aria-expanded': String(isOpen), 'data-id': `journal-past-${i}` },
        el('span', { class: 'k-label' }, `Chapter ${i + 1}`), el('span', { class: 'camp-name' }, ch.title), el('span', { class: 'k-label' }, isOpen ? 'Fold' : 'Closed ✓'));
      head.addEventListener('click', () => { if (isOpen) openPast.delete(i); else openPast.add(i); renderJournal(into); });
      kids.push(head);
      if (isOpen) kids.push(el('section', { class: 'camp-chapter old' },
        el('p', { class: 'camp-text' }, ch.outro),
        el('ul', { class: 'camp-list' }, ...ch.objectives.map((o) => objective(o, w, false))),
        el('p', { class: 'camp-reward' }, el('span', { class: 'k-label' }, 'It gave you'), ch.reward.says),
      ));
    });

    const over = el('div', { class: 'camp-over' });
    if (confirming) {
      over.append(
        el('p', { class: 'camp-text' }, 'Forget the journal? Your box, your Light and your skies stay as they are. What they already prove is marked again at once, and nothing pays twice.'),
        el('div', { class: 'camp-pair' },
          button('Forget it', () => { confirming = false; startOver(); renderJournal(into); }, { id: 'journal-reset-yes' }),
          button('Keep it', () => { confirming = false; renderJournal(into); }, { id: 'journal-reset-no' }),
        ),
      );
    } else {
      over.append(button('Start over', () => { confirming = true; renderJournal(into); }, { id: 'journal-reset' }));
    }
    kids.push(over);

    const page = el('div', { class: 'camp-journal' }, ...kids);
    const keep = into.scrollTop;
    into.replaceChildren(page);
    into.scrollTop = keep;
    if (confirming) into.scrollTop = into.scrollHeight;
  };

  shell.menu.add({
    id: 'journal',
    label: 'Journal',
    hint: 'What the box is asking of you',
    order: 10,
    badge: () => (st.fresh > 0 ? `${st.fresh} new` : null),
    render: (into) => {
      confirming = false;
      if (st.fresh > 0) { st.fresh = 0; save(); }
      try { lastWorld = look(); } catch { /* render with what we had */ }
      renderJournal(into);
      journal = () => renderJournal(into);
      return () => { journal = null; confirming = false; };
    },
  });

  // ---- wiring ----
  shell.onNavigate((_from, to) => {
    if (!been.has(to)) { been.add(to); save(); }
    try { cards(); } catch { /* never break navigation */ }
  });
  let acc = 0;
  shell.onFrame((dt) => {
    acc += dt;
    if (acc < CHECK_MS) return;
    acc = 0;
    try { check(); cards(); } catch (e) { console.error('campaign', e); }
  });
};
