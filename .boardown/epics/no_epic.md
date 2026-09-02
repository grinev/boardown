---
{}
---

## Customizable task types

---
id: BD-52
type: feature
status: todo
order: 800
links:
  - type: relates
    to: BD-51
---

Four types, all of them about code: bug, feature, docs, tech. On a board that also tracks operations and marketing (submit a sitemap to Bing, find a traffic channel, measure the effect in three weeks) everything lands in tech, and tech stops meaning anything.

Two options to settle on grooming: types declared in config.yaml — the customFields mechanics already fit and principle 11 allows the format to grow, but icons and colors in the UI come with it — or simply adding ops/chore to the enum. Same shape as BD-51 (custom statuses); decide the two together.

## Add assignee field to task

---
id: BD-50
type: feature
status: todo
order: 1000
---

## Add release dates

---
id: BD-20
type: feature
status: todo
order: 1100
---

## Make task IDs survive parallel branches

---
id: BD-63
type: tech
status: todo
order: 1600
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
order: 1700
---

In the status === 'onboarding' branch App.tsx early-returns and renders only OnboardingDialog, so ConflictDialog never mounts. Onboarding writes config.yaml through the pre-load guard, which carries an empty version map: if the file appeared on disk between the missing-config check and the submit, check() sees known === undefined, calls onConflict and throws ConflictError. The user gets nothing but the inline error in the onboarding form — no Reload button, no way forward — a dead end they can only leave by reopening the folder. Found while working on BD-69; a separate defect from the modal stacking.

## Surface core invariant refusals in the UI

---
id: BD-75
type: tech
status: todo
order: 1800
---

The store calls core board-ops outside the try/catch that only wraps the fs write, so a process-invariant throw (a finished release is read-only, a status only changes in the current release) becomes an unhandled promise rejection instead of reaching errorMessage. No path into it is reachable today — the UI hides the controls that would make those calls — so it is latent rather than broken. Wrap the core calls the way deleteTask already does and let the refusal's message land in the error banner.

## Indexes for epics

---
id: BD-78
type: tech
status: todo
order: 1900
---

Indexes for closed releases with tasks in epic

## Customizable docs root

---
id: BD-80
type: feature
status: todo
order: 2000
---

## Allow linking tasks to tasks in finished releases

---
id: BD-89
type: feature
status: todo
order: 2100
---

Adding a link to a task that sits in a finished release fails:

```
$ boardown task link add OTB-54 OTB-28
{"ok":false,"error":{"code":"ARCHIVED","message":"Cannot change the links of a task in a finished release"}}
```

The reverse direction fails too — links are symmetric, so the write always lands on the archived card as well.

## Why it hurts

A new task very often *is* the consequence of a finished one, and that is exactly when the relation is worth recording. Two real cases from opencode-telegram-bot on 2026-08-15:

- a bug about settings recovery is a direct follow-up of the atomic-write task shipped in v0.23.0;
- a stale README line is a follow-up of the feature shipped in v0.23.1.

Both relations had to be written as plain text inside the description — which is what links exist to avoid. The archive stays clean at the cost of losing the history that makes it useful.

## Directions to pick from before implementing

- treat links as metadata rather than content: allow adding and removing them on archived tasks while title, description and status stay frozen;
- or keep the link one-sided on the live task, and render the archived counterpart as read-only backlink;
- or allow the write and accept that a finished release file changes.

Whichever is chosen, `task link rm` and any archive-integrity checks must follow the same rule, and the UI needs to show backlinks on archived tasks.

## Clone a task

---
id: BD-91
type: feature
status: todo
order: 2200
links:
  - type: relates
    to: BD-51
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

## Show full release description on board by hover

---
id: BD-96
type: feature
status: todo
order: 2600
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

## STATUS_LOCKED message names the next step

---
id: BD-109
type: feature
status: todo
order: 2900
---

The refusal explains the rule ("a task's status can only be changed in the current release") but not the way out of it. Append the command that resolves it: `boardown task edit BD-2 --release <slug>`. The message lives in core/board-ops.ts, so the CLI error and the UI tooltip both inherit it.

Reported case: a task is half done (code written, waiting for deploy) but sits in an epic, so it cannot be marked in-progress — a release had to be created just to make the board tell the truth. Whether the lock itself should be relaxed is a separate product question; this task only names the next step.

## Normalize slug filenames to NFC

---
id: BD-110
type: tech
status: todo
order: 3000
---

`sanitizeFilenameForFs` keeps non-ASCII characters as typed and never normalizes them, so `epics/рост-и-geo.md` is stored NFC on Linux and NFD on macOS — the classic "the file changed but the diff is empty" on a mixed team. Normalize the derived name to NFC and warn about non-ASCII slugs in the docs. A slug transliteration option in config.yaml is a second level, decided separately.

## Option for disable status change in backlog

---
id: BD-112
type: feature
status: todo
order: 3100
---
