import { describe, expect, it } from 'vitest';
import type { Backlog, Release, Task } from './schemas.js';
import type { BoardConfig } from './schemas.js';
import {
  activeReleases,
  boardRelease,
  finishedReleases,
  futureReleases,
  releasesByVersion,
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

const backlog = (tasks: Task[], filename = 'backlog.md'): Backlog => ({
  filename,
  frontmatter: {},
  preamble: '',
  tasks,
});

const release = (
  slug: string,
  status: Release['frontmatter']['status'],
  extra: Partial<Release['frontmatter']> = {},
): Release => ({
  filename: `releases/${slug}.md`,
  slug,
  frontmatter: { status, name: slug, ...extra },
  preamble: '',
  tasks: [],
});

const slugsByVersion = (...slugs: string[]): string[] =>
  releasesByVersion({ releases: slugs.map((s) => release(s, 'future')) }).map((r) => r.slug);

describe('unscheduledTasks', () => {
  it('merges backlog.md with the files held back in the old layout and orders globally', () => {
    const snapshot = {
      backlog: backlog([task('N-1', 200)]),
      heldBack: [backlog([task('A-1', 300)], 'epics/alpha.md'), backlog([task('B-1', 100)], 'epics/beta.md')],
    };
    expect(unscheduledTasks(snapshot).map((t) => t.frontmatter.id)).toEqual(['B-1', 'N-1', 'A-1']);
  });

  it('works with no backlog file at all', () => {
    const snapshot = { backlog: null, heldBack: [backlog([task('A-1', 1)], 'epics/alpha.md')] };
    expect(unscheduledTasks(snapshot).map((t) => t.frontmatter.id)).toEqual(['A-1']);
  });

  it('is empty when there is nothing unscheduled', () => {
    expect(unscheduledTasks({ backlog: null, heldBack: [] })).toEqual([]);
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

  it('compares the numbers of a version as numbers', () => {
    const board = {
      releases: [
        release('v0.10.0', 'future'),
        release('v0.11.0', 'future'),
        release('v0.3.0', 'future'),
        release('v0.9.0', 'future'),
      ],
    };
    expect(futureReleases(board).map((r) => r.slug)).toEqual([
      'v0.3.0',
      'v0.9.0',
      'v0.10.0',
      'v0.11.0',
    ]);
  });
});

describe('releasesByVersion', () => {
  it('lists every release lowest version first, whatever its status', () => {
    const board = {
      releases: [
        release('v0.10.2', 'current'),
        release('v0.1.0', 'finished'),
        release('v0.9.2', 'future'),
      ],
    };
    expect(releasesByVersion(board).map((r) => r.slug)).toEqual(['v0.1.0', 'v0.9.2', 'v0.10.2']);
  });

  it('orders a suffixed version before its bare one, by semver', () => {
    expect(slugsByVersion('v1.0.0', 'v1.0.0-rc.1', 'v1.0.0-beta', 'v1.0.0-rc.10', 'v1.0.0-rc')).toEqual(
      ['v1.0.0-beta', 'v1.0.0-rc', 'v1.0.0-rc.1', 'v1.0.0-rc.10', 'v1.0.0'],
    );
  });

  it('reads one to three numbers, with or without a v of either case', () => {
    expect(slugsByVersion('2', 'V1.5', 'v1.10', '1.2.3')).toEqual(['1.2.3', 'V1.5', 'v1.10', '2']);
  });

  it('falls back to the filename when two versions are equal', () => {
    expect(slugsByVersion('v0.10', 'v0.10.0')).toEqual(['v0.10.0', 'v0.10']);
  });

  it('puts versions before other names, which compare with their numbers as numbers', () => {
    expect(slugsByVersion('Sprint 10', 'alpha', 'v0.2.0', 'sprint 2', '1.2.3.4')).toEqual([
      'v0.2.0',
      '1.2.3.4',
      'alpha',
      'sprint 2',
      'Sprint 10',
    ]);
  });

  it('ignores case in other names and falls back to the filename', () => {
    expect(slugsByVersion('sprint-b', 'Sprint-B', 'sprint-a')).toEqual([
      'sprint-a',
      'Sprint-B',
      'sprint-b',
    ]);
  });

  it('sorts by the name a release shows, not its slug', () => {
    const board = {
      releases: [
        release('a', 'future', { name: 'v0.10.0' }),
        release('b', 'future', { name: 'v0.9.0' }),
        release('c', 'future', { name: undefined }),
      ],
    };
    expect(releasesByVersion(board).map((r) => r.slug)).toEqual(['b', 'a', 'c']);
  });
});

describe('finishedReleases', () => {
  const finished = (slug: string, endDate?: string): Release =>
    release(slug, 'finished', endDate === undefined ? {} : { endDate });

  it('puts dated releases newest first, above the dateless ones by version', () => {
    const board = {
      releases: [
        finished('v0.9.0'),
        finished('v0.12.0', '2026-10-01'),
        finished('v0.10.0'),
        finished('v0.13.0', '2026-11-15'),
        finished('v0.2.0'),
      ],
    };
    expect(finishedReleases(board).map((r) => r.slug)).toEqual([
      'v0.13.0',
      'v0.12.0',
      'v0.10.0',
      'v0.9.0',
      'v0.2.0',
    ]);
  });

  it('breaks a same-day tie by version, highest first', () => {
    const board = {
      releases: [finished('v0.9.1', '2026-10-01'), finished('v0.10.1', '2026-10-01')],
    };
    expect(finishedReleases(board).map((r) => r.slug)).toEqual(['v0.10.1', 'v0.9.1']);
  });

  it('trusts a date over the version number', () => {
    const board = {
      releases: [finished('v2.0.0', '2026-01-01'), finished('v1.5.0', '2026-03-01')],
    };
    expect(finishedReleases(board).map((r) => r.slug)).toEqual(['v1.5.0', 'v2.0.0']);
  });

  it('counts a date not written as YYYY-MM-DD as none', () => {
    const board = {
      releases: [
        finished('v0.5.0', 'next week'),
        finished('v0.4.0', '2026-1-5'),
        finished('v0.1.0', '2026-01-05'),
      ],
    };
    expect(finishedReleases(board).map((r) => r.slug)).toEqual(['v0.1.0', 'v0.5.0', 'v0.4.0']);
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

  it('falls back to the lowest version, not the first name as a string', () => {
    const releases = [release('v0.10.2', 'current'), release('v0.9.2', 'current')];
    expect(boardRelease({ releases, config: config() })?.slug).toBe('v0.9.2');
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
