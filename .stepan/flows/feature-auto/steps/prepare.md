# Prepare the run

Task ID: {{task}}

Invoke `task-tracking` and `boardown`. Require one existing `BD-…` task in
`ready` with a readable spec in the configured `.claude/specs/` artifact store,
and no `outcome=rework`. Do not groom, create tasks, or take a rework round.
Do not create another artifact store. Reject an invalid start as `blocked`.
Do not mutate an unresolved task or overwrite a rework marker.

Apply autonomous `feature_auto` tracking throughout. Leave the manager's
`session` field alone. Write the plan and code yourself; delegate exploration
and independent judgement, keeping agent IDs for rechecks. Tell subagents
this run is unattended. Log phase openings before launching agents and agent
returns before triage. Use the CLI for board changes; `.boardown/docs/` is read-only.

Apply settled spec decisions and decide task-local details. Batch lasting
forks for `expert` with the spec, options and constraints, not your working
plan or diff. Record decisions and their sources. A cost question, expert
escalation or impossible spec requirement means `needs-answer`. External
blockers mean `blocked`. Do not ask the user in this session.

On a stop, preserve the tree without committing or reverting. For a resolved
task belonging to this run, put the reason and relevant options and attempts
in its log and set the outcome keyword; keep an implementing task
`in-progress`. If setup prevents logging, give the reason in the final
output. Report the stop and end the turn without advancing the Stepan step.
If the manager resumes this session with the user's answer, use the same
Stepan run and clear `needs-answer` once the answer settles the fork.
