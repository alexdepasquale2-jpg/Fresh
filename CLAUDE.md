# SALLOW

Portrait mobile game, TypeScript + WebGL2 PWA. A kid's PC holds a Box of 25 pocket universes. Lit by a companion light called Mote, the player opens a universe, dives through its fractal folds, stops at stars, drags sky pieces onto orbits, and watches the planets below react. The player never edits a surface directly; they only change its sky.

Read `docs/ARCHITECTURE.md`, `docs/DESIGN.md` and `docs/UNITS.md` before writing code.

## Non-negotiables

1. **Determinism.** Everything a universe IS comes from pure functions of (seed, path). No `Math.random`, `Date.now`, `new Date` or `performance.now` in `src/core`, `src/gen`, `src/rules`, `src/sim` (ESLint enforces it). Use `src/core/hash` for randomness and `src/core/fixed` or integers for math.
2. **No runtime AI in the core loop.** Emergence comes from the curated rule atlas in `/atlas` (JSON, zod-validated). The optional edge adapter (`src/platform/edge-voice`) may only re-voice text; its output is validated, cached by seed, and falls back to the grammar.
3. **Tailoring changes only which seeded candidates surface,** never what a universe is. The same serial gives the same universe on every device.
4. **Target:** mid-range Android Chrome. 60 fps render, sim in a Worker at a fixed 20 ticks/s, under 350 KB gzipped JS, playable offline.
5. **No new dependencies.** Everything needed is already in `package.json`.

## Rules for every unit agent

- Edit only your unit directory (see `docs/UNITS.md`).
- Never edit `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json` or the lockfile.
- Build and test against the stubs of other units, never against another unit's branch. Never import another unit; take what you need through your factory's `deps`.
- If a contract blocks you, write `CONTRACT_REQUEST.md` in your directory with the exact change and why, implement the closest thing the current contract allows, and say so in your PR.
- Replace every `it.todo` in your `index.test.ts` with a real passing test. Include a golden-value determinism test where the unit is in gen, rules or sim.
- Keep or replace `demo.ts` so your unit runs alone in `/dev` with a fixed seed.
- UI and render: tokens from `src/ui/tokens.css` only, components from `src/ui/kit`, 390x844 portrait, 44 px touch targets.
- Render units allocate nothing per frame in `draw()`. Sim units step dirty chunks only.
- `npm run check` must pass before you push.

## Commands

- `npm ci` - install (always first in a fresh worktree)
- `npm run dev` - app at `/`, demo gallery at `/dev`
- `npm run check` - typecheck + lint + test
- `npm run build` / `npm run e2e`
- `npm run atlas -- validate` - validate law sets
