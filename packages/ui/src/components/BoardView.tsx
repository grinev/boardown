import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { isWipLimitReached, wipLimitFor, type StatusConfig } from '@boardown/core';
import type { BoardConfig, Epic, Release, Task, TaskStatus } from '@boardown/core';
import { useBoardStore } from '../store';
import { taskTypeDisplay } from '../task-types';
import { statusDisplayLabel } from '../utils/status-style';
import { wipLimitHint } from '../utils/wip-limit';
import { BoardDndContext } from '../dnd/BoardDndContext';
import { useBlockedTargets } from '../dnd/BlockedTargetContext';
import { useDroppableColumn } from '../dnd/useBoardSortable';
import { UNKNOWN_COLUMN, boardCellKey, cellStatus, taskDragId } from '../dnd/ids';
import { boardLanes, type BoardLane } from './board-lanes';
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

// The same buckets once per lane, keyed by cell. The Unknown column runs through
// every lane while any task of the release needs it, so the columns line up.
export const groupTasksByLane = (
  lanes: readonly BoardLane[],
  statuses: readonly TaskStatus[],
): Map<string, Task[]> => {
  const needsUnknown = lanes.some((lane) =>
    lane.tasks.some((task) => !statuses.includes(task.frontmatter.status)),
  );
  const cells = new Map<string, Task[]>();
  for (const lane of lanes) {
    const buckets = groupTasksByStatus(lane.tasks, statuses);
    if (needsUnknown && !buckets.has(UNKNOWN_COLUMN)) buckets.set(UNKNOWN_COLUMN, []);
    for (const [status, tasks] of buckets) cells.set(boardCellKey(lane.key, status), tasks);
  }
  return cells;
};

const columnTotal = (buckets: Map<string, Task[]>, status: TaskStatus): number => {
  let total = 0;
  for (const [cell, tasks] of buckets) {
    if (cellStatus(cell) === status) total += tasks.length;
  }
  return total;
};

