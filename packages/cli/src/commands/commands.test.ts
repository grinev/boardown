import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  Backlog,
  BoardConfig,
  ChecklistItem,
  Epic,
  Note,
  Release,
  Task,
} from '@boardown/core';
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

  it('checklist add → done → undone → edit → rm round-trips', async () => {
    await initCommand(parseArgs(['init', '--id-prefix', 'TS']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'Has checklist']), ctx);

    const add = await taskCommand(parseArgs(['task', 'checklist', 'add', 'TS-1', 'First item']), ctx);
    const added = add.data as { task: Task; item: ChecklistItem };
    expect(added.item.id).toBe('c1');
    expect(added.item.done).toBe(false);
    expect(added.task.frontmatter.checklist).toHaveLength(1);

    await taskCommand(parseArgs(['task', 'checklist', 'add', 'TS-1', 'Second item']), ctx);

    const checkedDone = await taskCommand(parseArgs(['task', 'checklist', 'done', 'TS-1', 'c1']), ctx);
    const afterDone = (checkedDone.data as { task: Task }).task;
    expect(afterDone.frontmatter.checklist?.find((i) => i.id === 'c1')?.done).toBe(true);

    // alias `check` + idempotent undone
    const checkedUndone = await taskCommand(parseArgs(['task', 'check', 'undone', 'TS-1', 'c1']), ctx);
    const afterUndone = (checkedUndone.data as { task: Task }).task;
    expect(afterUndone.frontmatter.checklist?.find((i) => i.id === 'c1')?.done).toBe(false);

    await taskCommand(parseArgs(['task', 'checklist', 'edit', 'TS-1', 'c1', 'Renamed item']), ctx);
    const removed = await taskCommand(parseArgs(['task', 'checklist', 'rm', 'TS-1', 'c2']), ctx);
    const afterRm = (removed.data as { task: Task; removed: string }).task;
    expect((removed.data as { removed: string }).removed).toBe('c2');
    expect(afterRm.frontmatter.checklist).toHaveLength(1);
    expect(afterRm.frontmatter.checklist?.[0]?.id).toBe('c1');
    expect(afterRm.frontmatter.checklist?.[0]?.text).toBe('Renamed item');
  });

  it('notes add → edit → rm round-trips', async () => {
    await initCommand(parseArgs(['init', '--id-prefix', 'TS']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'Has notes']), ctx);

    const add = await taskCommand(parseArgs(['task', 'notes', 'add', 'TS-1', 'A thought']), ctx);
    const added = add.data as { task: Task; note: Note };
    expect(added.note.id).toBe('n1');
    expect(Number.isNaN(Date.parse(added.note.createdAt))).toBe(false);
    expect(added.task.frontmatter.notes).toHaveLength(1);

    // alias `note`
    await taskCommand(parseArgs(['task', 'note', 'add', 'TS-1', 'Another thought']), ctx);
    await taskCommand(parseArgs(['task', 'notes', 'edit', 'TS-1', 'n1', 'Edited thought']), ctx);
    const removed = await taskCommand(parseArgs(['task', 'notes', 'rm', 'TS-1', 'n2']), ctx);
    const afterRm = (removed.data as { task: Task }).task;
    expect(afterRm.frontmatter.notes).toHaveLength(1);
    expect(afterRm.frontmatter.notes?.[0]?.id).toBe('n1');
    expect(afterRm.frontmatter.notes?.[0]?.text).toBe('Edited thought');
  });

  it('checklist/notes ops reject a missing item with ITEM_NOT_FOUND', async () => {
    await initCommand(parseArgs(['init', '--id-prefix', 'TS']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'T']), ctx);
    await expect(
      taskCommand(parseArgs(['task', 'checklist', 'done', 'TS-1', 'c9']), ctx),
    ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND' });
    await expect(
      taskCommand(parseArgs(['task', 'notes', 'rm', 'TS-1', 'n9']), ctx),
    ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND' });
  });

  it('task get human output lists checklist and notes with ids', async () => {
    await initCommand(parseArgs(['init', '--id-prefix', 'TS']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'T']), ctx);
    await taskCommand(parseArgs(['task', 'checklist', 'add', 'TS-1', 'Buy milk']), ctx);
    await taskCommand(parseArgs(['task', 'notes', 'add', 'TS-1', 'Remember this']), ctx);
    const get = await taskCommand(parseArgs(['task', 'get', 'TS-1']), ctx);
    expect(get.human).toContain('Checklist (0/1)');
    expect(get.human).toContain('c1');
    expect(get.human).toContain('Buy milk');
    expect(get.human).toContain('Notes (1)');
    expect(get.human).toContain('Remember this');
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
