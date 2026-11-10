// God tools: the sim's own primitives, and patterns made by combining them. No tool id is invented here:
// every call that reaches the sim is a member of the Tool union.
import type { Tool } from '@/contracts/sim';
import { GRID_W, GRID_H } from '@/contracts/sim';

export type Pattern = 'river' | 'firering' | 'rainfront' | 'meteors' | 'circle' | 'coldwall' | 'oasis' | 'tempest' | 'rampart';
export type Mode = Tool | 'watch' | 'body' | Pattern;
export type Group = 'souls' | 'earth' | 'weather' | 'wrath' | 'patterns';
export interface ToolDef {
  readonly mode: Mode;
  readonly label: string;
  readonly group: Group | null;
  /** Base radius in grid cells, before the brush size. 0 for tools that have none. */
  readonly r: number;
  readonly paint: boolean;
  readonly hint: string;
  /** What it costs or risks, said plainly. */
  readonly risk: string;
  /** Past tense, for the "what just happened" line. */
  readonly did: string;
  readonly sfx: string;
  readonly big?: boolean;
}

export const GROUPS: readonly { id: Group; label: string }[] = [
  { id: 'souls', label: 'Souls' }, { id: 'earth', label: 'Earth' }, { id: 'weather', label: 'Weather' },
  { id: 'wrath', label: 'Wrath' }, { id: 'patterns', label: 'Patterns' },
];

