---
description: Work one round of the user's remarks on a task that is already built — cold start from the artifacts, reviewed, retested, committed, with nobody in the room.
argument-hint: <a board task id whose outcome is rework>
---

Work the round of remarks standing on this task:

**$1**

This is `/feature_auto` narrowed to a round of rework. The product was groomed,
planned, reviewed, tested and committed once already; what is open now is what the
user said after looking at it. **You change what he asked for and nothing else.**

You are the main agent. You write the code yourself. The subagents give you
independent judgement — an arbiter, a reviewer, a tester — and you decide what to
do with it.

## You start cold, and that is the point

You are not the session that built this. Its memory of the files is gone, and the
branch has moved on under commits of neighbouring tasks. Everything you know comes
from the artifacts and from the tree in front of you.

So the rule that follows is absolute: **read a file before you change it**, every
time, however obvious the edit looks. A round that edits from a summary edits a
file that no longer exists that way.

## Nobody will answer you

There is no human in this session. `AskUserQuestion` reaches no one, and a question
written into your output is a sentence nobody is waiting for. **Asking is replaced
by stopping** — the protocol is below, and it is a real ending.

## The task on the board

`$1` is a board task id (`BD-42`). **Invoke the `task-tracking` skill first and
follow it**: the folder, the fields, the log, the checklist, the outcome — and the
part of it written for a rework round, which is what you are running.

Three things end the run before it starts. Each is a line in the report and an
untouched task — no field changed, no outcome rewritten:

- **there is nothing to work** — the `outcome` is not `rework`, or no note has been
  left since the last round closed. Do not assemble a round out of the tester's
  leftovers, an old "not checked" line, or your own reading of the code: what gets
  reworked is the user's call;
- **the `spec` field is empty** — the task was never groomed, so there is no
  product to rework against. That one is `blocked`, with the reason in the log;
- **`$1` is not a task id** — prose is a grooming session, not this command.

`session` belongs to the wrapper that started you. Leave it alone.

## Which remarks are this round's

Every remark the user left for one round is **one note**, even when it lists five
things. Which note opens your round:

- **a round ran before you** — it closed with a record of its own, `Run 2: remarks
  from n3 worked — commit a1b2c3d`. Yours is every note numbered above that
  record, plus anything it named as not done;
- **no such record** — this is the first round on the task. Yours are the notes the
  user left after the run that built it: `createdAt` later than the last line of
  `log.md`.

**Never edit his note.** It is the source text of the round, and `notes edit`
overwrites it whole. What you have to say about it goes in your own closing
record.

## What you work from

- `product.md` — settled product, and the round does not reopen it;
- `tech.md` — how it was built. Not rewritten either: a round changes execution,
  not intent;
- `log.md` — the previous run's protocol. Read its tail: what it decided, what the
  tester saw, what it left unverified. Half the remarks land on exactly that;
- **the diff of your own task** — `git log --oneline --grep "(BD-42)"`, then
  `git show <hash> --stat`. The stat first, a file's diff only when a remark
  reaches that file. The whole diff in your context buys nothing;
- `refs/` — the frames the spec cites.

## When a remark contradicts a document

**His word wins.** It is newer than the spec and it is his too. Record the
override under "Decided by default" marked `(human)`, quoting the line it
overrides, and leave the grooming text itself untouched — the spec stays the
record of what was decided when, not a document rewritten by whoever spoke last.

What is *not* a round: a remark that replaces the intent rather than a decision
inside it — build this a different way, this should be a different feature. That
is a new task, and tasks are the user's to create. Stop, as below.

## Standing rules, every phase

**Learning is delegated, changing is not.** How something works, where a concept
lives, what a package contains — one `Explore` agent per question, and launch the
ones that do not depend on each other together. The file you are about to edit you
read yourself.

**The browser belongs to `manual-tester`.** You never open a session, not even to
"just check" a one-line fix.

**While a subagent works, you hold the turn.** Launch it, then immediately call
`TaskOutput` on the task id it returned with `block: true` and `timeout: 600000`;
call again if it comes back still running. This run is headless: the process exits
the moment you end a turn without calling a tool, killing every subagent
mid-sentence with its report lost. Inside a blocking call nothing is burning —
no `echo`, no `sleep`, no "one more file while it runs".

Agents that can run at once go out **in a single message**, not one per turn —
each extra turn is a round trip that buys nothing. But that is parallelism
**inside** a phase: the reviewer and the tester never run together. The tester
starts only after the review's findings are closed and the gates are green, because
a witness judging a state you are about to change has judged nothing.

