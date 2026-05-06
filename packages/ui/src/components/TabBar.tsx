import type { Release } from '@boardown/core';
import type { ActiveTab } from '../store';
import styles from './TabBar.module.css';

interface TabBarProps {
  releases: Release[];
  activeTab: ActiveTab;
  onSelect: (tab: ActiveTab) => void;
}

const stripMd = (filename: string): string =>
  filename.endsWith('.md') ? filename.slice(0, -3) : filename;

const tabClass = (active: boolean): string =>
  [styles.tab, active && styles.tabActive].filter(Boolean).join(' ');

export function TabBar({ releases, activeTab, onSelect }: TabBarProps) {
  const sortedReleases = [...releases].sort((a, b) => a.filename.localeCompare(b.filename));

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={tabClass(activeTab.kind === 'backlog')}
        onClick={() => onSelect({ kind: 'backlog' })}
      >
        Backlog
      </button>
      {sortedReleases.map((release) => {
        const isActive = activeTab.kind === 'release' && activeTab.filename === release.filename;
        return (
          <button
            key={release.filename}
            type="button"
            className={tabClass(isActive)}
            onClick={() => onSelect({ kind: 'release', filename: release.filename })}
          >
            {stripMd(release.filename)}
          </button>
        );
      })}
    </div>
  );
}
