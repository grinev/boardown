import { RotateCw } from 'lucide-react';
import { useBoardStore } from '../store';
import styles from './ReloadButton.module.css';

export function ReloadButton() {
  const status = useBoardStore((s) => s.status);
  const reload = useBoardStore((s) => s.reload);

  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => void reload()}
      disabled={status !== 'ready'}
      aria-label="Reload board"
    >
      <RotateCw size={18} aria-hidden="true" />
    </button>
  );
}
