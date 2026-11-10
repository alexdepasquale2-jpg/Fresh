# Unit 10: src/sim/civ

**Scope.** Villages found, grow, split and die on the grid; souls; glow output.

**Contract.** `src/contracts/sim.ts`: `CivFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/sim/civ/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Villages found on dry land next to water, never in mid-air or underwater.
2. Villages grow with nearby resources, split when large, and die when flooded or buried.
3. Every change emits exactly one CivEvent with tick and position.
4. glowPerMinute rises with souls and night light; a dead world gives zero.
5. Deterministic: golden test of events and view after 2,000 ticks.
6. Reads the grid only; never writes cells.
7. snapshot/restore round-trips.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
