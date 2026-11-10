# Unit 09: src/sim/sand

**Scope.** Chunked falling-sand kernel in the Worker, driven by the material and reaction tables, stepping dirty chunks only.

**Contract.** `src/contracts/sim.ts`: `SurfaceSimFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/sim/sand/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Powders fall and pile, liquids flow and level, gases rise, solids stay, by density.
2. Reactions from the reaction table fire at their integer chance and honour needs on modifiers.
3. Only dirty chunks are stepped; a settled grid marks no chunks dirty after one tick.
4. Deterministic: two sims with the same inputs give identical grids after 2,000 ticks (golden hash).
5. snapshot/restore round-trips byte-identically, including tick and RNG state.
6. One tick on a busy 236x200 grid takes under 2 ms on desktop (state the 4x-throttle number in the PR).
7. No allocation inside step().

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
