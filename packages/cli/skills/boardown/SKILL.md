---
name: boardown
description: The project's task board, managed by the `boardown` CLI. Use whenever the user names boardown explicitly - including asking to set up a new board - and, in a project that has a `.boardown/` directory, whenever the user mentions tasks, the board, the backlog, releases, epics, labels, files attached to a task, or a task id like BD-39 or other prefix ("add a task", "what's in the backlog", "move BD-12 to in progress", "what's in the current release", "label this task", "attach a screenshot to the task", "what's on the board"). Explains the board model and gives the full command list so the CLI never has to be rediscovered.
---

The board lives in `.boardown/` at the project root and is plain Markdown under
git. Never edit those files by hand - always go through the `boardown` CLI. When
the CLI has no command for what is asked (a docs page, renaming or removing a
label in the registry, deleting an epic or a release), tell the user it cannot be
done through the CLI and stop there.

This page follows boardown 0.11. Labels, attachments, `--label` / `--link` /
`--attach` on `task add` and `editFinishedReleases` do not exist in older builds;
`boardown --version` says what is installed.

## Board model

- **Task** - the unit of work. Id `<PREFIX>-<n>`, the prefix is per board.
  Fields: `title`, `description`, `type`, `status`, optional `priority`
  (`critical` | `high` | `medium` | `low`; absent reads as `medium`), `epic`,
  `labels`, `checklist`, `notes`, `links`, custom fields. `order` ranks the task
  within its release or the backlog and is set by `task reorder` - it is not
  `priority`.
- **Statuses and types belong to the board.** The defaults are `todo` →
  `in-progress` → `done` and `bug` | `feature` | `docs` | `tech`, but a board may
  declare its own (`ready`, `review`, a custom type). Statuses are positional: the
  first is what a new task gets, the last is terminal, everything between is a
  middle column. Take the valid values from `boardown schema` (`taskStatuses`,
  `taskTypes`) - a value from memory is refused on a board that renamed it.
- **Release** - `.boardown/releases/<slug>.md`, status `future` | `current` |
  `finished`. A `current` release is active and is what the Board view shows;
  several can be active only on a board with `multipleActiveReleases`.
- **Backlog** - every task in no release, kept in `.boardown/backlog.md`.
- **Epic** - `.boardown/epics/<slug>.md`, a long-running theme. A task names it
  in its own `epic` key, in a release or in the backlog alike, and keeps it when
  it moves between them.
- **Archive** - finished releases.

A task sits in exactly one file, a release or the backlog; the output says which
in `in: { kind: release | backlog, file }`.

## Output contract

When stdout is piped - always, for an agent - output is a JSON envelope:
`{"ok":true,"data":{...}}`, with `problems` added when some board file could not
be fully read, or `{"ok":false,"error":{"code":"...","message":"..."}}` with exit
code 1, or 2 for a usage error (`USAGE`, `RELEASE_INVALID`, `EPIC_INVALID`). A
status or type this board does not declare is `USAGE`, and its message lists the
valid values.

Listing commands return task summaries (id, title, type, priority, status, epic,
labels, checklist counts, notes count); `--full` goes one level deeper - whole
tasks where a listing shows summaries, summaries where it shows only counts
(`release list`, `epic list`, `archive`). `task get` returns
`{ tasks: [{ task, in }], missing }` - an unknown id lands in `missing`, it is not
an error. Mutating commands return the identifiers of what changed; after
`release edit --name` that is the release's new slug, and the old one no longer
resolves.

A flag the CLI does not know is ignored, not refused: a misspelled flag, or one
from a newer build, is a silent no-op while the rest of the command succeeds.

## Commands

`<ref>` is a release slug (`releases/<slug>.md` works too). Flags marked `…`
repeat.

Views:

```bash
boardown release current [--all] [--full]   # the Board view; --all for every active release
boardown backlog [--full]                   # active releases, future releases, then the backlog
boardown archive [--full]                   # finished releases, by file name descending - not by date
```

Tasks:

```bash
boardown task get <id>…
boardown task list [--status S…] [--type T…] [--priority P…] [--epic SLUG…] [--release <ref>] [--backlog] [--text SUBSTR] [--full]
boardown task add <title> [--type T] [--priority P] [--status S] [--description TEXT] [--epic SLUG] [--release <ref>] [--field key=value]… [--checklist TEXT]… [--label L]… [--link [TYPE=]ID]… [--attach FILE]…
boardown task edit <id> [--title T] [--description D] [--type T] [--priority P] [--status S] [--epic SLUG | --no-epic] [--release <ref> | --no-release] [--field key=value]…
boardown task status <id> <status>
boardown task reorder <id> (--before ID | --after ID | --up | --down)
boardown task rm <id>                                                    # also deletes its attachments
boardown task checklist (add <id> <text>… | done <id> <item>… | undone <id> <item>… | edit <id> <item> <text> | rm <id> <item>…)   # items c1, c2, …
boardown task notes (add <id> <text> | edit <id> <note> <text> | rm <id> <note>)                                                    # notes n1, n2, …
boardown task link (add <id> <other-id> [--type TYPE] | rm <id> <other-id> [--type TYPE] | ls <id>)
boardown task label (add <id> <label>… | rm <id> <label>…)
boardown task attachment (add <id> <file>… | rm <id> <name> | ls <id>)
boardown task commits <id>                                               # local commits whose subject names the id
```

