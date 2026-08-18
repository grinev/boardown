---
title: Principles
---

How boardown decides. These are not aspirations — each one was read back out of decisions the
project already made, and each one **forbids something a reasonable developer would otherwise do**.

Use them to settle a fork, not to justify one after the fact. If a principle does not rule out one of
the options in front of you, it is not the principle you need — look further down, or the fork
belongs to the human (see the last section).

Derived August 2026 from `PRODUCT.md`, `CLAUDE.md`, the pages in this wiki, and the *Decided by
default* sections of 27 feature specs. History lives in this file's git log.

## 1. The file on disk belongs to the user, not to the app

The screen tells the truth about the disk; the app does not bring the disk in line with its own
model. A board already over its WIP limit is a valid board — the header reads `4 / 3` and nothing
moves. A `done` task hand-edited into a future release loads as it is. A relocated task carries its
status; nothing normalises it to `todo`.

*Forbids:* repairing on load, normalising on move, retroactive enforcement, and writing a key the
user never wrote — which is why `priority` stays `.optional()` rather than taking a Zod `.default`,
"because that erases the distinction between absent and explicitly-set … and the serializer would
then write the key back into every task it touches".

## 2. A diff is a feature

Every write is shaped so that the git diff is small, honest and mergeable. Block order in a file is
insertion order and carries no meaning; a status change is two lines inside one task's own
frontmatter, so two branches touching different tasks in the same release merge cleanly.

*Forbids:* re-sorting task blocks on write, normalising a file on read — and it reaches into the
data model, not just the writer: priority is "a **label, never a sort key** … the property that keeps
a status change a two-line diff".

## 3. Git is the only safety net

No trash bin, no backups, no undo. Deletion is permanent, and removing a field from `customFields`
drops its stored values on the next write.

That stance is only honest with its own counterweight: **nothing the user cannot see is ever
destroyed.** A folder deletes only when empty, and `removeDir` re-lists it before removing so a file
that appeared since load aborts the deletion instead of going with it.

## 4. Isolate a failure; never paper over it

A broken file does not block the others; a broken task does not block its siblings; problems surface
in a banner. But a present-but-invalid `config.yaml` is a hard error — never a fallback to defaults,
never a half-honoured field list — because a value in the file must never be a lie.

The order, when these pull apart: **do not lie → do not crash → do not repair.** A resolver throws on
an unresolvable filename rather than skipping it, since "a silently dropped write is worse than a
loud failure". A multi-file write checks every target first, so "one stale release aborts the whole
rename rather than half-applying it". And a failure in something auxiliary degrades instead of
spreading: "losing logs must never cost the developer the app".

## 5. Duplicate shape freely; never duplicate a rule

The most-used principle here, and the one that looks like two contradictory ones.

**Shape is copied without apology.** A dedicated kebab menu and a dedicated confirm dialog rather
than a generic `Menu`/`ConfirmDialog` — one caller each. A 20-line CSS rule copied into a second
module: "two occurrences … is not an abstraction; a third would be the moment to extract". No shared
`DialogHeader` across five headers that genuinely differ. No `isDone` helper for one comparison in
two files.

**A rule has exactly one home, and that home is `core`.** Two implementations of "does this task
match this text" "would drift on the first change". Link cleanup lives in `core` because "it is a
rule about the data, both shells need it, and the CLI would otherwise re-implement it". "Absent means
medium" resolves in `core`, not at four call sites, because "each getting it wrong is a silent
behaviour bug rather than a type error".

**The test that tells them apart is not how many places, but whether a divergence would be
visible.** Copied autocomplete wiring was extracted at three sites because dropping one line of it is
"invisible until someone moves the caret with an arrow key"; a copied status comparison was left
alone because a divergence there shows up immediately. Put practically: **a box gets copied, a
behaviour gets extracted.** A 24-swatch grid was pulled into a shared component on its *second* use
because "two hand-kept-in-sync 24-swatch grids is exactly the drift" — while its Save/Cancel styling
stayed duplicated in the same change, since "the shared *component* extraction earned its keep
because it carried behaviour and a11y contract, not just a box".

Three corollaries:

- **`core` supplies facts; a surface applies its own policy.** The shared search function "classifies
  rather than answers yes/no — it reports *where* the match landed", so the UI builds three tiers and
  a ten-row cap while the CLI, being agent-facing, returns everything it matches. The same split lets
  `epic edit --color` accept any hex while the UI offers only the palette: "restricting it here would
  be a new, inconsistent rule".
- **A rule earns a home in `core` only when more than one surface consumes it.** The task-ref lexer
  stayed in `ui/utils` — "display-only concern; `core`/CLI have no consumer for it".
- **New shared mechanics go in the wrapper, never into an interface five shells implement.**
  `writeAll` and `moveFile` sit on the guard and compose `write` + `remove`, so "no shell adapter
  grows a method"; reading a project file became a separate read-only capability rather than a root
  parameter on `FsAdapter`, since "widening it would put arbitrary project paths in reach of every
  existing write path".

## 6. Refuse by removing the option, not by complaining afterwards

A status outside the current release is a static pill, not a greyed dropdown — "a greyed-out dropdown
trigger reads as 'temporarily unavailable'". Read-only means *render the value and drop the editor*,
never *render a disabled control*. A full column is dimmed and refuses the drop. Nothing is announced
after the fact.

*Forbids:* a toast, a banner, or "try it and get an error" as the way a rule is communicated. The app
has **no global notification surface at all**, and one is not created for a single rule — building it
"for one rule is out of proportion". Success is silent too: a release file quietly follows its
renamed release, because "anything announcing it would make an implementation detail into a
user-facing event".

