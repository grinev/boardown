import type { Release, Task, TaskStatus } from '@boardown/core';
import { formatStatusLabel } from '../utils/format-status';
import styles from './BoardView.module.css';

interface BoardViewProps {
  release: Release;
  statuses: readonly TaskStatus[];
}

const groupTasksByStatus = (
  tasks: Task[],
  statuses: readonly TaskStatus[],
): Map<TaskStatus, Task[]> => {
  const buckets = new Map<TaskStatus, Task[]>();
  for (const status of statuses) buckets.set(status, []);
  for (const task of tasks) {
    const list = buckets.get(task.frontmatter.status);
    if (list !== undefined) list.push(task);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => a.frontmatter.order - b.frontmatter.order);
  }
  return buckets;
};

export function BoardView({ release, statuses }: BoardViewProps) {
  const buckets = groupTasksByStatus(release.tasks, statuses);

  return (
    <div className={styles.board}>
      {statuses.map((status) => {
        const tasks = buckets.get(status) ?? [];
        return (
          <div key={status} className={styles.column}>
            <div className={styles.columnHeader}>
              <span>{formatStatusLabel(status)}</span>
              <span className={styles.columnCount}>{tasks.length}</span>
            </div>
            <div className={styles.cards}>
              {tasks.length === 0 ? (
                <div className={styles.empty}>No tasks</div>
              ) : (
                tasks.map((task) => <TaskCard key={task.frontmatter.id} task={task} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const { id, epic } = task.frontmatter;
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.idBadge}>{id}</span>
        <span className={styles.cardTitle}>{task.title}</span>
      </div>
      {epic && (
        <div className={styles.cardMeta}>
          <span className={styles.epicBadge}>{epic}</span>
        </div>
      )}
    </article>
  );
}