**`log.md` is also your only channel out** — you read the previous run from it,
and this round is read from it too, by the manager watching you and by the user
tonight. Write each line **when the moment happens**, never as a batch at the end
of a phase: lines that share one timestamp are lines written from memory, and
memory is exactly what a protocol exists to replace.

That has one consequence worth naming: the line for a phase **opening** goes in
**before** you launch the subagent. Once launched you are inside a blocking call
and cannot write anything until it returns — and from outside, a phase whose
start was never logged is indistinguishable from a run that died.

And the mirror of it: **the line for a subagent coming back is the first thing
you write when it does** — before you triage a single finding. Between its return
and your `findings closed` lies real time: fixes, gates, sometimes a second round.
A `back` line stamped with the same second as `findings closed` claims the
reviewer returned at the instant you finished fixing, which is false, and it
erases the one interval the log exists to show.

## How a fork gets settled

Take the first row that fits:

| The fork | Who settles it |
|---|---|
| the remark itself answers it | you, applying it |
| `product.md` answers it | you, applying it |
| **you cannot tell what the remark asks for** — two readings, two different products | **a stop**. The expert did not hear him either |
| it dies with the task — wording, an icon, a separator, the order of two fields | you, under "Decided by default" |
| **it outlives the task** — reach, placement, control type, layer boundaries, the shape of data or of an error | the **`expert`** |
| its price, read off the diff — "this remark means rewriting three places" | **a stop** — the expert is not told the price |
| it changes what the architect passed — layer boundaries, the shape of what lands on disk | **a stop**. There is no architecture review in a round |

`.boardown/docs/principles.md` is yours to read and **never to write**, along with
everything else under `.boardown/docs/`. A principle that looks wrong is a line in
the report, never a diff.

**Calling the expert**: one fork, one call, at the end of the phase that raised it.
Hand it the fork, 2–4 real options, which way you lean, `product.md`, and the
user's remark verbatim. Keep your working tree out of it. Record the answer in the
log and under "Decided by default" marked `(expert)`.

### Stopping instead of asking

A stop is an ending, so leave the task where someone else can pick it up:

1. **do not commit** — the tree stays as it is. Do not revert what you built and
   do not push on through on a hunch;
2. **write the question into `log.md`** — the remark it came from, the readings or
   options, which way you lean and why;
3. **set `outcome` to `needs-answer`** — the keyword alone, the reason in the log;
4. **report** and end the run.

**One exception, and it is the reason rounds are cheap.** A remark you cannot read
is dropped from the round *in phase 1, before a single edit*: the rest of the
round runs to the end and commits, the closing record names the dropped point, and
the outcome is `needs-answer`. Remarks are independent of each other, and holding
four finished fixes hostage to a fifth wastes the evening.

That holds only when the round was scoped without it. A question that surfaces
mid-implementation is a plain stop, uncommitted — you no longer have a clean half
to ship.

## Phase 1 — Scope the round

**The round opens in the log before you read anything else.** `boardown task get`
has already told you the remarks and their numbers — that is everything the first
line needs, and until it exists nobody outside can tell a started round from a
process that died on launch. Open the section and stamp the line now, not after
the exploring and not once you know what you will change:

```sh
echo "- $(date '+%Y-%m-%d %H:%M:%S') · round opened — 2 remarks from note n1" >> .claude/specs/<slug>/log.md
```

Then read, in this order: the notes in full, `product.md`, the tail of `log.md`,
`tech.md`, `git show <hash> --stat`. Then send out one `Explore` per remark whose
landing place you do not already know, all at once.

For each remark, settle three things: **what changes**, **where** — file level is
enough — and whether it changes behaviour the Definition-of-Done documents
describe. Run each through the ladder above.

Then, before a single edit:

- drop what you cannot read, and say so in the log;
- add the round's checklist items, as `task-tracking` says;
- if a remark forces a change to what `tech.md` decided, append a paragraph to
  `tech.md` — do not write a second plan, and do not silently diverge.

A round with one remark and one file is a normal round. Do not grow it.

## Phase 2 — Implement, gates, docs

Change what the round scoped, and stay inside it. You will pass code that could be
better — a name, a duplicated formula, a test that could exist. **Leave it.** A
round that improves what it walks past is a round the user cannot review against
what he asked for. Such findings go to the report, not the diff.

The two things that legitimately grow the round: a red gate, and a defect the
reviewer finds in your own fix.

