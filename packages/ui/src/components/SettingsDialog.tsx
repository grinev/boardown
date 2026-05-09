import { X } from 'lucide-react';
import type { Theme } from '@boardown/core';
import { useBoardStore } from '../store';
import { Modal } from './Modal';
import styles from './SettingsDialog.module.css';

interface SettingsDialogProps {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const theme = useBoardStore((s) => s.theme);
  const status = useBoardStore((s) => s.status);
  const setTheme = useBoardStore((s) => s.setTheme);

  return (
    <Modal open onClose={onClose} ariaLabel="Settings" className={styles.dialog}>
      <header className={styles.header}>
        <h2 className={styles.title}>Settings</h2>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.body}>
        <label className={styles.field}>
          <span className={styles.label}>Theme</span>
          <select
            className={styles.select}
            value={theme}
            disabled={status !== 'ready'}
            onChange={(e) => void setTheme(e.target.value as Theme)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>
    </Modal>
  );
}
