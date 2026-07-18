import {
  completeRelease,
  createRelease,
  editRelease,
  emptyBacklog,
  serializeBacklog,
  serializeEpic,
  serializeRelease,
  sortTasksByOrder,
  startRelease,
  type CompleteReleaseResult,
  type NewReleaseInput,
  type Release,
  type ReleasePatch,
} from '@boardown/core';
import { flagString, type ParsedArgs } from '../args';
import { CliError } from '../output';
import { isFull, summaryLines, taskPayload, summarizeTasks } from '../summary';
import {
  currentRelease,
  findRelease,
  loadBoardOrThrow,
  resolveBoardRoot,
  type LoadedBoard,
} from '../persistence';
import type { CommandContext, CommandHandler, CommandOutput } from '../types';

export const releaseCommand: CommandHandler = (args, ctx) => {
  const sub = args.positionals[1];
  switch (sub) {
    case 'get':
    case 'show':
      return releaseGet(args, ctx);
    case 'list':
      return releaseList(args, ctx);
    case 'current':
    case 'active':
      return releaseCurrent(args, ctx);
    case 'add':
      return releaseAdd(args, ctx);
    case 'edit':
      return releaseEdit(args, ctx);
    case 'start':
      return releaseStart(args, ctx);
    case 'done':
    case 'complete':
    case 'finish':
      return releaseDone(args, ctx);
    default:
      throw new CliError(
        'USAGE',
        `Unknown release subcommand "${sub ?? ''}". Use: get | list | current | add | edit | start | done.`,
        2,
      );
  }
};

const releaseName = (release: Release): string => release.frontmatter.name ?? release.slug;

const releaseView = (release: Release, full: boolean) => {
  const tasks = sortTasksByOrder(release.tasks);
  const { status, description, startDate, endDate } = release.frontmatter;
  return {
    slug: release.slug,
    filename: release.filename,
    name: releaseName(release),
    status,
    ...(description !== undefined ? { description } : {}),
    ...(startDate !== undefined ? { startDate } : {}),
    ...(endDate !== undefined ? { endDate } : {}),
    taskCount: tasks.length,
    tasks: taskPayload(tasks, full),
  };
};

const renderRelease = (release: Release): string => {
  const tasks = sortTasksByOrder(release.tasks);
  const lines = [
    `[${release.frontmatter.status}] ${releaseName(release)}  (${release.filename})  ${tasks.length}`,
  ];
  if (tasks.length === 0) lines.push('  no tasks');
  else lines.push(...summaryLines(tasks));
  return lines.join('\n');
};

async function releaseGet(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const ref = args.positionals[2];
  if (ref === undefined) {
    throw new CliError('USAGE', 'Usage: boardown release get <file|slug>.', 2);
  }
  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const board = await loadBoardOrThrow(root);
  const release = requireRelease(board, ref);
  return {
    data: { release: releaseView(release, isFull(args.flags)) },
    human: renderRelease(release),
    ...problemsField(board.problems),
  };
}

async function releaseList(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const board = await loadBoardOrThrow(root);
  const full = isFull(args.flags);
  const releases = board.snapshot.releases.map((release) => ({
    slug: release.slug,
    name: release.frontmatter.name ?? release.slug,
    status: release.frontmatter.status,
    taskCount: release.tasks.length,
    ...(full ? { tasks: summarizeTasks(sortTasksByOrder(release.tasks)) } : {}),
  }));
  const human =
    releases.length > 0
      ? releases.map((r) => `[${r.status}] ${r.slug}  ${r.name}  (${r.taskCount} tasks)`).join('\n')
      : 'No releases.';
  return { data: { releases }, human, ...problemsField(board.problems) };
}

async function releaseCurrent(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const board = await loadBoardOrThrow(root);
  const release = currentRelease(board.snapshot);
  if (release === undefined) {
    return {
      data: { release: null },
      human: 'No current release.',
      ...problemsField(board.problems),
    };
  }
  return {
    data: { release: releaseView(release, isFull(args.flags)) },
    human: renderRelease(release),
    ...problemsField(board.problems),
  };
}

const problemsField = (problems: LoadedBoard['problems']): Pick<CommandOutput, 'problems'> =>
  problems.length > 0 ? { problems } : {};

const requireRelease = (board: LoadedBoard, ref: string): Release => {
  const release = findRelease(board.snapshot, ref);
  if (release === undefined) {
    throw new CliError('RELEASE_NOT_FOUND', `No release "${ref}".`);
  }
  return release;
};

