import { LINK_TYPES, RELEASE_STATUSES, TASK_STATUSES, TASK_TYPES } from '@boardown/core';
import type { CommandHandler } from '../types';

// A stable, self-describing contract for agents: valid enum values, the task
// shape, and the command grammar. Enum values are sourced from core so they
// never drift from the schemas.
const DESCRIPTOR = {
  version: 2,
  taskTypes: TASK_TYPES,
  taskStatuses: TASK_STATUSES,
  releaseStatuses: RELEASE_STATUSES,
  taskFields: {
    id: 'string, assigned by boardown (e.g. BD-12)',
    title: 'string',
    description: 'string',
    type: 'one of taskTypes',
    status: 'one of taskStatuses',
    epic: 'optional epic slug',
    order: 'number, managed by boardown',
    checklist: 'optional array of { id, text, done }; managed via `task checklist`',
    notes: 'optional array of { id, text, createdAt }; managed via `task notes`',
    links:
      'optional array of { type, to }; links to other tasks, mirrored on both sides; managed via `task link`',
  },
  linkTypes: LINK_TYPES,
  taskSummaryFields: {
    id: 'string',
    title: 'string',
    type: 'one of taskTypes',
    status: 'one of taskStatuses',
    epic: 'epic slug; omitted when the task has none',
    checklist: '{ done, total }; omitted when the task has no checklist',
    notes: 'number of notes; omitted when the task has none',
  },
  outputModel:
    'Listing commands return a task summary (taskSummaryFields); `task get` returns the whole task. --full takes any listing command one level deeper. Mutating commands return only the identifier of what changed.',
  commands: [
    {
      name: 'backlog',
      usage: 'boardown backlog [--full]',
      summary:
        'The Backlog view: the current release, each future release, then the unscheduled backlog. Data is { sections: [{ key, title, status, filename, taskCount, tasks }] }. --full returns whole tasks instead of summaries.',
    },
    {
      name: 'archive',
      usage: 'boardown archive [--full]',
      summary:
        'The Archive view: finished releases, newest first. Data is { releases: [{ slug, name, status, taskCount }] }; --full adds task summaries.',
    },
    {
      name: 'init',
      usage: 'boardown init [--id-prefix PP] [--project-name NAME]',
      summary: 'Create a .boardown/ board in the current directory.',
    },
    { name: 'task get', usage: 'boardown task get <id>', summary: 'Show one task and where it lives.' },
    {
      name: 'task list',
      usage:
        'boardown task list [--status STATUS] [--type TYPE] [--epic SLUG] [--release REF] [--backlog] [--text SUBSTR] [--full]',
      summary:
        'List tasks across the whole board, filtered by any combination of status, type, epic, release, backlog-only, or a case-insensitive text match on title/description. Data is { tasks: [{ ...taskSummaryFields, in: { kind, file } }], count }; --full returns { task, in } with whole tasks.',
    },
    {
      name: 'task add',
      usage:
        'boardown task add <title> [--type TYPE] [--status STATUS] [--description TEXT] [--epic SLUG] [--release FILE]',
      summary: 'Create a task in the backlog (default), an epic, or a release.',
    },
    {
      name: 'task edit',
      usage:
        'boardown task edit <id> [--title T] [--description D] [--type TYPE] [--status STATUS] [--epic SLUG | --no-epic] [--release REF | --no-release]',
      summary:
        'Edit a task. --release/--no-release move it in/out of a release; --epic/--no-epic reassign the epic (relocates a backlog/epic task, retags a task in a release).',
    },
    {
      name: 'task status',
      usage: 'boardown task status <id> <status>',
      summary: 'Change a task status.',
    },
    {
      name: 'task reorder',
      usage: 'boardown task reorder <id> (--before ID | --after ID | --up | --down)',
      summary: "Change a task's priority (order) within its container.",
    },
    { name: 'task rm', usage: 'boardown task rm <id>', summary: 'Delete a task.' },
    {
      name: 'task checklist',
      usage:
        'boardown task checklist (add <id> <text> | done <id> <item> | undone <id> <item> | edit <id> <item> <text> | rm <id> <item>)',
      summary: 'Manage a task checklist (alias: check). Item ids are c1, c2, …',
    },
    {
      name: 'task notes',
      usage:
        'boardown task notes (add <id> <text> | edit <id> <note> <text> | rm <id> <note>)',
      summary: 'Manage task notes (alias: note). Note ids are n1, n2, …, each with a createdAt timestamp.',
    },
    {
      name: 'task link',
      usage: 'boardown task link (add <id> <other-id> | rm <id> <other-id> | ls <id>)',
      summary:
        "Manage a task's links to other tasks. Only the `relates` type exists; it is symmetric and the record is mirrored into both tasks. `add` is idempotent, `rm` removes both records. `ls` data is { links: [{ type, to, title, status, taskType, missing }], count } — `missing` marks a link whose target is not on the board.",
    },
    {
      name: 'release get',
      usage: 'boardown release get <file|slug> [--full]',
      summary: 'Show one release and its task summaries; --full returns whole tasks.',
    },
    {
      name: 'release list',
      usage: 'boardown release list [--full]',
      summary: 'List releases (slug, name, status, task count); --full adds task summaries.',
    },
    {
      name: 'release current',
      usage: 'boardown release current [--full]',
      summary:
        'The Board view: the current release and its task summaries in order (release is null if none). --full returns whole tasks.',
    },
    {
      name: 'release add',
      usage: 'boardown release add <name> [--description TEXT]',
      summary: 'Create a future release.',
    },
    {
      name: 'release start',
      usage: 'boardown release start <file|slug>',
      summary: 'Make a release current (only one at a time).',
    },
    {
      name: 'release done',
      usage: 'boardown release done <file|slug> [--into <release>]',
      summary: 'Finish a release; open tasks return to epics/backlog or carry into --into.',
    },
    {
      name: 'epic get',
      usage: 'boardown epic get <slug> [--full]',
      summary: 'Show one epic and its task summaries; --full returns whole tasks.',
    },
    {
      name: 'epic list',
      usage: 'boardown epic list [--full]',
      summary: 'List epics (slug, name, color, task count); --full adds task summaries.',
    },
    {
      name: 'epic add',
      usage: 'boardown epic add <name> [--color #rrggbb] [--description TEXT]',
      summary: 'Create an epic.',
    },
    {
      name: 'epic edit',
      usage: 'boardown epic edit <slug> [--name NAME] [--description TEXT]',
      summary: 'Rename an epic or change its description.',
    },
    { name: 'schema', usage: 'boardown schema [--json]', summary: 'Print this contract.' },
  ],
  globalFlags: {
    '--json': 'Emit a JSON envelope (default when stdout is not a TTY).',
    '--data-dir': 'Point at a specific .boardown/ directory instead of searching upward.',
    '--full': 'On a listing command, go one level deeper than its default.',
  },
} as const;

export const schemaCommand: CommandHandler = () => ({
  data: DESCRIPTOR,
  human: JSON.stringify(DESCRIPTOR, null, 2),
});
