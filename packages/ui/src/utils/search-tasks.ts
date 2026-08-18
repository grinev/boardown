import {
  activeReleases,
  finishedReleases,
  futureReleases,
  normalizeSearchQuery,
  sortTasksByOrder,
  taskMatchRank,
  unscheduledTasks,
  type BoardSnapshot,
  type Task,
} from '@boardown/core';

/** Short queries match half the board, so the list stays shut until there are
 *  enough characters to mean something. */
export const SEARCH_MIN_QUERY = 3;
export const SEARCH_MAX_RESULTS = 10;

export const isSearchable = (query: string): boolean =>
  normalizeSearchQuery(query).length >= SEARCH_MIN_QUERY;

/** Every task on the board in reading order: the active releases, future
 *  releases, the unscheduled backlog, then the archive. */
const boardTasks = (snapshot: BoardSnapshot): Task[] => {
  return [
    ...activeReleases(snapshot).flatMap((r) => sortTasksByOrder(r.tasks)),
    ...futureReleases(snapshot).flatMap((r) => sortTasksByOrder(r.tasks)),
    ...unscheduledTasks(snapshot),
    ...finishedReleases(snapshot).flatMap((r) => sortTasksByOrder(r.tasks)),
  ];
};

export const searchTasks = (snapshot: BoardSnapshot | null, query: string): Task[] => {
  if (snapshot === null || !isSearchable(query)) return [];

  const ranked: { task: Task; rank: number }[] = [];
  for (const task of boardTasks(snapshot)) {
    // The field is where a person types "BD-72" meaning that task, so unlike the
    // CLI's content filter it searches the id too.
    const rank = taskMatchRank(task, query, { matchId: true });
    if (rank !== undefined) ranked.push({ task, rank });
  }

  // Stable, so board order survives inside each rank.
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, SEARCH_MAX_RESULTS)
    .map((entry) => entry.task);
};
