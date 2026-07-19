---
{}
---

## Add task links types

---
id: BD-57
type: feature
status: todo
order: 300
---

## Add Create task button to epic

---
id: BD-42
type: feature
status: todo
order: 500
---

## Add optimistic locks on item save

---
id: BD-30
type: tech
status: todo
order: 1100
---

## Add assignee field to task

---
id: BD-50
type: feature
status: todo
order: 1200
---

## View and edit release description

---
id: BD-28
type: feature
status: todo
order: 1300
---

## Add release dates

---
id: BD-20
type: feature
status: todo
order: 1400
---

## Edit epic color

---
id: BD-21
type: feature
status: todo
order: 1500
---

## Multiple active releases support

---
id: BD-22
type: feature
status: todo
order: 1600
---

## Change releases order in backlog

---
id: BD-23
type: feature
status: todo
order: 1700
---

## Add labels to tasks and label filters

---
id: BD-29
type: feature
status: todo
order: 1800
---

## Show last updated date on tasks

---
id: BD-32
type: feature
status: todo
order: 1900
---

## Add localization infrastructure

---
id: BD-38
type: tech
status: todo
order: 2000
---

## Customizable task types

---
id: BD-52
type: feature
status: todo
order: 2100
---

## Make finished releases read-only in the UI

---
id: BD-53
type: bug
status: todo
order: 2200
---

Tasks in a finished release open with fully active controls (status select, checklist, notes). core correctly rejects the write ('Cannot edit a task in a finished release') so the data is safe, but the UI surfaces nothing: the error only lands in the browser console and the click silently does nothing. Disable the controls for finished releases instead of letting them fail.

## Navigation in popup windows

---
id: BD-55
type: feature
status: todo
order: 100
---

Back arrow when open one popup from another
