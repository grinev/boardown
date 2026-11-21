# Review the code

Spec: {{steps.explore.outcome.spec}}
Plan: {{steps.plan.outcome.plan}}

Call `code-reviewer` with the spec, plan, task folder name and explicit change
location: uncommitted tree, branch commits, or both. On a recheck, resume the
same reviewer and give the changes since the last pass, rejected findings and
reasons, and any real test failure.

Report `verdict=pass` when no accepted work remains; otherwise report
`verdict=fail` for fixes. If the review recheck raises new blockers on the
fixes, ask the user and wait rather than starting another blind round.
