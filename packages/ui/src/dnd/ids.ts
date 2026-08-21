import type { TaskStatus } from '@boardown/core';

// The board's last column, holding tasks whose status the config no longer
// declares. A declared key always starts with a letter, so this can never be
// one; it is read-only, and `applyDragOver` refuses it as a target.
export const UNKNOWN_COLUMN: TaskStatus = '*unknown';

const TASK_PREFIX = 'task:';
const COLUMN_PREFIX = 'column:';
const SECTION_PREFIX = 'section:';

export const taskDragId = (id: string): string => `${TASK_PREFIX}${id}`;
export const columnDropId = (status: TaskStatus): string =>
  `${COLUMN_PREFIX}${status}`;
export const sectionDropId = (key: string): string =>
  `${SECTION_PREFIX}${key}`;

export const isTaskDragId = (id: string): boolean => id.startsWith(TASK_PREFIX);
export const isColumnDropId = (id: string): boolean =>
  id.startsWith(COLUMN_PREFIX);
export const isSectionDropId = (id: string): boolean =>
  id.startsWith(SECTION_PREFIX);

export const parseTaskDragId = (id: string): string =>
  id.slice(TASK_PREFIX.length);
export const parseColumnDropId = (id: string): TaskStatus =>
  id.slice(COLUMN_PREFIX.length);
export const parseSectionDropId = (id: string): string =>
  id.slice(SECTION_PREFIX.length);
