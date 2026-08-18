import { describe, expect, it } from 'vitest';
import type { Backlog, Epic, Release, Task } from './schemas.js';
import type { BoardConfig } from './schemas.js';
import {
  activeReleases,
  boardRelease,
  finishedReleases,
  futureReleases,
  sortTasksByOrder,
  unscheduledTasks,
} from './ordering.js';

const config = (extra: Partial<BoardConfig> = {}): BoardConfig => ({
  idPrefix: 'TS',
  nextId: 1,
  projectName: 'Test',
  ...extra,
});

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

  it('lists the active releases oldest first', () => {
    const twoActive = {
      releases: [release('1.12', 'current'), release('1.10', 'current'), release('1.11', 'future')],
    };
    expect(activeReleases(twoActive).map((r) => r.slug)).toEqual(['1.10', '1.12']);
  });

  it('has no active release when none is current', () => {
    expect(activeReleases({ releases: [release('x', 'future')] })).toEqual([]);
  });

  it('orders future releases oldest first', () => {
    expect(futureReleases(snapshot).map((r) => r.slug)).toEqual(['1.11', '1.12']);
  });

  it('orders finished releases newest first', () => {
    expect(finishedReleases(snapshot).map((r) => r.slug)).toEqual(['1.09', '1.08']);
  });

});

describe('boardRelease', () => {
  const twoActive = [release('1.10', 'current'), release('1.12', 'current')];

  it('shows the stored release while it is still active', () => {
    const snap = { releases: twoActive, config: config({ boardRelease: '1.12' }) };
    expect(boardRelease(snap)?.slug).toBe('1.12');
  });

  it('falls back to the first active release with no key', () => {
    expect(boardRelease({ releases: twoActive, config: config() })?.slug).toBe('1.10');
  });

  it('falls back when the stored release stopped being active', () => {
    const snap = {
      releases: [...twoActive, release('1.09', 'finished')],
      config: config({ boardRelease: '1.09' }),
    };
    expect(boardRelease(snap)?.slug).toBe('1.10');
  });

  it('falls back when the stored release is not on the board at all', () => {
    const snap = { releases: twoActive, config: config({ boardRelease: 'gone' }) };
    expect(boardRelease(snap)?.slug).toBe('1.10');
  });

  it('is undefined when nothing is active', () => {
    const snap = { releases: [release('x', 'future')], config: config({ boardRelease: 'x' }) };
    expect(boardRelease(snap)).toBeUndefined();
  });
});

describe('sortTasksByOrder', () => {
  it('puts a shuffled file into board order', () => {
    const tasks = [task('T-3', 300), task('T-1', 100), task('T-2', 200)];
    expect(sortTasksByOrder(tasks).map((t) => t.frontmatter.id)).toEqual([
      'T-1',
      'T-2',
      'T-3',
    ]);
  });

  // Equal orders are a merge artefact; they must not make the list flicker.
  it('keeps load order when two tasks share an order', () => {
    const tasks = [task('T-2', 100), task('T-1', 100), task('T-3', 50)];
    expect(sortTasksByOrder(tasks).map((t) => t.frontmatter.id)).toEqual([
      'T-3',
      'T-2',
      'T-1',
    ]);
  });
});
