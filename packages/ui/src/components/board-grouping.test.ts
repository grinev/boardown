import { describe, expect, it } from 'vitest';
import type { Task } from '@boardown/core';
import { groupTasksByLane, groupTasksByStatus } from './BoardView';
import { UNKNOWN_COLUMN, boardCellKey } from '../dnd/ids';
import type { BoardLane } from './board-lanes';

const task = (id: string, status: string, order: number): Task => ({
  title: id,
  description: '',
  frontmatter: { id, type: 'feature', status, order },
});

describe('groupTasksByStatus', () => {
  it('seeds one bucket per declared status and sorts each by order', () => {
    const buckets = groupTasksByStatus(
      [task('BD-2', 'todo', 200), task('BD-1', 'todo', 100)],
      ['todo', 'done'],
    );
    expect([...buckets.keys()]).toEqual(['todo', 'done']);
    expect(buckets.get('todo')?.map((t) => t.frontmatter.id)).toEqual(['BD-1', 'BD-2']);
  });

  it('collects undeclared statuses into one trailing bucket, and only when used', () => {
    const declaredOnly = groupTasksByStatus([task('BD-1', 'todo', 100)], ['todo', 'done']);
    expect(declaredOnly.has(UNKNOWN_COLUMN)).toBe(false);

    const buckets = groupTasksByStatus(
      [task('BD-1', 'todo', 100), task('BD-3', 'wip', 300), task('BD-2', 'blocked', 200)],
      ['todo', 'done'],
    );
    expect(buckets.get(UNKNOWN_COLUMN)?.map((t) => t.frontmatter.id)).toEqual(['BD-2', 'BD-3']);
  });
});

describe('groupTasksByLane', () => {
  const lane = (key: string, tasks: Task[]): BoardLane => ({ key, kind: 'type', type: key, tasks });

  it('keys the status buckets of each lane by cell', () => {
    const cells = groupTasksByLane(
      [lane('a', [task('BD-2', 'todo', 200), task('BD-1', 'todo', 100)]), lane('b', [task('BD-3', 'done', 300)])],
      ['todo', 'done'],
    );
    expect([...cells.keys()]).toEqual([
      boardCellKey('a', 'todo'),
      boardCellKey('a', 'done'),
      boardCellKey('b', 'todo'),
      boardCellKey('b', 'done'),
    ]);
    expect(cells.get(boardCellKey('a', 'todo'))?.map((t) => t.frontmatter.id)).toEqual(['BD-1', 'BD-2']);
  });

  it('runs the Unknown column through every lane, and only while a task needs it', () => {
    const without = groupTasksByLane([lane('a', [task('BD-1', 'todo', 100)])], ['todo']);
    expect([...without.keys()].some((k) => k.endsWith(UNKNOWN_COLUMN))).toBe(false);

    const cells = groupTasksByLane(
      [lane('a', [task('BD-1', 'todo', 100)]), lane('b', [task('BD-2', 'wip', 200)])],
      ['todo'],
    );
    expect(cells.get(boardCellKey('a', UNKNOWN_COLUMN))).toEqual([]);
    expect(cells.get(boardCellKey('b', UNKNOWN_COLUMN))?.map((t) => t.frontmatter.id)).toEqual(['BD-2']);
  });
});
