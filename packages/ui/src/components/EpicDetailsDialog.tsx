import { Layers, X } from 'lucide-react';
import { Fragment } from 'react';
import type { Epic, Task, TaskStatus } from '@boardown/core';
import { useBoardStore } from '../store';
import { TASK_TYPE_META } from '../task-types';
import { formatStatusLabel } from '../utils/format-status';
import { InlineEditText } from './InlineEditText';
import { LinkedText } from './LinkedText';
import { Modal } from './Modal';
import styles from './EpicDetailsDialog.module.css';

interface EpicDetailsDialogProps {
  epic: Epic;
  tasks: Task[];
  onClose: () => void;
  onTaskClick: (id: string) => void;
}

const STATUS_PILL_CLASS: Record<TaskStatus, string | undefined> = {
  todo: styles.statusTodo,
  'in-progress': styles.statusInProgress,
  done: styles.statusDone,
};

export function EpicDetailsDialog({
  epic,
  tasks,
  onClose,
  onTaskClick,
}: EpicDetailsDialogProps) {
  const updateEpic = useBoardStore((s) => s.updateEpic);

  return (
    <Modal open onClose={onClose} ariaLabel={`Epic ${epic.frontmatter.name}`}>
      <header className={styles.header}>
        <div className={styles.headerName}>
          <Layers className={styles.headerIcon} aria-hidden="true" />
          <InlineEditText
            value={epic.frontmatter.name}
            required
            ariaLabel="Epic name"
            className={styles.nameText}
            onSave={(next) => updateEpic(epic.slug, { name: next })}
          />
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
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>Description</h3>
          <InlineEditText
            value={epic.preamble}
            multiline
            placeholder="No description"
            ariaLabel="Epic description"
            className={styles.descriptionBody}
            renderView={(value) => <LinkedText text={value} />}
            onSave={(next) => updateEpic(epic.slug, { preamble: next })}
          />
        </section>
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>Tasks ({tasks.length})</h3>
          {tasks.length === 0 ? (
            <p className={styles.tasksEmpty}>No tasks</p>
          ) : (
            <div
              className={styles.tasksTable}
              role="table"
              aria-label="Epic tasks"
            >
              <div role="row" style={{ display: 'contents' }}>
                <span className={styles.tasksHeaderCell} role="columnheader">
                  Type
                </span>
                <span className={styles.tasksHeaderCell} role="columnheader">
                  ID
                </span>
                <span className={styles.tasksHeaderCell} role="columnheader">
                  Title
                </span>
                <span className={styles.tasksHeaderCell} role="columnheader">
                  Status
                </span>
              </div>
              {tasks.map((task) => {
                const { id, type, status } = task.frontmatter;
                const typeMeta = TASK_TYPE_META[type];
                const TypeIcon = typeMeta.icon;
                return (
                  <Fragment key={id}>
                    <TypeIcon
                      className={styles.taskTypeIcon}
                      style={{ color: typeMeta.colorVar }}
                      aria-label={typeMeta.label}
                    />
                    <span className={styles.taskId}>{id}</span>
                    <button
                      type="button"
                      className={styles.taskTitleButton}
                      onClick={() => onTaskClick(id)}
                    >
                      {task.title}
                    </button>
                    <span
                      className={`${styles.statusPill} ${STATUS_PILL_CLASS[status] ?? ''}`}
                    >
                      {formatStatusLabel(status)}
                    </span>
                  </Fragment>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
