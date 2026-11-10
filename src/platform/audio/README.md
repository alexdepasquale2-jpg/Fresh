# Unit 25: src/platform/audio

**Scope.** The whole sound of SALLOW, synthesised with WebAudio: an adaptive score per screen, ambience beds, and a named sound effect vocabulary. No audio files, no dependencies. Silent until `unlock()` from a gesture.

**Contract.** `src/contracts/platform.ts`: `AudioFactory`, exported as `factory` from `index.ts`. Optional additions used by `src/app/plugins/sound.ts`: `setMood`, `setMix`, `meter`, `sfxNames`.

**Files.** `engine.ts` is the synth (graph, voices, score, beds, effects) on any `BaseAudioContext` with explicit start times. `index.ts` owns the live context (autoplay, mute, page visibility) and `renderScene()`, an offline render that reports peak and RMS.

## How it works

- **Clock.** One pulse cycle is 8 steps. `update()` plays a step when the pulse phase crosses into it, so sound and picture share a beat.
- **Identity.** `setMood({ seed })` (a u32 from the universe seed) picks one of nine modes, a root, a chord progression and an 8-note motif. Every scene plays that same motif its own way, so a universe sounds like itself everywhere. With no mood, the pulse rate picks instead.
- **Scenes.** bedroom (warm, sparse keys), box (music-box bells), dive (kick, arp and a leaning wrong note that grow with `depth` and `speed`), system (wide, slow, panned bells), planet (instrument by `era`, density by `prosperity`, quiet sines at night from `day`, softer and wetter in `rain`, almost nothing with no `souls`; in a `body` a heartbeat and the tune an octave down), outside (low, uneasy), battle (drums and square lead driven by `intensity`, an alarm at high `danger`, tritone stabs for `boss`), mirror (the bedroom theme with every interval inverted and the bar read backwards).
- **Transitions.** `setScene` waits for the next half cycle, then crossfades two music slots while both scenes play for six steps; the pad glides to the new chord.
- **Ambience** (planet): wind by `wind`, rain by `rain`, surf by `sea`, insects at night when dry and not frozen, fire bed and crackle by `fire`. Outside has a little wind and insects; the dive has rushing air while falling.
- **Loudness.** Every gain is ramped. Buses (music, effects, ambience) feed a master gain, a compressor, then a soft clipper whose ceiling is about 0.89, so output cannot reach full scale.
- **Cost.** At most 40 one-shot voices (music 26, ambience 30); a voice that finds no free slot is dropped. Pad and beds are fixed nodes that are only ramped. The context is suspended when the page is hidden and shortly after mute.

## Sound effects

`ctx.audio.sfx(name, amount?)`. `amount` is 0..1 and only matters where noted. Unknown names play a soft tap and never throw. The same name retriggers at most every 70 ms.

| Group | Names |
| --- | --- |
| Interface | `tap` (amount: weight), `confirm`, `deny`, `back`, `nav`, `open`, `close`, `toggle` (amount >= 0.5 is "on"), `slider` (amount: pitch), `toast`, `gain`, `chapter` |
| Sky and system | `place`, `take`, `orbit`, `pull`, `push`, `flare`, `shower`, `eclipse`, `sow`, `panspermia`, `comet-strike` |
| Dive | `zoom` (amount: layer), `zoom-in`, `zoom-out`, `fold` (amount: depth), `star`, `land`, `catch`, `pickup`, `hazard`, `low-light` |
| God tools | `water`, `sand`, `stone`, `seed`, `erase`, `fire`, `freeze`, `heat`, `cold`, `rain`, `lightning`, `thunder` (amount: size), `wind` (amount: strength), `meteor`, `quake`, `bless`, `smite`, `whisper`, `merge` |
| Colony | `village`, `birth`, `death`, `soul`, `festival`, `war`, `launch` |
| Body | `step`, `step-grass`, `step-sand`, `step-stone`, `step-snow`, `step-water`, `step-wood`, `body`, `preach`, `gift`, `shine`, `rest` |
| Battle | `strike`, `hit` (amount: weight), `crit`, `heal`, `guard`, `status`, `burn`, `chill`, `ward`, `regen`, `expose`, `energy` (amount: pitch), `swap`, `flee`, `faint`, `level`, `boss`, `win`, `lose` |
| Street | `door`, `coin` (amount: pitch), `talk` (amount: pitch of the voice), `bus`, `bike-bell`, `splash` (amount: size), `skip` (amount: number of skips), `bite`, `shop-bell`, `gate`, `dog`, `cat`, `train`, `crossing`, `step-road`; footsteps by ground are `step-grass`, `step-sand`, `step-stone`, `step-wood`, `step-water`, `step-road`; pickups use `pickup` |

The `town` scene is its own: the bedroom's key out for a walk. `mood.day` (0..999, the town clock) picks dawn, day, dusk or night; `mood.rain` and `mood.wind` raise the weather beds; insects come at dusk and night when it is dry; `mood.place` (the district's name) adds one colour per district and the water bed near the Cut, the Rec and Lowmere. Send no `seed` in the town so it stays in the home key.

The same list is exported as `SFX_NAMES` and returned by `audio.sfxNames?.()`.

`src/app/plugins/sound.ts` already plays `village`, `birth`, `death`, `festival`, `war`, `launch`, `thunder` and `low-light` from game state; other units should call the rest where the thing happens.

## Acceptance criteria

1. Silent until unlock() is called from a gesture; never throws without AudioContext.
2. Notes are scheduled on pulse phase crossings so sound and visuals share one beat.
3. Each screen has a distinct synth scene; setScene crossfades.
4. No audio files are loaded; all voices are oscillators and noise.
5. setMuted silences within 50 ms; dispose closes the context.
6. update() allocates nothing per frame.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
