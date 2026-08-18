import { useBoardStore } from '../store';
import styles from './MultipleActiveReleasesField.module.css';

// Shared by the app's Settings dialog and the Electron shell's settings popover,
// because the setting belongs to the board's config.yaml in both.
export function MultipleActiveReleasesField({ className }: { className?: string | undefined }) {
  const enabled = useBoardStore((s) => s.snapshot?.config.multipleActiveReleases ?? false);
  const status = useBoardStore((s) => s.status);
  const setMultipleActiveReleases = useBoardStore((s) => s.setMultipleActiveReleases);

  return (
    <label className={className ?? styles.row}>
      <span className={styles.control}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={status !== 'ready'}
          onChange={(e) => void setMultipleActiveReleases(e.target.checked)}
        />
        Allow multiple active releases
      </span>
      <span className={styles.hint}>
        Lets a release start while another one is still active.
      </span>
    </label>
  );
}
