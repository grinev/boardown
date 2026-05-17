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
import type { Epic, Task } from '@boardown/core';
import { useBoardStore } from '../store';
import { BacklogRowView } from '../components/BacklogRowView';
import backlogStyles from '../components/BacklogView.module.css';
import { isTaskDragId, parseTaskDragId } from './ids';
import {
  BACKLOG_SECTION_KEY,
  applyDragOverBacklog,
  findBacklogPlacement,
  type SectionBuckets,
} from './applyDragOverBacklog';

const RELEASE_SECTION_PREFIX = 'release:';

interface BacklogDndContextProps {
  buckets: SectionBuckets;
  setBuckets: Dispatch<SetStateAction<SectionBuckets>>;
  epics: Epic[];
  children: ReactNode;
}

export function BacklogDndContext({
  buckets,
  setBuckets,
  epics,
  children,
}: BacklogDndContextProps) {
  const moveTaskOnBacklog = useBoardStore((s) => s.moveTaskOnBacklog);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const originalBucketsRef = useRef<SectionBuckets | null>(null);
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
    setActiveTaskId(parseTaskDragId(id));
    originalBucketsRef.current = cloneBuckets(buckets);
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    setBuckets((prev) => {
      const next = applyDragOverBacklog(active, over, prev);
      bucketsRef.current = next;
      return next;
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null);
    const original = originalBucketsRef.current;
    originalBucketsRef.current = null;

    const activeId = String(event.active.id);
    if (!isTaskDragId(activeId)) return;
    const taskId = parseTaskDragId(activeId);

    let finalBuckets = bucketsRef.current;
    if (event.over) {
      const next = applyDragOverBacklog(event.active, event.over, finalBuckets);
      if (next !== finalBuckets) {
        finalBuckets = next;
        bucketsRef.current = next;
        setBuckets(next);
      }
    }

    const placement = findBacklogPlacement(finalBuckets, taskId);
    if (!placement) {
      if (original) {
        bucketsRef.current = original;
        setBuckets(original);
      }
      return;
    }

    const originalPlacement = original
      ? findBacklogPlacement(original, taskId)
      : null;
    if (
      originalPlacement &&
      originalPlacement.sectionKey === placement.sectionKey &&
      originalPlacement.beforeTaskId === placement.beforeTaskId
    ) {
      return;
    }

    const target = sectionKeyToTarget(placement.sectionKey);
    if (!target) {
      if (original) {
        bucketsRef.current = original;
        setBuckets(original);
      }
      return;
    }

    void moveTaskOnBacklog(taskId, target, placement.beforeTaskId);
  };

  const onDragCancel = () => {
    setActiveTaskId(null);
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
      {children}
      <DragOverlay>
        {activeTask ? (
          <ul className={backlogStyles.dragOverlayList}>
            <BacklogRowView task={activeTask} epic={activeEpic} />
          </ul>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

const findTaskInBuckets = (
  buckets: SectionBuckets,
  taskId: string,
): Task | null => {
  for (const tasks of buckets.values()) {
    const found = tasks.find((t) => t.frontmatter.id === taskId);
    if (found) return found;
  }
  return null;
};

const cloneBuckets = (buckets: SectionBuckets): SectionBuckets => {
  const next: SectionBuckets = new Map();
  for (const [key, tasks] of buckets) next.set(key, [...tasks]);
  return next;
};

const sectionKeyToTarget = (
  key: string,
): { kind: 'release'; filename: string } | { kind: 'backlog' } | null => {
  if (key === BACKLOG_SECTION_KEY) return { kind: 'backlog' };
  if (key.startsWith(RELEASE_SECTION_PREFIX)) {
    return { kind: 'release', filename: key.slice(RELEASE_SECTION_PREFIX.length) };
  }
  return null;
};
