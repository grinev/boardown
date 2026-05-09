import { describe, expect, it } from 'vitest';
import {
  changeTaskStatus,
  createTask,
  deleteTask,
  editEpic,
  editTask,
  moveTaskBetweenContainers,
  reorderTask,
} from './board-ops.js';
import type { BoardConfig, Epic, Release, Task, TaskStatus } from './schemas.js';

const config: BoardConfig = {
  idPrefix: 'BD',
  nextId: 10,
};

const task = (
  id: string,
  status: TaskStatus,
  order: number,
  title = id,
): Task => ({
  title,
  description: '',
  frontmatter: { id, type: 'feature', status, order },
});

const release = (...tasks: Task[]): Release => ({
  filename: 'releases/1.10.md',
  frontmatter: { release: '1.10', status: 'current' },
  preamble: '',
  tasks,
});

describe('createTask', () => {
  it('assigns sequential id, places at end of column, bumps config.nextId', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const result = createTask(r0, config, {
      title: 'New',
      type: 'feature',
      status: 'todo',
    });
    expect(result.task.frontmatter.id).toBe('BD-10');
    expect(result.task.frontmatter.type).toBe('feature');
    expect(result.task.frontmatter.order).toBe(200);
    expect(result.config.nextId).toBe(11);
    expect(result.container.tasks).toHaveLength(2);
  });

  it('starts column from 100 when empty', () => {
    const r0 = release(task('BD-1', 'todo', 500));
    const result = createTask(r0, config, {
      title: 'X',
      type: 'tech',
      status: 'in-progress',
    });
    expect(result.task.frontmatter.order).toBe(100);
    expect(result.task.frontmatter.type).toBe('tech');
  });
});

describe('editTask', () => {
  it('updates title and description, preserves frontmatter', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, 'BD-1', { title: 'Updated', description: 'desc' });
    expect(r1.tasks[0]!.title).toBe('Updated');
    expect(r1.tasks[0]!.description).toBe('desc');
    expect(r1.tasks[0]!.frontmatter.order).toBe(100);
  });

  it('clears epic with null', () => {
    const t = task('BD-1', 'todo', 100);
    t.frontmatter.epic = 'parser';
    const r0 = release(t);
    const r1 = editTask(r0, 'BD-1', { epic: null });
    expect(r1.tasks[0]!.frontmatter.epic).toBeUndefined();
  });

  it('updates type', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, 'BD-1', { type: 'bug' });
    expect(r1.tasks[0]!.frontmatter.type).toBe('bug');
  });
});

describe('editEpic', () => {
  const baseEpic = (): Epic => ({
    filename: 'epics/parser.md',
    slug: 'parser',
    frontmatter: { name: 'Parser', color: '#1f6feb' },
    preamble: 'old preamble',
    tasks: [task('BD-1', 'todo', 100)],
  });

  it('updates name only', () => {
    const e = editEpic(baseEpic(), { name: 'New Parser' });
    expect(e.frontmatter.name).toBe('New Parser');
    expect(e.preamble).toBe('old preamble');
    expect(e.frontmatter.color).toBe('#1f6feb');
    expect(e.slug).toBe('parser');
    expect(e.filename).toBe('epics/parser.md');
    expect(e.tasks).toHaveLength(1);
  });

  it('updates preamble only', () => {
    const e = editEpic(baseEpic(), { preamble: 'fresh notes' });
    expect(e.preamble).toBe('fresh notes');
    expect(e.frontmatter.name).toBe('Parser');
  });

  it('updates name and preamble together', () => {
    const e = editEpic(baseEpic(), { name: 'X', preamble: 'Y' });
    expect(e.frontmatter.name).toBe('X');
    expect(e.preamble).toBe('Y');
  });

  it('empty patch returns equivalent epic', () => {
    const e = editEpic(baseEpic(), {});
    expect(e.frontmatter.name).toBe('Parser');
    expect(e.preamble).toBe('old preamble');
    expect(e.tasks).toHaveLength(1);
  });
});

describe('deleteTask', () => {
  it('removes the task', () => {
    const r0 = release(task('BD-1', 'todo', 100), task('BD-2', 'todo', 200));
    const r1 = deleteTask(r0, 'BD-1');
    expect(r1.tasks).toHaveLength(1);
    expect(r1.tasks[0]!.frontmatter.id).toBe('BD-2');
  });
});

describe('changeTaskStatus', () => {
  it('moves task to end of new status column', () => {
    const r0 = release(
      task('BD-1', 'todo', 100),
      task('BD-2', 'in-progress', 100),
      task('BD-3', 'in-progress', 200),
    );
    const r1 = changeTaskStatus(r0, 'BD-1', 'in-progress');
    const moved = r1.tasks.find((t) => t.frontmatter.id === 'BD-1')!;
    expect(moved.frontmatter.status).toBe('in-progress');
    expect(moved.frontmatter.order).toBe(300);
  });
});

describe('reorderTask', () => {
  it('places before given peer with averaged order', () => {
    const r0 = release(
      task('BD-1', 'todo', 100),
      task('BD-2', 'todo', 200),
      task('BD-3', 'todo', 300),
    );
    const r1 = reorderTask(r0, 'BD-3', 'BD-2');
    const moved = r1.tasks.find((t) => t.frontmatter.id === 'BD-3')!;
    expect(moved.frontmatter.order).toBe(150);
  });

  it('places at end when beforeTaskId is null', () => {
    const r0 = release(task('BD-1', 'todo', 100), task('BD-2', 'todo', 200));
    const r1 = reorderTask(r0, 'BD-1', null);
    const moved = r1.tasks.find((t) => t.frontmatter.id === 'BD-1')!;
    expect(moved.frontmatter.order).toBe(300);
  });

  it('renumbers the column on order collision', () => {
    const r0 = release(
      task('BD-1', 'todo', 100),
      task('BD-2', 'todo', 101),
      task('BD-3', 'todo', 200),
    );
    const r1 = reorderTask(r0, 'BD-3', 'BD-2');
    const orders = r1.tasks
      .filter((t) => t.frontmatter.status === 'todo')
      .sort((a, b) => a.frontmatter.order - b.frontmatter.order)
      .map((t) => t.frontmatter.order);
    expect(orders).toEqual([100, 200, 300]);
  });
});

describe('moveTaskBetweenContainers', () => {
  it('removes from source, places into dest with new status', () => {
    const a = release(task('BD-1', 'todo', 100));
    a.filename = 'releases/1.10.md';
    const b = release(task('BD-2', 'in-progress', 100));
    b.filename = 'releases/1.11.md';
    const result = moveTaskBetweenContainers(a, b, 'BD-1', {
      newStatus: 'in-progress',
      beforeTaskId: null,
    });
    expect(result.source.tasks).toHaveLength(0);
    expect(result.dest.tasks).toHaveLength(2);
    const moved = result.dest.tasks.find((t) => t.frontmatter.id === 'BD-1')!;
    expect(moved.frontmatter.status).toBe('in-progress');
    expect(moved.frontmatter.order).toBe(200);
  });
});
