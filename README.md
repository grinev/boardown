# boardown

> 🚧 **Status: work in progress.** The VS Code extension is in development,
> but boardown can already be used from sources via the local web shell.

A local-first task board that stores its data as plain markdown files inside
your project's git repo. Releases, epics and tasks live in `.boardown/` next
to your code, so they version, branch and diff with the rest of the project —
no cloud, no server, no account.

The primary MVP target is a **VS Code extension** that reads `.boardown/`
from the open workspace. While that extension is being built, the browser app
in this repo (`packages/web`) can run locally against any `.boardown/` data
directory, which works well in VS Code's built-in browser panel. An Electron
build is post-MVP.

<p align="center">
  <img src="./assets/screenshot-1.png" alt="boardown board view" width="80%" />
</p>

<p align="center">
  <img src="./assets/screenshot-2.png" alt="boardown task details" width="80%" />
</p>

See [PRODUCT.md](./PRODUCT.md) for the full spec and the MVP roadmap.

## Try it from sources

Install dependencies once:

```sh
pnpm install
```

Start boardown against this repo's sample `.boardown/`:

```sh
pnpm dev
```

Or open another project by pointing `--data-dir` at that project's `.boardown/`
directory:

```sh
pnpm dev -- --data-dir /path/to/project/.boardown
```

Then open `http://localhost:5173` in a browser. In VS Code, run
**Simple Browser: Show** from the Command Palette, enter
`http://localhost:5173`, and pin the tab if you want it to behave like a local
board panel.

If the selected `.boardown/` has no `config.yaml`, the web shell creates the
default structure automatically with `idPrefix: TASK`. Create `config.yaml`
manually before first launch if you want a different prefix.

## Development

Requirements:

- Node.js **>= 20** (the repo pins `20` via `.nvmrc`; Node 22 also works)
- pnpm **10+** (`npm install -g pnpm` or via `corepack`)

Install dependencies once if you skipped the quick start above:

```sh
pnpm install
```

The repo is a pnpm workspace with three packages:

- [`packages/core`](./packages/core) — platform-agnostic logic (schemas,
  parser, board operations). Pure TypeScript, runs in Node.
- [`packages/ui`](./packages/ui) — the React app: components, Zustand store,
  UI flow. Takes an `FsAdapter` as input, knows nothing about the host.
  Source-only (consumed directly by the shell's bundler).
- [`packages/web`](./packages/web) — dev-only browser shell: Vite app that
  mounts `@boardown/ui` over a Vite middleware which serves a local
  `.boardown/` data directory. Used for iterating on the UI from sources.

A future `packages/vscode` (the primary MVP distribution target) and
`packages/electron` (post-MVP) will be additional shells next to `web`,
reusing `@boardown/ui` unchanged.

### Common scripts (run from the repo root)

| Command            | What it does                                              |
|--------------------|-----------------------------------------------------------|
| `pnpm dev`         | Start the web dev server against this repo's `.boardown/` (Vite, `http://localhost:5173`) |
| `pnpm build`       | Build every package that has a `build` script (core → `dist/`, web → Vite bundle; `ui` is source-only) |
| `pnpm test`        | Run Vitest across all packages                            |
| `pnpm typecheck`   | Run `tsc --noEmit` in every package                       |
| `pnpm lint`        | Run ESLint over the workspace                             |
| `pnpm format`      | Apply Prettier in-place                                   |
| `pnpm format:check`| Check Prettier formatting without writing                 |

### Running a single package

Use pnpm's `--filter`:

```sh
pnpm --filter @boardown/web dev      # only the web dev server
pnpm --filter @boardown/core build   # only the core build
pnpm --filter @boardown/core test    # only core tests
```

The dev server runs in any modern browser — it talks to the selected
`.boardown/` over a local Vite middleware, so no File System Access API or
Chromium-only feature is involved.

To open another boardown data directory from sources, pass `--data-dir`. The
path must point to the `.boardown` directory itself, not to the project root:

```sh
pnpm dev -- --data-dir /path/to/project/.boardown
```

If `--data-dir` is omitted, boardown uses this repository's `.boardown/`, same
as before. Relative `--data-dir` paths are resolved from the directory where
you run the command.

### Sample board for the dev server

The repo ships a `.boardown/` folder at the root with a minimal config and a
couple of empty releases / epics. `pnpm dev` reads the selected data directory
via a small Vite middleware that exposes `/api/fs/{read,list,stat,write}` over
HTTP, and `@boardown/ui` mounts on top of a `DevHttpFsAdapter` that talks to
those endpoints. This is the working environment for UI development and local
use from sources; a production browser deployment (folder picker, FS Access
API or otherwise) is not in the MVP scope.

When the selected data directory has no `config.yaml`, the web shell creates
the default structure:

```text
.boardown/
├── config.yaml
├── backlog.md
├── releases/
│   └── v0.1.md
└── epics/
```

The generated config uses `idPrefix: TASK`, so the first generated task id is
`TASK-1`:

```yaml
idPrefix: TASK
nextId: 1
projectName: My Board
```

The `projectName` field is required and shown in the app header. Create
`config.yaml` yourself before first launch if you want a different prefix or
project name. The starter release is named `v0.1` and has `status: current`,
so the board is ready for new tasks immediately.

## License

[MIT](./LICENSE)
