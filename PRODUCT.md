# boardown — Product Spec

A lightweight, local-first task board that lives **inside your project's git
repo**. Tasks are plain markdown files, so the board diffs naturally with the
rest of the codebase and needs no server, account, or sync service.

License: MIT.

## Overview

- **Target user:** solo developer who wants a simple scrum-style board next
  to their code, with version history coming for free from git.
- **Workflow:** a long-lived **Backlog**, plus one file per **Release**, plus
  one file per **Epic** for cross-release work. Releases follow a
  sprint-style lifecycle (`future → current → finished`). Tasks move between
  these via drag & drop.
- **Storage:** a `.boardown/` folder in the project root, containing a config
  file, a backlog file, and two subfolders (`releases/`, `epics/`).
  Everything is committed to git as-is.
- **Distribution:** the primary MVP target is a **VS Code extension** that
  reads `.boardown/` from the open workspace. A slim browser shell exists as
  a development tool for working on the UI from sources. An Electron build
  is post-MVP. See "Distribution & shells" below.

## Core concepts

### Task
A single unit of work. Fields:

| Field         | Type      | Notes                                                           |
|---------------|-----------|-----------------------------------------------------------------|
| `id`          | string    | `<prefix>-<n>`, e.g. `BD-1`. Stable, never changes.             |
| `title`       | string    | The H2 heading of the task section in the md file.              |
| `description` | string    | Plain text body below the frontmatter. No markdown formatting in MVP. |
| `type`        | string    | One of `bug`, `feature`, `docs`, `tech`. Required.              |
| `status`      | string    | One of `todo`, `in-progress`, `done`. Hardcoded set.            |
| `epic`        | string?   | Slug of an epic file (without `.md`), or empty.                 |
| `order`       | integer   | Sort key, shared across statuses. Inside a release file: local to that release. Across all backlog containers (any `epics/<slug>.md` and `epics/no_epic.md`): **global** — the flat backlog list is ordered by `order` alone, independently of which file the task lives in. Step of 100 between peers; reorder renumbers all backlog files when two peers collide. |
| `checklist`   | array?    | Optional todo list of `{ id, text, done }` items. Purely informational — it never gates `status` and has no completion checks. Omitted entirely when empty. Shown as a `done/total` badge on the card and edited in the task dialog. |
| `notes`       | array?    | Optional list of `{ id, text, createdAt }` notes (lightweight comments). `createdAt` is an ISO 8601 timestamp; shown in chronological order (oldest first). Purely informational. Omitted entirely when empty. Shown as a count badge on the card and added/edited/deleted in the task dialog. |

Task types are **hardcoded** in the MVP — no per-project customization.
Each type has a fixed icon and color baked into the app, used for the badge
on the task card and as a filter dimension.

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
2. lowercasing the result (kebab-case, matching the planned `Epic` slug
   convention);
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
- **`finished`** — closed. Read-only by default. Lives in the Archive.

Transitions:

- **Start release** (`future → current`). Disallowed if another release is
  already `current`; the user is asked to finish that one first.
- **Complete release** (`current → finished`). If any tasks are not `done`,
  a modal asks the user where to put each unfinished task: another future
  release, the Backlog (with a chosen epic, or none), or leave it in the
  finished release as a record of what did not ship.

Release frontmatter fields:

| Field         | Type    | Notes                                                  |
|---------------|---------|--------------------------------------------------------|
| `status`      | string  | `future` / `current` / `finished`.                     |
| `name`        | string  | Human-readable name shown everywhere in the UI. Required for new releases; legacy files without `name` fall back to the slug for display. |
| `description` | string? | Optional plain-text description, no markdown in MVP.   |
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
the frontmatter and the first task — same shape as `Release` preamble.
Plain text in MVP, no markdown rendering.

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

By default, everything lives under `.boardown/` at the project root:

```
<repo root>/
└── .boardown/
    ├── config.yaml
    ├── releases/
    │   ├── v0.1.md
    │   ├── 1.10.md
    │   └── 1.11.md
    └── epics/
        ├── no_epic.md     # tasks without an epic and without a release
        ├── ui-foundation.md
        └── parser.md
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
---

Plain-text description, no markdown formatting in MVP.
```

Notes:

- The H2 heading text is the task title.
- The exact disambiguation between H2-as-task and H2-inside-description is
  an implementation detail to nail down when building the parser.

