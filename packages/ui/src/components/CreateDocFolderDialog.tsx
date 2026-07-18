import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { targetDocFolder, validateDocFolderName } from '@boardown/core';
import { useBoardStore } from '../store';
import { Modal } from './Modal';
import styles from './CreateDocDialog.module.css';

const MESSAGES = {
  separator: 'A folder name cannot contain a path separator.',
  taken: 'Something with that name already exists here.',
} as const;

export function CreateDocFolderDialog() {
  const open = useBoardStore((s) => s.createDocFolderOpen);
  const onClose = useBoardStore((s) => s.closeCreateDocFolder);
  const createDocFolder = useBoardStore((s) => s.createDocFolder);
  const docs = useBoardStore((s) => s.snapshot?.docs ?? null);
  const selectedDocPath = useBoardStore((s) => s.selectedDocPath);

  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!open || !docs) return null;

  const folder = targetDocFolder(docs, selectedDocPath);
  const trimmed = name.trim();
  const problem = validateDocFolderName(name, folder);
  const canSubmit = problem === null && !submitting;

  const close = (): void => {
    setName('');
    setSubmitError(null);
    onClose();
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createDocFolder(trimmed);
      close();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={close} ariaLabel="New folder" className={styles.dialog}>
      <header className={styles.header}>
        <h2 className={styles.title}>New folder</h2>
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={close}>
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
            aria-invalid={problem === 'separator' || problem === 'taken'}
          />
          {problem === 'separator' || problem === 'taken' ? (
            <span className={styles.fieldError} role="alert">
              {MESSAGES[problem]}
            </span>
          ) : (
            <span className={styles.hint}>
              In: <code>{folder.path}</code>
            </span>
          )}
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
