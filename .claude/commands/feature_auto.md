---
description: Run a groomed task end to end with nobody in the room — product spec to reviewed, tested, committed code — stopping instead of asking when a fork is genuinely the user's.
argument-hint: <a board task id in the ready status>
---

Take this task from its product spec to reviewed, tested, committed code:

**$1**

You are the main agent. You write the plan and the code yourself; the subagents —
architect, expert, reviewer, tester — give you independent judgement, and you
decide what to do with it. Never delegate the writing of code or of the plan.

`product.md` is the input, not yours to write: it was settled with the user during
grooming and it stands.

This is `/feature` with nobody in the room. Same ladder, same phases, same
artifacts; two things differ, and they are the whole of this file: you cannot ask,
and you commit.

## Standing rules — every phase

**Asking is replaced by stopping.** `AskUserQuestion` reaches no one here, and a
question written into your output is a sentence nobody is waiting for. Stopping on
something you could have settled wastes a slot in the queue; carrying on through a
fork that outlives the task spends the user's product without him. Which of the
two a fork is is decided by the ladder below, not by how stuck you feel.

**Delegate learning, not reading.** Finding out how something works — a flow, where
a concept lives, which surfaces exist, whether a utility already exists, what a
package contains — goes to the `Explore` agent: it returns the conclusion and the
file dumps stay in its context instead of yours. A file you already know you need,
and are about to change, you read yourself; never edit on the strength of a
summary.

**The browser belongs to the `manual-tester` agent.** You never open a session,
and that holds after the last phase too: a late touch-up — swapping two sections,
renaming a label — is still a UI change and still goes to the tester.

**While a subagent works, you hold the turn.** Launch it, then call `TaskOutput`
on the task id it returned with `block: true` and `timeout: 600000` — one call per
subagent, and again if it comes back with the agent still running. This command
runs headless: the process exits the moment you end a turn without calling a tool,
killing every subagent still working and losing its report. Inside a blocking call
there is nothing to poll and nothing to keep warm — an `echo`, a progress check or
"one more file while it runs" is a round trip that returns nothing.

Before a wait, launch everything that can run in parallel **in one message**, and
**write the log line for the phase you are opening** — inside the block you cannot
write, and a phase whose start was never logged looks exactly like a run that died.

**Parallel means inside one phase, never across the witnesses.** The architect, the
reviewer and the tester run strictly one after another, each starting only once the
previous one's findings are closed and the gates are green: a witness judges the
final state, and one started on a state you are about to change has judged nothing.

**A returning subagent's log line is the first thing you write** — before you
triage a finding, before a fix. Lines sharing one timestamp were written from
memory afterwards and hide the interval the log exists to show.

## The task on the board

`$1` is a board task id (`BD-42`). **Invoke the `task-tracking` skill first and
follow it**: which task you are working, where its `<slug>` folder is, what goes
into its fields, the progress checklist, the log you keep as you go, the status you
end on. It runs alongside every phase below.

Two things end the run before it starts, both as `blocked` with the reason in the
log:

- **the task is not in `ready`** — starting without a groomed spec means inventing
  the product from a title. A `ready` task carrying `outcome: rework` is not yours
  either: a round of the user's remarks is `/rework_auto`;
- **`$1` is not a task id** — an idea in prose is a grooming session. What enters a
  release is the user's call, so you never create the task yourself.

`session` belongs to the wrapper that started you. Leave it alone.

## Artifacts

Everything lives in `.claude/specs/<slug>/`, the folder named `<TASK-ID>-<kebab-case
title>` as `task-tracking` fixes it. `product.md` is the input; `tech.md` is yours;
`log.md` is the running protocol and, in this run, the only channel back to the
user, so a line missing from it did not happen; `refs/` holds the frames the spec
cites — a grooming frame shows the product as it is today and marks what must not
move, a mockup settles every fork it shows. These are working material, not a
deliverable.

## How a fork gets settled

Take the first row that fits:

| The fork | Who settles it |
|---|---|
| `product.md` answers it | you, applying the answer |
| it dies with the task — a label, wording, an icon, a separator, the order of two fields | you, under "Decided by default" |
| **it outlives the task** — the user will see it (reach, placement, control type, interaction pattern) or the next task will copy it (layer boundaries, the shape of data, the shape of an error, when an abstraction appears) | the **`expert`** |
| its price, read off the plan and the diff — "this means rewriting three places" | **a stop** — the expert is not told the price and cannot weigh it |

