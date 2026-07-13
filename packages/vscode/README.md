# boardown

A lightweight, local-first task board that stores its data as plain markdown
files inside your project's git repo. Releases, epics and tasks live in a
`.boardown/` folder next to your code, so they version, branch and diff with
the rest of the project — no cloud, no server, no account.

## Usage

1. Open the folder that contains (or should contain) your board in VS Code.
2. Click the board icon in the top-right corner of the editor, or run
   **Boardown: Open Board** from the Command Palette.

The board reads `.boardown/` from the open workspace folder. On a fresh
project, the onboarding modal writes `config.yaml` and the board is created on
first save. Data is saved straight back to the markdown files on every change.

By default the board **auto-refreshes** when its `.boardown/` files change on
disk — so edits made via git, the CLI, or another editor show up without a
manual reload. Turn it off with the `boardown.autoRefresh` setting to refresh
on demand via the **Reload** button instead. If a file you've changed in the
board was also changed on disk underneath you, a conflict modal lets you reload
instead of overwriting.

## Features

- **Backlog, Board and Archive** views: a Jira-style backlog, a kanban for the
  current release, and a read-only archive of finished releases.
- **Releases** with a `future → current → finished` lifecycle, with start /
  complete actions and unfinished-task relocation on completion.
- **Epics** that group tasks across releases and double as the backlog's
  storage, usable as a filter dimension.
- **Task checklists and notes**: each task can carry a lightweight todo
  checklist (shown as a `done/total` badge) and timestamped notes (shown as a
  count badge), edited in the task dialog.
- **Task links**: relate two tasks from the task dialog's **Linked tasks**
  section — the link is stored on both sides. Any task id mentioned in a
  description or a note renders as a link to that task.
- **Drag & drop** to move tasks between statuses, releases and the backlog, and
  to reorder within a section.
- **Delete a task** from the task dialog, with a confirmation step — git stays
  the safety net.
- **Auto-refresh** on external file changes (toggle via `boardown.autoRefresh`).
- **Plain-markdown storage** in `.boardown/`, committed to git like the rest of
  your code — no cloud, no server, no account, and git is your history and
  backup.

See [PRODUCT.md](https://github.com/grinev/boardown/blob/main/PRODUCT.md) for
the full spec.

## License

[MIT](./LICENSE)
