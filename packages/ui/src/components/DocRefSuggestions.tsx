import { FileText } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { DocRefSuggestions as Suggestions } from '../hooks/use-doc-ref-suggestions';
import type { CaretPoint } from '../utils/caret-position';
import styles from './DocRefSuggestions.module.css';

interface DocRefSuggestionsProps {
  suggestions: Suggestions;
}

// Breathing room against the window edges when the list has to be pulled back in.
const MARGIN = 8;

interface Placement {
  top: number;
  left: number;
}

// The list opens below the caret, flips above it when it does not fit and there
// is room, and is otherwise pulled back inside the window on both axes.
const place = (point: CaretPoint, width: number, height: number): Placement => {
  const roomBelow = window.innerHeight - point.top;
  const roomAbove = point.top - point.lineHeight;
  const top =
    roomBelow < height + MARGIN && roomAbove > height + MARGIN
      ? point.top - point.lineHeight - height
      : Math.min(point.top, window.innerHeight - height - MARGIN);
  const left = Math.min(point.left, window.innerWidth - width - MARGIN);
  return { top: Math.max(MARGIN, top), left: Math.max(MARGIN, left) };
};

export function DocRefSuggestions({ suggestions }: DocRefSuggestionsProps) {
  const { open, items, activeIndex, point, container, accept } = suggestions;
  const listRef = useRef<HTMLUListElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  // Measured from `offsetWidth`/`offsetHeight`, which the placement leaves
  // untouched — measuring the rendered rect would feed the result back in.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el === null || point === null) {
      setPlacement(null);
      return;
    }
    setPlacement(place(point, el.offsetWidth, el.offsetHeight));
  }, [point, items.length]);

  if (!open || point === null || container === null) return null;

  // Picking a suggestion must not blur the field, which would commit the edit
  // before the insertion lands.
  const keepFocus = (e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
  };

  return createPortal(
    <ul
      ref={listRef}
      className={styles.list}
      style={{
        top: placement?.top ?? point.top,
        left: placement?.left ?? point.left,
        // The first paint is the one being measured; showing it would flash the
        // list at the unplaced position.
        visibility: placement === null ? 'hidden' : undefined,
      }}
      role="listbox"
      aria-label="Matching pages"
      onMouseDown={keepFocus}
    >
      {items.length === 0 ? (
        <li className={styles.empty}>No pages found</li>
      ) : (
        items.map((item, i) => (
          <li key={item.path}>
            <button
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              className={`${styles.item} ${i === activeIndex ? styles.itemActive : ''}`}
              onClick={() => accept(i)}
            >
              <FileText size={14} className={styles.icon} aria-hidden="true" />
              <span className={styles.title}>{item.title}</span>
              <span className={styles.path}>{item.token}</span>
            </button>
          </li>
        ))
      )}
    </ul>,
    container,
  );
}
