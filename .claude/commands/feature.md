---
description: Take a board task end to end — groom it with the user into a product spec, then plan, implement, review, browser-test — stopping for him only on decisions that are genuinely his.
argument-hint: <a board task id, groomed or not>
---

Take this task from the board to reviewed, tested code:

**$1**

You are the main agent. You write the plan and the code yourself. The subagents
give you independent judgement — a critic, an architect, an arbiter, a reviewer, a
tester — and you decide what to do with it. Never delegate the writing of code or
of the plan.

**The product spec is never yours to write alone.** It is written with the user —
in phase 0 of this run, or in a `/groom` session before it. From phase 1 on it is
settled input, and nothing after that reopens it.

## The task on the board

**Invoke the `task-tracking` skill first and follow it**: which task you are
working, where its `<slug>` folder is, what goes
into its fields, the progress checklist, the log you keep as you go, the status
you end on. It runs alongside every phase below.

**A task outside `ready` does not stop this command** — that is what makes phase 0
run. The rule `task-tracking` states holds for the autonomous flows, where there
is nobody to groom with; here the user is in the room from the first message, so
an ungroomed task is groomed and then built in one sitting.

What does stop the run is an argument that is not a task. `$1` is a board task id
(`BD-42`); an idea in prose has no id, no folder and no field to write the spec
into. Say so and stop — it goes on the board first, either by him or by you when
he asks for it.

## Exploring the codebase — a standing rule, every phase

**Finding out how something works is delegated. Reading a file you already know
you need is not.**

- You need to **learn** something — how a flow works, where a concept lives, which
  surfaces exist today, whether there is already a utility for X, what a package
  contains: **invoke the `Explore` agent.** It reads excerpts and hands you the
  conclusion, so the file dumps stay in its context and never enter yours.
- You already know the file and you are about to **change** it, or you need its
  exact current content: **read it yourself.** Never edit on the strength of a
  summary.

This is not a suggestion. Left to itself, this flow reads the codebase by hand,
one file at a time, and arrives at implementation with a context full of source it
no longer needs — which is exactly when the work gets sloppy. `Explore` is the one
delegation allowed outside the review agents below; use it.

## Never drive the browser yourself — a standing rule, every phase

The browser belongs to the `manual-tester` agent. You never open a session — not
while implementing, not to "just check quickly" after a fix. This holds **after**
the last phase too: a late touch-up (swap two sections, rename a label) is still a
UI change, and it still goes to the tester.

## While a subagent works, you wait — a standing rule, every phase

Its result arrives on its own. There is nothing to poll, nothing to keep alive,
and no command that makes it land sooner. **Do not fill the wait**: no `echo`, no
`sleep`, no progress check, no "one more file while it runs". Each of those is a
full round trip that enters your context and returns nothing — a single run of
this command spent a fifth of everything it read on exactly that, in five
stretches of idle calls between phases.

What is worth doing before a wait, not during it: launch everything that can run
in parallel in one go, then stop. Read the report when it comes.

## Artifacts

Everything lives in the task's `.claude/specs/<slug>/` — the folder named
`<TASK-ID>-<kebab-case title>`, `BD-42-csv-export`, as `task-tracking` fixes it:

- `product.md` — **the input to phase 1.** Written with the user, in phase 0 or in
  a `/groom` session before this run. From phase 1 on you read it, you build what
  it says, and you extend only its "Decided by default" section as calls get made
  during the run. Everything else in it stands — including the lines you wrote
  yourself an hour earlier.
- `tech.md` — how we build it. Yours.
- `refs/` — frames and references the spec cites. A frame taken during grooming
  shows the product **as it is today** and marks what must not move; a mockup the
  user attached shows what to build and settles every fork it shows.

These are working material, not a deliverable. Never commit anything at all:
**committing requires the user's explicit permission** (CLAUDE.md).

## How a fork gets settled

Take the first row that fits:

