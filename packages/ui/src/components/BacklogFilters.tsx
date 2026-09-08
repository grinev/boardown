import { useMemo } from 'react';
import type { Epic, TaskPriority, TaskStatus } from '@boardown/core';
import { TASK_PRIORITIES, boardStatuses, enabledTaskTypes } from '@boardown/core';
import { useBoardStore } from '../store';
import { TASK_PRIORITY_META } from '../task-priorities';
import { taskTypeDisplay } from '../task-types';
import { statusColorStyle, statusDisplayLabel } from '../utils/status-style';
import { IconSelect, type IconSelectOption } from './IconSelect';
import styles from './BacklogFilters.module.css';

// A board declares its own statuses, so this is a plain string — which means the
// no-filter sentinel needs a shape a declared key cannot take (they start with a
// letter), the way the Unknown column's does.
export const ALL_STATUSES = '*all';
export const ALL_TYPES = '*all';
export type StatusFilter = TaskStatus;
export type TypeFilter = string;
export type EpicFilter = 'all' | 'no-epic' | (string & {});
export type PriorityFilter = TaskPriority | 'all';

const ALL_OPTION: IconSelectOption = { value: 'all', label: 'All' };
const ALL_STATUSES_OPTION: IconSelectOption = { value: ALL_STATUSES, label: 'All' };
const ALL_TYPES_OPTION: IconSelectOption = { value: ALL_TYPES, label: 'All' };

interface BacklogFiltersProps {
  epics: Epic[];
  statusFilter: StatusFilter;
  typeFilter: TypeFilter;
  epicFilter: EpicFilter;
  priorityFilter: PriorityFilter;
  onStatusChange: (value: StatusFilter) => void;
  onTypeChange: (value: TypeFilter) => void;
  onEpicChange: (value: EpicFilter) => void;
  onPriorityChange: (value: PriorityFilter) => void;
}

export function BacklogFilters({
  epics,
  statusFilter,
  typeFilter,
  epicFilter,
  priorityFilter,
  onStatusChange,
  onTypeChange,
  onEpicChange,
  onPriorityChange,
}: BacklogFiltersProps) {
  const config = useBoardStore((s) => s.snapshot?.config);
  const statusOptions = useMemo<IconSelectOption[]>(
    () => [
      ALL_STATUSES_OPTION,
      ...boardStatuses(config).map(({ key }) => ({
        value: key,
        label: statusDisplayLabel(config, key),
        icon: (
          <span
            className={styles.statusDot}
            style={statusColorStyle(config, key)}
            aria-hidden="true"
          />
        ),
      })),
    ],
    [config],
  );

  const typeOptions = useMemo<IconSelectOption[]>(
    () => [
      ALL_TYPES_OPTION,
      ...enabledTaskTypes(config).map((t) => {
        const meta = taskTypeDisplay(config, t.key);
        const Icon = meta.icon;
        return {
          value: t.key,
          label: meta.label,
          icon: <Icon size={14} style={meta.style} aria-hidden="true" />,
        };
      }),
    ],
    [config],
  );

  const priorityOptions = useMemo<IconSelectOption[]>(
    () => [
      ALL_OPTION,
      ...TASK_PRIORITIES.map((p) => {
        const meta = TASK_PRIORITY_META[p];
        const Icon = meta.icon;
        return {
          value: p,
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
          onChange={(v) => onStatusChange(v)}
          ariaLabel="Filter by status"
          triggerClassName={styles.trigger}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>type</span>
        <IconSelect
          value={typeFilter}
          options={typeOptions}
          onChange={onTypeChange}
          ariaLabel="Filter by task type"
          triggerClassName={styles.trigger}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>epic</span>
        <IconSelect
          value={epicFilter}
          options={epicOptions}
          onChange={(v) => onEpicChange(v)}
          ariaLabel="Filter by epic"
          triggerClassName={styles.trigger}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>priority</span>
        <IconSelect
          value={priorityFilter}
          options={priorityOptions}
          onChange={(v) => onPriorityChange(v as PriorityFilter)}
          ariaLabel="Filter by priority"
          triggerClassName={styles.trigger}
        />
      </div>
    </div>
  );
}