async function releaseAdd(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const name = args.positionals[2];
  if (name === undefined || name.length === 0) {
    throw new CliError('USAGE', 'Usage: boardown release add <name> [--description ...].', 2);
  }

  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const board = await loadBoardOrThrow(root);
  const description = flagString(args.flags, 'description');

  const input: NewReleaseInput = {
    name,
    ...(description !== undefined ? { description } : {}),
  };

  let release: Release;
  try {
    release = createRelease(board.snapshot.releases, input);
  } catch (err) {
    throw new CliError('RELEASE_INVALID', err instanceof Error ? err.message : String(err), 2);
  }

  await board.fs.write(release.filename, serializeRelease(release));
  return {
    data: { slug: release.slug },
    human: `Created release "${releaseName(release)}" (${release.filename}).`,
    ...problemsField(board.problems),
  };
}

async function releaseEdit(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const ref = args.positionals[2];
  if (ref === undefined) {
    throw new CliError(
      'USAGE',
      'Usage: boardown release edit <file|slug> [--name ...] [--description ...].',
      2,
    );
  }

  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const board = await loadBoardOrThrow(root);
  const release = requireRelease(board, ref);

  const patch: ReleasePatch = {};
  const name = flagString(args.flags, 'name');
  if (name !== undefined) patch.name = name;
  const description = flagString(args.flags, 'description');
  if (description !== undefined) patch.description = description;
  if (Object.keys(patch).length === 0) {
    throw new CliError(
      'USAGE',
      'Nothing to edit. Provide --name and/or --description.',
      2,
    );
  }

  let updated: Release;
  try {
    updated = editRelease(release, patch);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (release.frontmatter.status === 'finished') {
      throw new CliError('ARCHIVED', message);
    }
    throw new CliError('RELEASE_INVALID', message, 2);
  }

  await board.fs.write(updated.filename, serializeRelease(updated));
  return {
    data: { slug: updated.slug },
    human: `Updated release ${releaseName(updated)}.`,
    ...problemsField(board.problems),
  };
}

async function releaseStart(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const ref = args.positionals[2];
  if (ref === undefined) {
    throw new CliError('USAGE', 'Usage: boardown release start <file|slug>.', 2);
  }

  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const board = await loadBoardOrThrow(root);
  const release = requireRelease(board, ref);

  let started: Release;
  try {
    started = startRelease(release, board.snapshot.releases);
  } catch (err) {
    throw new CliError('RELEASE_CONFLICT', err instanceof Error ? err.message : String(err));
  }

  await board.fs.write(started.filename, serializeRelease(started));
  return {
    data: { slug: started.slug },
    human: `Started release ${releaseName(started)} (now current).`,
    ...problemsField(board.problems),
  };
}

async function releaseDone(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const ref = args.positionals[2];
  if (ref === undefined) {
    throw new CliError('USAGE', 'Usage: boardown release done <file|slug> [--into <release>].', 2);
  }

  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const board = await loadBoardOrThrow(root);
  const release = requireRelease(board, ref);

  const intoRef = flagString(args.flags, 'into');
  const targetRelease = intoRef !== undefined ? requireRelease(board, intoRef) : null;

  let result: CompleteReleaseResult;
  try {
    result = completeRelease({
      release,
      epics: board.snapshot.epics,
      backlog: board.snapshot.backlog ?? emptyBacklog(),
      targetRelease,
    });
  } catch (err) {
    // core rejects completing a non-current release (and carrying into a
    // finished one); surface it as a structured error.
    throw new CliError('RELEASE_NOT_CURRENT', err instanceof Error ? err.message : String(err));
  }

  // Persist every container the redistribution actually touched.
  const changed = new Set(result.changedFilenames);
  await board.fs.write(result.release.filename, serializeRelease(result.release));
  if (result.targetRelease !== null && changed.has(result.targetRelease.filename)) {
    await board.fs.write(result.targetRelease.filename, serializeRelease(result.targetRelease));
  }
  for (const epic of result.epics) {
    if (changed.has(epic.filename)) {
      await board.fs.write(epic.filename, serializeEpic(epic));
    }
  }
  if (result.backlog !== null && changed.has(result.backlog.filename)) {
    await board.fs.write(result.backlog.filename, serializeBacklog(result.backlog));
  }

  return {
    data: { slug: result.release.slug },
    human: `Finished release ${releaseName(result.release)}.`,
    ...problemsField(board.problems),
  };
}