| The fork | Who settles it |
|---|---|
| `product.md` answers it | you, applying the answer |
| it dies with the task — a label, wording, an icon, a separator, the order of two fields | you, under "Decided by default" |
| **it outlives the task** — the user will see it (reach, placement, control type, interaction pattern) or the next task will copy it (layer boundaries, the shape of data, the shape of an error, when an abstraction appears) | the **`expert`** |
| its price, read off the plan and the diff — "this means rewriting three places" | the user, directly |

Your one judgement is which row a fork is on. Whether it needs the user is the
expert's. This is the ladder `/feature_auto` runs, with the terminal at the end of
it instead of the manager.

`.boardown/docs/principles.md` is yours to read: it keeps the code you write in
the project's conventions. Forks on the third row still go to the expert — it has
the same page open, answers in one call, and it is what can say a fork has grown
past the task.

**That page, and everything else under `.boardown/docs/`, you read and never
write** — not to add the case you just built, not to refresh an example the
feature made stale, not a word. Two reasons, and both hold even when your edit
would be an improvement. It is the page the `expert` judges your forks by: a
developer who can edit it is grading his own work. And it is written by the user
looking **back** at decisions the project already made — a feature still in
flight is not one of them, and the run that adds an example to a principle is the
run least able to tell whether it is an example or an exception. The board itself
is different: `.boardown/` task, epic and release files are edited through the
`boardown` CLI as `task-tracking` says. It is the wiki that is read-only.

A principle that looks wrong to you, or an example that has gone stale, is a line
in the final summary to the user — never a diff.

### Calling the expert

One fork, one call, at the end of the phase that raised it.

- **hand it**: the fork, 2–4 real options, which way you lean and what constrains
  you, `product.md`, and — when the fork turns on how the product is built —
  `PRODUCT.md` and `.boardown/docs/architecture.md`. Price is a fact: "option A is
  three files, B is one";
- **keep to yourself** everything from your working tree — the plan, the diff,
  file names: what you have already written is what would spoil its judgement;
- **it returns** the option, a line of why, how sure it is — or "this needs the
  human". Both are answers;
- **record it**: a line in the log, and the call appended to the spec's "Decided
  by default" marked `(expert)`.

Questions the review agents raise for the user go through it the same way.

### Reaching the user

Two things reach him: a fork the expert sent up, and price. Both go into **a
single `AskUserQuestion` at the end of the phase**, quoting the expert's reason
where the question came from it. Zero questions means the phase moves on.

An irreversible or paid step — a new dependency, a change to the on-disk format or
the CLI's public contract, a migration, a release, anything against CLAUDE.md — is
a fork like any other: put it to the expert, and it will send it up.

**PRODUCT.md is descriptive, not a gate.** A feature that goes beyond it — past a
line under "Out of scope" included — is a reason to update PRODUCT.md in the same
change. A fork arises from the *spec* being silent, not from yesterday's document.

**"Decided by default"** in the spec holds what was settled without the user, each
line marked with its source: `(expert)`, `(human)`, or unmarked for your own call.

## Phase 0 — Grooming

**Skip this phase when the task is already in `ready`.** It was groomed in a
`/groom` session, that file is settled product, and re-opening it here would ask
the user to decide twice. Say so in one line and go to phase 1.

Otherwise the product gets decided now, with him in the room. **Read
`.claude/commands/groom.md` and follow it** — "The order of work on a task", "What
gets closed with the user" and "How to ask" carry the whole procedure, and the
`product-spec` skill carries the shape of the file. Do not groom from memory of
this file.

What that command does across a release, you do for `$1` alone: draft the spec off
`Explore` reports and the neighbouring specs, one batched `AskUserQuestion` for
the forks the draft could not close, `spec-critic` once, fold in his answers, set
the `spec` field.

Three of its rules this phase does not relax:

- **nothing is built here.** No `tech.md`, no code, no gates — those are phases 2
  and 4, and reaching for them early is what grooming exists to prevent;
- **there is no `expert` in this phase.** That agent settles a fork when the user
  is out of reach; here he is answering you directly, and the answer is his;
- **the board gets the `spec` field and the `ready` status last**, once the forks
  are closed. The run then moves the task on to `in-progress` as `task-tracking`
  says — this is the one place where both happen in one sitting.

