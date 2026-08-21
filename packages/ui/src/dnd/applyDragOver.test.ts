import type { Active, Over } from '@dnd-kit/core';
import type { Task, TaskStatus } from '@boardown/core';
import { describe, expect, it } from 'vitest';
import {
  applyDragOver,
  findOverlayPlacement,
  findStatusOf,
} from './applyDragOver';
import { UNKNOWN_COLUMN, columnDropId, taskDragId } from './ids';

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

  it('refuses a blocked column, whether hovered on its container or on a card in it', () => {
    const start = buckets();
    for (const over of [columnDropId('in-progress'), taskDragId('BD-3')]) {
      expect(
        applyDragOver(dndId(taskDragId('BD-1')), dndId(over), start, new Set(['in-progress'])),
      ).toBe(start);
    }
  });

  it('still reorders inside the blocked column, since nothing enters it', () => {
    const start = new Map<TaskStatus, Task[]>([
      ['todo', []],
      ['in-progress', [task('BD-3'), task('BD-4')]],
      ['done', []],
    ]);
    const next = applyDragOver(
      dndId(taskDragId('BD-4')),
      dndId(taskDragId('BD-3')),
      start,
      new Set(['in-progress']),
    );
    expect(ids(next.get('in-progress'))).toEqual(['BD-4', 'BD-3']);
  });

  it('still lets a task leave the blocked column', () => {
    const next = applyDragOver(
      dndId(taskDragId('BD-3')),
      dndId(columnDropId('done')),
      buckets(),
      new Set(['in-progress']),
    );
    expect(ids(next.get('in-progress'))).toEqual([]);
    expect(ids(next.get('done'))).toEqual(['BD-3']);
  });

  it('refuses the Unknown column as a target, but lets a task leave it', () => {
    const start = new Map<TaskStatus, Task[]>([
      ['todo', [task('BD-1')]],
      [UNKNOWN_COLUMN, [task('BD-9')]],
    ]);
    for (const over of [columnDropId(UNKNOWN_COLUMN), taskDragId('BD-9')]) {
      expect(applyDragOver(dndId(taskDragId('BD-1')), dndId(over), start)).toBe(start);
    }
    const left = applyDragOver(
      dndId(taskDragId('BD-9')),
      dndId(columnDropId('todo')),
      start,
    );
    expect(ids(left.get(UNKNOWN_COLUMN))).toEqual([]);
    expect(ids(left.get('todo'))).toEqual(['BD-1', 'BD-9']);
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
