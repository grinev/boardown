import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Epic, Release, Task, TaskStatus } from '@boardown/core';
import { useBoardStore } from '../store';
import { formatStatusLabel } from '../utils/format-status';
import { BoardDndContext } from '../dnd/BoardDndContext';
import { useDroppableColumn } from '../dnd/useBoardSortable';
import { taskDragId } from '../dnd/ids';
import { SortableTaskCard } from './SortableTaskCard';
import styles from './BoardView.module.css';

interface BoardViewProps {
  release: Release;
  epics: Epic[];
  statuses: readonly TaskStatus[];
}

const groupTasksByStatus = (
  tasks: Task[],
  statuses: readonly TaskStatus[],
): Map<TaskStatus, Task[]> => {
  const buckets = new Map<TaskStatus, Task[]>();
  for (const status of statuses) buckets.set(status, []);
  for (const task of tasks) {
    const list = buckets.get(task.frontmatter.status);
    if (list !== undefined) list.push(task);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => a.frontmatter.order - b.frontmatter.order);
  }
  return buckets;
};

export function BoardView({ release, epics, statuses }: BoardViewProps) {
  const sourceBuckets = useMemo(
    () => groupTasksByStatus(release.tasks, statuses),
    [release.tasks, statuses],
  );
  const [overlayBuckets, setOverlayBuckets] =
    useState<Map<TaskStatus, Task[]>>(sourceBuckets);

  useEffect(() => {
    setOverlayBuckets(sourceBuckets);
  }, [sourceBuckets]);

  const epicsBySlug = useMemo(
    () => new Map(epics.map((e) => [e.slug, e])),
    [epics],
  );
  const openCreateTask = useBoardStore((s) => s.openCreateTask);

  return (
    <BoardDndContext
      buckets={overlayBuckets}
      setBuckets={setOverlayBuckets}
      epics={epics}
    >
      <div className={styles.board}>
        {statuses.map((status, index) => {
          const tasks = overlayBuckets.get(status) ?? [];
          const isFirstColumn = index === 0;
          return (
            <BoardColumn
              key={status}
              status={status}
              tasks={tasks}
              epicsBySlug={epicsBySlug}
              showCreateButton={isFirstColumn}
              onCreate={() => openCreateTask(release.filename)}
            />
          );
        })}
      </div>
    </BoardDndContext>
  );
}

interface BoardColumnProps {
  status: TaskStatus;
  tasks: Task[];
  epicsBySlug: Map<string, Epic>;
  showCreateButton: boolean;
  onCreate: () => void;
}

function BoardColumn({
  status,
  tasks,
  epicsBySlug,
  showCreateButton,
  onCreate,
}: BoardColumnProps) {
  const { setNodeRef } = useDroppableColumn(status);
  const items = tasks.map((t) => taskDragId(t.frontmatter.id));

  return (
    <div className={styles.column} data-testid={`column-${status}`}>
      <div className={styles.columnHeader}>
        <span>{formatStatusLabel(status)}</span>
        <span className={styles.columnCount}>{tasks.length}</span>
      </div>
      <div ref={setNodeRef} className={styles.cards}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className={styles.empty}>No tasks</div>
          ) : (
            tasks.map((task) => {
              const slug = task.frontmatter.epic;
              const epic = slug ? epicsBySlug.get(slug) : undefined;
              return (
                <SortableTaskCard
                  key={task.frontmatter.id}
                  task={task}
                  epic={epic}
                />
              );
            })
          )}
        </SortableContext>
      </div>
      {showCreateButton && (
        <button
          type="button"
          className={styles.addTaskButton}
          onClick={onCreate}
        >
          <Plus size={14} aria-hidden="true" />
          <span>Create task</span>
        </button>
      )}
    </div>
  );
}
