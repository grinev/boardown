import { useBoardStore } from '../store';
import styles from './GitIntegrationField.module.css';

// Shared by the app's Settings dialog and the Electron shell's settings popover,
// because the setting belongs to the board's config.yaml in both.
export function GitIntegrationField({ className }: { className?: string | undefined }) {
  // Absent means on, so a board that never heard of the setting shows the panel.
  const enabled = useBoardStore((s) => s.snapshot?.config.gitIntegration ?? true);
  const status = useBoardStore((s) => s.status);
  const setGitIntegration = useBoardStore((s) => s.setGitIntegration);

  return (
    <label className={className ?? styles.row}>
      <span className={styles.control}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={status !== 'ready'}
          onChange={(e) => void setGitIntegration(e.target.checked)}
        />
        Git integration
      </span>
      <span className={styles.hint}>
        Shows a task&apos;s related commits, read from the local repository.
      </span>
    </label>
  );
}
