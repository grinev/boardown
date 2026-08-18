import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
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
import { applyDragOver, findOverlayPlacement, findStatusOf } from './applyDragOver';
import { BlockedTargetProvider, NO_BLOCKED_TARGETS } from './BlockedTargetContext';

interface BoardDndContextProps {
  buckets: Map<TaskStatus, Task[]>;
  setBuckets: Dispatch<SetStateAction<Map<TaskStatus, Task[]>>>;
  epics: Epic[];
  wipFull: boolean;
  children: ReactNode;
}

export function BoardDndContext({
  buckets,
  setBuckets,
  epics,
  wipFull,
  children,
}: BoardDndContextProps) {
  const moveTask = useBoardStore((s) => s.moveTask);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [blockedStatus, setBlockedStatus] = useState<TaskStatus | null>(null);
  // One board is one release, so at most one column is ever refused; the shared
  // context carries a set because the backlog shows several releases at once.
  const blockedTargets = useMemo(
    () => (blockedStatus === null ? NO_BLOCKED_TARGETS : new Set([blockedStatus])),
    [blockedStatus],
  );
  const originalBucketsRef = useRef<Map<TaskStatus, Task[]> | null>(null);
  const bucketsRef = useRef(buckets);

  useEffect(() => {
    bucketsRef.current = buckets;
  }, [buckets]);

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
    const taskId = parseTaskDragId(id);
    setActiveTaskId(taskId);
    // A card already in the column is only being reordered, so the column stays
    // open to it however full it is.
    const fromInProgress = findStatusOf(buckets, taskId) === 'in-progress';
    setBlockedStatus(wipFull && !fromInProgress ? 'in-progress' : null);
    originalBucketsRef.current = cloneBuckets(buckets);
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    setBuckets((prev) => {
      const next = applyDragOver(active, over, prev, blockedStatus);
      bucketsRef.current = next;
      return next;
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null);
    setBlockedStatus(null);
    const original = originalBucketsRef.current;
    originalBucketsRef.current = null;

    const activeId = String(event.active.id);
    if (!isTaskDragId(activeId)) return;
    const taskId = parseTaskDragId(activeId);

    let finalBuckets = bucketsRef.current;
    if (event.over) {
      const next = applyDragOver(event.active, event.over, finalBuckets, blockedStatus);
      if (next !== finalBuckets) {
        finalBuckets = next;
        bucketsRef.current = next;
        setBuckets(next);
      }
    }

    const placement = findOverlayPlacement(finalBuckets, taskId);
    if (!placement) {
      if (original) {
        bucketsRef.current = original;
        setBuckets(original);
      }
      return;
    }

    const originalPlacement = original
      ? findOverlayPlacement(original, taskId)
      : null;
    if (
      originalPlacement &&
      originalPlacement.status === placement.status &&
      originalPlacement.beforeTaskId === placement.beforeTaskId
    ) {
      return;
    }

    // The UI keeps a refused target out of reach, so a rejection here is a race;
    // the store has already reported it and left the board untouched.
    void moveTask(taskId, placement.status, placement.beforeTaskId).catch(() => {});
  };

  const onDragCancel = () => {
    setActiveTaskId(null);
    setBlockedStatus(null);
    const original = originalBucketsRef.current;
    originalBucketsRef.current = null;
    if (original) {
      bucketsRef.current = original;
      setBuckets(original);
    }
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
      <BlockedTargetProvider value={blockedTargets}>{children}</BlockedTargetProvider>
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
