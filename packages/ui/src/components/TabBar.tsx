import { Archive, ClipboardList, SquareKanban, type LucideIcon } from 'lucide-react';
import type { ActiveTab } from '../store';
import { CreateMenu } from './CreateMenu';
import { SettingsButton } from './SettingsButton';
import styles from './TabBar.module.css';

interface TabBarProps {
  activeTab: ActiveTab;
  onSelect: (tab: ActiveTab) => void;
}

const TABS: ReadonlyArray<{ key: ActiveTab; label: string; icon: LucideIcon }> = [
  { key: 'backlog', label: 'Backlog', icon: ClipboardList },
  { key: 'board', label: 'Board', icon: SquareKanban },
  { key: 'archive', label: 'Archive', icon: Archive },
];

const tabClass = (active: boolean): string =>
  [styles.tab, active && styles.tabActive].filter(Boolean).join(' ');

export function TabBar({ activeTab, onSelect }: TabBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.tabs}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={tabClass(activeTab === key)}
            onClick={() => onSelect(key)}
          >
            <Icon size={16} aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <div className={styles.actions}>
        <CreateMenu />
        <SettingsButton />
      </div>
    </div>
  );
}
