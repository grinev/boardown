import {
  useEffect,
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
import { blockedCells, isTaskDragId, parseTaskDragId } from './ids';
import { applyDragOver, findCellOf, findOverlayPlacement } from './applyDragOver';
import { BlockedTargetProvider, NO_BLOCKED_TARGETS } from './BlockedTargetContext';

interface BoardDndContextProps {
  // Keyed by Board cell — a status, or a status inside a swimlane.
  buckets: Map<string, Task[]>;
  setBuckets: Dispatch<SetStateAction<Map<string, Task[]>>>;
  epics: Epic[];
  // The middle columns already at their WIP limit, judged before the drag.
  fullStatuses: ReadonlySet<TaskStatus>;
  children: ReactNode;
}

export function BoardDndContext({
  buckets,
  setBuckets,
  epics,
  fullStatuses,
  children,
}: BoardDndContextProps) {
  const moveTask = useBoardStore((s) => s.moveTask);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [blockedTargets, setBlockedTargets] =
    useState<ReadonlySet<string>>(NO_BLOCKED_TARGETS);
  const originalBucketsRef = useRef<Map<string, Task[]> | null>(null);
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
    const from = findCellOf(buckets, taskId);
    const blocked =
      from === null ? NO_BLOCKED_TARGETS : blockedCells(buckets.keys(), from, fullStatuses);
    setBlockedTargets(blocked.size === 0 ? NO_BLOCKED_TARGETS : blocked);
    originalBucketsRef.current = cloneBuckets(buckets);
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    setBuckets((prev) => {
      const next = applyDragOver(active, over, prev, blockedTargets);
      bucketsRef.current = next;
      return next;
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null);
    setBlockedTargets(NO_BLOCKED_TARGETS);
    const original = originalBucketsRef.current;
    originalBucketsRef.current = null;

    const activeId = String(event.active.id);
    if (!isTaskDragId(activeId)) return;
    const taskId = parseTaskDragId(activeId);

    let finalBuckets = bucketsRef.current;
    if (event.over) {
      const next = applyDragOver(event.active, event.over, finalBuckets, blockedTargets);
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
    setBlockedTargets(NO_BLOCKED_TARGETS);
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
  buckets: Map<string, Task[]>,
  taskId: string,
): Task | null => {
  for (const tasks of buckets.values()) {
    const found = tasks.find((t) => t.frontmatter.id === taskId);
    if (found) return found;
  }
  return null;
};

const cloneBuckets = (
  buckets: Map<string, Task[]>,
): Map<string, Task[]> => {
  const next = new Map<string, Task[]>();
  for (const [s, tasks] of buckets) next.set(s, [...tasks]);
  return next;
};
