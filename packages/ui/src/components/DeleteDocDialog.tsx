import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { docPageTitle, findDocFolder, findDocPage, isDocFolderEmpty } from '@boardown/core';
import { useBoardStore } from '../store';
import { Modal } from './Modal';
import styles from './DeleteTaskDialog.module.css';

export function DeleteDocDialog() {
  const path = useBoardStore((s) => s.deleteDocPath);
  const onClose = useBoardStore((s) => s.closeDeleteDoc);
  const deleteDocPage = useBoardStore((s) => s.deleteDocPage);
  const deleteDocFolder = useBoardStore((s) => s.deleteDocFolder);
  const docs = useBoardStore((s) => s.snapshot?.docs ?? null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (path === null || !docs) return null;

  const folder = findDocFolder(docs, path);
  const page = folder === null ? findDocPage(docs, path) : null;

  let heading: string;
  let message: string;
  if (folder !== null) {
    // Only empty folders are deletable, so the tree never offers this on a folder
    // with contents; a non-empty one here means the tree moved under us.
    if (!isDocFolderEmpty(folder)) return null;
    heading = 'Delete folder';
    message = `Delete the empty folder “${folder.name}”? This cannot be undone.`;
  } else if (page !== null) {
    heading = 'Delete page';
    message = `Delete “${docPageTitle(page)}”? This cannot be undone.`;
  } else {
    return null;
  }

  const close = (): void => {
    setSubmitError(null);
    onClose();
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (folder !== null) await deleteDocFolder(path);
      else await deleteDocPage(path);
      close();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={close} ariaLabel={heading} className={styles.dialog}>
      <header className={styles.header}>
        <h2 className={styles.title}>{heading}</h2>
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={close}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <p className={styles.message}>{message}</p>
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
          <button type="submit" className={styles.confirmButton} disabled={submitting}>
            Delete
          </button>
        </footer>
      </form>
    </Modal>
  );
}
