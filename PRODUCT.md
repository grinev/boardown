# boardown — Product Spec

A lightweight, local-first task board that lives **inside your project's git
repo**. Tasks are plain markdown files, so the board diffs naturally with the
rest of the codebase and needs no server, account, or sync service.

This document describes what boardown **is** — its domain model, storage
format, behaviour rules, and shells — plus the broad direction it is heading in.
It is not a plan: the actual backlog, releases and epics live on boardown's own
board in [`.boardown/`](./.boardown/), which is the single source of truth for
what is planned and what is done.

License: MIT.

## Overview

- **Target user:** solo developer who wants a simple scrum-style board next
  to their code, with version history coming for free from git.
- **Workflow:** a long-lived **Backlog**, plus one file per **Release**, plus
  one file per **Epic** for cross-release work. Releases follow a
  sprint-style lifecycle (`future → current → finished`). Tasks move between
  these via drag & drop.
- **Storage:** a `.boardown/` folder in the project root, containing a config
  file and three subfolders (`releases/`, `epics/`, `docs/`). Everything is
  committed to git as-is.
- **Distribution:** a **VS Code extension** (the canonical way to use boardown),
  a standalone **Electron desktop app** (Windows / macOS / Linux), and a headless
  **CLI** for agents and scripts, published to npm. A slim browser shell exists
  as a development tool for working on the UI from sources. See
  "Distribution & shells" below.

## Core concepts

### Task
A single unit of work. Fields:

| Field         | Type      | Notes                                                           |
|---------------|-----------|-----------------------------------------------------------------|
| `id`          | string    | `<prefix>-<n>`, e.g. `BD-1`. Stable, never changes.             |
| `title`       | string    | The H2 heading of the task section in the md file.              |
| `description` | string    | Plain text body below the frontmatter.                          |
| `type`        | string    | One of `bug`, `feature`, `docs`, `tech`. Required.              |
| `priority`    | string?   | One of `critical`, `high`, `medium`, `low`. **Optional**: an absent key means `medium`, so a task never has to carry one. Setting a priority — including setting it back to `medium` — writes the key and keeps it; nothing ever strips it. Existing boards are not backfilled. |
| `status`      | string    | One of the board's statuses — `todo`, `in-progress`, `done` unless `config.yaml` declares its own. Stored as written: any non-empty string loads, so a task written under a status the board has since dropped is shown rather than repaired. See "Statuses" under Configuration. |
| `epic`        | string?   | Slug of an epic file (without `.md`), or empty.                 |
| `order`       | integer   | Sort key, shared across statuses. Inside a release file: local to that release. Across all backlog containers (any `epics/<slug>.md` and `epics/no_epic.md`): **global** — the flat backlog list is ordered by `order` alone, independently of which file the task lives in. Step of 100 between peers; reorder renumbers all backlog files when two peers collide. Sorting is stable, so tasks sharing an `order` keep the order they were read in. |
| `checklist`   | array?    | Optional todo list of `{ id, text, done }` items. Purely informational — it never gates `status` and has no completion checks. Omitted entirely when empty. Shown as a `done/total` badge on the card and edited in the task dialog. |
| `notes`       | array?    | Optional list of `{ id, text, createdAt }` notes (lightweight comments). `createdAt` is an ISO 8601 timestamp; shown in chronological order (oldest first). Purely informational. Omitted entirely when empty. Shown as a count badge on the card and added/edited/deleted in the task dialog. |
| `links`       | array?    | Optional list of `{ type, to }` links to other tasks. `type` is one of seven relations — `relates` (symmetric) plus `blocks`/`blocked-by`, `duplicates`/`duplicated-by`, `includes`/`part-of` — and reads from the side holding the record; `to` is another task's id. A link is **mirrored**: both tasks carry a record pointing at each other, the other side carrying the relation's **inverse**. One pair may carry several relations at once. Omitted entirely when empty. Edited in the task dialog's "Linked tasks" section and via `boardown task link`. |
| *custom fields* | string?  | **Beta.** Any field declared in `config.yaml`'s `customFields` is stored as a **plain top-level key** here, alongside the built-ins (`reporter: alice`). Only fields with a value are written, always after every built-in key and in declaration order. See "Custom fields" under Configuration. |

Task types and priorities are a fixed set baked into the app: each type and each
priority has an icon and a color used for the badge on the card and as a filter
dimension. Statuses are the exception — a board may declare its own (see
"Statuses" under Configuration). Priority is a **label, never a sort key** — the order of
work stays `order` and the position of the block in the file, and nothing sorts,
groups or gates on priority.

