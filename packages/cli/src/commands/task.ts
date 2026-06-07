import {
  changeTaskStatus,
  createTask,
  deleteTask,
  editTask,
  emptyBacklog,
  moveTaskBetweenContainers,
  reorderTask,
  TASK_STATUSES,
  TASK_TYPES,
  type BoardSnapshot,
  type DestEpic,
  type FsAdapter,
  type NewTaskInput,
  type ParseProblem,
  type Task,
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
    case 'get':
    case 'show':
      return taskGet(args, ctx);
    case 'add':
      return taskAdd(args, ctx);
    case 'edit':
      return taskEdit(args, ctx);
    case 'status':
      return taskStatus(args, ctx);
    case 'reorder':
      return taskReorder(args, ctx);
    case 'rm':
    case 'remove':
    case 'delete':
      return taskRm(args, ctx);
    default:
      throw new CliError(
        'USAGE',
        `Unknown task subcommand "${sub ?? ''}". Use: get | add | edit | status | reorder | rm.`,
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

interface MoveDest {
  kind: ContainerRef['kind'];
  container: ContainerRef['container'];
  destEpic: DestEpic;
}

// Resolve where a --release / --no-release edit moves the task (mirrors the UI's
// Release selector / moveTaskToRelease). Returns null when no move is needed.
function resolveReleaseMove(
  snapshot: BoardSnapshot,
  location: ContainerRef,
  edited: ContainerRef['container'],
  taskId: string,
  releaseRef: string | undefined,
  noRelease: boolean,
): MoveDest | null {
  if (releaseRef !== undefined) {
    const release = findRelease(snapshot, releaseRef);
    if (release === undefined) {
      throw new CliError('RELEASE_NOT_FOUND', `No release "${releaseRef}".`);
    }
    if (edited.filename === release.filename) return null;
    return { kind: 'release', container: release, destEpic: { kind: 'preserve' } };
  }
  if (noRelease) {
    // Removing from a release falls back to the task's epic file, or the
    // backlog when it has no epic. A no-op when the task isn't in a release.
    if (location.kind !== 'release') return null;
    const epicSlug = edited.tasks.find((t) => t.frontmatter.id === taskId)?.frontmatter.epic;
    if (epicSlug !== undefined) {
      const epic = findEpic(snapshot, epicSlug);
      if (epic === undefined) {
        throw new CliError('EPIC_NOT_FOUND', `No epic "${epicSlug}".`);
      }
      return { kind: 'epic', container: epic, destEpic: { kind: 'set', slug: epicSlug } };
    }
    return { kind: 'backlog', container: snapshot.backlog ?? emptyBacklog(), destEpic: { kind: 'clear' } };
  }
  return null;
}

// Apply a resolved relocation: write the patched container if the task is
// already in the destination, otherwise move it and write both files.
async function moveAndReport(
  fs: FsAdapter,
  location: ContainerRef,
  edited: ContainerRef['container'],
  dest: MoveDest,
  taskId: string,
  problems: ParseProblem[],
): Promise<CommandOutput> {
  if (edited.filename === dest.container.filename) {
    await writeContainer(fs, { kind: location.kind, container: edited });
    const task = edited.tasks.find((t) => t.frontmatter.id === taskId);
    return { data: { task, file: edited.filename }, human: `Updated ${taskId}.`, ...problemsField(problems) };
  }
  const movingTask = edited.tasks.find((t) => t.frontmatter.id === taskId);
  if (movingTask === undefined) {
    throw new CliError('TASK_NOT_FOUND', `No task "${taskId}".`);
  }
  const result = moveTaskBetweenContainers(edited, dest.container, taskId, {
    newStatus: movingTask.frontmatter.status,
    beforeTaskId: null,
    destEpic: dest.destEpic,
  });
  await writeContainer(fs, { kind: location.kind, container: result.source });
  await writeContainer(fs, { kind: dest.kind, container: result.dest });
  const task = result.dest.tasks.find((t) => t.frontmatter.id === taskId);
  return {
    data: { task, from: result.source.filename, to: result.dest.filename },
    human: `Updated ${taskId}; moved to ${result.dest.filename}.`,
    ...problemsField(problems),
  };
}

async function taskEdit(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const id = args.positionals[2];
  if (id === undefined) {
    throw new CliError(
      'USAGE',
      'Usage: boardown task edit <id> [--title/--description/--type/--status/--epic/--no-epic] [--release <ref> | --no-release].',
      2,
    );
  }

  const releaseRef = flagString(args.flags, 'release');
  const noRelease = flagBool(args.flags, 'no-release');
  const noEpic = flagBool(args.flags, 'no-epic');
  const epicSlug = flagString(args.flags, 'epic');
  if (releaseRef !== undefined && noRelease) {
    throw new CliError('USAGE', 'Use either --release <ref> or --no-release, not both.', 2);
  }
  const changesRelease = releaseRef !== undefined || noRelease;
  const changesEpic = epicSlug !== undefined || noEpic;
  if (changesRelease && changesEpic) {
    throw new CliError(
      'USAGE',
      'Change --release/--no-release and --epic/--no-epic in separate edits.',
      2,
    );
  }

  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const { fs, snapshot, problems } = await loadBoardOrThrow(root);
  const location = locateTask(snapshot, id);
  if (location === null) {
    throw new CliError('TASK_NOT_FOUND', `No task "${id}".`);
  }

  // Field-only patch (epic/release relocation handled separately below).
  const fields: TaskPatch = {};
  const title = flagString(args.flags, 'title');
  if (title !== undefined) fields.title = title;
  const description = flagString(args.flags, 'description');
  if (description !== undefined) fields.description = description;
  const typeFlag = flagString(args.flags, 'type');
  if (typeFlag !== undefined) fields.type = requireType(typeFlag, 'feature');
  const statusFlag = flagString(args.flags, 'status');
  if (statusFlag !== undefined) fields.status = requireStatus(statusFlag);
  const hasFields = Object.keys(fields).length > 0;

  if (!hasFields && !changesRelease && !changesEpic) {
    throw new CliError(
      'USAGE',
      'Nothing to edit. Provide fields and/or --release/--no-release/--epic/--no-epic.',
      2,
    );
  }

  // Release relocation: move in/out of a release, keeping the epic tag.
  if (changesRelease) {
    const edited = hasFields ? editTask(location.container, id, fields) : location.container;
    const dest = resolveReleaseMove(snapshot, location, edited, id, releaseRef, noRelease);
    if (dest === null) {
      await writeContainer(fs, { kind: location.kind, container: edited });
      const task = edited.tasks.find((t) => t.frontmatter.id === id);
      return { data: { task, file: edited.filename }, human: `Updated ${id}.`, ...problemsField(problems) };
    }
    return moveAndReport(fs, location, edited, dest, id, problems);
  }

  // Epic change. A task in a release carries the epic as a tag (edit in place);
  // elsewhere membership is by file, so changing the epic relocates the task
  // (the backlog serializer strips epic tags) — this mirrors store.updateTask.
  const current = location.container.tasks.find((t) => t.frontmatter.id === id);
  if (current === undefined) {
    throw new CliError('TASK_NOT_FOUND', `No task "${id}".`);
  }
  const nextEpic: string | null | undefined = noEpic ? null : epicSlug;
  const epicReallyChanges =
    nextEpic !== undefined &&
    ((nextEpic === null && current.frontmatter.epic !== undefined) ||
      (typeof nextEpic === 'string' && nextEpic !== current.frontmatter.epic));

  if (epicReallyChanges && location.kind !== 'release') {
    const edited = hasFields ? editTask(location.container, id, fields) : location.container;
    let dest: MoveDest;
    if (nextEpic === null) {
      dest = { kind: 'backlog', container: snapshot.backlog ?? emptyBacklog(), destEpic: { kind: 'clear' } };
    } else {
      const epic = findEpic(snapshot, nextEpic);
      if (epic === undefined) {
        throw new CliError('EPIC_NOT_FOUND', `No epic "${nextEpic}".`);
      }
      dest = { kind: 'epic', container: epic, destEpic: { kind: 'set', slug: nextEpic } };
    }
    return moveAndReport(fs, location, edited, dest, id, problems);
  }

  // Pure in-place edit (fields, plus epic tag when the task is in a release).
  const patch: TaskPatch = { ...fields };
  if (nextEpic !== undefined) patch.epic = nextEpic;
  const edited = editTask(location.container, id, patch);
  await writeContainer(fs, { kind: location.kind, container: edited });
  const task = edited.tasks.find((t) => t.frontmatter.id === id);
  return { data: { task, file: edited.filename }, human: `Updated ${id}.`, ...problemsField(problems) };
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

const renderTask = (task: Task, kind: string, file: string): string => {
  const fm = task.frontmatter;
  const epic = fm.epic !== undefined ? `  epic:${fm.epic}` : '';
  const body = task.description.length > 0 ? `\n\n${task.description}` : '';
  return `${fm.id}  [${fm.type}/${fm.status}]${epic}  (${kind}: ${file})\n${task.title}${body}`;
};

async function taskGet(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const id = args.positionals[2];
  if (id === undefined) {
    throw new CliError('USAGE', 'Usage: boardown task get <id>.', 2);
  }

  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const { snapshot, problems } = await loadBoardOrThrow(root);
  const location = locateTask(snapshot, id);
  if (location === null) {
    throw new CliError('TASK_NOT_FOUND', `No task "${id}".`);
  }
  const task = location.container.tasks.find((t) => t.frontmatter.id === id);
  if (task === undefined) {
    throw new CliError('TASK_NOT_FOUND', `No task "${id}".`);
  }

  return {
    data: { task, in: { kind: location.kind, file: location.container.filename } },
    human: renderTask(task, location.kind, location.container.filename),
    ...problemsField(problems),
  };
}

type ReorderTarget =
  | { kind: 'before'; anchor: string }
  | { kind: 'after'; anchor: string }
  | { kind: 'up' }
  | { kind: 'down' };

function reorderTarget(args: ParsedArgs): ReorderTarget {
  const before = flagString(args.flags, 'before');
  const after = flagString(args.flags, 'after');
  const up = flagBool(args.flags, 'up');
  const down = flagBool(args.flags, 'down');
  if ([before !== undefined, after !== undefined, up, down].filter(Boolean).length !== 1) {
    throw new CliError(
      'USAGE',
      'Provide exactly one of: --before <id> | --after <id> | --up | --down.',
      2,
    );
  }
  if (before !== undefined) return { kind: 'before', anchor: before };
  if (after !== undefined) return { kind: 'after', anchor: after };
  return up ? { kind: 'up' } : { kind: 'down' };
}

// Translate a human "move" into the `beforeTaskId` core's reorderTask expects
// (null = place last). Returns undefined when the task is already at the
// requested edge — a no-op the caller can skip.
function beforeIdForReorder(
  tasks: readonly Task[],
  taskId: string,
  target: ReorderTarget,
): string | null | undefined {
  if ((target.kind === 'before' || target.kind === 'after') && target.anchor === taskId) {
    throw new CliError('USAGE', `Cannot place a task ${target.kind} itself.`);
  }
  const sorted = [...tasks].sort((a, b) => a.frontmatter.order - b.frontmatter.order);
  const idx = sorted.findIndex((t) => t.frontmatter.id === taskId);
  switch (target.kind) {
    case 'before':
      if (!sorted.some((t) => t.frontmatter.id === target.anchor)) {
        throw new CliError('TASK_NOT_FOUND', `No task "${target.anchor}" in the same container.`);
      }
      return target.anchor;
    case 'after': {
      const at = sorted.findIndex((t) => t.frontmatter.id === target.anchor);
      if (at === -1) {
        throw new CliError('TASK_NOT_FOUND', `No task "${target.anchor}" in the same container.`);
      }
      return sorted[at + 1]?.frontmatter.id ?? null;
    }
    case 'up':
      return idx <= 0 ? undefined : sorted[idx - 1]?.frontmatter.id;
    case 'down':
      return idx >= sorted.length - 1 ? undefined : (sorted[idx + 2]?.frontmatter.id ?? null);
  }
}

async function taskReorder(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const id = args.positionals[2];
  if (id === undefined) {
    throw new CliError(
      'USAGE',
      'Usage: boardown task reorder <id> (--before <id> | --after <id> | --up | --down).',
      2,
    );
  }
  const target = reorderTarget(args);

  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const { fs, snapshot, problems } = await loadBoardOrThrow(root);
  const location = locateTask(snapshot, id);
  if (location === null) {
    throw new CliError('TASK_NOT_FOUND', `No task "${id}".`);
  }

  const beforeTaskId = beforeIdForReorder(location.container.tasks, id, target);
  if (beforeTaskId === undefined) {
    const task = location.container.tasks.find((t) => t.frontmatter.id === id);
    return {
      data: { task, file: location.container.filename, moved: false },
      human: `${id} is already at the edge; nothing to do.`,
      ...problemsField(problems),
    };
  }

  const updated = reorderTask(location.container, id, beforeTaskId);
  await writeContainer(fs, { kind: location.kind, container: updated });
  const task = updated.tasks.find((t) => t.frontmatter.id === id);

  return {
    data: { task, file: updated.filename, moved: true },
    human: `Reordered ${id} in ${updated.filename}.`,
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
