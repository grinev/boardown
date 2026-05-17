import type { Epic, Release, TaskStatus } from '@boardown/core';
import type { ActiveTab } from '../store';
import { BacklogView } from './BacklogView';
import { BoardView } from './BoardView';
import styles from './TabContent.module.css';

interface TabContentProps {
  activeTab: ActiveTab;
  releases: Release[];
  epics: Epic[];
  statuses: readonly TaskStatus[];
}

export function TabContent({ activeTab, releases, epics, statuses }: TabContentProps) {
  if (activeTab === 'backlog') {
    return <BacklogView />;
  }

  if (activeTab === 'archive') {
    return (
      <section className={styles.placeholder}>
        <h2>Archive</h2>
        <p>No archived releases yet</p>
      </section>
    );
  }

  const current = releases.find((r) => r.frontmatter.status === 'current');
  if (!current) {
    return (
      <section className={styles.placeholder}>
        <h2>Board</h2>
        <p>No current release.</p>
        <p className={styles.hint}>Start one from Backlog to begin work.</p>
      </section>
    );
  }

  const slug = current.frontmatter.release;
  const heading = current.frontmatter.name
    ? `Release ${slug} — ${current.frontmatter.name}`
    : `Release ${slug}`;

  return (
    <section className={styles.boardSection}>
      <header className={styles.releaseHeader}>
        <h2>{heading}</h2>
      </header>
      <BoardView release={current} epics={epics} statuses={statuses} />
    </section>
  );
}
