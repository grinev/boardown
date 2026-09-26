import type { BoardSnapshot, Task } from '@boardown/core';
import { emptyDocsTree } from '@boardown/core';
import { describe, expect, it } from 'vitest';
import { findTasksByEpic } from './find-tasks-by-epic';

const task = (id: string, epic?: string): Task => ({
  title: id,
  description: '',
  frontmatter: {
    id,
    type: 'feature',
    status: 'todo',
    order: 0,
    ...(epic !== undefined ? { epic } : {}),
  },
});

const snapshot: BoardSnapshot = {
  config: { idPrefix: 'BD', nextId: 1, projectName: 'P' },
  releases: [
    {
      filename: 'releases/1.0.md',
      slug: '1.0',
      frontmatter: { status: 'current' },
      preamble: '',
      // BD-10 and BD-2 belong to parser; BD-5 belongs to another epic.
      tasks: [task('BD-10', 'parser'), task('BD-2', 'parser'), task('BD-5', 'dnd')],
    },
  ],
  epics: [
    {
      filename: 'epics/parser.md',
      slug: 'parser',
      frontmatter: { name: 'Parser', color: '#1f6feb' },
      preamble: '',
    },
  ],
  backlog: {
    filename: 'backlog.md',
    frontmatter: {},
    preamble: '',
    // BD-1 names the epic in its own key; BD-3 names none.
    tasks: [task('BD-1', 'parser'), task('BD-3')],
  },
  heldBack: [
    {
      filename: 'epics/parser.md',
      frontmatter: {},
      preamble: '',
      tasks: [task('BD-7', 'parser')],
    },
  ],
  docs: emptyDocsTree(),
  problems: [],
};

describe('findTasksByEpic', () => {
  it('collects tasks of an epic by their own key, from releases and the backlog', () => {
    const ids = findTasksByEpic(snapshot, 'parser').map((t) => t.frontmatter.id);
    expect(ids).toEqual(['BD-1', 'BD-2', 'BD-7', 'BD-10']);
  });

  it('leaves out a backlog task that names no epic', () => {
    const ids = findTasksByEpic(snapshot, 'parser').map((t) => t.frontmatter.id);
    expect(ids).not.toContain('BD-3');
  });

  it('sorts by the numeric id suffix, not lexicographically', () => {
    const ids = findTasksByEpic(snapshot, 'parser').map((t) => t.frontmatter.id);
    expect(ids.indexOf('BD-2')).toBeLessThan(ids.indexOf('BD-10'));
  });

  it('returns an empty list for an epic with no tasks', () => {
    expect(findTasksByEpic(snapshot, 'unknown')).toEqual([]);
  });
});
