---
name: tech-plan
description: Write the technical plan for a boardown feature — which files change, what logic each gains, how the data flows. Use after reading the task's product spec and before writing any code (the /feature flow's phase 2). Fixes the file's structure and, above all, the plan's altitude: file-level, never symbol-level.
---

# Writing a technical plan

The plan answers the product spec: for every criterion, every edge case and every
surface the spec fixed, it says where in the code that lands. It is read by the
architect and then by you, implementing it.

Prose only — **no code fragments**. Know the code before you write it: every claim
about an existing module must be true today.

**Find that out through the `Explore` agent**, not by reading the packages
yourself — which board-ops exist, where the conflict guard lives, whether there is
already a utility for what you are about to add, which component draws a table like
the one you need. It returns the conclusion; the file dumps stay in its context
instead of filling yours. Read a file directly only when you already know it is the
one and you need its exact content.

## The altitude — the thing this file exists to get right

**File-level, not symbol-level.** The plan says *what logic lands in which file,
and how the data moves between them*. It does not write the code in prose.

Write:

> `schemas.ts` gains an optional array of links on the task frontmatter, validated
> like the existing checklist — a malformed entry fails the whole task, so it
> surfaces as a parse problem and the parser itself needs no change.

Do **not** write: the identifier of that array, the fields of each entry, the
order the keys are emitted in, the parameter list of a new function, the props of
a new component, its CSS class names.

Those are decisions you make **while writing the code**, in five seconds, with the
file open in front of you. Spelled out in the plan, each one becomes a claim
somebody has to verify — and the architect pays for every one of them.

Two things stay concrete, because they are contracts rather than implementation:
**what lands on disk** (a new frontmatter key, a change to `config.yaml`) and
**the CLI's public surface** (command names, flags, JSON shape). The product spec
already fixed both; restate them exactly.

**Size is the tell.** A feature of this product's scale is a plan of around **a
hundred lines**. At three hundred you have written the implementation twice — once
in prose, once in TypeScript — and only the second one runs.

## Structure of `tech.md`

These sections, these names, this order.

```markdown
# <Feature> — technical plan

## Context          # what exists today that this builds on, in a paragraph
## Approach         # the shape of the change; the trade-offs you weighed and chose
## Changes by file  # one `### <package>/<path>` per file, what logic it gains
## Data flow        # the path of a change through core → ui → shell / cli
## What breaks      # callers, shells, files already on disk — and how you handle it
## Edge cases       # the ones this feature can actually reach, and what happens
## Test plan        # unit in core/ui/cli vs. what must be driven in a browser
## Docs             # the Definition of Done: PRODUCT.md, README.md, CLAUDE.md
## Decided by default
```

### Context

What is already there and gets extended — the existing board-op, the existing
section of the dialog, the existing CLI subcommand family. One paragraph, so the
reader knows what the change is standing on.

### Approach

The shape of the change in a few sentences, then the forks you hit and which way
you went. A rejected alternative gets one line and a reason; do not survey.

### Changes by file

One `###` heading per file, its path as the heading. Under it, what logic that
file gains — at the altitude above. If a file needs three sentences, it gets
three; if it needs one, one.

### Data flow

The path of one operation end to end: which layer starts it, which board-op in
`core` decides it, what comes back, who persists it through the `FsAdapter`, and
what the other shells inherit for free. This is what the architect uses to judge
whether the logic sits in the right layer, so it is worth being precise here —
precise about the **path**, not about signatures.

### What breaks

Existing callers, the other shells, and files already written to disk by an older
version. Say what happens to each. Pre-1.0 there are no compat shims — if
something changes, it changes.

### Edge cases

**They live here, not in the product spec.** The spec says what the feature does;
saying what happens at the edges takes knowing where the code stands, which is
this document's job. Walk the ones this product actually reaches and say what
happens to each: empty or whitespace-only input, a task in a **finished** release
(read-only), a cancelled modal (nothing may be written), text carrying YAML
metacharacters, a missing or malformed file, an external change between load and
write. Whichever the feature can hit — and only those; a list of edges it cannot
reach is padding the architect has to read.

### Test plan

What gets a unit test (in `core`, `ui`, `cli`) and what has to be driven in a real
browser against `pnpm dev:sandbox` — never the repo's own `.boardown/`. Name the
scenarios, not the assertions.

### Docs

This project's Definition of Done includes the documentation. `PRODUCT.md`
whenever the product's behaviour or storage changes; `README.md` and `CLAUDE.md`
where the change reaches them (a new script, a new rule, a new package). Plans
forget this, and the architect now checks for it.

### Decided by default

The technical calls you made alone, one line of reason each. Anything that touches
a new dependency, the on-disk format, or the CLI's public contract is **not** a
default — it is a question for the user.
