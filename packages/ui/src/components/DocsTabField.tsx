import { useBoardStore } from '../store';
import styles from './DocsTabField.module.css';

// Shared by the app's Settings dialog and the Electron shell's settings popover,
// because the setting belongs to the board's config.yaml in both.
export function DocsTabField({ className }: { className?: string | undefined }) {
  // Absent means on, so a board that never heard of the setting shows the tab.
  const enabled = useBoardStore((s) => s.snapshot?.config.docsTab ?? true);
  const status = useBoardStore((s) => s.status);
  const setDocsTab = useBoardStore((s) => s.setDocsTab);

  return (
    <label className={className ?? styles.row}>
      <span className={styles.control}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={status !== 'ready'}
          onChange={(e) => void setDocsTab(e.target.checked)}
        />
        Docs tab
      </span>
      <span className={styles.hint}>
        Turn off to hide the Docs tab. Pages stay on disk and doc links still open.
      </span>
    </label>
  );
}
