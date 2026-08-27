---
description: Run a groomed task end to end with nobody in the room — product spec to reviewed, tested, committed code — stopping instead of asking when a fork is genuinely the user's.
argument-hint: <a board task id in the ready status>
---

Take this task from its product spec to reviewed, tested, committed code:

**$1**

You are the main agent. You write the plan and the code yourself. The subagents
give you independent judgement — an architect, an arbiter, a reviewer, a tester —
and you decide what to do with it. Never delegate the writing of code or of the
plan.

**The product spec is not yours to write.** It was written with the user during
grooming and it is the input to this run.

This is `/feature` with nobody in the room. Same ladder, same phases, same
artifacts; two things differ, and they are the whole of this file: you cannot ask,
and you commit.

## Nobody will answer you

There is no human in this session. `AskUserQuestion` reaches no one, and a
question written into your output is a sentence nobody is waiting for. **Asking is
replaced by stopping** — the protocol is below, and it is a real ending, not a
failure.

That cuts both ways. Stopping on something you could have settled wastes a slot in
the queue and the user's evening; grinding on through a fork that outlives the
task spends his product without him. Which of those a fork is is decided by the
ladder, not by how stuck you feel.

## The task on the board

`$1` is a board task id (`BD-42`). **Invoke the `task-tracking` skill first and
follow it**: which task you are working, where its `<slug>` folder is, what goes
into its fields, the progress checklist, the log you keep as you go, the status
you end on. It runs alongside every phase below.

Two things stop the run before it starts, and both end it as `blocked` with the
reason in the log:

- **the task is not in `ready`** — it was never groomed, or it is already being
  worked. The spec is written with the user in `/groom`, which is what puts a task
  into `ready`, and starting without one means inventing the product from a title.
  A `ready` task carrying `outcome: rework` is not yours either: the user sent it
  back after seeing it, and a round of his remarks is `/rework_auto`;
- **`$1` is not a task id** — an idea in prose is a grooming session, not this
  command. You do not create the task yourself: what enters a release is the
  user's call, and an agent that can add tasks fills the board with its own
  guesses.

`session` is not yours either — the wrapper that started you owns that field.
Leave it alone.

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

## While a subagent works, you hold the turn — a standing rule, every phase

**Launch it, then immediately call `TaskOutput` on the task id it returned, with
`block: true` and `timeout: 600000`** — one call per subagent you started, and
call again if it comes back with the agent still running. Only when every one of
them has reported do you write your next line.

The reason is that this command runs headless: there is no one to send you a next
message, and the process exits the moment you end a turn without calling a tool —
killing every subagent still working, mid-sentence, with its report lost. "The
reviewer and the tester are running, waiting for their reports" is not a status
line here; it is the last thing the run ever does, and the work of both is gone.

Inside a blocking call the run is alive and nothing is burning, so there is
still nothing to poll and nothing to keep warm: no `echo`, no `sleep`, no
progress check, no "one more file while it runs". Each of those is a full round
trip that enters your context and returns nothing.

What is worth doing before a wait, not during it: launch everything that can run
in parallel **in a single message**, then block on each of them in turn — **and
write the log line for the phase you are opening.** Inside the blocking call you
cannot write anything, so a phase whose start was never logged looks, to the
manager watching you and to the user tonight, exactly like a run that died. One
`Agent` call per message costs a full round trip each and buys nothing: three
`Explore` agents belong in one message, not three.

**Parallel means inside one phase, never across the witnesses.** The architect,
the reviewer and the tester run strictly one after another, and each starts only
once the previous one's findings are closed and the gates are green again. A
witness judges the final state; one started on a state you are about to change
has judged nothing, and its report is worthless the moment your fix lands. Both
running at once is what killed the first autonomous run on this repo (BD-100,
20 August 2026) — two reports lost, and neither would have counted anyway.

**When it comes back, its line is the first thing you write** — before you triage
a finding, before a fix. Lines sharing one timestamp are lines written from memory
after the fact: a `back` stamped with the same second as `findings closed` says
the reviewer returned exactly when you finished fixing, and hides the interval the
log exists to show.

## Artifacts

Everything lives in the task's `.claude/specs/<slug>/` — the folder named
`<TASK-ID>-<kebab-case title>`, `BD-42-csv-export`, as `task-tracking` fixes it:

- `product.md` — **the input.** Written during grooming, with the user. You read
  it, you build what it says, and you extend only its "Decided by default"
  section as calls get made during the run. Everything else in it stands.
- `tech.md` — how we build it. Yours.
- `log.md` — the running protocol, appended as you go. In this run it is the only
  channel back to the user, so a line missing from it did not happen.
- `refs/` — frames and references the spec cites. A frame taken during grooming
  shows the product **as it is today** and marks what must not move; a mockup the
  user attached shows what to build and settles every fork it shows.

These are working material, not a deliverable.

## How a fork gets settled

Take the first row that fits:

