import { Plus, Trash2 } from 'lucide-react';
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
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
  // Nothing is lit until an arrow key says so: with no highlight Enter still means
  // the first match, which is what the search row has always done.
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const returnFocusRef = useRef(false);
  const listId = useId();
  const optionIdPrefix = useId();

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

  const listShowing = query.trim() !== '' && !dismissed;
  // A highlight left pointing past the end of a shorter list reads as nothing.
  const activeIndex =
    highlighted !== null && highlighted < suggestions.length ? highlighted : null;

  // The user re-filtering is what clears the highlight and brings a dismissed list
  // back — not the suggestions changing, which a reload or an external edit does
  // too without the user having typed anything.
  useEffect(() => {
    setHighlighted(null);
    setDismissed(false);
  }, [query, relation]);

  // Both paths out of the search row unmount it, so the focus lands on the button
  // that opened it a render later rather than from inside the handler.
  useEffect(() => {
    if (searching || !returnFocusRef.current) return;
    returnFocusRef.current = false;
    addButtonRef.current?.focus();
  }, [searching]);

  useEffect(() => {
    const list = listRef.current;
    const option = activeIndex === null ? null : list?.children[activeIndex];
    if (!list || !(option instanceof HTMLElement)) return;
    const bottom = option.offsetTop + option.offsetHeight;
    if (option.offsetTop < list.scrollTop) {
      list.scrollTop = option.offsetTop;
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [activeIndex]);

  const select = (otherId: string) => {
    returnFocusRef.current = true;
    setQuery('');
    setSearching(false);
    void addTaskLink(id, otherId, relation);
  };

  // Escape backs out one stage: the list first, then the search row, and only then
  // the dialog. It has to be caught twice over, because neither catch is enough on
  // its own. The keydown is what a browser that treats Escape as an ordinary
  // default action listens to; the dialog's `cancel` is where a browser that runs
  // its own close request raises it, and there the second Escape in a row can
  // arrive uncancellable, so the keydown has to have stopped it already. The ref
  // keeps one keystroke from spending two stages when both fire.
  const escapeHandledRef = useRef(false);

  const backOutOneStage = () => {
    if (listShowing) {
      setDismissed(true);
      return;
    }
    returnFocusRef.current = true;
    setQuery('');
    setSearching(false);
  };

  useEffect(() => {
    if (!searching) return;
    const handler = (event: Event) => {
      // An Escape aimed at the relation picker's own listbox is that popup's: its
      // handler runs alongside this one, so this one has to decline outright.
      if (document.activeElement !== inputRef.current) return;
      event.preventDefault();
      if (escapeHandledRef.current) {
        escapeHandledRef.current = false;
        return;
      }
      backOutOneStage();
    };
    window.addEventListener('cancel', handler, true);
    return () => window.removeEventListener('cancel', handler, true);
    // backOutOneStage is rebuilt every render and closes over the state below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, listShowing]);

  const onQueryKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      escapeHandledRef.current = true;
      backOutOneStage();
      return;
    }
    escapeHandledRef.current = false;
    if (e.key === 'Tab') {
      // No preventDefault: the list goes and focus moves on, nothing is linked.
      setDismissed(true);
      return;
    }
    if (!listShowing || suggestions.length === 0) return;
    const last = suggestions.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(activeIndex === null ? 0 : (activeIndex + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(activeIndex === null ? last : (activeIndex - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = suggestions[activeIndex ?? 0];
      if (picked) select(picked.frontmatter.id);
    }
  };

  return (
    <section className={styles.section} data-testid="linked-tasks">
      <div className={styles.heading}>
        <h3 className={styles.headingText}>Linked tasks</h3>
        {rows.length > 0 && <span className={styles.count}>{rows.length}</span>}
        {!readOnly && (
          <button
            ref={addButtonRef}
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
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            value={query}
            placeholder="Search by title or id…"
            aria-label="Search tasks to link"
            role="combobox"
            aria-expanded={listShowing}
            aria-controls={listShowing ? listId : undefined}
            aria-activedescendant={
              activeIndex === null ? undefined : `${optionIdPrefix}-${activeIndex}`
            }
            aria-autocomplete="list"
            autoComplete="off"
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onQueryKeyDown}
          />
          {listShowing && (
            <ul
              ref={listRef}
              id={listId}
              className={styles.suggestions}
              role="listbox"
              aria-label="Matching tasks"
            >
              {suggestions.length === 0 ? (
                <li className={styles.suggestionEmpty}>No matching tasks</li>
              ) : (
                suggestions.map((t, index) => (
                  <li
                    key={t.frontmatter.id}
                    id={`${optionIdPrefix}-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={
                      `${styles.suggestion}` +
                      (index === activeIndex ? ` ${styles.suggestionHighlighted}` : '')
                    }
                    onMouseEnter={() => setHighlighted(index)}
                    onMouseDown={(e) => {
                      // Keeps the click from blurring the field before it links,
                      // and only a primary click links: writing to two task files
                      // is not what a right-click asked for.
                      e.preventDefault();
                      if (e.button === 0) select(t.frontmatter.id);
                    }}
                  >
                    <span className={styles.taskId}>{t.frontmatter.id}</span>
                    <span className={styles.suggestionTitle}>{t.title}</span>
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
