import { z } from 'zod';
import { SkyStateSchema } from './sky';
import type { Pulse } from './time';
import type { SerialNumber } from './seed';

/* ---------- Input ---------- */
export interface Point { readonly x: number; readonly y: number }
export type InputEvent =
  | { type: 'hold'; at: Point }
  | { type: 'release'; at: Point; heldMs: number }
  | { type: 'tap'; at: Point; target: string | null }
  | { type: 'drag'; phase: 'start' | 'move' | 'end' | 'cancel'; at: Point; payload: string; over: string | null }
  /** Keyboard or gamepad, already mapped to what the player means. Optional to handle: screens that ignore it lose nothing. */
  | { type: 'key'; action: InputAction; phase: 'down' | 'up'; source: 'keyboard' | 'gamepad' };
/** What a key or pad button means. tool1..tool9 are the number keys. */
export type InputAction =
  | 'left' | 'right' | 'up' | 'down' | 'hold' | 'confirm' | 'back' | 'menu' | 'pause' | 'slower' | 'faster'
  | 'tool1' | 'tool2' | 'tool3' | 'tool4' | 'tool5' | 'tool6' | 'tool7' | 'tool8' | 'tool9';
/** One row of the bindings list shown in Settings. */
export interface InputBinding { readonly action: InputAction; readonly does: string; readonly keys: string; readonly pad: string }
/**
 * Pointer gestures. Coordinates are CSS px relative to the attached element.
 * Invariants: a press becomes exactly one of tap / hold..release / drag;
 * drags start only from elements with data-drag="<payload>"; drop targets
 * are elements with data-drop="<id>".
 */
export interface Input {
  attach(el: HTMLElement): void;
  detach(): void;
  on(cb: (e: InputEvent) => void): () => void;
  /** Optional: the keyboard and gamepad bindings this input knows, for a help page. */
  bindings?(): readonly InputBinding[];
}
export type InputFactory = () => Input;

/* ---------- Save ---------- */
export const ScreenIdSchema = z.enum(['bedroom', 'box', 'dive', 'system', 'planet', 'outside', 'battle', 'mirror', 'town']);
export type ScreenId = z.infer<typeof ScreenIdSchema>;
const n = z.number().int().min(0);
const BoxEntrySchema = z.object({
  serialNumber: z.number().int(),
  stats: z.object({
    worldsTended: z.number().int(), deepestFold: z.number().int(), lightFromGlow: z.number().int(),
    souls: z.number().int().optional(), era: z.number().int().optional(), belief: z.string().optional(), enlightenment: z.number().int().optional(), prosperity: z.number().int().optional(), orbiters: z.number().int().optional(),
  }),
});
/**
 * Versioned save. Invariant: version is bumped on any shape change and a
 * migration from every older version exists in src/platform/save. The share
 * code is just the universe serial ("No. 3F9A-77").
 */
export const SaveStateSchema = z.object({
  version: z.literal(1),
  screen: ScreenIdSchema,
  box: z.array(BoxEntrySchema.nullable()).length(25),
  selected: z.number().int().min(0).max(24),
  light: z.object({ pips: z.number().int(), partial: z.number().int() }),
  sky: z.object({ inventory: z.object({ comet: n, moon: n, belt: n, sun: n, rings: n, dust: n }), skies: z.array(SkyStateSchema) }),
  clock: z.object({ tick: z.number().int(), speed: z.union([z.literal(0), z.literal(1), z.literal(3)]) }),
  savedAtMs: z.number(),
  /** Rival ids beaten (see contracts/battle.ts). */
  rivalsBeaten: z.array(z.number().int()).optional(),
});
export type SaveState = z.infer<typeof SaveStateSchema>;
export interface SaveStore {
  load(): Promise<SaveState | null>;
  save(state: SaveState): Promise<void>;
  clear(): Promise<void>;
  /** Accepts any version, returns the current one or null if unreadable. */
  migrate(raw: unknown): SaveState | null;
  exportCode(serialNumber: SerialNumber): string;
  importCode(code: string): SerialNumber | null;
  /** Optional: where saves are going and when the last one landed. */
  status?(): SaveStatus;
  /** Optional: how much room the game's data takes. */
  usage?(): Promise<SaveUsage>;
  /** Optional: everything the game keeps (the main save and every localStorage key starting with "sallow") as one checksummed code. */
  exportAll?(): Promise<string>;
  /** Optional: read a code from exportAll without changing anything. */
  inspect?(code: string): Promise<SaveBundleResult>;
  /**
   * Optional: check a code, keep a backup of what is here now, and stage the code to replace everything at the
   * next boot. The caller reloads the page. On failure nothing has changed.
   */
  stageImport?(code: string): Promise<SaveBundleResult>;
  /** Optional: keep a backup, then stage a wipe for the next boot. `keep` lists localStorage keys to leave alone. */
  stageReset?(keep?: readonly string[]): Promise<boolean>;
  /** Optional: what the one automatic backup holds, or null when there is none. */
  backup?(): SaveBundleInfo | null;
  /** Optional: stage the backup to come back at the next boot (what is here now becomes the backup). */
  stageRestore?(): Promise<SaveBundleResult>;
}
export interface SaveStatus {
  readonly backend: 'indexeddb' | 'localstorage' | 'memory';
  readonly lastSavedAtMs: number | null;
  /** Plain words for the last thing that went wrong, or null. */
  readonly lastError: string | null;
}
export interface SaveUsage {
  /** Bytes of the main save and of the "sallow" localStorage keys. */
  readonly saveBytes: number;
  readonly localBytes: number;
  /** From the browser's storage estimate, when it gives one. */
  readonly usedBytes: number | null;
  readonly quotaBytes: number | null;
}
export interface SaveBundleInfo {
  readonly version: number;
  readonly exportedAtMs: number;
  readonly savedAtMs: number | null;
  readonly universes: number;
  readonly lightPips: number | null;
  /** How many localStorage keys ride along (journal, codex, names, ...). */
  readonly keys: number;
  readonly bytes: number;
}
export type SaveBundleResult = { readonly ok: true; readonly info: SaveBundleInfo } | { readonly ok: false; readonly error: string };
export type SaveStoreFactory = () => SaveStore;

