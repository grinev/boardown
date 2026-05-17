import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Epic, Release, Task } from '@boardown/core';
import { useBoardStore } from '../store';
import { BacklogDndContext } from '../dnd/BacklogDndContext';
import { BACKLOG_SECTION_KEY, type SectionBuckets } from '../dnd/applyDragOverBacklog';
import { sectionDropId, taskDragId } from '../dnd/ids';
import {
  BacklogFilters,
  type EpicFilter,
  type StatusFilter,
  type TypeFilter,
} from './BacklogFilters';
import { BacklogRowView } from './BacklogRowView';
import { CreateReleaseDialog } from './CreateReleaseDialog';
import styles from './BacklogView.module.css';

interface SectionMeta {
  key: string;
  title: string;
  statusLabel: string | null;
  hasCreateRelease: boolean;
}

const NO_EPIC_SORT_KEY = '￿';

const sortByOrder = (a: Task, b: Task) => a.frontmatter.order - b.frontmatter.order;

const sortBacklogTasks = (a: Task, b: Task) => {
  const ea = a.frontmatter.epic ?? NO_EPIC_SORT_KEY;
  const eb = b.frontmatter.epic ?? NO_EPIC_SORT_KEY;
  if (ea !== eb) return ea.localeCompare(eb);
  return a.frontmatter.order - b.frontmatter.order;
};

const releaseTitle = (release: Release): string =>
  release.frontmatter.name ?? release.slug;

const releaseSectionKey = (release: Release): string =>
  `release:${release.filename}`;

