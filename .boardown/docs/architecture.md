---
title: Architecture
---

How the code is laid out and, more importantly, which import is allowed to cross which boundary.

> The working rules for contributors live in [`CLAUDE.md`](../../CLAUDE.md). This page explains
> the *shape*; that file is the contract.

## Packages

| Package | Role | Ships? |
| --- | --- | --- |
| `core` | schemas, parser, serializer, board ops, `FsAdapter` interface, conflict guard | no — source-only |
| `ui` | React app, Zustand store, all components | no — source-only |
| `vscode` | extension host + webview | yes, `.vsix` |
| `electron` | main + renderer | yes, installers |
| `cli` | argv → board ops | yes, npm |
| `web` | dev shell over a Vite middleware | no |

`core` and `ui` are consumed **source-only**: `main`/`exports` point at `src/index.ts` and neither
emits a `dist/`. Each shell's bundler transpiles them.

## The boundaries that matter

1. `core` imports nothing from a UI, a browser or `vscode`. It must be consumable from React, an
   extension host, or Node.
2. `ui` imports nothing platform-specific either — no `window.*` beyond what any DOM host has, no
   Node, no `vscode`. Capabilities arrive as props from the shell.
3. **All filesystem access goes through `FsAdapter`.** Never `fetch`, `fs` or a browser API from
   `core` or `ui`.

## FsAdapter

Six methods, implemented once per shell:

```ts
read(path)   // string
write(path, content)
list(dir)    // { name, isDirectory }[]
stat(path)   // { lastModified } | null
mkdir(dir)
remove(path)
```

Paths are board-relative to `.boardown/`, and every implementation rejects an absolute path or a
`..` escape.

## The conflict guard

`ui` never touches the raw adapter. It wraps it in `createGuardedFs`, which compares each write
target's `lastModified` against the value captured at load and refuses to clobber a file changed
on disk, opening the Reload modal instead. It also offers:

- `writeAll` — for files that must land together (a task link mirrored into two tasks): every
  target is checked before any is written, so an external change aborts the whole operation.
- `remove` — the same version check before deleting.
- `removeDir` — re-lists a directory and refuses when it is not empty.

Reach for these in any new multi-file mutation rather than inventing a new one.