/* ---------- Audio ---------- */
/** WebAudio synth, no audio files. Silent until unlock() from a user gesture. */
export interface Audio {
  unlock(): Promise<void>;
  setPulse(pulse: Pulse | null): void;
  setScene(screen: ScreenId): void;
  /** Called every frame; schedules notes against the pulse. */
  update(dtMs: number): void;
  setMuted(muted: boolean): void;
  /** One-shot sound effect by name (tool names, 'tap', 'fold', 'catch', 'strike', 'merge', ...). amount 0..1 scales it. Unknown names play a soft tick. */
  sfx(name: string, amount?: number): void;
  dispose(): void;
  /**
   * Optional: what the game is doing right now, so the score and ambience can follow it.
   * Every field is optional; a field left out goes back to its neutral value.
   */
  setMood?(mood: AudioMood): void;
  /** Optional: bus volumes, each 0..1. A field left out keeps its level. */
  setMix?(mix: AudioMix): void;
  /** Optional: level after the limiter over the last few ms (0..1). The same object is returned every call. */
  meter?(): { readonly peak: number; readonly rms: number };
  /** Optional: every sfx name this synth knows (see src/platform/audio/README.md). */
  sfxNames?(): readonly string[];
}
export type AudioFactory = () => Audio;
/** Context for the adaptive score. All optional; ratios are 0..1. */
export interface AudioMood {
  /** Universe identity as a u32 (seedToU32 of its seed): picks mode, root, progression and motif. */
  readonly seed?: number;
  /** Dive: folds fallen. */
  readonly depth?: number;
  /** Dive: 1 while falling, 0 hovering or stopped. */
  readonly speed?: number;
  /** Planet: time of day 0..999 (0 midnight, 500 noon). */
  readonly day?: number;
  readonly wind?: number;
  readonly rain?: number;
  /** Planet: share of the surface that is liquid. */
  readonly sea?: number;
  /** Planet: how much is burning. */
  readonly fire?: number;
  /** Planet: how frozen it is. */
  readonly cold?: number;
  /** Planet: tech era 0..5. */
  readonly era?: number;
  readonly prosperity?: number;
  readonly souls?: number;
  /** Planet: the player is in a body (first person layer). */
  readonly body?: boolean;
  /** Battle or body: how close the player is to falling. */
  readonly danger?: number;
  /** Battle: how far the fight has gone. */
  readonly intensity?: number;
  readonly boss?: boolean;
  /** Mote's light, 1 full, 0 out. */
  readonly light?: number;
  /** Town: the district the player stands in (its name). Colours the street's theme. In the town `day` is the clock. */
  readonly place?: string;
}
export interface AudioMix {
  readonly master?: number;
  readonly music?: number;
  readonly effects?: number;
  readonly ambience?: number;
}

/* ---------- Edge voice ---------- */
export type VoiceKind = 'universe' | 'system' | 'planet' | 'village' | 'chronicle' | 'narration';
/**
 * Optional re-voicing of grammar text. Off by default. Output is validated
 * (length, charset) and cached by seed; on any failure returns grammarText.
 * revoiceSync never awaits: cached text or grammarText.
 */
export interface EdgeVoice {
  enabled(): boolean;
  setEnabled(on: boolean): void;
  revoice(kind: VoiceKind, seedHex: string, grammarText: string): Promise<string>;
  revoiceSync(kind: VoiceKind, seedHex: string, grammarText: string): string;
}
export type EdgeVoiceFactory = (deps: { endpoint: string | null }) => EdgeVoice;

/* ---------- Perf ---------- */
export type Quality = 0 | 1 | 2;
/** Frame-time monitor. Quality 2 is full; drops with sustained slow frames. */
export interface Perf {
  sample(frameMs: number): void;
  quality(): Quality;
  /** 0.5..1, multiply render resolution. */
  resolutionScale(): number;
  /** Max sim ticks to run this frame (tick shedding). */
  tickBudget(wanted: number): number;
  averageFrameMs(): number;
  onChange(cb: (q: Quality) => void): () => void;
}
export type PerfFactory = () => Perf;