### Release
A markdown file under `releases/`, e.g. `releases/1.10.md`. Holds tasks
planned for that release. The **filename** (without `.md`) is the release's
stable identifier — used to reference it from drag-and-drop and internal
links. The user never has to look at the filename directly: the **`name`**
field in frontmatter is what the UI shows everywhere ("1.0", "First public
beta", "Бета 🚀" — any string the OS allows in a filename).

At creation time, the slug/filename is derived from the name by:

1. replacing spaces, filesystem-forbidden characters (`< > : " / \ | ? *`)
   and control characters with `-`;
2. lowercasing the result (kebab-case, matching the `Epic` slug convention);
3. collapsing runs of dashes;
4. trimming dashes and dots at the edges.

Unicode and emoji are preserved (e.g. `Бета релиз 🚀` → `бета-релиз-🚀`,
`Beta Release` → `beta-release`). Windows-reserved names (`CON`, `PRN`,
`NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`) get a `_` suffix.

**The filename follows the name.** Renaming a release re-derives the slug by the
same rules and moves the file, so `name` and filename never drift apart. A name
that derives the slug the file already has (a case change, or a change only in
characters the rules strip) leaves the file where it is; a name whose slug is
taken by another release, or that has no character usable in a filename, is
refused and nothing is written. Since release lists are ordered by filename, a
renamed release re-sorts — it lands where its new name says it should.

Release lifecycle:

- **`future`** — planned ahead, not yet started. Multiple `future` releases
  may exist; the user moves tasks into them while planning.
- **`current`** — actively worked on; the app calls such a release **active**.
  One at a time by default; with `multipleActiveReleases` on, several. The Board
  view shows one of them as a kanban and a switcher picks which.
- **`finished`** — closed. Read-only. Lives in the Archive.

Transitions:

- **Start release** (`future → current`). Disallowed while another release is
  already active, unless `multipleActiveReleases` is on; the user is otherwise
  asked to finish that one first. The setting gates the start only: several
  releases already active render as several whatever it says, and turning it off
  never touches them.
- **Complete release** (`current → finished`). If any tasks are not `done`,
  a modal asks the user where to put them: another future release, or the
  Backlog (epic preserved).

Release frontmatter fields:

| Field         | Type    | Notes                                                  |
|---------------|---------|--------------------------------------------------------|
| `status`      | string  | `future` / `current` / `finished`.                     |
| `name`        | string  | Human-readable name shown everywhere in the UI. Required for new releases; legacy files without `name` fall back to the slug for display. |
| `description` | string? | Optional plain-text description.                        |
| `startDate`   | date?   | Optional.                                              |
| `endDate`     | date?   | Optional.                                              |

The slug lives in the filename only — there is no `release` (or `slug`)
key in frontmatter, mirroring the way `Epic` stores its slug.

### Epic
A markdown file under `epics/`, e.g. `epics/ui-foundation.md`. An epic groups
related tasks that may span multiple releases. Filename slug is the stable
identifier referenced from tasks via the `epic` field.

Each epic file is also the **storage container for that epic's unscheduled
tasks** — tasks that belong to the epic but are not (yet) assigned to a
release. When a task is moved into a release, it is physically relocated to
the release file; the `epic` field on the task preserves the link.

**Source of truth for `task.epic`.** Which epic a task belongs to is
determined by which file it physically lives in:

- A task inside `epics/<slug>.md` belongs to the `<slug>` epic. The
  `epic` field in the task's frontmatter is ignored on load and omitted on
  save — the filename is authoritative. Code that collects or groups tasks
  by epic must derive membership from the containing file for these tasks,
  never by filtering on the `epic` field.
- A task inside `epics/no_epic.md` has no epic. Any stray `epic` field is
  stripped on load.
- A task inside `releases/<slug>.md` keeps its epic association in the
  `epic` field of its frontmatter; that field is the only link, since
  release files mix tasks from different epics.

Changing a task's epic on a backlog task is therefore a **file move**,
not a frontmatter edit.

Epic frontmatter fields:

| Field         | Type    | Notes                                                  |
|---------------|---------|--------------------------------------------------------|
| `name`        | string  | Human-readable name, e.g. "UI Foundation".             |
| `color`       | string  | Hex color used for the epic badge on task cards.       |

The epic's optional **description** lives in the body of the file, between
the frontmatter and the first task — same shape as the `Release` preamble.

There is no separate Epics view in the UI — epics act as a filter dimension
on the Backlog screen, and have a dedicated edit modal listing their linked
tasks.

### Backlog
The conceptual collection of all unscheduled tasks. It includes:

- Tasks living in any `epics/<slug>.md` file (have an epic but no release).
- Tasks living in `epics/no_epic.md` (have neither an epic nor a release).

A single `epics/no_epic.md` file holds tasks without an epic, so that
"uncategorized" tasks have a single home rather than polluting `epics/` with
a synthetic placeholder. It sits next to the epic files for locality, but
the loader treats it as a special container (no `name`/`color`, tasks render
without an epic badge), not as an epic.

## Storage format

Everything lives under `.boardown/` at the project root:

```
<repo root>/
└── .boardown/
    ├── config.yaml
    ├── releases/
    │   ├── v0.1.md
    │   ├── 1.10.md
    │   └── 1.11.md
    ├── epics/
    │   ├── no_epic.md     # tasks without an epic and without a release
    │   ├── ui-foundation.md
    │   └── parser.md
    └── docs/              # the project wiki; folders nest to any depth
        ├── architecture.md
        └── guides/
            └── release-process.md
```

The shell chooses which `.boardown/` directory to open. The `config.yaml` file
stays inside that directory and is the marker that boardown is configured
there.

### Markdown file structure

Every release/epic/no_epic file holds an optional top-level frontmatter block
describing the container, followed by zero or more **task sections**. Each
task is an `## H2` heading, followed by its own frontmatter block, followed
by the description text.

Example `releases/1.10.md`:

```markdown
---
status: current
name: "1.10"
startDate: 2026-05-01
endDate: 2026-05-15
---

# Release 1.10

## Implement card drag & drop

---
id: BD-1
type: feature
status: in-progress
epic: ui-foundation
order: 100
checklist:
  - id: c1
    text: Wire up @dnd-kit sensors
    done: true
  - id: c2
    text: Persist new order to disk
    done: false
notes:
  - id: n1
    text: Keyboard reordering can reuse the same placeTask op.
    createdAt: "2026-05-02T09:30:00.000Z"
links:
  - type: relates
    to: BD-2
---

Allow tasks to be dragged between status columns and between releases.
Should also support keyboard reordering for accessibility.

## Frontmatter parser

---
id: BD-2
type: tech
status: done
epic: parser
order: 200
links:
  - type: relates
    to: BD-1
---

The description is plain text.
```

The H2 heading text is the task title.

**Block order in a file is insertion order and carries no meaning.** A task
section stays where it is for the life of the file: a new task is appended at the
end, a task moved in from another container is appended too, and no write ever
re-sorts the sections. `order` is what says where a task sits on the board, and
every reader sorts by it. This keeps an edit — a status change above all — a
change to a couple of lines inside one task's own frontmatter, so two git
branches touching different tasks in the same release merge cleanly. It also
means a file's sections are typically *not* in `order` order after a while, and
that is expected, not damage.

## Configuration

`.boardown/config.yaml`:

```yaml
idPrefix: BD          # task id prefix, e.g. BD -> BD-1, BD-2, ...
nextId: 47            # next id to hand out (verified against existing ids on startup)
projectName: My Board # required, human-readable name shown in the app header
theme: light          # optional, "light" or "dark"; defaults to "light" when absent
boardRelease: v0-8-0  # optional; slug of the active release the Board shows
wipLimits:            # optional; absent means no limit anywhere
  in-progress: 3      # at most 3 tasks in each middle column of an active release
multipleActiveReleases: true  # optional; absent means one release at a time
statuses:             # optional (beta); absent means todo / in-progress / done
  - key: backlog
    label: Not started  # optional; absent means the key, prettified
  - key: dev
  - key: shipped
```

`projectName` is required (set during onboarding) and read-only from the app's
point of view — it is shown in the header and edited by changing `config.yaml`
directly. `idPrefix` accepts 2–5 uppercase ASCII letters (`A–Z`). `theme` is
seeded at onboarding from the host's color theme when the shell provides one
(the VS Code shell maps the editor's light/dark theme); shells that don't pass a
default (e.g. the dev web shell) leave it absent, in which case it defaults to
`"light"`. After onboarding it is owned by the in-app theme switcher — the host
theme no longer influences it. Epic colors are user-defined per epic (see Epic
frontmatter above).

### Statuses

**Beta.** `statuses` declares the board's own status set, replacing
`todo` / `in-progress` / `done`. It is all-or-nothing: absent keeps the three
built-ins untouched, present replaces the whole set. Between 2 and 8 entries, each
a `key` plus an optional `label`; keys follow the `customFields` rule — start with
a letter, 1–40 letters, digits, `_` or `-` — and must be unique. An absent `label`
falls back to the key, prettified the way `in-progress` reads as "In progress"
today. Like `customFields`, it is edited in `config.yaml` only; there is no
management UI.

The meaning of a status is **positional**, with no flags and no reserved keys.
The **first** is the initial one: the status a new task takes, and the only status
a task may be *created* with outside an active release. (A task relocated out of one
keeps whatever status it had — nothing is rewritten.) The **last** is the terminal one: a
link to a task in it renders struck through, and completing a release counts
everything that is not in it as unfinished. Everything between is a **middle**
column, which is what the WIP limit caps.

Colours are positional too: the first column keeps the grey the `todo` pill has
today, the last the green of `done`, and the middles take a six-colour palette in
order, starting with today's blue — six, because eight statuses hold at most six
middles. Column headers on the Board stay uncoloured.

A status is only *set* to a value the board declares — the task dialog offers
nothing else, and the CLI answers `USAGE` naming the board's own list. A status
already **on disk** is a different matter: nothing is repaired or rewritten, so
editing the list under a live board leaves those tasks readable. On the Board they
gather in a single read-only **Unknown** column at the end, shown only while such
tasks exist in the release; it is not a drop target and nothing is reordered inside
it, but a card can be dragged out of it into a real column, and the task dialog's
status picker shows the raw key on its trigger while offering only declared
options. Elsewhere — the Backlog, an epic, the Archive — such a task shows its raw
status in a neutral pill, and the Backlog's status filter, which lists declared
statuses only, simply does not match it.

### WIP limit

`wipLimits` caps how many tasks may sit in **each middle column** of an
**active release**. The cap is counted per column and per release, so a board with
two middle columns and a limit of 3 allows three in each, and two active releases
allow three each again. It is a map keyed by status, but `in-progress` stays the
only key the schema accepts whatever the board's statuses are called — the number
under it is the board's one WIP limit — and a second entry makes the config invalid
rather than being silently ignored, exactly as an unsupported `customFields` type
does. The value is a positive integer; the key is absent by default, and absent
means no limit anywhere. A board with only two statuses has no middle column, so
the limit caps nothing.

The limit is a ceiling on **entering** the column, never a rule applied
retroactively. A board that is already over its limit — the number was lowered,
a release holding tasks in a middle column was started, or a file was hand-edited —
is valid: nothing is moved, nothing is rewritten, and the column header simply
reads `4 / 3`. What is refused is every operation that would put one more task
into a full column: a status change into it, and a relocation that carries a task
already in that column into that release. Leaving the column,
reordering inside it, and setting a task's status to the value it already has are
always allowed.

The rule lives in `@boardown/core` beside the `ARCHIVED` and `STATUS_LOCKED`
refusals, so every shell inherits it. Both of those take precedence: a task in a
finished release reports `ARCHIVED`, and one outside an active release reports
`STATUS_LOCKED`, before the limit is ever consulted.

On screen the rule is expressed by **prevention, not by complaint** — no toast,
no banner. Each middle column header shows `count / limit` and takes a warning tone
at or over it; while a drag that would breach the limit is running, every full
column (on the Board) and every active release whose column for the dragged card's
status is full (on the Backlog) are dimmed and refuse the drop. In the task dialog
each full middle status option and each such release option in the Release dropdown
are shown **disabled**,
carrying the count and a tooltip naming the rule. The limit is edited in the
Settings dialog, and in the Electron shell in its own settings popover. The
`multipleActiveReleases` checkbox sits directly below it on both surfaces, for the
same reason: it is board configuration, not installation configuration.

`nextId` is fast-path; on startup the app scans existing tasks and bumps it
to `max(existing) + 1` if it has fallen behind (e.g. someone authored tasks
by hand).

### Custom fields (beta)

**Status: beta.** This is the first slice of the "Customization" direction, and
it is deliberately narrow: one type (`string`), declaration by hand in
`config.yaml`, no management UI, and no filtering or display outside the task
dialog. Both the storage format and the CLI's `--field` flag are still open to
change before 1.0; a change here is a config edit for the user, not a migration
boardown performs.

A board can declare extra per-task fields in `config.yaml`. There is no UI for
declaring them — the list is edited by hand:

```yaml
customFields:
  - key: reporter       # the frontmatter key and the CLI's --field name
    label: Reporter     # optional; the key is shown when absent
    type: string        # the only type today
  - key: env
    type: string
```

`key` is 1–40 characters, starts with a letter and continues with letters,
digits, `_` or `-`; keys must be unique and may not collide with a built-in task
key (`id`, `type`, `priority`, `status`, `epic`, `order`, `checklist`, `notes`,
`links`),
since values are stored flat beside them. `type` must be `string` —
dates and lookup lists are later work, and the key exists so they can be added
without changing the format. Any violation makes the config **invalid**, which is
the existing all-or-nothing path: an error screen in the UI, `BOARD_INVALID` in
the CLI. An absent or empty `customFields` means the board has none, and nothing
about it changes anywhere.

Values live in the task's own frontmatter as plain top-level keys. Only fields
that have a value are written; clearing one removes its key. A top-level key no
declaration mentions is stripped on load like any unknown key — so **removing a
field from `customFields` drops its stored values the next time that file is
written**, with no warning. Git is the recovery path, as everywhere else in
boardown.

### Doc page

A markdown file under `docs/`, at any depth. Unlike a release or an epic it holds
no tasks — the whole body is the page's content. Its only frontmatter field is
`title`, and the whole block is optional:

| Field   | Type    | Notes                                                            |
|---------|---------|------------------------------------------------------------------|
| `title` | string? | Human-readable title shown in the tree. Absent ⇒ the filename slug is shown, and the first title edit writes a real `title`. |

The filename is derived from the title at creation with the same slug rules
releases use, and is stable thereafter — editing the title never moves the file.
A derived filename that collides with an existing page gets a numeric suffix, so
creating a second "Setup" yields `setup-2.md` rather than overwriting.

Folders under `docs/` are real entities the user creates and deletes; an empty
one is valid and stays listed. A file that is not markdown is ignored by the tree
and left untouched on disk.

## Behaviour rules

### Lenient parsing

- A broken file does not block other files.
- A broken task does not block other tasks in the same file.
- Problems are surfaced in a banner at the top of the app.
- The app **never** rewrites a file it could not fully parse without an
  explicit user confirmation.

### Conflict handling

Before writing, the app re-stat's the file and compares `lastModified`
against what it had when the data was last loaded. If the file changed
externally, the write is refused and the user gets a modal offering to
**Reload**. That modal takes over the screen: any dialog open when the write was
refused is closed, so the only thing on offer is Reload — the refused change was
not written, and reloading is the only way on.

No automated backups — git is the safety net.

## "Create board" flow

Whenever `.boardown/config.yaml` is missing — whether the folder is brand-new,
empty, or has releases/epics but no config — `@boardown/ui` shows an onboarding
modal that collects `projectName` and `idPrefix` and writes
`.boardown/config.yaml` via the `FsAdapter`. The modal is not dismissable — the
board cannot load without a config — and `nextId` starts at `1`. Shells do not
seed a config or a starter release and do not fall back to defaults; they only
provide a working `FsAdapter` (the web dev shell additionally ensures the board
root directory exists). An invalid `config.yaml` (present but not parseable or
not matching the schema) shows a dedicated error screen — no silent fallback, no
auto-rewrite.

After onboarding the board starts empty (no releases), opened on the Backlog
tab; the user creates the first release themselves. `epics/no_epic.md` is
likewise not seeded — it is created lazily on the first task that has neither an
epic nor a release.

## UI

The app is divided into four top-level views, presented as tabs in the top
navigation: **Backlog**, **Board**, **Archive**, **Docs**.

### Task search

A search field sits in the top navigation immediately after the **Docs** tab, so
it is on screen whichever tab is open. Like the whole top bar — the tabs and the
Create / Reload / Settings controls opposite it — it appears once the board is
loaded: the onboarding, loading and invalid-config screens carry no bar and so no
search field.

From **three characters** (after trimming) a dropdown lists the matching tasks
under the field. A query is matched case-insensitively as a plain substring
against a task's **id, title and description** — notes, checklist items and custom
field values are not searched — over **every** task on the board, the archive
included. Results are ordered in three tiers: a task whose id *is* the query,
then the tasks matched on id or title, then the tasks matched on the description
alone; inside a tier the board's reading order applies (active releases, future
releases, the unscheduled backlog, then finished releases). At most **ten** rows
are shown and nothing says when more matched — the user narrows the query
instead. A row carries the type icon, the id and the title, and no more; an
archived task is not marked out. The dropdown starts at the field's left edge and
at its width, but grows with the longest row well past it, up to a cap; a title
longer still is clipped with an ellipsis. While the field holds anything, a
clear button sits at its right end.

Clicking a row — or highlighting it with ↑/↓ and pressing Enter — opens the task
details dialog over the current tab, read-only when the task sits in a finished
release. Search is a direct entry point, so the dialog starts an empty back stack
and shows no back button (see "Dialog back stack"). Escape closes the dropdown
and an outside click closes it; either way the query stays in the field, so
closing the dialog leaves the same result set one focus away — the clear button
is how it goes. Nothing about the query is persisted, and searching writes
nothing.

The CLI's nearest equivalent is `task list --text`, which shares the same
matching rule but deliberately differs in three ways: it does not search the id,
and it has neither the minimum length nor the result cap (see "CLI").

### Backlog

A vertical, Jira-style stack of collapsible sections (top to bottom):

1. **Active releases** — one section per active release, oldest first by
   filename, each with its tasks listed flat and its own "Complete release"
   button on the section header, which completes that release.
2. **Future releases** — one section per `future` release. Each shows a
   "Start release" button, which is hidden while another release is active
   unless `multipleActiveReleases` is on.
3. **Backlog** — all tasks with no release: tasks from `epics/*.md` and from
   `epics/no_epic.md`, rendered as a flat list with epic badges (no nested
   grouping), ordered globally by `order` across all backlog containers.

A compact filter bar sits at the very top of the screen with four
single-select dropdowns, each labelled (`status`, `type`, `epic`, `priority`)
above the control so the controls themselves stay narrow. The default value of
every filter is "All" — nothing is filtered out. Because an absent `priority` key
means `medium`, filtering by `Medium` returns both the tasks that say so and the
tasks that say nothing. There is no reset button:
switching a filter back to "All" is the reset. When any filter is non-default,
each section's count pill switches from `5` to `1 of 5` (matching of total).
The filter applies **globally** to all three sections. The `epic` filter
additionally has a "No epic" option for tasks that live in `epics/no_epic.md`.

Drag and drop:

- Tasks can be dragged between any two sections; the file location of the
  task changes accordingly.
- Reordering within a section updates the `order` field. Reorder only changes
  `order` — `status` and `epic` are not touched by DnD on the Backlog screen.

### Board

A kanban with one column per board status — `todo`, `in-progress`, `done` unless
the board declares its own, plus a trailing read-only `Unknown` column while the
release holds a task whose status is not declared — showing
**one active release's tasks**. Drag & drop between columns updates the
task's status; reordering within a column updates `order`. Each column header
carries a count; when the board declares a WIP limit each middle column header shows
`count / limit` instead and the column stops accepting drops once it is full (see
"WIP limit" under Configuration).

The heading above the columns is the release's name, clickable to open the
release editor. While more than one release is active, a switch-release button
beside the name opens a list of them and marks the one on screen; picking one
stores it in `config.yaml` under `boardRelease`, so every shell opens on the same
release and a reload keeps it. The stored release is resolved on every read: once
it stops being active the Board falls back to the first active release, and the
key is left as the user wrote it. With one active release there is no button and
the header is exactly what it always was. When the release has a description, it follows the name on the
same line in a muted style, clipped to a single line with an ellipsis (newlines
collapsed to spaces). This preview is Board-only — the Backlog and Archive
section headers show the name alone.

If no release is active, the Board shows an empty state pointing the user to
start one from Backlog.

### Archive

The same layout as Backlog, but populated only with `finished` releases
(newest first). No Backlog section, no current section, no filter bar. All
releases are collapsed by default. The archive is **read-only** — tasks cannot
be dragged out. Task and epic cards are still clickable and open the editor.

### Docs

A project wiki over `.boardown/docs/`, and the only place in the app that renders
markdown. The screen is split: a **page tree** on the left, the selected page's
**content** filling the rest.

The tree shows folders as collapsible nodes and pages as selectable rows, folders
first and then alphabetically at each level, nested to any depth. Empty folders
are listed. The pane header carries **New folder** and **New page** buttons; both
create inside the *current folder* — the selected folder, the folder holding the
selected page, or the docs root when nothing is selected — and each opens a small
dialog naming that target. Hovering a page or folder row reveals a trash button.
Deleting asks for confirmation. **Only an empty folder can be deleted** — the
trash on a folder that still holds anything is disabled, so a deletion can never
take content the user did not see; empty its pages and subfolders first. There is
no moving or renaming: a page's location is fixed once created.

The content area renders the page's markdown (GFM: tables, strikethrough, task
lists). Raw HTML embedded in a page is **not** rendered — it shows as text, so a
page can never inject markup. A **pencil** button in the top-right corner switches
to edit mode: the title becomes a text input and the body a plain textarea holding
the raw markdown — no toolbar, no live preview. The pencil becomes a **check**;
pressing it commits both fields in one write and returns to the rendered view.
There is no Save or Cancel button, matching the rest of the app; an emptied title
reverts. A draft lives only in the view, so switching tabs mid-edit writes nothing.

