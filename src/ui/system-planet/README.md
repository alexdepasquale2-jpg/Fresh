# Unit 23: src/ui/system-planet

**Scope.** Solar system and Planet screens.

**Contract.** `src/contracts/app.ts`: `ScreenFactory (system, planet)`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/ui/system-planet/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Solar system shows DIVE chip, system name, universe and fold, the selected planet card with placed pieces and one surface line, WATCH THE SURFACE and the SKY PIECES tray of six tiles with counts.
2. Dragging a tile onto an orbit places it via game/sky; invalid drops snap back with a reason.
3. Planet shows SKY chip, name, age and year, the surface, THEIR SKY strip, souls, villages, glow, THEIR CHRONICLE newest first, pause/1x/3x and CHANGE THEIR SKY.
4. The planet screen has no way to edit the surface directly.
5. Chronicle entries show the event and, once known, the reason.
6. Kit components and tokens only; 44 px targets.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
