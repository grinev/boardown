import { Undo2 } from 'lucide-react';
import { useBoardStore } from '../store';
import styles from './DialogBackButton.module.css';

// Chrome shared by the four detail dialogs. It renders nothing when there is
// nowhere to go back to, so every dialog can drop it into its header unconditionally.
export function DialogBackButton() {
  const hasHistory = useBoardStore((s) => s.dialogStack.length > 0);
  const goBack = useBoardStore((s) => s.goBack);

  if (!hasHistory) return null;

  return (
    <button
      type="button"
      className={styles.backButton}
      aria-label="Back"
      title="Back"
      onClick={goBack}
    >
      <Undo2 size={18} aria-hidden="true" />
    </button>
  );
}
