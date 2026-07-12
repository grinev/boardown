import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react';
import type { Epic, Task, TaskStatus } from '@boardown/core';
import { TASK_TYPE_META } from '../task-types';
import { pickContrastText } from '../utils/contrast-color';
import { formatStatusLabel } from '../utils/format-status';
import styles from './BacklogView.module.css';

const STATUS_CLASS: Record<TaskStatus, string> = {
  todo: styles.statusTodo!,
  'in-progress': styles.statusInProgress!,
  done: styles.statusDone!,
};

export interface BacklogRowViewProps extends HTMLAttributes<HTMLLIElement> {
  task: Task;
  epic: Epic | undefined;
  onOpenTask?: (id: string) => void;
  onOpenEpic?: (slug: string) => void;
}

export const BacklogRowView = forwardRef<HTMLLIElement, BacklogRowViewProps>(
  ({ task, epic, onOpenTask, onOpenEpic, className, ...rest }, ref) => {
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
      <li
        ref={ref}
        className={`${styles.row}${className ? ` ${className}` : ''}`}
        data-testid={`backlog-row-${id}`}
        {...rest}
      >
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
            onOpenTask?.(id);
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
                onOpenEpic?.(epic.slug);
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
  },
);

BacklogRowView.displayName = 'BacklogRowView';
