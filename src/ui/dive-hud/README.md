# Unit 22: src/ui/dive-hud

**Scope.** Dive HUD.

**Contract.** `src/contracts/app.ts`: `ScreenFactory (dive)`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/ui/dive-hud/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Shows SURFACE chip, LIGHT pips, FOLD counter with depth bar and best marker, narration line, RELIQUARIES (3) and a large round HOLD.
2. Press and hold HOLD to fall, release to hover; release near a star stops and opens the Solar system.
3. Tapping a flicker throws a reliquary and shows the capture result.
4. SURFACE returns to the Box.
5. Updates every frame without allocating new DOM nodes.
6. Uses kit components and tokens only; 44 px targets.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
