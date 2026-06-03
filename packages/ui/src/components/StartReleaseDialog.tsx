import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Release } from '@boardown/core';
import { useBoardStore } from '../store';
import { Modal } from './Modal';
import styles from './StartReleaseDialog.module.css';

const releaseTitle = (release: Release): string =>
  release.frontmatter.name ?? release.slug;

interface StartReleaseDialogProps {
  release: Release;
  onClose: () => void;
}

export function StartReleaseDialog({ release, onClose }: StartReleaseDialogProps) {
  const startRelease = useBoardStore((s) => s.startRelease);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const taskCount = release.tasks.length;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await startRelease(release.filename);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      ariaLabel="Start release"
      className={styles.dialog}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>Start release {releaseTitle(release)}</h2>
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
        <p className={styles.message}>
          This release has {taskCount} {taskCount === 1 ? 'task' : 'tasks'}. It
          will become the current release and open on the Board.
        </p>
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
            className={styles.confirmButton}
            disabled={submitting}
          >
            Start release
          </button>
        </footer>
      </form>
    </Modal>
  );
}
