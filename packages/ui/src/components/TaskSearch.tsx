import { Search, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useBoardStore } from '../store';
import { TASK_TYPE_META } from '../task-types';
import { isSearchable, searchTasks } from '../utils/search-tasks';
import styles from './TaskSearch.module.css';

interface ListPosition {
  top: number;
  left: number;
  minWidth: number;
  maxWidth: number;
}

// The list starts at the field's width and grows with the longest title it
// holds, rather than clipping every row to a field narrow enough to sit in the
// tab bar. Capped so it never spans the window.
const MAX_LIST_WIDTH = 560;
const VIEWPORT_MARGIN = 16;

export function TaskSearch() {
  const status = useBoardStore((s) => s.status);
  const snapshot = useBoardStore((s) => s.snapshot);
  const openTask = useBoardStore((s) => s.openTask);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [position, setPosition] = useState<ListPosition | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const optionIdPrefix = useId();

  const results = useMemo(() => searchTasks(snapshot, query), [snapshot, query]);
  const showList = open && isSearchable(query);
  const hasOptions = showList && results.length > 0;

  useEffect(() => setHighlighted(0), [results]);

  // A reload that fails drops the snapshot and leaves `ready`. Without this the
  // open list would sit there reporting "no tasks found" for a board that is not
  // loaded at all, which reads as an empty search rather than a broken board.
  useEffect(() => {
    if (status !== 'ready') setOpen(false);
  }, [status]);

  useEffect(() => {
    if (!showList) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target === null) return;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showList]);

  // Positioned from the input's rect rather than absolutely, the same way every
  // other dropdown in the app is, so the bar's stacking never clips it.
  useLayoutEffect(() => {
    if (!showList) {
      setPosition(null);
      return;
    }
    const update = () => {
      const field = rootRef.current;
      if (!field) return;
      const rect = field.getBoundingClientRect();
      const available = window.innerWidth - rect.left - VIEWPORT_MARGIN;
      setPosition({
        top: rect.bottom + 6,
        left: rect.left,
        minWidth: rect.width,
        maxWidth: Math.max(rect.width, Math.min(MAX_LIST_WIDTH, available)),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [showList]);

  const pick = (index: number) => {
    const task = results[index];
    if (!task) return;
    // The query stays: closing the dialog leaves the same result set one focus
    // away, so walking a list of matches never means retyping.
    setOpen(false);
    openTask(task.frontmatter.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (!showList) return;
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (!hasOptions) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((i) => (i + 1) % results.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((i) => (i - 1 + results.length) % results.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      pick(highlighted);
    }
  };

  const listStyle = position
    ? {
        position: 'fixed' as const,
        top: position.top,
        left: position.left,
        minWidth: position.minWidth,
        maxWidth: position.maxWidth,
      }
    : undefined;

  return (
    <div
      ref={rootRef}
      className={status === 'ready' ? styles.root : `${styles.root} ${styles.rootDisabled}`}
    >
      <Search size={16} className={styles.icon} aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        className={styles.input}
        placeholder="Search tasks…"
        aria-label="Search tasks"
        aria-expanded={hasOptions}
        aria-controls={hasOptions ? listId : undefined}
        aria-activedescendant={hasOptions ? `${optionIdPrefix}-${highlighted}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={status !== 'ready'}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {query !== '' && status === 'ready' && (
        <button
          type="button"
          className={styles.clear}
          aria-label="Clear search"
          // Keep the field focused, so clearing leaves the cursor where the user
          // is about to type again.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setQuery('');
            setOpen(false);
            inputRef.current?.focus();
          }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
      {showList &&
        position !== null &&
        (results.length === 0 ? (
          <div className={`${styles.list} ${styles.empty}`} style={listStyle} role="status">
            No tasks found
          </div>
        ) : (
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label="Matching tasks"
            className={styles.list}
            style={listStyle}
          >
            {results.map((task, index) => {
              const meta = TASK_TYPE_META[task.frontmatter.type];
              const TypeIcon = meta.icon;
              return (
                <li
                  key={task.frontmatter.id}
                  id={`${optionIdPrefix}-${index}`}
                  role="option"
                  aria-selected={index === highlighted}
                  className={
                    index === highlighted
                      ? `${styles.option} ${styles.optionHighlighted}`
                      : styles.option
                  }
                  onMouseEnter={() => setHighlighted(index)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(index);
                  }}
                >
                  <TypeIcon
                    size={14}
                    className={styles.typeIcon}
                    style={{ color: meta.colorVar }}
                    aria-label={meta.label}
                  />
                  <span className={styles.id}>{task.frontmatter.id}</span>
                  <span className={styles.title}>{task.title}</span>
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}
