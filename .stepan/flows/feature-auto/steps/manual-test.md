# Test the behaviour

Spec: {{steps.explore.outcome.spec}}

For work touching `packages/ui`, `packages/cli`, `packages/core` or a shell,
call `manual-tester` with the spec, affected surfaces (UI, CLI, or both), and
implementation notes about observable risks and deviations. Request `demo.md`
next to the spec using the `.claude/specs/` path. The tester owns the sandbox
and scenarios; resume that tester for affected cases on rechecks.

Report `verdict=pass` when testing passes, `verdict=fail` for defects to fix,
or `verdict=skipped` only if no user-visible behaviour changed (not for a
CLI-only change). An unavailable required test is `blocked`, not a skip.
After three unsuccessful fix-and-retest rounds, stop as `needs-answer` and
log the attempts, remaining symptoms, diagnosis and options. Do not report a
demo scenario from a broken, stopped or skipped test as ready for this run.
