# Unit 15: src/render/planet

**Scope.** Palette-indexed surface from the sim grid, bonfires, dirty-chunk texture upload.

**Contract.** `src/contracts/render.ts`: `PlanetRendererFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/render/planet/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Draws the grid crisp at an integer scale via GlCore.blit with the universe palette.
2. Uploads only dirty chunk rows, not the whole texture, when few chunks are dirty.
3. Draws a bonfire at each village whose flicker follows the pulse; bonfires use the glow token.
4. No allocation in draw().
5. Recovers after context loss by re-uploading the full grid.
6. Holds 60 fps at 390x844 with all chunks dirty on a 4x-throttled profile (state numbers).

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
