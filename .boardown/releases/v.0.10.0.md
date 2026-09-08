---
status: current
name: v.0.10.0
---

## CLI: batch checklist add and done

---
id: BD-92
type: feature
status: review
epic: cli
order: 2300
checklist:
  - id: c1
    text: 1. spec read, code explored, open calls settled
    done: true
  - id: c2
    text: 2. tech plan written
    done: true
  - id: c3
    text: 3. architecture review closed
    done: true
  - id: c4
    text: 4. implemented, gates green
    done: true
  - id: c5
    text: 5. code review closed
    done: true
  - id: c6
    text: 5r. review findings fixed
    done: true
  - id: c7
    text: 6. manual test passed
    done: true
  - id: c8
    text: 6r. test findings fixed
    done: true
  - id: c9
    text: 7. committed
    done: true
links:
  - type: relates
    to: BD-108
spec: "[[repo:.claude/specs/BD-92-cli-batch-checklist/spec.md]]"
plan: "[[repo:.claude/specs/BD-92-cli-batch-checklist/tech.md]]"
log: "[[repo:.claude/specs/BD-92-cli-batch-checklist/log.md]]"
session: ses_f7e114347ffeQGGkmwablwsEZB
---

task checklist add|done|undone|rm take one item per call, so filling a six-item acceptance list is six invocations and six rewrites of the release file. Agents work in batches: accept several texts in one add, and several item ids in one done/undone/rm.

Creation has the same cost: add a repeatable `--checklist` to `task add`, the way `--field` already works, so a task and its six items land in one call.

## Add skill for boardown cli

---
id: BD-77
type: docs
status: todo
order: 750
---

## Allow linking tasks to tasks in finished releases

---
id: BD-89
type: feature
status: review
order: 2200
checklist:
  - id: c1
    text: 1. spec read, code explored, open calls settled
    done: true
  - id: c2
    text: 2. tech plan written
    done: true
  - id: c3
    text: 3. architecture review closed
    done: true
  - id: c4
    text: 4. implemented, gates green
    done: true
  - id: c5
    text: 5. code review closed
    done: true
  - id: c6
    text: 5r. review findings fixed
    done: true
  - id: c7
    text: 6. manual test passed
    done: true
  - id: c8
    text: 6r. test findings fixed
    done: true
  - id: c9
    text: 7. committed
    done: true
spec: "[[repo:.claude/specs/BD-89-link-into-finished-release/spec.md]]"
plan: "[[repo:.claude/specs/BD-89-link-into-finished-release/tech.md]]"
log: "[[repo:.claude/specs/BD-89-link-into-finished-release/log.md]]"
session: ses_f7e435e4effedp9Igy6e590Z7J
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

## Customizable task types

---
id: BD-52
type: feature
status: ready
order: 1700
links:
  - type: relates
    to: BD-51
  - type: relates
    to: BD-122
  - type: relates
    to: BD-29
  - type: blocked-by
    to: BD-125
spec: "[[repo:.claude/specs/BD-52-customizable-task-types/spec.md]]"
---

Four types, all of them about code: bug, feature, docs, tech. On a board that also tracks operations and marketing (submit a sitemap to Bing, find a traffic channel, measure the effect in three weeks) everything lands in tech, and tech stops meaning anything.

Two options to settle on grooming: types declared in config.yaml — the customFields mechanics already fit and principle 11 allows the format to grow, but icons and colors in the UI come with it — or simply adding ops/chore to the enum. Same shape as BD-51 (custom statuses); decide the two together.

## Show full release description on board by hover

---
id: BD-96
type: feature
status: ready
order: 1200
spec: "[[repo:.claude/specs/BD-96-release-description-hover/spec.md]]"
---

## task get accepts several ids

---
id: BD-108
type: feature
status: ready
epic: cli
order: 1500
links:
  - type: relates
    to: BD-92
spec: "[[repo:.claude/specs/BD-108-task-get-several-ids/spec.md]]"
---

`task get` takes one id, and `task list --text` deliberately does not match ids, so reading a set of ids you already hold costs N calls. Take several at once: `task get BD-1 BD-2 BD-9`, or a repeatable `task list --id BD-1 --id BD-9` in the `--field` shape. Which of the two is a grooming decision.

## Multiple choise in backlog filters

---
id: BD-122
type: feature
status: ready
order: 1900
links:
  - type: relates
    to: BD-52
spec: "[[repo:.claude/specs/BD-122-multi-select-backlog-filters/spec.md]]"
---

## Minimum boardown version on the board

---
id: BD-125
type: feature
status: ready
order: 2000
links:
  - type: relates
    to: BD-79
  - type: blocks
    to: BD-52
  - type: blocks
    to: BD-123
  - type: blocks
    to: BD-29
  - type: blocks
    to: BD-126
  - type: blocks
    to: BD-63
spec: "[[repo:.claude/specs/BD-125-board-version-in-config/spec.md]]"
---

boardown writes its own version into config.yaml. On opening a board: a newer app updates the key; an older app offers to upgrade instead. The same rule applies in the CLI, where any command surfaces it.

## Config key to allow status changes outside an active release

---
id: BD-112
type: feature
status: ready
order: 2100
links:
  - type: relates
    to: BD-129
spec: "[[repo:.claude/specs/BD-112-status-outside-active-release/spec.md]]"
---
