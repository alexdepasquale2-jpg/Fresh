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

## Snapshots (format 2)

`snapshot()` carries everything a step reads, so a world restored into a fresh sim goes on cell for cell as one that never stopped: tick, rng word, wind, rain, lightning age, the last tally, the modifiers last stepped with, surface events not yet drained, the chunks awake next tick, cells, temperature, humidity, heat not yet folded in (sparse), and each cell's move stamp as an age (run-length coded over non-empty cells). It starts with a magic word. `restore()` never throws: a format 1 snapshot (tick, rng, cells, climate fields) still wakes whole and goes on plausibly, and anything unreadable is left alone (the caller compares `tick()`).

## Water finds its level

Every falling liquid (water, oil, magma, a powder in its flowing half of the day) moves like a liquid, not a slow powder:

- It falls; failing that it slips diagonally either way; failing that it looks up to 6 cells sideways each way (2 for a liquid with `viscosity`) for an edge to pour over and goes there.
- With nowhere to fall, the loose top layer gathers to one side of its row (even rows left, odd rows right, so loose cells and the gaps in the row below meet). Then nothing moves, nothing wakes, and the lake's chunks sleep. Under a tide the loose layer follows the tide instead, back and forth: a change of level along the shore, not a standing slope.
- Joined vessels: a resting surface cell with air above reads through its own body of liquid (at most 3,000 cells) for a cell two or more rows higher, and that cell comes to lie on top of it. The gap it leaves rises through the high side as a bubble. A column that finds nothing lets 40 chances pass before it looks again (`calm`, one byte per column, kept in the snapshot after the stamps).
- A face of water open to the side is not "deep": only cells with liquid above and below and something on both sides are skipped 15 ticks in 16.
- Only water lying on something evaporates. A falling drop is rain and reaches the ground.

This changed how every world runs: grids are not cell-for-cell what they were before it, in any law set.
