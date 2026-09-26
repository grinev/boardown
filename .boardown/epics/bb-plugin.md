---
name: BB plugin
color: "#8b5cf6"
---

## Embed the board in bb

---
id: BD-133
type: tech
status: todo
order: 100
---

A bb plugin opens the board inside bb, the same UI the other shells show, in a chromeless iframe rather than bb's built-in browser. The plugin ships the boardown-web build and serves it from the plugin backend already running in bb's server: the same handlers and static assets, no second process and no separate install. The page comes up with the plugin and goes away with it, rooted at that project's .boardown/.
