import { useBoardStore } from '../store';
import styles from './ThemeToggle.module.css';

export function ThemeToggle() {
  const theme = useBoardStore((s) => s.theme);
  const status = useBoardStore((s) => s.status);
  const toggleTheme = useBoardStore((s) => s.toggleTheme);

  const nextLabel = theme === 'light' ? 'Dark' : 'Light';

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={() => void toggleTheme()}
      disabled={status !== 'ready'}
      aria-label={`Switch to ${nextLabel.toLowerCase()} theme`}
    >
      {nextLabel}
    </button>
  );
}
