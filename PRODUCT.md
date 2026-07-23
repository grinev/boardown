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
| `status`      | string    | One of `todo`, `in-progress`, `done`.                           |
| `epic`        | string?   | Slug of an epic file (without `.md`), or empty.                 |
| `order`       | integer   | Sort key, shared across statuses. Inside a release file: local to that release. Across all backlog containers (any `epics/<slug>.md` and `epics/no_epic.md`): **global** — the flat backlog list is ordered by `order` alone, independently of which file the task lives in. Step of 100 between peers; reorder renumbers all backlog files when two peers collide. |
| `checklist`   | array?    | Optional todo list of `{ id, text, done }` items. Purely informational — it never gates `status` and has no completion checks. Omitted entirely when empty. Shown as a `done/total` badge on the card and edited in the task dialog. |
| `notes`       | array?    | Optional list of `{ id, text, createdAt }` notes (lightweight comments). `createdAt` is an ISO 8601 timestamp; shown in chronological order (oldest first). Purely informational. Omitted entirely when empty. Shown as a count badge on the card and added/edited/deleted in the task dialog. |
| `links`       | array?    | Optional list of `{ type, to }` links to other tasks. `type` is currently always `relates` (symmetric); `to` is another task's id. A link is **mirrored**: both tasks carry a record pointing at each other. Omitted entirely when empty. Edited in the task dialog's "Linked tasks" section and via `boardown task link`. |

Task statuses and types are currently a fixed set baked into the app: each type
has an icon and a color used for the badge on the card and as a filter dimension.

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
`NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`) get a `_` suffix. After creation, the
slug never changes — renaming is a manual file move.

Release lifecycle:

- **`future`** — planned ahead, not yet started. Multiple `future` releases
  may exist; the user moves tasks into them while planning.
- **`current`** — actively worked on. **Exactly one** release at a time may
  be `current`. The Board view shows this release as a kanban.
- **`finished`** — closed. Read-only. Lives in the Archive.

Transitions:

- **Start release** (`future → current`). Disallowed if another release is
  already `current`; the user is asked to finish that one first.
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

## Configuration

`.boardown/config.yaml`:

