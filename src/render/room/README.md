# Unit 16: src/render/room

**Scope.** Bedroom tiles, kid sprite, Mote following with easing, PC glow.

**Contract.** `src/contracts/render.ts`: `RoomRendererFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/render/room/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Draws a top-down pixel bedroom with floor, bed, desk and PC, using design tokens only.
2. Kid sprite walks toward target at a fixed speed; mote() eases after the kid.
3. PC screen glows with the pulse phase.
4. Pixel art is crisp (integer scale); Mote glow is smooth.
5. No allocation in draw().
6. Recovers after context loss.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
