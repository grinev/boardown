---
name: task-tracking
description: How a board task is carried through a run — which task you are working, where its folder is, what goes into its custom fields, the running log, how decisions are attributed and what outcome the run ends on, and what a rework round adds on top of a finished run. Use at the start of any flow that implements a task (/feature, /feature_auto, /rework_auto), and every time an artifact is produced or the run ends.
---

# Carrying a task through a run

The board is the shared memory of this project: it is what the user reads in the
evening and what another session reads tomorrow. A run that produced good code and
left the task untouched is half a run — nothing about it can be reviewed, resumed
or explained afterwards.

This skill says **what to put where**. The `boardown` CLI itself — the board model
and the command list — is the global `boardown` skill; do not rediscover it here,
and never edit files under `.boardown/` by hand.

## Which task you are working

The flow is invoked with either a task id (`BD-42`) or an idea in prose.

`boardown task get BD-42` before anything else. Read the description, the
checklist, the notes and the custom fields — `spec`, `plan`, `log`, `session`,
`outcome`.

**An empty `spec` field stops the run.** The product spec is written with the user
in `/groom`, and a run that starts without one is inventing the product from a
title. Say that the task is not groomed and stop; do not write a spec yourself and
do not proceed on the description alone.

Then, before reading the spec and before any code: `boardown task status BD-42
in-progress`, the run's first log line, and the `log` field pointing at it.

**A task already `in-progress` with fields filled in is a rework, not a new run.**
Reuse its folder, append to its log, do not overwrite the spec that is already
there and do not start a second `<slug>`. What such a round adds of its own — a
log section, checklist items, a closing note — is the last section of this skill.

## The folder, and where its name comes from

Everything the run produces lives in `.claude/specs/<slug>/`, and the folder is
named **`<TASK-ID>-<kebab-case title>`** — `BD-42-csv-export`. The id comes first
so that a directory listing sorts and reads the way the board does; `<slug>` in
these instructions always means that whole name, id included.

**The folder is already chosen** — read it out of the path in the `spec` field
and use it, whatever it is called. Inventing a second one orphans the grooming and
the user ends up with two folders for one task.

## `product.md` is the input, not a draft

Read it whole before anything else. Every line in it is a **closed decision**
taken with the user before the work started: apply it, never rewrite it, never put
it back to him as a question. What it does not mention is open and follows the
ladder in `/feature`.

The one section that grows during a run is **"Decided by default"** — calls made
along the way are appended there with their source. Nothing else in the file is
edited by a run.

## Fields carry paths, never content

Each artifact gets its field **when it is born**, not in a batch at the end:

| Field | Set it | Value |
|---|---|---|
| `spec` | never by you — `/groom` sets it when the task is groomed | `[[repo:.claude/specs/<slug>/product.md]]` |
| `plan` | after the technical plan is written | `[[repo:.claude/specs/<slug>/tech.md]]` |
| `log` | with the first line, right after the status | `[[repo:.claude/specs/<slug>/log.md]]` |
| `outcome` | last action of the run | one of the five values below |
| `session` | never in an interactive run | — |

```sh
boardown task edit BD-42 --field spec="[[repo:.claude/specs/BD-42-csv-export/product.md]]"
```

**The value is a path token or a fixed keyword. Never content, never a summary,
never an explanation.** The board is in git and public; `.claude/` is not. A
sentence you put in a field is published and its history cannot be rewritten.
`outcome` is the dangerous one — an explanation asks to be put there
(`needs-answer: not sure where the button goes`) and must not be: the value is the
keyword alone, the reason belongs in the log.

`session` is a uuid the autonomous wrapper assigns before it starts a run. An
interactive session does not know its own id — leave the field empty rather than
inventing one.

## The log

`.claude/specs/<slug>/log.md`, written **as you go**, never reconstructed at the
end. One line per event, newest at the bottom, **every line stamped with the time
it happened**:

```
- 2026-08-18 14:32:09 · phase 2 tech plan — written, architect next
- 2026-08-18 14:41:52 · expert — grouping of link rows: option B (fixed order), sure
- 2026-08-18 15:06:31 · phase 4 implementation — gates green
```

**The leading `- ` is not decoration.** The file is read through the board's `.md`
preview, where markdown collapses a single newline into a space and an unmarked log
renders as one wall of text. As list items the entries stay separate lines, and a
long one wraps under its own stamp.

