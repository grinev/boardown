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
import { epicCommand } from './epic';
import { initCommand } from './init';
import { releaseCommand } from './release';
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

  describe('task link', () => {
    interface LinkEntry {
      type: string;
      to: string;
      title?: string;
      missing: boolean;
    }
    const links = (data: unknown): LinkEntry[] => (data as { links: LinkEntry[] }).links;

    beforeEach(async () => {
      await initCommand(parseArgs(['init', '--id-prefix', 'TS']), ctx);
      await taskCommand(parseArgs(['task', 'add', 'One']), ctx);
      await taskCommand(parseArgs(['task', 'add', 'Two']), ctx);
    });

    it('add mirrors the link and ls reports it from both sides', async () => {
      await taskCommand(parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2']), ctx);

      const board = await boardCommand(parseArgs(['board']), ctx);
      expect(findTask(board.data, 'TS-1').frontmatter.links).toEqual([
        { type: 'relates', to: 'TS-2' },
      ]);
      expect(findTask(board.data, 'TS-2').frontmatter.links).toEqual([
        { type: 'relates', to: 'TS-1' },
      ]);

      const forward = await taskCommand(parseArgs(['task', 'link', 'ls', 'TS-1']), ctx);
      expect(links(forward.data)).toEqual([
        { type: 'relates', to: 'TS-2', title: 'Two', status: 'todo', taskType: 'feature', missing: false },
      ]);
      const backward = await taskCommand(parseArgs(['task', 'link', 'ls', 'TS-2']), ctx);
      expect(links(backward.data).map((l) => l.to)).toEqual(['TS-1']);
    });

    it('add is idempotent', async () => {
      await taskCommand(parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2']), ctx);
      const again = await taskCommand(parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2']), ctx);

      expect((again.data as { files: string[] }).files).toEqual([]);
      const board = await boardCommand(parseArgs(['board']), ctx);
      expect(findTask(board.data, 'TS-1').frontmatter.links).toHaveLength(1);
    });

    it('rm removes both records, whichever side it is called from', async () => {
      await taskCommand(parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2']), ctx);
      await taskCommand(parseArgs(['task', 'link', 'rm', 'TS-2', 'TS-1']), ctx);

      const board = await boardCommand(parseArgs(['board']), ctx);
      expect(findTask(board.data, 'TS-1').frontmatter.links).toBeUndefined();
      expect(findTask(board.data, 'TS-2').frontmatter.links).toBeUndefined();
      const ls = await taskCommand(parseArgs(['task', 'link', 'ls', 'TS-1']), ctx);
      expect(links(ls.data)).toEqual([]);
    });

    it('rejects a self-link with USAGE and an unknown task with TASK_NOT_FOUND', async () => {
      await expect(
        taskCommand(parseArgs(['task', 'link', 'add', 'TS-1', 'TS-1']), ctx),
      ).rejects.toMatchObject({ code: 'USAGE', exitCode: 2 });
      await expect(
        taskCommand(parseArgs(['task', 'link', 'add', 'TS-1', 'NOPE-9']), ctx),
      ).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
      await expect(
        taskCommand(parseArgs(['task', 'link', 'add', 'NOPE-9', 'TS-1']), ctx),
      ).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
    });

    it('refuses a task in a finished release, as source and as target', async () => {
      const rel = await releaseCommand(parseArgs(['release', 'add', 'Old']), ctx);
      const relFile = (rel.data as { release: { filename: string } }).release.filename;
      await releaseCommand(parseArgs(['release', 'start', relFile]), ctx);
      await taskCommand(parseArgs(['task', 'edit', 'TS-2', '--release', relFile]), ctx);
      // Only a done task stays in the release when it is finished; an open one
      // would be moved back to the backlog and would not be archived at all.
      await taskCommand(parseArgs(['task', 'status', 'TS-2', 'done']), ctx);
      await releaseCommand(parseArgs(['release', 'done', relFile]), ctx);

      await expect(
        taskCommand(parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2']), ctx),
      ).rejects.toMatchObject({ code: 'ARCHIVED' });
      await expect(
        taskCommand(parseArgs(['task', 'link', 'add', 'TS-2', 'TS-1']), ctx),
      ).rejects.toMatchObject({ code: 'ARCHIVED' });
    });

    it('task rm strips the mirrored record from the surviving task', async () => {
      await taskCommand(parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2']), ctx);
      await taskCommand(parseArgs(['task', 'rm', 'TS-2']), ctx);

      const board = await boardCommand(parseArgs(['board']), ctx);
      expect(findTask(board.data, 'TS-1').frontmatter.links).toBeUndefined();
      const ls = await taskCommand(parseArgs(['task', 'link', 'ls', 'TS-1']), ctx);
      expect(links(ls.data)).toEqual([]);
    });

    // The one link a delete leaves behind: an archived file is never rewritten, so
    // the record on a task in a finished release survives and shows up as missing.
    it('task rm leaves an archived counterpart linked, and ls flags it as missing', async () => {
      await taskCommand(parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2']), ctx);
      const rel = await releaseCommand(parseArgs(['release', 'add', 'Old']), ctx);
      const relFile = (rel.data as { release: { filename: string } }).release.filename;
      await releaseCommand(parseArgs(['release', 'start', relFile]), ctx);
      await taskCommand(parseArgs(['task', 'edit', 'TS-2', '--release', relFile]), ctx);
      await taskCommand(parseArgs(['task', 'status', 'TS-2', 'done']), ctx);
      await releaseCommand(parseArgs(['release', 'done', relFile]), ctx);

      await taskCommand(parseArgs(['task', 'rm', 'TS-1']), ctx);

      const board = await boardCommand(parseArgs(['board']), ctx);
      expect(findTask(board.data, 'TS-2').frontmatter.links).toEqual([
        { type: 'relates', to: 'TS-1' },
      ]);
      const ls = await taskCommand(parseArgs(['task', 'link', 'ls', 'TS-2']), ctx);
      expect(links(ls.data)).toEqual([{ type: 'relates', to: 'TS-1', missing: true }]);
      expect(ls.human).toContain('(missing)');
    });

    it('task get shows the links block', async () => {
      await taskCommand(parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2']), ctx);
      const get = await taskCommand(parseArgs(['task', 'get', 'TS-1']), ctx);
      expect(get.human).toContain('Links (1)');
      expect(get.human).toContain('relates to  TS-2');
    });
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

  describe('task list', () => {
    // A known board: backlog (TS-1 bug/todo, TS-2 feature/done), epic file
    // (TS-3 tech/todo, epic bug-audit), current release (TS-4 bug/todo, retagged
    // into epic bug-audit while living in the release).
    async function seed(): Promise<string> {
      await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
      await epicCommand(parseArgs(['epic', 'add', 'Bug Audit']), ctx);
      await taskCommand(parseArgs(['task', 'add', 'Alpha bug fix', '--type', 'bug']), ctx);
      await taskCommand(parseArgs(['task', 'add', 'Beta feature', '--type', 'feature']), ctx);
      await taskCommand(parseArgs(['task', 'status', 'TS-2', 'done']), ctx);
      await taskCommand(
        parseArgs(['task', 'add', 'Gamma tech', '--type', 'tech', '--epic', 'bug-audit']),
        ctx,
      );
      const rel = await releaseCommand(parseArgs(['release', 'add', 'Active']), ctx);
      const relFile = (rel.data as { release: { filename: string } }).release.filename;
      await releaseCommand(parseArgs(['release', 'start', relFile]), ctx);
      await taskCommand(
        parseArgs(['task', 'add', 'Delta ship', '--type', 'bug', '--release', relFile]),
        ctx,
      );
      await taskCommand(parseArgs(['task', 'edit', 'TS-4', '--epic', 'bug-audit']), ctx);
      return relFile;
    }

    const listIds = (data: unknown): string[] =>
      (data as { tasks: { task: Task }[] }).tasks.map((e) => e.task.frontmatter.id).sort();

    it('lists every task with no filters', async () => {
      await seed();
      const out = await taskCommand(parseArgs(['task', 'list']), ctx);
      expect(listIds(out.data)).toEqual(['TS-1', 'TS-2', 'TS-3', 'TS-4']);
      expect((out.data as { count: number }).count).toBe(4);
    });

    it('each entry carries the task and its container location', async () => {
      await seed();
      const out = await taskCommand(parseArgs(['task', 'list', '--release', 'active']), ctx);
      const tasks = (out.data as { tasks: { task: Task; in: { kind: string; file: string } }[] })
        .tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.task.frontmatter.id).toBe('TS-4');
      expect(tasks[0]?.in.kind).toBe('release');
      expect(tasks[0]?.in.file).toBe('releases/active.md');
    });

    it('filters by status', async () => {
      await seed();
      expect(
        listIds((await taskCommand(parseArgs(['task', 'list', '--status', 'todo']), ctx)).data),
      ).toEqual(['TS-1', 'TS-3', 'TS-4']);
      expect(
        listIds((await taskCommand(parseArgs(['task', 'list', '--status', 'done']), ctx)).data),
      ).toEqual(['TS-2']);
    });

    it('filters by type', async () => {
      await seed();
      expect(
        listIds((await taskCommand(parseArgs(['task', 'list', '--type', 'bug']), ctx)).data),
      ).toEqual(['TS-1', 'TS-4']);
    });

    it('filters by epic, catching both epic-file and release-tagged tasks', async () => {
      await seed();
      expect(
        listIds((await taskCommand(parseArgs(['task', 'list', '--epic', 'bug-audit']), ctx)).data),
      ).toEqual(['TS-3', 'TS-4']);
    });

    it('filters by release', async () => {
      await seed();
      expect(
        listIds((await taskCommand(parseArgs(['task', 'list', '--release', 'active']), ctx)).data),
      ).toEqual(['TS-4']);
    });

    it('filters to backlog only', async () => {
      await seed();
      expect(
        listIds((await taskCommand(parseArgs(['task', 'list', '--backlog']), ctx)).data),
      ).toEqual(['TS-1', 'TS-2']);
    });

    it('filters by case-insensitive text on title/description', async () => {
      await seed();
      expect(
        listIds((await taskCommand(parseArgs(['task', 'list', '--text', 'SHIP']), ctx)).data),
      ).toEqual(['TS-4']);
    });

    it('matches --text against the description body, not only the title', async () => {
      await seed();
      // "telemetry" appears in no title — a hit proves the description branch.
      await taskCommand(
        parseArgs(['task', 'edit', 'TS-1', '--description', 'Investigate telemetry drift']),
        ctx,
      );
      expect(
        listIds((await taskCommand(parseArgs(['task', 'list', '--text', 'TELEMETRY']), ctx)).data),
      ).toEqual(['TS-1']);
    });

    it('accepts the ls alias', async () => {
      await seed();
      const viaLs = listIds((await taskCommand(parseArgs(['task', 'ls']), ctx)).data);
      expect(viaLs).toEqual(['TS-1', 'TS-2', 'TS-3', 'TS-4']);
    });

    it('renders human output with mark, id, type/status, epic, location and count', async () => {
      await seed();
      const out = await taskCommand(parseArgs(['task', 'list', '--release', 'active']), ctx);
      expect(out.human).toContain('TS-4');
      expect(out.human).toContain('[bug/todo]');
      expect(out.human).toContain('epic:bug-audit');
      expect(out.human).toContain('(release: releases/active.md)');
      expect(out.human).toContain('Delta ship');
      expect(out.human).toContain('1 task(s).');
    });

    it('renders a placeholder line when nothing matches', async () => {
      await seed();
      const out = await taskCommand(
        parseArgs(['task', 'list', '--status', 'done', '--type', 'bug']),
        ctx,
      );
      expect(out.human).toBe('No matching tasks.');
    });

    it('AND-combines filters', async () => {
      await seed();
      expect(
        listIds(
          (
            await taskCommand(
              parseArgs(['task', 'list', '--status', 'todo', '--type', 'bug']),
              ctx,
            )
          ).data,
        ),
      ).toEqual(['TS-1', 'TS-4']);
      expect(
        listIds(
          (
            await taskCommand(
              parseArgs(['task', 'list', '--status', 'todo', '--type', 'bug', '--epic', 'bug-audit']),
              ctx,
            )
          ).data,
        ),
      ).toEqual(['TS-4']);
    });

    it('returns an empty list (not an error) when nothing matches', async () => {
      await seed();
      const out = await taskCommand(parseArgs(['task', 'list', '--status', 'done', '--type', 'bug']), ctx);
      expect((out.data as { tasks: unknown[]; count: number }).tasks).toEqual([]);
      expect((out.data as { count: number }).count).toBe(0);
    });

    it('rejects an invalid --type with a USAGE error', async () => {
      await seed();
      await expect(
        taskCommand(parseArgs(['task', 'list', '--type', 'nonsense']), ctx),
      ).rejects.toMatchObject({ code: 'USAGE', exitCode: 2 });
    });

    it('rejects an unknown --epic with EPIC_NOT_FOUND', async () => {
      await seed();
      await expect(
        taskCommand(parseArgs(['task', 'list', '--epic', 'ghost']), ctx),
      ).rejects.toMatchObject({ code: 'EPIC_NOT_FOUND' });
    });

    it('rejects an unknown --release with RELEASE_NOT_FOUND', async () => {
      await seed();
      await expect(
        taskCommand(parseArgs(['task', 'list', '--release', 'ghost']), ctx),
      ).rejects.toMatchObject({ code: 'RELEASE_NOT_FOUND' });
    });
  });
});
