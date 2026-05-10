import type { CSSProperties } from 'react';
import { CSS } from '@dnd-kit/utilities';
import type { Epic, Task } from '@boardown/core';
import { useSortableTask } from '../dnd/useBoardSortable';
import { TaskCard } from './TaskCard';
import styles from './BoardView.module.css';

interface SortableTaskCardProps {
  task: Task;
  epic: Epic | undefined;
}

export function SortableTaskCard({ task, epic }: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortableTask(task.frontmatter.id);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={styles.sortableTask}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} epic={epic} />
    </div>
  );
}
