import type { Epic, Release, Task } from './schemas.js';
import type { BoardSnapshot } from './loader.js';

/**
 * The board's ordering rules, in one place. The loader returns releases, epics
 * and the backlog as separately-loaded, unsorted arrays; every shell that shows
 * them has to apply the same rules, so they live here rather than in each shell.
 */

const byOrder = (a: Task, b: Task): number =>
  a.frontmatter.order - b.frontmatter.order;

const byFilenameAsc = (a: Release, b: Release): number =>
  a.filename.localeCompare(b.filename);

export const sortTasksByOrder = (tasks: readonly Task[]): Task[] =>
  [...tasks].sort(byOrder);

export const currentRelease = (
  snapshot: Pick<BoardSnapshot, 'releases'>,
): Release | undefined =>
  snapshot.releases.find((r) => r.frontmatter.status === 'current');

export const futureReleases = (
  snapshot: Pick<BoardSnapshot, 'releases'>,
): Release[] =>
  snapshot.releases
    .filter((r) => r.frontmatter.status === 'future')
    .sort(byFilenameAsc);

/** Finished releases, newest first. */
export const finishedReleases = (
  snapshot: Pick<BoardSnapshot, 'releases'>,
): Release[] =>
  snapshot.releases
    .filter((r) => r.frontmatter.status === 'finished')
    .sort((a, b) => byFilenameAsc(b, a));

/**
 * The unscheduled backlog as a single flat list: every epic file's tasks merged
 * with `no_epic.md`'s, ordered by the globally shared `order` key.
 */
export const unscheduledTasks = (
  snapshot: Pick<BoardSnapshot, 'epics' | 'backlog'>,
): Task[] =>
  sortTasksByOrder([
    ...snapshot.epics.flatMap((e: Epic) => e.tasks),
    ...(snapshot.backlog?.tasks ?? []),
  ]);
