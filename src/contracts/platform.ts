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
  | { type: 'drag'; phase: 'start' | 'move' | 'end' | 'cancel'; at: Point; payload: string; over: string | null };
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
}
export type InputFactory = () => Input;

/* ---------- Save ---------- */
export const ScreenIdSchema = z.enum(['bedroom', 'box', 'dive', 'system', 'planet', 'outside', 'battle', 'mirror']);
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
}
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
}
export type AudioFactory = () => Audio;

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
