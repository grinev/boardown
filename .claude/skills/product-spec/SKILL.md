---
name: product-spec
description: The format of a boardown product spec — the `product.md` a grooming session writes with the user, one closed decision per line. Use when writing or extending a spec during /groom, and when reading one at the start of /feature. Fixes the sections, the line format, and the rule that every line about the product must be observable from outside.
---

# Writing a product spec

The spec is written **before the work starts**: a grooming session with the user
closes the forks, and `product.md` is what that session leaves behind. Everything
downstream reads it — the technical plan answers it, the `architect` checks the
plan against it, the `expert` settles forks inside it, the `manual-tester` derives
its scenarios from it. Whoever implements the task does not write it and does not
rewrite it.

**It is a protocol of closed decisions, not a description of the feature.** One
line per decision, stated as a decision. Prose about how good the feature will be,
reasoning beyond half a line, rejected alternatives, code, file or module names,
and anything the codebase already answers all stay out — they cost the reader's
attention and none of them survives contact with the implementation.

## Every line about the product is observable from outside

The test for a line under *Look* or *Behaviour*: **can someone see whether it is
true** — on screen, in the file on disk, or in the CLI's output? If yes it is a
spec line, and the tester can build a scenario from it without being handed one.
If no, it belongs under *Decided by default* or *Technical forks*, where it reads
as a constraint rather than as behaviour.

Write:

> - empty release — the menu item is disabled
> - switching writes the key immediately; a reload shows the same release

Do not write:

> - the export handles errors cleanly
> - the store keeps the selection in one place

This is why the spec carries no "acceptance criteria" section: written this way
the lines **are** the criteria, and the tester writes his own scenarios over them
— which is the point, since he is the one who finds what the spec did not think
of.

## Sections

These names, this order, only the ones that apply:

````markdown
# BD-42 · Export board to CSV

## Source request

> i want to dump the board to CSV so i can open it in excel

## Look

- action — item in the header menu, not a button
  [shot: `refs/header-menu.png` — the header as it is today]
- result — "File saved" toast, no modal

## Behaviour

- exports the current release, not the whole board
- empty release — item disabled

## Reach

board yes · backlog yes · archive no · epic no

## CLI

- `board export --csv <path>` — new subcommand, writes and prints the path

## Technical forks

- CSV written by hand, no new dependency

## Decided by default

- comma as separator, not semicolon — both open in Excel, comma is the standard

## Out of scope

- no scheduled export, no export of the archive

## Overlaps

- BD-51 shares the config shape — it ships first
````

**Source request** — the user's own words, verbatim, in whatever language he said
them, plus one line per reference he attached. It is the baseline the run is
audited against: without it nobody, including the user in a month, can tell what
he asked for apart from what was filled in around it. A sentence he typed to
`/groom` goes here as it is; a conversation is reduced to the two or three lines
that actually set the task.

**Reach** — one line, naming every sibling surface the behaviour could plausibly
touch, each with yes or no. A sibling nobody listed is the most expensive mistake
this document can carry.

**CLI** — the public contract, whenever the task touches it: command names, flags,
the shape of the JSON. Restate it exactly; this is a published surface.

**Decided by default** — what was settled without the user, each with its one-line
reason. During `/feature` this section keeps growing: a call the `expert` made is
appended marked `(expert)`, one the user made mid-run marked `(human)`. Unmarked
means the author of that phase decided it.

**Out of scope** — what he ruled out, and the consequence he does not want built.
Not a wish list of what might come later.

## Size, and what it means when it is exceeded

**Twenty-five to thirty lines** is normal for a feature of this product's size. At
fifty the file is describing the feature instead of deciding it, and the task is
probably two — split it on the board rather than write a longer file.

## References

A frame a line depends on is copied into `.claude/specs/<slug>/refs/` and cited
from there, never from `.playwright-mcp/`: that folder is scratch, thousands of
frames deep, and wiped without warning.

A frame taken during grooming is a **photograph of the product as it is today** —
it shows what must not move. A mockup the user attached is the opposite: it shows
what to build, and every fork it shows is settled by it. Say which kind it is on
the line that cites it.

## An open fork is not written down as a fork

Either it is closed and it is a line, or it is not in the file. A spec carrying
its own open questions hands them to whoever implements the task — exactly the
person who should not be answering them.
