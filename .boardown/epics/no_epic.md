---
{}
---

## Customizable task types

---
id: BD-52
type: feature
status: todo
order: 800
---

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

## Add labels to tasks and label filters

---
id: BD-29
type: feature
status: todo
order: 1200
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

## Add skill for boardown cli

---
id: BD-77
type: docs
status: todo
order: 600
---

## Indexes for epics

---
id: BD-78
type: tech
status: todo
order: 1900
---

Indexes for closed releases with tasks in epic

## Operation notifications

---
id: BD-79
type: feature
status: todo
order: 100
---

## Customizable docs root

---
id: BD-80
type: feature
status: todo
order: 2000
---
