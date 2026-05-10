import { useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Epic, Task, TaskStatus } from '@boardown/core';
import { useBoardStore } from '../store';
import { TaskCard } from '../components/TaskCard';
import boardStyles from '../components/BoardView.module.css';
import { isTaskDragId, parseTaskDragId } from './ids';
import { resolveDrop } from './resolveDrop';

interface BoardDndContextProps {
  buckets: Map<TaskStatus, Task[]>;
  epics: Epic[];
  children: ReactNode;
}

export function BoardDndContext({ buckets, epics, children }: BoardDndContextProps) {
  const moveTask = useBoardStore((s) => s.moveTask);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (isTaskDragId(id)) setActiveTaskId(parseTaskDragId(id));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null);
    const move = resolveDrop(event, buckets);
    if (!move) return;
    void moveTask(move.taskId, move.status, move.beforeTaskId);
  };

  const onDragCancel = () => setActiveTaskId(null);

  const activeTask = activeTaskId
    ? findTaskInBuckets(buckets, activeTaskId)
    : null;
  const activeEpic =
    activeTask && activeTask.frontmatter.epic
      ? epics.find((e) => e.slug === activeTask.frontmatter.epic)
      : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {children}
      <DragOverlay>
        {activeTask ? (
          <div className={boardStyles.dragOverlay}>
            <TaskCard task={activeTask} epic={activeEpic} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

const findTaskInBuckets = (
  buckets: Map<TaskStatus, Task[]>,
  taskId: string,
): Task | null => {
  for (const tasks of buckets.values()) {
    const found = tasks.find((t) => t.frontmatter.id === taskId);
    if (found) return found;
  }
  return null;
};
