import type { Active, Over } from '@dnd-kit/core';
import type { Task } from '@boardown/core';
import { describe, expect, it } from 'vitest';
import {
  BACKLOG_SECTION_KEY,
  applyDragOverBacklog,
  findBacklogPlacement,
  type SectionBuckets,
} from './applyDragOverBacklog';
import { sectionDropId, taskDragId } from './ids';

const task = (id: string): Task => ({
  title: id,
  description: '',
  frontmatter: { id, type: 'feature', status: 'todo', order: 0 },
});

const dndId = (id: string): Active & Over => ({ id }) as unknown as Active & Over;

const ids = (tasks: Task[] | undefined): string[] =>
  (tasks ?? []).map((t) => t.frontmatter.id);

const buckets = (): SectionBuckets =>
  new Map<string, Task[]>([
    ['releases/1.0.md', [task('BD-1'), task('BD-2')]],
    [BACKLOG_SECTION_KEY, [task('BD-3')]],
  ]);

describe('applyDragOverBacklog', () => {
  it('reorders within a section when dropped on a task', () => {
    const next = applyDragOverBacklog(
      dndId(taskDragId('BD-1')),
      dndId(taskDragId('BD-2')),
      buckets(),
    );
    expect(ids(next.get('releases/1.0.md'))).toEqual(['BD-2', 'BD-1']);
  });

  it('moves a task into another section, before the target task', () => {
    const next = applyDragOverBacklog(
      dndId(taskDragId('BD-3')),
      dndId(taskDragId('BD-1')),
      buckets(),
    );
    expect(ids(next.get(BACKLOG_SECTION_KEY))).toEqual([]);
    expect(ids(next.get('releases/1.0.md'))).toEqual(['BD-3', 'BD-1', 'BD-2']);
  });

  it('appends to a section when dropped on its container', () => {
    const next = applyDragOverBacklog(
      dndId(taskDragId('BD-1')),
      dndId(sectionDropId(BACKLOG_SECTION_KEY)),
      buckets(),
    );
    expect(ids(next.get('releases/1.0.md'))).toEqual(['BD-2']);
    expect(ids(next.get(BACKLOG_SECTION_KEY))).toEqual(['BD-3', 'BD-1']);
  });

  it('is a no-op when active equals over', () => {
    const input = buckets();
    expect(
      applyDragOverBacklog(
        dndId(taskDragId('BD-1')),
        dndId(taskDragId('BD-1')),
        input,
      ),
    ).toBe(input);
  });
});

describe('findBacklogPlacement', () => {
  it('reports the next sibling as beforeTaskId', () => {
    expect(findBacklogPlacement(buckets(), 'BD-1')).toEqual({
      sectionKey: 'releases/1.0.md',
      beforeTaskId: 'BD-2',
    });
  });

  it('reports null beforeTaskId for the last task in a section', () => {
    expect(findBacklogPlacement(buckets(), 'BD-3')).toEqual({
      sectionKey: BACKLOG_SECTION_KEY,
      beforeTaskId: null,
    });
  });

  it('returns null when the task is absent', () => {
    expect(findBacklogPlacement(buckets(), 'BD-999')).toBeNull();
  });
});
