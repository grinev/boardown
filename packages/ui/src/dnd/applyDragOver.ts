import type { Active, Over } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { Task, TaskStatus } from '@boardown/core';
import {
  UNKNOWN_COLUMN,
  cellStatus,
  isColumnDropId,
  isTaskDragId,
  parseColumnDropId,
  parseTaskDragId,
} from './ids';

// Buckets are keyed by Board cell (see `boardCellKey`): a status, or a status
// inside a swimlane.
export const applyDragOver = (
  active: Active,
  over: Over,
  buckets: Map<string, Task[]>,
  // Disabling a column's droppable is not enough: the cards inside it are drop
  // nodes of their own, so hovering one would still resolve to that column.
  blockedCells: ReadonlySet<string> = new Set(),
): Map<string, Task[]> => {
  const activeId = String(active.id);
  const overId = String(over.id);
  if (!isTaskDragId(activeId)) return buckets;
  if (activeId === overId) return buckets;
  const taskId = parseTaskDragId(activeId);

  const activeCell = findCellOf(buckets, taskId);
  if (activeCell === null) return buckets;

  let targetCell: string;
  let overTaskId: string | null;

  if (isTaskDragId(overId)) {
    overTaskId = parseTaskDragId(overId);
    const cell = findCellOf(buckets, overTaskId);
    if (cell === null) return buckets;
    targetCell = cell;
  } else if (isColumnDropId(overId)) {
    targetCell = parseColumnDropId(overId);
    overTaskId = null;
  } else {
    return buckets;
  }

  // The Unknown column is read-only in both directions of a drop: nothing lands
  // in it, and nothing is reordered inside it.
  if (cellStatus(targetCell) === UNKNOWN_COLUMN) return buckets;
  if (blockedCells.has(targetCell) && targetCell !== activeCell) return buckets;

  if (targetCell === activeCell) {
    if (overTaskId === null) return buckets;
    const tasks = buckets.get(activeCell) ?? [];
    const fromIdx = tasks.findIndex((t) => t.frontmatter.id === taskId);
    const toIdx = tasks.findIndex((t) => t.frontmatter.id === overTaskId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return buckets;
    const next = new Map(buckets);
    next.set(activeCell, arrayMove(tasks, fromIdx, toIdx));
    return next;
  }

  const sourceTasks = buckets.get(activeCell) ?? [];
  const activeTask = sourceTasks.find((t) => t.frontmatter.id === taskId);
  if (!activeTask) return buckets;

  const next = new Map(buckets);
  next.set(
    activeCell,
    sourceTasks.filter((t) => t.frontmatter.id !== taskId),
  );

  const destTasks = [...(buckets.get(targetCell) ?? [])];
  if (overTaskId === null) {
    destTasks.push(activeTask);
  } else {
    const idx = destTasks.findIndex((t) => t.frontmatter.id === overTaskId);
    if (idx === -1) destTasks.push(activeTask);
    else destTasks.splice(idx, 0, activeTask);
  }
  next.set(targetCell, destTasks);

  return next;
};

export const findCellOf = (
  buckets: Map<string, Task[]>,
  taskId: string,
): string | null => {
  for (const [cell, tasks] of buckets) {
    if (tasks.some((t) => t.frontmatter.id === taskId)) return cell;
  }
  return null;
};

export const findOverlayPlacement = (
  buckets: Map<string, Task[]>,
  taskId: string,
): { status: TaskStatus; beforeTaskId: string | null } | null => {
  for (const [cell, tasks] of buckets) {
    const idx = tasks.findIndex((t) => t.frontmatter.id === taskId);
    if (idx !== -1) {
      return {
        status: cellStatus(cell),
        beforeTaskId: tasks[idx + 1]?.frontmatter.id ?? null,
      };
    }
  }
  return null;
};