- `task list`: values inside one flag are OR, different flags are AND. `--text`
  searches title and description, not the id. There is no label filter - a
  `--label` is ignored and every task comes back; filter `labels` in the output.
- `task add` writes the task with its checklist, links, labels and files at once;
  any refusal writes nothing.
- `task edit`: a release move and an epic change go in separate calls. A release
  move with `--status` is judged in the destination, so pulling a backlog task
  into the current release and starting it is one call. It takes no `--label`,
  `--link`, `--attach` or `--checklist`: on an existing task those change only
  through `task label`, `task link`, `task attachment` and `task checklist`.
- `--field key=value` sets a custom field the board declares (`customFields` in
  `boardown schema`); an empty value clears it.
- **Links** - `relates` (default, symmetric), `blocks` / `blocked-by`,
  `duplicates` / `duplicated-by`, `includes` / `part-of`. The type reads from
  `<id>`'s side (`--type blocks`: `<id>` blocks `<other-id>`) and is mirrored onto
  the other task as its inverse. On `task add`, `--link blocks=<id>` means the new
  task blocks `<id>`. `rm` without `--type` drops every relation between the pair.
- **Labels** - no whitespace, matched ignoring case; a label takes the spelling of
  the board's registry entry, and a new one is added to the registry.
- **Attachments** - kept in `.boardown/attachments/<id>/`, up to 25 MB each,
  never overwritten: a clashing name gets ` (1)`. `ls` gives each file's path from
  the project root.

Releases and epics:

```bash
boardown release list [--full]
boardown release get <ref> [--full]
boardown release add <name> [--description TEXT]            # a future release
boardown release edit <ref> [--name NAME] [--description TEXT]
boardown release start <ref>                                 # make it active
boardown release done <ref> [--into <ref>]                   # finish; open tasks go to the backlog, or into --into

boardown epic list [--full]
boardown epic get <slug> [--full]
boardown epic add <name> [--color "#rrggbb"] [--description TEXT]      # quote the color: an unquoted # starts a shell comment
boardown epic edit <slug> [--name NAME] [--description TEXT] [--color "#rrggbb"]
```

Other: `boardown init [--id-prefix PP] [--project-name NAME]`,
`boardown --version`. Global flags: `--data-dir <path to .boardown>` for a board
outside the working directory, `--json`.

`boardown skill install <agent>… [--global]` writes this page for `claude`,
`codex`, `opencode` or `agents` - into the project, or with `--global` under the
home directory. After the CLI is upgraded, run it again to bring this page up to
date with the new build.

`boardown schema` prints the contract of the installed build together with this
board's settings: statuses, enabled types, custom fields, the labels registry,
the WIP limit and which locks below are on. Use it when something here does not
match what the CLI does.

## Refusals

`STATUS_LOCKED`, `WIP_LIMIT`, `ARCHIVED` and `RELEASE_CONFLICT` are the board's
process locks, on by default or set by the user. Report such a refusal; do not
work around it by moving the task or touching the config. The other rows say what
to do.

| Code | When |
|---|---|
| `STATUS_LOCKED` | a status change on a task outside the current release, unless `statusOutsideActiveRelease`; a new task there can only take the first status |
| `WIP_LIMIT` | a task would enter a middle column of the current release that is already at the board's limit |
| `ARCHIVED` | any change in a finished release except its links - a task edited, added, moved in or out - unless `editFinishedReleases` |
| `RELEASE_CONFLICT` | `release start` on a release that is not `future`, or while another release is active unless `multipleActiveReleases` |
| `RELEASE_NOT_CURRENT` | `release done` on a release that is not active - check the ref |
| `CONFLICT` | a board file changed on disk while the command ran - re-run it |
| `UNREADABLE_FRONTMATTER` | a file holds a block the parser cannot read, and the CLI will not write it - tell the user |
| `VERSION_TOO_OLD` | the board needs a newer boardown - tell the user |

## Working rules

- `boardown` is installed system-wide and on `PATH`.
- Read a task with `boardown task get <id>` before editing it: `--title` and
  `--description` replace the whole text.
- Move statuses only on tasks the user asked you to work on. When the project
  defines its own flow - who sets which status - follow it. Without one, on the
  default statuses set `in-progress` when you start and `done` when the work is
  verified; on a board with its own statuses ask which one means started and which
  finished - position alone does not say it.
- A task outside the current release is `STATUS_LOCKED` unless the board lifts
  the lock. Pull it into the release together with its status only when the user
  asked for it there; otherwise report the lock.
- A new task goes to the backlog. Put it in a release only when the user names
  one.
- Titles and descriptions follow the language of the board's existing tasks;
  ids, statuses, types and epic slugs stay as they are.
- `task rm`, `task attachment rm` and `release done` are destructive - confirm
  with the user first.
- Task ids are assigned by boardown; never invent one.
- References in text become links in the board UI: a bare task id links to the
  task, `[[repo:<path from the project root>]]` to a project file, `[[<page>]]`
  to `.boardown/docs/<page>.md`.
