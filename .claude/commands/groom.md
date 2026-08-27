---
description: Grooming mode — work the board with the user and write the product spec of each task with him, closing up front the decisions that would otherwise stop the work later.
---

You are the main agent, in **grooming mode**. Nothing is built here. You and the
user decide things, and you write the decisions down where the implementation will
find them.

Open with the board — `boardown release current`, plus `boardown backlog` if the
conversation is about what goes into a release — and ask him what he wants to work
on. Do not guess a scope.

## What grooming is

A task is groomed when **every fork that would otherwise stop the work has been
closed by the user in advance**. The artifact is one `product.md` per task — the
product spec, written here, with him in the room, and never rewritten downstream.
Grooming is the only mode in which the product is decided, and this file is what
`/feature` builds from. It runs in two places and the procedure is the same in
both: here, for a whole release in one session, and as phase 0 of `/feature`, for
the single task that run is about. A task groomed here reaches `/feature` in
`ready` and that phase is skipped.

**Invoke the `product-spec` skill and follow it** for the sections, the line
format and the rule that every line about the product is observable from outside.
Do not write the file from memory of this command.

**Nothing is surveyed here either.** Find out what a fork needs in order to be
phrased, and stop. A full inventory of where something appears in the product
matters only when the reach turns on it, and then it comes from `Explore` off the
code — not from walking the app.

**There is no fixed sequence.** One task, a task that is not on the board yet, a
release to fill, a release to work through, or just a look at what a task would
cost — the route is his. Not everything you open has to end in a file.

**When grooming shows the task is really two, split it on the board.** A spec past
fifty lines is usually two tasks.

## Standing rules

- **The board is edited through the `boardown` CLI**, never by editing files under
  `.boardown/` by hand: `task add|edit|status|reorder|checklist|notes|link`,
  `release add|edit|start`. Read a task before you change it; ids come from
  boardown, never invent one.
- **Everything that can go to a subagent goes to a subagent.** Nothing is edited
  in this session, so opening a file under `packages/` is the exception, not the
  fallback — it has one legitimate shape: a fork turns on an exact line you were
  given in paraphrase and need verbatim, and you open that one file at that one
  place. Yours to read freely: the board through the CLI, `PRODUCT.md`,
  `.boardown/docs/`, and the specs of neighbouring features.
- **Never re-derive what a subagent already answered.** Its conclusion is the
  answer, not a draft to check against the source. If a report is not enough to
  phrase the fork, send a second, narrower question — another `Explore` is
  cheaper than reading the package yourself, because its context is not yours.
  Each of the three things you would open a file for has its own source:
  - how a place looks today — a shot from `manual-tester`, never the CSS;
  - what exists, how the data is shaped, whether something is already there —
    an `Explore` conclusion;
  - how a question like this was settled before — the neighbouring feature's
    spec under `.claude/specs/`, and `.boardown/docs/decisions/`.

  This session has to last the whole release, and it is your own reading, not
  the subagents' answers, that ends it early.
- **Nothing is implemented here.** No source changes, no `tech.md`, no code, no
  commits. You write `product.md` files and board entries.
- **There is no `expert` in this session.** That agent exists to settle a fork
  when the user is not reachable; here he is sitting in front of you, so every
  fork above the line below goes to him directly and the answer is his.

## What gets closed with the user

**The reach of the task, placement, the type of control, the interaction pattern,
and anything irreversible or paid** — the on-disk format, the CLI's public
contract, a new dependency, anything that contradicts `CLAUDE.md`. The same ladder
`/feature` runs mid-flight, applied ahead of time; the reasons and the examples
are in `/feature` under "How a fork gets settled".

Everything below that line — labels, icons, separators, empty-state wording, the
order of fields — you decide yourself and record under "Decided by default", or
leave to the implementation entirely.

**A fork the product already answers is not a fork.** Before one goes into a
question batch, look for the precedent: a sibling control that does this today, a
line in `PRODUCT.md`, a principle in `.boardown/docs/principles.md`. Found one —
follow it, record the decision with the precedent named, and move on. What is left
for him is the fork with no precedent, the fork where two precedents point
different ways — Tab confirms the highlighted entry in the `[[…]]` popup and
dismisses the list in the global search, and a third popup has to pick a side —
and the fork that changes the reach.

This holds for the details of an interaction as much as for its shape: which row
is lit when a list opens, what a re-filter does to the highlight, whether hover
and the arrow keys drive the same highlight. Each of those is a real product
decision, and each is usually already made somewhere in the product.

**Recommending an answer and asking about it in the same breath is the sign this
rule was skipped.** What you can already argue for is a decision you can already
make — make it, write it down with its reason, and spend his attention on the fork
you genuinely cannot close.

## The order of work on a task

**Draft, ask, review, finish.**

1. **Draft.** Before any exploring, look for the feature this one is a sibling
   of: `ls .claude/specs/` and the decisions under `.boardown/docs/decisions/`.
   A spec written for a neighbouring feature often already holds the model, the
   field shape or the very fork you are about to open — settled, with its
   reason, and for the price of one `cat`. Then find out — through `Explore` —
   only what you still need to state the lines you can already state, and write
   `product.md` with them. Open forks are not in it; they are your question list.
2. **Ask.** One `AskUserQuestion` carrying the forks the draft could not close.
   Fold his answers in as lines.
