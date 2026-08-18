import { CheckCircle2 } from 'lucide-react';
import { activeReleases, boardRelease, type Epic, type TaskStatus } from '@boardown/core';
import { useBoardStore, type ActiveTab } from '../store';
import { ArchiveView } from './ArchiveView';
import { BacklogView } from './BacklogView';
import { BoardView } from './BoardView';
import { DocsView } from './DocsView';
import { ReleaseSwitcher } from './ReleaseSwitcher';
import styles from './TabContent.module.css';

interface TabContentProps {
  activeTab: ActiveTab;
  epics: Epic[];
  statuses: readonly TaskStatus[];
}

export function TabContent({ activeTab, epics, statuses }: TabContentProps) {
  const snapshot = useBoardStore((s) => s.snapshot);
  const openCompleteRelease = useBoardStore((s) => s.openCompleteRelease);
  const openRelease = useBoardStore((s) => s.openRelease);
  const setBoardRelease = useBoardStore((s) => s.setBoardRelease);

  if (activeTab === 'backlog') {
    return <BacklogView />;
  }

  if (activeTab === 'archive') {
    return <ArchiveView />;
  }

  if (activeTab === 'docs') {
    return <DocsView />;
  }

  const actives = snapshot ? activeReleases(snapshot) : [];
  const current = snapshot ? boardRelease(snapshot) : undefined;
  if (!current) {
    return (
      <section className={styles.placeholder}>
        <h2>Board</h2>
        <p>No active release.</p>
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
        <div className={styles.releaseTitleGroup}>
          <h2 className={styles.releaseHeading}>
            <button
              type="button"
              className={styles.releaseNameButton}
              onClick={() => openRelease(current.filename)}
            >
              {heading}
            </button>
          </h2>
          <ReleaseSwitcher
            releases={actives}
            selectedSlug={current.slug}
            onSelect={(slug) => void setBoardRelease(slug)}
          />
          {descriptionPreview && (
            <span className={styles.releaseDescription}>
              {descriptionPreview}
            </span>
          )}
        </div>
        <button
          type="button"
          className={styles.completeButton}
          onClick={() => openCompleteRelease(current.filename)}
        >
          <CheckCircle2 size={14} aria-hidden="true" />
          Complete release
        </button>
      </header>
      <BoardView release={current} epics={epics} statuses={statuses} />
    </section>
  );
}