The checklist `task-tracking` writes at the start of the run gets a `0. groomed,
spec written` item ahead of the seven when this phase runs.

**Then the boundary is hard.** Once the spec is written the run treats it exactly
as it would a spec written a week ago by someone else: phase 1 does not reopen it,
no later phase edits a line of it, and a line that implementation proves
impossible goes back to the user as a quoted fork — not as a quiet rewrite of what
he just agreed to.

## Phase 1 — Read the spec, explore the code it lands in, close what it left open

The spec is settled product; this phase does not reopen it. What it does is learn
how the code stands where that product lands, and close the forks the spec does
not reach — both before a line of the plan is written, the cheapest moment there
is.

**Read `product.md` yourself, whole**, plus every frame in `refs/` — unless phase
0 just wrote it and it is still in front of you. It was already reviewed during
grooming — a critic read it cold and its findings were closed with the user — so
it does not get reviewed again here, and `spec-critic` is not invoked a second
time.

**Then send the exploring out, one `Explore` per package the reach line touches,
all of them at once.** This is the phase that pays for the whole run: phase 2 is
written from these reports, which is why a plan for a feature spanning twenty
files takes minutes rather than an hour. Postpone it and you pay twice — the plan
gets written on guesses, and the reading lands mid-implementation with the source
piling up in your own context.

What is left for you after that is the forks the spec does not reach: things it
could not have known, that only appear against the real code.

Triage what you find:

- **the spec already answers it** — apply the answer, no call to anyone;
- **it dies with the task** — decide it, append to "Decided by default";
- **it outlives the task** — one `expert` call, all such forks batched into it,
  because this phase is where they cluster;
- **the expert sends it up, or its price is the question** — one
  `AskUserQuestion` at the end of the phase.

Append what gets settled to the spec's "Decided by default" with its mark. Never
rewrite a line the grooming session wrote: if implementation later proves one
impossible, that is a fork for the user, quoted.

Zero findings and zero forks is a normal outcome for a well-groomed task — say so
in the log and move on without stopping.

## Phase 2 — Technical plan

**Invoke the `tech-plan` skill and follow it.** It carries the required sections
and their fixed names, and — the part that matters most — the altitude the plan is
written at: file-level, never symbol-level. Do not write `tech.md` from memory of
this file — load the skill.

The plan answers the spec: for every line of behaviour, every surface in its
reach, and every CLI clause, it says where in the code that lands. **The edge
cases live here**, not in the spec — empty or whitespace-only input, a task in a
finished release, a cancelled modal, YAML metacharacters, a missing or malformed
file, an external change between load and write. Whichever this feature can reach,
the plan says what happens.

Output: `.claude/specs/<slug>/tech.md`, prose only, around a hundred lines.

## Phase 3 — Architecture review

Invoke the `architect` agent with the paths to `tech.md`, `product.md` **and every
file in `refs/`** — the spec's placement decisions come from those frames, and the
architect checks the plan against them.

Triage as in phase 1. Update the plan for what you accept; record what you reject
and why. A genuine fork runs through the ladder; the price of a rewrite is yours
to raise with the user.

## Phase 4 — Implementation

Implement the approved plan. Stay inside it: if implementation teaches you the
plan was wrong, update `tech.md` and note the divergence — do not silently drift.

Filling in what the plan deliberately left out — names, signatures, props, the
shape of a helper — is **not** a divergence and needs no note. A divergence is a
change to what the plan actually decided: which file carries the logic, how the
data flows, what lands on disk.

**The Definition-of-Done documents are part of the change, not a phase of their
own.** `PRODUCT.md`, `README.md`, `CLAUDE.md` — and nothing else — are updated
here, with the code, so they reach the reviewer inside the same diff and get
judged like everything else you wrote. Prose about behaviour is as wrong-able as
code, and the reviewer is the only reader who checks it against the change.

Write what the product **is**, not what you changed: "the Linked tasks section
groups its rows by relation", never "grouping was added". A paragraph that reads
like news was written from the diff instead of from the product.

