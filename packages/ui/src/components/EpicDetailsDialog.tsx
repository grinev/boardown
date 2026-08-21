import { Check, Layers, Plus, X } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import {
  EPIC_NAME_MAX_LENGTH,
  validateEpicName,
  type Epic,
  type Task,
  type TaskStatus,
} from '@boardown/core';
import { useBoardStore } from '../store';
import { TASK_TYPE_META } from '../task-types';
import { formatStatusLabel } from '../utils/format-status';
import { DialogBackButton } from './DialogBackButton';
import { EpicColorSwatches } from './EpicColorSwatches';
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
  const openCreateTaskForEpic = useBoardStore((s) => s.openCreateTaskForEpic);
  // Non-null while the palette is open; holds the pick that Save would write.
  const [pendingColor, setPendingColor] = useState<string | null>(null);
  const colorRowRef = useRef<HTMLDivElement>(null);
  const paletteOpen = pendingColor !== null;

  // Opening the palette unmounts the swatch button that was clicked, and closing it
  // unmounts the palette: without moving focus it would fall back to the body, and
  // Escape would reach the dialog instead of the panel.
  const paletteWasOpen = useRef(false);
  useEffect(() => {
    if (paletteOpen) {
      const radios = colorRowRef.current?.querySelectorAll<HTMLElement>('[role="radio"]');
      const checked = [...(radios ?? [])].find((r) => r.getAttribute('aria-checked') === 'true');
      (checked ?? radios?.[0])?.focus();
    } else if (paletteWasOpen.current) {
      colorRowRef.current?.querySelector('button')?.focus();
    }
    paletteWasOpen.current = paletteOpen;
  }, [paletteOpen]);

  // Core's rule, minus its empty-name message: an emptied field is `required`'s
  // business, and it restores the old name rather than reporting anything — the
  // same split the release rename makes.
  const validateName = (next: string): string | null =>
    next.trim().length === 0 ? null : validateEpicName(next);

  return (
    <Modal open onClose={onClose} ariaLabel={`Epic ${epic.frontmatter.name}`}>
      <header className={styles.header}>
        <div className={styles.headerName}>
          <Layers className={styles.headerIcon} aria-hidden="true" />
          <div className={styles.nameSlot}>
            <InlineEditText
              value={epic.frontmatter.name}
              required
              ariaLabel="Epic name"
              className={styles.nameText}
              maxLength={EPIC_NAME_MAX_LENGTH}
              validate={validateName}
              onSave={(next) => updateEpic(epic.slug, { name: next })}
            />
          </div>
          <DialogBackButton />
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div
        className={styles.body}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || pendingColor === null) return;
          // Escape cancels the palette; preventDefault keeps the dialog's own close
          // watcher from firing on the same press.
          event.preventDefault();
          setPendingColor(null);
        }}
      >
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>Color</h3>
          <div className={styles.colorRow} ref={colorRowRef}>
            {pendingColor === null ? (
              <button
                type="button"
                className={styles.colorValue}
                // The value is data, not a theme token, so it is set inline.
                style={{ background: epic.frontmatter.color }}
                title={epic.frontmatter.color}
                aria-label="Change color"
                onClick={() => setPendingColor(epic.frontmatter.color)}
              />
            ) : (
              <>
                <EpicColorSwatches
                  className={styles.colorSwatches}
                  value={pendingColor}
                  onSelect={setPendingColor}
                />
                <button
                  type="button"
                  className={styles.colorActionButton}
                  aria-label="Save color"
                  onClick={() => {
                    setPendingColor(null);
                    if (pendingColor.toLowerCase() === epic.frontmatter.color.toLowerCase()) return;
                    void updateEpic(epic.slug, { color: pendingColor });
                  }}
                >
                  <Check size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.colorActionButton}
                  aria-label="Cancel color"
                  onClick={() => setPendingColor(null)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </section>
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
          <div className={styles.tasksHeading}>
            <h3 className={styles.sectionHeading}>Tasks ({tasks.length})</h3>
            <button
              type="button"
              className={styles.addButton}
              aria-label="Create task"
              onClick={() => openCreateTaskForEpic(epic.slug)}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
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
