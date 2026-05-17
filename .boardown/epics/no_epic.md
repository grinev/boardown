---
---

## Refactor common parser helpers

---
id: BD-12
type: tech
status: todo
order: 100
---

Several internal helpers in `parser.ts` could be lifted into a shared
module once `serializer.ts` starts to need them too.

## Tab focus is lost after switching themes

---
id: BD-13
type: bug
status: todo
order: 200
---

Hitting the theme toggle in Settings steals focus from the active tab,
so keyboard navigation jumps back to the start of the page.
