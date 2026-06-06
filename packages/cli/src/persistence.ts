import {
  CONFIG_FILENAME,
  createGuardedFs,
  loadBoard,
  serializeBacklog,
  serializeConfig,
  serializeEpic,
  serializeRelease,
  type Backlog,
  type BoardConfig,
  type BoardSnapshot,
  type Epic,
  type FsAdapter,
  type ParseProblem,
  type Release,
} from '@boardown/core';
import { findBoardRoot } from './board-root';
import { NodeFsAdapter } from './node-fs';
import { CliError } from './output';

export type ContainerKind = 'release' | 'epic' | 'backlog';

// A container paired with its kind. The kind/container shapes always agree at
// runtime; the cast lives only in serializeContainer (mirrors ui/store.ts).
export interface ContainerRef {
  kind: ContainerKind;
  container: Release | Epic | Backlog;
}

export interface LoadedBoard {
  fs: FsAdapter;
  snapshot: BoardSnapshot;
  problems: ParseProblem[];
}

export async function resolveBoardRoot(cwd: string, dataDir?: string): Promise<string> {
  const root = await findBoardRoot(cwd, dataDir);
  if (root === null) {
    throw new CliError(
      'NO_BOARD',
      dataDir !== undefined
        ? `No .boardown directory at ${dataDir}.`
        : `No .boardown directory found from ${cwd} upward. Run \`boardown init\` first.`,
    );
  }
  return root;
}

export async function loadBoardOrThrow(root: string): Promise<LoadedBoard> {
  const inner = new NodeFsAdapter(root);
  const result = await loadBoard(inner);
  if (result.kind === 'missing-config') {
    throw new CliError('NO_BOARD', `No board config at ${root}. Run \`boardown init\` first.`);
  }
  if (result.kind === 'failed') {
    throw new CliError('BOARD_INVALID', 'Board failed to load.', 1, result.problems);
  }
  // Same external-change guard the other shells use: refuse to clobber a file
  // that moved on disk since load. In a CLI there's no Reload modal, so a
  // conflict is a plain error — re-running the command re-reads the board.
  const fs = createGuardedFs(inner, result.fileVersions, (path) => {
    throw new CliError(
      'CONFLICT',
      `${path} changed on disk since the board was loaded; re-run the command.`,
    );
  });
  return { fs, snapshot: result.snapshot, problems: result.problems };
}

export function findRelease(snapshot: BoardSnapshot, ref: string): Release | undefined {
  return snapshot.releases.find((r) => r.filename === ref || r.slug === ref);
}

export function findEpic(snapshot: BoardSnapshot, slug: string): Epic | undefined {
  return snapshot.epics.find((e) => e.slug === slug);
}

export function locateTask(snapshot: BoardSnapshot, taskId: string): ContainerRef | null {
  for (const release of snapshot.releases) {
    if (release.tasks.some((t) => t.frontmatter.id === taskId)) {
      return { kind: 'release', container: release };
    }
  }
  for (const epic of snapshot.epics) {
    if (epic.tasks.some((t) => t.frontmatter.id === taskId)) {
      return { kind: 'epic', container: epic };
    }
  }
  if (snapshot.backlog?.tasks.some((t) => t.frontmatter.id === taskId)) {
    return { kind: 'backlog', container: snapshot.backlog };
  }
  return null;
}

export function serializeContainer(ref: ContainerRef): string {
  switch (ref.kind) {
    case 'release':
      return serializeRelease(ref.container as Release);
    case 'epic':
      return serializeEpic(ref.container as Epic);
    case 'backlog':
      return serializeBacklog(ref.container as Backlog);
  }
}

export async function writeContainer(fs: FsAdapter, ref: ContainerRef): Promise<void> {
  await fs.write(ref.container.filename, serializeContainer(ref));
}

export async function writeConfig(fs: FsAdapter, config: BoardConfig): Promise<void> {
  await fs.write(CONFIG_FILENAME, serializeConfig(config));
}
