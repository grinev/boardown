import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { isWipLimitReached, wipLimitFor, type StatusConfig } from '@boardown/core';
import type { Epic, Release, Task, TaskStatus } from '@boardown/core';
import { useBoardStore } from '../store';
import { statusDisplayLabel } from '../utils/status-style';
import { wipLimitHint } from '../utils/wip-limit';
import { BoardDndContext } from '../dnd/BoardDndContext';
import { useBlockedTargets } from '../dnd/BlockedTargetContext';
import { useDroppableColumn } from '../dnd/useBoardSortable';
import { UNKNOWN_COLUMN, taskDragId } from '../dnd/ids';
import { SortableTaskCard } from './SortableTaskCard';
import styles from './BoardView.module.css';

interface BoardViewProps {
  release: Release;
  epics: Epic[];
  statuses: readonly TaskStatus[];
}

// A task whose status the board no longer declares still belongs to the release,
// so it goes into one shared trailing bucket rather than disappearing. The bucket
// is created only when something lands in it.
export const groupTasksByStatus = (
  tasks: Task[],
  statuses: readonly TaskStatus[],
): Map<TaskStatus, Task[]> => {
  const buckets = new Map<TaskStatus, Task[]>();
  for (const status of statuses) buckets.set(status, []);
  for (const task of tasks) {
    const list = buckets.get(task.frontmatter.status) ?? buckets.get(UNKNOWN_COLUMN);
    if (list !== undefined) {
      list.push(task);
      continue;
    }
    buckets.set(UNKNOWN_COLUMN, [task]);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => a.frontmatter.order - b.frontmatter.order);
  }
  return buckets;
};

export function BoardView({ release, epics, statuses }: BoardViewProps) {
  const config = useBoardStore((s) => s.snapshot?.config);
  // Every middle column carries the limit on its own count, so "full" is a set,
  // not a flag.
  const fullStatuses = useMemo(() => {
    const full = new Set<TaskStatus>();
    if (config === undefined) return full;
    for (const status of statuses) {
      if (isWipLimitReached(release, config, status)) full.add(status);
    }
    return full;
  }, [release, config, statuses]);
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
  const unknownTasks = overlayBuckets.get(UNKNOWN_COLUMN) ?? [];

  return (
    <BoardDndContext
      buckets={overlayBuckets}
      setBuckets={setOverlayBuckets}
      epics={epics}
      fullStatuses={fullStatuses}
    >
      <div className={styles.board}>
        {statuses.map((status, index) => (
          <BoardColumn
            key={status}
            status={status}
            config={config}
            tasks={overlayBuckets.get(status) ?? []}
            epicsBySlug={epicsBySlug}
            showCreateButton={index === 0}
            limit={config === undefined ? null : wipLimitFor(release, config, status)}
            onCreate={() => openCreateTask(release.filename)}
          />
        ))}
        {unknownTasks.length > 0 && (
          <BoardColumn
            status={UNKNOWN_COLUMN}
            config={config}
            tasks={unknownTasks}
            epicsBySlug={epicsBySlug}
            showCreateButton={false}
            limit={null}
            onCreate={() => openCreateTask(release.filename)}
          />
        )}
      </div>
    </BoardDndContext>
  );
}

interface BoardColumnProps {
  status: TaskStatus;
  config: StatusConfig;
  tasks: Task[];
  epicsBySlug: Map<string, Epic>;
  showCreateButton: boolean;
  // The column's WIP limit, or null when it has none.
  limit: number | null;
  onCreate: () => void;
}

function BoardColumn({
  status,
  config,
  tasks,
  epicsBySlug,
  showCreateButton,
  limit,
  onCreate,
}: BoardColumnProps) {
  // The Unknown column takes no droppable at all — the product refuses a drop by
  // removing the target, not by dimming one.
  const readOnly = status === UNKNOWN_COLUMN;
  const blocked = useBlockedTargets().has(status);
  const { setNodeRef } = useDroppableColumn(status, blocked || readOnly);
  const items = tasks.map((t) => taskDragId(t.frontmatter.id));
  const atLimit = limit !== null && tasks.length >= limit;

  return (
    <div
      className={`${styles.column}${blocked ? ` ${styles.columnBlocked}` : ''}`}
      data-testid={`column-${status}`}
      title={
        blocked && limit !== null
          ? wipLimitHint(tasks.length, limit, statusDisplayLabel(config, status))
          : undefined
      }
    >
      <div className={styles.columnHeader}>
        <span>{readOnly ? 'Unknown' : statusDisplayLabel(config, status)}</span>
        <span
          className={`${styles.columnCount}${atLimit ? ` ${styles.columnCountAtLimit}` : ''}`}
        >
          {limit === null ? tasks.length : `${tasks.length} / ${limit}`}
        </span>
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