## Configuration

`.boardown/config.yaml`:

```yaml
idPrefix: BD          # task id prefix, e.g. BD -> BD-1, BD-2, ...
nextId: 47            # next id to hand out (verified against existing ids on startup)
projectName: My Board # required, human-readable name shown in the app header
theme: light          # optional, "light" or "dark"; defaults to "light" when absent
```

That is the entire MVP config. The `projectName` field is required (set during
onboarding) and read-only from the app's point of view (edit `config.yaml`
directly); it is shown in the header. The `idPrefix` field accepts 2–5 uppercase
ASCII letters (`A–Z`). The `theme` field is seeded at onboarding from the host's
color theme when the shell provides one (the VS Code shell maps the editor's
light/dark theme); shells that don't pass a default (e.g. the dev web shell)
leave it absent, in which case it defaults to `"light"`. After onboarding it is
owned by the in-app theme switcher — the host theme no longer influences it.
Statuses, status colors, and task types are **hardcoded** in the
app; customizing them is post-MVP. Epic colors are user-defined per epic (see
Epic frontmatter above).

`nextId` is fast-path; on startup the app scans existing tasks and bumps it
to `max(existing) + 1` if it has fallen behind (e.g. someone authored tasks
by hand).

If `config.yaml` is missing, the app shows an onboarding modal that asks for
`projectName` and `idPrefix`, then writes the file on submit (including the
host-provided theme, if any); the rest of the load continues normally. An invalid `config.yaml` (present but not parseable
or not matching the schema) shows a dedicated error screen — no silent
fallback, no auto-rewrite.

## Distribution & shells

The product is delivered as a React app (`@boardown/ui`) embedded in
platform-specific shells. Each shell decides how the user gets to a working
folder and provides an `FsAdapter` to read/write files there.

### VS Code extension (primary MVP target)

The extension reads `.boardown/` from the user's open workspace. No folder
picker is needed: VS Code already provides the workspace concept. If the
workspace contains multiple folders with `.boardown/`, the user picks via a
QuickPick. If none exists, an explicit "Initialize boardown here" command
creates the default structure.

This is the canonical way to use boardown.

### Browser (`packages/web`)

A slim Vite app that mounts `@boardown/ui` over a small Vite middleware
exposing a local `.boardown/` over HTTP. Without arguments it opens the repo's
own `.boardown/`; from sources it can also open another data directory with
`pnpm dev -- --data-dir /path/to/project/.boardown`. **This is a development
and local-from-sources shell**, useful inside VS Code's built-in browser panel,
but it is not a production browser distribution channel for the MVP — there is
no folder picker, no File System Access API integration. Both are explicit
non-goals for the MVP and may or may not be added later.

Refresh strategy: a manual **Reload** button in the UI is the only way to
re-read files. There is no automatic refresh (no focus/visibility reload, no
file watching) — see "Out of scope".

### Electron (post-MVP)

When it lands, it will follow the standard pattern of an IDE-class desktop
app: a recent-folders list on launch, an "Open Folder…" menu using the OS
native dialog, and an optional CLI argument for opening a specific folder.
Out of scope for the MVP.

### CLI (post-MVP)

A headless shell that does not mount `@boardown/ui` — it consumes
`@boardown/core` directly and implements `FsAdapter` over Node's filesystem.
It finds the board by walking up from the working directory to a `.boardown/`
folder (or via `--data-dir`), and maps commands onto board operations
(`board`, `task`, `release`, `epic`, `init`). It is aimed primarily at **agents
and scripts**: output is a stable JSON envelope when stdout is not a TTY (or
with `--json`), with stable error codes and exit codes, plus a `schema` command
that prints the contract. Because every change is a plain-markdown git diff, an
agent's edits stay reviewable and revertible. Out of scope for the MVP.

## Lenient parsing

- A broken file does not block other files.
- A broken task does not block other tasks in the same file.
- Problems are surfaced in a top banner and rendered as gray "problem cards"
  on the board.
- The app **never** rewrites a file it could not fully parse without an
  explicit user confirmation.

## Conflict handling

Before writing, the app re-stat's the file and compares `lastModified`
against what it had when the data was last loaded. If the file changed
externally, the user gets a modal: **Reload** (drop my edits) or **Overwrite**
(drop external edits).

No automated backups — git is the safety net.

