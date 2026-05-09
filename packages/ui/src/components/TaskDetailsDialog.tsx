import { X } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Epic, Task, TaskStatus } from '@boardown/core';
import { TASK_TYPE_META } from '../task-types';
import { pickContrastText } from '../utils/contrast-color';
import { formatStatusLabel } from '../utils/format-status';
import { Modal } from './Modal';
import styles from './TaskDetailsDialog.module.css';

interface TaskDetailsDialogProps {
  task: Task;
  epic: Epic | undefined;
  onClose: () => void;
  onEpicClick?: (slug: string) => void;
}

export function TaskDetailsDialog({
  task,
  epic,
  onClose,
  onEpicClick,
}: TaskDetailsDialogProps) {
  const { id, type, status } = task.frontmatter;
  const typeMeta = TASK_TYPE_META[type];
  const TypeIcon = typeMeta.icon;

  const description = task.description.trim();

  const statusPillClass: Record<TaskStatus, string | undefined> = {
    todo: styles.statusTodo,
    'in-progress': styles.statusInProgress,
    done: styles.statusDone,
  };

  const epicStyle = epic
    ? ({
        '--epic-bg': epic.frontmatter.color,
        '--epic-fg': pickContrastText(epic.frontmatter.color),
      } as CSSProperties)
    : undefined;

  return (
    <Modal open onClose={onClose} ariaLabel={`Task ${id}`}>
      <header className={styles.header}>
        <div className={styles.headerId}>
          <TypeIcon
            className={styles.headerIcon}
            style={{ color: typeMeta.colorVar }}
            aria-label={typeMeta.label}
          />
          <span className={styles.idText}>{id}</span>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.body}>
        <main className={styles.main}>
          <h2 className={styles.title}>{task.title}</h2>
          <section className={styles.descriptionSection}>
            <h3 className={styles.sectionHeading}>Description</h3>
            {description.length === 0 ? (
              <p className={styles.descriptionEmpty}>No description</p>
            ) : (
              <p className={styles.descriptionBody}>{description}</p>
            )}
          </section>
        </main>
        <aside className={styles.sidebar}>
          <span className={`${styles.statusPill} ${statusPillClass[status]}`}>
            {formatStatusLabel(status)}
          </span>
          <div className={styles.detailsCard}>
            <h3 className={styles.detailsHeading}>Details</h3>
            <dl className={styles.detailsList}>
              <div className={styles.detailRow}>
                <dt className={styles.detailLabel}>Type</dt>
                <dd className={styles.detailValue}>
                  <TypeIcon
                    className={styles.detailTypeIcon}
                    style={{ color: typeMeta.colorVar }}
                    aria-hidden="true"
                  />
                  {typeMeta.label}
                </dd>
              </div>
              <div className={styles.detailRow}>
                <dt className={styles.detailLabel}>Epic</dt>
                <dd className={styles.detailValue}>
                  {epic ? (
                    onEpicClick ? (
                      <button
                        type="button"
                        className={styles.epicBadge}
                        style={epicStyle}
                        onClick={() => onEpicClick(epic.slug)}
                      >
                        {epic.frontmatter.name}
                      </button>
                    ) : (
                      <span className={styles.epicBadge} style={epicStyle}>
                        {epic.frontmatter.name}
                      </span>
                    )
                  ) : (
                    <span className={styles.detailEmpty}>—</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
