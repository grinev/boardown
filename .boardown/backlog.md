## Embed the board in bb

---
id: BD-133
type: tech
status: todo
epic: bb-plugin
order: 100
---

A bb plugin opens the board inside bb, the same UI the other shells show, in a chromeless iframe rather than bb's built-in browser. The plugin ships the boardown-web build and serves it from the plugin backend already running in bb's server: the same handlers and static assets, no second process and no separate install. The page comes up with the plugin and goes away with it, rooted at that project's .boardown/.

## CLI defects found while reviewing the agent skill

---
id: BD-137
type: bug
status: todo
epic: cli
order: 100
links:
  - type: relates
    to: BD-77
  - type: relates
    to: BD-136
  - type: relates
    to: BD-132
---

Found while reviewing the boardown agent skill against the `release-v0.11.0` source. To be sorted out later.

1. **Archive is ordered by file name, not by version.** `finishedReleases` sorts by file name descending, while its comment and the `archive` summary in `boardown schema` say "newest first". On this board `v0.9.0` comes above `v0.10.0`, and `v0.10.0` sits between `v0.2.0` and `v0.1.0`. The sort is in core, so the Archive view in the UI likely shows the same order (not checked). [[repo:packages/core/src/ordering.ts]], [[repo:packages/cli/src/commands/schema.ts]]
2. **`boardown schema` calls `order` "priority"** — `task reorder`: "Change a task's priority (order) within its container". `priority` is a separate field now, so an agent reading the contract can mix the two up. [[repo:packages/cli/src/commands/schema.ts]]
3. **`boardown help` is incomplete**: no `task attachment`, and the `task add` line does not list `--link`, `--attach`, `--field`, `--checklist`. [[repo:packages/cli/src/app.ts]]
4. **`release done` reports every refusal as `RELEASE_NOT_CURRENT`**, including `--into` a finished release (the code comment says so). Per the review also `--into` an active release at its WIP limit (not checked). The message is right, the code is not. [[repo:packages/cli/src/commands/release.ts]]

## Set up the JetBrains plugin shell

---
id: BD-128
type: tech
status: todo
epic: jetbrains-plugin
order: 100
spec: "[[repo:.claude/specs/BD-128-jetbrains-plugin-setup/research.md]]"
---

Stand up packages/jetbrains: a Gradle/Kotlin plugin that opens the board in a JCEF browser running @boardown/ui, with an FsAdapter bridged over JBCefJSQuery. Research on the technical shape and on Marketplace publishing (registration, trader declaration, signing, review) is in the linked document.

## Task activity/history

---
id: BD-60
type: feature
status: todo
epic: git-integration
order: 200
---

Show task history from git

## Change releases order in backlog

---
id: BD-23
type: feature
status: todo
order: 250
links:
  - type: relates
    to: BD-143
---

## No DOM test environment for packages/ui

---
id: BD-111
type: tech
status: todo
epic: tests
order: 300
links:
  - type: relates
    to: BD-100
---

All five packages run vitest with environment: 'node', and the repo has no jsdom, happy-dom or testing-library dependency, so nothing that renders React can be covered automatically. Hooks that measure the DOM ship with the manual tester as their only witness — packages/ui/src/hooks/use-auto-grow.ts, added by BD-100, is the current example. Decide whether packages/ui gets a DOM environment plus a first set of component and hook tests, or whether Playwright stays the only UI coverage.

## Match the project list page styling to the board

---
id: BD-118
type: tech
status: todo
epic: web-app
order: 400
---

The project list page at / in registry mode carries its own minimal styling — rows, buttons and dialogs assembled from currentColor and the system Canvas/CanvasText colours — so it only resembles the board rather than looking like it. It should read as the same product: the surfaces, controls and dialogs of the board UI, in light and in dark. The page serves several boards at once while a theme belongs to one board's config, so what it follows when the boards disagree is part of the task.

## The project list page does not render in Orca's built-in browser

---
id: BD-119
type: bug
status: todo
epic: web-app
order: 700
---

The boardown-web list page (served at the registry root) stays blank when opened in the browser built into Orca, while the same URL renders normally in an ordinary browser. The server is not at fault: it answers 200 with the full HTML, and the log records no error. Worth checking what the embedded browser restricts — the inline <script> and inline <style> the page is built from, the <dialog> element the Add/Remove flows use, or the modern CSS the page leans on (color-mix(), color-scheme). The host check may also matter: the server accepts only 127.0.0.1, localhost and ::1 in the Host header, so an embedded browser reaching it by any other name is refused.

## Add contributing file

---
id: BD-39
type: docs
status: todo
epic: repo-design
order: 800
---

## Create landing page on github pages

---
id: BD-49
type: tech
status: todo
epic: website
order: 900
---

## Docs md editor

---
id: BD-35
type: feature
status: todo
epic: docs-tab
order: 1000
links:
  - type: relates
    to: BD-100
---

## Board preview in github pages

---
id: BD-68
type: feature
status: todo
epic: website
order: 1100
---

## Change semantic releases logic and release notes structure

