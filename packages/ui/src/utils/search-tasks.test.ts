import type { BoardSnapshot, Release, Task } from '@boardown/core';
import { emptyDocsTree } from '@boardown/core';
import { describe, expect, it } from 'vitest';
import { isSearchable, searchTasks } from './search-tasks';

const task = (id: string, title: string, description = '', order = 100): Task => ({
  title,
  description,
  frontmatter: { id, type: 'feature', status: 'todo', order },
});

const release = (
  slug: string,
  status: Release['frontmatter']['status'],
  tasks: Task[],
): Release => ({
  filename: `releases/${slug}.md`,
  slug,
  frontmatter: { status },
  preamble: '',
  tasks,
});

const snapshotOf = (over: Partial<BoardSnapshot> = {}): BoardSnapshot => ({
  config: { idPrefix: 'BD', nextId: 1, projectName: 'P' },
  releases: [],
  epics: [],
  backlog: null,
  docs: emptyDocsTree(),
  problems: [],
  ...over,
});

const ids = (tasks: Task[]): string[] => tasks.map((t) => t.frontmatter.id);

describe('isSearchable', () => {
  it('is false below three characters and true at three', () => {
    expect(isSearchable('ab')).toBe(false);
    expect(isSearchable('abc')).toBe(true);
  });

  it('counts the trimmed query', () => {
    expect(isSearchable('  ab  ')).toBe(false);
    expect(isSearchable('  abc ')).toBe(true);
    expect(isSearchable('   ')).toBe(false);
  });
});

describe('searchTasks', () => {
  it('returns nothing below the minimum query length', () => {
    const snapshot = snapshotOf({
      releases: [release('1.0', 'current', [task('BD-1', 'drag')])],
    });
    expect(searchTasks(snapshot, 'dr')).toEqual([]);
  });

  it('returns nothing without a board', () => {
    expect(searchTasks(null, 'drag')).toEqual([]);
  });

  it('lists title matches before description-only matches', () => {
    const snapshot = snapshotOf({
      releases: [
        release('1.0', 'current', [
          task('BD-1', 'Card polish', 'the drag handle jumps'),
          task('BD-2', 'Drag & drop sensors', '', 200),
        ]),
      ],
    });
    expect(ids(searchTasks(snapshot, 'drag'))).toEqual(['BD-2', 'BD-1']);
  });

  it('puts an exact id match first', () => {
    const snapshot = snapshotOf({
      releases: [
        release('1.0', 'current', [
          task('BD-10', 'Mentions BD-1 in the title'),
          task('BD-1', 'Something else', '', 200),
        ]),
      ],
    });
    expect(ids(searchTasks(snapshot, 'BD-1'))).toEqual(['BD-1', 'BD-10']);
  });

  it('walks the board in reading order inside a rank', () => {
    const snapshot = snapshotOf({
      releases: [
        release('2.0', 'future', [task('BD-2', 'drag two')]),
        release('1.0', 'current', [task('BD-1', 'drag one')]),
        release('0.9', 'finished', [task('BD-9', 'drag nine')]),
      ],
      epics: [
        {
          filename: 'epics/ui.md',
          slug: 'ui',
          frontmatter: { name: 'UI', color: '#1f6feb' },
          preamble: '',
          tasks: [task('BD-3', 'drag three')],
        },
      ],
    });
    expect(ids(searchTasks(snapshot, 'drag'))).toEqual(['BD-1', 'BD-2', 'BD-3', 'BD-9']);
  });

  it('sorts a release by order, not by block order', () => {
    const snapshot = snapshotOf({
      releases: [
        release('1.0', 'current', [
          task('BD-2', 'drag two', '', 200),
          task('BD-1', 'drag one', '', 100),
        ]),
      ],
    });
    expect(ids(searchTasks(snapshot, 'drag'))).toEqual(['BD-1', 'BD-2']);
  });

  it('includes archived tasks, ordered last', () => {
    const snapshot = snapshotOf({
      releases: [
        release('0.9', 'finished', [task('BD-9', 'drag nine')]),
        release('1.0', 'current', [task('BD-1', 'drag one')]),
      ],
    });
    expect(ids(searchTasks(snapshot, 'drag'))).toEqual(['BD-1', 'BD-9']);
  });

  it('caps the result at ten', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      task(`BD-${i + 1}`, `drag ${i + 1}`, '', (i + 1) * 100),
    );
    const snapshot = snapshotOf({ releases: [release('1.0', 'current', many)] });
    const found = searchTasks(snapshot, 'drag');
    expect(found).toHaveLength(10);
    expect(ids(found)[0]).toBe('BD-1');
  });

  it('returns nothing on an empty board', () => {
    expect(searchTasks(snapshotOf(), 'drag')).toEqual([]);
  });
});
