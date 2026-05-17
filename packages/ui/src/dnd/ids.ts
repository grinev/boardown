import type { TaskStatus } from '@boardown/core';

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
  id.slice(COLUMN_PREFIX.length) as TaskStatus;
export const parseSectionDropId = (id: string): string =>
  id.slice(SECTION_PREFIX.length);