A page's body renders the same in-app references the task dialogs do (see "Task
links" below): a `[[page]]` token links to another doc page, a task ID opens that
task's dialog over the Docs tab, and a `[[repo:…]]` token opens a project file in
the read-only popup over the Docs tab — a direct entry point, so that popup starts
an empty back stack and shows no back button. Tokens inside inline code or a
fenced block stay literal, so a page can document the syntax itself. The editor's
textarea offers the same `[[` autocomplete, for doc pages only.

Beyond those text references, docs are not connected to tasks, epics or releases —
nothing is stored on either side, there are no backlinks, and the CLI has no docs
commands.

### Task card

Each card shows: type icon (with type color), task ID, priority glyph (with the
priority color, directly after the ID), title, epic badge (with the epic's color
and name), and badges for a non-empty checklist (`done/total`) and notes (count).
The status is **not** rendered on the card in Backlog/Archive — it is implicit
from the column on Board.

The Backlog and Archive rows carry the same two glyphs, but the priority one sits
**last in the row**, after the status pill. The epic dialog's task table and the
Linked tasks section show no priority.

### Task editor

**Creation** uses a dedicated modal dialog:

- **Title** — required.
- **Type** — required, one of `bug`, `feature`, `docs`, `tech`.
- **Priority** — one of `Critical`, `High`, `Medium`, `Low`, preselected
  `Medium`. Left at `Medium` the task is created with no `priority` key at all.