## UI

The app is divided into three top-level views, presented as tabs in the top
navigation, each showing a counter (`Backlog (15)`, `Board (5/12)`,
`Archive (4)`).

### Backlog

A vertical, Jira-style stack of collapsible sections (top to bottom):

1. **Current release** (if any) — its tasks listed flat, with a
   "Complete release" button on the section header.
2. **Future releases** — one section per `future` release. Each shows a
   "Start release" button (enabled only when no other release is currently
   `current`).
3. **Backlog** — all tasks with no release: tasks from `epics/*.md` and from
   `epics/no_epic.md`, rendered as a flat list with epic badges (no nested
   grouping).

A compact filter bar sits at the very top of the screen with three
single-select dropdowns, each labelled (`status`, `type`, `epic`) above the
control so the controls themselves stay narrow. The default value of every
filter is "All" — nothing is filtered out. There is no reset button:
switching a filter back to "All" is the reset. When any filter is non-default,
each section's count pill switches from `5` to `1 of 5` (matching of total).
The filter applies **globally** to all three sections.

The `epic` filter additionally has a "No epic" option for tasks that live in
`epics/no_epic.md`. A search dimension may join the bar later.

Drag and drop:

- Tasks can be dragged between any two sections; the file location of the
  task changes accordingly.
- Reordering within a section updates the `order` field.

### Board

A kanban with the three hardcoded status columns (`todo`, `in-progress`,
`done`), showing **only the current release's tasks**. Drag & drop between
columns updates the task's status; reordering within a column updates `order`.

If no release is currently `current`, the Board shows an empty state pointing
the user to start one from Backlog.

### Archive

The same layout as Backlog, but populated only with `finished` releases
(newest first). No Backlog section, no current section, no filter bar. All
releases are collapsed by default. The archive is **read-only** — tasks
cannot be dragged out. Task and epic cards are still clickable and open the
editor. An explicit "reopen task" action that lifts a task back to
current/Backlog is post-MVP.

### Task card

Each card shows: type icon (with type color), task ID, title, epic badge
(with the epic's color and name). The status is **not** rendered on the
card in Backlog/Archive — it is implicit from the column on Board.

### Task editor

**Creation** uses a dedicated modal dialog with all required fields:

- **Title** — required.
- **Type** — required, one of `bug`, `feature`, `docs`, `tech`.
- **Epic** — optional. Dropdown over existing epics; blank = no epic.
- **Description** — plain text in MVP. No markdown formatting, no preview.

When created, the task is placed in the section the user invoked `+ Create`
from; the section determines storage location.

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
the task has an epic to fall back to.

### Epic editor

**Creation** uses a dedicated modal dialog (planned) with:

- **Name** — required, human-readable.
- **Slug** — auto-generated from name (lowercase kebab-case); user can
  override at creation time. Stable thereafter (renaming is a manual file
  move).
- **Description** — optional, plain text.
- **Color** — required (hex), used for the epic badge on cards.

**Editing** happens inline inside the epic details dialog, same UX as
the task editor. Currently only **name** and **description** (the file
preamble) are inline-editable; **color** stays editable through a future
control. The epic's slug never changes through editing — renaming the
underlying file is a manual operation outside this UI.

Clicking an existing epic in the filter panel opens the details dialog with
the list of linked tasks displayed below the description. Tasks in the
list are clickable and open the task details dialog. **Delete epic** is
allowed only if the epic has no tasks; otherwise the user is asked to move
them to another epic first.

### Empty states

Empty states are a first-class concern. Every screen has a meaningful
message and a clear next action when its content is absent (no current
release, no future releases, no archived releases, no tasks under filter).

## "Create board" flow

Whenever `.boardown/config.yaml` is missing — whether the folder is brand-new,
empty, or has releases/epics but no config — `@boardown/ui` shows an onboarding
modal that collects `projectName` and `idPrefix` and writes
`.boardown/config.yaml` via the `FsAdapter`. The modal is not dismissable — the
board cannot load without a config — and `nextId` starts at `1`. Shells do not
seed a config or a starter release and do not fall back to defaults; they only
provide a working `FsAdapter` (the web dev shell additionally ensures the board
root directory exists). After onboarding the board starts empty (no releases),
opened on the Backlog tab; the user creates the first release themselves.
`epics/no_epic.md` is likewise not seeded — it is created lazily on the first
task that has neither an epic nor a release.

## Out of scope (for now)

- Automatic refresh in the **web** dev shell: no file watching, no
  focus/visibility reload — re-reading there is always the manual **Reload**
  button. (The VS Code and Electron shells *do* auto-refresh on external
  `.boardown/` changes via a host file watcher, gated by a setting; that
  landed after the initial MVP cut.)
- Customizable statuses and status colors (hardcoded in MVP).
- Customizable task types.
- Markdown formatting inside task descriptions (plain text only).
- Search / global "list view" across all tasks including finished.
- Reports, charts, statistics, burndown.
- Tags / labels, sub-tasks, due dates per task, priority, time tracking,
  comments, attachments, assignees.
- Author / owner field on tasks. Add when a multi-user mode lands.
- Reopening tasks from the archive (manual reopen flow).
- UI editor for `config.yaml` (edit the file directly).
- Archiving / hiding old finished releases on a separate screen.
- Undo / redo history (git is the history).
- Real-time sync, server, multi-user collaboration beyond what git itself
  provides.
- File System Access API in the browser shell — the browser shell stays
  dev-only.
- Firefox / Safari support, hosted version, mobile.
- AI features of any kind.
- Electron build is a deferred *implementation* — the product spec covers it,
  but no Electron code lands in MVP. (The VS Code extension, by contrast, is
  the primary MVP shell — see its roadmap section above.)
- Folder selection / multiple boards in one shell — the VS Code extension always
  uses the single open workspace folder's `.boardown/` (separate windows already
  scope independently). Choosing among several roots in one window, or an
  arbitrary folder picker, belongs to the Electron desktop build. Future
  direction, not in MVP.
