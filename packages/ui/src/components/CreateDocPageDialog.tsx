import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { targetDocFolder } from '@boardown/core';
import { useBoardStore } from '../store';
import { Modal } from './Modal';
import styles from './CreateDocDialog.module.css';

export function CreateDocPageDialog() {
  const open = useBoardStore((s) => s.createDocPageOpen);
  const onClose = useBoardStore((s) => s.closeCreateDocPage);
  const createDocPage = useBoardStore((s) => s.createDocPage);
  const docs = useBoardStore((s) => s.snapshot?.docs ?? null);
  const selectedDocPath = useBoardStore((s) => s.selectedDocPath);

  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!open || !docs) return null;

  const folder = targetDocFolder(docs, selectedDocPath);
  const trimmed = title.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  const close = (): void => {
    setTitle('');
    setSubmitError(null);
    onClose();
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createDocPage(trimmed);
      close();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={close} ariaLabel="New page" className={styles.dialog}>
      <header className={styles.header}>
        <h2 className={styles.title}>New page</h2>
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={close}>
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
          <span className={styles.hint}>
            In: <code>{folder.path}</code>
          </span>
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
            onClick={close}
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