- **Epic** — optional. Dropdown over existing epics; blank = no epic.
- **Description** — plain text.

When created from a section's `+ Create`, the task is placed in that section;
the section determines storage location. The Create menu in the top navigation
additionally lets the user pick a release (finished releases excluded); with no
release the task lands in the backlog — in the chosen epic's file, or
`no_epic.md` when no epic is selected. The same dialog opens from the epic
dialog's task list (see "Epic editor"), there with the epic locked.

**Editing** happens **inline inside the task details dialog** (Jira-style):
hovering a field highlights it, clicking turns it into an input/textarea
focused with the cursor; changes save on blur or Enter (Cmd/Ctrl+Enter for
the multiline description) and revert on Escape. **Title** and
**description** are inline-editable as text fields; **status**, **type**,
**priority**, **epic**, and **release** are inline-editable via a dropdown that
opens on click — or, from the keyboard, on Enter, Space or an arrow key — and
commits on selection (Escape / outside-click cancels). The
**Priority** row sits directly after **Type**; picking the level the file already
carries writes nothing, but picking `Medium` on a task that has no `priority` key
does write one, since that is an explicit set rather than a repeat. The
epic badge stays clickable to navigate to the epic — the surrounding row
opens the dropdown, and a "—" option clears the epic. Changing release
moves the task between containers (release-to-release, release-to-epic
when "—" is chosen, epic-to-release); the "—" option only appears when
the task has an epic to fall back to. A **finished** release is never
offered as a destination — the same exclusion the creation dialog applies.

**Every one of these pickers is fully keyboard-driven**, and they all behave the
same — the five in the task dialog, the three in the create-task dialog, the four
in the backlog's filter bar and the relation selector of the add-link row. Enter,
Space or an arrow key on the closed control opens it with the **current value
highlighted**; ↑ and ↓ move the highlight by one option and wrap at either end,
scrolling it into view in a list too long to show at once; Home and End jump to
the first and last; an option the board refuses is stepped over and cannot be
picked. Enter commits the highlighted option and Escape closes the list without
committing — leaving the dialog around it open — and both put focus back on the
control. Tab closes the list without committing and moves focus on. Hovering an
option moves the same highlight, so Enter always takes what is lit. Typing a
letter does nothing: these lists have no type-ahead.