**Seconds are part of the stamp, not decoration.** Phases here take minutes and
a subagent call takes seconds; a stamp cut to the minute collapses half the run
into one instant and the log stops answering what it exists for.

**Read the stamp off the machine, never off your own sense of time** — you do not
have a clock, and a run feels shorter from inside it than it was. Write the line
with the same command that reads the time, so the two cannot drift:

```sh
echo "- $(date '+%Y-%m-%d %H:%M:%S') · phase 4 implementation — gates green" >> .claude/specs/<slug>/log.md
```

It exists so a failure can be taken apart afterwards by reading its tail — by the
user in the evening, or by whoever resumes the task tomorrow. The stamps are half
of that: they show where the run stalled, which phase ate the time, and how long
a question sat waiting on the user.

Write one line at each of these moments, and one line covers it:

- **a phase opens** — its number and name;
- **a phase closes** — with the state it ended in: `gates green`, `plan updated`,
  `verdict works`;
- **a subagent comes back** — how many findings it brought, by severity. Each
  finding itself is already in its report and goes to the user in the final
  report; here it is the count that carries;
- **its findings are closed** — how many you fixed, how many you rejected, and
  the state that leaves things in;
- **a rework round** — its number and what it changed;
- **an `expert` call, or a question to the user** — the fork, the option chosen,
  how sure it was;
- **something unforeseen** — anything that changed how the run went and was not
  in the command: a file edited under you mid-run, a gate red for a reason
  outside the task, a subagent that came back empty, a plan you had to diverge
  from.

Top to bottom, a finished run reads like this:

```
- 2026-08-20 19:34:40 · phase 3 architecture review — started
- 2026-08-20 19:43:48 · phase 3 architecture review — back: 1 blocker, 1 major, 3 minor
- 2026-08-20 19:46:30 · phase 3 — findings closed: all 5 accepted, plan updated
- 2026-08-20 19:46:35 · phase 3 architecture review — closed
- 2026-08-20 19:46:40 · phase 4 implementation — started
- 2026-08-20 19:47:54 · phase 4 implementation — closed, gates green
- 2026-08-20 19:47:55 · divergence — the hook takes the ref only; the plan also gave it the value
- 2026-08-20 19:48:02 · phase 5 code review — started
- 2026-08-20 20:18:40 · phase 5 code review — back: 2 major, 2 minor
- 2026-08-20 20:22:17 · phase 5 — findings closed: 3 fixed, 1 rejected; gates green
- 2026-08-20 20:27:14 · phase 5 round 2 — back: 1 minor from the focus fix; fixed
- 2026-08-20 20:27:20 · phase 5 code review — closed
- 2026-08-20 20:28:05 · phase 6 manual test — started
- 2026-08-20 20:48:20 · phase 6 manual test — back: verdict works, 0 findings
- 2026-08-20 20:48:25 · phase 6 manual test — closed
- 2026-08-20 20:50:41 · unforeseen — CLAUDE.md edited mid-run, its commit rule now differs from the command; followed the file
```

Each of those moments is its own line with its own stamp, even when two of them
fall a second apart. Around three lines per phase is the size of a whole run.

What never goes in: a retelling of the spec or the plan, reasoning, diffs, command
output. A log you have to read whole is a log nobody reads.

## Decisions carry their source

Under "Decided by default" in the spec, a line whose call was not yours is marked:
`(expert)` or `(human)`. Unmarked means you decided it. Lines that were already in
the file when the run started came from grooming and need no mark — the whole
document is the user's.

This is what the user audits in the evening — without the mark he cannot tell what
he confirmed from what was decided for him, and that distinction is the whole
point of the review.

## The checklist is the run's progress

It is written **first, as the run starts**, and it is the run's phases in their
order, plus the two rework rounds that can follow a witness:

```sh
boardown task checklist add BD-42 "1. spec read, code explored, open calls settled"
boardown task checklist add BD-42 "2. tech plan written"
boardown task checklist add BD-42 "3. architecture review closed"
boardown task checklist add BD-42 "4. implemented, gates green"
boardown task checklist add BD-42 "5. code review closed"
boardown task checklist add BD-42 "5r. review findings fixed"
boardown task checklist add BD-42 "6. manual test passed"
boardown task checklist add BD-42 "6r. test findings fixed"
boardown task checklist add BD-42 "7. committed"
```

