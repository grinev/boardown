# boardown — Product Spec

A lightweight, local-first task board that lives **inside your project's git
repo**. Tasks are plain markdown files, so the board diffs naturally with the
rest of the codebase and needs no server, account, or sync service.

License: MIT.

## Overview

- **Target user:** solo developer who wants a simple scrum-style board next to
  their code, with version history coming for free from git.
- **Workflow:** a long-lived **Backlog**, plus one file per **Release**
  (sprint), plus one file per **Epic** for cross-release work. Tasks move
  between these via drag & drop.
- **Storage:** a `.boardown/` folder in the project root, containing a config
  file and two subfolders (`releases/`, `epics/`). Everything is committed to
  git as-is.
- **Distribution:** browser version first (open the app, point it at a local
  folder via the File System Access API). VS Code extension and Electron
  build come later — out of scope for this spec.

## Core concepts

### Task
A single unit of work. Fields:

| Field         | Type      | Notes                                                  |
|---------------|-----------|--------------------------------------------------------|
| `id`          | string    | `<prefix>-<n>`, e.g. `BD-1`. Stable, never changes.    |
| `title`       | string    | The H2 heading of the task section in the md file.     |
| `description` | markdown  | Free-form body below the frontmatter.                  |
| `status`      | string    | One of the values declared in `config.yaml`.           |
| `epic`        | string?   | Slug of an epic file (without `.md`), or empty.        |
| `order`       | integer   | Sort key within a column. Step of 100 between peers.   |

### Release
A markdown file under `releases/`, e.g. `releases/1.10.md`. Holds tasks
planned for that release/sprint. Filename (without extension) is the release
ID shown in the tab bar.

### Epic
A markdown file under `epics/`, e.g. `epics/ui-foundation.md`. Holds tasks
that belong to an epic but are not (yet) scheduled to a release. Tasks
scheduled into a release still reference the epic via the `epic` field.

### Backlog
The implicit collection of tasks not yet assigned to any release. The Backlog
tab shows tasks living in epic files (and any future "loose" tasks file).

## Storage format

```
<repo root>/
└── .boardown/
    ├── config.yaml
    ├── releases/
    │   ├── 1.10.md
    │   └── 1.11.md
    └── epics/
        ├── ui-foundation.md
        └── parser.md
```

### Markdown file structure

Every release/epic file holds a top-level frontmatter block describing the
container, followed by zero or more **task sections**. Each task is an `## H2`
heading, followed by its own frontmatter block, followed by the description
markdown.

Example `releases/1.10.md`:

```markdown
---
release: "1.10"
startDate: 2026-05-01
endDate: 2026-05-15
---

# Release 1.10

## Implement card drag & drop

---
id: BD-1
status: in-progress
epic: ui-foundation
order: 100
---

Allow tasks to be dragged between status columns and between releases.
Should also support keyboard reordering for accessibility.

## Frontmatter parser

---
id: BD-2
status: done
epic: parser
order: 200
---

Description in plain markdown. Supports **bold**, lists, `code`, etc.
```

Notes:
- The H2 heading text is the task title.
- The exact disambiguation between H2-as-task and H2-inside-description is an
  implementation detail to nail down when building the parser.

## Configuration

`.boardown/config.yaml`:

```yaml
idPrefix: BD          # task id prefix, e.g. BD -> BD-1, BD-2, ...
nextId: 47            # next id to hand out (verified against existing ids on startup)
statuses:             # column order on the board, left to right
  - todo
  - in-progress
  - done
paths:                # subpaths inside .boardown/
  releases: releases
  epics: epics
```

- `nextId` is fast-path; on startup the app scans existing tasks and bumps it
  to `max(existing) + 1` if it has fallen behind (e.g. someone authored tasks
  by hand).
- `statuses` is fully user-configurable. Adding `review` or `blocked` is just
  an edit to this file.
- An invalid `config.yaml` shows a dedicated error screen — no silent
  fallback.

## Browser version

