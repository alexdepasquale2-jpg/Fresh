# Unit 23: src/ui/system-planet

**Scope.** Solar system and Planet screens.

**Contract.** `src/contracts/app.ts`: `ScreenFactory (system, planet)`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/ui/system-planet/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** `system.ts` (orbits, a card per world, cosmic picker, log, orrery scrub), `planet.ts` (surface, chronicle ticker, time bar, six tabs as pages of one scroller so every control keeps a real box), `tools.ts` (god tools and patterns built only from the sim's Tool union), `shared.ts` (selection and a small localStorage memory, key `sallow.screens.v1`, cosmetic only).

**Body page.** Beside the six old controls (`tool-body`, `eyes`, `act-strike|preach|gift|shine|rest`, `ascend`) it shows what the sim reports on `Avatar`: needs (`body-needs`), role, followers and load (`body-tags`), the deeds that apply here as `act-<deed>` buttons inside `body-deeds` (each says what it will do, its cooldown, or why not), standing per village (`body-standing`), this life's log (`body-log`) and the chronicle's lines about the body (`body-told`). Styles in `body.css`.

## Acceptance criteria

1. Solar system shows DIVE chip, system name, universe and fold, the selected planet card with placed pieces and one surface line, WATCH THE SURFACE and the SKY PIECES tray of six tiles with counts.
2. Dragging a tile onto an orbit places it via game/sky; invalid drops snap back with a reason.
3. Planet shows SKY chip, name, age and year, the surface, THEIR SKY strip, souls, villages, glow, THEIR CHRONICLE newest first, pause/1x/3x and CHANGE THEIR SKY.
4. The planet screen has no way to edit the surface directly.
5. Chronicle entries show the event and, once known, the reason.
6. Kit components and tokens only; 44 px targets.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.

## Desktop hooks (read-only)

- **Mouse buttons on the surface.** Only the primary button uses the tool in hand. A right or middle drag always pans (in Eyes it looks), and never counts as a tap. The context menu is suppressed on the surface.
- **`sallowView` on the surface element** (`[data-id=surface]`), a frozen object the layout plugin may read; it changes nothing:
  - `camera()` returns `{ cx, cy, zoom, eyes, gridW, gridH }`: the camera centre in grid cells, the zoom (1 shows the whole world), whether first person is on, and the grid size.
  - `pick(clientX, clientY)` returns `null` outside the surface, in Eyes, or before the first frame; otherwise `{ gx, gy, village }` where `village` is `{ id, name, souls }` for the village under that viewport point, or `null`.
- **Orrery rect, zoom and pan.** While the root has the class `sallow-desktop`, the system screen hands the renderer the rect of `[data-id=orbits]` (less the ORRERY row) and the system is fitted to it. Wheel zooms toward the cursor (0.5x to 8x), a right or middle drag pans, a primary drag that starts on empty space pans while the Pieces mode is on, and `[data-id=orrery-fit]` (shown only when the view is off its fit) puts it back. `orbitAt()` and dropped sky pieces follow the same view. On the phone layout no rect is passed and nothing changes.
