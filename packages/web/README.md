# @grinev/boardown-web

Run the [boardown](https://github.com/grinev/boardown) workspace in a browser, or
serve a board-only view inside another local application. Requires Node.js 20 or later.

```sh
npm install -g @grinev/boardown-web
boardown-web
```

Open the loopback URL printed by the command. The workspace shares its project
list with Electron. Use **Open Folder…** to add and open a project without
creating any board files until you complete onboarding.

- Windows needs Windows PowerShell with WinForms and an interactive desktop.
- macOS needs `osascript` and an interactive desktop.
- Linux needs Zenity or KDialog and an interactive desktop session.

Use `--data-dir /path/to/project/.boardown` for just one board, or
`--registry /path/to/projects.yaml` for a separate, existing registry. `--port`
pins the loopback port, `--no-watch` turns off automatic board refresh, and
`--config-dir` supplies a shared theme.

To embed a project, use `/b/<id>/?embed`. A local backend can register it with
`POST /api/projects/add`, passing JSON `{"path": "/absolute/project/path",
"id": "my-project"}` and using the `id` from the `200` response. This endpoint is
available only in registry mode and it does not accept cross-origin browser writes.

See the [local server guide](https://github.com/grinev/boardown#local-server-boardown-web)
for the registry format, migration rules, and theming.