---
id: BD-27
type: tech
status: todo
epic: repo-design
order: 1300
---

Commits should have scope: feat(core), fix(vscode), fix(desktop)

## Restructure README around a 3-step quick start

---
id: BD-103
type: docs
status: todo
epic: repo-design
order: 1400
---

The README lists three install channels as equals and then runs into dev and release docs. Lead with the VS Code extension as the main path in numbered steps, note that the CLI is a separate optional install, and move the alternatives and the dev/release sections into docs/.

## Add assignee field to task

---
id: BD-50
type: feature
status: todo
order: 1500
links:
  - type: relates
    to: BD-29
---

## Add release dates

---
id: BD-20
type: feature
status: todo
order: 1600
links:
  - type: relates
    to: BD-143
---

## Add localization infrastructure

---
id: BD-38
type: tech
status: todo
epic: localization
order: 1700
---

## Make task IDs survive parallel branches

---
id: BD-63
type: tech
status: todo
order: 1800
links:
  - type: blocked-by
    to: BD-125
  - type: relates
    to: BD-131
---

`nextId` in `config.yaml` is a single global counter, so every task created on a
branch collides with one created on `main`: the same line conflicts in
`config.yaml`, and both tasks end up carrying the same ID. `verifyNextId` only
moves the counter forward — it never notices that two tasks already share an ID,
and nothing else validates uniqueness, so wiki-links and lookups silently
resolve to whichever copy comes first.

- Report a duplicate task ID as a `problem` at load time instead of letting it
  pass, and add a CLI command that reassigns the duplicate and repairs the links
  pointing at it.
- Drop `nextId` from `config.yaml` and derive the next ID from the highest one on
  the board, so creating a task stops touching a shared file at all. Only worth
  doing together with the check above — on its own it trades a loud conflict for
  a quiet duplicate.

Keep the IDs human-readable (`BD-62`); random suffixes would dodge the collision
but cost the thing people actually use IDs for.

The counter is only half of it: a new task is appended to the tail of its
container file, so two sessions creating unrelated tasks also conflict on the
last lines of `no_epic.md` (27 tasks today). Splitting storage further — a file
per task — is not the answer; it breaks docs/decisions/storage-format.md and
principle 2. Close this first and see what pain is left.

## Surface core invariant refusals in the UI

---
id: BD-75
type: tech
status: todo
order: 2000
---

The store calls core board-ops outside the try/catch that only wraps the fs write, so a process-invariant throw (a finished release is read-only, a status only changes in the current release) becomes an unhandled promise rejection instead of reaching errorMessage. No path into it is reachable today — the UI hides the controls that would make those calls — so it is latent rather than broken. Wrap the core calls the way deleteTask already does and let the refusal's message land in the error banner.

## Indexes for epics

---
id: BD-78
type: tech
status: todo
order: 2100
links:
  - type: relates
    to: BD-126
---

Indexes for releases with tasks in epic

## Customizable docs root

---
id: BD-80
type: feature
status: todo
order: 2200
---

## Clone a task

---
id: BD-91
type: feature
status: todo
order: 2300
links:
  - type: relates
    to: BD-51
  - type: relates
    to: BD-130
---

Clone button near delete

## Optional progress bar for checklist

---
id: BD-93
type: feature
status: todo
order: 2400
---

## Manage custom fields in Settings

---
id: BD-104
type: feature
status: todo
order: 2700
---

Custom fields can only be declared by hand in config.yaml. Add, rename and remove them from the Settings dialog.

## Sandbox on a free port instead of hardcoded 5199

---
id: BD-106
type: tech
status: todo
order: 2800
---

scripts/dev-sandbox.mjs hardcodes `const PORT = "5199"` and passes `--strictPort`, so a second sandbox refuses to start. The board data is already per-run (`mkdtemp`) — only the port collides. This is what blocks grooming or testing two tasks in parallel: whichever session comes second cannot bring its sandbox up.

Take a free port instead: `net.createServer().listen(0)`, read `address().port`, close it, hand that number to Vite, keep `--strictPort`. Honour `BOARDOWN_SANDBOX_PORT` when it is set. A random number out of a range is not enough — it can be taken just as well, and the failure looks the same.

The script already prints `sandbox url: http://localhost:<port>`. With a variable port that line becomes the only way to learn the address, so it has to stay stable and easy to grep.

Three agent-facing places carry the number today and have to follow in the same change:
- `.claude/agents/manual-tester.md` — the sample output showing 5199, and the cleanup command that kills whatever listens on 5199, which under parallel work would kill the sandbox of another session
- `CLAUDE.md` — "The sandbox (`pnpm dev:sandbox`, port 5199)"

## Normalize slug filenames to NFC

---
id: BD-110
type: tech
status: todo
order: 3000
---

`sanitizeFilenameForFs` keeps non-ASCII characters as typed and never normalizes them, so `epics/рост-и-geo.md` is stored NFC on Linux and NFD on macOS — the classic "the file changed but the diff is empty" on a mixed team. Normalize the derived name to NFC and warn about non-ASCII slugs in the docs. A slug transliteration option in config.yaml is a second level, decided separately.
