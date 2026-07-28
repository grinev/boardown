# Changelog

## 0.5.3

- **Custom fields (beta)**: declare extra per-task fields in
  `.boardown/config.yaml` and each one becomes an editable row in the task
  dialog's Details card, with long values wrapping to the line below the label.
  Only the `string` type exists for now and the storage format may still change.
- **Release files follow the release name**: renaming a release now renames its
  markdown file too, so the name and the file on disk stay in sync.
- Completing a release is now all-or-nothing — an external edit halfway through
  can no longer leave the release marked finished with its open tasks still
  inside it.
- Fix: when an external change blocks a write started from a dialog, the reload
  conflict modal comes to the front and closes that dialog, instead of opening
  behind it where **Reload board** could not be clicked.
- Fix: a task dragged from the current release into the Backlog no longer
  vanishes from the board.
- Fix: moving a task with no epic into the Backlog no longer fails on a board
  that has never had a backlog file — it is created on demand.

## 0.5.2

- **Documents open in a popup**: clicking a doc reference in a task, an epic or
  a release description opens that page in a popup on the same tab, with a
  **View in docs** button for the full jump to the Docs tab.
- **Back button in dialogs**: jumping from one dialog to another (task → epic,
  task → linked task, task → doc page) keeps a history — the dialog you land on
  shows a Back button that returns you to the one you came from.
- Task edits are now merge-friendly: changing a status no longer moves the
  task's block inside the markdown file, so the change is a two-line diff and
  two branches touching different tasks in the same release merge cleanly.

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
