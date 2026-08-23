import { X } from 'lucide-react';
import { Modal } from './Modal';
// The confirm-dialog box, shared with the two delete dialogs.
import styles from './DeleteTaskDialog.module.css';

interface DiscardChangesDialogProps {
  // Back to the form, with everything still in it.
  onCancel: () => void;
  onDiscard: () => void;
}

export function DiscardChangesDialog({
  onCancel,
  onDiscard,
}: DiscardChangesDialogProps) {
  return (
    <Modal
      open
      onClose={onCancel}
      ariaLabel="Discard changes"
      className={styles.dialog}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>Discard changes?</h2>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close"
          onClick={onCancel}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      {/* No form: nothing is submitted here, so Enter activates whichever button
          holds focus — the ✕ the dialog opens on. */}
      <div className={styles.form}>
        <p className={styles.message}>What you typed will be lost.</p>
        <footer className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={onDiscard}
          >
            Discard
          </button>
        </footer>
      </div>
    </Modal>
  );
}
