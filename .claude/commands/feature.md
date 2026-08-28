---
description: Take a board task end to end — groom it with the user into a product spec, then plan, implement, review, browser-test — stopping for him only on decisions that are genuinely his.
argument-hint: <a board task id, groomed or not>
---

Take this task from the board to reviewed, tested code:

**$1**

You are the main agent. You write the plan and the code yourself; the subagents —
critic, architect, expert, reviewer, tester — give you independent judgement, and
you decide what to do with it. Never delegate the writing of code or of the plan.

**The product spec is never yours to write alone.** It is written with the user, in
phase 0 of this run or in a `/groom` session before it. From phase 1 on it is
settled input, and nothing after that reopens it.

## Standing rules — every phase

**Delegate learning, not reading.** Finding out how something works — a flow, where
a concept lives, which surfaces exist, whether a utility already exists, what a
package contains — goes to the `Explore` agent: it returns the conclusion and the
file dumps stay in its context instead of yours. A file you already know you need,
and are about to change, you read yourself; never edit on the strength of a
summary.

**The browser belongs to the `manual-tester` agent.** You never open a session, and
that holds after the last phase too: a late touch-up — swapping two sections,
renaming a label — is still a UI change and still goes to the tester.

**While a subagent works, you wait.** Its result arrives on its own; there is
nothing to poll and no command that makes it land sooner. Do not fill the wait — an
`echo`, a `sleep`, a progress check or "one more file while it runs" is a round trip
that enters your context and returns nothing. Launch everything that can run in
parallel in one go, then stop and read the report when it comes.

## The task on the board

**Invoke the `task-tracking` skill first and follow it**: which task you are
working, where its `<slug>` folder is, what goes into its fields, the progress
checklist, the log you keep as you go, the status you end on. It runs alongside
every phase below.

**A task outside `ready` does not stop this command** — that is what makes phase 0
run. The rule `task-tracking` states holds for the autonomous flows, where there is
nobody to groom with; here the user is in the room from the first message, so an
ungroomed task is groomed and then built in one sitting.

What does stop the run is an argument that is not a task. `$1` is a board task id
(`BD-42`); an idea in prose has no id, no folder and no field to write the spec
into. Say so and stop — it goes on the board first.

## Artifacts

Everything lives in `.claude/specs/<slug>/`, the folder named `<TASK-ID>-<kebab-case
title>` as `task-tracking` fixes it. `product.md` is the input to phase 1 — written
with the user, in phase 0 or a `/groom` session before this run; from phase 1 on you
read it, build what it says and extend only its "Decided by default", including the
lines you wrote yourself an hour earlier. `tech.md` is yours. `refs/` holds the
frames the spec cites — a grooming frame shows the product as it is today and marks
what must not move, a mockup settles every fork it shows.

These are working material, not a deliverable. **Never commit anything at all:
committing requires the user's explicit permission** (`CLAUDE.md`).

## How a fork gets settled

Take the first row that fits:

| The fork | Who settles it |
|---|---|
| `product.md` answers it | you, applying the answer |
| it dies with the task — a label, wording, an icon, a separator, the order of two fields | you, under "Decided by default" |
| **it outlives the task** — the user will see it (reach, placement, control type, interaction pattern) or the next task will copy it (layer boundaries, the shape of data, the shape of an error, when an abstraction appears) | the **`expert`** |
| its price, read off the plan and the diff — "this means rewriting three places" | the user, directly |

Your one judgement is which row a fork is on; whether it needs the user is the
expert's. This is the ladder `/feature_auto` runs, with the terminal at the end of
it instead of the manager.

`.boardown/docs/principles.md` keeps the code you write in the project's
conventions, and it is **read-only to you**, as is everything else under
`.boardown/docs/` — it is the page the `expert` judges your forks by, and a
developer who can edit it is grading his own work. A principle that looks wrong, or
an example the feature made stale, is a line in the final summary, never a diff. The
board itself is different: `.boardown/` task, epic and release files are edited
through the `boardown` CLI as `task-tracking` says.

### Calling the expert

One fork, one call, at the end of the phase that raised it.

- **hand it**: the fork, 2–4 real options, which way you lean and what constrains
  you, `product.md`, and — when the fork turns on how the product is built —
  `PRODUCT.md` and `.boardown/docs/architecture.md`. Price is a fact: "option A is
  three files, B is one";
- **keep to yourself** everything from your working tree — the plan, the diff, file
  names: what you have already written is what would spoil its judgement;
- **it returns** the option, a line of why, how sure it is — or "this needs the
  human". Both are answers;
