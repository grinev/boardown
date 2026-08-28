---
name: sandbox
description: How to drive boardown for real without touching the repo's own board — starting the throwaway sandbox and its dev server, what the fixture board contains, reading the run's log file, running the CLI from source, driving the UI in the browser, and cleaning up. Use at the start of any run that opens the app or the CLI against real data — manual testing, showing a demo to the user, reproducing a defect by hand.
---

# Driving boardown against a sandbox

boardown stores its board as markdown on disk, and every click writes to it. So
nothing you do runs against the repo's own `.boardown/` — you work on a throwaway
copy of the fixture, made fresh each run. This skill is how you get one and how
you drive both surfaces against it.

What it does **not** cover is what you are looking for while you drive: that is
your own role — the tester hunts defects, `/demo` walks a scenario with the user.

## Setup — every run, before anything else

```sh
# free the port if a previous run left a server behind
# (exits 1 when the port was already free — expected, not a failure)
powershell -Command 'Get-NetTCPConnection -LocalPort 5199 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }'
pnpm dev:sandbox   # run in background
```

The script prints two lines you need:

```
sandbox board: C:\...\Temp\boardown-sandbox-XXXX\.boardown
sandbox url:   http://localhost:5199
```

Vite prints a third line naming this run's **log file**:

```
boardown log file: D:\Projects\AI\boardown\logs\web-<timestamp>.log (level debug)
```

**That printed board path is the only board you may read or touch.** It is a
throwaway copy of `tests/fixtures/board/.boardown/`, made fresh on every run. This
is how you get a sandbox for *both* surfaces: even for a CLI-only run, start
`dev:sandbox` and take the path from its output — just don't open the browser.

**The port is a single shared resource.** `dev:sandbox` binds 5199 and nothing
else, which is why the first command above exists. Two runs cannot drive the app
at the same time: the second kills the first one's server. Whoever starts several
of these runs starts them one after another.

## Hard rules

- **Never point the browser at the repo's own `.boardown/`.** Every click writes
  markdown to disk; you would corrupt the real board.
- **Never run the CLI without `--data-dir <sandbox board>`.** With no
  `--data-dir` it walks *up* from the current directory looking for `.boardown/`,
  exactly like git finds `.git` — so from anywhere in this repo it finds the
  repo's own board and writes to it. One forgotten flag corrupts the real board.
- Never edit source, tests or the fixture. You change nothing that is already in
  the repo; a file your own role is told to create is the only exception.
- Never commit, push, or run git commands that change state.
- Leave no artifacts in the working tree: `git status` shows nothing new outside
  `.playwright-mcp/` and whatever your own role is told to write.

## What the fixture contains

`Test Board`, id prefix `TS`. Releases: `v0.1.0` (finished), `v0.2.0` (current),
`v0.3.0` (future). Epics `Core` and `Ui`, plus unscheduled tasks in the backlog.
Tasks cover every status and every type; `TS-6` has a checklist and a note.
The finished release is there on purpose — it is the read-only edge case.

## The log file

Every dev-server run opens a fresh file under `logs/` at the **repo root** (never
inside the sandbox board; the folder is gitignored, so it never shows in
`git status`). At the default `debug` level it records the whole run:

- `browser.ui.store <action>(<args>)` — every action taken in the app, in order.
  This is the trail of what *you* did.
- `web.dev-fs write <path>: 204 (<n> chars)` — every change that landed on disk.
- `browser.web.fs-adapter` / `web.dev-fs` `read`/`list`/`stat` — per-request chatter.
- `ERROR browser.ui.store …` — every failure the app hit, including ones the UI
  showed as a small message you might otherwise miss.

Each record is exactly one line: `<ISO timestamp> <LEVEL> <namespace> <message>`,
optionally ` — <detail>` carrying an error's stack with newlines collapsed to `|`.

**When something looks wrong on screen, read the tail of the file before you
guess.** An `ERROR` line usually names the cause precisely, and the `INFO` line
just above it says which action triggered it. When a click seems to do nothing,
check whether the action was logged at all: no line means the handler never fired,
a line followed by an `ERROR` means it fired and failed — different problems.

