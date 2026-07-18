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
npx @grinev/boardown-cli release current
```

## How it reads

The CLI mirrors the way the app is read: **look at a view, then open one task.**
The three commands at the top are the app's three tabs; everything in a list is a
compact *task summary*, and `task get` is the drill-down that returns everything.
`--full` takes any listing command one level deeper.

## Commands

```
boardown release current        The board: the current release and its tasks.
boardown backlog                Current + future releases and the unscheduled backlog.
boardown archive                Finished releases.

boardown task get <id>          Show one task in full — the drill-down.
boardown task list              List/filter tasks (--status --type --epic --release --backlog --text).
boardown task add <title>       Create a task (--type --status --epic --release --description).
boardown task edit <id>         Edit a task; --release/--no-release and --epic/--no-epic also move it.
boardown task status <id> <s>   Change a task status (todo | in-progress | done).
boardown task reorder <id>      Change priority (--before | --after <id> | --up | --down).
boardown task rm <id>           Delete a task.
boardown task checklist <op>    Checklist item: add | done | undone | edit | rm (on <id>).
boardown task notes <op>        Note: add | edit | rm (on <id>).
boardown task link <op>         Link to another task: add | rm (<id> <other-id>) | ls <id>.

boardown release get <ref>      Show one release and its tasks.
boardown release list           List releases with task counts.
boardown release add <name>     Create a release (--description).
boardown release start <ref>    Make a release current (only one at a time).
boardown release done <ref>     Finish a release (--into <release> to carry over open tasks).

boardown epic get <slug>        Show one epic and its tasks.
boardown epic list              List epics with task counts.
boardown epic add <name>        Create an epic (--color #rrggbb --description).
boardown epic edit <slug>       Edit an epic (--name --description).

boardown init                   Create a .boardown/ board here (--id-prefix --project-name).
boardown schema                 Print the machine-readable command/enum contract.
```

### Output depth

A **task summary** is `id`, `title`, `type`, `status`, plus `epic`, `checklist`
(`{ done, total }`) and `notes` (a count) when the task has them — the fields the
app's task card shows. Descriptions, note bodies and checklist item texts come
from `task get`.

| Command | Default | `--full` |
|---|---|---|
| `backlog` | sections with task summaries | tasks in full |
| `release current` / `release get` | release + task summaries | tasks in full |
| `archive` | finished releases + counts | + task summaries |
| `release list` / `epic list` | one row per release/epic with a task count | + task summaries |
| `epic get` | epic + task summaries | tasks in full |
| `task list` | task summaries + `count` | tasks in full |
| `task get` | the whole task | — |

Mutating commands do not echo the entity back — they return the identifier of
what changed (`{ "id": "BD-42" }`, or `{ "slug": "1-11" }` for a release or
epic), plus the id of a checklist item or note they created.

`task list` filters combine with AND; with no filters it prints every task.
`--epic <slug>` matches both tasks stored in the epic file and tasks living in a
release that carry that epic tag. `--release <ref>` takes a slug or filename,
`--backlog` restricts to unreleased tasks, and `--text` is a case-insensitive
match on title and description.

`task link` relates two tasks. Only one link type exists — `relates`, which is
symmetric — so it is never passed on the command line; the record is mirrored
into both task files, and `rm` removes both halves. Tasks in a finished release
cannot be linked or unlinked (their file is never rewritten). `task rm` also
strips the mirrored records other tasks hold pointing at the deleted task.

The board is located by walking up from the current directory to a `.boardown/`
folder (like git finds `.git`). Use `--data-dir <path>` to point at a specific
`.boardown/` directory instead.

## Machine-readable output

Output is JSON whenever stdout is not a TTY, or with `--json`. Every command
emits a stable envelope:

```jsonc
{ "ok": true,  "data": { /* … */ } }
{ "ok": false, "error": { "code": "EPIC_NOT_FOUND", "message": "…" } }
```

Parse problems from a malformed file ride alongside either shape as `problems`.

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
node packages/cli/dist/cli.cjs release current
```
