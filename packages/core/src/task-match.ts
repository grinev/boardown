import type { Task } from './schemas.js';

/**
 * The board's one text-search rule, shared by the UI's search field and the
 * CLI's `task list --text`. Two copies would drift apart on the first change.
 *
 * The result says *where* the query landed rather than just whether it did: the
 * UI groups results by it so a row whose match is invisible in the row (the
 * description) never displaces one the user can see. A caller that only asks
 * whether a task matched compares against `undefined`.
 *
 * Minimum query lengths and result caps are the caller's policy and deliberately
 * stay out of here — the CLI is a filter and must return everything it matches.
 * Notes, checklist items and custom fields are not searched.
 */
export type TaskMatchRank = 0 | 1 | 2;

export interface TaskMatchOptions {
  /**
   * Search the task's id as well as its title and description. **Off by
   * default**: an id carries the board's prefix, so on a `BD` board a query of
   * `bd` would match every task. The UI's search field turns it on — a person
   * typing `BD-72` into a search box means that task — while the CLI's `--text`
   * stays a content filter, and `task get <id>` remains the way to reach a task
   * by id there.
   */
  matchId?: boolean;
}

export const normalizeSearchQuery = (query: string): string =>
  query.trim().toLowerCase();

export const taskMatchRank = (
  task: Task,
  query: string,
  options: TaskMatchOptions = {},
): TaskMatchRank | undefined => {
  const q = normalizeSearchQuery(query);
  if (q === '') return undefined;

  if (options.matchId === true) {
    const id = task.frontmatter.id.toLowerCase();
    if (id === q) return 0;
    if (id.includes(q)) return 1;
  }
  if (task.title.toLowerCase().includes(q)) return 1;
  if (task.description.toLowerCase().includes(q)) return 2;
  return undefined;
};
