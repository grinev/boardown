# @boardown/cli

A command-line and **agent-facing** interface for [boardown](../../README.md)
task boards. It is a shell over `@boardown/core`: it implements the `FsAdapter`
on top of Node's filesystem and maps commands onto the same board operations the
UI uses. Because a board is just markdown files in git, every command is a
reviewable, revertible `git diff` — which makes it a good surface for automation
and AI agents.

## Commands

```
boardown board                  Print the whole board.
boardown init                   Create a .boardown/ board in the current directory.
boardown task add <title>       Create a task (--type --status --epic --release --description).
boardown task edit <id>         Edit a task (--title --description --type --status --epic --no-epic).
boardown task status <id> <s>   Change a task status (todo | in-progress | done).
boardown task rm <id>           Delete a task.
boardown task checklist <op>    Checklist item: add | done | undone | edit | rm (on <id>).
boardown task notes <op>        Note: add | edit | rm (on <id>).
boardown schema                 Print the machine-readable command/enum contract.
```

The board is located by walking up from the current directory to a `.boardown/`
folder (like git finds `.git`). Use `--data-dir <path>` to point at a specific
`.boardown/` directory instead.

## Machine-readable output

Output is JSON whenever stdout is not a TTY, or with `--json`. Every command
emits a stable envelope:

```jsonc
{ "ok": true,  "command": "task add", "data": { /* … */ } }
{ "ok": false, "command": "task add", "error": { "code": "EPIC_NOT_FOUND", "message": "…" } }
```

Exit codes: `0` success, `1` operation failed, `2` usage error. Run
`boardown schema --json` for the full contract (valid task types, statuses, and
command grammar) — agents can read it instead of guessing.

## Install

This package is built with esbuild into a single Node bundle (`dist/cli.cjs`).

Build it, then link it onto your `PATH`:

```bash
pnpm --filter @boardown/cli build
cd packages/cli && pnpm link --global   # or: npm link
boardown --help
```

For a one-off local run without linking:

```bash
pnpm --filter @boardown/cli build
node packages/cli/dist/cli.cjs board
```

## Develop

```bash
pnpm --filter @boardown/cli watch       # rebuild on change
pnpm --filter @boardown/cli test        # vitest
pnpm --filter @boardown/cli typecheck   # tsc --noEmit
```
