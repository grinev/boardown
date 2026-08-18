import {
  customFieldLabel,
  DEFAULT_TASK_PRIORITY,
  LINK_TYPES,
  RELEASE_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
} from '@boardown/core';
import { loadConfigIfAny } from '../persistence';
import type { CommandHandler } from '../types';

// A stable, self-describing contract for agents: valid enum values, the task
// shape, and the command grammar. Enum values are sourced from core so they
// never drift from the schemas.
const DESCRIPTOR = {
  version: 7,
  taskTypes: TASK_TYPES,
  taskPriorities: TASK_PRIORITIES,
  defaultTaskPriority: DEFAULT_TASK_PRIORITY,
  taskStatuses: TASK_STATUSES,
  releaseStatuses: RELEASE_STATUSES,
  taskFields: {
    id: 'string, assigned by boardown (e.g. BD-12)',
    title: 'string',
    description: 'string',
    type: 'one of taskTypes',
    priority:
      'optional, one of taskPriorities; an absent key means defaultTaskPriority. Setting it — including setting it to the default — writes the key and keeps it.',
    status: 'one of taskStatuses',
    epic: 'optional epic slug',
    order: 'number, managed by boardown',
    checklist: 'optional array of { id, text, done }; managed via `task checklist`',
    notes: 'optional array of { id, text, createdAt }; managed via `task notes`',
    links:
      'optional array of { type, to }; `type` is one of linkTypes, read from the side holding the record; links to other tasks, mirrored onto the other one as the inverse type; managed via `task link`',
    custom:
      'optional map of the board customFields values, stored flat in the task frontmatter; managed via `--field key=value` on `task add`/`task edit`',
  },
  linkTypes: LINK_TYPES,
  taskSummaryFields: {
    id: 'string',
    title: 'string',
    type: 'one of taskTypes',
    priority: 'one of taskPriorities; always present, resolved to defaultTaskPriority when unset',
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
        'boardown task list [--status STATUS] [--type TYPE] [--priority PRIORITY] [--epic SLUG] [--release REF] [--backlog] [--text SUBSTR] [--full]',
      summary:
        'List tasks across the whole board, filtered by any combination of status, type, priority, epic, release, backlog-only, or a case-insensitive text match on title/description (not the id — use task get for that). --priority matches the resolved value, so the default also matches tasks with no priority key. Data is { tasks: [{ ...taskSummaryFields, in: { kind, file } }], count }; --full returns { task, in } with whole tasks.',
    },
    {
      name: 'task add',
      usage:
        'boardown task add <title> [--type TYPE] [--priority PRIORITY] [--status STATUS] [--description TEXT] [--epic SLUG] [--release FILE] [--field key=value]',
      summary:
        'Create a task in the backlog (default), an epic, or a release. Without --priority no priority key is written and the task reads as defaultTaskPriority. --field is repeatable and sets a customFields value.',
    },
    {
      name: 'task edit',
      usage:
        'boardown task edit <id> [--title T] [--description D] [--type TYPE] [--priority PRIORITY] [--status STATUS] [--epic SLUG | --no-epic] [--release REF | --no-release] [--field key=value]',
      summary:
        'Edit a task. --release/--no-release move it in/out of a release; --epic/--no-epic reassign the epic (relocates a backlog/epic task, retags a task in a release). --field is repeatable and sets a customFields value; an empty value clears it.',
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
      usage:
        'boardown task link (add <id> <other-id> [--type <linkType>] | rm <id> <other-id> [--type <linkType>] | ls <id>)',
      summary:
        "Manage a task's links to other tasks. The relation is one of linkTypes, read from <id>'s side: `--type blocks` means \"<id> blocks <other-id>\". Each relation's record is mirrored into the other task as its inverse, so `blocks` reads as `blocked-by` there; `relates` is symmetric and is the default for `add`. One pair may carry several relations at once. `add` is idempotent per relation. `rm` with `--type` drops that one relation, without it every relation between the pair. Changing a relation is `rm` then `add`. `ls` data is { links: [{ type, to, title, status, taskType, missing }], count } — `missing` marks a link whose target is not on the board.",
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
      name: 'release edit',
      usage: 'boardown release edit <file|slug> [--name NAME] [--description TEXT]',
      summary:
        'Edit a release name/description. A new name moves the file to the slug it derives; a finished release is refused.',
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
      usage: 'boardown epic edit <slug> [--name NAME] [--description TEXT] [--color #rrggbb]',
      summary: 'Rename an epic or change its description or color.',
    },
    { name: 'schema', usage: 'boardown schema [--json]', summary: 'Print this contract.' },
  ],
  globalFlags: {
    '--json': 'Emit a JSON envelope (default when stdout is not a TTY).',
    '--data-dir': 'Point at a specific .boardown/ directory instead of searching upward.',
    '--full': 'On a listing command, go one level deeper than its default.',
    '--field': 'On `task add`/`task edit`, set a customFields value. Repeatable.',
  },
} as const;

// The declarations and the WIP limit are board-specific, so they ride along only
// when a board actually has them; otherwise the command prints the static
// contract unchanged — a board without either sees no new output.
export const schemaCommand: CommandHandler = async (_args, ctx) => {
  const config = await loadConfigIfAny(ctx.cwd, ctx.dataDir);
  const declared = config?.customFields ?? [];
  const wipLimits = config?.wipLimits;
  const data = {
    ...DESCRIPTOR,
    ...(declared.length > 0
      ? {
          customFields: declared.map((field) => ({
            key: field.key,
            label: customFieldLabel(field),
            type: field.type,
          })),
        }
      : {}),
    ...(wipLimits?.['in-progress'] !== undefined
      ? { wipLimits: { 'in-progress': wipLimits['in-progress'] } }
      : {}),
  };
  return { data, human: JSON.stringify(data, null, 2) };
};
