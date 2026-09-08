import { effectiveTaskPriority, type Task } from './schemas.js';

/**
 * The board's one structured-filter rule, shared by the Backlog filter bar and
 * `task list`. Two copies would drift on the first change to OR-within / AND-across.
 *
 * Epic membership is a fact the caller already resolved: the UI matches a tag
 * (and `No epic`), the CLI matches the epic's member set. An omitted or empty
 * selection skips that dimension.
 */
export interface TaskFilterSelection {
  statuses?: readonly string[];
  types?: readonly string[];
  priorities?: readonly string[];
  epicMatches?: boolean;
}

const isActive = (values: readonly string[] | undefined): values is readonly string[] =>
  values !== undefined && values.length > 0;

export const taskMatchesFilters = (task: Task, selection: TaskFilterSelection): boolean => {
  if (isActive(selection.statuses) && !selection.statuses.includes(task.frontmatter.status)) {
    return false;
  }
  if (isActive(selection.types) && !selection.types.includes(task.frontmatter.type)) {
    return false;
  }
  if (
    isActive(selection.priorities) &&
    !selection.priorities.includes(effectiveTaskPriority(task.frontmatter))
  ) {
    return false;
  }
  if (selection.epicMatches === false) return false;
  return true;
};
