---
title: Why markdown on disk
---

**Decision:** the board is a folder of markdown files in the project repo, not a database or a
hosted service.

## Why

- **Git is the whole infrastructure.** History, blame, branching, revert, sync and backup all come
  free. There is no server, no account and no migration story to own.
- **A change is reviewable.** An agent or a script editing the board produces a diff you read in
  the same PR as the code. This is the reason the CLI exists at all.
- **It survives the tool.** If boardown disappears, the board is still a readable set of notes.

## The cost we accepted

- No queries. Anything cross-cutting means loading the whole board — which is why `loadBoard`
  reads everything eagerly and keeps it in one snapshot.
- No transactions. Multi-file changes are guarded by hand (`writeAll`), not by a database.
- Concurrent edits are detected, not merged: we compare `lastModified` and refuse the write.

## Shape of a file

Frontmatter for the container, then `## H2` task sections each with their own frontmatter block:

```markdown
---
status: current
name: "1.10"
---

## Implement card drag & drop

---
id: BD-1
type: feature
status: in-progress
order: 100
---

Description text.
```

Doc pages are the exception: no task sections, one optional `title` in frontmatter, body is the
whole page.

## Rules that follow from this

- Validate every frontmatter block through a Zod schema.
- Never auto-rewrite a file the parser failed to fully understand.
- A broken file must not block the others, and a broken task must not block its siblings.
