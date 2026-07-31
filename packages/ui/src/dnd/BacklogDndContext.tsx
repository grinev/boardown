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
import { BlockedTargetProvider } from './BlockedTargetContext';
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
  // The current release's section key, when its In Progress column is full.
  wipFullSectionKey: string | null;
  children: ReactNode;
}

export function BacklogDndContext({
  buckets,
  setBuckets,
  epics,
  wipFullSectionKey,
  children,
}: BacklogDndContextProps) {
  const moveTaskOnBacklog = useBoardStore((s) => s.moveTaskOnBacklog);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [blockedSection, setBlockedSection] = useState<string | null>(null);
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
    const taskId = parseTaskDragId(id);
    setActiveTaskId(taskId);
    // Only an `in-progress` task entering the full release breaches the limit;
    // a task already in that section is merely being reordered.
    const task = findTaskInBuckets(buckets, taskId);
    const alreadyThere = findSectionOfTask(buckets, taskId) === wipFullSectionKey;
    setBlockedSection(
      wipFullSectionKey !== null &&
        !alreadyThere &&
        task?.frontmatter.status === 'in-progress'
        ? wipFullSectionKey
        : null,
    );
    originalBucketsRef.current = cloneBuckets(buckets);
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    setBuckets((prev) => {
      const next = applyDragOverBacklog(active, over, prev, blockedSection);
      bucketsRef.current = next;
      return next;
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null);
    setBlockedSection(null);
    const original = originalBucketsRef.current;
    originalBucketsRef.current = null;

    const activeId = String(event.active.id);
    if (!isTaskDragId(activeId)) return;
    const taskId = parseTaskDragId(activeId);

    const finalBuckets = bucketsRef.current;
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

    // The UI keeps a refused destination out of reach, so a rejection here is a
    // race; the store has already reported it and left the board untouched.
    void moveTaskOnBacklog(taskId, target, placement.beforeTaskId).catch(() => {});
  };

  const onDragCancel = () => {
    setActiveTaskId(null);
    setBlockedSection(null);
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
      <BlockedTargetProvider value={blockedSection}>{children}</BlockedTargetProvider>
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

const findSectionOfTask = (buckets: SectionBuckets, taskId: string): string | null => {
  for (const [key, tasks] of buckets) {
    if (tasks.some((t) => t.frontmatter.id === taskId)) return key;
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
