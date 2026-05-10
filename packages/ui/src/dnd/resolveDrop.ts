import type { DragEndEvent } from '@dnd-kit/core';
import type { Task, TaskStatus } from '@boardown/core';
import {
  isColumnDropId,
  isTaskDragId,
  parseColumnDropId,
  parseTaskDragId,
} from './ids';

export interface ResolvedMove {
  taskId: string;
  status: TaskStatus;
  beforeTaskId: string | null;
}

export const resolveDrop = (
  event: DragEndEvent,
  buckets: Map<TaskStatus, Task[]>,
): ResolvedMove | null => {
  const { active, over } = event;
  if (!over) return null;
  const activeId = String(active.id);
  const overId = String(over.id);
  if (activeId === overId) return null;
  if (!isTaskDragId(activeId)) return null;
  const taskId = parseTaskDragId(activeId);

  if (isColumnDropId(overId)) {
    return {
      taskId,
      status: parseColumnDropId(overId),
      beforeTaskId: null,
    };
  }

  if (!isTaskDragId(overId)) return null;
  const overTaskId = parseTaskDragId(overId);

  let targetStatus: TaskStatus | null = null;
  let targetTasks: Task[] = [];
  for (const [status, tasks] of buckets) {
    if (tasks.some((t) => t.frontmatter.id === overTaskId)) {
      targetStatus = status;
      targetTasks = tasks;
      break;
    }
  }
  if (targetStatus === null) return null;

  const overIndex = targetTasks.findIndex(
    (t) => t.frontmatter.id === overTaskId,
  );
  const sourceIndex = targetTasks.findIndex((t) => t.frontmatter.id === taskId);

  const activeRect = active.rect.current.translated;
  const overRect = over.rect;
  const droppedAbove =
    activeRect !== null
      ? activeRect.top + activeRect.height / 2 <
        overRect.top + overRect.height / 2
      : true;

  const insertBeforeIdx = droppedAbove ? overIndex : overIndex + 1;

  if (
    sourceIndex !== -1 &&
    (insertBeforeIdx === sourceIndex || insertBeforeIdx === sourceIndex + 1)
  ) {
    return null;
  }

  let beforeTaskId = targetTasks[insertBeforeIdx]?.frontmatter.id ?? null;
  if (beforeTaskId === taskId) {
    beforeTaskId = targetTasks[insertBeforeIdx + 1]?.frontmatter.id ?? null;
  }

  return { taskId, status: targetStatus, beforeTaskId };
};
