import type { BoardSnapshot, Task } from '@boardown/core';
import { describe, expect, it } from 'vitest';
import { findReleaseOfTask } from './find-release-of-task';

const task = (id: string): Task => ({
  title: id,
  description: '',
  frontmatter: { id, type: 'feature', status: 'todo', order: 0 },
});

const snapshot: BoardSnapshot = {
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
  epics: [],
  backlog: null,
  problems: [],
};

describe('findReleaseOfTask', () => {
  it('returns the release containing the task', () => {
    expect(findReleaseOfTask(snapshot, 'BD-1')?.filename).toBe('releases/1.0.md');
  });

  it('returns undefined when no release holds the task', () => {
    expect(findReleaseOfTask(snapshot, 'BD-999')).toBeUndefined();
  });
});
