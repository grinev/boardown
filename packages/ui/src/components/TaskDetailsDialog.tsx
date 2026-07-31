import { X } from 'lucide-react';
import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  customFieldLabel,
  inProgressCount,
  isWipLimitReached,
  TASK_STATUSES,
  TASK_TYPES,
  wipLimitFor,
  type CustomField,
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
import { wipLimitHint } from '../utils/wip-limit';
import { Checklist } from './Checklist';
import { DeleteTaskDialog } from './DeleteTaskDialog';
import { DialogBackButton } from './DialogBackButton';
import { IconSelect, type IconSelectOption } from './IconSelect';
import { InlineEditText } from './InlineEditText';
import { LinkedText } from './LinkedText';
import { LinkedTasks } from './LinkedTasks';
import { Modal } from './Modal';
import { Notes } from './Notes';
import { TaskActionsMenu } from './TaskActionsMenu';
import styles from './TaskDetailsDialog.module.css';

interface TaskDetailsDialogProps {
  task: Task;
  epic: Epic | undefined;
  release: Release | undefined;
  onClose: () => void;
  onEpicClick?: (slug: string) => void;
  onTaskClick: (id: string) => void;
}

const NO_EPIC_VALUE = '__none__';
const NO_RELEASE_VALUE = '__none__';

// Stable identity, so the selector doesn't return a fresh array every render.
const EMPTY_FIELDS: CustomField[] = [];

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