```yaml
idPrefix: BD          # task id prefix, e.g. BD -> BD-1, BD-2, ...
nextId: 47            # next id to hand out (verified against existing ids on startup)
projectName: My Board # required, human-readable name shown in the app header
theme: light          # optional, "light" or "dark"; defaults to "light" when absent
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

`nextId` is fast-path; on startup the app scans existing tasks and bumps it
to `max(existing) + 1` if it has fallen behind (e.g. someone authored tasks
by hand).

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
**Reload**.

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

### Backlog

A vertical, Jira-style stack of collapsible sections (top to bottom):

1. **Current release** (if any) — its tasks listed flat, with a
   "Complete release" button on the section header.
2. **Future releases** — one section per `future` release. Each shows a
   "Start release" button (enabled only when no other release is currently
   `current`).
3. **Backlog** — all tasks with no release: tasks from `epics/*.md` and from
   `epics/no_epic.md`, rendered as a flat list with epic badges (no nested
   grouping), ordered globally by `order` across all backlog containers.

A compact filter bar sits at the very top of the screen with three
single-select dropdowns, each labelled (`status`, `type`, `epic`) above the
control so the controls themselves stay narrow. The default value of every
filter is "All" — nothing is filtered out. There is no reset button:
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

A kanban with the three status columns (`todo`, `in-progress`, `done`), showing
**only the current release's tasks**. Drag & drop between columns updates the
task's status; reordering within a column updates `order`.

The heading above the columns is the release's name, clickable to open the
release editor. When the release has a description, it follows the name on the
same line in a muted style, clipped to a single line with an ellipsis (newlines
collapsed to spaces). This preview is Board-only — the Backlog and Archive
section headers show the name alone.

If no release is currently `current`, the Board shows an empty state pointing
the user to start one from Backlog.

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
links" below): a `[[page]]` token links to another doc page, and a task ID opens
that task's dialog over the Docs tab. Tokens inside inline code or a fenced block
stay literal, so a page can document the syntax itself. The editor's textarea
offers the same `[[` autocomplete.

Beyond those text references, docs are not connected to tasks, epics or releases —
nothing is stored on either side, there are no backlinks, and the CLI has no docs
commands.

### Task card

Each card shows: type icon (with type color), task ID, title, epic badge
(with the epic's color and name), and badges for a non-empty checklist
(`done/total`) and notes (count). The status is **not** rendered on the card
in Backlog/Archive — it is implicit from the column on Board.

### Task editor

**Creation** uses a dedicated modal dialog:

- **Title** — required.
- **Type** — required, one of `bug`, `feature`, `docs`, `tech`.
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
**epic**, and **release** are inline-editable via a dropdown that opens
on click and commits on selection (Escape / outside-click cancels). The
epic badge stays clickable to navigate to the epic — the surrounding row
opens the dropdown, and a "—" option clears the epic. Changing release
moves the task between containers (release-to-release, release-to-epic
when "—" is chosen, epic-to-release); the "—" option only appears when
the task has an epic to fall back to. A **finished** release is never
offered as a destination — the same exclusion the creation dialog applies.

**A task in a finished release opens read-only**, wherever the dialog is opened
from. Every value is still shown — and every way to change one is gone rather
than disabled-looking: title, description, checklist item text and note text
render as plain text; status, type and release render as plain values instead of
dropdowns; the epic renders as its badge, still clickable to navigate to the
epic. Checklist checkboxes are disabled, the add-item row and the note composer
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
tasks created under an older prefix stay linkable.

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

Both kinds render in the task's **description** and **notes** (task dialog), the
**epic's description** (epic dialog), the **release's description** (release
dialog) and a **doc page's body** (Docs tab). Tokens that resolve to nothing stay
plain text, and edit mode always shows the raw source. Checklist items and cards
render no links.

**Inserting a doc link.** In any of those multiline fields, typing `[[` opens a
suggestion list of doc pages, filtered by title and path as the user keeps typing.
↑/↓ move, Enter or a click inserts the page's token and closes the brackets,
Escape dismisses the list without leaving edit mode. There is no autocomplete for
task IDs — those are short enough to type — and none in single-line fields, which
render no links.

**Linked tasks.** Above the notes, the task dialog has a **Linked tasks** section:
a table of the tasks this one is related to (type icon, id, title, status — the
same columns as the epic dialog's task list). A `+` button at the right end of the
section heading opens a search field; typing part of another task's id or title
lists the matches, and picking one creates the link. Hovering a row reveals a
trash button that breaks the link. Only one link
type exists — `relates`, which is symmetric — so the user never picks one; the
stored record carries a type, and each type declares its inverse, so an asymmetric
type (e.g. `blocks` / "is blocked by") can be added later without a redesign.

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

- **Name** — required, human-readable.
- **Slug** — auto-generated from the name (lowercase kebab-case), same
  derivation as releases. Stable thereafter (renaming is a manual file move).
- **Description** — optional, plain text.
- **Color** — required, picked from a fixed palette; used for the epic badge
  on cards.

**Editing** happens inline inside the epic details dialog, same UX as the task
editor: **name** and **description** (the file preamble) are inline-editable.
The epic's slug never changes through editing — renaming the underlying file is
a manual operation outside this UI.

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
description removes the key. Editing the name never touches the filename — the
slug stays the release's stable identifier, so renaming the file is still a
manual operation.

Status is not editable here: it is owned by the Start / Complete release actions.
A **finished** release opens the same dialog read-only — an archived file is
never rewritten. Dates (`startDate` / `endDate`) are not shown or edited yet.

### Dialog back stack

The four detail dialogs — **task**, **epic**, **release** and the read-only
**document popup** — are densely cross-linked: a task leads to its epic, to a
linked task, to a task-ID or `[[…]]` reference in its description or notes; an
epic leads to any of its tasks; a document popup leads to another page or to a
task. Exactly one dialog is ever on screen, but navigating between them keeps a
**history stack**: the dialog you left is remembered rather than discarded.

A dialog reached from another one carries a **back** button — an icon-only
control with a revert-style arrow — as the first item of its header's top-right
action group, before the dialog's own actions and the close button. Pressing it
shows the previous dialog, re-read from the board's current state so any edit
made in between is visible; pressing it repeatedly walks the whole chain back. A
dialog opened directly from a board card, a backlog row, a release name or the
docs tab starts an empty stack and shows no back button. There is **no** forward
navigation, no breadcrumb, and no way to jump more than one step.

Closing a dialog outright — the close button, Escape or a click on the backdrop —
discards the whole stack, as does following **View in docs** out to the Docs tab
and deleting the open task. An entry whose entity has since disappeared is
silently skipped on the way back; if none of them resolves, the dialog simply
closes. The nested modals (creating a task from an epic, the delete confirmation)
are not part of the stack — they close back to their parent on their own.

### Settings

A dialog opened from the gear button in the top navigation. It holds the board's
**Theme** selector and, below it, a read-only **Version** row showing the version of the
build the user is running — the shell supplies it, so it is the installed
extension's version in VS Code and the checkout's version in the `web` dev shell.
The Electron shell hides this dialog (it owns the theme app-wide) and surfaces
the version through the OS-native About window instead.

### Empty states

Empty states are a first-class concern. Every screen has a meaningful
message and a clear next action when its content is absent (no current
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
version. Installers
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
Backlog tab (current release, future releases, then the unscheduled tasks) and
`archive` is the Archive. Any task appearing in a list is rendered as a **task
summary** — the fields the task card carries (id, title, type, status, epic,
checklist `done/total`, notes count) — while `task get` returns the whole task.
A single `--full` flag takes any listing command one level deeper. Mutating
commands do not echo the entity back: they acknowledge with the identifier of
what changed. Task links are managed
with `task link add|rm|ls`: `add` is idempotent, `rm` clears both mirrored
records, and `ls` lists the linked tasks, flagging a link whose target is no
longer on the board as missing. `release edit <ref>` sets a release's `--name` / `--description`, mirroring the
release dialog: the filename never changes and a finished release is refused with
`ARCHIVED`. `task rm <id>` deletes a task with the same rules
as the UI (mirrored links cleaned up, archived files untouched, a task in a
finished release refused) and, being agent-facing, without any confirmation
prompt. It is aimed primarily at
**agents and scripts**: output is a stable JSON envelope when stdout is not a TTY
(or with `--json`), with stable error codes and exit codes, plus a `schema`
command that prints the contract. Because every change is a plain-markdown git
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

It is also the only shell that writes a **log file**. Each `pnpm dev` /
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
- **Customization** — user-defined task statuses and task types instead of the
  fixed sets baked in today.
- **Fuller release management** — editing a release's dates, reordering releases
  in the Backlog, and support for multiple simultaneously active releases (e.g. a
  large release in flight plus an urgent hotfix).
- **Richer docs** — moving and renaming pages, and search across the wiki.
- **Git integration** — surfacing the commits related to a task on the task
  itself, closing the loop between the board and the repo it lives in.
- **Localization** — i18n infrastructure and translations of the UI.
- **Website** — a landing page on GitHub Pages.
