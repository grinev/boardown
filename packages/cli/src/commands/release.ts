import {
  completeRelease,
  createRelease,
  emptyBacklog,
  serializeBacklog,
  serializeEpic,
  serializeRelease,
  startRelease,
  type NewReleaseInput,
  type Release,
} from '@boardown/core';
import { flagString, type ParsedArgs } from '../args';
import { CliError } from '../output';
import {
  findRelease,
  loadBoardOrThrow,
  resolveBoardRoot,
  type LoadedBoard,
} from '../persistence';
import type { CommandContext, CommandHandler, CommandOutput } from '../types';

export const releaseCommand: CommandHandler = (args, ctx) => {
  const sub = args.positionals[1];
  switch (sub) {
    case 'add':
      return releaseAdd(args, ctx);
    case 'start':
      return releaseStart(args, ctx);
    case 'done':
    case 'complete':
    case 'finish':
      return releaseDone(args, ctx);
    default:
      throw new CliError(
        'USAGE',
        `Unknown release subcommand "${sub ?? ''}". Use: add | start | done.`,
        2,
      );
  }
};

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
    data: { release },
    human: `Created release "${release.frontmatter.name ?? release.slug}" (${release.filename}).`,
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
    data: { release: started },
    human: `Started release ${started.frontmatter.name ?? started.slug} (now current).`,
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

  const result = completeRelease({
    release,
    epics: board.snapshot.epics,
    backlog: board.snapshot.backlog ?? emptyBacklog(),
    targetRelease,
  });

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
    data: {
      release: result.release,
      movedTo: result.targetRelease?.filename ?? null,
      changedFiles: result.changedFilenames,
    },
    human: `Finished release ${result.release.frontmatter.name ?? result.release.slug}.`,
    ...problemsField(board.problems),
  };
}
