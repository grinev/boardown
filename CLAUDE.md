# CLAUDE.md

Guidance for AI assistants (Claude Code, etc.) working in this repository.

## Project

**boardown** is a small open-source task board that stores its data as markdown
files inside the project repo. It is aimed at solo developers and follows a
lightweight scrum flow: a Backlog plus releases with a `future → current →
finished` lifecycle, and epics as a cross-release grouping that doubles as
the storage container for unscheduled tasks. The product spec lives in
[PRODUCT.md](./PRODUCT.md) — read it before making non-trivial changes.

License: MIT.

## Communication rules

- Write all code, comments, identifiers, commit messages, and documentation in
  **English**.
- When replying to the user in chat, **reply in the same language the user
  wrote in**. Do not translate the user's message just to process it — answer
  in their language directly.

## Tech stack (decided)

- **Language:** TypeScript (strict mode everywhere)
- **Frontend framework:** React 18
- **Build tool:** Vite
- **Package manager / monorepo:** pnpm with workspaces
- **State management:** Zustand (kept minimal — single-user app, no Redux)
- **Schema validation:** Zod (frontmatter + config)
- **Markdown frontmatter:** `gray-matter`
- **Drag & drop:** `@dnd-kit/core`
- **Tests:** Vitest

The primary distribution channel is a **VS Code extension** (packaged into an
installable `.vsix` and published to the Marketplace and Open VSX), which reads
`.boardown/` from the open workspace, alongside the Electron desktop app and the
CLI. The **browser shell (`packages/web`) is a development and
local-from-sources tool** — it boots `@boardown/ui` against a selected
`.boardown/` over a Vite middleware, and is not a distribution channel. It has
no folder picker and no File System Access API integration.

## Repo layout

```
boardown/
├── packages/
│   ├── core/          # platform-agnostic logic: schemas, md parser, FsAdapter
│   │                  # interface, board operations, ID generator
│   ├── ui/            # React app: components, Zustand store, UI flow.
│   │                  # Takes an FsAdapter as a prop. No DOM-only / Node /
│   │                  # VS Code imports.
│   ├── web/           # Dev-only browser shell: Vite app, DevHttpFsAdapter
│   │                  # over a Vite middleware that serves a selected
│   │                  # .boardown/, manual Reload only. Mounts @boardown/ui.
│   │                  # Not a distribution channel.
│   ├── vscode/        # Primary shell: extension host (esbuild) + webview
│   │                  # (Vite) hosting @boardown/ui. Shipped (.vsix per
│   │                  # release; Marketplace + Open VSX).
│   ├── electron/      # Desktop shell (macOS / Windows / Linux): Electron main
│   │                  # (esbuild) + renderer (Vite) hosting @boardown/ui over a
│   │                  # Node FsAdapter. Shipped (installers per release).
│   └── cli/           # Command-line / agent-facing shell: maps argv onto
│                      # @boardown/core board-ops over a Node FsAdapter, with
│                      # machine-readable JSON output. Published to npm as
│                      # @grinev/boardown-cli.
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── CLAUDE.md
└── PRODUCT.md
```

`@boardown/core` and `@boardown/ui` are both consumed source-only:
`main`/`exports` point at `src/index.ts`, no separate build step. The shell's
bundler (Vite for `web`, esbuild for the VS Code host) transpiles them, and
`tsc`/ESLint resolve their types straight from source. Neither package emits a
`dist/`. Only the shells (`web`, `vscode`, `electron`, `cli`) have a `build`
script — they bundle the source-only libraries into their own artifacts.

`packages/vscode` is the primary distribution target. It is a sibling shell next
to `web` and reuses `@boardown/ui` unchanged — only the `FsAdapter`
implementation and entry flow differ. The extension host is bundled with esbuild (`vscode` external, CJS) and
the webview with Vite; both run in the Extension Development Host via F5. The
webview mounts the real `@boardown/ui` with a `VsCodeFsAdapter` that proxies
`read/write/list/stat` to the host over `postMessage`, where the host serves
them from `vscode.workspace.fs`. The board root is the single open workspace
folder's `.boardown/`; choosing among multiple roots or an arbitrary folder is
out of scope (Electron territory). The Electron desktop build follows the same
shell pattern and ships installers with each release.

