import type { TaskStatus } from '@boardown/core';

// The board's last column, holding tasks whose status the config no longer
// declares. A declared key always starts with a letter, so this can never be
// one; it is read-only, and `applyDragOver` refuses it as a target.
export const UNKNOWN_COLUMN: TaskStatus = '*unknown';

const TASK_PREFIX = 'task:';
const COLUMN_PREFIX = 'column:';
const SECTION_PREFIX = 'section:';

export const taskDragId = (id: string): string => `${TASK_PREFIX}${id}`;
export const columnDropId = (cell: string): string =>
  `${COLUMN_PREFIX}${cell}`;
export const sectionDropId = (key: string): string =>
  `${SECTION_PREFIX}${key}`;

export const isTaskDragId = (id: string): boolean => id.startsWith(TASK_PREFIX);
export const isColumnDropId = (id: string): boolean =>
  id.startsWith(COLUMN_PREFIX);
export const isSectionDropId = (id: string): boolean =>
  id.startsWith(SECTION_PREFIX);

export const parseTaskDragId = (id: string): string =>
  id.slice(TASK_PREFIX.length);
export const parseColumnDropId = (id: string): string =>
  id.slice(COLUMN_PREFIX.length);
export const parseSectionDropId = (id: string): string =>
  id.slice(SECTION_PREFIX.length);

// A Board cell is one status inside one swimlane; with no lanes it is the status
// itself, so the ungrouped Board keeps the keys it always had. A lane key may be an
// undeclared type holding any character, while a status is a declared key or
// `UNKNOWN_COLUMN` — so the status is whatever follows the last separator.
const CELL_SEPARATOR = '\u001f';

export const boardCellKey = (lane: string | null, status: TaskStatus): string =>
  lane === null ? status : `${lane}${CELL_SEPARATOR}${status}`;

export const cellStatus = (cell: string): TaskStatus =>
  cell.slice(cell.lastIndexOf(CELL_SEPARATOR) + 1);

export const cellLane = (cell: string): string | null => {
  const at = cell.lastIndexOf(CELL_SEPARATOR);
  return at === -1 ? null : cell.slice(0, at);
};

// The cells a drag starting in `source` may not enter: every cell of another lane,
// since epic and type change only in the task dialog, and every cell of a full
// column — except the card's own column, where it is only being reordered.
export const blockedCells = (
  cells: Iterable<string>,
  source: string,
  fullStatuses: ReadonlySet<TaskStatus>,
): Set<string> => {
  const lane = cellLane(source);
  const status = cellStatus(source);
  const blocked = new Set<string>();
  for (const cell of cells) {
    if (cellLane(cell) !== lane) {
      blocked.add(cell);
      continue;
    }
    const target = cellStatus(cell);
    if (target !== status && fullStatuses.has(target)) blocked.add(cell);
  }
  return blocked;
};