- The user picks the project root folder via the FS Access API
  (`showDirectoryPicker`). The app then reads `.boardown/` inside that folder.
- Chromium-only for the MVP (Chrome, Edge, Brave, Arc). Firefox / Safari
  support is out of scope.
- Refresh strategy:
  - On `window.focus` and `visibilitychange → visible`, reload all files.
  - A manual **Reload** button is always available in the UI.
- Conflict handling: before writing, the app re-stat's the file and compares
  `lastModified` against what it had when the data was last loaded. If the
  file changed externally, the user gets a modal: **Reload** (drop my edits)
  or **Overwrite** (drop external edits).
- Lenient parsing:
  - A broken file does not block other files.
  - A broken task does not block other tasks in the same file.
  - Problems are surfaced in a top banner and rendered as gray "problem
    cards" on the board.
  - The app **never** rewrites a file it could not fully parse without an
    explicit user confirmation.
- No automated backups — git is the safety net.

## UI

- **Tab bar:** `Backlog | Release 1.10 | Release 1.11 | … | + New release`
  plus an **Epics** view toggle.
- **Board view (release / backlog):** columns by `status`, cards within each
  column sorted by `order`. Drag & drop between columns updates `status`;
  drag & drop between tabs/releases moves the task to the other file.
- **Epics view:** tasks grouped by epic (read-only grouping), useful when
  planning a new release.
- **Task editor:** title, status, epic, description (markdown). No assignee,
  due date, priority, or labels in the MVP.
- **"Create board" dialog:** appears when `.boardown/` does not exist;
  prompts for the ID prefix and writes the default `config.yaml`.
- **"Create release" dialog:** prompts for a release name (free string).

## Out of scope (for now)

- VS Code extension and Electron build (planned later, but no code or
  scaffolding for them in the MVP).
- AI features of any kind.
- Real-time sync, server, or multi-user collaboration beyond what git itself
  provides.
- Firefox / Safari support, hosted version, mobile.
- Assignees, due dates, priorities, labels, comments, attachments.
- Undo / redo history (git is the history).
- Search across tasks.

## MVP roadmap

High-level only — each item will get its own planning round before
implementation. The build order is bottom-up: `packages/core` (pure logic),
then `packages/ui` (the React app, platform-agnostic), then `packages/web`
(the browser shell that wires `ui` to the File System Access API).

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
- [ ] Board operations: load, move task between releases, change status,
      reorder, create / edit / delete task
- [ ] ID generator with config counter + startup verification scan
- [ ] Config loader/saver with strict validation

### `packages/ui`

- [ ] App entry component `<App fs={...} />` that takes an `FsAdapter` as a
      prop / context — no `window`, `document`, or FS Access API imports
- [ ] Zustand store wired to `core` (loads/saves via the supplied adapter)
- [ ] Tab bar: Backlog + releases + "+ New release"
- [ ] Board view with status columns + `@dnd-kit` reordering & status changes
- [ ] Cross-tab drag & drop (move task to another release / backlog)
- [ ] Epics view
- [ ] Task editor (title, description, status, epic)
- [ ] "Create board" dialog (asks ID prefix, asks the shell to write the
      default config via the adapter)
- [ ] "Create release" dialog
- [ ] Generic "external change" conflict modal (Reload / Overwrite),
      triggered by the shell on save conflicts
- [ ] Reload button + imperative `reload()` API the shell can call
- [ ] Error banner + problem-card rendering for parse errors

### `packages/web`

- [ ] Vite + React app skeleton that mounts `@boardown/ui`
- [ ] `BrowserFsAdapter` on top of the FS Access API, including
      `lastModified` stat for the conflict-detection flow
- [ ] Folder-picker entry screen (`showDirectoryPicker`)
- [ ] Refresh on `window.focus` and `visibilitychange` → calls `ui.reload()`

### Quality

- [ ] Vitest smoke tests for `core` (parser round-trip, ID generator,
      board operations)
- [ ] Manual end-to-end pass against a sample `.boardown/` repo
