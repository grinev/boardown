import {
  changeTaskStatus,
  createTask,
  deleteTask,
  editTask,
  emptyBacklog,
  moveTaskBetweenContainers,
  moveTaskInContainer,
  TASK_STATUSES,
  TASK_TYPES,
  type DestEpic,
  type NewTaskInput,
  type TaskPatch,
  type TaskStatus,
  type TaskType,
} from '@boardown/core';
import { flagBool, flagString, type ParsedArgs } from '../args';
import { CliError } from '../output';
import {
  findEpic,
  findRelease,
  loadBoardOrThrow,
  locateTask,
  resolveBoardRoot,
  writeConfig,
  writeContainer,
  type ContainerRef,
} from '../persistence';
import type { CommandContext, CommandHandler, CommandOutput } from '../types';

export const taskCommand: CommandHandler = (args, ctx) => {
  const sub = args.positionals[1];
  switch (sub) {
    case 'add':
      return taskAdd(args, ctx);
    case 'edit':
      return taskEdit(args, ctx);
    case 'status':
      return taskStatus(args, ctx);
    case 'move':
      return taskMove(args, ctx);
    case 'rm':
    case 'remove':
    case 'delete':
      return taskRm(args, ctx);
    default:
      throw new CliError(
        'USAGE',
        `Unknown task subcommand "${sub ?? ''}". Use: add | edit | status | move | rm.`,
        2,
      );
  }
};

const isTaskType = (value: string): value is TaskType =>
  (TASK_TYPES as readonly string[]).includes(value);

const isTaskStatus = (value: string): value is TaskStatus =>
  (TASK_STATUSES as readonly string[]).includes(value);

function requireType(value: string | undefined, fallback: TaskType): TaskType {
  if (value === undefined) return fallback;
  if (!isTaskType(value)) {
    throw new CliError('USAGE', `Invalid --type "${value}" (one of ${TASK_TYPES.join(', ')}).`, 2);
  }
  return value;
}

function requireStatus(value: string): TaskStatus {
  if (!isTaskStatus(value)) {
    throw new CliError(
      'USAGE',
      `Invalid status "${value}" (one of ${TASK_STATUSES.join(', ')}).`,
      2,
    );
  }
  return value;
}

const problemsField = (out: CommandOutput['problems']): Pick<CommandOutput, 'problems'> =>
  out !== undefined && out.length > 0 ? { problems: out } : {};

async function taskAdd(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const title = args.positionals[2];
  if (title === undefined || title.length === 0) {
    throw new CliError(
      'USAGE',
      'Usage: boardown task add <title> [--type ...] [--epic ...] [--release ...].',
      2,
    );
  }

  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const { fs, snapshot, problems } = await loadBoardOrThrow(root);

  const type = requireType(flagString(args.flags, 'type'), 'feature');
  const statusFlag = flagString(args.flags, 'status');
  const status = statusFlag === undefined ? 'todo' : requireStatus(statusFlag);
  const description = flagString(args.flags, 'description');
  const releaseRef = flagString(args.flags, 'release');
  const epicSlug = flagString(args.flags, 'epic');

  let target: ContainerRef;
  let epicTag: string | undefined;

  if (releaseRef !== undefined) {
    const release = snapshot.releases.find(
      (r) => r.filename === releaseRef || r.slug === releaseRef,
    );
    if (release === undefined) {
      throw new CliError('RELEASE_NOT_FOUND', `No release "${releaseRef}".`);
    }
    if (epicSlug !== undefined && !snapshot.epics.some((e) => e.slug === epicSlug)) {
      throw new CliError('EPIC_NOT_FOUND', `No epic "${epicSlug}".`);
    }
    target = { kind: 'release', container: release };
    epicTag = epicSlug;
  } else if (epicSlug !== undefined) {
    const epic = snapshot.epics.find((e) => e.slug === epicSlug);
    if (epic === undefined) {
      throw new CliError('EPIC_NOT_FOUND', `No epic "${epicSlug}".`);
    }
    target = { kind: 'epic', container: epic };
    epicTag = epicSlug;
  } else {
    target = { kind: 'backlog', container: snapshot.backlog ?? emptyBacklog() };
    epicTag = undefined;
  }

  const input: NewTaskInput = {
    title,
    type,
    status,
    ...(description !== undefined ? { description } : {}),
    ...(epicTag !== undefined ? { epic: epicTag } : {}),
  };

  const result = createTask(target.container, snapshot.config, input);
  await writeContainer(fs, { kind: target.kind, container: result.container });
  await writeConfig(fs, result.config);

  return {
    data: { task: result.task, file: result.container.filename },
    human: `Created ${result.task.frontmatter.id} "${result.task.title}" in ${result.container.filename}.`,
    ...problemsField(problems),
  };
}

async function taskEdit(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const id = args.positionals[2];
  if (id === undefined) {
    throw new CliError('USAGE', 'Usage: boardown task edit <id> [--title ...] [--status ...] ...', 2);
  }

  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const { fs, snapshot, problems } = await loadBoardOrThrow(root);
  const location = locateTask(snapshot, id);
  if (location === null) {
    throw new CliError('TASK_NOT_FOUND', `No task "${id}".`);
  }

  const patch: TaskPatch = {};
  const title = flagString(args.flags, 'title');
  if (title !== undefined) patch.title = title;
  const description = flagString(args.flags, 'description');
  if (description !== undefined) patch.description = description;
  const typeFlag = flagString(args.flags, 'type');
  if (typeFlag !== undefined) patch.type = requireType(typeFlag, 'feature');
  const statusFlag = flagString(args.flags, 'status');
  if (statusFlag !== undefined) patch.status = requireStatus(statusFlag);
  if (flagBool(args.flags, 'no-epic')) {
    patch.epic = null;
  } else {
    const epicSlug = flagString(args.flags, 'epic');
    if (epicSlug !== undefined) patch.epic = epicSlug;
  }

  if (Object.keys(patch).length === 0) {
    throw new CliError(
      'USAGE',
      'Nothing to edit. Provide at least one of --title/--description/--type/--status/--epic/--no-epic.',
      2,
    );
  }

  const updated = editTask(location.container, id, patch);
  await writeContainer(fs, { kind: location.kind, container: updated });
  const task = updated.tasks.find((t) => t.frontmatter.id === id);

  return { data: { task }, human: `Updated ${id}.`, ...problemsField(problems) };
}

