import { CheckCircle2 } from 'lucide-react';
import type { Epic, Release, TaskStatus } from '@boardown/core';
import { useBoardStore, type ActiveTab } from '../store';
import { ArchiveView } from './ArchiveView';
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
  const openCompleteRelease = useBoardStore((s) => s.openCompleteRelease);
  const openRelease = useBoardStore((s) => s.openRelease);

  if (activeTab === 'backlog') {
    return <BacklogView />;
  }

  if (activeTab === 'archive') {
    return <ArchiveView />;
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

  const heading = `Release ${current.frontmatter.name ?? current.slug}`;
  // A multiline description must not break the single-line header.
  const descriptionPreview = current.frontmatter.description
    ?.replace(/\s+/g, ' ')
    .trim();

  return (
    <section className={styles.boardSection}>
      <header className={styles.releaseHeader}>
        <h2 className={styles.releaseHeading}>
          <button
            type="button"
            className={styles.releaseNameButton}
            onClick={() => openRelease(current.filename)}
          >
            {heading}
          </button>
        </h2>
        {descriptionPreview && (
          <span className={styles.releaseDescription}>{descriptionPreview}</span>
        )}
        <button
          type="button"
          className={styles.completeButton}
          onClick={openCompleteRelease}
        >
          <CheckCircle2 size={14} aria-hidden="true" />
          Complete release
        </button>
      </header>
      <BoardView release={current} epics={epics} statuses={statuses} />
    </section>
  );
}
