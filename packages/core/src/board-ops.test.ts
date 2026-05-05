import { describe, expect, it } from 'vitest';
import {
  changeTaskStatus,
  createTask,
  deleteTask,
  editTask,
  moveTaskBetweenContainers,
  reorderTask,
} from './board-ops.js';
import type { BoardConfig, Release, Task } from './schemas.js';

const config: BoardConfig = {
  idPrefix: 'BD',
  nextId: 10,
  statuses: ['todo', 'in-progress', 'done'],
  paths: { releases: 'releases', epics: 'epics' },
};

const task = (id: string, status: string, order: number, title = id): Task => ({
  title,
  description: '',
  frontmatter: { id, status, order },
});

const release = (...tasks: Task[]): Release => ({
  filename: 'releases/1.10.md',
  frontmatter: { release: '1.10' },
  preamble: '',
  tasks,
});

describe('createTask', () => {
  it('assigns sequential id, places at end of column, bumps config.nextId', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const result = createTask(r0, config, { title: 'New', status: 'todo' });
    expect(result.task.frontmatter.id).toBe('BD-10');
    expect(result.task.frontmatter.order).toBe(200);
    expect(result.config.nextId).toBe(11);
    expect(result.container.tasks).toHaveLength(2);
  });

  it('starts column from 100 when empty', () => {
    const r0 = release(task('BD-1', 'todo', 500));
    const result = createTask(r0, config, { title: 'X', status: 'in-progress' });
    expect(result.task.frontmatter.order).toBe(100);
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
