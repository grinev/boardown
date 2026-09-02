# Changelog

## 0.9.0

- **Related commits in the task dialog**: a **Commits** panel under Details lists
  the commits in your local repository whose subject names the task's id, newest
  first, each with its subject and the date it was made. Nothing is fetched and
  no remote is contacted. Turn it off with the **Git integration** checkbox in
  Settings, which is on by default.
- **Copy commit message**: a copy button next to the task's id in the dialog
  header puts a single line such as `feat(BD-123): Add next button` on the
  clipboard, mapping the task's type to `feat`, `fix`, `docs` or `chore`.
- **Clickable external links**: an `http://` or `https://` URL written in a task
  description or note, an epic or release description, a custom field value, a
  doc page or a repo file preview now opens in your browser — the same places doc
  and repo links are already clickable.
- **A file the parser could not read is never rewritten**: when a task block's
  frontmatter is broken, the write is refused and a **File cannot be written**
  modal names the file and lists its problems verbatim, instead of silently
  dropping the block. Every other file on the board stays editable.

## 0.8.0

- **Several active releases at once**: turn on the new Settings checkbox and you
  can start a second release while the first is still running — the Board header
  gains a switcher next to the release name, and the Backlog lists one `(active)`
  section per active release.
- **Custom task statuses** (beta): a board can declare its own statuses in
  `.boardown/config.yaml` — two to eight of them, replacing `todo` /
  `in-progress` / `done` — with the first as the status a new task starts in and
  the last as the one that counts as finished. Tasks holding an undeclared status
  are collected in a read-only `Unknown` column instead of being rewritten.
- **Seven kinds of task link**: linking two tasks now offers blocks / is blocked
  by, includes / is part of and duplicates / is duplicated by alongside the
  existing relates to. Each dialog reads the relation from its own side, and the
  Linked tasks section groups its rows under relation headings.
- **Confirmation before a filled create form is discarded**: Escape or a click on
  the backdrop no longer throws away what you typed into Create task, Create epic
  or Create release — a `Discard changes?` confirmation appears, with the form
  still intact behind it.
- **Fields that grow with the text**: every multi-line field — the three Create
  dialogs' Description, the task, epic and release descriptions, and both note
  editors — is now exactly as tall as its text, growing until the dialog stops
  fitting the window. The manual resize grip is gone, and opening an existing
  description for editing no longer shrinks it.
- **Wider creation dialogs, focus where you type**: Create task, Create epic and
  Create release are as wide as the task dialog's description column, open with
  the caret already in the first field, and submit on Cmd/Ctrl+Enter from
  anywhere in the form.
- **Keyboard navigation in every picker**: ↑ / ↓ move the highlight and Enter
  picks it in all thirteen selects and in the Linked tasks search, Home / End
  jump to the ends, Tab closes the list without changing the value, and Escape
  closes just the list instead of the whole dialog behind it. An open picker also
  no longer runs off the right edge of the window.
- **Epic names are limited to 28 characters**: a longer name can no longer be
  typed or pasted in, and every place a name is shown — the board card badge, the
  backlog and archive rows, the task dialog's Epic chip — renders it on one line,
  clipped with `…`. An existing longer name still loads untouched.
- **Inline name edits confirm on their own row**: editing an epic or release name
  in the dialog header keeps the ✓ / ✗ pair beside the field instead of pushing
  them onto a second row, so the header no longer changes height. The release
  field opens at the epic's width.

## 0.7.0

- **Repo file links**: write `[[repo:packages/cli/src/node-fs.ts]]` anywhere doc
  links already render — a description, notes, an epic or release description, a
  custom field, a doc page — and it becomes a link labelled with the file's name
  that opens the file's content in a read-only popup. Any text file works; a
  binary or missing file shows an error instead.
- **Done task links are struck through**: an inline `BD-xx` reference to a task
  that is already done now renders with a line through it, so you can see what is
  finished without clicking through.
- **Doc-link autocomplete in the creation dialogs**: the Description field of
  Create task, Create epic and Create release now offers the same `[[` doc-page
  suggestion popup the detail dialogs have.
- **Back button on the left**: in a dialog reached from another dialog, the back
  arrow moved out of the top-right corner next to the close `✕` and now sits
  right after the dialog's icon and title.
- **CLI row in Settings**: the Settings dialog gained a CLI row between the WIP
  limit field and the Version row, showing the install command as selectable text
  plus a Learn more link to the CLI documentation.
- Fix: switching tabs no longer nudges the neighbouring tabs and the search field
  sideways by a pixel.

## 0.6.0

- **Task search**: a search field in the top bar finds any task on the board by
  id, title or description — type three characters and pick a match from the
  dropdown to open it, tasks in finished releases included.
- **Task priority**: every task carries one of four priorities (Critical, High,
  Medium, Low), shown as a coloured glyph on board cards and backlog rows,
  editable in the task and create dialogs, and available as a fourth filter in
  the backlog.
- **WIP limits**: cap how many tasks the current release may have in progress
  from the Settings dialog (empty means no limit). The In Progress column header
  then counts against the limit (`2 / 3`), and once it is reached the column
  stops accepting drops and the status dropdown's In Progress option is
  disabled.
- **Statuses change only in the current release**: a task in a future release or
  in the backlog shows its status as a static pill with a tooltip instead of a
  dropdown. Moving a task between containers keeps whatever status it had.
- **Edit an epic's colour**: the epic dialog gained a Color row — click the
  swatch to open the palette inline and confirm the pick with Save.
- A board whose `config.yaml` declares a custom field named `priority` no longer
  loads: the name is now reserved by the built-in field. Rename your field to
  open the board again.

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
