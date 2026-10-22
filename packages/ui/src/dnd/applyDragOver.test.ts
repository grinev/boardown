import type { Active, Over } from '@dnd-kit/core';
import type { Task, TaskStatus } from '@boardown/core';
import { describe, expect, it } from 'vitest';
import {
  applyDragOver,
  findCellOf,
  findOverlayPlacement,
} from './applyDragOver';
import { UNKNOWN_COLUMN, boardCellKey, columnDropId, taskDragId } from './ids';

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

describe('findCellOf', () => {
  it('returns the column of a task', () => {
    expect(findCellOf(buckets(), 'BD-3')).toBe('in-progress');
  });

  it('returns null when the task is absent', () => {
    expect(findCellOf(buckets(), 'BD-999')).toBeNull();
  });
});

describe('applyDragOver across swimlanes', () => {
  const cell = boardCellKey;
  const laned = (): Map<string, Task[]> =>
    new Map<string, Task[]>([
      [cell('epic:a', 'todo'), [task('BD-1'), task('BD-2')]],
      [cell('epic:a', 'done'), []],
      [cell('epic:b', 'todo'), [task('BD-3')]],
      [cell('epic:b', 'done'), []],
      [cell('epic:b', UNKNOWN_COLUMN), [task('BD-9')]],
    ]);

  it('moves a card to another column of its own lane', () => {
    const next = applyDragOver(
      dndId(taskDragId('BD-1')),
      dndId(columnDropId(cell('epic:a', 'done'))),
      laned(),
    );
    expect(ids(next.get(cell('epic:a', 'done')))).toEqual(['BD-1']);
  });

  it('reorders inside a cell', () => {
    const next = applyDragOver(dndId(taskDragId('BD-2')), dndId(taskDragId('BD-1')), laned());
    expect(ids(next.get(cell('epic:a', 'todo')))).toEqual(['BD-2', 'BD-1']);
  });

  it('refuses a blocked cell of another lane, on the cell and on a card in it', () => {
    const start = laned();
    const blocked = new Set([cell('epic:b', 'todo'), cell('epic:b', 'done')]);
    for (const over of [columnDropId(cell('epic:b', 'done')), taskDragId('BD-3')]) {
      expect(applyDragOver(dndId(taskDragId('BD-1')), dndId(over), start, blocked)).toBe(start);
    }
  });

  it('refuses the Unknown cell of a lane', () => {
    const start = laned();
    expect(
      applyDragOver(dndId(taskDragId('BD-3')), dndId(taskDragId('BD-9')), start),
    ).toBe(start);
  });

  it('reports the status of the cell as the placement', () => {
    expect(findOverlayPlacement(laned(), 'BD-1')).toEqual({
      status: 'todo',
      beforeTaskId: 'BD-2',
    });
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
