# boardown

> 🚧 **Status: work in progress.** Not ready for use yet.

A local-first task board that stores its data as plain markdown files inside
your project's git repo. Releases, epics and tasks live in `.boardown/` next
to your code, so they version, branch and diff with the rest of the project —
no cloud, no server, no account.

The primary MVP target is a **VS Code extension** that reads `.boardown/`
from the open workspace. The browser app in this repo (`packages/web`) is a
development shell used to iterate on the UI from sources, not a production
distribution channel. An Electron build is post-MVP.

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
- [`packages/web`](./packages/web) — dev-only browser shell: Vite app that
  mounts `@boardown/ui` over a Vite middleware which serves the repo's own
  `.boardown/`. Used for iterating on the UI from sources.

A future `packages/vscode` (the primary MVP distribution target) and
`packages/electron` (post-MVP) will be additional shells next to `web`,
reusing `@boardown/ui` unchanged.

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

The dev server runs in any modern browser — it talks to the repo's
`.boardown/` over a local Vite middleware, so no File System Access API or
Chromium-only feature is involved.

### Sample board for the dev server

The repo ships a `.boardown/` folder at the root with a minimal config and a
couple of empty releases / epics. `pnpm dev` reads this folder via a small
Vite middleware that exposes `/api/fs/{read,list,stat,write}` over HTTP, and
`@boardown/ui` mounts on top of a `DevHttpFsAdapter` that talks to those
endpoints. This is the working environment for UI development; a production
browser deployment (folder picker, FS Access API or otherwise) is not in the
MVP scope.

## License

[MIT](./LICENSE)
