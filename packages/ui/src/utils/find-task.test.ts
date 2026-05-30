import type { BoardSnapshot, Task } from '@boardown/core';
import { describe, expect, it } from 'vitest';
import { findTaskById } from './find-task';

const task = (id: string): Task => ({
  title: id,
  description: '',
  frontmatter: { id, type: 'feature', status: 'todo', order: 0 },
});

const snapshot = (over: Partial<BoardSnapshot> = {}): BoardSnapshot => ({
  config: { idPrefix: 'BD', nextId: 1, projectName: 'P' },
  releases: [
    {
      filename: 'releases/1.0.md',
      slug: '1.0',
      frontmatter: { status: 'current' },
      preamble: '',
      tasks: [task('BD-1')],
    },
  ],
  epics: [
    {
      filename: 'epics/parser.md',
      slug: 'parser',
      frontmatter: { name: 'Parser', color: '#1f6feb' },
      preamble: '',
      tasks: [task('BD-2')],
    },
  ],
  backlog: {
    filename: 'epics/no_epic.md',
    frontmatter: {},
    preamble: '',
    tasks: [task('BD-3')],
  },
  problems: [],
  ...over,
});

describe('findTaskById', () => {
  it('finds tasks in releases, epics and the backlog', () => {
    const s = snapshot();
    expect(findTaskById(s, 'BD-1')?.frontmatter.id).toBe('BD-1');
    expect(findTaskById(s, 'BD-2')?.frontmatter.id).toBe('BD-2');
    expect(findTaskById(s, 'BD-3')?.frontmatter.id).toBe('BD-3');
  });

  it('returns null for an unknown id', () => {
    expect(findTaskById(snapshot(), 'BD-999')).toBeNull();
  });

  it('tolerates a null backlog', () => {
    expect(findTaskById(snapshot({ backlog: null }), 'BD-1')?.frontmatter.id).toBe(
      'BD-1',
    );
    expect(findTaskById(snapshot({ backlog: null }), 'BD-3')).toBeNull();
  });
});
