import { Plus, Trash2 } from 'lucide-react';
import { Fragment, useMemo, useState, type KeyboardEvent } from 'react';
import {
  DEFAULT_LINK_TYPE,
  LINK_TYPE_META,
  sortTasksByOrder,
  type LinkType,
  type Task,
  type TaskStatus,
} from '@boardown/core';
import { useBoardStore } from '../store';
import { TASK_TYPE_META } from '../task-types';
import { formatStatusLabel } from '../utils/format-status';
import {
  LINK_TYPES_IN_GROUP_ORDER,
  collectLinkedTasks,
  groupLinkedTasks,
  isTaskArchived,
} from '../utils/linked-tasks';
import { IconSelect, type IconSelectOption } from './IconSelect';
import styles from './LinkedTasks.module.css';

interface LinkedTasksProps {
  task: Task;
  // The task lives in a finished release: links are visible but frozen.
  readOnly: boolean;
  onTaskClick: (id: string) => void;
}

const MAX_SUGGESTIONS = 8;

const RELATION_OPTIONS: IconSelectOption[] = LINK_TYPES_IN_GROUP_ORDER.map((type) => ({
  value: type,
  label: LINK_TYPE_META[type].label,
}));

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
  const [relation, setRelation] = useState<LinkType>(DEFAULT_LINK_TYPE);

  const id = task.frontmatter.id;
  const rows = useMemo(
    () => (snapshot ? collectLinkedTasks(snapshot, id) : []),
    [snapshot, id],
  );
  const groups = useMemo(() => groupLinkedTasks(rows), [rows]);

  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (snapshot === null || needle === '') return [];
    // A pair may carry several relations at once, so only the tasks already linked
    // with the relation being added are out — the rest are still offerable.
    const linked = new Set(
      rows.filter((r) => r.type === relation).map((r) => r.task.frontmatter.id),
    );
    // Sorted per container: the pool is sliced to the first few matches, and a
    // file's block order says nothing about where a task sits on the board.
    const candidates = [
      ...snapshot.releases.flatMap((r) => sortTasksByOrder(r.tasks)),
      ...snapshot.epics.flatMap((e) => sortTasksByOrder(e.tasks)),
      ...sortTasksByOrder(snapshot.backlog?.tasks ?? []),
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
  }, [snapshot, query, rows, relation, id]);

  const select = (otherId: string) => {
    setQuery('');
    setSearching(false);
    void addTaskLink(id, otherId, relation);
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
              setRelation(DEFAULT_LINK_TYPE);
              setSearching((open) => !open);
            }}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {groups.length > 0 && (
        <div className={styles.table}>
          {groups.map((group) => (
            <Fragment key={group.type}>
              {/* The relation is stated here rather than per row: on a frozen
                  dialog the per-row control is not rendered, so this heading is
                  the only place it appears. */}
              <h4 className={styles.groupHeading}>{LINK_TYPE_META[group.type].label}</h4>
              {group.rows.map(({ task: linked, type, archived }) => {
                const meta = TASK_TYPE_META[linked.frontmatter.type];
                const TypeIcon = meta.icon;
                const linkedId = linked.frontmatter.id;
                const frozen = readOnly || archived;
                const label = LINK_TYPE_META[type].label;
                return (
                  // display: contents — the cells sit directly in the grid, while
                  // the row wrapper still gives CSS a hover target for the actions.
                  <div key={`${type}:${linkedId}`} className={styles.row}>
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
                    {frozen ? (
                      <span className={styles.removeSpacer} />
                    ) : (
                      <button
                        type="button"
                        className={styles.removeButton}
                        // Two rows can point at the same task, so the name has to
                        // say which of them this button breaks.
                        aria-label={`Remove "${label}" link to ${linkedId}`}
                        onClick={() => {
                          void removeTaskLink(id, linkedId, type);
                        }}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      )}

      {!readOnly && searching && (
        <div className={styles.search}>
          <IconSelect
            value={relation}
            options={RELATION_OPTIONS}
            onChange={(next) => setRelation(next as LinkType)}
            ariaLabel="Relation"
            triggerClassName={styles.searchRelation}
          />
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