The other half: when a refusal *is* possible, it must be visible where the user is standing. A delete
writes to disk before updating the snapshot, so a refused delete stays legible in the dialog the user
is looking at.

## 7. Prefer a construction that cannot be forgotten to a rule that must be remembered

Doc tokens inside code spans stay literal because a remark plugin excludes them "by construction
instead of by a rule someone has to maintain". The store's `set` is wrapped once so every error path
is logged and "cannot be forgotten by a future call site". Renaming lives inside `editRelease`, since
"one op keeps it impossible to change a name without moving the file". The list of "no dialog open"
flags is one constant both sites spread — "what keeps this fixed for the *next* dialog rather than
only for today's sixteen". The default log sink is a no-op rather than stderr, so forgetting to
install one can never leak output to a user.

Same reasoning inverted: a breaking interface change is welcomed when it makes the compiler do the
remembering — the `list` shape change "is a compile error at each of the seven sites, which is the
point — nothing silently keeps the old behaviour".

*Corollary:* when a rule is the thing most likely to regress, it moves to where a test can reach it.
The link tokenizer left the component because its rules "are the rules most likely to regress"; the
desktop navigation policy became a pure module because "it is the only part of the feature reachable
by a test".

## 8. Compute at read time; store nothing derived; claim nothing unchecked

Links are a rendering affordance, not a data format: the text on disk stays literally what the user
typed, nothing is mirrored into frontmatter, nothing is cached, and reopening a preview re-reads the
file. Repo links always render as links because "the repo is not indexed and cannot be — checking
would mean a filesystem call per token on every render". The board is loaded whole and queried in
memory; there are no indexes — and a feature that would need a database is the wrong feature.

*Forbids:* caches, indexes, derived fields on disk — and equally, an interface that promises what it
has not verified. Non-markdown files are ignored by the docs tree rather than listed, because
"listing a `.png` would promise a viewer that does not exist".

## 9. Uniformity beats a local improvement

Do not make one place better in a way that puts it out of step with the rest. A malformed `links`
entry fails the whole task, because "making one field lenient while `checklist`, `notes` and `type`
are not would be an inconsistency, not an improvement". Bare URLs are not auto-linked, since "doing
it here first would be the inconsistency this spec exists to remove". Titles and checklist items stay
link-free, or "the same text would look different in two places". New sites reuse existing wording
verbatim rather than inventing their own.

This outranks a late correction to a spec: a reviewer's note was accepted as a spec defect and
rejected as a code change, because fixing it "would alter six already-working surfaces to satisfy a
sentence I wrote myself".

## 10. The agent is a first-class user

The CLI is a published contract: a stable JSON envelope, one error code per rule (`ARCHIVED`,
`STATUS_LOCKED`, `WIP_LIMIT`), and a `schema` command that states the rules up front — the WIP limit
is reported "so an agent reads the ceiling instead of discovering it by failing". An undeclared
`--field` key is a `USAGE` error rather than a silent write, because "an agent that gets `USAGE` back
fixes itself, one that gets `ok` does not". `task rm` asks for no confirmation; a filter returns
everything it matches, with no cap.

*Forbids:* a rule discoverable only by hitting it; output that has to be parsed (`{done, total}`,
never `"1/3"`); a contract made selectively lossy — stripping custom values under `--full` "would
make `--full` lossy for the agents the CLI exists to serve".

## 11. The format may grow; the schema may not lie; break loudly

Storage is shaped for what is coming — `wipLimits` is a map keyed by status, `customFields` carries a
`type` with one legal value, a link record carries a type that declares its inverse — but validation
enforces only what the product does today: a `todo:` entry makes the config invalid rather than being
accepted and ignored. Adding a status later is a one-line schema change, not a migration.

Pre-1.0 there are no compatibility shims. Reserving `priority` is "a **deliberate breaking change** …
No migration, no shim, no silent takeover"; an action left unused is deleted rather than kept.

## 12. Take the user's word, not the domain's

`priority`, not `severity` — it applies to all four task types. The tab is `Docs`, the user's own
word. Level names are their four verbatim, with no invented synonyms and no borrowing of Jira's
vocabulary.

---

## When two of these pull apart

In rough order of who wins:

1. **Truth about the disk** (1) over any tidiness of the app's model.
2. **Not lying** (4) over not crashing, and both over repairing anything.
3. **One home for a rule** (5) over the convenience of a local copy; **a copy of a shape** over an
   abstraction invented on speculation.
4. **A reviewable diff** (2) over less code — `placeTaskInContainer` does extra work to preserve
   array order.
5. **Uniformity** (9) over a local improvement, including one a review just asked for.
6. **The small product** over completeness: "the dialog gains one field, it does not become a config
   editor", and the CLI gets a docs command "when there is a reason beyond symmetry".

## Not a fork at all — decide it and record it

These never rise to a question. Wording of labels, tooltips, empty states and error messages; icon
choice within the existing set; key order in serialized output; the exact shape of a component that
has one caller; whether to write a unit test for a pure function. Record them in *Decided by default*
and move on.

## Always the human's call

- **A new dependency.** "A new dependency for one traversal is not worth the question it would
  require asking."
- **Widening the scope of the task.** Extending a field to other entities "would be inventing scope,
  not preserving it"; refactoring five components is "well outside a relocation request"; a missing
  error surface elsewhere in the app stays missing.
- **Infrastructure introduced under cover of a feature** — a component-test harness "would be a
  testing-infrastructure decision smuggled in under a rendering change".
- **A change to a published contract**: the CLI's command set and flags, the on-disk format.
- **A deliberate breaking change**, even when principle 11 permits it.
