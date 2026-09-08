import { useMemo } from 'react';
import type { Epic } from '@boardown/core';
import { TASK_PRIORITIES, boardStatuses, enabledTaskTypes } from '@boardown/core';
import { useBoardStore } from '../store';
import { TASK_PRIORITY_META } from '../task-priorities';
import { taskTypeDisplay } from '../task-types';
import { statusColorStyle, statusDisplayLabel } from '../utils/status-style';
import { MultiSelect, type MultiSelectOption } from './MultiSelect';
import styles from './BacklogFilters.module.css';

interface BacklogFiltersProps {
  epics: Epic[];
  statusFilter: readonly string[];
  typeFilter: readonly string[];
  epicFilter: readonly string[];
  priorityFilter: readonly string[];
  onStatusChange: (value: string[]) => void;
  onTypeChange: (value: string[]) => void;
  onEpicChange: (value: string[]) => void;
  onPriorityChange: (value: string[]) => void;
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
  const statusOptions = useMemo<MultiSelectOption[]>(
    () =>
      boardStatuses(config).map(({ key }) => ({
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
    [config],
  );

  const typeOptions = useMemo<MultiSelectOption[]>(
    () =>
      enabledTaskTypes(config).map((t) => {
        const meta = taskTypeDisplay(config, t.key);
        const Icon = meta.icon;
        return {
          value: t.key,
          label: meta.label,
          icon: <Icon size={14} style={meta.style} aria-hidden="true" />,
        };
      }),
    [config],
  );

  const priorityOptions = useMemo<MultiSelectOption[]>(
    () =>
      TASK_PRIORITIES.map((p) => {
        const meta = TASK_PRIORITY_META[p];
        const Icon = meta.icon;
        return {
          value: p,
          label: meta.label,
          icon: <Icon size={14} style={{ color: meta.colorVar }} aria-hidden="true" />,
        };
      }),
    [],
  );

  const epicOptions = useMemo<MultiSelectOption[]>(() => {
    const sorted = [...epics].sort((a, b) =>
      a.frontmatter.name.localeCompare(b.frontmatter.name),
    );
    return [
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
        <MultiSelect
          value={statusFilter}
          options={statusOptions}
          onChange={onStatusChange}
          ariaLabel="Filter by status"
          triggerClassName={styles.trigger}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>type</span>
        <MultiSelect
          value={typeFilter}
          options={typeOptions}
          onChange={onTypeChange}
          ariaLabel="Filter by task type"
          triggerClassName={styles.trigger}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>epic</span>
        <MultiSelect
          value={epicFilter}
          options={epicOptions}
          onChange={onEpicChange}
          ariaLabel="Filter by epic"
          triggerClassName={styles.trigger}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>priority</span>
        <MultiSelect
          value={priorityFilter}
          options={priorityOptions}
          onChange={onPriorityChange}
          ariaLabel="Filter by priority"
          triggerClassName={styles.trigger}
        />
      </div>
    </div>
  );
}