const STATUS_LOCKED_HINT = 'Status changes only in the current release.';

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
  onTaskClick,
}: TaskDetailsDialogProps) {
  const { id, type, status } = task.frontmatter;
  const typeMeta = TASK_TYPE_META[type];
  const TypeIcon = typeMeta.icon;
  const updateTask = useBoardStore((s) => s.updateTask);
  const moveTaskToRelease = useBoardStore((s) => s.moveTaskToRelease);
  const epics = useBoardStore((s) => s.snapshot?.epics ?? []);
  const releases = useBoardStore((s) => s.snapshot?.releases ?? []);
  const customFields = useBoardStore((s) => s.snapshot?.config.customFields ?? EMPTY_FIELDS);
  const archived = release?.frontmatter.status === 'finished';
  // A status only changes in the current release, so everywhere else — a future
  // release, an epic file, the backlog, the archive — it is a value, not a control.
  const statusLocked = release?.frontmatter.status !== 'current';
  const [deleteOpen, setDeleteOpen] = useState(false);

  const config = useBoardStore((s) => s.snapshot?.config);
  const current = useMemo(
    () => releases.find((r) => r.frontmatter.status === 'current'),
    [releases],
  );
  // The board refuses a task entering a full In Progress column, so the controls
  // that would do it are shown unavailable rather than failing after the fact.
  const wipFull =
    current !== undefined && config !== undefined && isWipLimitReached(current, config);
  const wipLimit =
    current !== undefined && config !== undefined ? wipLimitFor(current, config) : null;
  const wipCount = current === undefined ? 0 : inProgressCount(current);
  const wipHint = wipLimit === null ? undefined : wipLimitHint(wipCount, wipLimit);

  const releaseOptions = useMemo<IconSelectOption[]>(() => {
    // A finished release is archived: core refuses a task moved into one, so it is
    // never offered as a destination (same rule as the create-task dialog).
    const sorted = releases
      .filter((r) => r.frontmatter.status !== 'finished')
      .sort((a, b) => a.slug.localeCompare(b.slug));
    const items: IconSelectOption[] = sorted.map((r) => {
      // Relocating an `in-progress` task into a full current release enters the
      // column, so that one destination is unavailable — unless the task is
      // already there, where picking it changes nothing.
      const blocked =
        wipFull &&
        status === 'in-progress' &&
        r.frontmatter.status === 'current' &&
        r.filename !== release?.filename;
      return {
        value: r.filename,
        label: blocked ? `${r.frontmatter.name ?? r.slug} (${wipCount} / ${wipLimit})` : (r.frontmatter.name ?? r.slug),
        ...(blocked ? { disabled: true, title: wipHint } : {}),
      };
    });
    // "—" removes the release: a task with an epic falls back to its epic file,
    // an epic-less task to the backlog (no_epic.md).
    return [{ value: NO_RELEASE_VALUE, label: '—' }, ...items];
  }, [releases, wipFull, status, release?.filename, wipCount, wipLimit, wipHint]);

  const statusOptions = useMemo<IconSelectOption[]>(
    () =>
      STATUS_OPTIONS.map((option) => {
        const blocked =
          option.value === 'in-progress' && wipFull && status !== 'in-progress';
        if (!blocked) return option;
        return {
          ...option,
          label: `${option.label} (${wipCount} / ${wipLimit})`,
          disabled: true,
          title: wipHint,
        };
      }),
    [wipFull, status, wipCount, wipLimit, wipHint],
  );

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
        <div className={styles.headerActions}>
          <DialogBackButton />
          <TaskActionsMenu
            deleteDisabled={archived}
            onDelete={() => setDeleteOpen(true)}
          />
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
      <div className={styles.body}>
        <main className={styles.main}>
          <InlineEditText
            value={task.title}
            required
            readOnly={archived}
            ariaLabel="Task title"
            className={styles.title}
            onSave={(next) => updateTask(id, { title: next })}
          />
          <section className={styles.descriptionSection}>
            <h3 className={styles.sectionHeading}>Description</h3>
            <InlineEditText
              value={task.description}
              multiline
              readOnly={archived}
              placeholder="No description"
              ariaLabel="Task description"
              className={styles.descriptionBody}
              renderView={(value) => <LinkedText text={value} />}
              onSave={(next) => updateTask(id, { description: next })}
            />
          </section>
          <Checklist
            task={task}
            readOnly={archived}
            onChange={(items) => updateTask(id, { checklist: items })}
          />
          <LinkedTasks
            task={task}
            readOnly={archived}
            onTaskClick={onTaskClick}
          />
          <Notes
            task={task}
            readOnly={archived}
            onChange={(notes) => updateTask(id, { notes })}
          />
        </main>
        <aside className={styles.sidebar}>
          {statusLocked ? (
            <span
              className={`${styles.statusPill} ${STATUS_PILL_CLASS[status] ?? ''}`}
              // An archived task explains none of its frozen fields, so it gets no
              // hint here either; the lock is the only one worth a reason.
              title={archived ? undefined : STATUS_LOCKED_HINT}
            >
              {formatStatusLabel(status)}
            </span>
          ) : (
            <IconSelect
              value={status}
              options={statusOptions}
              ariaLabel="Status"
              hideChevron
              hideTriggerIcon
              triggerClassName={`${styles.statusPill} ${styles.statusPillTrigger} ${STATUS_PILL_CLASS[status] ?? ''}`}
              onChange={(next) => {
                // A refused option is disabled, so a rejection here is a race on a
                // stale snapshot; the store has already reported it.
                void updateTask(id, { status: next as TaskStatus }).catch(() => {});
              }}
            />
          )}
          <div className={styles.detailsCard}>
            <h3 className={styles.detailsHeading}>Details</h3>
            <dl className={styles.detailsList}>
              <div className={styles.detailRow}>
                <dt className={styles.detailLabel}>Type</dt>
                <dd className={styles.detailValue}>
                  {archived ? (
                    <span className={styles.staticValue}>
                      <TypeIcon
                        size={14}
                        style={{ color: typeMeta.colorVar }}
                        aria-hidden="true"
                      />
                      {typeMeta.label}
                    </span>
                  ) : (
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
                  )}
                </dd>
              </div>
              <div className={styles.detailRow}>
                <dt className={styles.detailLabel}>Epic</dt>
                <dd className={styles.detailValue}>
                  <EpicEditor
                    epic={epic}
                    options={epicOptions}
                    readOnly={archived}
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
                  {archived && release ? (
                    <span className={styles.staticValue}>
                      {release.frontmatter.name ?? release.slug}
                    </span>
                  ) : (
                    <IconSelect
                      value={release ? release.filename : NO_RELEASE_VALUE}
                      options={releaseOptions}
                      ariaLabel="Release"
                      hideChevron
                      triggerClassName={styles.inlineSelectTrigger}
                      onChange={(next) => {
                        // Same as the status control: a refused destination is
                        // disabled, so a rejection here is a race.
                        void moveTaskToRelease(
                          id,
                          next === NO_RELEASE_VALUE ? null : next,
                        ).catch(() => {});
                      }}
                    />
                  )}
                </dd>
              </div>
              {customFields.map((field) => (
                <div key={field.key} className={styles.detailRowWrapping}>
                  <dt className={styles.detailLabel}>{customFieldLabel(field)}</dt>
                  <dd className={styles.detailValueWide}>
                    <InlineEditText
                      value={task.frontmatter.custom?.[field.key] ?? ''}
                      readOnly={archived}
                      docRefs
                      ariaLabel={customFieldLabel(field)}
                      className={styles.customValue}
                      renderView={(value) => <LinkedText text={value} />}
                      onSave={(next) => updateTask(id, { custom: { [field.key]: next } })}
                    />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>
      {deleteOpen && (
        <DeleteTaskDialog task={task} onClose={() => setDeleteOpen(false)} />
      )}
    </Modal>
  );
}

interface EpicEditorProps {
  epic: Epic | undefined;
  options: IconSelectOption[];
  readOnly: boolean;
  onSelect: (slug: string | null) => void;
  onNavigate?: ((slug: string) => void) | undefined;
}

function EpicEditor({
  epic,
  options,
  readOnly,
  onSelect,
  onNavigate,
}: EpicEditorProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const enterEdit = () => setMode('edit');
  const exitEdit = () => setMode('view');

  // The release can finish under an open dropdown (an external edit plus Reload),
  // so read-only has to win over the mode this component is already in.
  if (!readOnly && mode === 'edit') {
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

  const badge = epic ? (
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
  );

  // Read-only keeps the badge — navigating to the epic is not a mutation — but
  // drops the wrapper that opens the picker.
  if (readOnly) {
    return <span className={styles.staticValue}>{badge}</span>;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Edit epic"
      className={styles.epicViewTrigger}
      onClick={enterEdit}
      onKeyDown={handleViewKeyDown}
    >
      {badge}
    </div>
  );
}
