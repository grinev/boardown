import type { Active, Over } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { Task, TaskStatus } from '@boardown/core';
import {
  isColumnDropId,
  isTaskDragId,
  parseColumnDropId,
  parseTaskDragId,
} from './ids';

export const applyDragOver = (
  active: Active,
  over: Over,
  buckets: Map<TaskStatus, Task[]>,
): Map<TaskStatus, Task[]> => {
  const activeId = String(active.id);
  const overId = String(over.id);
  if (!isTaskDragId(activeId)) return buckets;
  if (activeId === overId) return buckets;
  const taskId = parseTaskDragId(activeId);

  const activeStatus = findStatusOf(buckets, taskId);
  if (activeStatus === null) return buckets;

  let targetStatus: TaskStatus;
  let overTaskId: string | null;

  if (isTaskDragId(overId)) {
    overTaskId = parseTaskDragId(overId);
    const status = findStatusOf(buckets, overTaskId);
    if (status === null) return buckets;
    targetStatus = status;
  } else if (isColumnDropId(overId)) {
    targetStatus = parseColumnDropId(overId);
    overTaskId = null;
  } else {
    return buckets;
  }

  if (targetStatus === activeStatus) {
    if (overTaskId === null) return buckets;
    const tasks = buckets.get(activeStatus) ?? [];
    const fromIdx = tasks.findIndex((t) => t.frontmatter.id === taskId);
    const toIdx = tasks.findIndex((t) => t.frontmatter.id === overTaskId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return buckets;
    const next = new Map(buckets);
    next.set(activeStatus, arrayMove(tasks, fromIdx, toIdx));
    return next;
  }

  const sourceTasks = buckets.get(activeStatus) ?? [];
  const activeTask = sourceTasks.find((t) => t.frontmatter.id === taskId);
  if (!activeTask) return buckets;

  const next = new Map(buckets);
  next.set(
    activeStatus,
    sourceTasks.filter((t) => t.frontmatter.id !== taskId),
  );

  const destTasks = [...(buckets.get(targetStatus) ?? [])];
  if (overTaskId === null) {
    destTasks.push(activeTask);
  } else {
    const idx = destTasks.findIndex((t) => t.frontmatter.id === overTaskId);
    if (idx === -1) destTasks.push(activeTask);
    else destTasks.splice(idx, 0, activeTask);
  }
  next.set(targetStatus, destTasks);

  return next;
};

export const findStatusOf = (
  buckets: Map<TaskStatus, Task[]>,
  taskId: string,
): TaskStatus | null => {
  for (const [s, tasks] of buckets) {
    if (tasks.some((t) => t.frontmatter.id === taskId)) return s;
  }
  return null;
};

export const findOverlayPlacement = (
  buckets: Map<TaskStatus, Task[]>,
  taskId: string,
): { status: TaskStatus; beforeTaskId: string | null } | null => {
  for (const [s, tasks] of buckets) {
    const idx = tasks.findIndex((t) => t.frontmatter.id === taskId);
    if (idx !== -1) {
      return {
        status: s,
        beforeTaskId: tasks[idx + 1]?.frontmatter.id ?? null,
      };
    }
  }
  return null;
};
