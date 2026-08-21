import { X } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  EPIC_NAME_MAX_LENGTH,
  epicFilenameForSlug,
  sanitizeFilenameForFs,
} from '@boardown/core';
import { useBoardStore } from '../store';
import { pickDefaultEpicColor } from '../epic-colors';
import { isSubmitShortcut } from '../utils/submit-shortcut';
import { DocRefTextarea } from './DocRefTextarea';
import { EpicColorSwatches } from './EpicColorSwatches';
import { Modal } from './Modal';
import styles from './CreateEpicDialog.module.css';

interface CreateEpicDialogProps {
  onClose: () => void;
}

export function CreateEpicDialog({ onClose }: CreateEpicDialogProps) {
  const createEpic = useBoardStore((s) => s.createEpic);
  const existingEpics = useBoardStore((s) => s.snapshot?.epics ?? []);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(() => pickDefaultEpicColor(existingEpics));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const slug = useMemo(() => sanitizeFilenameForFs(trimmedName), [trimmedName]);
  const duplicate = useMemo(() => {
    if (slug.length === 0) return false;
    const slugLower = slug.toLowerCase();
    return existingEpics.some((e) => e.slug.toLowerCase() === slugLower);
  }, [slug, existingEpics]);

  const canSubmit =
    trimmedName.length > 0 && slug.length > 0 && !duplicate && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const trimmedDescription = description.trim();
      await createEpic({
        name: trimmedName,
        color,
        ...(trimmedDescription.length > 0 ? { description: trimmedDescription } : {}),
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
    if (!isSubmitShortcut(event)) return;
    // Prevented even when the dialog refuses to submit, so a refusal never lets
    // the keystroke through to Cancel, the ✕ or the description's newline.
    event.preventDefault();
    void submit();
  };

  const renderFilenameHint = () => {
    if (trimmedName.length === 0) {
      return (
        <span className={styles.hint}>
          File: <code>epics/&lt;name&gt;.md</code>
        </span>
      );
    }
    if (slug.length === 0) {
      return (
        <span className={styles.fieldError} role="alert">
          The name has no characters allowed in a filename.
        </span>
      );
    }
    if (duplicate) {
      return (
        <span className={styles.fieldError} role="alert">
          An epic already exists at <code>{epicFilenameForSlug(slug)}</code>.
        </span>
      );
    }
    return (
      <span className={styles.hint}>
        File: <code>{epicFilenameForSlug(slug)}</code>
      </span>
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      ariaLabel="Create epic"
      className={styles.dialog}
      onKeyDown={handleShortcut}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>Create epic</h2>
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
          <span className={styles.label}>Name</span>
          <input
            type="text"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-autofocus
            required
            maxLength={EPIC_NAME_MAX_LENGTH}
            aria-invalid={trimmedName.length > 0 && (slug.length === 0 || duplicate)}
          />
          {renderFilenameHint()}
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
          <span className={styles.label}>Color</span>
          <EpicColorSwatches
            value={color}
            onSelect={setColor}
            className={styles.colorSwatches}
          />
        </div>
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
          <button type="submit" className={styles.createButton} disabled={!canSubmit}>
            Create
          </button>
        </footer>
      </form>
    </Modal>
  );
}
