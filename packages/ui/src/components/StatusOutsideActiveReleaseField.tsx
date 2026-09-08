import { useBoardStore } from '../store';
import styles from './StatusOutsideActiveReleaseField.module.css';

// Shared by the app's Settings dialog and the Electron shell's settings popover,
// because the setting belongs to the board's config.yaml in both.
export function StatusOutsideActiveReleaseField({ className }: { className?: string | undefined }) {
  const enabled = useBoardStore((s) => s.snapshot?.config.statusOutsideActiveRelease ?? false);
  const status = useBoardStore((s) => s.status);
  const setStatusOutsideActiveRelease = useBoardStore((s) => s.setStatusOutsideActiveRelease);

  return (
    <label className={className ?? styles.row}>
      <span className={styles.control}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={status !== 'ready'}
          onChange={(e) => void setStatusOutsideActiveRelease(e.target.checked)}
        />
        Allow status changes outside the current release
      </span>
      <span className={styles.hint}>
        Lets a task&apos;s status be set in the backlog, an epic, or a future release. Finished
        releases stay frozen.
      </span>
    </label>
  );
}
