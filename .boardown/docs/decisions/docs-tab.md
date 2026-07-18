---
title: Docs tab decisions
---

The decisions behind this very wiki, recorded while building it.

## Folders are real entities

A page tree with **nested folders**, not a flat list. That forced the `FsAdapter` interface open:
`list` now reports whether each entry is a directory, and `mkdir` / `remove` were added — seven
implementation sites plus the two IPC method unions.

The alternative, a flat `docs/*.md`, would have worked on the existing interface. It was rejected
because a wiki that cannot group pages stops being useful at about twenty pages.

## Only an empty folder can be deleted

The first cut deleted a folder and everything beneath it, with the confirmation naming the page
count. That was **overruled**: the trash on a non-empty folder is now disabled, and you clear its
contents first.

The reason is the project's stance on deletion generally — permanent, no trash bin, git is the
safety net. That stance is only honest when the user can see exactly what they are destroying. A
recursive delete hides pages inside collapsed folders behind a single click.

The guard mirrors this: `removeDir` re-lists the directory and refuses if anything is inside, so a
file that appeared on disk since load aborts the deletion instead of going with it.

## The title lives in frontmatter

`title:` in the page's frontmatter, with a stable slug filename derived at creation — the same
convention releases and epics already use. Editing a title never moves the file.

Rejected: filename-as-title (renaming has no `FsAdapter` support and breaks the stable-slug
convention) and first-`# H1`-as-title (cleaner files, but the title stops being a field and a page
without an H1 becomes nameless).

## No integration with tasks — yet

Docs are deliberately standalone: no links from a task to a page, no page references on a card,
and markdown rendering appears **only** in this tab. Task descriptions stay plain text with
clickable task refs.

Making a doc page linkable from a task is tracked separately; rendering markdown across the whole
board is a much larger decision about what a task description *is*, and was not bundled in here.

## Raw HTML is not rendered

`react-markdown` without `rehype-raw`, so `<script>` in a page shows as text. A wiki page is
written by the same person who reads it, so this is not a hard security boundary — but rendering
HTML would buy nothing and cost a sanitizer dependency.
