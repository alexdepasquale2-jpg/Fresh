# Unit 19: src/game/dive

**Scope.** Hold, hover and stop state machine; fold counter and best; reliquary throws; capture into the Box.

**Contract.** `src/contracts/game.ts`: `DiveFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/game/dive/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. hold moves to falling, release to hovering, release with a star in the children to stopped.
2. update advances progress while falling and moves one fold per 1,000 progress; best tracks the max depth.
3. Falling drains Light via light.drainFolds; at zero the dive surfaces.
4. throwAt on a flicker uses one reliquary and adds its serial to the Box; on an empty child it returns no-flicker.
5. Throws fail with no-reliquary after 3, box-full when the Box is full, duplicate when already owned.
6. Narration line changes with phase and depth, from a fixed table.
7. Deterministic for a fixed input script (golden test).

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.

Resume: `start(u, best)` on a dive that is stopped at a star in the same universe (not the floor) goes on from that fold: depth, reliquaries and milestones kept; streak, haul and the summary begin again. Call `surface()` first for a fall from the top (the dive HUD does this unless `ctx.selection.star` is the star the dive stopped at).
