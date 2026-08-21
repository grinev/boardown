import { describe, expect, it } from 'vitest';
import type { Task } from '@boardown/core';
import { groupTasksByStatus } from './BoardView';
import { UNKNOWN_COLUMN } from '../dnd/ids';

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
