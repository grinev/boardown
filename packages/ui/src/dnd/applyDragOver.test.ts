import type { Active, Over } from '@dnd-kit/core';
import type { Task, TaskStatus } from '@boardown/core';
import { describe, expect, it } from 'vitest';
import {
  applyDragOver,
  findOverlayPlacement,
  findStatusOf,
} from './applyDragOver';
import { columnDropId, taskDragId } from './ids';

const task = (id: string): Task => ({
  title: id,
  description: '',
  frontmatter: { id, type: 'feature', status: 'todo', order: 0 },
});

const dndId = (id: string): Active & Over => ({ id }) as unknown as Active & Over;

const ids = (tasks: Task[] | undefined): string[] =>
  (tasks ?? []).map((t) => t.frontmatter.id);

const buckets = (): Map<TaskStatus, Task[]> =>
  new Map<TaskStatus, Task[]>([
    ['todo', [task('BD-1'), task('BD-2')]],
    ['in-progress', [task('BD-3')]],
    ['done', []],
  ]);

describe('applyDragOver', () => {
  it('reorders within the same column when dropped on a task', () => {
    const next = applyDragOver(
      dndId(taskDragId('BD-1')),
      dndId(taskDragId('BD-2')),
      buckets(),
    );
    expect(ids(next.get('todo'))).toEqual(['BD-2', 'BD-1']);
  });

  it('moves a task into another column, before the target task', () => {
    const next = applyDragOver(
      dndId(taskDragId('BD-1')),
      dndId(taskDragId('BD-3')),
      buckets(),
    );
    expect(ids(next.get('todo'))).toEqual(['BD-2']);
    expect(ids(next.get('in-progress'))).toEqual(['BD-1', 'BD-3']);
  });

  it('appends to an empty column when dropped on the column container', () => {
    const next = applyDragOver(
      dndId(taskDragId('BD-1')),
      dndId(columnDropId('done')),
      buckets(),
    );
    expect(ids(next.get('todo'))).toEqual(['BD-2']);
    expect(ids(next.get('done'))).toEqual(['BD-1']);
  });

  it('is a no-op when active equals over', () => {
    const input = buckets();
    const next = applyDragOver(
      dndId(taskDragId('BD-1')),
      dndId(taskDragId('BD-1')),
      input,
    );
    expect(next).toBe(input);
  });

  it('is a no-op for an unrecognised over id', () => {
    const input = buckets();
    const next = applyDragOver(
      dndId(taskDragId('BD-1')),
      dndId('garbage'),
      input,
    );
    expect(next).toBe(input);
  });
});

describe('findStatusOf', () => {
  it('returns the column of a task', () => {
    expect(findStatusOf(buckets(), 'BD-3')).toBe('in-progress');
  });

  it('returns null when the task is absent', () => {
    expect(findStatusOf(buckets(), 'BD-999')).toBeNull();
  });
});

describe('findOverlayPlacement', () => {
  it('reports the next sibling as beforeTaskId', () => {
    expect(findOverlayPlacement(buckets(), 'BD-1')).toEqual({
      status: 'todo',
      beforeTaskId: 'BD-2',
    });
  });

  it('reports null beforeTaskId for the last task in a column', () => {
    expect(findOverlayPlacement(buckets(), 'BD-2')).toEqual({
      status: 'todo',
      beforeTaskId: null,
    });
  });

  it('returns null when the task is absent', () => {
    expect(findOverlayPlacement(buckets(), 'BD-999')).toBeNull();
  });
});
