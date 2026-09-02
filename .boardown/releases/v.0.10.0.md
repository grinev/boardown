---
status: future
name: v.0.10.0
---

## Change releases order in backlog

---
id: BD-23
type: feature
status: todo
order: 300
---

## Operation notifications

---
id: BD-79
type: feature
status: todo
epic: ux-polish
order: 200
---

## Add labels to tasks and label filters

---
id: BD-29
type: feature
status: todo
order: 100
---

## CLI: apply a batch of operations from stdin

---
id: BD-107
type: feature
status: todo
epic: cli
order: 250
---

Setting up one board took 23 CLI calls: 4 epics, 10 tasks, 6 checklist items, 2 status marks, 1 link. Each round-trip can fail and leave the board half-built. `boardown apply -` reads a JSON array of operations from stdin and applies them through `writeAll` — all of them or none.

Needs grooming: how an operation references an id created earlier in the same batch, `--dry-run`, the shape of the response (one result per operation), and what happens when a core invariant refuses mid-batch. Widening the published command set is the human's call.

## CLI: batch checklist add and done

---
id: BD-92
type: feature
status: todo
epic: cli
order: 400
---

task checklist add|done|undone|rm take one item per call, so filling a six-item acceptance list is six invocations and six rewrites of the release file. Agents work in batches: accept several texts in one add, and several item ids in one done/undone/rm.

Creation has the same cost: add a repeatable `--checklist` to `task add`, the way `--field` already works, so a task and its six items land in one call.

## Add skill for boardown cli

---
id: BD-77
type: docs
status: todo
order: 500
---
