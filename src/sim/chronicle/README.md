# Unit 11: src/sim/chronicle

**Scope.** Event-first log, reasons back-filled from sky state and earlier events, grammar text.

**Contract.** `src/contracts/sim.ts`: `ChronicleFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/sim/chronicle/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. record() turns each CivEvent into one entry with year and grammar text naming the village.
2. explain() fills reason only on entries that have none; reasons never change once set.
3. Reasons cite the sky (from skySays and modifiers) or an earlier event, never random text.
4. entries() is newest first and respects limit.
5. Deterministic text for a fixed event list (golden test).
6. Lines are under 90 characters in the IM Fell voice: no modern words (blocklist test).

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
