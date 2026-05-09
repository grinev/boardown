import { Plus } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Epic, Release, Task, TaskStatus } from '@boardown/core';
import { useBoardStore } from '../store';
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
  const openCreateTask = useBoardStore((s) => s.openCreateTask);

  return (
    <div className={styles.board}>
      {statuses.map((status, index) => {
        const tasks = buckets.get(status) ?? [];
        const isFirstColumn = index === 0;
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
            {isFirstColumn && (
              <button
                type="button"
                className={styles.addTaskButton}
                onClick={() => openCreateTask(release.filename)}
              >
                <Plus size={14} aria-hidden="true" />
                <span>Create task</span>
              </button>
            )}
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
  const openTask = useBoardStore((s) => s.openTask);
  const openEpic = useBoardStore((s) => s.openEpic);

  const epicStyle = epic
    ? ({
        '--epic-bg': epic.frontmatter.color,
        '--epic-fg': pickContrastText(epic.frontmatter.color),
      } as CSSProperties)
    : undefined;

  return (
    <article className={styles.card}>
      <h3 className={styles.cardTitle}>
        <button
          type="button"
          className={styles.cardTitleButton}
          onClick={() => openTask(id)}
        >
          {task.title}
        </button>
      </h3>
      {epic && (
        <button
          type="button"
          className={styles.epicBadge}
          style={epicStyle}
          onClick={(e) => {
            e.stopPropagation();
            openEpic(epic.slug);
          }}
        >
          {epic.frontmatter.name}
        </button>
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
