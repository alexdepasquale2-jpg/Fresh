# Unit 20: src/game/sky

**Scope.** Piece inventory, placement validation, SkyState updates.

**Contract.** `src/contracts/sky.ts`: `SkyGameFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/game/sky/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. place decrements the inventory and appends to the planet sky.
2. place fails with none-left, sky-full (4 pieces) or bad-orbit.
3. remove returns the piece to the inventory.
4. skyOf returns an empty sky for unknown planets.
5. grant adds pieces (source decided in Prompt 2; see docs/DESIGN.md open decisions).
6. snapshot/restore round-trips.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
