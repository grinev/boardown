---
name: Tests
color: "#10b981"
---

## No DOM test environment for packages/ui

---
id: BD-111
type: tech
status: todo
order: 100
links:
  - type: relates
    to: BD-100
---

All five packages run vitest with environment: 'node', and the repo has no jsdom, happy-dom or testing-library dependency, so nothing that renders React can be covered automatically. Hooks that measure the DOM ship with the manual tester as their only witness — packages/ui/src/hooks/use-auto-grow.ts, added by BD-100, is the current example. Decide whether packages/ui gets a DOM environment plus a first set of component and hook tests, or whether Playwright stays the only UI coverage.
