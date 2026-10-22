import { describe, expect, it } from 'vitest';
import {
  addTaskLink,
  changeTaskStatus,
  completeRelease,
  createTask,
  createTaskWithLinks,
  deleteTaskWithLinks,
  editTask,
  emptyBacklog,
  moveTaskBetweenContainers,
  moveTaskInContainer,
  removeAllTaskLinks,
  reorderTask,
  setTaskLabels,
} from './board-ops.js';
import { isUpdateTracked, stampChangedTasks } from './task-dates.js';
import type { Backlog, BoardConfig, Release, Task } from './schemas.js';

const NOW = '2026-10-22T10:00:00.000Z';
const EARLIER = '2026-01-01T00:00:00.000Z';

const config: BoardConfig = { idPrefix: 'BD', nextId: 10, projectName: 'P' };
const untracked: BoardConfig = { ...config, trackUpdatedAt: false };

const task = (id: string, order: number, dates: Partial<Task['frontmatter']> = {}): Task => ({
  title: id,
  description: '',
  frontmatter: { id, type: 'feature', status: 'todo', order, ...dates },
});

const release = (
  tasks: Task[],
  status: Release['frontmatter']['status'] = 'current',
  slug = '1.0',
): Release => ({
  filename: `releases/${slug}.md`,
  slug,
  frontmatter: { status },
  preamble: '',
  tasks,
});

const backlog = (tasks: Task[]): Backlog => ({ ...emptyBacklog(), tasks });

const fm = (container: { tasks: Task[] }, id: string) =>
  container.tasks.find((t) => t.frontmatter.id === id)?.frontmatter;

describe('isUpdateTracked', () => {
  it('is on when the board never set it, off only when it says false', () => {
    expect(isUpdateTracked(config)).toBe(true);
    expect(isUpdateTracked({ ...config, trackUpdatedAt: true })).toBe(true);
    expect(isUpdateTracked(untracked)).toBe(false);
  });
});

describe('stampChangedTasks', () => {
  it('hands back the previous list itself when nothing changed', () => {
    const before = [task('BD-1', 100), task('BD-2', 200)];
    const next = before.map((t) => ({ ...t, frontmatter: { ...t.frontmatter } }));
    expect(stampChangedTasks(before, next, config, NOW)).toBe(before);
  });

  it('stamps a content change and an arrival, not an order change', () => {
    const before = [task('BD-1', 100), task('BD-2', 200)];
    const next = [
      { ...before[0]!, title: 'Renamed' },
      { ...before[1]!, frontmatter: { ...before[1]!.frontmatter, order: 50 } },
      task('BD-3', 300),
    ];
    const stamped = stampChangedTasks(before, next, config, NOW);
    expect(stamped.map((t) => t.frontmatter.updatedAt)).toEqual([NOW, undefined, NOW]);
  });

  it('writes nothing new when the board does not track updates', () => {
    const before = [task('BD-1', 100, { updatedAt: EARLIER })];
    const next = [{ ...before[0]!, title: 'Renamed' }];
    expect(stampChangedTasks(before, next, untracked, NOW)[0]?.frontmatter.updatedAt).toBe(EARLIER);
  });
});