| The fork | Who settles it |
|---|---|
| `product.md` answers it | you, applying the answer |
| it dies with the task — a label, wording, an icon, a separator, the order of two fields | you, under "Decided by default" |
| **it outlives the task** — the user will see it (reach, placement, control type, interaction pattern) or the next task will copy it (layer boundaries, the shape of data, the shape of an error, when an abstraction appears) | the **`expert`** |
| its price, read off the plan and the diff — "this means rewriting three places" | **a stop** — the expert is not told the price and cannot weigh it |

Your one judgement is which row a fork is on. Whether it needs the user is the
expert's.

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
in the final report — never a diff.

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

### Stopping instead of asking

Three things stop the run, and nothing else does: a fork the **expert** sent up, a
question of **price**, and a defect still alive after the third fix round.

A stop is an ending, so leave the task in a state someone else can pick up:

1. **do not commit** — a stop means the work is not accepted, and an uncommitted
   tree is the honest record of that. Leave the tree as it is; do not revert what
   you built, and do not keep going on a hunch;
2. **write the question into `log.md`** — the fork, the 2–4 options, which way you
   lean and why, and the expert's reason where the question came from it. This is
   the text the user answers from, and it is the only copy;
3. **set `outcome`** to `needs-answer` and **leave the status at `in-progress`** —
   the keyword alone; the reason lives in the log, as `task-tracking` says.
   `review` is for a run that finished; a stop did not. `blocked` is different
   again: it means something outside the task stops it, and no answer of his would
   unblock it;
4. **report** as below and end the run. Do not start a phase you cannot finish.

A stop is not a defeat, and neither is a run with no stops. What is wrong is a
run that stops on a label, and a run that redesigned the product rather than stop.

An irreversible or paid step — a new dependency, a change to the on-disk format or
the CLI's public contract, a migration, a release, anything against `CLAUDE.md` —
is a fork like any other: put it to the expert, and it will send it up. What you
never do is take it because it seemed necessary; irreversible is exactly the class
that has to survive a night's sleep.

A fork arises from the **spec** being silent, not from yesterday's document:
`PRODUCT.md` describing something differently is a reason to update `PRODUCT.md`
with the change, not a fork.

**"Decided by default"** in the spec holds what was settled without the user, each
line marked with its source: `(expert)`, or unmarked for your own call. In this
run there is no `(human)` mark to add — that is the point of the section, and it
is what he reads first in the evening.

## Phase 1 — Read the spec, explore the code it lands in, close what it left open

The spec is settled product; this phase does not reopen it. What it does is learn
how the code stands where that product lands, and close the forks the spec does
not reach — both before a line of the plan is written, the cheapest moment there
is.

**Read `product.md` yourself, whole**, plus every frame in `refs/`. It was already
reviewed during grooming — a critic read it cold and its findings were closed with
the user — so it does not get reviewed again here.

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
- **the expert sends it up, or its price is the question** — stop, as above.

Append what gets settled to the spec's "Decided by default" with its mark. Never
rewrite a line the grooming session wrote: if implementation later proves one
impossible, that is a stop, with the line quoted.

Zero findings and zero forks is a normal outcome for a well-groomed task — say so
in the log and move on.

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
and why. A genuine fork runs through the ladder; a rewrite whose price is the
question is a stop.

## Phase 4 — Implementation

Implement the approved plan. Stay inside it: if implementation teaches you the
plan was wrong, update `tech.md` and note the divergence — do not silently drift.

Filling in what the plan deliberately left out — names, signatures, props, the
shape of a helper — is **not** a divergence and needs no note. A divergence is a
change to what the plan actually decided: which file carries the logic, how the
data flows, what lands on disk.

**The Definition-of-Done documents are part of the change, not a phase of their
own.** `PRODUCT.md`, `README.md`, `CLAUDE.md` — and nothing else — are updated
here, with the code, so they go to the reviewer inside the same diff and get
judged like everything else you wrote. Prose about behaviour is as wrong-able as
code, and the reviewer is the only reader who checks it against the change.

Write what the product **is**, not what you changed: "the Linked tasks section
groups its rows by relation", never "grouping was added". A paragraph that reads
like news was written from the diff instead of from the product.

**PRODUCT.md is descriptive, not a gate.** A feature that goes beyond it — past a
line under "Out of scope" included — is a reason to update PRODUCT.md in the same
change.

Every later round that changes described behaviour updates these documents in the
same round as the code — never as a pass at the end. A round that only changes how
something is built leaves them alone.

Then run the gates from the repo root and get them green:

```powershell
pnpm lint; if ($?) { pnpm typecheck }; if ($?) { pnpm build }; if ($?) { pnpm test }
```

Do not proceed to review with a red gate. A gate you cannot get green is not a
question for anyone — it is a defect in your own work; keep at it, and if it is
genuinely outside the task (a pre-existing failure on a file you never touched),
that is `blocked`, with the failing command in the log.

## Phase 5 — Code review

