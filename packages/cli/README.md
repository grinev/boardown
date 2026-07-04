# @grinev/boardown-cli

A command-line and **agent-facing** interface for [boardown](https://github.com/grinev/boardown)
task boards. It is a shell over `@boardown/core`: it implements the `FsAdapter`
on top of Node's filesystem and maps commands onto the same board operations the
UI uses. Because a board is just markdown files in git, every command is a
reviewable, revertible `git diff` — which makes it a good surface for automation
and AI agents.

The published package installs a single `boardown` command.

## Install

```bash
npm i -g @grinev/boardown-cli   # installs the `boardown` command globally
boardown --help
```

Or run it without installing:

```bash
npx @grinev/boardown-cli board
```

## Commands

```
boardown board                  Print the whole board.
boardown init                   Create a .boardown/ board here (--id-prefix --project-name).

boardown task get <id>          Show one task and where it lives.
boardown task add <title>       Create a task (--type --status --epic --release --description).
boardown task edit <id>         Edit a task; --release/--no-release and --epic/--no-epic also move it.
boardown task status <id> <s>   Change a task status (todo | in-progress | done).
boardown task reorder <id>      Change priority (--before | --after <id> | --up | --down).
boardown task rm <id>           Delete a task.
boardown task checklist <op>    Checklist item: add | done | undone | edit | rm (on <id>).
boardown task notes <op>        Note: add | edit | rm (on <id>).

boardown release get <ref>      Show one release and its tasks.
boardown release list           List releases.
boardown release current        Show the current release and its tasks.
boardown release add <name>     Create a release (--description).
boardown release start <ref>    Make a release current (only one at a time).
boardown release done <ref>     Finish a release (--into <release> to carry over open tasks).

boardown epic get <slug>        Show one epic and its tasks.
boardown epic list              List epics.
boardown epic add <name>        Create an epic (--color #rrggbb --description).
boardown epic edit <slug>       Edit an epic (--name --description).

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

## Develop (from the monorepo)

The package is built with esbuild into a single Node bundle (`dist/cli.cjs`);
`@boardown/core` is inlined, so the published package has no runtime
dependencies. From the repo root:

```bash
pnpm --filter @grinev/boardown-cli build       # bundle dist/cli.cjs
pnpm --filter @grinev/boardown-cli watch       # rebuild on change
pnpm --filter @grinev/boardown-cli test        # vitest
pnpm --filter @grinev/boardown-cli typecheck   # tsc --noEmit
```

For a one-off local run without installing:

```bash
pnpm --filter @grinev/boardown-cli build
node packages/cli/dist/cli.cjs board
```
