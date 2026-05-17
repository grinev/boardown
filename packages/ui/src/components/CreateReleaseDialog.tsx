import { X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { releaseFilenameForSlug, sanitizeFilenameForFs } from '@boardown/core';
import { useBoardStore } from '../store';
import { Modal } from './Modal';
import styles from './CreateReleaseDialog.module.css';

interface CreateReleaseDialogProps {
  onClose: () => void;
}

export function CreateReleaseDialog({ onClose }: CreateReleaseDialogProps) {
  const createRelease = useBoardStore((s) => s.createRelease);
  const existingReleases = useBoardStore((s) => s.snapshot?.releases ?? []);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const slug = useMemo(() => sanitizeFilenameForFs(trimmedName), [trimmedName]);
  const duplicate = useMemo(() => {
    if (slug.length === 0) return false;
    const slugLower = slug.toLowerCase();
    return existingReleases.some((r) => r.slug.toLowerCase() === slugLower);
  }, [slug, existingReleases]);

  const canSubmit =
    trimmedName.length > 0 && slug.length > 0 && !duplicate && !submitting;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const trimmedDescription = description.trim();
      await createRelease({
        name: trimmedName,
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
          File: <code>releases/&lt;name&gt;.md</code>
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
          A release already exists at <code>{releaseFilenameForSlug(slug)}</code>.
        </span>
      );
    }
    return (
      <span className={styles.hint}>
        File: <code>{releaseFilenameForSlug(slug)}</code>
      </span>
    );
  };

  return (
    <Modal open onClose={onClose} ariaLabel="Create release" className={styles.dialog}>
      <header className={styles.header}>
        <h2 className={styles.title}>Create release</h2>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <form className={styles.form} onSubmit={handleSubmit}>
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