**A status only changes in an active release.** Outside one — a **future**
release, an epic file, the backlog — the status renders as the archived task's
static pill, with a tooltip saying so, and nothing else about the task becomes
read-only. Relocation carries the status along and never rewrites it to the initial
one, so a task that was `in-progress` freezes as `in-progress` wherever it lands.

**Every multi-line field is as tall as the text inside it.** It starts at its own
minimum — four rows for a description, two for the "Add a note" composer — and
grows and shrinks a line at a time as the text does, back down to that minimum;
a paste sizes it in one step. Height is never something the user sets and never
something the app remembers: there is no resize grip on any of these fields, and
the height is recomputed from the text every time, before and after a save. The
two kinds of field differ in where they stop. A **composer** — the Description of
the three creation dialogs, and "Add a note" — grows while its dialog can still
grow and fit on the screen, then stops and scrolls inside itself, so a taller
window lets it grow further and a shorter one stops it sooner. An **editor** that
replaces a rendered block — the Description of the task, epic and release dialogs,
and an existing note — has no such ceiling: it opens at least as tall as the block
it replaced and grows with the whole text, with the dialog body scrolling around
it exactly as it does when that text is merely rendered. Entering edit mode
therefore moves nothing on screen. The Docs page editor is the one multi-line
field outside this: it fills its pane and scrolls inside itself.

Below Type / Epic / Release, the Details card lists the board's **custom
fields** (see "Custom fields" under Configuration) — one row per declared field,
in declaration order, labelled by the declaration's `label` or its `key`. Each is
an inline-editable single-line text field, left **blank** when unset — the row is
still there and still clickable, it just shows nothing. A value too long to sit
beside its label moves to the line below and takes the card's full width,
wrapping from there. The label stays level with the value's first line, including
while the editor is open. A value's task-ID, `[[…]]` and `[[repo:…]]` tokens render
as links in view mode, exactly as they do in the description (see "Task links",
"Doc links" and "Repo file links"), and typing `[[` while editing offers the same
doc-page suggestions.
Custom fields appear in the task dialog only: not on
the task card, not in the backlog row, not in the filter bar, and not in the
creation dialog — a new task starts with none and is filled in afterwards.

**A task in a finished release opens read-only**, wherever the dialog is opened
from. Every value is still shown — and every way to change one is gone rather
than disabled-looking: title, description, checklist item text and note text
render as plain text; status, type, priority and release render as plain values
instead of dropdowns; the epic renders as its badge, still clickable to navigate to the
epic; custom field values render as text, with their links still clickable.
Checklist checkboxes are disabled, the add-item row and the note composer
are absent, and the per-item trash buttons do not appear. Linked tasks are
frozen and the `…` menu's `Delete` item is disabled, as described below. An
archived file is never rewritten, so there is nothing to fail: the operations
`@boardown/core` would refuse are simply not reachable.

**Deletion.** The task dialog's header carries a `…` menu next to the close button
with a single `Delete` action. It opens a confirmation modal on top of the dialog;
confirming removes the task's section from its file permanently (no undo, no trash —
git is the safety net) and closes both modals. Deleting a task also strips the
mirrored `links` records the other tasks hold pointing at it, so nothing dangling is
left on disk — except on a task in a **finished** release, whose file is never
rewritten: that record survives and simply resolves to nothing. A task in a finished
release cannot be deleted at all: its menu still opens, with the `Delete` item
disabled.

**Task links.** Any token shaped like a task ID (2–5 uppercase letters, a dash,
digits) that resolves to a task on the board renders, in view mode, as a link
showing `ID title`; clicking it opens that task's dialog. Resolution is against
the task IDs actually present on the board, not against the current `idPrefix`, so
tasks created under an older prefix stay linkable. A reference whose target is
`done` renders **struck through** — accent colour and underline unchanged, still
clickable — so a page of references shows at a glance what is already finished.
This is purely a rendering rule and applies wherever such a reference is expanded:
the plain-text fields (task description, custom-field values, notes, epic and
release descriptions) and the markdown bodies (a Docs page, the doc popup). The
task dialog's "Linked tasks" section is not affected — its rows carry a status pill
already.

**Doc links.** A `[[…]]` token holding a doc page's path relative to `docs/`
without the `.md` extension (e.g. `[[guides/release-process]]`) renders as a link
showing the page's title with a page icon. Clicking it **inside a dialog** (task,
epic or release) opens the page in a read-only **popup** — the page's title and
its rendered body, no docs tree, the same width as the task and epic dialogs. Only
one dialog is on screen at a time, so the popup takes over from the dialog it was
opened from — which goes onto the dialog back stack (see "Dialog back stack").
The popup carries a **View in docs** button in its top-right that switches to the
Docs tab and selects the page (the full editing surface). A link clicked **inside
a doc page's body in the Docs tab** navigates to that page in place, as before.
Inside the popup, a `[[…]]` link swaps the popup to the linked page and a task-ID
reference swaps in that task's dialog. A leading `docs/` and a
trailing `.md` are tolerated, since that is what a hand-typed reference tends to
look like; matching is otherwise case-sensitive. Nothing is stored: the text on
disk stays exactly what the user typed, and the link is a rendering affordance,
not a data format.

**Repo file links.** A `[[repo:…]]` token holding a path relative to the **project
folder** — the directory that contains `.boardown/` — renders as a link showing the
**file name only** (`[[repo:packages/cli/src/node-fs.ts]]` → `node-fs.ts`) with a
file icon. The `repo:` prefix is what tells the two kinds apart; a colon cannot
occur in a filename, so a doc page can never be mistaken for a file. A leading `/`
or `./` is stripped and a backslash is read as a separator, since an agent writes
both; a path with a `..` segment, a drive letter or a UNC prefix is not a
reference at all and stays plain text.

Unlike a doc token, a repo token is **never resolved before it renders** — the
project is not indexed — so it is always a link, and the target is inspected on
click. Clicking one opens a read-only **popup** showing the file: rendered
markdown for a `.md` file, plain monospaced text with the original line breaks for
any other text file, and one of `Unsupported file format` (not a text file),
`File not found`, `File is too large to preview` (about 1 MB) or `Could not read
file` (a directory, a permission error, a path outside the project folder)
instead of content. The popup's heading is the file name with the
project-relative path beneath it; there is no **View in docs** button, since a
repo file has no page in the Docs tab. **References inside a previewed file are
not linkified** — a task id in a code comment or a `[[…]]` in a CHANGELOG stays
literal, because the file belongs to the repo, not to the board. Nothing is
stored, nothing is cached, and nothing is ever written: reopening the link re-reads
the file. There is **no autocomplete** for repo file tokens — `[[` suggests doc
pages only.

Reading a project file is the shells' one capability that reaches outside
`.boardown/`. It is read-only, scoped to the project folder, and separate from the
`FsAdapter` every board write goes through; the CLI has no part in it, printing
raw text as it does for doc links.

All three kinds render in the task's **description** and **notes** (task dialog), the
**epic's description** (epic dialog), the **release's description** (release
dialog), a **doc page's body** (Docs tab) and a **custom field's value** (task
dialog) — the one single-line field that renders links, since it is the natural
place to point at the task or the page this one came from. Tokens that resolve to
nothing stay plain text, and edit mode always shows the raw source. The task
title, checklist items and cards render no links: those texts also show on the
task card and in the backlog row, where nothing is linkified.

**Inserting a doc link.** In any of those fields, typing `[[` opens a suggestion
list of doc pages, filtered by title and path as the user keeps typing. ↑/↓ move,
Enter, Tab or a click inserts the page's token and closes the brackets — while the
list is open Tab accepts rather than moving focus — and Escape
dismisses the list without leaving edit mode. There is no autocomplete for task
IDs — those are short enough to type — and none in the single-line fields that
render no links.

