import { X } from 'lucide-react';
import type { Theme } from '@boardown/core';
import { useBoardStore } from '../store';
import { CliHint } from './CliHint';
import { EditFinishedReleasesField } from './EditFinishedReleasesField';
import { GitIntegrationField } from './GitIntegrationField';
import { TrackUpdatedAtField } from './TrackUpdatedAtField';
import { Modal } from './Modal';
import { MultipleActiveReleasesField } from './MultipleActiveReleasesField';
import { StatusOutsideActiveReleaseField } from './StatusOutsideActiveReleaseField';
import { WipLimitField } from './WipLimitField';
import styles from './SettingsDialog.module.css';

interface SettingsDialogProps {
  onClose: () => void;
  version?: string | undefined;
}

export function SettingsDialog({ onClose, version }: SettingsDialogProps) {
  const theme = useBoardStore((s) => s.theme);
  const status = useBoardStore((s) => s.status);
  const setTheme = useBoardStore((s) => s.setTheme);
  const sharedTheme = useBoardStore((s) => s.sharedTheme);

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
        {sharedTheme === null ? (
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
        ) : (
          // Text rather than a disabled picker: there is nothing here to choose.
          <div className={styles.field}>
            <span className={styles.label}>Theme</span>
            <span className={styles.value}>{sharedTheme.name}</span>
            <span className={styles.hint}>Set by the shared configuration for every board.</span>
          </div>
        )}
        <WipLimitField className={styles.field} />
        <MultipleActiveReleasesField className={styles.field} />
        <GitIntegrationField className={styles.field} />
        <TrackUpdatedAtField className={styles.field} />
        <StatusOutsideActiveReleaseField className={styles.field} />
        <EditFinishedReleasesField className={styles.field} />
        <div className={styles.field}>
          <span className={styles.label}>CLI</span>
          <CliHint />
        </div>
        {version && (
          <div className={styles.field}>
            <span className={styles.label}>Version</span>
            <span className={styles.value}>{version}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
