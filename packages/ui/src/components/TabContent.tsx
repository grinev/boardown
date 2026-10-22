import { CheckCircle2 } from 'lucide-react';
import {
  BOARD_SWIMLANES,
  activeReleases,
  boardRelease,
  type BoardSwimlanes,
  type Epic,
  type TaskStatus,
} from '@boardown/core';
import { useBoardStore, type ActiveTab } from '../store';
import { ArchiveView } from './ArchiveView';
import { BacklogView } from './BacklogView';
import { BoardView } from './BoardView';
import { DocsView } from './DocsView';
import { IconSelect, type IconSelectOption } from './IconSelect';
import { ReleaseSwitcher } from './ReleaseSwitcher';
import styles from './TabContent.module.css';

const NO_SWIMLANES = 'none';
const SWIMLANE_OPTIONS: IconSelectOption[] = [
  { value: NO_SWIMLANES, label: 'None' },
  { value: 'epic', label: 'Epic' },
  { value: 'type', label: 'Type' },
];

const isBoardSwimlanes = (value: string): value is BoardSwimlanes =>
  (BOARD_SWIMLANES as readonly string[]).includes(value);

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
  const setBoardSwimlanes = useBoardStore((s) => s.setBoardSwimlanes);

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
  const swimlanes = snapshot?.config.boardSwimlanes;
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
            <span
              className={styles.releaseDescription}
              title={current.frontmatter.description}
            >
              {descriptionPreview}
            </span>
          )}
        </div>
        <div className={styles.releaseActions}>
          <span className={styles.swimlanesCaption} aria-hidden="true">
            Swimlanes
          </span>
          <IconSelect
            value={swimlanes ?? NO_SWIMLANES}
            options={SWIMLANE_OPTIONS}
            onChange={(value) =>
              void setBoardSwimlanes(isBoardSwimlanes(value) ? value : null)
            }
            ariaLabel="Swimlanes"
            triggerClassName={styles.swimlanesTrigger}
            hideTriggerIcon
          />
          <button
            type="button"
            className={styles.completeButton}
            onClick={() => openCompleteRelease(current.filename)}
          >
            <CheckCircle2 size={14} aria-hidden="true" />
            Complete release
          </button>
        </div>
      </header>
      {/* Keyed so lane collapse starts over on another release or grouping. */}
      <BoardView
        key={`${current.filename}:${swimlanes ?? NO_SWIMLANES}`}
        release={current}
        epics={epics}
        statuses={statuses}
      />
    </section>
  );
}
