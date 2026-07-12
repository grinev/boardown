import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Epic, Release, Task } from '@boardown/core';
import { useBoardStore } from '../store';
import { BacklogRowView } from './BacklogRowView';
import styles from './BacklogView.module.css';
import archiveStyles from './ArchiveView.module.css';

const sortByOrder = (a: Task, b: Task) => a.frontmatter.order - b.frontmatter.order;

const releaseTitle = (release: Release): string =>
  release.frontmatter.name ?? release.slug;

const releaseSectionKey = (release: Release): string =>
  `release:${release.filename}`;

export function ArchiveView() {
  const snapshot = useBoardStore((s) => s.snapshot);
  const openTask = useBoardStore((s) => s.openTask);
  const openEpic = useBoardStore((s) => s.openEpic);

  const epics = useMemo(() => snapshot?.epics ?? [], [snapshot?.epics]);
  const epicsBySlug = useMemo(
    () => new Map(epics.map((e) => [e.slug, e])),
    [epics],
  );

  const finished = useMemo(() => {
    const releases = snapshot?.releases ?? [];
    return releases
      .filter((r) => r.frontmatter.status === 'finished')
      .sort((a, b) => b.filename.localeCompare(a.filename));
  }, [snapshot?.releases]);

  // All releases start collapsed; any newly appearing release defaults to
  // collapsed too.
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(
    () => new Set(finished.map(releaseSectionKey)),
  );

  useEffect(() => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      for (const r of finished) {
        const key = releaseSectionKey(r);
        if (!prev.has(key)) next.add(key);
      }
      return next;
    });
  }, [finished]);

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (snapshot === null) return null;

  if (finished.length === 0) {
    return (
      <div className={styles.view}>
        <div className={styles.empty}>No archived releases yet</div>
      </div>
    );
  }

  return (
    <div className={styles.view}>
      <div className={`${styles.scrollArea} ${archiveStyles.scrollArea}`}>
        {finished.map((release) => {
          const key = releaseSectionKey(release);
          const tasks = [...release.tasks].sort(sortByOrder);
          return (
            <ArchiveSection
              key={key}
              sectionKey={key}
              title={releaseTitle(release)}
              tasks={tasks}
              collapsed={collapsedKeys.has(key)}
              onToggle={() => toggleCollapsed(key)}
              epicsBySlug={epicsBySlug}
              onOpenTask={openTask}
              onOpenEpic={openEpic}
            />
          );
        })}
      </div>
    </div>
  );
}

interface ArchiveSectionProps {
  sectionKey: string;
  title: string;
  tasks: Task[];
  collapsed: boolean;
  onToggle: () => void;
  epicsBySlug: Map<string, Epic>;
  onOpenTask: (id: string) => void;
  onOpenEpic: (slug: string) => void;
}

function ArchiveSection({
  sectionKey,
  title,
  tasks,
  collapsed,
  onToggle,
  epicsBySlug,
  onOpenTask,
  onOpenEpic,
}: ArchiveSectionProps) {
  const ChevronIcon = collapsed ? ChevronRight : ChevronDown;

  return (
    <section className={styles.section} data-testid={`section-${sectionKey}`}>
      <header className={styles.sectionHeader}>
        <button
          type="button"
          className={styles.sectionToggle}
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand section' : 'Collapse section'}
        >
          <ChevronIcon size={16} className={styles.sectionChevron} aria-hidden="true" />
        </button>
        <span className={styles.sectionTitle}>{title}</span>
        <span className={styles.sectionStatus}>(finished)</span>
        <span className={styles.sectionCount}>{tasks.length}</span>
      </header>
      {!collapsed && (
        tasks.length === 0 ? (
          <div className={styles.empty}>No tasks</div>
        ) : (
          <ul className={styles.rows}>
            {tasks.map((task) => {
              const epicSlug = task.frontmatter.epic;
              const epic = epicSlug ? epicsBySlug.get(epicSlug) : undefined;
              return (
                <BacklogRowView
                  key={task.frontmatter.id}
                  className={styles.staticRow}
                  task={task}
                  epic={epic}
                  onOpenTask={onOpenTask}
                  onOpenEpic={onOpenEpic}
                />
              );
            })}
          </ul>
        )
      )}
    </section>
  );
}
