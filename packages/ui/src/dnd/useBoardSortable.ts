import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { columnDropId, taskDragId } from './ids';

export const useSortableTask = (taskId: string) =>
  useSortable({ id: taskDragId(taskId) });

export const useDroppableColumn = (cell: string, disabled = false) =>
  useDroppable({ id: columnDropId(cell), disabled });
