import { useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Epic, Task, TaskStatus } from '@boardown/core';
import { useBoardStore } from '../store';
import { TaskCard } from '../components/TaskCard';
import boardStyles from '../components/BoardView.module.css';
import { isTaskDragId, parseTaskDragId } from './ids';
import {
  applyCrossColumnDragOver,
  findOverlayPlacement,
  findStatusOf,
} from './applyDragOver';
import { resolveDrop } from './resolveDrop';

interface BoardDndContextProps {
  buckets: Map<TaskStatus, Task[]>;
  setBuckets: Dispatch<SetStateAction<Map<TaskStatus, Task[]>>>;
  epics: Epic[];
  children: ReactNode;
}

export function BoardDndContext({
  buckets,
  setBuckets,
  epics,
  children,
}: BoardDndContextProps) {
  const moveTask = useBoardStore((s) => s.moveTask);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const originalBucketsRef = useRef<Map<TaskStatus, Task[]> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const collisionDetection: CollisionDetection = (args) => {
    const pointer = pointerWithin(args);
    if (pointer.length > 0) return pointer;
    const intersect = rectIntersection(args);
    if (intersect.length > 0) return intersect;
    return closestCorners(args);
  };

  const onDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (!isTaskDragId(id)) return;
    setActiveTaskId(parseTaskDragId(id));
    originalBucketsRef.current = cloneBuckets(buckets);
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    setBuckets((prev) => applyCrossColumnDragOver(active, over, prev));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null);
    const original = originalBucketsRef.current;
    originalBucketsRef.current = null;

    const activeId = String(event.active.id);
    if (!isTaskDragId(activeId)) return;
    const taskId = parseTaskDragId(activeId);

    const overlayStatus = findStatusOf(buckets, taskId);
    const originalStatus = original ? findStatusOf(original, taskId) : null;
    const crossedColumns =
      overlayStatus !== null &&
      originalStatus !== null &&
      overlayStatus !== originalStatus;

    if (crossedColumns) {
      const placement = findOverlayPlacement(buckets, taskId);
      if (!placement) {
        if (original) setBuckets(original);
        return;
      }
      void moveTask(taskId, placement.status, placement.beforeTaskId);
      return;
    }

    const move = resolveDrop(event, buckets);
    if (!move) {
      if (original) setBuckets(original);
      return;
    }
    void moveTask(move.taskId, move.status, move.beforeTaskId);
  };

  const onDragCancel = () => {
    setActiveTaskId(null);
    const original = originalBucketsRef.current;
    originalBucketsRef.current = null;
    if (original) setBuckets(original);
  };

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
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
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

const cloneBuckets = (
  buckets: Map<TaskStatus, Task[]>,
): Map<TaskStatus, Task[]> => {
  const next = new Map<TaskStatus, Task[]>();
  for (const [s, tasks] of buckets) next.set(s, [...tasks]);
  return next;
};