- "Git-managed team task tracker" deployment (web as a deployable artifact
  with a fixed folder, multi-user via git as the sync layer) — interesting
  future direction, not in scope for v1.
- Multiple simultaneously-`current` releases with a Board release switcher
  (à la Jira's multiple active sprints) — e.g. a large release in flight plus
  an urgent hotfix release. Useful, but it removes the one-`current`-at-a-time
  invariant that simplifies the Board view, the Backlog "current release"
  section, the tab counters, and the `startRelease`/`completeRelease` core
  ops. Revisit post-MVP once the base single-release flow is proven.

## MVP roadmap

High-level only — each item will get its own planning round before
implementation. The build order is bottom-up: `packages/core` (pure logic),
then `packages/ui` (the React app, platform-agnostic), then `packages/web`
(the dev shell that wires `ui` to a local `.boardown/` over a Vite
middleware).

The split between `ui` and `web` exists so the same React app can later be
embedded in a VS Code extension or an Electron build by swapping only the
shell — `ui` accepts an `FsAdapter` and never imports DOM-only APIs.

### Bootstrap

- [x] Initialise pnpm workspace, base `tsconfig`, lint/format tooling
- [x] Set up `packages/core` and `packages/web` with build/test scripts
- [x] Add `packages/ui` (React, no DOM-only APIs) with build/test scripts;
      slim `packages/web` down to a shell that mounts `@boardown/ui`

### `packages/core`

- [x] Zod schemas: `Task`, `Epic`, `Release`, `BoardConfig`
- [x] Markdown parser + serializer (frontmatter + H2 sections, lenient)
- [x] Structured parse-error reporting (per file, per task)
- [x] `FsAdapter` interface (`read` / `write` / `list` / `stat`)
- [x] Board operations: load, move task between releases, change status,
      reorder, create / edit / delete task
- [x] ID generator with config counter + startup verification scan
- [x] Config loader/saver with strict validation
- [x] Update schemas to the final concept: hardcoded `status` and `type`
      enums on `Task`; epic with `name`/`slug`/`description`/`color`;
      release with `status: future|current|finished` and optional dates;
      drop user-configurable statuses and data-path settings from
      `BoardConfig`
- [x] Add `epics/no_epic.md` as the storage container for tasks without an epic
- [x] Release creation operation (new file with frontmatter; uniqueness
      guard on slug; defaults to `status: future`)
- [x] Release lifecycle operations: start release, complete release (with
      task-relocation handling), guard the one-current-at-a-time invariant
  - [x] Complete release (`completeRelease`): finishes the current release and
        relocates its unfinished tasks to a chosen future release or the
        backlog (epic preserved); `setReleaseStatus` helper
  - [x] Start release (`startRelease`): promotes a future release to current,
        guarding the one-current-at-a-time invariant
- [ ] Epic operations: create, edit, delete (with empty-epic guard)

### `packages/ui` (business features)

- [x] App boot: load and render an existing board from a supplied `FsAdapter`
- [x] **Theming foundation** (CSS variables, light + dark, `data-theme` switch)
- [x] **Top navigation** with Backlog / Board / Archive tabs
- [ ] **Tab counters** on the top navigation (`Backlog (n)`, `Board
      (done/total)`, `Archive (n)`)
- [ ] **Backlog screen**: stacked sections (current, future, backlog),
      collapsible; epic filter panel on the left
  - [x] Read-only first cut: sections rendered, clickable task title opens
        the details dialog, clickable epic badge opens the epic dialog,
        no filters / collapse / D&D / lifecycle buttons yet
  - [x] Collapsible sections (chevron on the section header; expanded by
        default; collapsed state is local/ephemeral, resets on reload)
- [ ] **Board screen**: kanban for the current release with status columns;
      empty state when no release is current
- [x] **Archive screen**: finished releases in the same layout as Backlog,
      read-only, collapsed by default, no filter bar
- [x] **Task creation modal**: title, type, epic, plain-text description
- [x] **Task inline editing** in the details dialog: `title`,
      `description`, `type`, `status`, `epic`, `release`
- [x] **Release creation modal**: Name + plain-text description; filename
      is derived from the name (kebab-case lowercase, spaces and
      filesystem-forbidden characters become `-`, edges trimmed, runs
      collapsed) with a live preview in the form; status defaults to
      `future`; launched from the Backlog section header
- [x] **Epic creation modal**: Name + plain-text description + color picked
      from a fixed palette; filename derived from the name like releases
      (deletion guard on non-empty epics — still TODO)
- [x] **Create menu** in the top navigation: a single Create dropdown
      (Task / Epic / Release) next to the settings button. Task launched
      here lets the user pick a release (finished releases excluded); with
      no release the task is created in the backlog — in the chosen epic's
      file, or `no_epic.md` when no epic is selected
- [x] **Epic inline editing** in the details dialog: `name`,
      `description` / preamble (color — still TODO)
- [x] **Drag & drop** (`@dnd-kit`):
  - [x] Board: within a kanban column, between status columns
  - [x] Backlog: between release sections and to/from the Backlog section,
        with reorder supported inside every section. Inside the Backlog
        section tasks form a single flat list ordered globally by `order`
        across all backlog containers (epic files + `no_epic.md`).
        Reorder only changes `order`; `status` and `epic` are not touched
        by DnD on the Backlog screen — moving a task across the
        boundary of one epic group inside the flat list does not change
        the file it lives in.
- [x] **Release lifecycle UI**: Start release / Complete release buttons on
      section headers; the "where to move unfinished tasks" modal on Complete
  - [x] Complete release: button on the current-release section header
        (Backlog) and in the Board release header; modal picks a single
        destination (a future release or the backlog) for all unfinished
        tasks, or just confirms when everything is done
  - [x] Start release: button on every future-release section header in the
        Backlog, shown only when no release is current; confirmation modal
        shows the task count before promoting the release
- [x] **Backlog filter bar**: top-of-screen single-select dropdowns for
      `status`, `type`, `epic` (with a "No epic" option); applies globally
      to all sections; counter switches to `N of M` when active. Backlog
      only; Archive intentionally has no filter bar.
- [x] **Empty states** for every screen and major section
- [ ] **Initial-board flow**: when no `.boardown/` exists, prompt for ID
      prefix and create the default structure via the adapter
      - [x] Onboarding modal when `.boardown/config.yaml` is missing
            (collects `projectName` + `idPrefix`, writes the config)
      - [ ] Full default-structure scaffold when `.boardown/` itself is
            missing (epics, releases, backlog) — shell responsibility
- [x] **External-change conflict modal** (Reload) in `ui`/`core`: writes go
      through a guarded `FsAdapter` (`createGuardedFs`) that compares each
      target's `lastModified` against the value captured at load and refuses to
      overwrite a file changed on disk, opening the modal instead. Overwrite is
      deferred to a separate task.
- [x] **Reload action** + `reload()` store API; surfaced as a Reload button in
      the `TabBar` (shared by both shells, no automatic refresh)
- [ ] **Parse-error UX**: top banner + gray "problem cards" for tasks that
      could not be parsed cleanly

### `packages/web` (dev shell)

- [x] Vite + React app skeleton that mounts `@boardown/ui`
- [x] `DevHttpFsAdapter` over the Vite middleware that serves the selected
      `.boardown/`
- [x] Optional `--data-dir` for local use from sources, with default
      structure initialization when `config.yaml` is missing
- [x] Manual **Reload** button (shared `ui` `TabBar` button → `reload()`,
      no automatic refresh)
- [x] Conflict-detection flow against `lastModified` from the dev adapter
      (shared guarded `FsAdapter` in `ui`/`core`)

### `packages/vscode` (primary MVP shell)

The canonical distribution target: a third shell next to `web` that reuses
`@boardown/ui` unchanged and swaps only the `FsAdapter` implementation and the
host integration (webview panel + message passing instead of a browser tab over
HTTP). Built bottom-up in three stages, each runnable in the Extension
Development Host.

- [x] **Stage 1 — Walking skeleton**: scaffold `packages/vscode` (manifest,
      esbuild host + Vite webview build), an "Open boardown board" command that
      opens a webview panel rendering a placeholder; host↔webview handshake in
      place. Mounting the real `@boardown/ui` is Stage 2.
- [x] **Stage 2 — `FsAdapter` over message passing**: `VsCodeFsAdapter` on the
      webview side ↔ host router backed by `vscode.workspace.fs` (analog of
      `web`'s `DevHttpFsAdapter` + `dev-fs-plugin`); the board loads real
      `.boardown/` data and drag & drop persists. Board root is the single
      workspace folder's `.boardown/`; a fresh project is initialized through
      the existing onboarding modal (writes `config.yaml`, the host creates
      `.boardown/` on first write). Multi-root selection is out of scope.
- [x] **Stage 3 — Refresh & conflicts**: the shared `ui` Reload button and the
      external-change conflict modal (via `lastModified`) light up in the webview
      automatically by reusing `@boardown/ui`. The host additionally watches the
      board's `.boardown/` and pushes a refresh on external changes (git, the
      CLI, another editor), gated by the `boardown.autoRefresh` setting (default
      on) and ignoring its own writes so saves don't echo back.

**Packaging (`.vsix`)** — separate track (not a numbered stage):

- [x] Bundle the extension into an installable `.vsix` (`@vscode/vsce`,
      `pnpm --filter boardown package`, `--no-dependencies` since host +
      webview are already bundled) with publishing metadata (`publisher`,
      `icon`, `README`, `CHANGELOG`, `LICENSE`, `.vscodeignore`). The
      `publisher` and icon are placeholders pending real ones.
- [ ] Manual end-to-end pass: install the `.vsix` in a clean VS Code and verify
      open / load / drag & drop / Reload / conflict against a sample
      `.boardown/`.
- [x] Automated GitHub Release: bumping the repo version on `main`
      (`pnpm release:prepare`) triggers the `Publish` workflow, which builds the
      `.vsix`, tags `vX.Y.Z`, and attaches the artifact to a GitHub Release.
      The whole monorepo shares one lockstep version (see
      [Releasing](./README.md#releasing)).
- [x] Desktop installers in the same release: the `Publish` workflow runs a
      per-OS matrix (`electron-builder`) and attaches the Electron installers
      (Windows `Setup.exe` + `.zip`, macOS `.dmg` + `.zip`, Linux `.AppImage` +
      `.deb`) to each GitHub Release alongside the `.vsix`. Builds are unsigned;
      code-signing / notarization are deferred to their own round.
- [ ] Marketplace publishing (`vsce publish`, registered publisher, PAT) —
      still deferred, planned in its own round; will slot in as a gated step in
      the same `Publish` workflow.

### Quality

- [x] Vitest smoke tests for `core` (parser round-trip, ID generator,
      board operations, lifecycle transitions)
- [x] Vitest tests for `ui` logic: pure helpers (`dnd/*`, `utils/*`,
      `epic-colors`) and store orchestration (`store.ts`) against an in-memory
      `FsAdapter`. React component tests are out of scope for the MVP.
- [ ] Manual end-to-end pass against a sample `.boardown/` repo
