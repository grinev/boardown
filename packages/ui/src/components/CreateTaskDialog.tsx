import { X } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import type { Epic, Release, TaskPriority, TaskType } from '@boardown/core';
import { DEFAULT_TASK_PRIORITY, TASK_PRIORITIES, TASK_TYPES } from '@boardown/core';
import { useBoardStore } from '../store';
import { TASK_PRIORITY_META } from '../task-priorities';
import { TASK_TYPE_META } from '../task-types';
import { isSubmitShortcut } from '../utils/submit-shortcut';
import { DiscardChangesDialog } from './DiscardChangesDialog';
import { DocRefTextarea } from './DocRefTextarea';
import { IconSelect, type IconSelectOption } from './IconSelect';
import { Modal } from './Modal';
import styles from './CreateTaskDialog.module.css';

interface CreateTaskDialogProps {
  // When provided the task is bound to this release and the selector is locked.
  // When `backlogLocked` is set the task has no release (goes to the backlog)
  // and the selector is locked to "—". Otherwise the user picks from `releases`.
  release?: Release;
  releases?: Release[];
  backlogLocked?: boolean;
  // When provided the task is bound to this epic and the epic selector is locked.
  epic?: Epic;
  epics: Epic[];
  onClose: () => void;
}

export function CreateTaskDialog({
  release,
  releases = [],
  backlogLocked = false,
  epic,
  epics,
  onClose,
}: CreateTaskDialogProps) {
  const createTask = useBoardStore((s) => s.createTask);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TaskType>('feature');
  const [priority, setPriority] = useState<TaskPriority>(DEFAULT_TASK_PRIORITY);
  // Captured beside the state they seed: a board refresh under an open dialog
  // re-renders it with fresh props, and the dirty check compares against what the
  // dialog opened with, not against what the board says now.
  const [initialEpicSlug] = useState(epic?.slug ?? '');
  const [epicSlug, setEpicSlug] = useState(initialEpicSlug);
  const [initialReleaseFilename] = useState(release?.filename ?? '');
  const [releaseFilename, setReleaseFilename] = useState(initialReleaseFilename);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  const releaseLocked = release !== undefined || backlogLocked;
  const releaseOptions =
    release !== undefined
      ? [release]
      : backlogLocked
        ? []
        : releases.filter((r) => r.frontmatter.status !== 'finished');

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && !submitting;

  const epicLocked = epic !== undefined;

  // Anything the user could have put there, against what the dialog opened with.
  // A locked Epic or Release is disabled, so it can never differ. Untrimmed: a
  // title of spaces is still something typed.
  const dirty =
    title !== '' ||
    description !== '' ||
    type !== 'feature' ||
    priority !== DEFAULT_TASK_PRIORITY ||
    epicSlug !== initialEpicSlug ||
    releaseFilename !== initialReleaseFilename;

  const epicOptions = useMemo<IconSelectOption[]>(() => {
    const toOption = (e: Epic): IconSelectOption => ({
      value: e.slug,
      label: e.frontmatter.name,
      icon: (
        <span
          className={styles.epicSwatch}
          style={{ background: e.frontmatter.color }}
          aria-hidden="true"
        />
      ),
    });
    if (epic) return [toOption(epic)];
    const sorted = [...epics].sort((a, b) =>
      a.frontmatter.name.localeCompare(b.frontmatter.name),
    );
    return [{ value: '', label: 'No epic' }, ...sorted.map(toOption)];
  }, [epic, epics]);

  const typeOptions = useMemo<IconSelectOption[]>(
    () =>
      TASK_TYPES.map((t) => {
        const meta = TASK_TYPE_META[t];
        const Icon = meta.icon;
        return {
          value: t,
          label: meta.label,
          icon: (
            <Icon
              size={14}
              style={{ color: meta.colorVar }}
              aria-hidden="true"
            />
          ),
        };
      }),
    [],
  );

  const priorityOptions = useMemo<IconSelectOption[]>(
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

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const trimmedDescription = description.trim();
      await createTask({
        releaseFilename,
        title: trimmedTitle,
        type,
        // The default is not written: a new task only carries the key when the
        // user picked something other than medium.
        ...(priority !== DEFAULT_TASK_PRIORITY ? { priority } : {}),
        ...(trimmedDescription.length > 0 ? { description: trimmedDescription } : {}),
        ...(epicSlug.length > 0 ? { epic: epicSlug } : {}),
      });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // On the dialog itself, not the form: the ✕ is outside the form and a click on
  // inert space parks focus on the <dialog>, so anything lower would miss them.
  const handleShortcut = (event: KeyboardEvent<HTMLDialogElement>) => {
    // The confirmation is a dialog inside this one, so its keystrokes bubble
    // through here. While it is up, the form is not what is being addressed.
    if (discardOpen) return;
    if (!isSubmitShortcut(event)) return;
    // Prevented even when the dialog refuses to submit, so a refusal never lets
    // the keystroke through to Cancel, the ✕ or the description's newline.
    event.preventDefault();
    void submit();
  };

  return (
    <Modal
      open
      onClose={onClose}
      ariaLabel="Create task"
      className={styles.dialog}
      dismissable={!dirty}
      onDismissBlocked={() => setDiscardOpen(true)}
      onKeyDown={handleShortcut}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>Create task</h2>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className={styles.field}>
          <span className={styles.label}>Title</span>
          <input
            type="text"
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-autofocus
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Description</span>
          <DocRefTextarea
            className={styles.textarea}
            value={description}
            onChange={setDescription}
            rows={4}
          />
        </label>
        <div className={styles.field}>
          <span className={styles.label}>Type</span>
          <IconSelect
            value={type}
            options={typeOptions}
            onChange={(v) => setType(v as TaskType)}
            ariaLabel="Type"
          />
        </div>
        <div className={styles.field}>
          <span className={styles.label}>Priority</span>
          <IconSelect
            value={priority}
            options={priorityOptions}
            onChange={(v) => setPriority(v as TaskPriority)}
            ariaLabel="Priority"
          />
        </div>
        <div className={styles.field}>
          <span className={styles.label}>Epic</span>
          <IconSelect
            value={epicSlug}
            options={epicOptions}
            onChange={(v) => setEpicSlug(v)}
            ariaLabel="Epic"
            disabled={epicLocked}
          />
        </div>
        <label className={styles.field}>
          <span className={styles.label}>Release</span>
          <select
            className={styles.select}
            value={releaseFilename}
            disabled={releaseLocked}
            onChange={(e) => setReleaseFilename(e.target.value)}
          >
            {(!releaseLocked || backlogLocked) && <option value="">—</option>}
            {releaseOptions.map((r) => (
              <option key={r.filename} value={r.filename}>
                {r.frontmatter.name ?? r.slug}
              </option>
            ))}
          </select>
        </label>
        {submitError !== null && (
          <p className={styles.error} role="alert">
            {submitError}
          </p>
        )}
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.createButton}
            disabled={!canSubmit}
          >
            Create
          </button>
        </footer>
      </form>
      {discardOpen && (
        <DiscardChangesDialog
          onCancel={() => setDiscardOpen(false)}
          onDiscard={onClose}
        />
      )}
    </Modal>
  );
}
