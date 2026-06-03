import { X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { Release } from '@boardown/core';
import { useBoardStore, type CompleteReleaseTarget } from '../store';
import { Modal } from './Modal';
import styles from './CompleteReleaseDialog.module.css';

const BACKLOG_VALUE = 'backlog';

const releaseTitle = (release: Release): string =>
  release.frontmatter.name ?? release.slug;

interface CompleteReleaseDialogProps {
  onClose: () => void;
}

export function CompleteReleaseDialog({ onClose }: CompleteReleaseDialogProps) {
  const completeRelease = useBoardStore((s) => s.completeRelease);
  const releases = useBoardStore((s) => s.snapshot?.releases ?? []);

  const current = useMemo(
    () => releases.find((r) => r.frontmatter.status === 'current'),
    [releases],
  );
  const futures = useMemo(
    () =>
      releases
        .filter((r) => r.frontmatter.status === 'future')
        .sort((a, b) => a.filename.localeCompare(b.filename)),
    [releases],
  );
  const unfinished = useMemo(
    () => (current?.tasks ?? []).filter((t) => t.frontmatter.status !== 'done'),
    [current],
  );

  const [destination, setDestination] = useState<string>(
    () => futures[0]?.filename ?? BACKLOG_VALUE,
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!current) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const target: CompleteReleaseTarget =
        unfinished.length === 0 || destination === BACKLOG_VALUE
          ? { kind: 'backlog' }
          : { kind: 'release', filename: destination };
      await completeRelease(target);
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
      ariaLabel="Complete release"
      className={styles.dialog}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>Complete release {releaseTitle(current)}</h2>
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
        {unfinished.length === 0 ? (
          <p className={styles.message}>
            All tasks are done. The release will be marked as finished.
          </p>
        ) : (
          <>
            <p className={styles.message}>
              {unfinished.length} unfinished{' '}
              {unfinished.length === 1 ? 'task' : 'tasks'} will be moved to:
            </p>
            <label className={styles.field}>
              <span className={styles.label}>Move to</span>
              <select
                className={styles.select}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                autoFocus
              >
                {futures.map((r) => (
                  <option key={r.filename} value={r.filename}>
                    {releaseTitle(r)}
                  </option>
                ))}
                <option value={BACKLOG_VALUE}>Backlog</option>
              </select>
            </label>
          </>
        )}
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
            Complete release
          </button>
        </footer>
      </form>
    </Modal>
  );
}
