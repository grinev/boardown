import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Task } from '@boardown/core';
import { useBoardStore } from '../store';
import { Modal } from './Modal';
import styles from './DeleteTaskDialog.module.css';

interface DeleteTaskDialogProps {
  task: Task;
  onClose: () => void;
}

export function DeleteTaskDialog({ task, onClose }: DeleteTaskDialogProps) {
  const deleteTask = useBoardStore((s) => s.deleteTask);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await deleteTask(task.frontmatter.id);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} ariaLabel="Delete task" className={styles.dialog}>
      <header className={styles.header}>
        <h2 className={styles.title}>Delete task</h2>
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
          Delete {task.frontmatter.id} “{task.title}”? This cannot be undone.
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
            Delete
          </button>
        </footer>
      </form>
    </Modal>
  );
}
