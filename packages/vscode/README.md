# boardown

A lightweight, local-first task board that stores its data as plain markdown
files inside your project's git repo. Releases, epics and tasks live in a
`.boardown/` folder next to your code, so they version, branch and diff with
the rest of the project — no cloud, no server, no account.

<p align="center">
  <img src="https://raw.githubusercontent.com/grinev/boardown/main/assets/Board-dark.png" alt="boardown board view in VS Code" width="90%" />
</p>

## Built for you and your AI agent

Because the whole board is plain markdown in your repo, an **AI coding agent**
(Claude Code, Cursor, …) already sees it right next to your code — no
integration, no plugin. The companion CLI,
[`@grinev/boardown-cli`](https://www.npmjs.com/package/@grinev/boardown-cli),
turns that into a first-class control surface: every command speaks **JSON**, so
an agent can read the backlog, pick up the current release, and add or move
tasks from the command line. You plan in this extension; your agent drives the
same board headlessly — and thanks to auto-refresh, its changes show up live in
the editor.

```sh
npx @grinev/boardown-cli release current   # what the agent is working on now
```

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
  complete actions and unfinished-task relocation on completion; click a
  release's name to view and edit its details.
- **Docs**: a **Docs** tab turns `.boardown/docs/` into a small project wiki,
  and any doc page can be referenced from a task or epic and clicked through to.
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
- **Agent-drivable** from the companion CLI (`@grinev/boardown-cli`): the same
  board, scriptable with machine-readable JSON output for AI agents and CI.

See [PRODUCT.md](https://github.com/grinev/boardown/blob/main/PRODUCT.md) for
the full spec.

## License

[MIT](./LICENSE)
