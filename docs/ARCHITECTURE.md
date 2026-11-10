# Architecture

## From seed to pixels

```
serial "No. 3F9A-77"
  -> core/serial.serialToSeed            Seed (two u32)
  -> gen/universe.fromSerial             UniverseSpec (law set from /atlas, palette, glyph, names)
  -> gen/fold.root / childrenOf          FoldAddress -> 7 FoldNodes (stars, flickers)
  -> game/dive                           player falls; stops at a StarRef
  -> gen/system.fromStar                 SystemSpec (1..4 orbits, PlanetSpecs)
  -> game/sky.place                      SkyState per planet (player's only lever)
  -> rules/sky.effects                   SurfaceModifiers (tide, nightLight, impacts, ...)
  -> [Worker] gen/planet.surface         initial 236x200 grid of material ids
  -> [Worker] sim/sand.step              falling sand + reactions, dirty chunks only
  -> [Worker] sim/civ.step               villages, souls, glow -> CivEvents
  -> [Worker] sim/chronicle              events first, reasons later
  -> render/planet                       palette-indexed blit, dirty-row upload
```

Every arrow above the Worker line is a pure function. Player state (Box, Light, Sky inventory, Clock) is the only mutable state and is what `SaveState` stores. A universe is never saved: it is regenerated from its serial.

## Modules

- `src/contracts` - frozen types, interfaces and zod schemas. The only thing units share.
- `src/core` - hash/PRNG, fixed-point, event bus, serials. Built for real; units use it.
- `src/render/gl` - the shared WebGL2 core (`GlCore`) and frame loop.
- `src/ui/tokens.css`, `src/ui/kit` - design tokens and DOM components.
- `src/app` - shell, router, Worker bootstrap, `registry.ts` (wires every unit), `/dev` gallery.
- 28 unit directories (see `docs/UNITS.md`), each exporting `factory`.

## Frame and tick

`createFrameLoop` runs once per animation frame. Each frame:

1. `perf.sample(dt)`.
2. `clock.advance(dt)` returns whole sim ticks (20/s times speed); `perf.tickBudget` may shed some.
3. The universe's `Pulse` steps by those ticks, and `sim.step(ticks)` posts them to the Worker.
4. The current screen's `frame(dt)` reads state and calls its renderer.

Sim runs at a fixed 20 ticks/s in game time regardless of frame rate. Render reads the latest Worker frame and the pulse phase; it never advances game state.

## The Worker boundary

`src/app/sim.worker.ts` owns `SurfaceSim`, `Civ` and `Chronicle` for the open planet. Messages are typed in `src/contracts/worker.ts`:

- main -> worker: `open { universe, planet }`, `step { ticks, year, sky, modifiers, skySays }`, `close`.
- worker -> main: `frame { tick, cells, dirty, civ, chronicle }` with `cells` and `dirty` transferred.

The main thread computes `SurfaceModifiers` from the sky (cheap, pure) and sends them with each step, so the Worker never needs game state. Only one step is in flight at a time; extra ticks wait for the next frame.

## How folds renormalise

A fold is addressed by `{ universe, pathHash, depth }`. Child `i` is `{ universe, mix(pathHash, i), depth + 1 }`. Nothing stores a scale, a zoom or a float position, so fold 10,000 costs the same as fold 1 and never loses precision.

Rendering re-roots at every fold: `DiveView.progress` (0..999) is the zoom into the current fold. When it wraps, `game/dive` moves to the chosen child and the renderer draws the new fold at zoom 0, which looks identical to the old fold at zoom 1000. The camera always lives inside one fold and its 7 children (plus a few levels of nested rings drawn procedurally), so there is no large number anywhere.

## Determinism

- ESLint bans `Math.random`, `Date`, `performance.now` in core, gen, rules and sim.
- `core/hash` uses only 32-bit integer ops; `core/fixed` is Q16.16 integer math with an integer-only sine.
- Golden-value tests in `src/core/core.test.ts` pin the hash. Changing them changes every universe.
- `Math.sqrt` is used only inside `isqrt` with an exact integer correction step.

## Saves and sharing

`SaveState` (versioned, zod) is stored in IndexedDB via `idb-keyval`. The share code is the universe serial; importing one just adds that serial to the Box.
