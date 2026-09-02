---
name: Cli
color: "#475569"
---

## task get accepts several ids

---
id: BD-108
type: feature
status: todo
order: 200
---

`task get` takes one id, and `task list --text` deliberately does not match ids, so reading a set of ids you already hold costs N calls. Take several at once: `task get BD-1 BD-2 BD-9`, or a repeatable `task list --id BD-1 --id BD-9` in the `--field` shape. Which of the two is a grooming decision.