Take the file path from Vite's startup line, and remember a restart means a new
file. `BOARDOWN_LOG_LEVEL=info pnpm dev:sandbox` narrows it to actions, writes and
failures if the debug chatter is drowning what you need.

The log reflects the app; it is not a substitute for the markdown on disk. A write
logged as `204` still deserves a look at the file under the sandbox path when what
matters is what got stored.

## Driving the CLI

The CLI is not linked as a global `boardown` command here — you run the bundle you
build from source. **Build first, every run**: the `dist/` you find may be stale or
missing, and driving yesterday's bundle proves nothing.

```sh
pnpm --filter @grinev/boardown-cli build      # → packages/cli/dist/cli.cjs
node packages/cli/dist/cli.cjs --data-dir "<sandbox board>" release current --json
```

`dist/` is gitignored, so building leaves the working tree clean.

- **`--data-dir` on every single invocation**, pointed at the sandbox path from
  `dev:sandbox`. Quote it — the temp path can contain spaces. Flags may appear
  anywhere in the argv, so `--data-dir … task add "T" --json` is fine.
- **Pass `--json` explicitly.** Output is JSON when stdout is not a TTY, which is
  the case for you anyway — but saying it makes the run deterministic. The
  human-readable branch is only reachable from a real terminal.
- **Check the exit code after every command** (`$LASTEXITCODE` in PowerShell,
  `echo $?` in bash): `0` success, `1` operation failed, `2` usage error.
- The envelope is the contract: `{ "ok": true, "command": …, "data": … }` or
  `{ "ok": false, "command": …, "error": { "code": …, "message": … } }`.
- `boardown schema --json` prints the machine-readable command/enum contract.
- **`init` is the one command that creates a board**, at `--data-dir` if given and
  otherwise at `<cwd>/.boardown` — so run it against a fresh empty temp directory,
  never bare inside the repo. Pointed at the sandbox (or the repo) it refuses with
  `ALREADY_INITIALIZED` and writes nothing.
- The commands are `backlog`, `archive`, `task`, `release`, `epic`, `init`,
  `schema` — there is no `board` command, it was removed with the rest of the
  output rework. The board view is `release current`.
- The board file on disk and what the CLI reports can disagree, and the file is
  the truth: `release current --json` after a mutation is half the check, reading
  the markdown is the other half.

## Driving the UI (browser)

- **Snapshot narrowly.** A full-page snapshot is the single most expensive thing
  you do, and most of it is noise you already know. Pass `target` to scope it to
  the part you care about — `[data-testid="column-done"]`, the open dialog, one
  backlog section. Take a full snapshot on first load and after a navigation, not
  after every click; when you already know what an action did, do not snapshot at
  all.
- The accessibility snapshot does not show `data-testid`, but you can still target
  by it: `[data-testid="column-done"]`, `task-card-<id>`, `backlog-row-<id>`,
  `section-<key>`. Everything else (dialogs, fields, buttons) is reachable by role
  and name.
- **Drag and drop: use the keyboard.** Focus the card (`browser_evaluate` with
  `element => element.focus()` on the draggable wrapper), then `Space` → arrow keys
  → `Space`. Mouse emulation against `@dnd-kit` is flaky and will waste your run.
- The `IconSelect` trigger exposes its value in the accessible name
  (`"Status: Done"`), so you can read the current selection from the snapshot.
- **The first browser call of a run can fail because the MCP server connects
  lazily.** Repeat it once before concluding the browser is unavailable; a second
  failure is a real one.
- **Never call `navigator.clipboard.readText()`** — it blocks on a permission
  prompt this session never resolves and hangs until the MCP timeout kills it.
  `writeText` is unaffected. Read the clipboard by pasting instead: append a
  scratch `<textarea>`, focus it, `browser_press_key` `ControlOrMeta+v`, read its
  `value`, remove it. **The scratch element goes inside the open `<dialog>`** —
  in `document.body` under a modal it never receives the paste, and comes back
  empty.
- Screenshots: do not pass a `filename` — it resolves against the repo root and
  litters the working tree. Omitted, the screenshot lands in the gitignored
  `.playwright-mcp/`.

## Cleanup

Close the browser (if you opened one), kill the dev server, and check `git status`
per the hard rule above. The sandbox board and any temp directory you made for
`init` live under the OS temp dir — leave them, they are throwaway.
