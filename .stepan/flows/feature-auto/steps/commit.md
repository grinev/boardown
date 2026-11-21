# Commit the task

As in `feature_auto`, make one local commit only on a fully verified final
state: all gates green, code review closed, manual test passed or legitimately
skipped, and documentation up to date. Stop without committing otherwise.

Finish board tracking before staging: close the checklist, leave `outcome`
empty, and set the task to `review`, never `done`. Commit this task's code and
public `.boardown/` task changes together. Stage only the task's paths, keep
unrelated staged work out of the commit, and use an English
`<type>(<task-id>): <what the product now does>` subject.

Do not switch, create or merge branches, amend, or push. Do not stage the
private `.claude/specs/` artifacts, commit in `boardown-manager`, or include
Stepan run state. Record the resulting commit hash in the task log.
