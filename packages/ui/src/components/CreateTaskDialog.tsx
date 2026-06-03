import { X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { Epic, Release, TaskType } from '@boardown/core';
import { TASK_TYPES } from '@boardown/core';
import { useBoardStore } from '../store';
import { TASK_TYPE_META } from '../task-types';
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
  epics: Epic[];
  onClose: () => void;
}

export function CreateTaskDialog({
  release,
  releases = [],
  backlogLocked = false,
  epics,
  onClose,
}: CreateTaskDialogProps) {
  const createTask = useBoardStore((s) => s.createTask);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TaskType>('feature');
  const [epicSlug, setEpicSlug] = useState('');
  const [releaseFilename, setReleaseFilename] = useState(release?.filename ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const releaseLocked = release !== undefined || backlogLocked;
  const releaseOptions =
    release !== undefined
      ? [release]
      : backlogLocked
        ? []
        : releases.filter((r) => r.frontmatter.status !== 'finished');

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && !submitting;

  const epicOptions = useMemo<IconSelectOption[]>(() => {
    const sorted = [...epics].sort((a, b) =>
      a.frontmatter.name.localeCompare(b.frontmatter.name),
    );
    return [
      { value: '', label: 'No epic' },
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const trimmedDescription = description.trim();
      await createTask({
        releaseFilename,
        title: trimmedTitle,
        type,
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

  return (
    <Modal open onClose={onClose} ariaLabel="Create task" className={styles.dialog}>
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
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <label className={styles.field}>
          <span className={styles.label}>Title</span>
          <input
            type="text"
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Description</span>
          <textarea
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
          <span className={styles.label}>Epic</span>
          <IconSelect
            value={epicSlug}
            options={epicOptions}
            onChange={(v) => setEpicSlug(v)}
            ariaLabel="Epic"
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
    </Modal>
  );
}
