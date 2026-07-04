# @boardown/electron

Cross-platform desktop shell for boardown (macOS / Windows / Linux). A sibling of
the `web` and `vscode` shells: it reuses `@boardown/ui` unchanged and only
provides the platform layer — an `FsAdapter` over Electron IPC, an OS-native
folder picker, a recent-folders list, and the application menu. On macOS the
menu lives in the system menu bar; on Windows/Linux the menu bar is removed and
the same menu is reached through a ☰ button in the sidebar (a native popup).

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
  `electron-builder` (see `electron-builder.yml`). On Windows this produces a
  `Setup .exe` (NSIS) plus a portable `.zip`; macOS a `.dmg` + `.zip`; Linux an
  `.AppImage` + `.deb`.

The app icons in `build/` (`icon.ico` / `icon.icns` / `icon.png`) are generated
from the shared brand master and committed — run `pnpm icons` from the repo root
to regenerate them after a logo change, not by hand.

> Running the app needs the Electron binary, whose download is a pnpm build
> script. If pnpm reports it as ignored, approve it with `pnpm approve-builds`
> (or add `electron` to the root `pnpm.onlyBuiltDependencies`). The lint /
> typecheck / build / test gates do **not** need the binary.

The repo's [`Release`](../../.github/workflows/release.yml) workflow runs a
per-OS matrix that calls `dist` on each runner and attaches the installers to
every GitHub Release alongside the `.vsix`. The builds are currently
**unsigned** (macOS uses `mac.identity: null`); code-signing on Windows and
Apple notarization on macOS need certificates/secrets and are deferred to a
later release-pipeline round.
