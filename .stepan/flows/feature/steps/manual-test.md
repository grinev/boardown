# Test the behaviour

Spec: {{steps.explore.outcome.spec}}

For work touching `packages/ui`, `packages/cli`, `packages/core` or a shell,
call `manual-tester` with the spec, the affected surfaces (UI, CLI, or both),
and implementation notes about observable risks and deviations. Request
`demo.md` next to the spec using the `.claude/specs/` path. The tester owns the
sandbox and scenarios; resume the same tester for affected cases on rechecks.

Report `verdict=pass` when testing passes, `verdict=fail` when a defect needs
fixing, or `verdict=skipped` only if no user-visible behaviour changed (not
for a CLI-only change). An unavailable required test is a blocker, not a skip.
After three unsuccessful fix-and-retest rounds, present the evidence and
options to the user and wait. Use `verdict=accepted` only if the user explicitly
accepts the measured defect; do not mark the manual test passed.
