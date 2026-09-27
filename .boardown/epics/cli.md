---
name: Cli
color: "#475569"
---

## CLI defects found while reviewing the agent skill

---
id: BD-137
type: bug
status: todo
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
