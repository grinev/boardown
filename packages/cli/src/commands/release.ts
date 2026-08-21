import {
  activeReleases,
  boardRelease,
  completeRelease,
  createRelease,
  editRelease,
  emptyBacklog,
  serializeRelease,
  sortTasksByOrder,
  startRelease,
  type BoardConfig,
  type CompleteReleaseResult,
  type NewReleaseInput,
  type Release,
  type ReleasePatch,
} from '@boardown/core';
import { flagBool, flagString, type ParsedArgs } from '../args';
import { CliError } from '../output';
import { isFull, summaryLines, taskPayload, summarizeTasks } from '../summary';
import {
  findRelease,
  loadBoardOrThrow,
  resolveBoardRoot,
  writeConfig,
  writeContainers,
  type ContainerRef,
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

const renderRelease = (config: BoardConfig, release: Release): string => {
  const tasks = sortTasksByOrder(release.tasks);
  const lines = [
    `[${release.frontmatter.status}] ${releaseName(release)}  (${release.filename})  ${tasks.length}`,
  ];
  if (tasks.length === 0) lines.push('  no tasks');
  else lines.push(...summaryLines(config, tasks));
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
    human: renderRelease(board.snapshot.config, release),
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
  const full = isFull(args.flags);

  if (flagBool(args.flags, 'all')) {
    const releases = activeReleases(board.snapshot);
    return {
      data: { releases: releases.map((r) => releaseView(r, full)) },
      human:
        releases.length > 0
          ? releases.map((r) => renderRelease(board.snapshot.config, r)).join('\n\n')
          : 'No active release.',
      ...problemsField(board.problems),
    };
  }

  // The single slot follows the Board's stored choice, so the two surfaces never
  // disagree about which release is meant.
  const release = boardRelease(board.snapshot);
  if (release === undefined) {
    return {
      data: { release: null },
      human: 'No active release.',
      ...problemsField(board.problems),
    };
  }
  return {
    data: { release: releaseView(release, full) },
    human: renderRelease(board.snapshot.config, release),
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
    updated = editRelease(release, patch, board.snapshot.releases);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (release.frontmatter.status === 'finished') {
      throw new CliError('ARCHIVED', message);
    }
    throw new CliError('RELEASE_INVALID', message, 2);
  }

  const content = serializeRelease(updated);
  const moved = updated.filename !== release.filename;
  if (moved) await board.fs.moveFile(release.filename, updated.filename, content);
  else await board.fs.write(updated.filename, content);

  // The Board's stored choice is a slug, so a rename carries it. After the move,
  // never with it: a slug that fell behind resolves to the first active release,
  // while a moved file nothing else knows about would be the harder failure.
  if (moved && board.snapshot.config.boardRelease === release.slug) {
    await writeConfig(board.fs, { ...board.snapshot.config, boardRelease: updated.slug });
  }

  return {
    data: { slug: updated.slug },
    human: moved
      ? `Updated release ${releaseName(updated)} (${release.filename} -> ${updated.filename}).`
      : `Updated release ${releaseName(updated)}.`,
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
    started = startRelease(release, board.snapshot.releases, board.snapshot.config);
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
      config: board.snapshot.config,
      epics: board.snapshot.epics,
      backlog: board.snapshot.backlog ?? emptyBacklog(),
      targetRelease,
    });
  } catch (err) {
    // core rejects completing a non-current release (and carrying into a
    // finished one); surface it as a structured error.
    throw new CliError('RELEASE_NOT_CURRENT', err instanceof Error ? err.message : String(err));
  }

  // Persist every container the redistribution actually touched. The tasks leave
  // the release and land elsewhere, so the whole set has to stand or fall together.
  const changed = new Set(result.changedFilenames);
  const refs: ContainerRef[] = [{ kind: 'release', container: result.release }];
  if (result.targetRelease !== null && changed.has(result.targetRelease.filename)) {
    refs.push({ kind: 'release', container: result.targetRelease });
  }
  for (const epic of result.epics) {
    if (changed.has(epic.filename)) refs.push({ kind: 'epic', container: epic });
  }
  if (result.backlog !== null && changed.has(result.backlog.filename)) {
    refs.push({ kind: 'backlog', container: result.backlog });
  }
  await writeContainers(board.fs, refs);

  return {
    data: { slug: result.release.slug },
    human: `Finished release ${releaseName(result.release)}.`,
    ...problemsField(board.problems),
  };
}
