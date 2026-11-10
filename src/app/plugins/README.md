Each `*.ts` file here that exports `plugin: Plugin` (see `../plugins.ts`) is loaded at boot.
Keep each plugin self-contained: its own file, and its own CSS imported from that file.

Rules for plugins:

- **No floating buttons.** Pages (journal, codex, settings, ...) are added with `shell.menu.add({ id, label, hint, order, badge, render })` and open inside the hub sheet (the ≡ button, top right). `render(into, close)` builds the page into `into`; return a cleanup.
- **Notices** go through `shell.toast(text, { title })`. Do not build your own toast.
- **State** that must survive a reload goes through `shell.store<T>('your-key', initial)` (localStorage, key prefix `sallow-`). The save contract is not yours to edit.
- Read game state from `shell.ctx` (box, light, sky, sim.latest(), battle, selection, clock). Listen with `shell.onFrame`, `shell.onNavigate` and `shell.ctx.bus`.
- Overlays you must draw outside the menu are appended to `shell.host`, `pointer-events: none` unless a control needs touch, tokens from `src/ui/tokens.css` only, z-index below 60.
- A plugin must never throw into the frame loop: wrap frame work in try/catch.