`packages/web` ships a small Vite middleware that exposes
`/api/fs/{read,list,stat,write}` over HTTP, scoped to a selected `.boardown/`
folder, plus a `DevHttpFsAdapter` that talks to those
endpoints. This is the **only** browser-side path — it is the working
environment for `@boardown/ui` development, not a stepping stone to a deployable
browser app.

`packages/cli` is a headless shell that does **not** mount `@boardown/ui` — it has
no DOM. Instead it consumes `@boardown/core` directly (board-ops, loader,
serializer, schemas) and implements `FsAdapter` over `node:fs/promises`, mapping
CLI commands onto board operations. It is aimed at agents and scripts: output is a
stable JSON envelope when stdout is not a TTY (or with `--json`), human-readable
otherwise. The bin is bundled with esbuild into a single Node CJS file. Process
invariants (release lifecycle, finished-release read-only) live in `core`, so the
CLI inherits them rather than re-implementing them.

## Conventions

- Keep `packages/core` free of any UI / browser / VS Code imports. It must be
  consumable from React, an extension host, or Node.
- Keep `packages/ui` free of platform-specific imports too: no `window.*`,
  `document.*`, `navigator.*` outside what works in any DOM host (browser
  tab, VS Code webview, Electron renderer); no Node, no `vscode` API. The
  `FsAdapter` and any other platform capabilities arrive via props/context
  from the shell.
- Shells (`web`, future `vscode`, `electron`) own platform integrations:
  `FsAdapter` implementation, folder picker / workspace acquisition, refresh
  triggers, OS dialogs.
- All file system access goes through the `FsAdapter` interface defined in
  `packages/core`. Never call `fetch`, `fs`, or browser APIs from `core` or
  `ui`.
- Validate every parsed `frontmatter` and `config.yaml` through a Zod schema.
  Surface validation errors as structured problems (see "Lenient parsing"
  in PRODUCT.md), never throw away user data.
- Never auto-rewrite a file the parser failed to fully understand.
- If `.boardown/config.yaml` is missing, the UI shows an onboarding modal
  that writes it on submit. Do not auto-create `config.yaml` outside that
  flow, and do not fall back to defaults — a present-but-invalid config is
  always an error, never silently replaced.
- No automated backups — git is the safety net.
- External-change safety: `ui` wraps the `FsAdapter` in `createGuardedFs`
  (`packages/core`), which compares each write target's `lastModified` against
  the value captured at load and refuses to clobber a file changed on disk,
  opening the Reload conflict modal instead. Shared by all shells. The guard also
  exposes `writeAll`, for a set of files that must land together (e.g. a task link
  mirrored into two tasks): it checks every target before writing any of them, so
  an external change aborts the whole operation instead of half-applying it —
  reach for it in any new multi-file mutation. Re-reading on
  demand is the manual Reload button; in addition the VS Code and Electron shells
  auto-refresh on external `.boardown/` changes via a host file watcher (gated by
  the `boardown.autoRefresh` setting), while the `web` dev shell stays
  manual-only.
- Styling in `packages/ui`: CSS variables for the theme palette (defined in
  `src/theme/theme.css`, scoped via `:root, [data-theme='light']`, etc.) and
  CSS Modules for component-specific styles (`Foo.module.css`). Components
  must reference colors/typography only through `var(--…)` — never hard-code
  hex values — so a new theme is one extra `[data-theme='dark'] { … }` block.
  No CSS-in-JS, no Tailwind.
- TypeScript: prefer `interface` for public shapes, `type` for unions/utility
  types. No `any`. No non-null assertions unless unavoidable and commented.
- Comments: only when the *why* is non-obvious. Do not narrate what the code
  does. No multi-paragraph docstrings.
- No premature abstractions. Three similar lines is fine; do not generalise on
  speculation.
- No backwards-compatibility shims while the project is pre-1.0. Just change
  the code.
- boardown dog-foods its own board, stored in `.boardown/`. Commit changes to
  that board data under the `chore(board): …` scope. This scope is excluded
  from generated release notes by `scripts/generate-release-notes.mjs`, so
  task-tracking commits never leak into a user-facing changelog. Reserve
  `chore(board)` for `.boardown/` data; use normal conventional-commit types
  for code and docs.
