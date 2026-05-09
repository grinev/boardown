import type { Release, TaskStatus } from '@boardown/core';
import type { ActiveTab } from '../store';
import { BoardView } from './BoardView';
import styles from './TabContent.module.css';

interface TabContentProps {
  activeTab: ActiveTab;
  releases: Release[];
  statuses: readonly TaskStatus[];
}

const stripMd = (filename: string): string =>
  filename.endsWith('.md') ? filename.slice(0, -3) : filename;

export function TabContent({ activeTab, releases, statuses }: TabContentProps) {
  if (activeTab.kind === 'backlog') {
    return (
      <section className={styles.placeholder}>
        <h2>Backlog</h2>
        <p>No tasks yet</p>
      </section>
    );
  }

  const release = releases.find((r) => r.filename === activeTab.filename);
  if (!release) {
    return (
      <section className={styles.error}>
        Release not found: {activeTab.filename}
      </section>
    );
  }

  return (
    <section>
      <header className={styles.releaseHeader}>
        <h2>Release {stripMd(release.filename)}</h2>
      </header>
      <BoardView release={release} statuses={statuses} />
    </section>
  );
}
