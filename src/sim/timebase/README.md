# Unit 12: src/sim/timebase

**Scope.** Clock and the Kuramoto Pulse.

**Contract.** `src/contracts/time.ts`: `TimebaseFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/sim/timebase/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Clock.advance returns whole ticks at 20/s times speed, carrying the remainder; pause returns 0.
2. catchUp is capped at maxCatchUpTicks.
3. year() and ageName() follow the tick count.
4. Pulse.phase is in [0, FX_ONE) and advances at milliHz using integer math only.
5. Two pulses with different frequencies and coupling K converge in phase (Kuramoto) within a stated number of ticks; with K = 0 they do not.
6. Deterministic golden phases after 10,000 ticks.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
