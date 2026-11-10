# Unit 21: src/ui/room-box

**Scope.** Bedroom and Box screens.

**Contract.** `src/contracts/app.ts`: `ScreenFactory (bedroom, box)`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/ui/room-box/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Bedroom shows LIGHT pips top left, BOX nn/25 top right, one narration line, OPEN THE BOX and hints, at 390x844.
2. Tapping the floor walks the kid there and Mote follows (via render/room).
3. The Box shows a ROOM back chip, title, count, the Mote card, and a 5x5 slot grid with a glyph per universe.
4. Selecting a slot shows name, serial, law tags and three stats; ENTER starts a dive, WORLDS n lists worlds tended.
5. Uses src/ui/kit components and tokens only; all targets at least 44 px.
6. Playwright screenshot at 390x844 matches docs/DESIGN.md layout (checked by review of the demo).

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