Invoke the `code-reviewer` agent, handing it `product.md`, `tech.md`, the
`<slug>`, and — explicitly — **where the change is**: the uncommitted working tree,
or the commits on this branch (`git diff main...HEAD`), or both. It does not guess.

For each finding: accept and fix, or reject with a stated reason. You have more
context than the reviewer and you are allowed to disagree — but a rejected
**blocker** goes in the final report, verbatim, so the user sees the call you
made.

After fixing, re-run the gates, then continue the **same** reviewer session with
`SendMessage` (do not spawn a new one — it would re-derive everything from cold):
tell it what you fixed, what you rejected and why, and ask it to check the fixes
only.

That is **one** re-check, not a loop. If it comes back with new blockers on the
fixes themselves, stop — with the reviewer's blocker, your reading of it, and the
ways forward you see. A second round means you and the reviewer disagree about
something the user should settle.

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
and derives them itself at the depth you set. **Name no depth** — that is the
default, and it fits almost every task. Ask for `deep` when the change touches a
shared component that callers outside the task's reach also use.

Fix what it finds, re-run the gates, then continue the **same** tester session
with `SendMessage`: what you fixed, and which scenarios to re-run.

A `broken` verdict, a phase that ends in a stop, and a phase legitimately skipped
all leave no `demo.md` — the file the tester writes for whoever shows this feature
to the user. Nothing here asks him for it; it is part of his own role.

**Hard cap: three fix-and-retest rounds.** If a defect is still there after the
third round, stop. Do not start a fourth — past three you are almost certainly
cycling on the same wrong hypothesis, and each round burns real budget for
nothing. This is the only loop in the flow; every other phase runs once.

In the log and the report put what you tried, what the tester still sees, your
best diagnosis, and the ways forward as you see them — more rounds, ship it with
the defect named, revert to whichever state the tester measured as best, or a
different approach. Say which state the tree is in now, because the user is
choosing from it. Leave the tree there; reverting is one of his options, not a
step you take on your own.

Skip this phase only for a change with no user-visible behaviour on any surface
(an internal refactor inside `core`), and say so in the report. A `cli`-only
change is not a skip — the tester drives the CLI from source.

## Phase 7 — Commit

This is where this command departs from `CLAUDE.md`'s "never commit without
explicit permission", and it does so by the exception written there: a
non-interactive flow has nobody to ask, so it carries the conditions instead.

**Commit only when all of these hold**: gates green on the final state, code
review passed or its findings rejected with reasons, the tester's verdict in (or
the phase legitimately skipped), the Definition-of-Done documents matching the
final state of the behaviour. Any of them missing means the run
is stopping, and a stop does not commit — a red commit poisons the branch for
every task that starts after it.

**Finish the board first, commit second.** The ticked checklist and the `review`
status go in **before you stage anything** — they land in `.boardown/`, which is in git, so
setting them after the commit leaves the tree dirty again with nothing but a
second commit or an `--amend` to fix it. `--amend` is not available to you here:
this branch is shared with every task that runs after yours.

**One commit**, into **the branch you are on** — never create, switch or merge
branches, and never `git push`. The code and the task that describes it go in
together:

```sh
git commit -m "feat(BD-42): export the current release to CSV"   # code + .boardown/
```

- the type follows the task's type on the board — `feat` / `fix` / `docs` /
  `chore` — and the scope is the task id;
- the subject says what the product now does, in English, present tense;
- **the task travels with its code.** What this run put on the board — the status,
  `plan`, `log` — is the record of this very change, and a
  commit that carries the code without them is a commit whose own task still
  says `todo`. Split them and neither half can be read, reverted or cherry-picked
  on its own;
- `chore(board)` (`CLAUDE.md`) is for a change that touches **only** the board —
  grooming, reordering, a release edited by hand. That scope is excluded from
  release notes so bookkeeping never reaches the changelog; a feature commit is
  not bookkeeping and is not excluded;
- **stage by path, never `git add -A`.** You commit what you changed; anything
  else in the tree was there before you and is not yours to sweep up. If files you
  did not touch are staged, unstage them.

Record the commit hash in the log.

## The report

Your last output is the report — the wrapper captures it, and it is what the user
reads in the evening. In the language the user speaks, and led by how the run
ended: what happened first, detail after.

- what was built, in a couple of sentences;
- the "Decided by default" calls added during this run, **each with its source** —
  this is where he audits your autonomy, and what the expert settled he never saw;
- what the reviewer and the tester found, and what you rejected and why;
- gate status and the commit hash — or, on a stop, the state the tree is in;
- anything the tester could not verify;
- **findings outside this task** — a defect in a neighbouring component, a stale
  document, a weak spot next door. A section of its own, and it ends there: the
  board is not yours to add to. Below major, that line is the whole treatment and
  the code ships with the defect named. Major and above gets said plainly, so the
  user or the manager can decide whether it becomes a task.

Then close the task as `task-tracking` says: last line of the log, then the status
to `review`. **You never set `done`** — that status is the user's signature on
work he has seen, and he gives it out of `review`.