Tick each one as its phase closes. This is what the user reads off the board in
the evening without opening the log: the row says how far the run got and where
it stopped.

**The two `r` items are rounds, not findings.** Tick one when its round is done —
including when the witness found nothing and there was nothing to fix; leave it
unticked while a round is still open, because that is exactly the state worth
seeing from outside.

The numbering matches the phases of the command, so a stalled run points at the
phase to read in the log. A phase the run legitimately skips — the manual test on
a change with no visible surface — stays unticked with the reason in the summary.

**Not acceptance** — what the feature must do is the spec, and whether it does it
is the tester's verdict. An item stays unticked when its phase was skipped or its
witness did not pass, and the reason is a line in the summary. Ticking one because
the code "should work" makes the whole row meaningless.

## Notes are the human's voice only

`boardown task notes add` carries **what the user said**: a remark after a demo, a
clarification, an answer to an escalation — whoever's hand types it. Everything the
agents produce goes to its own artifact: progress to the log and the checklist,
decisions to "Decided by default" in the spec. Otherwise one run buries the one remark
that mattered under a stream nobody reads.

The one note an agent writes is a rework round's closing record — it lives in the
notes because it answers one of them. See the last section.

## How a run ends

**You never set `done`.** The task stays `in-progress` and the user accepts it
himself — that status is his signature, not a step in the flow.

The last action of the run is the outcome:

```sh
boardown task edit BD-42 --field outcome=ready-for-review
```

| Value | When |
|---|---|
| `ready-for-review` | every phase ran, gates green, waiting on the user |
| `needs-answer` | stopped on a fork only the user can settle |
| `rework` | his remarks are in the notes and are being worked through |
| `blocked` | something outside the task stops it |
| `failed` | the run broke and did not reach an outcome |

A run that ends in silence — no outcome, no log tail — is indistinguishable from a
run that crashed. Ending on one of these five is part of finishing, not paperwork
after it.

## A rework round on top of a finished run

A round runs on a task that already carries a whole run: its log, its ticked
checklist, its committed diff. **Nothing there is rewritten** — the round is added
on top, and afterwards both have to read side by side.

Its number is the run's number. The run that built the task was 1, so the first
round is **run 2**; take the next number after the highest already in `log.md`.

**The log gets a section, never a rewrite** — and it is opened **first**, right
after `boardown task get`, before the spec, the diff or a line of code. Same rule
as the first line of a fresh run, and for the same reason: until that line exists,
a round that is thinking and a process that died on launch look identical from
outside.

```
## Run 2 — rework

- 2026-08-22 19:12:38 · round opened — 3 remarks from note n4
- 2026-08-22 19:14:03 · round scoped — 1 dropped: "make the badge calmer" reads two ways
- 2026-08-22 19:41:20 · phase 2 implementation — closed, gates green
```

Same rules as every other line: one line per moment, stamp read off the machine.

**The checklist gets the round's phases, prefixed with its run:**

```sh
boardown task checklist add BD-42 "r2. round scoped, remarks triaged"
boardown task checklist add BD-42 "r2. implemented, gates green"
boardown task checklist add BD-42 "r2. code review closed"
boardown task checklist add BD-42 "r2. affected scenarios retested"
boardown task checklist add BD-42 "r2. committed"
```

Items of earlier runs are **never unticked, edited or removed.** A ticked `4.
implemented, gates green` is a true statement about run 1 and stays one; the row
is the history of the task, not a dashboard of the current round.

**The round closes with a note** — the single exception to notes being the human's
voice, because it is the answer to his. One note per round, naming what it settled
and what it did not:

```sh
boardown task notes add BD-42 "Run 2: remarks from n4 worked, in the commit that carries this note. The date format point is not done: it reads two ways, needs an answer."
```

**No commit hash in it.** The note is written before the commit — it is part of
what gets committed — so at that moment no hash exists. Naming the commit that
carries the note says the same thing and cannot go stale. The hash goes into
`log.md`, which is outside git and written after.

That record is how the next round knows where this one stopped: it takes the notes
numbered above it, plus whatever it named unfinished. A round that ends without one
makes the next round work the same remarks twice.