const FREE = 'Costs nothing. They see it as an omen.';
export const TOOLS: readonly ToolDef[] = [
  { mode: 'watch', label: 'Hands off', group: null, r: 0, paint: false, hint: 'Only watch. Drag to look around, pinch or double-tap to lean in.', risk: 'Nothing is touched.', did: '', sfx: 'tap' },
  { mode: 'body', label: 'Take a body', group: null, r: 0, paint: false, hint: 'Tap the ground to take a body there. Tap again to walk. Eyes looks through it.', risk: 'Unless they are enlightened, they will try to kill you.', did: '', sfx: 'body' },
  { mode: 'bless', label: 'Bless', group: 'souls', r: 0, paint: false, hint: 'Fill their stores, ease their hearts, bring them closer to understanding.', risk: 'Costs nothing. They grow used to gifts.', did: 'A warmth was laid', sfx: 'bless' },
  { mode: 'whisper', label: 'Whisper', group: 'souls', r: 0, paint: false, hint: 'Speak to the nearest village. They will look up.', risk: 'Costs nothing. They will wonder who spoke.', did: 'A whisper went down', sfx: 'whisper' },
  { mode: 'sow', label: 'Sow', group: 'souls', r: 0, paint: false, hint: 'Set a new people down.', risk: 'New mouths on the same land.', did: 'A people was set down', sfx: 'sow' },
  { mode: 'merge', label: 'Merge', group: 'souls', r: 0, paint: false, hint: 'Tap between two villages. They become one people, with a new faith if theirs differed.', risk: 'Two names end. It cannot be undone.', did: 'Two peoples were pressed together', sfx: 'merge', big: true },
  { mode: 'water', label: 'Water', group: 'earth', r: 4, paint: true, hint: 'Pour water.', risk: 'Floods what lies low.', did: 'Water was poured', sfx: 'water' },
  { mode: 'sand', label: 'Sand', group: 'earth', r: 4, paint: true, hint: 'Pour sand.', risk: 'Buries what is under it.', did: 'Sand fell', sfx: 'sand' },
  { mode: 'stone', label: 'Stone', group: 'earth', r: 3, paint: true, hint: 'Raise stone.', risk: 'Walls them in, or out.', did: 'Stone rose', sfx: 'stone' },
  { mode: 'seed', label: 'Seed', group: 'earth', r: 5, paint: true, hint: 'Make green grow.', risk: FREE, did: 'Green was sown', sfx: 'seed' },
  { mode: 'erase', label: 'Erase', group: 'earth', r: 4, paint: true, hint: 'Take part of the world away.', risk: 'Whatever stood there is gone.', did: 'A piece of the world was taken', sfx: 'erase' },
  { mode: 'rain', label: 'Rain', group: 'weather', r: 16, paint: false, hint: 'Gather clouds.', risk: 'Too much and the low ground drowns.', did: 'Clouds gathered', sfx: 'rain' },
  { mode: 'heat', label: 'Heat', group: 'weather', r: 10, paint: true, hint: 'Warm the air.', risk: 'Dries seas, feeds fire.', did: 'The air was warmed', sfx: 'heat' },
  { mode: 'cold', label: 'Cold', group: 'weather', r: 10, paint: true, hint: 'Chill the air.', risk: 'Frost on the fields.', did: 'The air was chilled', sfx: 'cold' },
  { mode: 'freeze', label: 'Freeze', group: 'weather', r: 6, paint: true, hint: 'Freeze water, put out fire.', risk: 'Boats and fish are locked in.', did: 'Ice was laid', sfx: 'freeze' },
  { mode: 'fire', label: 'Fire', group: 'wrath', r: 3, paint: true, hint: 'Set fire.', risk: 'It spreads. Villages burn.', did: 'Fire was set', sfx: 'fire' },
  { mode: 'lightning', label: 'Bolt', group: 'wrath', r: 1, paint: false, hint: 'Call lightning.', risk: 'Kills where it lands, and may start a fire.', did: 'A bolt came down', sfx: 'lightning', big: true },
  { mode: 'meteor', label: 'Meteor', group: 'wrath', r: 8, paint: false, hint: 'Throw down a star.', risk: 'A crater. Anyone under it dies.', did: 'A star was thrown down', sfx: 'meteor', big: true },
  { mode: 'quake', label: 'Quake', group: 'wrath', r: 8, paint: false, hint: 'Split the ground.', risk: 'Houses fall. The land does not heal.', did: 'The ground was split', sfx: 'quake', big: true },
  { mode: 'smite', label: 'Smite', group: 'wrath', r: 0, paint: false, hint: 'Death from nowhere.', risk: 'Souls die. Everyone will fear you.', did: 'Death was sent', sfx: 'smite', big: true },
  { mode: 'river', label: 'River', group: 'patterns', r: 2, paint: true, hint: 'Drag a line. The ground opens under your finger and water runs in it.', risk: 'It cuts through whatever is in the way.', did: 'A river was carved', sfx: 'water' },
  { mode: 'firering', label: 'Fire ring', group: 'patterns', r: 12, paint: false, hint: 'A ring of fire around the place you touch. The middle is spared, for a while.', risk: 'It closes inward.', did: 'A ring of fire was lit', sfx: 'fire', big: true },
  { mode: 'rainfront', label: 'Rain front', group: 'patterns', r: 14, paint: false, hint: 'Rain that starts here and sweeps downwind across the world.', risk: 'Everything downwind gets wet.', did: 'A rain front set out', sfx: 'wind' },
  { mode: 'meteors', label: 'Starfall', group: 'patterns', r: 4, paint: false, hint: 'Six small stones, one after another, scattered around the place you touch.', risk: 'You cannot aim each one.', did: 'Stones began to fall', sfx: 'shower', big: true },
  { mode: 'circle', label: 'Blessing', group: 'patterns', r: 10, paint: false, hint: 'A blessing with a ring of green around it.', risk: 'Costs nothing. They will build a shrine to it.', did: 'A circle of green was blessed', sfx: 'bless' },
  { mode: 'coldwall', label: 'Cold wall', group: 'patterns', r: 4, paint: false, hint: 'A standing wall of cold from the sky to the ground. Fire stops at it. So do boats.', risk: 'Whoever lives beside it freezes.', did: 'A wall of cold came down', sfx: 'chill' },
  { mode: 'oasis', label: 'Oasis', group: 'patterns', r: 4, paint: false, hint: 'A bowl of water with green on both banks.', risk: 'Digs a hole where you touch.', did: 'An oasis was dug', sfx: 'seed' },
  { mode: 'tempest', label: 'Tempest', group: 'patterns', r: 20, paint: false, hint: 'Heavy cloud, then three bolts.', risk: 'The bolts fall where they like.', did: 'A tempest was called', sfx: 'thunder', big: true },
  { mode: 'rampart', label: 'Rampart', group: 'patterns', r: 2, paint: true, hint: 'Drag to raise a thick wall of stone with a wide foot.', risk: 'It parts whoever lives on either side.', did: 'A rampart was raised', sfx: 'stone' },
];