- **record it**: a line in the log, and the call appended to "Decided by default"
  marked `(expert)`.

Questions the review agents raise for the user go through it the same way.

### Reaching the user

Two things reach him: a fork the expert sent up, and price. Both go into **a single
`AskUserQuestion` at the end of the phase**, quoting the expert's reason where the
question came from it. Zero questions means the phase moves on.

An irreversible or paid step — a new dependency, a change to the on-disk format or
the CLI's public contract, a migration, a release, anything against `CLAUDE.md` — is
a fork like any other: put it to the expert, which will send it up.

A fork arises from the **spec** being silent, not from yesterday's document.
`PRODUCT.md` is descriptive, not a gate: a feature that goes past a line under "Out
of scope" is a reason to update `PRODUCT.md` in the same change.

**"Decided by default"** in the spec holds what was settled without the user, each
line marked with its source: `(expert)`, `(human)`, or unmarked for your own call.

## Phase 0 — Grooming

**Skip this phase when the task is already in `ready`.** It was groomed in a
`/groom` session, that file is settled product, and reopening it here would ask the
user to decide twice. Say so in one line and go to phase 1.

Otherwise the product gets decided now, with him in the room. **Read
`.claude/commands/groom.md` and follow it** — "The order of work on a task", "What
gets closed with the user" and "How to ask" carry the whole procedure, and the
`product-spec` skill carries the shape of the file. Do not groom from memory of this
file. What that command does across a release, you do for `$1` alone: draft the spec
off `Explore` reports and the neighbouring specs, one batched `AskUserQuestion` for
the forks the draft could not close, `spec-critic` once, fold in his answers, set the
`spec` field.

Three of its rules this phase does not relax:

- **nothing is built here** — no `tech.md`, no code, no gates; reaching for them
  early is what grooming exists to prevent;
- **there is no `expert` in this phase** — that agent settles a fork when the user is
  out of reach; here he is answering you directly, and the answer is his;
- **the board gets the `spec` field and the `ready` status last**, once the forks are
  closed. The run then moves the task on to `in-progress` as `task-tracking` says —
  this is the one place where both happen in one sitting.

The checklist `task-tracking` writes at the start of the run gets a `0. groomed, spec
written` item ahead of the seven when this phase runs.

**Then the boundary is hard.** Once the spec is written the run treats it exactly as
it would a spec written a week ago by someone else: no later phase edits a line of
it, and a line that implementation proves impossible goes back to the user as a
quoted fork — never as a quiet rewrite of what he just agreed to.

## Phase 1 — Read the spec, explore the code it lands in, close what it left open

The spec is settled product; this phase does not reopen it. It learns how the code
stands where that product lands and closes the forks the spec does not reach —
before a line of the plan is written, the cheapest moment there is.

**Read `product.md` yourself, whole**, plus every frame in `refs/` — unless phase 0
just wrote it and it is still in front of you. It was reviewed cold during grooming,
so it does not get reviewed again and `spec-critic` is not invoked a second time.

**Then send the exploring out, one `Explore` per package the reach line touches, all
in one message.** This phase pays for the whole run: phase 2 is written from these
reports. Postponed, the plan gets written on guesses and the reading lands
mid-implementation with the source piling up in your context.

Triage what the exploring turns up: the spec answers it — apply the answer; it dies
with the task — decide it and append to "Decided by default"; it outlives the task —
one `expert` call with all such forks batched, since this phase is where they
cluster; the expert sends it up or its price is the question — one `AskUserQuestion`
at the end of the phase.

Never rewrite a line the grooming session wrote: if implementation later proves one
impossible, that is a fork for the user, quoted. Zero findings and zero forks is a
normal outcome for a well-groomed task — say so in the log and move on.

## Phase 2 — Technical plan

**Invoke the `tech-plan` skill and follow it.** It carries the required sections and
the altitude the plan is written at: file-level, never symbol-level. Do not write
`tech.md` from memory of this file.

The plan answers the spec: for every line of behaviour, every surface in its reach
and every CLI clause, it says where in the code that lands. **The edge cases live
here**, not in the spec, and the ones that count are the ones this feature can
actually reach — an edge it cannot reach is padding the architect has to read.

Output: `.claude/specs/<slug>/tech.md`, prose only, around a hundred lines.

## Phase 3 — Architecture review

Invoke the `architect` agent with the paths to `tech.md`, `product.md` **and every
file in `refs/`** — the spec's placement decisions come from those frames, and the
architect checks the plan against them.

Triage as in phase 1: update the plan for what you accept, record what you reject and
why. A genuine fork runs through the ladder; the price of a rewrite is yours to raise
with the user.

