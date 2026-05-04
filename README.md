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

The repo is a pnpm workspace with two packages:

- [`packages/core`](./packages/core) — platform-agnostic logic (schemas,
  parser, board operations). Pure TypeScript, runs in Node.
- [`packages/web`](./packages/web) — React + Vite browser app.

### Common scripts (run from the repo root)

| Command            | What it does                                              |
|--------------------|-----------------------------------------------------------|
| `pnpm dev`         | Start the web dev server (Vite, `http://localhost:5173`)  |
| `pnpm build`       | Build every package (`tsc` for core, `vite build` for web)|
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

## License

[MIT](./LICENSE)
