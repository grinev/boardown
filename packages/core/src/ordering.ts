import type { Release, Task } from './schemas.js';
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
 *
 * Releases order by the name they show, never by file or load order: a name that
 * reads as a version by semver, any other after the versions with its numbers
 * compared as numbers, and the filename where two names still tie.
 */

const byOrder = (a: Task, b: Task): number =>
  a.frontmatter.order - b.frontmatter.order;

interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

const VERSION_PATTERN =
  /^[vV]?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const parseVersion = (name: string): Version | undefined => {
  const match = VERSION_PATTERN.exec(name);
  if (match === null) return undefined;
  const [, major, minor, patch, prerelease] = match;
  return {
    major: Number(major),
    minor: Number(minor ?? 0),
    patch: Number(patch ?? 0),
    prerelease: prerelease === undefined ? [] : prerelease.split('.'),
  };
};

const NUMERIC = /^\d+$/;

const compareIdentifiers = (a: string, b: string): number => {
  const aNumeric = NUMERIC.test(a);
  const bNumeric = NUMERIC.test(b);
  if (aNumeric && bNumeric) return Number(a) - Number(b);
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

// Semver precedence: a version with a suffix comes before the same version bare.
const compareVersions = (a: Version, b: Version): number => {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (core !== 0) return core;
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return b.prerelease.length - a.prerelease.length;
  }
  for (const [i, identifier] of a.prerelease.entries()) {
    const other = b.prerelease[i];
    if (other === undefined) return 1;
    const diff = compareIdentifiers(identifier, other);
    if (diff !== 0) return diff;
  }
  return a.prerelease.length - b.prerelease.length;
};

// A fixed locale rather than the host's, so a board reads in one order in every shell.
const textCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'accent' });

const compareNames = (a: string, b: string): number => {
  const aVersion = parseVersion(a);
  const bVersion = parseVersion(b);
  if (aVersion !== undefined && bVersion !== undefined) return compareVersions(aVersion, bVersion);
  if (aVersion !== undefined) return -1;
  if (bVersion !== undefined) return 1;
  return textCollator.compare(a, b);
};

const releaseName = (release: Release): string => release.frontmatter.name ?? release.slug;

const byVersionAsc = (a: Release, b: Release): number =>
  compareNames(releaseName(a), releaseName(b)) ||
  (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0);

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// A hand-written date in any other form stays on disk and counts as none.
const completionDay = (release: Release): string | undefined => {
  const day = release.frontmatter.endDate;
  return day !== undefined && DAY_PATTERN.test(day) ? day : undefined;
};

// Dates begin with the build that writes them, so a dated release is newer than
// every dateless one.
const newestFirst = (a: Release, b: Release): number => {
  const aDay = completionDay(a);
  const bDay = completionDay(b);
  if (aDay !== bDay) {
    if (aDay === undefined) return 1;
    if (bDay === undefined) return -1;
    return aDay < bDay ? 1 : -1;
  }
  return byVersionAsc(b, a);
};

export const sortTasksByOrder = (tasks: readonly Task[]): Task[] =>
  [...tasks].sort(byOrder);

/** Every release being worked on, oldest first — the same order as the future ones. */
export const activeReleases = (
  snapshot: Pick<BoardSnapshot, 'releases'>,
): Release[] =>
  snapshot.releases
    .filter((r) => r.frontmatter.status === 'current')
    .sort(byVersionAsc);

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
    .sort(byVersionAsc);

/** Finished releases, newest first: by completion date, then by version. */
export const finishedReleases = (
  snapshot: Pick<BoardSnapshot, 'releases'>,
): Release[] =>
  snapshot.releases
    .filter((r) => r.frontmatter.status === 'finished')
    .sort(newestFirst);

/** Every release, whatever its status, lowest version first. */
export const releasesByVersion = (
  snapshot: Pick<BoardSnapshot, 'releases'>,
): Release[] => [...snapshot.releases].sort(byVersionAsc);

/**
 * The Backlog as one flat list: `backlog.md`'s tasks, plus those of any old-layout
 * file the loader had to leave in place, ordered by `order`.
 */
export const unscheduledTasks = (
  snapshot: Pick<BoardSnapshot, 'backlog' | 'heldBack'>,
): Task[] =>
  sortTasksByOrder([
    ...(snapshot.backlog?.tasks ?? []),
    ...snapshot.heldBack.flatMap((b) => b.tasks),
  ]);