## Phase 4 — Implementation

Implement the approved plan. If implementation teaches you the plan was wrong, update
`tech.md` and note the divergence — do not silently drift. Filling in what the plan
deliberately left out (names, signatures, props, the shape of a helper) is not a
divergence; a divergence changes what the plan decided — which file carries the
logic, how the data flows, what lands on disk.

**The Definition-of-Done documents are part of the change, not a phase of their own.**
`PRODUCT.md`, `README.md`, `CLAUDE.md` — and nothing else — are updated here, with the
code, so they reach the reviewer inside the same diff: prose about behaviour is as
wrong-able as code. Write what the product **is**, not what you changed: "the Linked
tasks section groups its rows by relation", never "grouping was added". Every later
round that changes described behaviour — including a rework the user sends you back
for — updates these documents in the same round; a round that only changes how
something is built leaves them alone.

Then run the gates from the repo root and get them green:

```powershell
pnpm lint; if ($?) { pnpm typecheck }; if ($?) { pnpm build }; if ($?) { pnpm test }
```

Do not proceed to review with a red gate.

## Phase 5 — Code review

Invoke the `code-reviewer` agent, handing it `product.md`, `tech.md`, the `<slug>`
and — explicitly — **where the change is**: the uncommitted working tree, the commits
on this branch (`git diff main...HEAD`), or both. It does not guess.

For each finding: accept and fix, or reject with a stated reason. You have more
context than the reviewer and may disagree — but a rejected **blocker** goes into the
final summary verbatim, so the user sees the call you made.

After fixing, re-run the gates, then continue the **same** reviewer session with
`SendMessage` (a new one would re-derive everything from cold): what you fixed, what
you rejected and why, and check the fixes only. That is **one** re-check, not a loop.
If it comes back with new blockers on the fixes themselves, put it to the user in an
`AskUserQuestion` — the reviewer's blocker, your reading of it, the ways forward you
see. A second round means you and the reviewer disagree about something he should
settle.

## Phase 6 — Manual test

If the feature touched `packages/ui`, `packages/cli`, `packages/core` or any shell,
invoke the `manual-tester` agent and hand it exactly three things:

- the path to `product.md` — every line under *Look* and *Behaviour* is observable
  from outside, so the spec is both the description and what "works" means;
- the surface it must drive: the UI in a browser, the CLI from source, or both (a
  change in `core` reaches both, and the tester tests only what you point it at);
- your implementation notes — which surfaces and screens the feature appears on,
  anything that diverged from the plan, anything you already know is shaky.

The scenarios are the tester's to write, at the depth you set (`smoke` / nothing /
`deep`).

Fix what it finds, re-run the gates, then continue the **same** tester session with
`SendMessage`: what you fixed, and which scenarios to re-run.

**Hard cap: three fix-and-retest rounds.** If a defect is still there after the third,
**ask him what to do in an `AskUserQuestion`, right there** — not a finished run and a
paragraph in the summary. By the time you are writing the summary he is reading rather
than choosing; here he is choosing, so he needs the choice in front of him. Hand him
what you tried, what the tester still sees, your best diagnosis, and the options: more
rounds, ship it with the defect named, revert to whichever state the tester measured
as best, a different approach. He may also tell you to put the defect on the board —
his call to make and yours to carry out. Do not start a fourth round unasked: past
three you are cycling on the same wrong hypothesis. This is the only loop in the flow;
every other phase runs once.

Skip this phase only for a change with no user-visible behaviour on any surface (an
internal refactor inside `core`), and say so in the summary; a `cli`-only change is
not a skip.

Unless its verdict is `broken`, the tester leaves a `demo.md` in the task's folder —
its own role, nothing you ask it for. Name that path in the summary: it is the walk
whoever shows this feature follows.

## Phase 7 — The summary

The Definition-of-Done documents were written back in phase 4 and every round since
updated them. Check they match what the product now does — a look, not a writing pass.

Then report to the user, in the language the user speaks:

- what was built, in a couple of sentences;
- the "Decided by default" calls added during this run, **each with its source** —
  this is where he audits your autonomy, and what the expert settled he never saw;
- what the critic, the reviewer and the tester found, and what you rejected and why;
- gate status;
- anything the tester could not verify;
- anything found along the way that is outside this task — a defect in a neighbouring
  component, a stale document. Name it plainly and leave it there: putting it on the
  board is his call, not yours.

Then close the task as `task-tracking` says: last line of the log, then the status to
`review`. **You never set `done`** — that one is the user's signature, and he gives it
out of `review` once he has seen the work.

Then stop, and commit nothing.