- Versioning is **lockstep**: every `package.json` carries the same version,
  with the **root `package.json` as the single source of truth**. Never bump a
  package version by hand — use `pnpm release:prepare` (which mirrors the root
  version into all packages via `scripts/sync-versions.mjs`). Releases are
  cut by bumping the version on `main`; the `Release` workflow tags and attaches
  the built `.vsix` and desktop installers to a GitHub Release, then calls the
  reusable per-target `publish-*.yml` workflows: `publish-marketplace.yml`
  (VS Code Marketplace) and `publish-openvsx.yml` (Open VSX) publish the `.vsix`,
  and `publish-npm.yml` publishes the CLI package (`@grinev/boardown-cli`) to npm
  via tokenless Trusted Publishing (OIDC). See [README](./README.md#releasing).

## Verifying changes

Before considering any code change done, run these from the repo root and make
sure they pass (they are the same gates CI enforces):

- `pnpm lint` — ESLint over the whole repo.
- `pnpm typecheck` — `tsc --noEmit` across all packages.
- `pnpm build` — `pnpm -r build`; builds the shells (`web`, `vscode`). The
  source-only libraries (`core`, `ui`) have no `build` script and are skipped.
- `pnpm test` — Vitest across all packages.

Order does not matter: `core` and `ui` are source-only, so `lint`/`typecheck`
resolve their types from source and never depend on a prior build.

### Browser testing

There is deliberately **no e2e suite** — it would cost more to maintain than it
returns on a project this size. Instead, a change that touches the UI is not done
until it has been driven in a real browser. Use the Playwright MCP server
(configured in `.mcp.json`) against the sandbox:

```sh
pnpm dev:sandbox   # http://localhost:5199
```

It serves a **throwaway copy** of `tests/fixtures/board/.boardown/` and prints
the copy's path. Two rules:

- **Never point a browser session at the repo's own `.boardown/`.** Clicking the
  board writes markdown to disk; you would corrupt the real board.
- After a UI action, read the file in the sandbox copy and check that the
  frontmatter actually changed as intended. Passing on screen is half the check —
  what landed on disk is the other half.

Go looking for breakage, not for confirmation: empty title, a finished release
(read-only), a drag onto a target that should reject it, cancel out of a modal.

Elements without an accessible name (board column, task card, backlog row,
section) carry `data-testid`; everything else is reachable via role/label. If a
new element needs neither, prefer giving it a proper accessible name over a
testid.

The MCP server writes its snapshots, console logs and screenshots to
`.playwright-mcp/` (gitignored). A screenshot's `filename` argument, however, is
resolved against the repo root, not that directory — so either omit it or pass
`.playwright-mcp/<name>.png`. Never leave test artifacts in the working tree.

Run the full set as part of a task's Definition of Done; a green local run is
expected before committing. If a change is scoped to one package you may iterate
with `pnpm --filter @boardown/<pkg> <script>`, but do a full-repo
`pnpm lint && pnpm typecheck && pnpm build` before wrapping up. Never commit
code that fails any of these gates.

## Working style

- Stay strictly within the scope the user asked for. If a task surfaces
  related questions, raise them — do not silently expand the work.
- Surface architectural choices and any non-trivial trade-offs before
  implementing them. Do not silently pick a "sensible default" for things
  like library choice, module boundaries, data formats, or edge-case
  behaviour. Trivial implementation details (local variable names, import
  order, etc.) do not need to be confirmed.
- The product is intentionally small. Push back on feature creep.
- **Never commit without explicit permission.** Do not run `git commit` (or
  `git push`) on your own initiative, even when a change is finished and the
  gates pass. Stage and prepare changes if asked, but wait for the user to
  explicitly tell you to commit.

## Planning

boardown dog-foods its own board: releases, epics and tasks live in
[`.boardown/`](./.boardown/) and are the single source of truth for what is
planned and what is done. Read the board (or drive it with the CLI) instead of
looking for a checklist in a markdown doc.

[PRODUCT.md](./PRODUCT.md) describes what the product *is* — domain model,
storage format, behaviour rules, shells — plus a broad "Direction" section. It
is descriptive, not a contract: when a change makes it inaccurate, update it.
