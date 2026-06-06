import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Backlog, BoardConfig, Epic, Release, Task } from '@boardown/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import { loadBoardOrThrow } from '../persistence';
import type { CommandContext } from '../types';
import { boardCommand } from './board';
import { initCommand } from './init';
import { taskCommand } from './task';

interface BoardData {
  config: BoardConfig;
  releases: Release[];
  epics: Epic[];
  backlog: Backlog | null;
}

const allTasks = (data: unknown): Task[] => {
  const board = data as BoardData;
  return [
    ...board.releases.flatMap((r) => r.tasks),
    ...board.epics.flatMap((e) => e.tasks),
    ...(board.backlog?.tasks ?? []),
  ];
};

const ids = (data: unknown): string[] => allTasks(data).map((t) => t.frontmatter.id);

const findTask = (data: unknown, id: string): Task => {
  const task = allTasks(data).find((t) => t.frontmatter.id === id);
  if (task === undefined) throw new Error(`task ${id} not found`);
  return task;
};

describe('cli commands (integration)', () => {
  let project: string;
  let ctx: CommandContext;

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-cmd-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('init creates a config that loads', async () => {
    const out = await initCommand(
      parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']),
      ctx,
    );
    expect((out.data as { config: BoardConfig }).config.idPrefix).toBe('TS');
    const config = await readFile(join(project, '.boardown', 'config.yaml'), 'utf8');
    expect(config).toContain('idPrefix: TS');
    expect(config).toContain('projectName: Demo');
  });

  it('add → board → edit → status → rm round-trips', async () => {
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);

    const add = await taskCommand(parseArgs(['task', 'add', 'My first task', '--type', 'feature']), ctx);
    const added = add.data as { task: Task; file: string };
    expect(added.task.frontmatter.id).toBe('TS-1');
    expect(added.file).toBe('epics/no_epic.md');

    const board = await boardCommand(parseArgs(['board']), ctx);
    expect(ids(board.data)).toContain('TS-1');

    const add2 = await taskCommand(parseArgs(['task', 'add', 'Second', '--type', 'bug']), ctx);
    expect((add2.data as { task: Task }).task.frontmatter.id).toBe('TS-2');

    await taskCommand(parseArgs(['task', 'status', 'TS-1', 'done']), ctx);
    await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--title', 'Renamed']), ctx);

    const board2 = await boardCommand(parseArgs(['board']), ctx);
    const t1 = findTask(board2.data, 'TS-1');
    expect(t1.title).toBe('Renamed');
    expect(t1.frontmatter.status).toBe('done');

    const removed = await taskCommand(parseArgs(['task', 'rm', 'TS-2']), ctx);
    expect((removed.data as { removed: string }).removed).toBe('TS-2');

    const board3 = await boardCommand(parseArgs(['board']), ctx);
    expect(ids(board3.data)).not.toContain('TS-2');
  });

  it('fails to add a task to a missing epic', async () => {
    await initCommand(parseArgs(['init', '--id-prefix', 'TS']), ctx);
    await expect(
      taskCommand(parseArgs(['task', 'add', 'X', '--epic', 'ghost']), ctx),
    ).rejects.toThrow(/epic/i);
  });

  it('reports NO_BOARD when no board exists', async () => {
    await expect(boardCommand(parseArgs(['board']), ctx)).rejects.toMatchObject({
      code: 'NO_BOARD',
    });
  });

  it('refuses to clobber a file changed on disk since load (CONFLICT)', async () => {
    await initCommand(parseArgs(['init', '--id-prefix', 'TS']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'One']), ctx);

    const { fs } = await loadBoardOrThrow(join(project, '.boardown'));
    // Simulate an external edit (another process, git pull) after load.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeFile(join(project, '.boardown', 'epics', 'no_epic.md'), '---\n{}\n---\n', 'utf8');

    await expect(fs.write('epics/no_epic.md', 'whatever')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});
