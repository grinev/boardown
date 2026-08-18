import type { Epic, Release, Task } from './schemas.js';
import type { BoardSnapshot } from './loader.js';

/**
 * The board's ordering rules, in one place. The loader returns releases, epics
 * and the backlog as separately-loaded, unsorted arrays; every shell that shows
 * them has to apply the same rules, so they live here rather than in each shell.
 *
 * A task array is in the file's block order, which writes never change, so
 * sorting here is the only thing that puts tasks in board order — a reader that
 * skips it shows whatever the markdown happens to look like. Ties keep load
 * order: `Array.prototype.sort` is stable.
 */

const byOrder = (a: Task, b: Task): number =>
  a.frontmatter.order - b.frontmatter.order;

const byFilenameAsc = (a: Release, b: Release): number =>
  a.filename.localeCompare(b.filename);

export const sortTasksByOrder = (tasks: readonly Task[]): Task[] =>
  [...tasks].sort(byOrder);

/** Every release being worked on, oldest first — the same order as the future ones. */
export const activeReleases = (
  snapshot: Pick<BoardSnapshot, 'releases'>,
): Release[] =>
  snapshot.releases
    .filter((r) => r.frontmatter.status === 'current')
    .sort(byFilenameAsc);

/**
 * The one active release a board view shows: the stored choice while it is still
 * active, else the first one. Resolved on every read rather than repaired, so a
 * choice that stopped being active leaves the user's key alone.
 */
export const boardRelease = (
  snapshot: Pick<BoardSnapshot, 'releases' | 'config'>,
): Release | undefined => {
  const active = activeReleases(snapshot);
  const stored = snapshot.config.boardRelease;
  return active.find((r) => r.slug === stored) ?? active[0];
};

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