describe('board ops stamp the tasks they change', () => {
  it('creates a task with both dates on one moment, or createdAt alone untracked', () => {
    const created = createTask(release([]), config, { title: 'T', type: 'feature', status: 'todo' }, NOW);
    expect(created.task.frontmatter).toMatchObject({ createdAt: NOW, updatedAt: NOW });
    expect(fm(created.container, created.task.frontmatter.id)?.updatedAt).toBe(NOW);

    const plain = createTask(release([]), untracked, { title: 'T', type: 'feature', status: 'todo' }, NOW);
    expect(plain.task.frontmatter.createdAt).toBe(NOW);
    expect(plain.task.frontmatter.updatedAt).toBeUndefined();
  });

  it('stamps an edit, and a task from an older build gets updatedAt only', () => {
    const r = release([task('BD-1', 100), task('BD-2', 200, { createdAt: EARLIER, updatedAt: EARLIER })]);
    const edited = editTask(r, config, 'BD-1', { title: 'New' }, NOW);
    expect(fm(edited, 'BD-1')).toMatchObject({ updatedAt: NOW });
    expect(fm(edited, 'BD-1')?.createdAt).toBeUndefined();
    expect(fm(edited, 'BD-2')).toMatchObject({ createdAt: EARLIER, updatedAt: EARLIER });
  });

  it('returns the container itself for a save that changes nothing', () => {
    const r = release([task('BD-1', 100, { updatedAt: EARLIER })]);
    expect(editTask(r, config, 'BD-1', { title: 'BD-1', description: '  ' }, NOW)).toBe(r);
    expect(changeTaskStatus(r, config, 'BD-1', 'todo', NOW)).toBe(r);
    expect(setTaskLabels(r, config, 'BD-1', [], NOW).container).toBe(r);
  });

  it('never rewrites createdAt, and leaves updatedAt alone untracked', () => {
    const r = release([task('BD-1', 100, { createdAt: 'by hand', updatedAt: 'by hand' })]);
    expect(fm(editTask(r, config, 'BD-1', { title: 'x' }, NOW), 'BD-1')).toMatchObject({
      createdAt: 'by hand',
      updatedAt: NOW,
    });
    expect(fm(editTask(r, untracked, 'BD-1', { title: 'x' }, NOW), 'BD-1')?.updatedAt).toBe('by hand');
  });

  it('stamps a status change, not the siblings it renumbers or a reorder', () => {
    const r = release([task('BD-1', 100), task('BD-2', 101), task('BD-3', 102)]);
    const moved = changeTaskStatus(r, config, 'BD-1', 'done', NOW);
    expect(fm(moved, 'BD-1')?.updatedAt).toBe(NOW);
    expect(fm(moved, 'BD-2')?.updatedAt).toBeUndefined();

    const reordered = reorderTask(r, config, 'BD-3', 'BD-1');
    expect(reordered.tasks.every((t) => t.frontmatter.updatedAt === undefined)).toBe(true);
    const dragged = moveTaskInContainer(r, config, 'BD-3', { status: 'todo', beforeTaskId: 'BD-2' }, NOW);
    expect(dragged.tasks.every((t) => t.frontmatter.updatedAt === undefined)).toBe(true);
  });

  it('stamps a task moved to another container, release or backlog', () => {
    const moved = moveTaskBetweenContainers(
      release([task('BD-1', 100)]),
      backlog([task('BD-2', 100)]),
      config,
      'BD-1',
      { newStatus: 'todo', beforeTaskId: null },
      NOW,
    );
    expect(fm(moved.dest, 'BD-1')?.updatedAt).toBe(NOW);
    expect(fm(moved.dest, 'BD-2')?.updatedAt).toBeUndefined();
  });

  it('stamps both tasks of a link, and only when the link changes', () => {
    const r = release([task('BD-1', 100), task('BD-2', 200), task('BD-3', 300)]);
    const linked = addTaskLink(r, r, config, 'BD-1', 'BD-2', 'relates', NOW);
    expect(fm(linked.source, 'BD-1')?.updatedAt).toBe(NOW);
    expect(fm(linked.source, 'BD-2')?.updatedAt).toBe(NOW);
    expect(fm(linked.source, 'BD-3')?.updatedAt).toBeUndefined();

    const later = '2026-11-01T00:00:00.000Z';
    const again = addTaskLink(linked.source, linked.target, config, 'BD-1', 'BD-2', 'relates', later);
    expect(again.changedFilenames).toEqual([]);
    expect(fm(again.source, 'BD-1')?.updatedAt).toBe(NOW);

    const unlinked = removeAllTaskLinks(linked.source, linked.target, config, 'BD-1', 'BD-2', later);
    expect(fm(unlinked.source, 'BD-2')?.updatedAt).toBe(later);
  });

  it('creates a task with links on one moment for both of its dates', () => {
    const r = release([task('BD-1', 100)]);
    const result = createTaskWithLinks(
      [r],
      r.filename,
      config,
      { title: 'New', type: 'feature', status: 'todo' },
      [{ type: 'relates', to: 'BD-1' }],
      NOW,
    );
    expect(result.task.frontmatter).toMatchObject({ createdAt: NOW, updatedAt: NOW });
    expect(fm(result.containers[0]!, 'BD-1')?.updatedAt).toBe(NOW);
  });

  it('stamps every task that loses a link to a deleted one', () => {
    const r = release([task('BD-1', 100), task('BD-2', 200), task('BD-3', 300)]);
    const linked = addTaskLink(r, r, config, 'BD-1', 'BD-2', 'relates', EARLIER).source;
    const other = backlog([task('BD-4', 100, { links: [{ type: 'relates', to: 'BD-1' }] })]);
    const linkedBack: Release = {
      ...linked,
      tasks: linked.tasks.map((t) =>
        t.frontmatter.id === 'BD-1'
          ? { ...t, frontmatter: { ...t.frontmatter, links: [...(t.frontmatter.links ?? []), { type: 'relates', to: 'BD-4' }] } }
          : t,
      ),
    };
    const result = deleteTaskWithLinks([linkedBack, other], config, 'BD-1', NOW);
    expect(fm(result.containers[0]!, 'BD-2')?.updatedAt).toBe(NOW);
    expect(fm(result.containers[0]!, 'BD-3')?.updatedAt).toBeUndefined();
    expect(fm(result.containers[1]!, 'BD-4')?.updatedAt).toBe(NOW);
  });

  it('stamps the tasks Complete release moves out, not the ones it leaves', () => {
    const done = { ...task('BD-1', 100), frontmatter: { ...task('BD-1', 100).frontmatter, status: 'done' } };
    const result = completeRelease(
      {
        release: release([done, task('BD-2', 200)]),
        config,
        backlog: backlog([]),
        targetRelease: null,
      },
      NOW,
    );
    expect(fm(result.backlog, 'BD-2')?.updatedAt).toBe(NOW);
    expect(fm(result.release, 'BD-1')?.updatedAt).toBeUndefined();
  });
});
