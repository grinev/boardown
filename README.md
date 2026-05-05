# boardown

> 🚧 **Status: work in progress.** Not ready for use yet.

A local-first task board that stores its data as plain markdown files inside
your project's git repo. Sprints, epics and tasks live in `.boardown/` next
to your code, so they version, branch and diff with the rest of the project —
no cloud, no server, no account.

The first target is a **browser app** (open a local folder via the File
System Access API). A **VS Code extension** is planned next, with a possible
Electron build later.

See [PRODUCT.md](./PRODUCT.md) for the full spec and the MVP roadmap.

## Development

Requirements:

- Node.js **>= 20** (the repo pins `20` via `.nvmrc`; Node 22 also works)
- pnpm **10+** (`npm install -g pnpm` or via `corepack`)

Install dependencies once:

```sh
pnpm install
```

The repo is a pnpm workspace with three packages:

- [`packages/core`](./packages/core) — platform-agnostic logic (schemas,
  parser, board operations). Pure TypeScript, runs in Node.
- [`packages/ui`](./packages/ui) — the React app: components, Zustand store,
  UI flow. Takes an `FsAdapter` as input, knows nothing about the host.
  Source-only (consumed directly by the shell's bundler).
- [`packages/web`](./packages/web) — slim browser shell: Vite app, the FS
  Access API adapter, folder picker. Mounts `@boardown/ui`.

A future `packages/vscode` and `packages/electron` will be additional shells
next to `web`, reusing `@boardown/ui` unchanged.

### Common scripts (run from the repo root)

| Command            | What it does                                              |
|--------------------|-----------------------------------------------------------|
| `pnpm dev`         | Start the web dev server (Vite, `http://localhost:5173`)  |
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

The browser app needs a Chromium-based browser (Chrome, Edge, Brave, Arc) —
it relies on the File System Access API, which Firefox and Safari do not
support yet.

### Sample board for the dev server

The repo ships a `.boardown/` folder at the root with a minimal config and a
couple of empty releases / epic. While the folder picker is not implemented
yet, `pnpm dev` reads this folder via a small Vite middleware that exposes
`/api/fs/{read,list,stat,write}` over HTTP. This is a dev-only shortcut so
you can boot the app and click around without picking a folder.

The first folder picker pass will replace this bridge with the FS Access API
in production builds; the dev middleware will stay as the source-tree default.

## License

[MIT](./LICENSE)