The **Description** field of the three creation dialogs — task, epic and release —
offers the same list, even though a creation dialog renders nothing: the text it
writes is the text that renders links once saved. There is no edit mode to leave
there, so Escape with the list open dismisses the list and leaves the dialog open
with the form intact; a second Escape closes the dialog as usual.

**Linked tasks.** Above the notes, the task dialog has a **Linked tasks** section:
the tasks this one is related to (type icon, id, title, status — the same columns
as the epic dialog's task list), grouped under a sub-heading per relation. A `+`
button at the right end of the section heading opens the add row — a relation
selector, preselected to "relates to", beside a search field; typing part of
another task's id or title lists the matches, and picking one creates the link with
the selected relation, read from this task's side. Hovering a row reveals a trash
button that breaks that one relation, leaving any other relation the pair carries.
An existing link's relation is not editable in place — as in Jira, the way to change
one is to break the link and make it again.

The add row is driven from the keyboard as well as the mouse. The match list opens
with **nothing highlighted**: the first ↓ lights the first row and the first ↑ the
last, from there the arrows wrap through the ends, and Enter links the row that is
lit — with nothing lit, the first match. Hovering a row lights the same highlight
the arrows move, so Enter always takes the row on screen. Any re-filter — a
keystroke or a change of relation — puts the highlight back to nothing. Tab
dismisses the list and moves focus on without linking anything. **Escape, with the caret in the search field, reads the
screen**: with a list showing it dismisses the list and keeps what was typed, with
no list showing it leaves the add row and clears it, and only with no add row does
it close the task dialog. Anywhere else — including the relation selector's own
list — Escape belongs to whatever holds the caret, and with the add row open but
unfocused it closes the dialog; a dismissed list comes back on the next keystroke.
Picking a row, or leaving the add row by Escape, puts focus back on the `+` button
that opened it. "No matching tasks" is not a row that can be picked.

There are **seven relations**: `relates`, which is symmetric and is its own
inverse, plus three directed pairs — `blocks` / "is blocked by", `duplicates` /
"is duplicated by", `includes` / "is part of". Each side of a pair is a type of its
own whose inverse is the other side, so a record written as `blocks` is mirrored
onto the other task as `blocked-by` and reads there as "is blocked by". The set is
baked into the app; `config.yaml` says nothing about it. Group order in the dialog
is fixed and independent of the file: blocks · is blocked by · includes · is part
of · duplicates · is duplicated by · relates to, with the rows inside a group in
file order. A sub-heading is always shown, including when every link is `relates` —
it is the only place a row's relation is stated, and on a task in a finished release
the trash is gone too.

A link is stored on **both** tasks (mirrored). Rendering is lenient: a task shows
the union of its own records and the records pointing at it, deduplicated, so a
half-written link (a hand-edited file) is still visible and still removable. A
link whose target is not on the board is hidden in the UI and never auto-removed
from disk. Tasks in a finished release cannot be linked or unlinked (that would
rewrite an archived file): they show their links read-only, and they do not appear
in the search results. Adding or removing a link rewrites two files, and the
conflict guard checks both before writing either — an external change aborts the
whole operation instead of leaving one side linked.

### Epic editor

**Creation** uses a dedicated modal dialog with:

- **Name** — required, human-readable, at most 28 characters — the length that
  still fits on one line inside an epic badge on a board card. The field stops
  accepting characters there, and a longer paste is cut to fit rather than
  refused.
- **Slug** — auto-generated from the name (lowercase kebab-case), same
  derivation as releases. Stable thereafter (renaming is a manual file move).
- **Description** — optional, plain text.
- **Color** — required, picked from a fixed palette; used for the epic badge
  on cards.

**Editing** happens inline inside the epic details dialog, same UX as the task
editor: **name** and **description** (the file preamble) are inline-editable.
Above the description, a **color** swatch opens the creation dialog's palette in
its place, with Save and Cancel — the only way to change the color in the UI, so
the palette stays the whole vocabulary.
The epic's slug never changes through editing — renaming the underlying file is
a manual operation outside this UI. The name is bounded on the way in only: an
epic file already carrying a longer name loads and shows exactly as before, and
nothing rewrites it to fit. Wherever a name is too long for the space it is
given — the badge on a board card, on a backlog or archive row, on the task
dialog's Epic chip, the epic dialog's own header, and every epic picker — it
renders on one line, clipped with an ellipsis. Editing such a name opens it
complete — nothing is cut from the value — in a field sized for a name of the
maximum length, so an over-long one scrolls inside it while characters are
deleted, and the editor refuses to save until it is short enough.

Clicking an existing epic opens the details dialog with the list of linked tasks
displayed below the description. Tasks in the list are clickable and open the
task details dialog. A `+` button at the right end of that list's heading — the
same shape as the one on the task dialog's "Linked tasks" heading — opens the
creation dialog stacked over the epic dialog, with the **epic fixed** to this one
(the chooser is shown disabled, the way a locked release is) and the release still
freely selectable. The epic dialog stays open behind it and its list gains the new
task.

### Release editor

A release has no creation dialog beyond "Create release"; its details live in a
**release dialog** opened by clicking the release's name wherever it is shown —
the Board heading, a Backlog release section header, an Archive section header.
The dialog shows three things: the **name**, the **status** (`future` /
`current` / `finished`) as a read-only pill, and the **description**. Name and
description are inline-editable with the same semantics as the task and epic
dialogs and are written to the release file's frontmatter; clearing the
description removes the key. Editing the name also **moves the file** to the slug
that name derives (see "Release" above) — silently, with no confirmation step. A
save the rename makes impossible — the slug is taken, or the name has nothing
usable in a filename — is refused with a message under the name field in the
header, and nothing is written.

Status is not editable here: it is owned by the Start / Complete release actions.
A **finished** release opens the same dialog read-only — an archived file is
never rewritten. Dates (`startDate` / `endDate`) are not shown or edited yet.

### Dialog back stack

The five detail dialogs — **task**, **epic**, **release**, the read-only
**document popup** and the read-only **repo file popup** — are densely
cross-linked: a task leads to its epic, to a linked task, to a task-ID, `[[…]]` or
`[[repo:…]]` reference in its description or notes; an epic leads to any of its
tasks; a document popup leads to another page, to a task or to a project file.
Exactly one dialog is ever on screen, but navigating between them keeps a
**history stack**: the dialog you left is remembered rather than discarded.

A dialog reached from another one carries a **back** button — an icon-only
control with a revert-style arrow — on the **left of its header**, directly after
the dialog's icon and title; the top-right group holds the dialog's own actions
and the close button, as it does on a dialog with nothing to go back to. In the
repo file popup, whose header stacks the file name over its path, the button sits
beside the **name**. Pressing it
shows the previous dialog, re-read from the board's current state so any edit
made in between is visible; pressing it repeatedly walks the whole chain back. A
dialog opened directly from a board card, a backlog row, a release name or the
docs tab starts an empty stack and shows no back button. There is **no** forward
navigation, no breadcrumb, and no way to jump more than one step.

Closing a dialog outright — the close button, Escape or a click on the backdrop —
discards the whole stack, as does following **View in docs** out to the Docs tab
and deleting the open task. An entry whose entity has since disappeared is
silently skipped on the way back; if none of them resolves, the dialog simply
closes. A repo file entry is never skipped — a project file lives outside the
board, so there is nothing to check it against without touching disk, and a file
that has since gone says so in the popup. The nested modals (creating a task from
an epic, the delete confirmation) are not part of the stack — they close back to
their parent on their own.

### Creation dialogs

The three **creation dialogs** — Create task, Create epic, Create release — share
four things beyond their shape. They are as wide as the **task dialog's main
column**, so the Description a task is written in is exactly the width of the one
it is later read in; the sidebar's share is not counted, and a window too narrow
for that falls back to the same viewport rule every dialog uses. Opening one puts
the caret in its **first field** — Title, or Name — rather than on the close
button; the field is empty, so the caret simply sits in it, and a locked Epic or
Release never takes it. And **Cmd/Ctrl+Enter submits** from any focus position in
the dialog, including the Description, where a plain Enter still inserts a
newline, and including the Cancel button and the close ✕. It writes exactly what
the Create button writes, and refuses exactly what the Create button refuses: with
an empty name, or one colliding with an existing file, it does nothing and the
dialog stays open with everything typed. A popup keeps the key while it is up —
an open picker, or the `[[…]]` page list, takes the combo for itself, and the next
one submits. Nothing on screen announces the shortcut.

And a form with something in it is not thrown away by accident. While any field
differs from what it held when the dialog opened — a Title or Name or Description
with text in it, a Type, Priority, Epic, Release or colour moved off the value it
started on — **Escape and a click on the backdrop** open a **Discard changes?**
confirmation over the dialog instead of closing it: one line, `What you typed will
be lost.`, and a `Cancel` / `Discard` pair. `Cancel`, the confirmation's own ✕,
Escape and its backdrop all return to the form with everything still typed;
`Discard` closes both and writes nothing, and the dialog reopens empty. A locked
Epic or Release never counts, since the user cannot move it, and neither does the
colour Create epic picked for itself. The dialog's own ✕ and its Cancel button
close outright whether or not anything was typed, and a form still holding what it
opened with closes on Escape and the backdrop as it always did. A popup keeps
Escape the same way it keeps the submit combo: the first one dismisses the picker
or the `[[…]]` list, the next one is the one that asks. The edit dialogs and the
inline editors do not ask.

Docs → New page, Docs → New folder and the onboarding dialog also open with the
caret in their first field. They keep their own width, and the shortcut is the
three creation dialogs' alone.

### Settings

A dialog opened from the gear button in the top navigation. It holds the board's
**Theme** selector; below it a **WIP limit (In Progress)** number field, empty
meaning no limit (see "WIP limit" under Configuration); below that an **Allow
multiple active releases** checkbox, the dialog's first boolean control, saved the
moment it is clicked; below that a read-only **CLI** row; and last a read-only **Version** row showing the version of the build
the user is running — the shell supplies it, so it is the installed extension's
version in VS Code and the checkout's version in the `web` dev shell.

The **CLI** row exists because the command-line shell is otherwise undiscoverable
from inside the app: a user who installed the extension has no way to learn it
exists. It states what the CLI is for — letting AI agents work with the board —
followed by a **Learn more** link to its documentation, which opens outside the
app; below that sits the install command (`npm i -g @grinev/boardown-cli`) as
selectable text with a copy button at its right edge, which confirms the copy by
swapping to a checkmark. It is deliberately static — it does **not** detect whether the
CLI is installed. Running `boardown --version` from a shell host is unreliable in
ways the product cannot fix (a GUI launch on macOS truncates `PATH`, npm's Windows
shim needs a shell to resolve, Snap/Flatpak and remote hosts see a different
filesystem), and a false "not installed" reads as a bug.

The Electron shell hides this dialog (it owns the theme app-wide) and surfaces the
version through the OS-native About window instead. Its own settings popover
carries the WIP limit field and the multiple-active-releases checkbox in the
**Board** section below the auto-refresh checkbox, since they belong to the
board's `config.yaml` rather than to the installation, and ends with a **CLI** section holding the same command and link —
which, unlike the two board settings, shows with no board open.

### Empty states

Empty states are a first-class concern. Every screen has a meaningful
message and a clear next action when its content is absent (no active
release, no future releases, no archived releases, no tasks under filter).

## Distribution & shells

The product is delivered as a React app (`@boardown/ui`) embedded in
platform-specific shells. Each shell decides how the user gets to a working
folder and provides an `FsAdapter` to read/write files there.

### VS Code extension

The canonical way to use boardown. The extension reads `.boardown/` from the
single open workspace folder — no folder picker is needed, VS Code already
provides the workspace concept. A fresh project is initialized through the
onboarding modal, which writes `config.yaml` on submit. The host watches the
board directory and pushes a refresh on external changes (git, the CLI, another
editor), gated by the `boardown.autoRefresh` setting. Published to the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=grinev.boardown)
and [Open VSX](https://open-vsx.org/extension/grinev/boardown).

### Electron desktop app

A standalone cross-platform desktop app (Windows / macOS / Linux). It reuses
`@boardown/ui` unchanged behind a Node `FsAdapter` and follows the standard
IDE-class pattern: a recent-folders list on launch, an "Open Folder…" button
using the OS native dialog, and an optional CLI argument for opening a specific
folder. It auto-refreshes on external changes like the VS Code shell. The app
menu carries **About boardown** (under Help on Windows/Linux, in the system
application menu on macOS), which opens the OS-native About window with the app's
version. Links behave the way a desktop app's do: clicking an `http(s)` link in
rendered markdown — a doc page, a doc popup, a previewed repo file — opens the
OS default browser, and the application window itself never navigates away from
the board. Any other scheme is inert; the window is governed by an allowlist, so
markdown the board did not author (a previewed repo file) cannot talk it into
loading something else. Installers
are attached to each GitHub Release. Builds are currently unsigned —
code-signing / notarization are a separate round.

### CLI

A headless shell that does not mount `@boardown/ui` — it consumes
`@boardown/core` directly and implements `FsAdapter` over Node's filesystem.
It finds the board by walking up from the working directory to a `.boardown/`
folder (or via `--data-dir`), and maps commands onto board operations
(`backlog`, `archive`, `init`, `task`, `release`, `epic`, `schema`).

Its output follows the way the UI is read — **a view, then one task**. The three
UI tabs are three commands: `release current` is the Board, `backlog` is the
Backlog tab (active releases, future releases, then the unscheduled tasks) and
`archive` is the Archive. Any task appearing in a list is rendered as a **task
summary** — the fields the task card carries (id, title, type, priority, status,
epic, checklist `done/total`, notes count) — while `task get` returns the whole
task. `priority` in a summary is always populated: a task with no key on disk
reports the default, so a caller never has to know about the unset case.
A single `--full` flag takes any listing command one level deeper. Mutating
commands do not echo the entity back: they acknowledge with the identifier of
what changed. **Priority** rides on the commands that already exist: `task add`
and `task edit` take `--priority`, `task list` filters by it (matching the
resolved value, so `--priority medium` also returns tasks with no key), and
`schema` reports the vocabulary and the default so an agent reads them instead of
guessing. `task list --text <substr>` is the CLI's **search**: the same
case-insensitive substring the app's search field uses, shared from
`@boardown/core` so the two cannot drift. It differs from the field on purpose,
though. It matches a task's **title and description only** — never the id, since
every id carries the board's prefix and `--text bd` would return the whole board,
and `task get <id>` is the id lookup. And being a filter rather than a picker it
carries neither the field's three-character minimum nor its ten-result cap: it
returns every task it matches, in the usual listing order. An empty `--text` is
no filter at all. `task link ls` is a link listing rather than a task summary, and carries
no priority. Task links are managed
with `task link add|rm|ls`. Both `add` and `rm` take an optional `--type`, read
from `<id>`'s side — `--type blocks` means "`<id>` blocks `<other-id>`" — and
default to `relates` on `add`. `add` is idempotent per relation, and a pair may
accumulate several. `rm --type` clears that one relation on both sides; `rm`
without it clears **every** relation between the pair, which is what the call
written before relations existed already meant. Changing a relation is `rm` then
`add` — there is no subcommand for it. `ls` lists the linked tasks with the
relation read from the side asked, flagging a link whose target is no longer on
the board as missing. `release edit <ref>` sets a release's `--name` / `--description`, mirroring the
release dialog: a new name moves the file to the slug it derives (the payload's
`slug` is how a caller learns it moved) and a finished release is refused with
`ARCHIVED`. `epic edit <slug>` sets an epic's `--name` / `--description` /
`--color`; unlike the UI's palette-only picker it accepts any 6-digit hex, and an
invalid one is a `USAGE` error. `epic add` and `epic edit --name` enforce the same
name rule the UI's field does: a name over the maximum is refused with
`EPIC_INVALID` and nothing is written, as is an `epic edit --name ""`. A missing
name on `epic add` stays the `USAGE` error it has always been — the argument is
absent rather than wrong. `schema` reports the maximum as `epicNameMaxLength`,
always, for the same reason it reports the rules below. A status the board does not
declare is a `USAGE` error naming the board's own list, at every site that takes one
— `task status`, `task add --status`, `task edit --status` and `task list --status`
— and `schema` reports `taskStatuses` so an agent reads the vocabulary up front;
`task add` without `--status` uses the board's initial status. Setting a status
outside an active release fails with `STATUS_LOCKED`; a relocation that carries the
status along succeeds, and one that sets it is judged by its destination. Putting one
more task into a full middle column fails with `WIP_LIMIT` — whether by
`task status`, `task edit --status`, `task add --status`, or a `task edit --release`
that pulls a task already in that column into a full active release — and `schema`
reports the board's `wipLimits` exactly as the config file holds it, plus
`wipLimitedStatuses` naming the columns that number caps, so an agent reads the
ceiling and its reach instead of discovering them by failing. It also reports
`multipleActiveReleases` always, resolved to a boolean: absent from the config
means the one-at-a-time rule is in force, so leaving it out would hide a rule an
agent would then have to discover by being refused. `task rm <id>` deletes a task with the same rules
as the UI (mirrored links cleaned up, archived files untouched, a task in a
finished release refused) and, being agent-facing, without any confirmation
prompt. It is aimed primarily at
**agents and scripts**: output is a stable JSON envelope when stdout is not a TTY
(or with `--json`), with stable error codes and exit codes, plus a `schema`
command that prints the contract. **Custom fields** ride on the commands that
already exist: `task add` and `task edit` take a repeatable
`--field <key>=<value>` (an empty value clears the field, an undeclared key is a
`USAGE` error), `task get` returns the task's values, and `schema` lists the
board's declarations so an agent learns which keys it may write. Run outside a
board, `schema` prints its static contract without that list rather than failing.
Task summaries carry no custom fields — they mirror the task card, which shows
none — while `--full`, which returns whole tasks, carries them like every other
field. Because every change is a plain-markdown git
diff, an agent's edits stay reviewable and revertible. Published to npm as
[`@grinev/boardown-cli`](https://www.npmjs.com/package/@grinev/boardown-cli)
(the `boardown` command).

### Browser (`packages/web`)

A slim Vite app that mounts `@boardown/ui` over a small Vite middleware exposing
a local `.boardown/` over HTTP. Without arguments it opens the repo's own
`.boardown/`; from sources it can also open another data directory with
`pnpm dev -- --data-dir /path/to/project/.boardown`. **This is a development and
local-from-sources shell**, not a distribution channel: there is no folder picker
and no File System Access API. Refresh is the manual **Reload** button only — no
file watching.

The package carries a second role next to that dev shell: **`boardown-web`, a
local server** that serves the same UI, built, over the same endpoints. It is
installed from a tarball packed on the machine that runs it — nothing is
published to a registry, so this is still not a distribution channel. It binds
the loopback interface and nothing else, prints the address it listens on, and
refuses a request whose `Host` or `Origin` names anything but `127.0.0.1`,
`localhost` or `[::1]`.

It serves either one board or several. With no flag it serves the **default
registry**: the file where this shell keeps the projects of the machine it runs
on — `%APPDATA%\boardown-web\projects.yaml` on Windows,
`~/Library/Application Support/boardown-web/projects.yaml` on macOS, and
`${XDG_CONFIG_HOME:-~/.config}/boardown-web/projects.yaml` elsewhere. It is a
server started once from a shortcut, where the directory it happened to start in
means nothing, so the source of a board is the machine's own list rather than the
current folder. `--data-dir` serves one named `.boardown/` folder at `/`, and
`--registry <file>` serves another registry file the same way the default one is
served; the two flags name different things and passing both is refused. Every
registry, default or named, is the same YAML file — every project under its own
`/b/<id>/`, with `/` listing them:

```yaml
projects:
  boardown: D:/Projects/AI/boardown
  shop: D:/Projects/work/shop
```

The key is the id in the URL — lowercase letters, digits and dashes — and the
value is an absolute path to the **project** folder, whose board is the
`.boardown/` inside it. Each project's display name on the list page comes from
its own `config.yaml`; a project whose board cannot be read keeps its row and
carries the reason instead — `no board yet`, `config.yaml is invalid`,
`folder not found`, `could not be read` — so one bad entry never costs the
others. A file that does not parse, has no `projects` key, or carries an id that
is not a URL segment is invalid configuration and refuses the start, naming the
reason and the path. The file is
re-read when it changes: a project added to it appears without a restart, and one
removed from it stops being served at once. A re-read that fails leaves the last
mapping that worked in place and says so on the list page; a file that never
loaded has no mapping to keep, so the page carries the reason alone. Refresh is the manual
**Reload** button here too, and the server creates nothing on disk — a registered
folder with no board opens onboarding, like any other empty board.

The two registries differ in one thing only: what an **absent** file means. A
`--registry` path that names nothing is a mistake in the argument and refuses the
start. The default file is this shell's own state and starts out not existing, so
the server starts on it, `/` lists no projects, and neither the folder nor the
file is created — they are written the first time a project is added. A default
file that exists but cannot be read is not absence, and refuses the start like any
other invalid one. The startup lines name the registry's absolute path either way,
so which file was opened never has to be guessed.

The **dev shell** is also the only thing in the project that writes a **log
file** — `boardown-web` installs no log destination, like every other shell a
user runs. Each `pnpm dev` /
`pnpm dev:sandbox` run opens a fresh `logs/web-<timestamp>.log` at the repo root
(gitignored), holding both the dev server's own events and the log lines the
browser-side app forwards to it, so a crash a tester hits can be handed to a
developer as a file. At the default `info` level it carries the trail needed to
reconstruct a session: each action the user triggered with its arguments, each
write to the board, and every failure on either side. `BOARDOWN_LOG_LEVEL=debug`
adds individual reads, lists and stats. The folder keeps the 10 most recent runs. This is a debugging tool
for working on boardown from sources: the shipped shells install no log
destination, so a user of the extension, the desktop app or the CLI gets no logs
and no `logs/` folder.

## Direction

Broad strokes only. The concrete backlog lives on boardown's own board in
[`.boardown/`](./.boardown/) — read that for what is actually planned next.

- **Richer task model** — labels with label filters, assignee, per-task
  last-updated date.
- **Customization** — user-defined task types instead of the fixed set baked in
  today, alongside the user-defined statuses that already ship.
- **Fuller release management** — editing a release's dates, reordering releases
  in the Backlog, and support for multiple simultaneously active releases (e.g. a
  large release in flight plus an urgent hotfix).
- **Richer docs** — moving and renaming pages, and search across the wiki.
- **Git integration** — surfacing the commits related to a task on the task
  itself, closing the loop between the board and the repo it lives in.
- **Localization** — i18n infrastructure and translations of the UI.
- **Website** — a landing page on GitHub Pages.
