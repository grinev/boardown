import {
  createEpic,
  editEpic,
  serializeEpic,
  sortTasksByOrder,
  type Epic,
  type EpicPatch,
  type NewEpicInput,
} from '@boardown/core';
import { flagString, type ParsedArgs } from '../args';
import { CliError } from '../output';
import { isFull, summaryLines, summarizeTasks, taskPayload } from '../summary';
import {
  epicMembers,
  findEpic,
  loadBoardOrThrow,
  resolveBoardRoot,
  type LoadedBoard,
} from '../persistence';
import type { CommandContext, CommandHandler, CommandOutput } from '../types';

// boardown stores epic colors as 6-digit hex; core's createEpic does not
// validate the value, so the CLI guards it before writing.
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_COLOR = '#888888';

export const epicCommand: CommandHandler = (args, ctx) => {
  const sub = args.positionals[1];
  switch (sub) {
    case 'get':
    case 'show':
      return epicGet(args, ctx);
    case 'list':
      return epicList(args, ctx);
    case 'add':
      return epicAdd(args, ctx);
    case 'edit':
      return epicEdit(args, ctx);
    default:
      throw new CliError(
        'USAGE',
        `Unknown epic subcommand "${sub ?? ''}". Use: get | list | add | edit.`,
        2,
      );
  }
};

const problemsField = (problems: LoadedBoard['problems']): Pick<CommandOutput, 'problems'> =>
  problems.length > 0 ? { problems } : {};

async function epicGet(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const slug = args.positionals[2];
  if (slug === undefined) {
    throw new CliError('USAGE', 'Usage: boardown epic get <slug>.', 2);
  }

  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const board = await loadBoardOrThrow(root);
  const epic = findEpic(board.snapshot, slug);
  if (epic === undefined) {
    throw new CliError('EPIC_NOT_FOUND', `No epic "${slug}".`);
  }
  const tasks = sortTasksByOrder(epicMembers(board.snapshot, epic));

  const lines = [
    `Epic ${epic.frontmatter.name}  (${epic.slug})  ${epic.frontmatter.color}  ${tasks.length}`,
  ];
  if (tasks.length === 0) lines.push('  no tasks');
  else lines.push(...summaryLines(tasks));
  return {
    data: {
      epic: {
        slug: epic.slug,
        name: epic.frontmatter.name,
        color: epic.frontmatter.color,
        taskCount: tasks.length,
        tasks: taskPayload(tasks, isFull(args.flags)),
      },
    },
    human: lines.join('\n'),
    ...problemsField(board.problems),
  };
}

async function epicList(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const board = await loadBoardOrThrow(root);
  const full = isFull(args.flags);
  const epics = board.snapshot.epics.map((epic) => {
    const tasks = sortTasksByOrder(epicMembers(board.snapshot, epic));
    return {
      slug: epic.slug,
      name: epic.frontmatter.name,
      color: epic.frontmatter.color,
      taskCount: tasks.length,
      ...(full ? { tasks: summarizeTasks(tasks) } : {}),
    };
  });

  const human =
    epics.length > 0
      ? epics.map((e) => `${e.slug}  ${e.name}  (${e.taskCount} tasks)`).join('\n')
      : 'No epics.';
  return { data: { epics }, human, ...problemsField(board.problems) };
}

async function epicAdd(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const name = args.positionals[2];
  if (name === undefined || name.length === 0) {
    throw new CliError('USAGE', 'Usage: boardown epic add <name> [--color #rrggbb] [--description ...].', 2);
  }

  const color = flagString(args.flags, 'color') ?? DEFAULT_COLOR;
  if (!HEX_COLOR.test(color)) {
    throw new CliError('USAGE', `--color must be a 6-digit hex like #1f6feb (got "${color}").`, 2);
  }
  const description = flagString(args.flags, 'description');

  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const board = await loadBoardOrThrow(root);

  const input: NewEpicInput = {
    name,
    color,
    ...(description !== undefined ? { description } : {}),
  };

  let epic: Epic;
  try {
    epic = createEpic(board.snapshot.epics, input);
  } catch (err) {
    throw new CliError('EPIC_INVALID', err instanceof Error ? err.message : String(err), 2);
  }

  await board.fs.write(epic.filename, serializeEpic(epic));
  return {
    data: { slug: epic.slug },
    human: `Created epic "${epic.frontmatter.name}" (${epic.slug}).`,
    ...problemsField(board.problems),
  };
}

async function epicEdit(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const slug = args.positionals[2];
  if (slug === undefined) {
    throw new CliError('USAGE', 'Usage: boardown epic edit <slug> [--name ...] [--description ...].', 2);
  }
  if (flagString(args.flags, 'color') !== undefined) {
    throw new CliError('USAGE', 'Editing an epic color is not supported; edit the file directly.', 2);
  }

  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const board = await loadBoardOrThrow(root);
  const epic = findEpic(board.snapshot, slug);
  if (epic === undefined) {
    throw new CliError('EPIC_NOT_FOUND', `No epic "${slug}".`);
  }

  const patch: EpicPatch = {};
  const name = flagString(args.flags, 'name');
  if (name !== undefined) patch.name = name;
  const description = flagString(args.flags, 'description');
  if (description !== undefined) patch.preamble = description;

  if (Object.keys(patch).length === 0) {
    throw new CliError('USAGE', 'Nothing to edit. Provide --name and/or --description.', 2);
  }

  const updated = editEpic(epic, patch);
  await board.fs.write(updated.filename, serializeEpic(updated));
  return {
    data: { slug: updated.slug },
    human: `Updated epic ${slug}.`,
    ...problemsField(board.problems),
  };
}
