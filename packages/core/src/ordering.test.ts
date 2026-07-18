import { describe, expect, it } from 'vitest';
import type { Backlog, Epic, Release, Task } from './schemas.js';
import { finishedReleases, futureReleases, currentRelease, unscheduledTasks } from './ordering.js';

const task = (id: string, order: number): Task => ({
  title: id,
  description: '',
  frontmatter: { id, type: 'feature', status: 'todo', order },
});

const epic = (slug: string, tasks: Task[]): Epic => ({
  filename: `epics/${slug}.md`,
  slug,
  frontmatter: { name: slug, color: '#888888' },
  preamble: '',
  tasks,
});

const backlog = (tasks: Task[]): Backlog => ({
  filename: 'epics/no_epic.md',
  frontmatter: {},
  preamble: '',
  tasks,
});

const release = (slug: string, status: Release['frontmatter']['status']): Release => ({
  filename: `releases/${slug}.md`,
  slug,
  frontmatter: { status, name: slug },
  preamble: '',
  tasks: [],
});

describe('unscheduledTasks', () => {
  it('merges every epic file with no_epic.md and orders globally', () => {
    const snapshot = {
      epics: [epic('alpha', [task('A-1', 300)]), epic('beta', [task('B-1', 100)])],
      backlog: backlog([task('N-1', 200)]),
    };
    expect(unscheduledTasks(snapshot).map((t) => t.frontmatter.id)).toEqual(['B-1', 'N-1', 'A-1']);
  });

  it('works with no backlog file at all', () => {
    const snapshot = { epics: [epic('alpha', [task('A-1', 1)])], backlog: null };
    expect(unscheduledTasks(snapshot).map((t) => t.frontmatter.id)).toEqual(['A-1']);
  });

  it('is empty when there is nothing unscheduled', () => {
    expect(unscheduledTasks({ epics: [], backlog: null })).toEqual([]);
  });
});

describe('release ordering', () => {
  const snapshot = {
    releases: [
      release('1.09', 'finished'),
      release('1.12', 'future'),
      release('1.10', 'current'),
      release('1.11', 'future'),
      release('1.08', 'finished'),
    ],
  };

  it('finds the one current release', () => {
    expect(currentRelease(snapshot)?.slug).toBe('1.10');
  });

  it('orders future releases oldest first', () => {
    expect(futureReleases(snapshot).map((r) => r.slug)).toEqual(['1.11', '1.12']);
  });

  it('orders finished releases newest first', () => {
    expect(finishedReleases(snapshot).map((r) => r.slug)).toEqual(['1.09', '1.08']);
  });

  it('has no current release when none is current', () => {
    expect(currentRelease({ releases: [release('x', 'future')] })).toBeUndefined();
  });
});
