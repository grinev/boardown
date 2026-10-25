---
title: Task panel for embedding hosts
---

**Status:** proposal — not groomed, not scheduled.

An app that embeds a board page in an `iframe` (`?embed`, `#task=<id>`) can steer the board, but it
cannot add anything to it and hears nothing back from it. This page describes a small extension
point: the host puts a few controls of its own on a task, and learns when one is clicked —
without boardown knowing what the controls mean.

## Motivating case

A host that runs coding agents wants, on each task:

- a **Run** button, with a choice of agent;
- once an agent is running for that task, its **status** in place of the button — a spinner while
  it works, a different tone when it needs attention or has finished;
- that status as a **link**: clicking it takes the user to the agent inside the host app.

None of this is board data, and none of it should become a boardown feature. Boardown only draws
what the host describes and reports clicks back. An agent that changes the board does it through
the CLI, and the existing live refresh shows the result.

## Where it shows

One fixed slot to start with: the task dialog, in the row of the status pill at the top of the
sidebar, to the right of it. A compact form on the board's task cards may follow, on the same
protocol.

Until a host sends a panel, the slot does not exist — a board opened in a plain tab looks exactly as
it does today.

## Transport

`window.postMessage` between the board page and its parent window. It is the standard way for a
page in a cross-origin frame to talk to its embedder, so it ties boardown to no host technology: a
browser page, a desktop app, any other embedder speak it alike.

- The board listens only when it is framed (`window.parent !== window`), whatever `?embed` says, and
  accepts a message only when `event.source === window.parent`. The parent's origin is not checked:
  a host loaded from `file://` has the origin `"null"`, which names nobody.
- It sends with target origin `'*'` for the same reason. Before a host has sent a panel, the only
  thing it sends is `ready`, so a page that frames the board without speaking the protocol learns
  nothing.
- The host should accept a message only from its frame's `contentWindow` and the board server's
  origin.
- Every incoming message is validated against a schema; one that does not match is ignored whole.

## Protocol (version 1)

Board → host:

```ts
{ type: 'boardown:ready', protocol: 1 }   // after the page loads; the host answers with its full state
{ type: 'boardown:action', taskId: 'BD-12', actionId: 'run', optionId?: 'agent-a' }
```

Host → board:

```ts
// The panel every task shows unless it has its own.
{ type: 'boardown:task-panel-default', controls: Control[] }

// One task's own panel; null returns it to the default.
{ type: 'boardown:task-panel', taskId: 'BD-12', controls: Control[] | null }
```

The vocabulary of controls is deliberately tiny:

```ts
type Control =
  | { kind: 'button'; id: string; label: string; icon?: LucideName;
      options?: { id: string; label: string }[] }   // a split button when options are given
  | { kind: 'status'; label: string; busy?: boolean;
      tone?: 'neutral' | 'success' | 'warning' | 'danger';
      actionId?: string };                            // clickable when actionId is given
```

Icons are lucide names, the same set `config.yaml` already accepts. Colours come from the theme
palette, so the panel follows the board's theme and a host's shared theme with no extra input.

The state lives only in the host and is never written into the board. A reload of the frame sends
`ready` again, and the host sends its state again.

## Shape in the code

- **`ui`** — a panel component in the dialog's status row; the panels reach it through a store
  action, since they change after mount; a click leaves through an `App` callback prop.
- **`web`** — the bridge between `postMessage` and the store: schemas, `ready`, the listener.
- **`core`, the CLI, the VS Code and Electron shells** — unchanged. The VS Code and Electron shells
  could feed the same store action from their own hosts later, without touching `ui`.
- **PRODUCT.md** — the protocol documented next to `?embed` and `#task=`.

## Open questions

- Agent choice: options on the Run button (drawn by the board), or a bare `run` and a picker drawn by
  the host?
- Tasks in a finished release: show the panel as the host sent it, or hide it there?
- Protocol versioning: what the board does with a host that speaks a newer version.
