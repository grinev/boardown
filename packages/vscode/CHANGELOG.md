# Changelog

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
