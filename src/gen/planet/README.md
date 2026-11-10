# Unit 05: src/gen/planet

**Scope.** Continents, seas, biomes and starting village sites on the grid.

**Contract.** `src/contracts/system.ts`: `PlanetGenFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/gen/planet/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. surface() returns GRID_W * GRID_H cells using only ids from universe.materialTable.
2. Pure: golden hash of the grid for 3 fixed planets.
3. seaLevel measurably controls the share of liquid cells (monotonic over 5 values).
4. Land forms at least one continent; no floating single-cell islands of solid in mid-air.
5. Returns 1 to 6 village sites, each on a dry land cell with empty space above.
6. biome changes the material mix in a measurable way.
7. Runs in under 20 ms on a desktop for one planet.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
