---
title: Architecture
---

# Architecture

The board is **markdown on disk**. Everything below is here to exercise the
renderer, so it deliberately uses every construct the Docs tab claims to support.

## Packages

| Package | Role |
| --- | --- |
| `core` | schemas, parser, board ops |
| `ui` | React app |
| `cli` | agent-facing shell |

## Rules

1. `core` imports nothing platform-specific.
2. `ui` receives an `FsAdapter` from its shell.
3. ~~Backwards-compatibility shims~~ — not before 1.0.

- [ ] unchecked task item
- [x] checked task item

> A blockquote, for the quiet asides.

Inline `code`, a [link](https://example.com), and a fenced block:

```ts
export const answer = 42;
```

---

<script>alert('this must render as text, not run')</script>
