# Review the code

Spec: {{steps.explore.outcome.spec}}
Plan: {{steps.plan.outcome.plan}}

Call `code-reviewer` with the spec, plan, task folder name and explicit change
location: uncommitted tree, branch commits, or both. Resume the same reviewer
on a recheck with the files and fixes from this round, rejected findings and
reasons, and any real test failure.

Report `verdict=pass` when no accepted work remains or `verdict=fail` for
findings to fix.
Limit review to five rounds including the first. Accepted findings still open
at the limit mean `needs-answer`: log what remains and what was tried, then stop.