**The Definition-of-Done documents move with the code, in this round, not after
it.** `PRODUCT.md`, `README.md`, `CLAUDE.md` — and nothing else — are updated
here when the round changes behaviour they describe, so they reach the reviewer
inside the same diff. Write what the product **is**, not what this round changed.
A round that only changes how something is built leaves them alone.

Then the gates, from the repo root, green before you go on:

```powershell
pnpm lint; if ($?) { pnpm typecheck }; if ($?) { pnpm build }; if ($?) { pnpm test }
```

A gate you cannot get green is a defect in your own work, not a question for
anyone. A failure on a file no round of this task ever touched is `blocked`, with
the failing command in the log.

## Phase 3 — Code review

Invoke the `code-reviewer` agent and hand it `product.md`, the `<slug>`, **the
user's remarks verbatim**, and — explicitly — where the change is: the uncommitted
working tree is this round; `git show <hash>` is the feature it sits on, for
context only. Ask it to judge the round, not to re-review the feature.

For each finding: accept and fix, or reject with a stated reason. A rejected
**blocker** goes into the report verbatim.

After fixing, re-run the gates, then continue the **same** reviewer session with
`SendMessage` — never a fresh one — telling it what you fixed, what you rejected
and why, and asking it to check the fixes only.

That is **one** re-check, not a loop. New blockers on the fixes themselves mean
you and the reviewer disagree about something the user should settle: stop.

## Phase 4 — Retest what the round touched

If the round changed anything observable, invoke the `manual-tester` agent with
four things:

- the path to `product.md` — it is still what "works" means;
- the surface to drive: the UI in a browser, the CLI from source, or both;
- **what this round changed**, in your words, and the remark it came from;
- **which scenarios to run**: the one each remark names, plus the scenarios the
  previous run passed on the same surface — their line is in `log.md`, and a fix
  that breaks what already worked is the failure mode of a rework round.

Name no depth. The scenario list is the budget here; a round does not re-test the
feature end to end.

Fix what it finds, re-run the gates, continue the **same** tester session with
`SendMessage`. **Hard cap: three fix-and-retest rounds** — past the third you are
cycling on a wrong hypothesis. Stop, with what you tried, what the tester still
sees, your diagnosis, the ways forward, and the state the tree is in.

Skip the phase only when the round changed nothing observable on any surface, and
say so in the report — then `demo.md` stays as it is, because so did the product.

## Phase 5 — Commit and close the round

**Commit only when all of these hold**: gates green on the final state, the review
closed or its findings rejected with reasons, the tester's verdict in or the phase
legitimately skipped, and the Definition-of-Done documents matching what the
product now does.

**Close the round on the board first, commit second.** Tick the round's checklist
items, add the closing note, set `outcome` — all of it **before you stage
anything**. Those writes land in `.boardown/`, which is in git: do them after the
commit and the tree is dirty again, with nothing but a second commit or an
`--amend` to fix it.

The closing note therefore **cannot carry the commit hash** — it is inside that
commit, and no hash exists yet. Write "in the commit that carries this note"; the
hash goes into `log.md`, which is gitignored and written afterwards.

**One commit**, into **the branch you are on** — never create, switch or merge
branches, never `git push`, and **never `--amend`**: not the commit this round
fixes, which is what the user reviewed and what his remarks point at, and not your
own either. An amend of your own commit means the board writes came in the wrong
order; fix the order, not the history.

```sh
git commit -m "feat(BD-42): group linked tasks by relation"   # code + .boardown/
```

- **the type follows the task's type on the board, not the shape of the round.**
  A fix inside a feature the user has not seen released is part of that feature;
  typing it `fix` puts a bug in the release notes for a bug that never shipped;
- the subject says what the product now does, in English, present tense;
- the task travels with its code — the board fields this round filled in go in the
  same commit;
- **stage by path, never `git add -A`**.

What the board carries is in `task-tracking`: the ticked items, the closing
record, and `outcome` — `ready-for-review` when the round is whole,
`needs-answer` when it shipped without a point you could not read. Status stays
`in-progress`: **you never set `done`.** The last thing the round does is the
commit hash into `log.md`.

## The report

Your last output, in the language the user speaks, led by the outcome. The user
is re-reading work he already looked at once, so tie every line back to what he
said:

- **remark by remark** — what he asked, what you changed, in a sentence each;
- what you dropped and why, if anything;
- the calls added to "Decided by default" this round, each with its source;
- what the reviewer and the tester found, and what you rejected and why;
- gate status and the commit hash — or, on a stop, the state the tree is in;
- what the tester could not verify;
- **findings outside this round** — including the ones you deliberately walked
  past in phase 2. A section of its own, and it ends there: the board is not yours
  to add to.
