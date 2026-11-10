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

## Law-set primitives (wave 2)

All optional in `src/contracts/atlas.ts`. A law set that uses none of them simulates bit-for-bit as before: a gated reaction draws no extra random numbers until every gate has passed, and the material flags are only read for materials that set them.

Reaction gates: `temp {min,max}` (coarse temperature under the cell), `light` (`day` sun above 25% after dimming, `night` sun down, `dark` sun below 8% and nightLight under 20, `lit` otherwise), `depth {min,max}` (percent of grid height from the top), `dir` (`up`, `down`, `side`: where b sits), `wind {min,max}` (absolute wind), `humid {min,max}` (cloud over the column). Reaction effects: `heat` (added to the temperature field) and `vapour` (added to the cloud above).

Material behaviours: `rises` (a powder or liquid with inverted gravity), `flows: night|day` (a powder that moves as a liquid in that half of the day), `drift` (carried sideways by wind), `viscosity` (a liquid that spreads one tick in n).

No new state: snapshots are unchanged. Nothing is scanned outside active chunks.

A reaction whose `becomesB` is `"*"` leaves the neighbour as it is. Use it with `b: "*"`: a plain `becomesB: "empty"` there would erase whatever the cell happened to touch.
