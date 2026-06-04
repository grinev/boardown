# @boardown/electron

Cross-platform desktop shell for boardown (macOS / Windows / Linux). A sibling of
the `web` and `vscode` shells: it reuses `@boardown/ui` unchanged and only
provides the platform layer — an `FsAdapter` over Electron IPC, an OS-native
folder picker, a recent-folders list, and the application menu.

## How it fits the architecture

- **Main process** (`src/main/`, bundled with esbuild → `dist/main.js`,
  `dist/preload.js`) owns all OS integration: window lifecycle, the native
  `Open Folder…` dialog, recent-folders persistence (in `app.getPath('userData')`),
  the menu, an optional CLI folder argument, and the file-system IPC handlers.
  Every path is resolved against the open board's `.boardown/` directory and
  guarded against `..`/absolute-path escapes.
- **Preload** (`src/main/preload.ts`) exposes a single `window.boardown` bridge
  via `contextBridge` (context isolation on, no node integration, sandboxed).
- **Renderer** (`src/renderer/`, bundled with Vite → `dist/renderer/`) shows a
  welcome screen (recent folders + Open Folder) until a board is chosen, then
  mounts the real `@boardown/ui` `App` with the bridge's `FsAdapter`.

The board root is `<chosen folder>/.boardown/` — the same convention the VS Code
shell uses for its workspace folder.

## Scripts

- `pnpm --filter @boardown/electron dev` — Vite dev server + esbuild watch +
  Electron pointed at it. Append `-- /path/to/project` to open a board on boot.
- `pnpm --filter @boardown/electron build` — bundle main, preload and renderer
  into `dist/`.
- `pnpm --filter @boardown/electron dist` — package installers via
  `electron-builder` (see `electron-builder.yml`).

> Running the app needs the Electron binary, whose download is a pnpm build
> script. If pnpm reports it as ignored, approve it with `pnpm approve-builds`
> (or add `electron` to the root `pnpm.onlyBuiltDependencies`). The lint /
> typecheck / build / test gates do **not** need the binary.

Producing signed, notarized installers for all three OSes is a release-pipeline
concern (certificates, Apple notarization, Windows code-signing) and lives in
CI, not in this package.
