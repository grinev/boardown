import { ListChecks, MessageSquare } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Epic, Task } from '@boardown/core';
import { useBoardStore } from '../store';
import { TASK_TYPE_META } from '../task-types';
import { pickContrastText } from '../utils/contrast-color';
import styles from './BoardView.module.css';

interface TaskCardProps {
  task: Task;
  epic: Epic | undefined;
}

export function TaskCard({ task, epic }: TaskCardProps) {
  const { id, type } = task.frontmatter;
  const typeMeta = TASK_TYPE_META[type];
  const TypeIcon = typeMeta.icon;
  const openTask = useBoardStore((s) => s.openTask);
  const openEpic = useBoardStore((s) => s.openEpic);

  const checklist = task.frontmatter.checklist ?? [];
  const checklistDone = checklist.filter((it) => it.done).length;
  const allDone = checklist.length > 0 && checklistDone === checklist.length;
  const notes = task.frontmatter.notes ?? [];

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
          onClick={(e) => {
            e.stopPropagation();
            openTask(id);
          }}
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
        {checklist.length > 0 && (
          <span
            className={`${styles.checklistBadge} ${allDone ? styles.checklistBadgeDone : ''}`}
            title="Checklist"
          >
            <ListChecks size={14} aria-hidden="true" />
            {checklistDone}/{checklist.length}
          </span>
        )}
        {notes.length > 0 && (
          <span className={styles.notesBadge} title="Notes">
            <MessageSquare size={14} aria-hidden="true" />
            {notes.length}
          </span>
        )}
      </footer>
    </article>
  );
}
