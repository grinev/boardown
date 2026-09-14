---
{}
---

## Add assignee field to task

---
id: BD-50
type: feature
status: todo
order: 1500
---

## Add release dates

---
id: BD-20
type: feature
status: todo
order: 1600
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

## Conflict modal is unreachable during onboarding

---
id: BD-70
type: bug
status: todo
order: 1900
---

In the status === 'onboarding' branch App.tsx early-returns and renders only OnboardingDialog, so ConflictDialog never mounts. Onboarding writes config.yaml through the pre-load guard, which carries an empty version map: if the file appeared on disk between the missing-config check and the submit, check() sees known === undefined, calls onConflict and throws ConflictError. The user gets nothing but the inline error in the onboarding form — no Reload button, no way forward — a dead end they can only leave by reopening the folder. Found while working on BD-69; a separate defect from the modal stacking.

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

## IconSelect: Escape inside a dialog can close the dialog instead of the select

---
id: BD-95
type: bug
status: todo
order: 2500
notes:
  - id: n1
    text: "Covered by BD-94: the same focus fix in IconSelect. Close once BD-94 is accepted; do not work separately. See .claude/specs/BD-94-picker-keyboard-nav/product.md"
    createdAt: "2026-08-19T10:47:01.980Z"
links:
  - type: relates
    to: BD-57
  - type: relates
    to: BD-94
---

Escape over an open IconSelect popup inside the task dialog can close the whole dialog instead of just the select. Pre-existing and older than BD-57; found by the tester during that run.

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

## Change releases order in backlog

---
id: BD-23
type: feature
status: todo
order: 250
---

## Attach files to tasks: image previews and downloadable files

---
id: BD-131
type: feature
status: todo
order: 3100
---

A task can carry attachments. Images are shown as a preview right inside the task; any other file is available to download.
