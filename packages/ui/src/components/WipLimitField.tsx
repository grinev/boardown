import { useEffect, useState, type KeyboardEvent } from 'react';
import { useBoardStore } from '../store';
import styles from './WipLimitField.module.css';

const INVALID_MESSAGE = 'A whole number greater than 0, or empty for no limit';

// Shared by the app's Settings dialog and the Electron shell's settings popover,
// because the limit belongs to the board's config.yaml in both.
export function WipLimitField({ className }: { className?: string | undefined }) {
  const limit = useBoardStore((s) => s.snapshot?.config.wipLimits?.['in-progress'] ?? null);
  const status = useBoardStore((s) => s.status);
  const setWipLimit = useBoardStore((s) => s.setWipLimit);
  const [draft, setDraft] = useState(limit === null ? '' : String(limit));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(limit === null ? '' : String(limit));
    setInvalid(false);
  }, [limit]);

  const commit = () => {
    const text = draft.trim();
    if (text === '') {
      setInvalid(false);
      void setWipLimit(null);
      return;
    }
    const parsed = Number(text);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    void setWipLimit(parsed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(limit === null ? '' : String(limit));
      setInvalid(false);
    }
  };

  return (
    <label className={className}>
      <span className={styles.label}>WIP limit (In Progress)</span>
      <input
        type="number"
        min={1}
        step={1}
        className={styles.input}
        value={draft}
        disabled={status !== 'ready'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <span className={invalid ? styles.error : styles.hint}>
        {invalid ? INVALID_MESSAGE : 'Leave empty for no limit'}
      </span>
    </label>
  );
}
