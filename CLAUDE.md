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

The primary MVP distribution channel is a **VS Code extension** (planned but
not yet implemented), which reads `.boardown/` from the open workspace. The
**browser shell (`packages/web`) is a development tool only** — it boots
`@boardown/ui` against the repo's own `.boardown/` over a Vite middleware,
and is not a production distribution channel for the MVP. File System Access
API integration and a folder picker are explicit non-goals for the MVP.

## Repo layout

```
boardown/
├── packages/
│   ├── core/          # platform-agnostic logic: schemas, md parser, FsAdapter
│   │                  # interface, board operations, ID generator
│   ├── ui/            # React app: components, Zustand store, UI flow.
│   │                  # Takes an FsAdapter as a prop. No DOM-only / Node /
│   │                  # VS Code imports.
│   └── web/           # Dev-only browser shell: Vite app, DevHttpFsAdapter
│                      # over a Vite middleware that serves the repo's own
│                      # .boardown/, focus/visibility refresh triggers.
│                      # Mounts @boardown/ui. No production browser deployment
│                      # in MVP.
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── CLAUDE.md
└── PRODUCT.md
```

`@boardown/ui` is consumed source-only: `main`/`exports` point at
`src/index.ts`, no separate build step. The shell's bundler (Vite for `web`,
later esbuild/rollup for VS Code / Electron) transpiles it.

A `packages/vscode` extension is the primary MVP distribution target but
will be implemented as a separate planning round once `packages/ui` is
feature-complete enough to host. An Electron build is post-MVP. When either
arrives, it is a sibling shell next to `web` and reuses `@boardown/ui`
unchanged — only the `FsAdapter` implementation and entry flow differ.

`packages/web` ships a small Vite middleware that exposes
`/api/fs/{read,list,stat,write}` over HTTP, scoped to the repo's own
`.boardown/` folder, plus a `DevHttpFsAdapter` that talks to those
endpoints. This is the **only** browser-side path for the MVP — it is the
working environment for `@boardown/ui` development, not a stepping stone to
a production browser app. A production browser shell (with the FS Access
API or otherwise) is post-MVP and may or may not happen.

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
- No automated backups — git is the safety net.
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

## Working style

- Stay strictly within the scope the user asked for. If a task surfaces
  related questions, raise them — do not silently expand the work.
- Surface architectural choices and any non-trivial trade-offs before
  implementing them. Do not silently pick a "sensible default" for things
  like library choice, module boundaries, data formats, or edge-case
  behaviour. Trivial implementation details (local variable names, import
  order, etc.) do not need to be confirmed.
- The MVP scope is intentionally small. Push back on feature creep and link
  to PRODUCT.md "Out of scope" when relevant.

## Roadmap

The high-level MVP checklist is in [PRODUCT.md](./PRODUCT.md#mvp-roadmap).
Tick items as they land. Add new sub-tasks under their parent if needed; do
not silently expand the scope.
