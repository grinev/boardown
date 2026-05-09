import type { ActiveTab } from '../store';
import styles from './TabBar.module.css';
import { ThemeToggle } from './ThemeToggle';

interface TabBarProps {
  activeTab: ActiveTab;
  onSelect: (tab: ActiveTab) => void;
}

const TABS: ReadonlyArray<{ key: ActiveTab; label: string }> = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'board', label: 'Board' },
  { key: 'archive', label: 'Archive' },
];

const tabClass = (active: boolean): string =>
  [styles.tab, active && styles.tabActive].filter(Boolean).join(' ');

export function TabBar({ activeTab, onSelect }: TabBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.tabs}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={tabClass(activeTab === key)}
            onClick={() => onSelect(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <ThemeToggle />
    </div>
  );
}
