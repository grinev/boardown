import { useBoardStore } from '../store';
import styles from './EditFinishedReleasesField.module.css';

// Shared by the app's Settings dialog and the Electron shell's settings popover,
// because the setting belongs to the board's config.yaml in both.
export function EditFinishedReleasesField({ className }: { className?: string | undefined }) {
  const enabled = useBoardStore((s) => s.snapshot?.config.editFinishedReleases ?? false);
  const status = useBoardStore((s) => s.status);
  const setEditFinishedReleases = useBoardStore((s) => s.setEditFinishedReleases);

  return (
    <label className={className ?? styles.row}>
      <span className={styles.control}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={status !== 'ready'}
          onChange={(e) => void setEditFinishedReleases(e.target.checked)}
        />
        Allow editing finished releases
      </span>
      <span className={styles.hint}>
        Lets tasks in the Archive be edited, moved and deleted. Changing their status also
        needs the setting above.
      </span>
    </label>
  );
}
