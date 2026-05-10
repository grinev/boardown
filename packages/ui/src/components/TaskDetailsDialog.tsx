import { X } from 'lucide-react';
import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  TASK_STATUSES,
  TASK_TYPES,
  type Epic,
  type Release,
  type Task,
  type TaskStatus,
  type TaskType,
} from '@boardown/core';
import { useBoardStore } from '../store';
import { TASK_TYPE_META } from '../task-types';
import { pickContrastText } from '../utils/contrast-color';
import { formatStatusLabel } from '../utils/format-status';
import { IconSelect, type IconSelectOption } from './IconSelect';
import { InlineEditText } from './InlineEditText';
import { Modal } from './Modal';
import styles from './TaskDetailsDialog.module.css';

interface TaskDetailsDialogProps {
  task: Task;
  epic: Epic | undefined;
  release: Release | undefined;
  onClose: () => void;
  onEpicClick?: (slug: string) => void;
}

const NO_EPIC_VALUE = '__none__';
const NO_RELEASE_VALUE = '__none__';

const STATUS_PILL_CLASS: Record<TaskStatus, string | undefined> = {
  todo: styles.statusTodo,
  'in-progress': styles.statusInProgress,
  done: styles.statusDone,
};

const STATUS_DOT_CLASS: Record<TaskStatus, string | undefined> = {
  todo: styles.statusDotTodo,
  'in-progress': styles.statusDotInProgress,
  done: styles.statusDotDone,
};

const STATUS_OPTIONS: IconSelectOption[] = TASK_STATUSES.map((s) => ({
  value: s,
  label: formatStatusLabel(s),
  icon: <span className={`${styles.statusDot} ${STATUS_DOT_CLASS[s] ?? ''}`} />,
}));

const TYPE_OPTIONS: IconSelectOption[] = TASK_TYPES.map((t) => {
  const meta = TASK_TYPE_META[t];
  const Icon = meta.icon;
  return {
    value: t,
    label: meta.label,
    icon: <Icon size={14} style={{ color: meta.colorVar }} aria-hidden="true" />,
  };
});

export function TaskDetailsDialog({
  task,
  epic,
  release,
  onClose,
  onEpicClick,
}: TaskDetailsDialogProps) {
  const { id, type, status } = task.frontmatter;
  const typeMeta = TASK_TYPE_META[type];
  const TypeIcon = typeMeta.icon;
  const updateTask = useBoardStore((s) => s.updateTask);
  const moveTaskToRelease = useBoardStore((s) => s.moveTaskToRelease);
  const epics = useBoardStore((s) => s.snapshot?.epics ?? []);
  const releases = useBoardStore((s) => s.snapshot?.releases ?? []);

  const releaseOptions = useMemo<IconSelectOption[]>(() => {
    const sorted = [...releases].sort((a, b) =>
      a.frontmatter.release.localeCompare(b.frontmatter.release),
    );
    const items: IconSelectOption[] = sorted.map((r) => ({
      value: r.filename,
      label: r.frontmatter.release,
    }));
    if (task.frontmatter.epic) {
      return [{ value: NO_RELEASE_VALUE, label: '—' }, ...items];
    }
    return items;
  }, [releases, task.frontmatter.epic]);

  const epicOptions = useMemo<IconSelectOption[]>(() => {
    const sorted = [...epics].sort((a, b) =>
      a.frontmatter.name.localeCompare(b.frontmatter.name),
    );
    const items: IconSelectOption[] = sorted.map((e) => ({
      value: e.slug,
      label: e.frontmatter.name,
      icon: (
        <span
          className={styles.epicSwatch}
          style={{ background: e.frontmatter.color }}
          aria-hidden="true"
        />
      ),
    }));
    return [{ value: NO_EPIC_VALUE, label: '—' }, ...items];
  }, [epics]);

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
          <InlineEditText
            value={task.title}
            required
            ariaLabel="Task title"
            className={styles.title}
            onSave={(next) => updateTask(id, { title: next })}
          />
          <section className={styles.descriptionSection}>
            <h3 className={styles.sectionHeading}>Description</h3>
            <InlineEditText
              value={task.description}
              multiline
              placeholder="No description"
              ariaLabel="Task description"
              className={styles.descriptionBody}
              onSave={(next) => updateTask(id, { description: next })}
            />
          </section>
        </main>
        <aside className={styles.sidebar}>
          <IconSelect
            value={status}
            options={STATUS_OPTIONS}
            ariaLabel="Status"
            hideChevron
            hideTriggerIcon
            triggerClassName={`${styles.statusPill} ${styles.statusPillTrigger} ${STATUS_PILL_CLASS[status] ?? ''}`}
            onChange={(next) => {
              void updateTask(id, { status: next as TaskStatus });
            }}
          />
          <div className={styles.detailsCard}>
            <h3 className={styles.detailsHeading}>Details</h3>
            <dl className={styles.detailsList}>
              <div className={styles.detailRow}>
                <dt className={styles.detailLabel}>Type</dt>
                <dd className={styles.detailValue}>
                  <IconSelect
                    value={type}
                    options={TYPE_OPTIONS}
                    ariaLabel="Type"
                    hideChevron
                    triggerClassName={styles.inlineSelectTrigger}
                    onChange={(next) => {
                      void updateTask(id, { type: next as TaskType });
                    }}
                  />
                </dd>
              </div>
              <div className={styles.detailRow}>
                <dt className={styles.detailLabel}>Epic</dt>
                <dd className={styles.detailValue}>
                  <EpicEditor
                    epic={epic}
                    options={epicOptions}
                    onSelect={(slug) => {
                      void updateTask(id, { epic: slug });
                    }}
                    onNavigate={onEpicClick}
                  />
                </dd>
              </div>
              <div className={styles.detailRow}>
                <dt className={styles.detailLabel}>Release</dt>
                <dd className={styles.detailValue}>
                  <IconSelect
                    value={release ? release.filename : NO_RELEASE_VALUE}
                    options={releaseOptions}
                    ariaLabel="Release"
                    hideChevron
                    triggerClassName={styles.inlineSelectTrigger}
                    onChange={(next) => {
                      void moveTaskToRelease(
                        id,
                        next === NO_RELEASE_VALUE ? null : next,
                      );
                    }}
                  />
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </Modal>
  );
}

interface EpicEditorProps {
  epic: Epic | undefined;
  options: IconSelectOption[];
  onSelect: (slug: string | null) => void;
  onNavigate?: ((slug: string) => void) | undefined;
}

function EpicEditor({ epic, options, onSelect, onNavigate }: EpicEditorProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const enterEdit = () => setMode('edit');
  const exitEdit = () => setMode('view');

  if (mode === 'edit') {
    return (
      <IconSelect
        value={epic?.slug ?? NO_EPIC_VALUE}
        options={options}
        ariaLabel="Epic"
        hideChevron
        autoOpen
        triggerClassName={styles.inlineSelectTrigger}
        onClose={exitEdit}
        onChange={(next) => {
          onSelect(next === NO_EPIC_VALUE ? null : next);
        }}
      />
    );
  }

  const handleViewKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      enterEdit();
    }
  };

  const epicStyle: CSSProperties | undefined = epic
    ? {
        background: epic.frontmatter.color,
        color: pickContrastText(epic.frontmatter.color),
      }
    : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Edit epic"
      className={styles.epicViewTrigger}
      onClick={enterEdit}
      onKeyDown={handleViewKeyDown}
    >
      {epic ? (
        onNavigate ? (
          <button
            type="button"
            className={styles.epicBadge}
            style={epicStyle}
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(epic.slug);
            }}
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
    </div>
  );
}
