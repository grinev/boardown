# boardown

A lightweight, local-first task board that stores its data as plain markdown
files inside your project's git repo. Releases, epics and tasks live in a
`.boardown/` folder next to your code, so they version, branch and diff with
the rest of the project — no cloud, no server, no account.

## Usage

1. Open the folder that contains (or should contain) your board in VS Code.
2. Run **boardown: Open board** from the Command Palette.

The board reads `.boardown/` from the open workspace folder. On a fresh
project, the onboarding modal writes `config.yaml` and the board is created on
first save. Data is saved straight back to the markdown files on every change.

The board refreshes on demand only — use the **Reload** button to re-read the
files. If a board file changes on disk while the board is open, a conflict
modal lets you reload instead of overwriting.

## Limitations (MVP)

- A single workspace folder's `.boardown/` is used. Choosing among several
  roots or an arbitrary folder is out of scope.
- No file watcher: refresh is the manual **Reload** button only.
- No automated backups — git is the safety net.

See [PRODUCT.md](https://github.com/grinev/boardown/blob/main/PRODUCT.md) for
the full spec.

## License

[MIT](./LICENSE)
