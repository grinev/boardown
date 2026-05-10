import type { Active, Over } from '@dnd-kit/core';
import type { Task, TaskStatus } from '@boardown/core';
import { isTaskDragId, parseTaskDragId } from './ids';

export const applyCrossColumnDragOver = (
  active: Active,
  over: Over,
  buckets: Map<TaskStatus, Task[]>,
): Map<TaskStatus, Task[]> => {
  const activeId = String(active.id);
  const overId = String(over.id);
  if (!isTaskDragId(activeId)) return buckets;
  if (activeId === overId) return buckets;
  const taskId = parseTaskDragId(activeId);

  let activeStatus: TaskStatus | null = null;
  for (const [s, tasks] of buckets) {
    if (tasks.some((t) => t.frontmatter.id === taskId)) {
      activeStatus = s;
      break;
    }
  }
  if (activeStatus === null) return buckets;

  if (!isTaskDragId(overId)) return buckets;
  const overTaskId = parseTaskDragId(overId);

  let targetStatus: TaskStatus | null = null;
  for (const [s, tasks] of buckets) {
    if (tasks.some((t) => t.frontmatter.id === overTaskId)) {
      targetStatus = s;
      break;
    }
  }
  if (targetStatus === null) return buckets;
  if (targetStatus === activeStatus) return buckets;
  const beforeId: string | null = overTaskId;

  const sourceTasks = buckets.get(activeStatus) ?? [];
  const activeTask = sourceTasks.find((t) => t.frontmatter.id === taskId);
  if (!activeTask) return buckets;

  const next = new Map(buckets);
  next.set(
    activeStatus,
    sourceTasks.filter((t) => t.frontmatter.id !== taskId),
  );

  const destTasks = [...(buckets.get(targetStatus) ?? [])];
  if (beforeId === null) {
    destTasks.push(activeTask);
  } else {
    const idx = destTasks.findIndex((t) => t.frontmatter.id === beforeId);
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
