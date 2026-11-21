# Prepare the run

Request: {{task}}

Invoke `task-tracking` and `boardown`. Resolve exactly one existing Boardown task
(`BD-…`, a bare task number, or a title or description search). Read it with
`boardown task get`. If the target is ambiguous, ask the user. If this is a new
idea not on the board, ask the user to add it through grooming before advancing.
This is not a rework round: direct a task marked `outcome=rework` to `rework_auto`.
Check that `.claude/specs/` resolves; if the private artifact store is
unavailable, pause rather than creating a second copy.

Keep the task ID in this session. Report `route=ready` for a ready task with a
readable spec, or `route=groom` when the task still needs grooming. If a ready
task's spec is missing or unreadable, ask the user rather than replacing it.

You write the plan and code; delegate exploration and independent judgement.
Keep agent session IDs for rechecks, log the work through `task-tracking`, and
give the user short progress updates. Write board changes through the CLI;
`.boardown/docs/` is read-only. Do not commit in this flow.

Apply settled spec decisions. Decide task-local details yourself. Batch lasting
forks for `expert` with the spec, options and constraints, not your working plan
or diff. Ask the user and wait for an answer on cost, escalations or an impossible
spec decision. Record decisions with their sources.
