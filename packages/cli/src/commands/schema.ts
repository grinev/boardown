import { RELEASE_STATUSES, TASK_STATUSES, TASK_TYPES } from '@boardown/core';
import type { CommandHandler } from '../types';

// A stable, self-describing contract for agents: valid enum values, the task
// shape, and the command grammar. Enum values are sourced from core so they
// never drift from the schemas.
const DESCRIPTOR = {
  version: 1,
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
  },
  commands: [
    { name: 'board', usage: 'boardown board [--json]', summary: 'Print the whole board.' },
    {
      name: 'init',
      usage: 'boardown init [--id-prefix PP] [--project-name NAME]',
      summary: 'Create a .boardown/ board in the current directory.',
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
        'boardown task edit <id> [--title T] [--description D] [--type TYPE] [--status STATUS] [--epic SLUG | --no-epic]',
      summary: 'Edit a task in place.',
    },
    {
      name: 'task status',
      usage: 'boardown task status <id> <status>',
      summary: 'Change a task status.',
    },
    {
      name: 'task move',
      usage: 'boardown task move <id> (--release REF | --epic SLUG | --backlog) [--status STATUS] [--before ID]',
      summary: 'Move a task between the backlog, an epic, and a release.',
    },
    { name: 'task rm', usage: 'boardown task rm <id>', summary: 'Delete a task.' },
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
  },
} as const;

export const schemaCommand: CommandHandler = () => ({
  data: DESCRIPTOR,
  human: JSON.stringify(DESCRIPTOR, null, 2),
});
