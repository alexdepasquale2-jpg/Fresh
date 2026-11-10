# Unit 18: src/game/box

**Scope.** 25 slots, selection, stats.

**Contract.** `src/contracts/game.ts`: `BoxFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/game/box/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Exactly 25 slots; add fills the first empty slot and returns its index.
2. add returns -1 when full or when the serial is already in the Box.
3. select clamps to 0..24.
4. recordDepth keeps the maximum; recordTended and recordGlow accumulate.
5. snapshot/restore round-trips and snapshots are copies.
6. count matches the number of filled slots.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
