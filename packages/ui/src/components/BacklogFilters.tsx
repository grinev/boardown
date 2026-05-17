import { useMemo } from 'react';
import type { Epic, TaskStatus, TaskType } from '@boardown/core';
import { TASK_STATUSES, TASK_TYPES } from '@boardown/core';
import { TASK_TYPE_META } from '../task-types';
import { formatStatusLabel } from '../utils/format-status';
import { IconSelect, type IconSelectOption } from './IconSelect';
import styles from './BacklogFilters.module.css';

export type StatusFilter = TaskStatus | 'all';
export type TypeFilter = TaskType | 'all';
export type EpicFilter = 'all' | 'no-epic' | (string & {});

const ALL_OPTION: IconSelectOption = { value: 'all', label: 'All' };

const STATUS_DOT_CLASS: Record<TaskStatus, string | undefined> = {
  todo: styles.statusDotTodo,
  'in-progress': styles.statusDotInProgress,
  done: styles.statusDotDone,
};

interface BacklogFiltersProps {
  epics: Epic[];
  statusFilter: StatusFilter;
  typeFilter: TypeFilter;
  epicFilter: EpicFilter;
  onStatusChange: (value: StatusFilter) => void;
  onTypeChange: (value: TypeFilter) => void;
  onEpicChange: (value: EpicFilter) => void;
}

export function BacklogFilters({
  epics,
  statusFilter,
  typeFilter,
  epicFilter,
  onStatusChange,
  onTypeChange,
  onEpicChange,
}: BacklogFiltersProps) {
  const statusOptions = useMemo<IconSelectOption[]>(
    () => [
      ALL_OPTION,
      ...TASK_STATUSES.map((s) => ({
        value: s,
        label: formatStatusLabel(s),
        icon: (
          <span
            className={`${styles.statusDot} ${STATUS_DOT_CLASS[s] ?? ''}`}
            aria-hidden="true"
          />
        ),
      })),
    ],
    [],
  );

  const typeOptions = useMemo<IconSelectOption[]>(
    () => [
      ALL_OPTION,
      ...TASK_TYPES.map((t) => {
        const meta = TASK_TYPE_META[t];
        const Icon = meta.icon;
        return {
          value: t,
          label: meta.label,
          icon: <Icon size={14} style={{ color: meta.colorVar }} aria-hidden="true" />,
        };
      }),
    ],
    [],
  );

  const epicOptions = useMemo<IconSelectOption[]>(() => {
    const sorted = [...epics].sort((a, b) =>
      a.frontmatter.name.localeCompare(b.frontmatter.name),
    );
    return [
      ALL_OPTION,
      { value: 'no-epic', label: 'No epic' },
      ...sorted.map((epic) => ({
        value: epic.slug,
        label: epic.frontmatter.name,
        icon: (
          <span
            className={styles.epicSwatch}
            style={{ background: epic.frontmatter.color }}
            aria-hidden="true"
          />
        ),
      })),
    ];
  }, [epics]);

  return (
    <div className={styles.bar}>
      <div className={styles.field}>
        <span className={styles.label}>status</span>
        <IconSelect
          value={statusFilter}
          options={statusOptions}
          onChange={(v) => onStatusChange(v as StatusFilter)}
          ariaLabel="Filter by status"
          triggerClassName={styles.trigger}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>type</span>
        <IconSelect
          value={typeFilter}
          options={typeOptions}
          onChange={(v) => onTypeChange(v as TypeFilter)}
          ariaLabel="Filter by task type"
          triggerClassName={styles.trigger}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>epic</span>
        <IconSelect
          value={epicFilter}
          options={epicOptions}
          onChange={(v) => onEpicChange(v as EpicFilter)}
          ariaLabel="Filter by epic"
          triggerClassName={styles.trigger}
        />
      </div>
    </div>
  );
}
