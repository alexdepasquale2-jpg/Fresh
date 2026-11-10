# Unit 27: src/platform/edge-voice

**Scope.** Optional adapter, cache by seed, grammar fallback; off by default.

**Contract.** `src/contracts/platform.ts`: `EdgeVoiceFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/platform/edge-voice/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Off by default; when off, revoice and revoiceSync return grammarText unchanged.
2. When on, output is validated (length, charset, no URLs) and falls back to grammarText on failure or timeout.
3. Results are cached by (kind, seedHex) and revoiceSync returns the cached value.
4. Never blocks the core loop; no network call without an endpoint.
5. Network errors never throw to callers.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