Your one judgement is which row a fork is on; whether it needs the user is the
expert's. A fork arises from the **spec** being silent — `PRODUCT.md` describing
something differently is a reason to update `PRODUCT.md`, not a fork.

**"Decided by default"** in the spec holds what was settled without the user, each
line marked with its source: `(expert)`, or unmarked for your own call. It is what
he reads first in the evening.

`.boardown/docs/principles.md` keeps the code you write in the project's
conventions, and it is **read-only to you**, as is everything else under
`.boardown/docs/` — it is the page the `expert` judges your forks by, and a
developer who can edit it is grading his own work. A principle that looks wrong, or
an example the feature made stale, is a line in the final report, never a diff. The
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

### Stopping instead of asking

Three things stop the run, and nothing else does: a fork the **expert** sent up, a
question of **price**, and a defect still alive after the third fix round. An
irreversible or paid step — a new dependency, a change to the on-disk format or the
CLI's public contract, a migration, a release, anything against `CLAUDE.md` — is a
fork like any other: put it to the expert, which will send it up. Irreversible is
exactly the class that has to survive a night's sleep.

A stop is an ending, so leave the task where someone else can pick it up:

1. **do not commit** — a stop means the work is not accepted, and an uncommitted
   tree is the honest record of that. Do not revert what you built either;
2. **write the question into `log.md`** — the fork, the 2–4 options, which way you
   lean and why, the expert's reason where it came from there. This is the text the
   user answers from, and it is the only copy;
3. **set `outcome` to `needs-answer`, leave the status at `in-progress`** — the
   keyword alone, the reason lives in the log. `review` is for a run that finished;
   `blocked` means something outside the task stops it and no answer would unblock
   it;
4. **report** as below and end the run. Do not start a phase you cannot finish.

A run with no stops is fine, and so is a stop. What is wrong is a run that stopped
on a label, and a run that redesigned the product rather than stop.

## Phase 1 — Read the spec, explore the code it lands in, close what it left open

The spec is settled product; this phase does not reopen it. It learns how the code
stands where that product lands and closes the forks the spec does not reach —
before a line of the plan is written, the cheapest moment there is.

**Read `product.md` yourself, whole**, plus every frame in `refs/`. It was reviewed
cold during grooming and does not get reviewed again here.

**Then send the exploring out, one `Explore` per package the reach line touches,
all in one message.** This phase pays for the whole run: phase 2 is written from
these reports. Postponed, the plan gets written on guesses and the reading lands
mid-implementation with the source piling up in your context.

Triage what the exploring turns up: the spec answers it — apply the answer; it dies
with the task — decide it and append to "Decided by default"; it outlives the task
— one `expert` call with all such forks batched, since this phase is where they
cluster; the expert sends it up or its price is the question — stop.

Never rewrite a line the grooming session wrote: if implementation later proves one
impossible, that is a stop, with the line quoted. Zero findings and zero forks is a
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

Triage as in phase 1: update the plan for what you accept, record what you reject
and why.

## Phase 4 — Implementation

Implement the approved plan. If implementation teaches you the plan was wrong,
update `tech.md` and note the divergence — do not silently drift. Filling in what
the plan deliberately left out (names, signatures, props, the shape of a helper) is
not a divergence; a divergence changes what the plan decided — which file carries
the logic, how the data flows, what lands on disk.

**The Definition-of-Done documents are part of the change, not a phase of their
own.** `PRODUCT.md`, `README.md`, `CLAUDE.md` — and nothing else — are updated here,
with the code, so they reach the reviewer inside the same diff: prose about
behaviour is as wrong-able as code. Write what the product **is**, not what you
changed: "the Linked tasks section groups its rows by relation", never "grouping was
added". `PRODUCT.md` is descriptive, not a gate — a feature that goes past a line
under "Out of scope" is a reason to update it in the same change. A later round that
changes described behaviour updates these documents in the same round; a round that
only changes how something is built leaves them alone.

Then run the gates from the repo root and get them green:

```powershell
pnpm lint; if ($?) { pnpm typecheck }; if ($?) { pnpm build }; if ($?) { pnpm test }
```

A red gate is not a question for anyone — it is a defect in your own work. Keep at
it; a failure genuinely outside the task (a pre-existing one on a file you never
touched) is `blocked`, with the failing command in the log.

## Phase 5 — Code review

Invoke the `code-reviewer` agent, handing it `product.md`, `tech.md`, the `<slug>`
and — explicitly — **where the change is**: the uncommitted working tree, the
commits on this branch (`git diff main...HEAD`), or both. It does not guess.

