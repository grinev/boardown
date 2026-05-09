import { Settings } from 'lucide-react';
import { useBoardStore } from '../store';
import styles from './SettingsButton.module.css';

export function SettingsButton() {
  const status = useBoardStore((s) => s.status);
  const openSettings = useBoardStore((s) => s.openSettings);

  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => openSettings()}
      disabled={status !== 'ready'}
      aria-label="Open settings"
    >
      <Settings size={18} aria-hidden="true" />
    </button>
  );
}
