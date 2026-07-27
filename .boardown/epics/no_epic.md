---
{}
---

## Customizable task types

---
id: BD-52
type: feature
status: todo
order: 850
---

## Add optimistic locks on item save

---
id: BD-30
type: tech
status: todo
order: 1100
---

## Add assignee field to task

---
id: BD-50
type: feature
status: todo
order: 1200
---

## View and edit release description

---
id: BD-28
type: feature
status: todo
order: 1300
---

## Add release dates

---
id: BD-20
type: feature
status: todo
order: 1400
---

## Edit epic color

---
id: BD-21
type: feature
status: todo
order: 1500
---

## Multiple active releases support

---
id: BD-22
type: feature
status: todo
order: 1600
---

## Change releases order in backlog

---
id: BD-23
type: feature
status: todo
order: 1700
---

## Add labels to tasks and label filters

---
id: BD-29
type: feature
status: todo
order: 1800
---

## Show last updated date on tasks

---
id: BD-32
type: feature
status: todo
order: 1900
---

## Add localization infrastructure

---
id: BD-38
type: tech
status: todo
order: 2000
---

## Task activity/history

---
id: BD-60
type: feature
status: todo
order: 2100
---

Show task history from git

## Add task links types

---
id: BD-57
type: feature
status: todo
order: 450
---

## Make task IDs survive parallel branches

---
id: BD-63
type: tech
status: todo
order: 2200
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

## Add task severity

---
id: BD-67
type: feature
status: todo
order: 650
---
