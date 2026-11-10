// STUB: replace with the real WebAudio synth (unit 25). See README.md.
import type { AudioFactory } from '@/contracts/platform';

export const factory: AudioFactory = () => {
  let ctx: AudioContext | null = null;
  return {
    unlock: async () => {
      if (!ctx && typeof AudioContext !== 'undefined') ctx = new AudioContext();
      await ctx?.resume().catch(() => undefined);
    },
    setPulse: () => {},
    setScene: () => {},
    update: () => {},
    setMuted: () => {},
    dispose: () => void ctx?.close().catch(() => undefined),
  };
};