Every later round that changes described behaviour — including a rework the user
sends you back for — updates these documents in the same round as the code. A
round that only changes how something is built leaves them alone.

Then run the gates from the repo root and get them green:

```powershell
pnpm lint; if ($?) { pnpm typecheck }; if ($?) { pnpm build }; if ($?) { pnpm test }
```

Do not proceed to review with a red gate.

## Phase 5 — Code review

Invoke the `code-reviewer` agent, handing it `product.md`, `tech.md`, the
`<slug>`, and — explicitly — **where the change is**: the uncommitted working tree,
or the commits on this branch (`git diff main...HEAD`), or both. It does not guess.

For each finding: accept and fix, or reject with a stated reason. You have more
context than the reviewer and you are allowed to disagree — but a rejected
**blocker** goes in the final summary, verbatim, so the user sees the call you
made.

After fixing, re-run the gates, then continue the **same** reviewer session with
`SendMessage` (do not spawn a new one — it would re-derive everything from cold):
tell it what you fixed, what you rejected and why, and ask it to check the fixes
only.

That is **one** re-check, not a loop. If it comes back with new blockers on the
fixes themselves, stop and put it to the user in an `AskUserQuestion` — with the
reviewer's blocker, your reading of it, and the ways forward you see. A second
round means you and the reviewer disagree about something he should settle, and
that is a question, not a line in a report.

## Phase 6 — Manual test

If the feature touched `packages/ui`, `packages/cli`, `packages/core` or any
shell, invoke the `manual-tester` agent and hand it exactly three things:

- the path to `product.md` — every line under *Look* and *Behaviour* is observable
  from outside, so the spec is both the description and what "works" means;
- the surface it must drive: the UI in a browser, the CLI from source, or both (a
  change in `core` reaches both, and the tester tests only what you point it at);
- your implementation notes — which surfaces and screens the feature actually
  appears on, anything that diverged from the plan, anything you already know is
  shaky.

The scenarios are the tester's to write: it reads the spec, README and PRODUCT.md
and derives them itself at the depth you set (`smoke` / nothing / `deep`).

Fix what it finds, re-run the gates, then continue the **same** tester session
with `SendMessage`: what you fixed, and which scenarios to re-run.

**Hard cap: three fix-and-retest rounds.** If a defect is still there after the
third round, stop and **ask him what to do — an `AskUserQuestion`, right there,
not a finished run and a paragraph in the summary**. By the time you are writing
the summary the flow is over and he is reading rather than choosing; here he is
choosing, so he needs the choice in front of him.

Hand him what you tried, what the tester still sees, your best diagnosis, and
options: more rounds, ship it as it stands with the defect named, revert to
whichever state the tester measured as best, or take a different approach. He may
also tell you to put the defect on the board — his call to make and yours to
carry out, never yours to take on your own.

Do not start a fourth round unasked — past three you are almost certainly cycling
on the same wrong hypothesis, and each round burns real budget for nothing. This
is the only loop in the flow; every other phase runs once.

Skip this phase only for a change with no user-visible behaviour on any surface
(an internal refactor inside `core`), and say so in the summary. A `cli`-only
change is not a skip — the tester drives the CLI from source.

## Phase 7 — The summary

The Definition-of-Done documents were written back in phase 4, alongside the code,
and every round since updated them with it. Check they match what the product now
does — that is a look, not a writing pass.

Then report to the user, in the language the user speaks:

- what was built, in a couple of sentences;
- the "Decided by default" calls added during this run, **each with its source** —
  this is where he audits your autonomy, and what the expert settled he never saw;
- what the critic, the reviewer and the tester found, and what you rejected and
  why;
- gate status;
- anything the tester could not verify;
- anything found along the way that is outside this task — a defect in a
  neighbouring component, a stale document. Name it plainly and leave it there:
  putting it on the board is his call, not yours.

Then close the task as `task-tracking` says: last line of the log, then the status
to `review`. **You never set `done`** — that one is the user's signature, and he
gives it out of `review` once he has seen the work.

Then stop. **Do not commit.**
