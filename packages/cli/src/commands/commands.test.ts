import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { completeRelease, emptyBacklog, type Task } from '@boardown/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import type { CliError } from '../output';
import { loadBoardOrThrow, writeContainers, type ContainerRef } from '../persistence';
import type { CommandContext } from '../types';
import { epicCommand } from './epic';
import { initCommand } from './init';
import { releaseCommand } from './release';
import { taskCommand } from './task';

// `task list --full` is the CLI's own way to read every task with its
// frontmatter — the whole-board dump these tests used to lean on is gone.
const allTasks = async (ctx: CommandContext): Promise<Task[]> => {
  const out = await taskCommand(parseArgs(['task', 'list', '--full']), ctx);
  return (out.data as { tasks: { task: Task }[] }).tasks.map((e) => e.task);
};

const ids = async (ctx: CommandContext): Promise<string[]> =>
  (await allTasks(ctx)).map((t) => t.frontmatter.id);

const findTask = async (ctx: CommandContext, id: string): Promise<Task> => {
  const task = (await allTasks(ctx)).find((t) => t.frontmatter.id === id);
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
    expect((out.data as { boardRoot: string }).boardRoot).toContain('.boardown');
    const config = await readFile(join(project, '.boardown', 'config.yaml'), 'utf8');
    expect(config).toContain('idPrefix: TS');
    expect(config).toContain('projectName: Demo');
  });

  it('add → board → edit → status → rm round-trips', async () => {
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);

    // A status only changes in the current release, so the round-trip needs one.
    const rel = await releaseCommand(parseArgs(['release', 'add', 'Active']), ctx);
    const relFile = (rel.data as { slug: string }).slug;
    await releaseCommand(parseArgs(['release', 'start', relFile]), ctx);

    const add = await taskCommand(
      parseArgs(['task', 'add', 'My first task', '--type', 'feature', '--release', relFile]),
      ctx,
    );
    expect(add.data).toEqual({ id: 'TS-1' });
    expect(await ids(ctx)).toContain('TS-1');

    const add2 = await taskCommand(parseArgs(['task', 'add', 'Second', '--type', 'bug']), ctx);
    expect(add2.data).toEqual({ id: 'TS-2' });

    const status = await taskCommand(parseArgs(['task', 'status', 'TS-1', 'done']), ctx);
    expect(status.data).toEqual({ id: 'TS-1' });
    const edit = await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--title', 'Renamed']), ctx);
    expect(edit.data).toEqual({ id: 'TS-1' });

    const t1 = await findTask(ctx, 'TS-1');
    expect(t1.title).toBe('Renamed');
    expect(t1.frontmatter.status).toBe('done');

    const removed = await taskCommand(parseArgs(['task', 'rm', 'TS-2']), ctx);
    expect(removed.data).toEqual({ id: 'TS-2' });
    expect(await ids(ctx)).not.toContain('TS-2');
  });

  describe('task priority', () => {
    it('writes no priority key without the flag', async () => {
      await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
      await taskCommand(parseArgs(['task', 'add', 'Plain']), ctx);
      expect((await findTask(ctx, 'TS-1')).frontmatter.priority).toBeUndefined();
    });

    it('writes the priority passed to task add', async () => {
      await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
      await taskCommand(parseArgs(['task', 'add', 'Urgent', '--priority', 'critical']), ctx);
      expect((await findTask(ctx, 'TS-1')).frontmatter.priority).toBe('critical');
    });

    it('sets the priority through task edit', async () => {
      await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
      await taskCommand(parseArgs(['task', 'add', 'Plain']), ctx);
      await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--priority', 'low']), ctx);
      expect((await findTask(ctx, 'TS-1')).frontmatter.priority).toBe('low');
    });

    // Setting the default is a set, not a clear.
    it('keeps an explicitly set medium', async () => {
      await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
      await taskCommand(parseArgs(['task', 'add', 'Plain']), ctx);
      await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--priority', 'high']), ctx);
      await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--priority', 'medium']), ctx);
      expect((await findTask(ctx, 'TS-1')).frontmatter.priority).toBe('medium');
    });

    it('rejects an invalid priority on add and writes nothing', async () => {
      await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
      await expect(
        taskCommand(parseArgs(['task', 'add', 'Bad', '--priority', 'urgent']), ctx),
      ).rejects.toMatchObject({ code: 'USAGE' });
      expect(await ids(ctx)).toEqual([]);
    });

    it('rejects an invalid priority on edit', async () => {
      await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
      await taskCommand(parseArgs(['task', 'add', 'Plain']), ctx);
      await expect(
        taskCommand(parseArgs(['task', 'edit', 'TS-1', '--priority', 'urgent']), ctx),
      ).rejects.toMatchObject({ code: 'USAGE' });
      expect((await findTask(ctx, 'TS-1')).frontmatter.priority).toBeUndefined();
    });
  });

  it('fails to add a task to a missing epic', async () => {
    await initCommand(parseArgs(['init', '--id-prefix', 'TS']), ctx);
    await expect(
      taskCommand(parseArgs(['task', 'add', 'X', '--epic', 'ghost']), ctx),
    ).rejects.toThrow(/epic/i);
  });

  describe('a status only changes in the current release', () => {
    // A board with a current release (TS-1 in it), a future release and a backlog
    // task (TS-2). Returns both release refs.
    async function seedLock(): Promise<{ current: string; future: string }> {
      await initCommand(parseArgs(['init', '--id-prefix', 'TS']), ctx);
      const cur = (
        (await releaseCommand(parseArgs(['release', 'add', 'Active']), ctx)).data as {
          slug: string;
        }
      ).slug;
      await releaseCommand(parseArgs(['release', 'start', cur]), ctx);
      const next = (
        (await releaseCommand(parseArgs(['release', 'add', 'Next']), ctx)).data as { slug: string }
      ).slug;
      await taskCommand(parseArgs(['task', 'add', 'In sprint', '--release', cur]), ctx);
      await taskCommand(parseArgs(['task', 'add', 'Unscheduled']), ctx);
      return { current: cur, future: next };
    }

    const fileOf = (rel: string): string =>
      join(project, '.boardown', 'releases', `${rel}.md`);

    it('task status succeeds in the current release', async () => {
      await seedLock();
      await taskCommand(parseArgs(['task', 'status', 'TS-1', 'in-progress']), ctx);
      expect((await findTask(ctx, 'TS-1')).frontmatter.status).toBe('in-progress');
    });

    it('task status is refused in a future release, leaving the file untouched', async () => {
      const { current, future } = await seedLock();
      await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--release', future]), ctx);
      const before = await readFile(fileOf(future), 'utf8');

      let refusal: CliError | null = null;
      try {
        await taskCommand(parseArgs(['task', 'status', 'TS-1', 'done']), ctx);
      } catch (err) {
        refusal = err as CliError;
      }
      expect(refusal?.code).toBe('STATUS_LOCKED');
      expect(refusal?.message).toContain('the future release "Next"');
      expect(await readFile(fileOf(future), 'utf8')).toBe(before);
      expect(await readFile(fileOf(current), 'utf8')).toContain('status: current');
    });

    it('task status and task edit --status are refused on an unscheduled task', async () => {
      await seedLock();
      const file = join(project, '.boardown', 'epics', 'no_epic.md');
      const before = await readFile(file, 'utf8');

      await expect(
        taskCommand(parseArgs(['task', 'status', 'TS-2', 'done']), ctx),
      ).rejects.toMatchObject({ code: 'STATUS_LOCKED' });
      await expect(
        taskCommand(parseArgs(['task', 'edit', 'TS-2', '--status', 'done']), ctx),
      ).rejects.toMatchObject({ code: 'STATUS_LOCKED' });
      expect(await readFile(file, 'utf8')).toBe(before);

      // Every other field on that same task still edits.
      await taskCommand(parseArgs(['task', 'edit', 'TS-2', '--title', 'Renamed']), ctx);
      expect((await findTask(ctx, 'TS-2')).title).toBe('Renamed');
    });

    it('task add --status is refused outside the current release and creates nothing', async () => {
      const { current, future } = await seedLock();
      await expect(
        taskCommand(
          parseArgs(['task', 'add', 'Early', '--release', future, '--status', 'in-progress']),
          ctx,
        ),
      ).rejects.toMatchObject({ code: 'STATUS_LOCKED' });
      const config = await readFile(join(project, '.boardown', 'config.yaml'), 'utf8');
      expect(config).toContain('nextId: 3');
      expect(await ids(ctx)).toEqual(['TS-1', 'TS-2']);

      await taskCommand(parseArgs(['task', 'add', 'Later', '--release', future]), ctx);
      expect((await findTask(ctx, 'TS-3')).frontmatter.status).toBe('todo');
      // …while the current release still takes an explicit status.
      await taskCommand(
        parseArgs(['task', 'add', 'Started', '--release', current, '--status', 'in-progress']),
        ctx,
      );
      expect((await findTask(ctx, 'TS-4')).frontmatter.status).toBe('in-progress');
    });

    it('moving a task out of the current release preserves its status', async () => {
      const { future } = await seedLock();
      await taskCommand(parseArgs(['task', 'status', 'TS-1', 'in-progress']), ctx);
      await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--release', future]), ctx);
      const moved = await findTask(ctx, 'TS-1');
      expect(moved.frontmatter.status).toBe('in-progress');
      expect(await readFile(fileOf(future), 'utf8')).toContain('status: in-progress');
    });

    it('a relocation is judged by its destination: into the current release with a status, out with one refused', async () => {
      const { current, future } = await seedLock();
      // Backlog → current release, setting the status in the same call.
      await taskCommand(
        parseArgs(['task', 'edit', 'TS-2', '--release', current, '--status', 'in-progress']),
        ctx,
      );
      expect((await findTask(ctx, 'TS-2')).frontmatter.status).toBe('in-progress');
      // …and the same call towards a future release is refused.
      await expect(
        taskCommand(parseArgs(['task', 'edit', 'TS-2', '--release', future, '--status', 'done']), ctx),
      ).rejects.toMatchObject({ code: 'STATUS_LOCKED' });
    });

    it('a finished release still answers ARCHIVED, not STATUS_LOCKED', async () => {
      const { current } = await seedLock();
      await taskCommand(parseArgs(['task', 'status', 'TS-1', 'done']), ctx);
      await releaseCommand(parseArgs(['release', 'done', current]), ctx);
      await expect(
        taskCommand(parseArgs(['task', 'status', 'TS-1', 'todo']), ctx),
      ).rejects.toMatchObject({ code: 'ARCHIVED' });
    });

    it('a missing task is not reported as a guard refusal', async () => {
      await seedLock();
      await expect(
        taskCommand(parseArgs(['task', 'edit', 'TS-9', '--title', 'X']), ctx),
      ).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
    });
  });

  it('checklist add → done → undone → edit → rm round-trips', async () => {
    await initCommand(parseArgs(['init', '--id-prefix', 'TS']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'Has checklist']), ctx);

    const add = await taskCommand(parseArgs(['task', 'checklist', 'add', 'TS-1', 'First item']), ctx);
    expect(add.data).toEqual({ id: 'TS-1', item: 'c1' });
    expect((await findTask(ctx, 'TS-1')).frontmatter.checklist).toHaveLength(1);

    await taskCommand(parseArgs(['task', 'checklist', 'add', 'TS-1', 'Second item']), ctx);

    const checkedDone = await taskCommand(parseArgs(['task', 'checklist', 'done', 'TS-1', 'c1']), ctx);
    expect(checkedDone.data).toEqual({ id: 'TS-1', item: 'c1' });
    expect(
      (await findTask(ctx, 'TS-1')).frontmatter.checklist?.find((i) => i.id === 'c1')?.done,
    ).toBe(true);

    // alias `check` + idempotent undone
    await taskCommand(parseArgs(['task', 'check', 'undone', 'TS-1', 'c1']), ctx);
    expect(
      (await findTask(ctx, 'TS-1')).frontmatter.checklist?.find((i) => i.id === 'c1')?.done,
    ).toBe(false);

    await taskCommand(parseArgs(['task', 'checklist', 'edit', 'TS-1', 'c1', 'Renamed item']), ctx);
    const removed = await taskCommand(parseArgs(['task', 'checklist', 'rm', 'TS-1', 'c2']), ctx);
    expect(removed.data).toEqual({ id: 'TS-1', item: 'c2' });
    const afterRm = await findTask(ctx, 'TS-1');
    expect(afterRm.frontmatter.checklist).toHaveLength(1);
    expect(afterRm.frontmatter.checklist?.[0]?.id).toBe('c1');
    expect(afterRm.frontmatter.checklist?.[0]?.text).toBe('Renamed item');
  });

  it('notes add → edit → rm round-trips', async () => {
    await initCommand(parseArgs(['init', '--id-prefix', 'TS']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'Has notes']), ctx);

    const add = await taskCommand(parseArgs(['task', 'notes', 'add', 'TS-1', 'A thought']), ctx);
    expect(add.data).toEqual({ id: 'TS-1', note: 'n1' });
    expect(Number.isNaN(Date.parse((await findTask(ctx, 'TS-1')).frontmatter.notes?.[0]?.createdAt ?? ''))).toBe(false);
    expect((await findTask(ctx, 'TS-1')).frontmatter.notes).toHaveLength(1);

    // alias `note`
    await taskCommand(parseArgs(['task', 'note', 'add', 'TS-1', 'Another thought']), ctx);
    await taskCommand(parseArgs(['task', 'notes', 'edit', 'TS-1', 'n1', 'Edited thought']), ctx);
    const removed = await taskCommand(parseArgs(['task', 'notes', 'rm', 'TS-1', 'n2']), ctx);
    expect(removed.data).toEqual({ id: 'TS-1', note: 'n2' });
    const afterRm = await findTask(ctx, 'TS-1');
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

      expect((await findTask(ctx, 'TS-1')).frontmatter.links).toEqual([
        { type: 'relates', to: 'TS-2' },
      ]);
      expect((await findTask(ctx, 'TS-2')).frontmatter.links).toEqual([
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

      expect(again.data).toEqual({ id: 'TS-1', other: 'TS-2' });
      expect((await findTask(ctx, 'TS-1')).frontmatter.links).toHaveLength(1);
    });

    it('rm removes both records, whichever side it is called from', async () => {
      await taskCommand(parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2']), ctx);
      await taskCommand(parseArgs(['task', 'link', 'rm', 'TS-2', 'TS-1']), ctx);

      expect((await findTask(ctx, 'TS-1')).frontmatter.links).toBeUndefined();
      expect((await findTask(ctx, 'TS-2')).frontmatter.links).toBeUndefined();
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
      const relFile = (rel.data as { slug: string }).slug;
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

      expect((await findTask(ctx, 'TS-1')).frontmatter.links).toBeUndefined();
      const ls = await taskCommand(parseArgs(['task', 'link', 'ls', 'TS-1']), ctx);
      expect(links(ls.data)).toEqual([]);
    });

    // The one link a delete leaves behind: an archived file is never rewritten, so
    // the record on a task in a finished release survives and shows up as missing.
    it('task rm leaves an archived counterpart linked, and ls flags it as missing', async () => {
      await taskCommand(parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2']), ctx);
      const rel = await releaseCommand(parseArgs(['release', 'add', 'Old']), ctx);
      const relFile = (rel.data as { slug: string }).slug;
      await releaseCommand(parseArgs(['release', 'start', relFile]), ctx);
      await taskCommand(parseArgs(['task', 'edit', 'TS-2', '--release', relFile]), ctx);
      await taskCommand(parseArgs(['task', 'status', 'TS-2', 'done']), ctx);
      await releaseCommand(parseArgs(['release', 'done', relFile]), ctx);

      await taskCommand(parseArgs(['task', 'rm', 'TS-1']), ctx);

      expect((await findTask(ctx, 'TS-2')).frontmatter.links).toEqual([
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

    it('--type writes the relation and mirrors its inverse', async () => {
      const out = await taskCommand(
        parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2', '--type', 'blocks']),
        ctx,
      );

      expect((await findTask(ctx, 'TS-1')).frontmatter.links).toEqual([
        { type: 'blocks', to: 'TS-2' },
      ]);
      expect((await findTask(ctx, 'TS-2')).frontmatter.links).toEqual([
        { type: 'blocked-by', to: 'TS-1' },
      ]);
      expect(out.human).toContain('(blocks)');
    });

    it('reads the relation from each side in ls and task get', async () => {
      await taskCommand(
        parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2', '--type', 'blocks']),
        ctx,
      );

      const forward = await taskCommand(parseArgs(['task', 'link', 'ls', 'TS-1']), ctx);
      expect(links(forward.data).map((l) => l.type)).toEqual(['blocks']);
      expect(forward.human).toContain('blocks  TS-2');

      const backward = await taskCommand(parseArgs(['task', 'link', 'ls', 'TS-2']), ctx);
      expect(links(backward.data).map((l) => l.type)).toEqual(['blocked-by']);
      expect(backward.human).toContain('is blocked by  TS-1');

      const get = await taskCommand(parseArgs(['task', 'get', 'TS-2']), ctx);
      expect(get.human).toContain('is blocked by  TS-1');
    });

    it('one pair carries several relations at once', async () => {
      await taskCommand(
        parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2', '--type', 'blocks']),
        ctx,
      );
      await taskCommand(parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2']), ctx);

      expect((await findTask(ctx, 'TS-1')).frontmatter.links).toEqual([
        { type: 'blocks', to: 'TS-2' },
        { type: 'relates', to: 'TS-2' },
      ]);
    });

    it('rm --type drops that relation only; rm without it drops them all', async () => {
      await taskCommand(
        parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2', '--type', 'blocks']),
        ctx,
      );
      await taskCommand(parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2']), ctx);

      await taskCommand(
        parseArgs(['task', 'link', 'rm', 'TS-1', 'TS-2', '--type', 'blocks']),
        ctx,
      );
      expect((await findTask(ctx, 'TS-1')).frontmatter.links).toEqual([
        { type: 'relates', to: 'TS-2' },
      ]);
      expect((await findTask(ctx, 'TS-2')).frontmatter.links).toEqual([
        { type: 'relates', to: 'TS-1' },
      ]);

      await taskCommand(
        parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2', '--type', 'duplicates']),
        ctx,
      );
      await taskCommand(parseArgs(['task', 'link', 'rm', 'TS-1', 'TS-2']), ctx);

      expect((await findTask(ctx, 'TS-1')).frontmatter.links).toBeUndefined();
      expect((await findTask(ctx, 'TS-2')).frontmatter.links).toBeUndefined();
    });

    it('rejects an unknown --type with USAGE and writes nothing', async () => {
      await expect(
        taskCommand(
          parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2', '--type', 'supersedes']),
          ctx,
        ),
      ).rejects.toMatchObject({ code: 'USAGE', exitCode: 2 });
      expect((await findTask(ctx, 'TS-1')).frontmatter.links).toBeUndefined();
    });

    it('a bare --type is a USAGE error rather than clearing the whole pair', async () => {
      await taskCommand(
        parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2', '--type', 'blocks']),
        ctx,
      );

      await expect(
        taskCommand(parseArgs(['task', 'link', 'rm', 'TS-1', 'TS-2', '--type']), ctx),
      ).rejects.toMatchObject({ code: 'USAGE', exitCode: 2 });
      expect((await findTask(ctx, 'TS-1')).frontmatter.links).toEqual([
        { type: 'blocks', to: 'TS-2' },
      ]);
    });

    it('rm --type on a relation the pair does not carry changes nothing', async () => {
      await taskCommand(parseArgs(['task', 'link', 'add', 'TS-1', 'TS-2']), ctx);

      const out = await taskCommand(
        parseArgs(['task', 'link', 'rm', 'TS-1', 'TS-2', '--type', 'blocks']),
        ctx,
      );

      expect(out.human).toContain('are not linked (blocks)');
      expect((await findTask(ctx, 'TS-1')).frontmatter.links).toEqual([
        { type: 'relates', to: 'TS-2' },
      ]);
    });
  });

  it('reports NO_BOARD when no board exists', async () => {
    await expect(taskCommand(parseArgs(['task', 'list']), ctx)).rejects.toMatchObject({
      code: 'NO_BOARD',
    });
  });

  // `release done` loads the board and writes in one go, so a test cannot slip an
  // external change between the two. It drives the same sequence the command does
  // instead — the same guard, the same multi-file write — which is what pins that
  // a refused write leaves none of the redistribution on disk.
  it('completing a release writes nothing when a file it would touch changed on disk', async () => {
    await initCommand(parseArgs(['init', '--id-prefix', 'TS']), ctx);
    await epicCommand(parseArgs(['epic', 'add', 'UI']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'Still open', '--epic', 'ui']), ctx);
    const rel = await releaseCommand(parseArgs(['release', 'add', 'Active']), ctx);
    const slug = (rel.data as { slug: string }).slug;
    await releaseCommand(parseArgs(['release', 'start', slug]), ctx);
    await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--release', slug]), ctx);

    const board = await loadBoardOrThrow(join(project, '.boardown'));
    // Simulate an external edit of the epic that would receive the open task.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeFile(
      join(project, '.boardown', 'epics', 'ui.md'),
      '---\nname: UI\ncolor: "#1f6feb"\n---\n',
      'utf8',
    );

    const release = board.snapshot.releases.find((r) => r.frontmatter.status === 'current')!;
    const result = completeRelease({
      release,
      config: board.snapshot.config,
      epics: board.snapshot.epics,
      backlog: board.snapshot.backlog ?? emptyBacklog(),
      targetRelease: null,
    });
    const refs: ContainerRef[] = [
      { kind: 'release', container: result.release },
      ...result.epics
        .filter((e) => result.changedFilenames.includes(e.filename))
        .map((container): ContainerRef => ({ kind: 'epic', container })),
    ];

    await expect(writeContainers(board.fs, refs, board.problems)).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    // The release is written first, so a sequence of single writes would already
    // have finished it here.
    const onDisk = await readFile(join(project, '.boardown', 'releases', `${slug}.md`), 'utf8');
    expect(onDisk).toContain('status: current');
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
      const rel = await releaseCommand(parseArgs(['release', 'add', 'Active']), ctx);
      const relFile = (rel.data as { slug: string }).slug;
      await releaseCommand(parseArgs(['release', 'start', relFile]), ctx);
      await taskCommand(parseArgs(['task', 'add', 'Alpha bug fix', '--type', 'bug']), ctx);
      // A backlog task cannot be marked done in place: it is made done inside the
      // current release, then moved back out, which preserves the status.
      await taskCommand(
        parseArgs(['task', 'add', 'Beta feature', '--type', 'feature', '--release', relFile]),
        ctx,
      );
      await taskCommand(parseArgs(['task', 'status', 'TS-2', 'done']), ctx);
      await taskCommand(parseArgs(['task', 'edit', 'TS-2', '--no-release']), ctx);
      await taskCommand(
        parseArgs(['task', 'add', 'Gamma tech', '--type', 'tech', '--epic', 'bug-audit']),
        ctx,
      );
      await taskCommand(
        parseArgs(['task', 'add', 'Delta ship', '--type', 'bug', '--release', relFile]),
        ctx,
      );
      await taskCommand(parseArgs(['task', 'edit', 'TS-4', '--epic', 'bug-audit']), ctx);
      return relFile;
    }

    const listIds = (data: unknown): string[] =>
      (data as { tasks: { id: string }[] }).tasks.map((e) => e.id).sort();

    it('lists every task with no filters', async () => {
      await seed();
      const out = await taskCommand(parseArgs(['task', 'list']), ctx);
      expect(listIds(out.data)).toEqual(['TS-1', 'TS-2', 'TS-3', 'TS-4']);
      expect((out.data as { count: number }).count).toBe(4);
    });

    // A file's block order is insertion order and says nothing about the board,
    // so the listing has to sort rather than trust the file.
    it('sorts each container by order, not by position in the file', async () => {
      await seed();
      await writeFile(
        join(project, '.boardown', 'epics', 'no_epic.md'),
        [
          '---',
          '{}',
          '---',
          '',
          '## Beta feature',
          '',
          '---',
          'id: TS-2',
          'type: feature',
          'status: done',
          'order: 200',
          '---',
          '',
          '## Alpha bug fix',
          '',
          '---',
          'id: TS-1',
          'type: bug',
          'status: todo',
          'order: 100',
          '---',
          '',
        ].join('\n'),
        'utf8',
      );

      const out = await taskCommand(parseArgs(['task', 'list']), ctx);
      const listed = (out.data as { tasks: { id: string }[] }).tasks.map((e) => e.id);
      expect(listed.indexOf('TS-1')).toBeLessThan(listed.indexOf('TS-2'));
    });

    it('each entry carries the task and its container location', async () => {
      await seed();
      const out = await taskCommand(parseArgs(['task', 'list', '--release', 'active']), ctx);
      const tasks = (out.data as { tasks: { id: string; in: { kind: string; file: string } }[] })
        .tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.id).toBe('TS-4');
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

    it('filters by priority', async () => {
      await seed();
      await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--priority', 'critical']), ctx);
      expect(
        listIds((await taskCommand(parseArgs(['task', 'list', '--priority', 'critical']), ctx)).data),
      ).toEqual(['TS-1']);
    });

    // An absent key means the default, so it must match the default filter.
    it('matches tasks with no priority key when filtering by medium', async () => {
      await seed();
      await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--priority', 'high']), ctx);
      expect(
        listIds((await taskCommand(parseArgs(['task', 'list', '--priority', 'medium']), ctx)).data),
      ).toEqual(['TS-2', 'TS-3', 'TS-4']);
    });

    it('combines --priority with the other filters', async () => {
      await seed();
      await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--priority', 'low']), ctx);
      await taskCommand(parseArgs(['task', 'edit', 'TS-4', '--priority', 'low']), ctx);
      expect(
        listIds(
          (await taskCommand(parseArgs(['task', 'list', '--priority', 'low', '--backlog']), ctx))
            .data,
        ),
      ).toEqual(['TS-1']);
    });

    it('rejects an invalid --priority with a USAGE error', async () => {
      await seed();
      await expect(
        taskCommand(parseArgs(['task', 'list', '--priority', 'urgent']), ctx),
      ).rejects.toMatchObject({ code: 'USAGE' });
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

    // The app's search field matches ids; --text deliberately does not, since
    // every id carries the board's prefix.
    it('does not match --text against the id', async () => {
      await seed();
      expect(
        listIds((await taskCommand(parseArgs(['task', 'list', '--text', 'ts-3']), ctx)).data),
      ).toEqual([]);
    });

    it('treats an empty --text as no filter', async () => {
      await seed();
      expect(
        listIds((await taskCommand(parseArgs(['task', 'list', '--text', '']), ctx)).data),
      ).toEqual(['TS-1', 'TS-2', 'TS-3', 'TS-4']);
    });

    it('combines --text with another filter', async () => {
      await seed();
      expect(
        listIds(
          (
            await taskCommand(
              parseArgs(['task', 'list', '--text', 'a', '--status', 'todo']),
              ctx,
            )
          ).data,
        ),
      ).toEqual(['TS-1', 'TS-3', 'TS-4']);
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
      expect(out.human).toContain('[bug/medium/todo]');
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