export const BRUSH: readonly { label: string; mult: number }[] = [{ label: 'S', mult: 0.5 }, { label: 'M', mult: 1 }, { label: 'L', mult: 2 }];

export interface ToolEnv {
  /** Send one primitive to the sim. */
  readonly tool: (t: Tool, x: number, y: number, r: number) => void;
  /** Run something after ms of screen time. */
  readonly later: (ms: number, fn: () => void) => void;
  /** Row of the first solid cell in a column. */
  readonly ground: (x: number) => number;
  /** -100..100, positive blows right. */
  readonly wind: number;
}

const cx = (x: number) => Math.max(1, Math.min(GRID_W - 2, Math.round(x)));
const cy = (y: number) => Math.max(1, Math.min(GRID_H - 2, Math.round(y)));
// Fixed scatter so a pattern looks the same every time it is used.
const SCATTER = [-17, 9, -4, 21, -26, 13];

/** Apply a tool or pattern at grid (gx, gy) with brush multiplier m. */
export const applyTool = (def: ToolDef, gx: number, gy: number, m: number, env: ToolEnv): void => {
  const r = def.r ? Math.max(1, Math.round(def.r * m)) : 0;
  const t = env.tool;
  switch (def.mode) {
    case 'watch': case 'body': return;
    case 'river':
      t('erase', cx(gx), cy(gy), r + 1);
      t('water', cx(gx), cy(gy + 1), r);
      return;
    case 'rampart':
      t('stone', cx(gx), cy(gy), r);
      t('stone', cx(gx), cy(gy + r * 2), r + 1);
      return;
    case 'firering':
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        t('fire', cx(gx + Math.cos(a) * r), cy(gy + Math.sin(a) * r * 0.6), 2);
      }
      return;
    case 'rainfront': {
      const dir = env.wind < 0 ? -1 : 1;
      for (let i = 0; i < 8; i++) env.later(i * 260, () => t('rain', cx(gx + dir * i * r * 1.3), cy(gy), r));
      return;
    }
    case 'meteors':
      SCATTER.forEach((dx, i) => env.later(i * 320, () => { const x = cx(gx + dx * m); t('meteor', x, cy(env.ground(x)), r); }));
      return;
    case 'circle':
      t('bless', cx(gx), cy(gy), 0);
      for (let k = 0; k < 8; k++) {
        const x = cx(gx + Math.cos((k / 8) * Math.PI * 2) * r);
        t('seed', x, cy(env.ground(x) - 1), 3);
      }
      return;
    case 'coldwall': {
      const g = env.ground(cx(gx));
      for (let y = Math.max(4, g - 64); y <= g; y += 8) { t('cold', cx(gx), cy(y), r * 2); t('freeze', cx(gx), cy(y), r); }
      return;
    }
    case 'oasis': {
      const g = env.ground(cx(gx));
      t('erase', cx(gx), cy(g + 1), r);
      t('water', cx(gx), cy(g + 1), Math.max(1, r - 1));
      for (const s of [-1, 1]) { const x = cx(gx + s * (r + 4)); t('seed', x, cy(env.ground(x) - 1), 3); }
      return;
    }
    case 'tempest':
      t('rain', cx(gx), cy(gy), r);
      [-12, 9, 3].forEach((dx, i) => env.later(400 + i * 420, () => { const x = cx(gx + dx * m); t('lightning', x, cy(env.ground(x) - 1), 1); }));
      return;
    default:
      t(def.mode, gx, gy, r);
  }
};
