import type { CSSProperties } from 'react';
import type { Epic, Release, Task, TaskStatus } from '@boardown/core';
import { TASK_TYPE_META } from '../task-types';
import { pickContrastText } from '../utils/contrast-color';
import { formatStatusLabel } from '../utils/format-status';
import styles from './BoardView.module.css';

interface BoardViewProps {
  release: Release;
  epics: Epic[];
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

export function BoardView({ release, epics, statuses }: BoardViewProps) {
  const buckets = groupTasksByStatus(release.tasks, statuses);
  const epicsBySlug = new Map(epics.map((e) => [e.slug, e]));

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
                tasks.map((task) => {
                  const slug = task.frontmatter.epic;
                  const epic = slug ? epicsBySlug.get(slug) : undefined;
                  return <TaskCard key={task.frontmatter.id} task={task} epic={epic} />;
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  epic: Epic | undefined;
}

function TaskCard({ task, epic }: TaskCardProps) {
  const { id, type } = task.frontmatter;
  const typeMeta = TASK_TYPE_META[type];
  const TypeIcon = typeMeta.icon;

  const epicStyle = epic
    ? ({
        '--epic-bg': epic.frontmatter.color,
        '--epic-fg': pickContrastText(epic.frontmatter.color),
      } as CSSProperties)
    : undefined;

  return (
    <article className={styles.card}>
      <h3 className={styles.cardTitle}>{task.title}</h3>
      {epic && (
        <span className={styles.epicBadge} style={epicStyle}>
          {epic.frontmatter.name}
        </span>
      )}
      <footer className={styles.cardFooter}>
        <TypeIcon
          className={styles.typeIcon}
          style={{ color: typeMeta.colorVar }}
          aria-label={typeMeta.label}
        />
        <span className={styles.idText}>{id}</span>
      </footer>
    </article>
  );
}
