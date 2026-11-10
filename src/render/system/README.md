# Unit 14: src/render/system

**Scope.** Star, orbits, planets, placed pieces, drag ghost, drop highlight.

**Contract.** `src/contracts/render.ts`: `SystemRendererFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/render/system/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Draws the star at centre, up to 4 smooth orbits and a planet per orbit moving by periodTicks.
2. Placed sky pieces are drawn on their planet orbit with a distinct shape per kind.
3. While dragging, a ghost follows the pointer and the orbit under it is highlighted in glow.
4. orbitAt(x, y) returns the orbit within a 22 px band (44 px target) or -1.
5. Selected orbit uses the glow token; everything else uses design tokens only.
6. No allocation in draw(); recovers after context loss.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
