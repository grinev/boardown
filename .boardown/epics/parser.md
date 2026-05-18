---
name: Parser
color: "#8957e5"
---

Markdown frontmatter parser and serializer for `.boardown/` files. Splits
each release/epic file into its file-level frontmatter, an optional
preamble, and the per-task H2 sections with their own frontmatter blocks.

Lenient by design: a broken frontmatter on one task does not block the
rest of the file, and a broken file does not block the rest of the board —
problems surface as gray cards on the board and a banner at the top of the
screen, never as a hard error.

## Tab focus is lost after switching themes

---
id: BD-13
type: bug
status: todo
order: 231
---

Hitting the theme toggle in Settings steals focus from the active tab,
so keyboard navigation jumps back to the start of the page.