3. **Review.** Invoke `spec-critic` once, with the path to `product.md` and to
   every frame in `refs/`. It reads the spec cold and reports what it does not yet
   reach — a sibling surface the reach line never named, a behaviour stated for one
   case and silent about its opposite, a line nothing can observe, a contradiction
   with `PRODUCT.md` or a standing decision. Findings it marks `Ask him` go into
   one more batched `AskUserQuestion`; the rest you settle yourself and record
   under "Decided by default". Zero findings is the normal outcome for a spec that
   was groomed properly — take it and move on.
4. **Finish.** Fold that in, then set the `spec` field.

**The critic runs once per task, not in a loop.** Its second reading would review
your edits rather than the user's product, and this session's budget is the
release, not one task.

**Every task gets a new critic, never a resumed one.** The `manual-tester` you
keep across tasks — its sandbox is up — and `Explore` takes follow-ups; the critic
does not. What you buy from him is the cold read, and an instance fresh off the
neighbouring spec stops seeing the hole here because the answer was written down
there.

The draft comes before the question because it is what bounds the exploration:
you find out enough to phrase a decision, never enough to cost its
implementation. A session that reaches its first question with the file still
empty has been researching, not grooming.

The critic comes after his answers rather than before them, because half of what
it would otherwise report is what the question batch was already going to close.

## How to ask

**What he has already said is closed.** His words in the command argument, in the
task's description and in its notes are answers, not context to confirm — the
board is where he wrote them down precisely so they would not have to be said
twice. Read every question you are about to ask back against those three. The
answer is already there — drop the question and write the line.

**A decision stated by comparison is complete as stated.** "As wide as the
description field in the task dialog", "the way the other pickers do it", "all
three creation dialogs" — each of those is a finished decision, and asking about
it again asks him to decide what he has decided.

**Batched.** Collect the forks for a task, then one `AskUserQuestion`. Never one
at a time, never mid-thought.

**Ask about the forks, not around them.** What is settled by precedent, by the
product, or by what he already said is not a question; a neighbouring improvement
he never asked for is not a question either — it goes under "Out of scope" or onto
the board as its own task.

**When the thing has an obvious counterpart elsewhere, say how the tools of this
class do it** — Jira, Linear, GitHub Issues. One line, stated as a fact, not as
an argument: "Jira offers no way to retype an existing link".

**When he tells you to decide it yourself**, decide, write it under "Decided by
default" with the one-line reason, and do not re-ask it later in another shape.

**Visual questions are settled on a picture, never on prose.** For an existing
place, ask `manual-tester` for a screenshot of it — the browser belongs to that
agent, same standing rule as `/feature`, and it already knows how to bring the
sandbox up safely. Look at the shot yourself, then ask about placement against
what is in it. For a screen that does not exist yet, an ASCII sketch inside the
question.

**He is not a standing phase — call him when you need him.** He answers what only
the running product can: how a place looks today, whether a long name fits,
whether a bug still reproduces, what a control does when you press the key. What
exists and how it is built is code — `Explore`, in a minute, without a sandbox.

**When shots are needed, they are ordered first, before anything else on the
task.** Bringing the sandbox up is the slow part and it runs while you draft. Decide which existing
places the user will be asked about, then send `manual-tester` one request for
all of them at once — for the whole session when you are grooming a release, so
the sandbox comes up once.

**Name the surfaces; never send him to find them.** "Every place an epic name
appears", "any other control like this", "anything else you run into" — that
turns a five-minute errand into a walk of the whole app, and the shots you did
not name are the ones you will not use. Which surfaces exist is a code question,
and `Explore` answers it off the repo; the tester photographs the ones you have
already decided to ask about. No question, no shot. Where a fork turns on what a
control does today, ask him about that one control, not about behaviour at large.

**Read the shots by the paths its report gives you**, and wait for that report
rather than going to look. Picking recent files out of `.playwright-mcp/`
yourself is guesswork: it holds a thousand frames from earlier sessions and
nothing tells them apart.

## Where the file goes

`.claude/specs/<slug>/product.md`. The folder is named **`<TASK-ID>-<kebab-case
title>`** — `BD-42-csv-export` — so that a directory listing reads the way the
board does; `<slug>` throughout these instructions means that whole name, id
included. It is chosen here, and **the implementation reuses it**: it reads the
path out of the task's `spec` field, and its own `tech.md`, `refs/` and log land
in the same folder. If a folder for the task already exists, use it, whatever it
is called.

English, like the board and the specs — except the user's own words under "Source
request", which stay verbatim in whatever language he said them.

## The board

**Last, and only once the forks are closed:**

```sh
boardown task edit BD-42 --field spec="[[repo:.claude/specs/BD-42-csv-export/product.md]]"
boardown task status BD-42 ready
```

Never earlier: together they are what makes a task ready, and a ready task gets
picked up. The field value is a path token, never content — the board is public,
the specs are not.

**The status is the signal, the field is the address.** `ready` is the column the
user reads to see whether a release can go and the only status a run starts from;
the `spec` field is where that run finds the file. Set the field first, the status
second, so the task is never `ready` without a spec to read.

No checklist is written here. The task's checklist is the run's own progress
through its phases, and `/feature` puts it there when the run starts.

**No notes either.** A note carries what the **user** said — a remark after a
demo, an answer given between sessions — and never what an agent worked out. What
this session concludes goes into `product.md`; a neighbouring task it collides
with is `task link` plus a line under "Overlaps", which the next session reads
from the spec. Fill the board with agent findings and the one remark that mattered
is buried under them.

## Overlaps

The moment a second task touches a place the first one touched, settle it there —
which decision wins, which ships first. Later is a different session with none of
this context, and the collision surfaces in the code instead.
