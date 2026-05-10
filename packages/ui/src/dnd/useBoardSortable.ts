import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import type { TaskStatus } from '@boardown/core';
import { columnDropId, taskDragId } from './ids';

export const useSortableTask = (taskId: string) =>
  useSortable({ id: taskDragId(taskId) });

export const useDroppableColumn = (status: TaskStatus) =>
  useDroppable({ id: columnDropId(status) });