export function BacklogView() {
  const snapshot = useBoardStore((s) => s.snapshot);
  const openTask = useBoardStore((s) => s.openTask);
  const openEpic = useBoardStore((s) => s.openEpic);
  const openCreateRelease = useBoardStore((s) => s.openCreateRelease);
  const closeCreateRelease = useBoardStore((s) => s.closeCreateRelease);
  const createReleaseOpen = useBoardStore((s) => s.createReleaseOpen);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [epicFilter, setEpicFilter] = useState<EpicFilter>('all');
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const epics = useMemo(() => snapshot?.epics ?? [], [snapshot?.epics]);

  useEffect(() => {
    if (epicFilter === 'all' || epicFilter === 'no-epic') return;
    const exists = epics.some((e) => e.slug === epicFilter);
    if (!exists) setEpicFilter('all');
  }, [epics, epicFilter]);

  const { sectionMetas, sourceBuckets } = useMemo(() => {
    const metas: SectionMeta[] = [];
    const buckets: SectionBuckets = new Map();
    if (!snapshot) return { sectionMetas: metas, sourceBuckets: buckets };

    const { releases, backlog } = snapshot;
    const current = releases.find((r) => r.frontmatter.status === 'current');
    const futures = releases
      .filter((r) => r.frontmatter.status === 'future')
      .sort((a, b) => a.filename.localeCompare(b.filename));

    if (current) {
      const key = releaseSectionKey(current);
      metas.push({
        key,
        title: releaseTitle(current),
        statusLabel: 'active',
        hasCreateRelease: false,
      });
      buckets.set(key, [...current.tasks].sort(sortByOrder));
    }
    for (const r of futures) {
      const key = releaseSectionKey(r);
      metas.push({
        key,
        title: releaseTitle(r),
        statusLabel: 'future',
        hasCreateRelease: false,
      });
      buckets.set(key, [...r.tasks].sort(sortByOrder));
    }
    metas.push({
      key: BACKLOG_SECTION_KEY,
      title: 'Backlog',
      statusLabel: null,
      hasCreateRelease: true,
    });
    buckets.set(
      BACKLOG_SECTION_KEY,
      [
        ...epics.flatMap((e) => e.tasks),
        ...(backlog?.tasks ?? []),
      ].sort(sortBacklogTasks),
    );

    return { sectionMetas: metas, sourceBuckets: buckets };
  }, [snapshot, epics]);

  const [overlayBuckets, setOverlayBuckets] =
    useState<SectionBuckets>(sourceBuckets);

  useEffect(() => {
    setOverlayBuckets(sourceBuckets);
  }, [sourceBuckets]);

  const epicsBySlug = useMemo(
    () => new Map(epics.map((e) => [e.slug, e])),
    [epics],
  );

  const expandCollapsed = useCallback(
    (key: string) => {
      setCollapsedKeys((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    },
    [],
  );

  if (snapshot === null) return null;

  const filtersActive =
    statusFilter !== 'all' || typeFilter !== 'all' || epicFilter !== 'all';

  const matchesFilters = (task: Task): boolean => {
    if (statusFilter !== 'all' && task.frontmatter.status !== statusFilter) return false;
    if (typeFilter !== 'all' && task.frontmatter.type !== typeFilter) return false;
    if (epicFilter === 'no-epic') {
      if (task.frontmatter.epic !== undefined) return false;
    } else if (epicFilter !== 'all') {
      if (task.frontmatter.epic !== epicFilter) return false;
    }
    return true;
  };

  return (
    <div className={styles.view}>
      <BacklogFilters
        epics={epics}
        statusFilter={statusFilter}
        typeFilter={typeFilter}
        epicFilter={epicFilter}
        onStatusChange={setStatusFilter}
        onTypeChange={setTypeFilter}
        onEpicChange={setEpicFilter}
      />
      <BacklogDndContext
        buckets={overlayBuckets}
        setBuckets={setOverlayBuckets}
        epics={epics}
      >
        <div className={styles.scrollArea}>
          {sectionMetas.map((meta) => {
            const sectionTasks = overlayBuckets.get(meta.key) ?? [];
            const displayedTasks = filtersActive
              ? sectionTasks.filter(matchesFilters)
              : sectionTasks;
            return (
              <BacklogSection
                key={meta.key}
                sectionKey={meta.key}
                title={meta.title}
                statusLabel={meta.statusLabel}
                tasks={displayedTasks}
                totalCount={sectionTasks.length}
                filtersActive={filtersActive}
                collapsed={collapsedKeys.has(meta.key)}
                onToggle={() => toggleCollapsed(meta.key)}
                onExpandRequested={() => expandCollapsed(meta.key)}
                epicsBySlug={epicsBySlug}
                onOpenTask={openTask}
                onOpenEpic={openEpic}
                {...(meta.hasCreateRelease
                  ? { onCreateRelease: openCreateRelease }
                  : {})}
              />
            );
          })}
        </div>
      </BacklogDndContext>
      {createReleaseOpen && <CreateReleaseDialog onClose={closeCreateRelease} />}
    </div>
  );
}

interface BacklogSectionProps {
  sectionKey: string;
  title: string;
  statusLabel: string | null;
  tasks: Task[];
  totalCount: number;
  filtersActive: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onExpandRequested: () => void;
  epicsBySlug: Map<string, Epic>;
  onOpenTask: (id: string) => void;
  onOpenEpic: (slug: string) => void;
  onCreateRelease?: () => void;
}

function BacklogSection({
  sectionKey,
  title,
  statusLabel,
  tasks,
  totalCount,
  filtersActive,
  collapsed,
  onToggle,
  onExpandRequested,
  epicsBySlug,
  onOpenTask,
  onOpenEpic,
  onCreateRelease,
}: BacklogSectionProps) {
  const { setNodeRef, isOver } = useDroppable({ id: sectionDropId(sectionKey) });

  useEffect(() => {
    if (!collapsed || !isOver) return;
    const id = window.setTimeout(() => onExpandRequested(), 500);
    return () => window.clearTimeout(id);
  }, [collapsed, isOver, onExpandRequested]);

  const emptyMessage =
    totalCount === 0
      ? 'No tasks yet'
      : 'No tasks match the filters';
  const ChevronIcon = collapsed ? ChevronRight : ChevronDown;
  const itemIds = tasks.map((t) => taskDragId(t.frontmatter.id));

  return (
    <section
      ref={setNodeRef}
      className={`${styles.section}${isOver ? ` ${styles.sectionDragOver!}` : ''}`}
    >
      <header className={styles.sectionHeader}>
        <button
          type="button"
          className={styles.sectionToggle}
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand section' : 'Collapse section'}
        >
          <ChevronIcon size={16} className={styles.sectionChevron} aria-hidden="true" />
        </button>
        <span className={styles.sectionTitle}>{title}</span>
        {statusLabel && <span className={styles.sectionStatus}>({statusLabel})</span>}
        {onCreateRelease && (
          <button
            type="button"
            className={styles.sectionCreateButton}
            onClick={onCreateRelease}
          >
            <Plus size={14} aria-hidden="true" />
            Create release
          </button>
        )}
        <span className={styles.sectionCount}>
          {filtersActive ? `${tasks.length} of ${totalCount}` : tasks.length}
        </span>
      </header>
      {!collapsed && (
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className={styles.empty}>{emptyMessage}</div>
          ) : (
            <ul className={styles.rows}>
              {tasks.map((task) => {
                const epicSlug = task.frontmatter.epic;
                const epic = epicSlug ? epicsBySlug.get(epicSlug) : undefined;
                return (
                  <BacklogRow
                    key={task.frontmatter.id}
                    task={task}
                    epic={epic}
                    onOpenTask={onOpenTask}
                    onOpenEpic={onOpenEpic}
                  />
                );
              })}
            </ul>
          )}
        </SortableContext>
      )}
    </section>
  );
}

interface BacklogRowProps {
  task: Task;
  epic: Epic | undefined;
  onOpenTask: (id: string) => void;
  onOpenEpic: (slug: string) => void;
}

function BacklogRow({ task, epic, onOpenTask, onOpenEpic }: BacklogRowProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: taskDragId(task.frontmatter.id) });

  const rowStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <BacklogRowView
      ref={setNodeRef}
      task={task}
      epic={epic}
      onOpenTask={onOpenTask}
      onOpenEpic={onOpenEpic}
      style={rowStyle}
      {...attributes}
      {...listeners}
    />
  );
}
