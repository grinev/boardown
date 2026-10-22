import { isUpdateTracked } from '@boardown/core';
import { useBoardStore } from '../store';
import styles from './TrackUpdatedAtField.module.css';

// Shared by the app's Settings dialog and the Electron shell's settings popover,
// because the setting belongs to the board's config.yaml in both.
export function TrackUpdatedAtField({ className }: { className?: string | undefined }) {
  const enabled = useBoardStore((s) => (s.snapshot ? isUpdateTracked(s.snapshot.config) : true));
  const status = useBoardStore((s) => s.status);
  const setTrackUpdatedAt = useBoardStore((s) => s.setTrackUpdatedAt);

  return (
    <label className={className ?? styles.row}>
      <span className={styles.control}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={status !== 'ready'}
          onChange={(e) => void setTrackUpdatedAt(e.target.checked)}
        />
        Track update date
      </span>
      <span className={styles.hint}>
        Stamps a task&apos;s Updated date on every change. Turn off so parallel branches never
        conflict on it.
      </span>
    </label>
  );
}
