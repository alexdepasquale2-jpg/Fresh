# Unit 26: src/platform/input

**Scope.** Pointer gestures behind the Input contract.

**Contract.** `src/contracts/platform.ts`: `InputFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/platform/input/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** Real pointer recogniser (tap / hold..release / drag), plus keyboard and standard-gamepad buttons emitted as `{ type: 'key', action, phase, source }` events. `bindings()` lists them. What an action does on each screen is decided by the listener (today: `src/app/plugins/settings.ts`).

## Acceptance criteria

1. A press shorter than 250 ms with under 10 px movement is a tap with its data-id target.
2. A press held over 250 ms emits hold then release with heldMs.
3. A press on a data-drag element that moves over 10 px emits drag start, move, end with the data-drop under the pointer.
4. Multi-touch is ignored after the first pointer.
5. detach removes every listener.
6. Coordinates are CSS px relative to the attached element.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
