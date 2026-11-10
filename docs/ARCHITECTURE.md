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

## Simulation layers (Worker)

1. **Surface (`sim/sand`).** Falling sand in active 32x32 chunks, plus a climate:
   - **Temperature.** A coarse field (4x4 cells) driven by day/night (`DAY_TICKS`), seasons (`YEAR_TICKS`), sky warmth and dimming, and fire heat. It diffuses and relaxes to ambient.
   - **Phase changes.** Water freezes from the top down and boils. Ice and snow melt. Moss burns, dies of frost, and creeps onto wet sand by daylight.
   - **Water cycle.** Evaporation feeds humidity per column. Clouds spread and drift on the wind using exact-flux transfers (moisture is conserved and the sky wraps around). Rain or snow falls when it is cold. Storms bring lightning.
   - **Sky effects.** Tides push the seas. Impacts dig craters with molten rims and scatter debris, water and ore.
   - **Wind and erosion.** Wind lifts loose powder. Running water carries sand.
   - **Engine materials.** Ice, snow, ore, fire and ash use reserved ids 250..254 (`ENGINE` in `contracts/sim.ts`).
   - **Surface events.** impact, storm, lightning, freeze, thaw, fire, flood, drought, bloom, blight and ore are drained each step.
2. **Civilisation (`sim/civ`).**
   - **Villages.** Each has souls, food, mood, a belief shaped by the sky and surface events (sun, moon, sea, stone, fire, sky), and a tech era (huts, fire, iron, lamps, bells, star-reaching).
   - **Limits on growth.** Growth is capped by carrying capacity: moss, water and ice to fish through, tides and tech.
   - **People.** Up to 240 walk the surface as farmers, fishers, priests at dusk, lamp-bearers at night, and travellers between villages.
   - **What happens to them.** Famine, frost, fire, flooding with retreat to high ground, feuds between faiths, festivals, migration, splits, resettlement of empty worlds, and launches at star-reaching.
3. **Chronicle (`sim/chronicle`).** Events are written first. The reasons come afterwards: the chronicle finds the surface event that best fits each hardship within about two years, and tells it in the voice of the village's faith. Repeats are merged.

The Worker sends the grid, the environment (temperature field, humidity, wind, rain, snow, lightning, time of day, season), the civ view (villages and people) and the chronicle each step.

## Planet rendering

`render/planet` is one fragment shader:
- **Sky:** day/night gradient, dusk, stars, suns and moons on arcs, rings, belt glints, a comet with a tail, fbm clouds from humidity pushed by the wind, dust haze and lightning flashes.
- **Materials:** grain, rock strata, water depth and shimmer, seasonal moss, emissive fire, ice sparkle, heat glow and frost from the temperature field, dark caves.
- **Overlay:** written by the CPU each frame. Houses with windows lit at night, chimney smoke, bonfires, bell towers, launches, people (lamps, priests) and rain or snow.
- **Village halos:** village light breathes on the universe pulse.