export function BoardView({ release, epics, statuses }: BoardViewProps) {
  const config = useBoardStore((s) => s.snapshot?.config);
  const grouping = config?.boardSwimlanes;
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
  // An empty release has no lane to show, so it keeps the ungrouped columns.
  const lanes = useMemo(
    () =>
      grouping === undefined || release.tasks.length === 0
        ? null
        : boardLanes(release.tasks, grouping, epics, config),
    [grouping, release.tasks, epics, config],
  );
  const sourceBuckets = useMemo<Map<string, Task[]>>(
    () => (lanes === null ? groupTasksByStatus(release.tasks, statuses) : groupTasksByLane(lanes, statuses)),
    [lanes, release.tasks, statuses],
  );
  const [overlayBuckets, setOverlayBuckets] =
    useState<Map<string, Task[]>>(sourceBuckets);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    setOverlayBuckets(sourceBuckets);
  }, [sourceBuckets]);

  const epicsBySlug = useMemo(
    () => new Map(epics.map((e) => [e.slug, e])),
    [epics],
  );
  const openCreateTask = useBoardStore((s) => s.openCreateTask);
  const onCreate = () => openCreateTask(release.filename);
  const limitOf = (status: TaskStatus): number | null =>
    config === undefined ? null : wipLimitFor(release, config, status);
  const toggleLane = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  if (lanes === null) {
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
              limit={limitOf(status)}
              onCreate={onCreate}
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
              onCreate={onCreate}
            />
          )}
        </div>
      </BoardDndContext>
    );
  }

  const columns = [...statuses];
  if ([...overlayBuckets.keys()].some((cell) => cellStatus(cell) === UNKNOWN_COLUMN)) {
    columns.push(UNKNOWN_COLUMN);
  }

  return (
    <BoardDndContext
      buckets={overlayBuckets}
      setBuckets={setOverlayBuckets}
      epics={epics}
      fullStatuses={fullStatuses}
    >
      <div className={styles.laneBoard}>
        <div className={styles.laneGrid}>
          <LaneColumnHeaders
            columns={columns}
            config={config}
            buckets={overlayBuckets}
            limitOf={limitOf}
          />
          {lanes.map((lane) => (
            <BoardLaneRow
              key={lane.key}
              lane={lane}
              columns={columns}
              config={config}
              buckets={overlayBuckets}
              epicsBySlug={epicsBySlug}
              collapsed={collapsed.has(lane.key)}
              onToggle={() => toggleLane(lane.key)}
              limitOf={limitOf}
            />
          ))}
          <div className={styles.laneCreateRow}>
            <button type="button" className={styles.addTaskButton} onClick={onCreate}>
              <Plus size={14} aria-hidden="true" />
              <span>Create task</span>
            </button>
          </div>
        </div>
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
            tasks.map((task) => (
              <SortableTaskCard
                key={task.frontmatter.id}
                task={task}
                epic={epicOf(task, epicsBySlug)}
              />
            ))
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

const epicOf = (task: Task, epicsBySlug: Map<string, Epic>): Epic | undefined => {
  const slug = task.frontmatter.epic;
  return slug ? epicsBySlug.get(slug) : undefined;
};

// A column refuses the drag in every lane at once only when it is full: a lane
// boundary leaves the source lane's cell open, so the header stays lit.
const isColumnBlocked = (
  blocked: ReadonlySet<string>,
  buckets: Map<string, Task[]>,
  status: TaskStatus,
): boolean => {
  if (blocked.size === 0) return false;
  for (const cell of buckets.keys()) {
    if (cellStatus(cell) === status && !blocked.has(cell)) return false;
  }
  return true;
};

interface LaneColumnHeadersProps {
  columns: readonly TaskStatus[];
  config: StatusConfig;
  buckets: Map<string, Task[]>;
  limitOf: (status: TaskStatus) => number | null;
}

function LaneColumnHeaders({ columns, config, buckets, limitOf }: LaneColumnHeadersProps) {
  const blocked = useBlockedTargets();
  return (
    <div className={styles.laneHeaderRow}>
      {columns.map((status) => {
        const readOnly = status === UNKNOWN_COLUMN;
        const total = columnTotal(buckets, status);
        const limit = readOnly ? null : limitOf(status);
        const atLimit = limit !== null && total >= limit;
        const columnBlocked = !readOnly && isColumnBlocked(blocked, buckets, status);
        return (
          <div
            key={status}
            className={`${styles.laneColumnHeader}${columnBlocked ? ` ${styles.columnBlocked}` : ''}`}
            data-testid={`column-${status}`}
            title={
              columnBlocked && limit !== null
                ? wipLimitHint(total, limit, statusDisplayLabel(config, status))
                : undefined
            }
          >
            <span>{readOnly ? 'Unknown' : statusDisplayLabel(config, status)}</span>
            <span
              className={`${styles.columnCount}${atLimit ? ` ${styles.columnCountAtLimit}` : ''}`}
            >
              {limit === null ? total : `${total} / ${limit}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface BoardLaneRowProps {
  lane: BoardLane;
  columns: readonly TaskStatus[];
  config: BoardConfig | undefined;
  buckets: Map<string, Task[]>;
  epicsBySlug: Map<string, Epic>;
  collapsed: boolean;
  onToggle: () => void;
  limitOf: (status: TaskStatus) => number | null;
}

function BoardLaneRow({
  lane,
  columns,
  config,
  buckets,
  epicsBySlug,
  collapsed,
  onToggle,
  limitOf,
}: BoardLaneRowProps) {
  const blocked = useBlockedTargets();
  const ChevronIcon = collapsed ? ChevronRight : ChevronDown;
  return (
    <section className={styles.lane} data-testid={`lane-${lane.key}`}>
      <button
        type="button"
        className={styles.laneHeader}
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <ChevronIcon size={16} className={styles.laneChevron} aria-hidden="true" />
        <LaneTitle lane={lane} config={config} />
        <span className={styles.columnCount}>{lane.tasks.length}</span>
      </button>
      {!collapsed && (
        <div className={styles.laneCells}>
          {columns.map((status) => {
            const cell = boardCellKey(lane.key, status);
            const tasks = buckets.get(cell) ?? [];
            const limit = status === UNKNOWN_COLUMN ? null : limitOf(status);
            const full =
              limit !== null && blocked.has(cell) && isColumnBlocked(blocked, buckets, status);
            return (
              <BoardCell
                key={status}
                cell={cell}
                laneKey={lane.key}
                status={status}
                tasks={tasks}
                epicsBySlug={epicsBySlug}
                title={
                  full
                    ? wipLimitHint(
                        columnTotal(buckets, status),
                        limit,
                        statusDisplayLabel(config, status),
                      )
                    : undefined
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function LaneTitle({ lane, config }: { lane: BoardLane; config: BoardConfig | undefined }) {
  if (lane.kind === 'no-epic') return <span className={styles.laneTitle}>No epic</span>;
  if (lane.kind === 'epic') {
    return (
      <span className={`${styles.laneTitle} ${styles.laneEpicTitle}`}>
        <span
          className={styles.epicSwatch}
          style={{ background: lane.epic.frontmatter.color }}
          aria-hidden="true"
        />
        <span className={styles.laneTitleText}>{lane.epic.frontmatter.name}</span>
      </span>
    );
  }
  const typeMeta = taskTypeDisplay(config, lane.type);
  const TypeIcon = typeMeta.icon;
  return (
    <span className={styles.laneTitle}>
      <TypeIcon className={styles.typeIcon} style={typeMeta.style} aria-hidden="true" />
      {typeMeta.label}
    </span>
  );
}

interface BoardCellProps {
  cell: string;
  laneKey: string;
  status: TaskStatus;
  tasks: Task[];
  epicsBySlug: Map<string, Epic>;
  title: string | undefined;
}

function BoardCell({ cell, laneKey, status, tasks, epicsBySlug, title }: BoardCellProps) {
  const readOnly = status === UNKNOWN_COLUMN;
  const blocked = useBlockedTargets().has(cell);
  const { setNodeRef } = useDroppableColumn(cell, blocked || readOnly);
  const items = tasks.map((t) => taskDragId(t.frontmatter.id));
  return (
    <div
      ref={setNodeRef}
      className={`${styles.laneCell}${blocked ? ` ${styles.columnBlocked}` : ''}`}
      data-testid={`cell-${laneKey}-${status}`}
      title={title}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {tasks.map((task) => (
          <SortableTaskCard
            key={task.frontmatter.id}
            task={task}
            epic={epicOf(task, epicsBySlug)}
          />
        ))}
      </SortableContext>
    </div>
  );
}
