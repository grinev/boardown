import { Check, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { epicFilenameForSlug, sanitizeFilenameForFs } from '@boardown/core';
import { useBoardStore } from '../store';
import { EPIC_COLORS, pickDefaultEpicColor } from '../epic-colors';
import { pickContrastText } from '../utils/contrast-color';
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
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
    <Modal open onClose={onClose} ariaLabel="Create epic" className={styles.dialog}>
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
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <input
            type="text"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
            aria-invalid={trimmedName.length > 0 && (slug.length === 0 || duplicate)}
          />
          {renderFilenameHint()}
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
          <span className={styles.label}>Color</span>
          <div className={styles.swatches} role="radiogroup" aria-label="Epic color">
            {EPIC_COLORS.map((c) => {
              const selected = c.toLowerCase() === color.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  className={
                    selected ? `${styles.swatch} ${styles.swatchSelected}` : styles.swatch
                  }
                  // The value is data, not a theme token, so it is set inline.
                  style={{ background: c }}
                  role="radio"
                  aria-checked={selected}
                  aria-label={c}
                  onClick={() => setColor(c)}
                >
                  {selected && (
                    <Check size={14} color={pickContrastText(c)} aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
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
