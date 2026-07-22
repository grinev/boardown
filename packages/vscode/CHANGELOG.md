# Changelog

## 0.5.1

- **Create a task from an epic**: the epic dialog's Tasks section gained a plus
  button that creates a task in that epic without leaving the dialog.
- Tasks in a finished release now open read-only — every value is still shown,
  but nothing that would fail to write is clickable — and a finished release is
  no longer offered as a destination when moving a task.
- Fix: a long release name is no longer truncated in the board header.

## 0.5.0

- **Docs tab**: a new top-level **Docs** view turns `.boardown/docs/` into a
  small project wiki — a page tree beside the selected markdown page, with view
  and raw-edit modes.
- **Doc links**: reference a doc page from a task description, a task note or an
  epic description and click through to it in the Docs tab.
- **Release details dialog**: click a release's name to view its details and
  edit its name and description inline; finished releases open read-only.
- The Settings dialog now shows the running extension version.

## 0.4.0

- **Task links**: the task dialog gained a **Linked tasks** section — search for
  another task by id or title and relate the two. A link is stored on both tasks
  and can be removed from either side.
- Task ids mentioned in a task description, a note or an epic description now
  render as links: they show the target's title and open its dialog on click.
- **Delete a task** from the task dialog's actions menu (with a confirmation
  step). Deleting also cleans up the links other tasks hold to it.

## 0.3.0

- Task cards now support checklists and free-form notes.
- Auto-refresh the board when its `.boardown/` files change on disk (e.g. via
  git, the CLI, or external edits), toggleable with the `boardown.autoRefresh`
  setting.
- Updated app icon.

## 0.2.0

- Fix: epics were not selectable for new tasks created in the Backlog.

## 0.1.0

First packaged build (`.vsix`).

- Open the board for the workspace folder's `.boardown/` via the
  **boardown: Open board** command.
- Real `.boardown/` data loads in a webview; drag & drop persists to disk.
- Manual **Reload** button and external-change conflict modal.