For each finding: accept and fix, or reject with a stated reason. You have more
context than the reviewer and may disagree — but a rejected **blocker** goes into
the final report verbatim, so the user sees the call you made.

After fixing, re-run the gates, then continue the **same** reviewer session with
`SendMessage` (a new one would re-derive everything from cold): what you fixed, what
you rejected and why, and check the fixes only. That is **one** re-check, not a
loop. New blockers on the fixes themselves are a stop — you and the reviewer
disagree about something the user should settle.

## Phase 6 — Manual test

If the feature touched `packages/ui`, `packages/cli`, `packages/core` or any shell,
invoke the `manual-tester` agent and hand it exactly three things:

- the path to `product.md` — every line under *Look* and *Behaviour* is observable
  from outside, so the spec is both the description and what "works" means;
- the surface it must drive: the UI in a browser, the CLI from source, or both (a
  change in `core` reaches both, and the tester tests only what you point it at);
- your implementation notes — which surfaces and screens the feature appears on,
  anything that diverged from the plan, anything you already know is shaky.

The scenarios are the tester's to write. **Name no depth** — the default fits almost
every task; ask for `deep` when the change touches a shared component used outside
the task's reach.

Fix what it finds, re-run the gates, then continue the **same** tester session with
`SendMessage`: what you fixed, and which scenarios to re-run. **Hard cap: three
fix-and-retest rounds** — past three you are cycling on the same wrong hypothesis.
This is the only loop in the flow; every other phase runs once.

On a defect that survives the cap, put into the log and the report what you tried,
what the tester still sees, your best diagnosis, the ways forward as you see them
(more rounds, ship with the defect named, revert to whichever state the tester
measured as best, a different approach) and which state the tree is in now — the
user is choosing from it, so leave the tree where it is.

Skip this phase only for a change with no user-visible behaviour on any surface (an
internal refactor inside `core`), and say so in the report; a `cli`-only change is
not a skip. A `broken` verdict, a stop, or a skipped phase leaves no `demo.md` —
that file is the tester's own role, not something you ask for.

## Phase 7 — Commit

This is where the command departs from `CLAUDE.md`'s "never commit without explicit
permission", by the exception written there: a non-interactive flow has nobody to
ask, so it carries the conditions instead.

**Commit only when all of these hold**: gates green on the final state, code review
passed or its findings rejected with reasons, the tester's verdict in (or the phase
legitimately skipped), the Definition-of-Done documents matching the final
behaviour. Any of them missing means the run is stopping, and a stop does not commit
— a red commit poisons the branch for every task that starts after it.

**Finish the board first, commit second.** The ticked checklist and the `review`
status go in **before you stage anything**: they land in `.boardown/`, which is in
git, so setting them afterwards leaves the tree dirty with nothing but a second
commit to fix it. `--amend` is not available to you — this branch is shared with
every task that runs after yours.

**One commit**, into **the branch you are on** — never create, switch or merge
branches, and never `git push`:

```sh
git commit -m "feat(BD-42): export the current release to CSV"   # code + .boardown/
```

- the type follows the task's type on the board — `feat` / `fix` / `docs` / `chore`
  — and the scope is the task id;
- the subject says what the product now does, in English, present tense;
- **the task travels with its code.** The status, `plan` and `log` this run set are
  the record of this very change; split them off and neither half can be read,
  reverted or cherry-picked on its own;
- `chore(board)` (`CLAUDE.md`) is for a change touching **only** the board, and that
  scope is excluded from release notes — a feature commit is not bookkeeping;
- **stage by path, never `git add -A`.** Anything else in the tree was there before
  you; if files you did not touch are staged, unstage them.

Record the commit hash in the log.

## The report

Your last output is the report — the wrapper captures it, and it is what the user
reads in the evening. In the language the user speaks, led by how the run ended:
what happened first, detail after.

- what was built, in a couple of sentences;
- the "Decided by default" calls added during this run, **each with its source** —
  this is where he audits your autonomy;
- what the reviewer and the tester found, and what you rejected and why;
- gate status and the commit hash — or, on a stop, the state the tree is in;
- anything the tester could not verify;
- **findings outside this task** — a defect next door, a stale document, a weak
  spot. A section of its own, and it ends there: the board is not yours to add to.
  Below major, naming it is the whole treatment and the code ships with it named.

Then close the task as `task-tracking` says: last line of the log, then the status
to `review`. **You never set `done`** — that status is the user's signature on work
he has seen, and he gives it out of `review`.