async function taskStatus(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const id = args.positionals[2];
  const statusArg = args.positionals[3];
  if (id === undefined || statusArg === undefined) {
    throw new CliError('USAGE', 'Usage: boardown task status <id> <status>.', 2);
  }
  const status = requireStatus(statusArg);

  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const { fs, snapshot, problems } = await loadBoardOrThrow(root);
  const location = locateTask(snapshot, id);
  if (location === null) {
    throw new CliError('TASK_NOT_FOUND', `No task "${id}".`);
  }

  const updated = changeTaskStatus(location.container, id, status);
  await writeContainer(fs, { kind: location.kind, container: updated });
  const task = updated.tasks.find((t) => t.frontmatter.id === id);

  return { data: { task }, human: `${id} → ${status}.`, ...problemsField(problems) };
}

async function taskMove(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const id = args.positionals[2];
  if (id === undefined) {
    throw new CliError(
      'USAGE',
      'Usage: boardown task move <id> (--release <r> | --epic <slug> | --backlog) [--status ...] [--before <id>].',
      2,
    );
  }

  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const { fs, snapshot, problems } = await loadBoardOrThrow(root);
  const source = locateTask(snapshot, id);
  if (source === null) {
    throw new CliError('TASK_NOT_FOUND', `No task "${id}".`);
  }
  const task = source.container.tasks.find((t) => t.frontmatter.id === id);
  if (task === undefined) {
    throw new CliError('TASK_NOT_FOUND', `No task "${id}".`);
  }

  const releaseRef = flagString(args.flags, 'release');
  const epicSlug = flagString(args.flags, 'epic');
  const toBacklog = flagBool(args.flags, 'backlog');
  const destinations = [releaseRef !== undefined, epicSlug !== undefined, toBacklog].filter(
    Boolean,
  ).length;
  if (destinations !== 1) {
    throw new CliError(
      'USAGE',
      'Provide exactly one destination: --release <r> | --epic <slug> | --backlog.',
      2,
    );
  }

  const statusFlag = flagString(args.flags, 'status');
  const newStatus = statusFlag === undefined ? task.frontmatter.status : requireStatus(statusFlag);
  const beforeTaskId = flagString(args.flags, 'before') ?? null;

  let dest: ContainerRef;
  let destEpic: DestEpic;
  if (releaseRef !== undefined) {
    const release = findRelease(snapshot, releaseRef);
    if (release === undefined) {
      throw new CliError('RELEASE_NOT_FOUND', `No release "${releaseRef}".`);
    }
    dest = { kind: 'release', container: release };
    destEpic = { kind: 'preserve' };
  } else if (epicSlug !== undefined) {
    const epic = findEpic(snapshot, epicSlug);
    if (epic === undefined) {
      throw new CliError('EPIC_NOT_FOUND', `No epic "${epicSlug}".`);
    }
    dest = { kind: 'epic', container: epic };
    destEpic = { kind: 'set', slug: epic.slug };
  } else {
    dest = { kind: 'backlog', container: snapshot.backlog ?? emptyBacklog() };
    destEpic = { kind: 'clear' };
  }

  // Same file → an in-place reorder/status change, not a cross-container move.
  if (source.container.filename === dest.container.filename) {
    const updated = moveTaskInContainer(source.container, id, { status: newStatus, beforeTaskId });
    await writeContainer(fs, { kind: source.kind, container: updated });
    const moved = updated.tasks.find((t) => t.frontmatter.id === id);
    return {
      data: { task: moved, file: updated.filename },
      human: `Moved ${id} within ${updated.filename}.`,
      ...problemsField(problems),
    };
  }

  const result = moveTaskBetweenContainers(source.container, dest.container, id, {
    newStatus,
    beforeTaskId,
    destEpic,
  });
  await writeContainer(fs, { kind: source.kind, container: result.source });
  await writeContainer(fs, { kind: dest.kind, container: result.dest });
  const moved = result.dest.tasks.find((t) => t.frontmatter.id === id);

  return {
    data: { task: moved, from: result.source.filename, to: result.dest.filename },
    human: `Moved ${id} → ${result.dest.filename}.`,
    ...problemsField(problems),
  };
}

async function taskRm(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const id = args.positionals[2];
  if (id === undefined) {
    throw new CliError('USAGE', 'Usage: boardown task rm <id>.', 2);
  }

  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const { fs, snapshot, problems } = await loadBoardOrThrow(root);
  const location = locateTask(snapshot, id);
  if (location === null) {
    throw new CliError('TASK_NOT_FOUND', `No task "${id}".`);
  }

  const updated = deleteTask(location.container, id);
  await writeContainer(fs, { kind: location.kind, container: updated });

  return {
    data: { removed: id, file: updated.filename },
    human: `Removed ${id} from ${updated.filename}.`,
    ...problemsField(problems),
  };
}
