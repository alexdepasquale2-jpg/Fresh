# Unit 25: src/platform/audio

**Scope.** WebAudio synth voices locked to the Pulse; no audio files; unlock on first gesture.

**Contract.** `src/contracts/platform.ts`: `AudioFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/platform/audio/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Silent until unlock() is called from a gesture; never throws without AudioContext.
2. Notes are scheduled on pulse phase crossings so sound and visuals share one beat.
3. Each screen has a distinct synth scene; setScene crossfades.
4. No audio files are loaded; all voices are oscillators and noise.
5. setMuted silences within 50 ms; dispose closes the context.
6. update() allocates nothing per frame.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
