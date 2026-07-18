---
title: Product overview
---

A lightweight, local-first task board that lives **inside your project's git repo**. Tasks are
plain markdown files, so the board diffs naturally with the rest of the codebase and needs no
server, account or sync service.

> The authoritative product document is [`PRODUCT.md`](../../PRODUCT.md) at the repo root. This
> page is the short version — when the two disagree, PRODUCT.md wins.

## Who it is for

A solo developer who wants a simple scrum-style board next to their code, with version history
coming for free from git.

## The model in one screen

| Concept | Lives in | Notes |
| --- | --- | --- |
| **Task** | a section inside a release or epic file | `id`, `title`, `type`, `status`, `order`, optional checklist / notes / links |
| **Release** | `releases/<slug>.md` | lifecycle `future → current → finished`; exactly one `current` |
| **Epic** | `epics/<slug>.md` | cross-release grouping, and the storage container for its unscheduled tasks |
| **Backlog** | `epics/no_epic.md` + every `epics/*.md` | the conceptual set of tasks with no release |
| **Doc page** | `docs/**/*.md` | this wiki; not connected to tasks |

## Principles that keep coming up

- **Markdown is the product.** Every change is a plain-text git diff, reviewable and revertible.
  A feature that would need a database is the wrong feature.
- **Lenient parsing.** A broken file never blocks the others, problems surface in a banner, and
  the app *never* rewrites a file it could not fully understand.
- **No automated backups.** Git is the safety net. That is why deletion is permanent and there is
  no trash bin anywhere in the UI.
- **The product is intentionally small.** Feature creep gets pushed back on.

## Shells

The React app (`@boardown/ui`) is embedded in platform shells, each supplying an `FsAdapter`:

1. **VS Code extension** — the canonical way to use boardown.
2. **Electron desktop app** — Windows / macOS / Linux.
3. **CLI** — headless, agent-facing, published to npm.
4. **Browser dev shell** — for working on the UI from sources; not a distribution channel.
