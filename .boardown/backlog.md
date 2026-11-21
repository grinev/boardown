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

## Match the project list page styling to the board

---
id: BD-118
type: tech
status: todo
epic: web-app
order: 400
links:
  - type: relates
    to: BD-144
  - type: relates
    to: BD-152
updatedAt: "2026-11-20T09:15:15.342Z"
---

The project list page at / in registry mode carries its own minimal styling — rows, buttons and dialogs assembled from currentColor and the system Canvas/CanvasText colours — so it only resembles the board rather than looking like it. It should read as the same product: the surfaces, controls and dialogs of the board UI, in light and in dark. The page serves several boards at once while a theme belongs to one board's config, so what it follows when the boards disagree is part of the task.

## The project list page does not render in Orca's built-in browser

---
id: BD-119
type: bug
status: todo
epic: web-app
order: 700
links:
  - type: relates
    to: BD-152
updatedAt: "2026-11-20T09:15:15.342Z"
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

## Delete a release

---
id: BD-145
type: feature
status: todo
order: 3100
---

Allow deleting a release. Deleting asks where its tasks go, with the same dialog as completing a release (CompleteReleaseDialog): move every task of the release into another release or into the backlog, then remove the release file.

## CLI: apply a batch of operations from stdin

---
id: BD-107
type: feature
status: todo
epic: cli
order: 3200
links:
  - type: relates
    to: BD-130
updatedAt: "2026-11-16T12:34:55.946Z"
---

Setting up one board took 23 CLI calls: 4 epics, 10 tasks, 6 checklist items, 2 status marks, 1 link. Each round-trip can fail and leave the board half-built. `boardown apply -` reads a JSON array of operations from stdin and applies them through `writeAll` — all of them or none.

Needs grooming: how an operation references an id created earlier in the same batch, `--dry-run`, the shape of the response (one result per operation), and what happens when a core invariant refuses mid-batch. Widening the published command set is the human's call.

## Defer non-visible task containers after board startup

---
id: BD-153
type: tech
status: todo
epic: web-app
order: 3300
links:
  - type: blocked-by
    to: BD-151
  - type: relates
    to: BD-63
createdAt: "2026-11-20T09:55:16.607Z"
updatedAt: "2026-11-20T10:48:24.249Z"
---

Follow-up to BD-151 after the Docs-only startup improvement. Make the first usable Board depend on validated settings, the necessary release and epic metadata, and the selected active release, not on task bodies from unselected active releases, future releases, finished releases or the backlog. Load deferred tasks when their views, global search, links, or writes need them; keep the same coverage and distinguish loading or errors from confirmed absence. Preserve ID uniqueness across all containers, mirrored links, legacy backlog conversion, write-version and unreadable-file protection, and silent refresh. Do not eagerly crawl the deferred task bodies in the background. Use the same realistic-board benchmark as BD-151. Scope and implementation details still need their own grooming; no Dev Studio changes or npm publication.

## Guide repair of ambiguous duplicate task IDs

---
id: BD-154
type: feature
status: todo
order: 3400
links:
  - type: blocked-by
    to: BD-63
createdAt: "2026-11-20T10:33:25.091Z"
updatedAt: "2026-11-20T10:33:25.091Z"
---

Follow-up to BD-63 for duplicate numeric task IDs that cannot be repaired automatically. Let the user explicitly choose which task keeps the original ID and decide ownership of ambiguous structured links, references in board text and docs, and attachments sharing the old ID directory. Show the affected tasks, references and files before saving; never guess link or attachment ownership or rewrite external URLs or Git history. Preserve human-readable numeric IDs and guarded all-or-nothing writes. This task still needs its own grooming; allocation across independent clones and merge conflicts in shared container files are separate problems.

## No DOM test environment for packages/ui

---
id: BD-111
type: tech
status: todo
epic: tests
order: 3500
links:
  - type: relates
    to: BD-100
updatedAt: "2026-11-20T11:28:45.788Z"
---

All five packages run vitest with environment: 'node', and the repo has no jsdom, happy-dom or testing-library dependency, so nothing that renders React can be covered automatically. Hooks that measure the DOM ship with the manual tester as their only witness — packages/ui/src/hooks/use-auto-grow.ts, added by BD-100, is the current example. Decide whether packages/ui gets a DOM environment plus a first set of component and hook tests, or whether Playwright stays the only UI coverage.
