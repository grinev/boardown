import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Epic, Release, Task, TaskStatus } from '@boardown/core';
import { useBoardStore } from '../store';
import { TASK_TYPE_META } from '../task-types';
import { pickContrastText } from '../utils/contrast-color';
import { formatStatusLabel } from '../utils/format-status';
import {
  BacklogFilters,
  type EpicFilter,
  type StatusFilter,
  type TypeFilter,
} from './BacklogFilters';
import styles from './BacklogView.module.css';

const STATUS_CLASS: Record<TaskStatus, string> = {
  todo: styles.statusTodo!,
  'in-progress': styles.statusInProgress!,
  done: styles.statusDone!,
};

interface SectionData {
  key: string;
  title: string;
  statusLabel: string | null;
  tasks: Task[];
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
  release.frontmatter.name ?? release.frontmatter.release;

export function BacklogView() {
  const snapshot = useBoardStore((s) => s.snapshot);
  const openTask = useBoardStore((s) => s.openTask);
  const openEpic = useBoardStore((s) => s.openEpic);

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

  const epics = snapshot?.epics ?? [];

  useEffect(() => {
    if (epicFilter === 'all' || epicFilter === 'no-epic') return;
    const exists = epics.some((e) => e.slug === epicFilter);
    if (!exists) setEpicFilter('all');
  }, [epics, epicFilter]);

  if (snapshot === null) return null;

  const { releases, backlog } = snapshot;

  const epicsBySlug = new Map(epics.map((e) => [e.slug, e]));

  const current = releases.find((r) => r.frontmatter.status === 'current');
  const futures = releases
    .filter((r) => r.frontmatter.status === 'future')
    .sort((a, b) => a.filename.localeCompare(b.filename));

  const backlogTasks = [
    ...epics.flatMap((e) => e.tasks),
    ...(backlog?.tasks ?? []),
  ].sort(sortBacklogTasks);

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

  const sections: SectionData[] = [];
  if (current) {
    sections.push({
      key: `release:${current.filename}`,
      title: releaseTitle(current),
      statusLabel: 'active',
      tasks: [...current.tasks].sort(sortByOrder),
    });
  }
  for (const r of futures) {
    sections.push({
      key: `release:${r.filename}`,
      title: releaseTitle(r),
      statusLabel: 'future',
      tasks: [...r.tasks].sort(sortByOrder),
    });
  }
  sections.push({ key: 'backlog', title: 'Backlog', statusLabel: null, tasks: backlogTasks });

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
      {sections.map((section) => {
        const displayedTasks = filtersActive
          ? section.tasks.filter(matchesFilters)
          : section.tasks;
        return (
          <BacklogSection
            key={section.key}
            title={section.title}
            statusLabel={section.statusLabel}
            tasks={displayedTasks}
            totalCount={section.tasks.length}
            filtersActive={filtersActive}
            collapsed={collapsedKeys.has(section.key)}
            onToggle={() => toggleCollapsed(section.key)}
            epicsBySlug={epicsBySlug}
            onOpenTask={openTask}
            onOpenEpic={openEpic}
          />
        );
      })}
    </div>
  );
}

interface BacklogSectionProps {
  title: string;
  statusLabel: string | null;
  tasks: Task[];
  totalCount: number;
  filtersActive: boolean;
  collapsed: boolean;
  onToggle: () => void;
  epicsBySlug: Map<string, Epic>;
  onOpenTask: (id: string) => void;
  onOpenEpic: (slug: string) => void;
}

function BacklogSection({
  title,
  statusLabel,
  tasks,
  totalCount,
  filtersActive,
  collapsed,
  onToggle,
  epicsBySlug,
  onOpenTask,
  onOpenEpic,
}: BacklogSectionProps) {
  const emptyMessage =
    totalCount === 0
      ? 'No work items'
      : 'No tasks match the filters';
  const ChevronIcon = collapsed ? ChevronRight : ChevronDown;
  return (
    <section className={styles.section}>
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
        <span className={styles.sectionCount}>
          {filtersActive ? `${tasks.length} of ${totalCount}` : tasks.length}
        </span>
      </header>
      {!collapsed &&
        (tasks.length === 0 ? (
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
        ))}
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
  const { id, type, status } = task.frontmatter;
  const typeMeta = TASK_TYPE_META[type];
  const TypeIcon = typeMeta.icon;

  const epicStyle = epic
    ? ({
        '--epic-bg': epic.frontmatter.color,
        '--epic-fg': pickContrastText(epic.frontmatter.color),
      } as CSSProperties)
    : undefined;

  return (
    <li className={styles.row}>
      <TypeIcon
        className={styles.typeIcon}
        style={{ color: typeMeta.colorVar }}
        aria-label={typeMeta.label}
      />
      <span className={styles.idText}>{id}</span>
      <button
        type="button"
        className={styles.titleButton}
        onClick={(e) => {
          e.stopPropagation();
          onOpenTask(id);
        }}
      >
        {task.title}
      </button>
      <span className={styles.epicSlot}>
        {epic && (
          <button
            type="button"
            className={styles.epicBadge}
            style={epicStyle}
            onClick={(e) => {
              e.stopPropagation();
              onOpenEpic(epic.slug);
            }}
          >
            {epic.frontmatter.name}
          </button>
        )}
      </span>
      <span className={`${styles.statusPill} ${STATUS_CLASS[status]}`}>
        {formatStatusLabel(status)}
      </span>
    </li>
  );
}
