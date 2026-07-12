import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import type { Task, TaskStatus } from '@boardown/core';
import { useBoardStore } from '../store';
import { TASK_TYPE_META } from '../task-types';
import { formatStatusLabel } from '../utils/format-status';
import { collectLinkedTasks, isTaskArchived } from '../utils/linked-tasks';
import styles from './LinkedTasks.module.css';

interface LinkedTasksProps {
  task: Task;
  // The task lives in a finished release: links are visible but frozen.
  readOnly: boolean;
  onTaskClick: (id: string) => void;
}

const MAX_SUGGESTIONS = 8;

const STATUS_PILL_CLASS: Record<TaskStatus, string | undefined> = {
  todo: styles.statusTodo,
  'in-progress': styles.statusInProgress,
  done: styles.statusDone,
};

export function LinkedTasks({ task, readOnly, onTaskClick }: LinkedTasksProps) {
  const snapshot = useBoardStore((s) => s.snapshot);
  const addTaskLink = useBoardStore((s) => s.addTaskLink);
  const removeTaskLink = useBoardStore((s) => s.removeTaskLink);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const id = task.frontmatter.id;
  const rows = useMemo(
    () => (snapshot ? collectLinkedTasks(snapshot, id) : []),
    [snapshot, id],
  );

  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (snapshot === null || needle === '') return [];
    const linked = new Set(rows.map((r) => r.task.frontmatter.id));
    const candidates = [
      ...snapshot.releases.flatMap((r) => r.tasks),
      ...snapshot.epics.flatMap((e) => e.tasks),
      ...(snapshot.backlog?.tasks ?? []),
    ];
    return candidates
      .filter((t) => {
        const other = t.frontmatter.id;
        if (other === id || linked.has(other)) return false;
        // An archived task cannot be linked: the write would touch its file.
        if (isTaskArchived(snapshot, other)) return false;
        return (
          other.toLowerCase().includes(needle) ||
          t.title.toLowerCase().includes(needle)
        );
      })
      .slice(0, MAX_SUGGESTIONS);
  }, [snapshot, query, rows, id]);

  const select = (otherId: string) => {
    setQuery('');
    setSearching(false);
    void addTaskLink(id, otherId);
  };

  const onQueryKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Escape backs out of the search; preventDefault keeps it from reaching the
      // native <dialog>, which would close the whole task dialog (same rule as
      // InlineEditText's cancel).
      e.preventDefault();
      setQuery('');
      setSearching(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const first = suggestions[0];
      if (first) select(first.frontmatter.id);
    }
  };

  return (
    <section className={styles.section} data-testid="linked-tasks">
      <div className={styles.heading}>
        <h3 className={styles.headingText}>Linked tasks</h3>
        {rows.length > 0 && <span className={styles.count}>{rows.length}</span>}
        {!readOnly && (
          <button
            type="button"
            className={styles.addButton}
            aria-label="Link a task"
            aria-expanded={searching}
            onClick={() => {
              setQuery('');
              setSearching((open) => !open);
            }}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <div className={styles.table} role="table" aria-label="Linked tasks">
          {rows.map(({ task: linked, archived }) => {
            const meta = TASK_TYPE_META[linked.frontmatter.type];
            const TypeIcon = meta.icon;
            const linkedId = linked.frontmatter.id;
            return (
              // display: contents — the cells sit directly in the grid, while the
              // row wrapper still gives CSS a hover target for the trash button.
              <div key={linkedId} role="row" className={styles.row}>
                <TypeIcon
                  className={styles.typeIcon}
                  style={{ color: meta.colorVar }}
                  aria-label={meta.label}
                />
                <span className={styles.taskId}>{linkedId}</span>
                <button
                  type="button"
                  className={styles.titleButton}
                  onClick={() => onTaskClick(linkedId)}
                >
                  {linked.title}
                </button>
                <span
                  className={`${styles.statusPill} ${STATUS_PILL_CLASS[linked.frontmatter.status] ?? ''}`}
                >
                  {formatStatusLabel(linked.frontmatter.status)}
                </span>
                {readOnly || archived ? (
                  <span className={styles.removeSpacer} />
                ) : (
                  <button
                    type="button"
                    className={styles.removeButton}
                    aria-label={`Remove link to ${linkedId}`}
                    onClick={() => {
                      void removeTaskLink(id, linkedId);
                    }}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!readOnly && searching && (
        <div className={styles.search}>
          <input
            type="text"
            className={styles.searchInput}
            value={query}
            placeholder="Search by title or id…"
            aria-label="Search tasks to link"
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onQueryKeyDown}
          />
          {query.trim() !== '' && (
            <ul className={styles.suggestions} role="listbox" aria-label="Matching tasks">
              {suggestions.length === 0 ? (
                <li className={styles.suggestionEmpty}>No matching tasks</li>
              ) : (
                suggestions.map((t) => (
                  <li key={t.frontmatter.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      className={styles.suggestion}
                      onClick={() => select(t.frontmatter.id)}
                    >
                      <span className={styles.taskId}>{t.frontmatter.id}</span>
                      <span className={styles.suggestionTitle}>{t.title}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
