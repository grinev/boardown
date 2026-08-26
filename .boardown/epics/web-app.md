---
name: Web App
color: "#0ea5e9"
---

## Match the project list page styling to the board

---
id: BD-118
type: tech
status: todo
order: 100
---

The project list page at / in registry mode carries its own minimal styling — rows, buttons and dialogs assembled from currentColor and the system Canvas/CanvasText colours — so it only resembles the board rather than looking like it. It should read as the same product: the surfaces, controls and dialogs of the board UI, in light and in dark. The page serves several boards at once while a theme belongs to one board's config, so what it follows when the boards disagree is part of the task.

## The project list page does not render in Orca's built-in browser

---
id: BD-119
type: bug
status: todo
order: 200
---

The boardown-web list page (served at the registry root) stays blank when opened in the browser built into Orca, while the same URL renders normally in an ordinary browser. The server is not at fault: it answers 200 with the full HTML, and the log records no error. Worth checking what the embedded browser restricts — the inline <script> and inline <style> the page is built from, the <dialog> element the Add/Remove flows use, or the modern CSS the page leans on (color-mix(), color-scheme). The host check may also matter: the server accepts only 127.0.0.1, localhost and ::1 in the Host header, so an embedded browser reaching it by any other name is refused.
