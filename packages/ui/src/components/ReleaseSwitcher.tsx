import { Check, ChevronsUpDown } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { Release } from '@boardown/core';
import styles from './ReleaseSwitcher.module.css';

interface ListPosition {
  top: number;
  left: number;
}

interface ReleaseSwitcherProps {
  // Every active release, in board order. The switcher is the affordance for
  // having more than one, so with one it renders nothing at all.
  releases: readonly Release[];
  selectedSlug: string;
  onSelect: (slug: string) => void;
}

const releaseTitle = (release: Release): string =>
  release.frontmatter.name ?? release.slug;

export function ReleaseSwitcher({ releases, selectedSlug, onSelect }: ReleaseSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<ListPosition | null>(null);
  const [highlight, setHighlight] = useState(0);
  const listId = useId();
  const optionId = (index: number): string => `${listId}-option-${index}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target == null) return;
      if (containerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  // Fixed positioning off the trigger's rect, so the list escapes any overflow
  // the header sits in instead of being clipped by it.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  // The list only mounts once its position is known, so focus has to wait for
  // that render or the keyboard never enters it.
  useEffect(() => {
    if (open && position) listRef.current?.focus();
  }, [open, position]);

  // Escape inside a native <dialog> is a close request the browser handles
  // itself; catching the `cancel` while the list is open dismisses only the list.
  useEffect(() => {
    if (!open) return;
    const handler = (event: Event) => {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener('cancel', handler, true);
    return () => window.removeEventListener('cancel', handler, true);
  }, [open]);

  if (releases.length < 2) return null;

  const selectedIndex = releases.findIndex((r) => r.slug === selectedSlug);
  const shown = releases[selectedIndex];
  const selectedTitle = shown ? releaseTitle(shown) : selectedSlug;

  const openList = () => {
    setHighlight(selectedIndex === -1 ? 0 : selectedIndex);
    setOpen(true);
  };

  const closeAndFocusTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const activate = (index: number) => {
    const release = releases[index];
    if (!release) return;
    setOpen(false);
    triggerRef.current?.focus();
    // Also for the release already on screen: with no stored key it is only the
    // first-sorting active one, and this click is what pins it.
    onSelect(release.slug);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      openList();
    }
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAndFocusTrigger();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(highlight);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((i) => (i + 1) % releases.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((i) => (i - 1 + releases.length) % releases.length);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setHighlight(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setHighlight(releases.length - 1);
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        // The selection is in the name so a reader — and a test — can tell which
        // release the board is on without opening the list.
        aria-label={`Switch release: ${selectedTitle}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleTriggerKeyDown}
      >
        <ChevronsUpDown size={14} aria-hidden="true" />
      </button>
      {open && position && (
        <ul
          id={listId}
          role="listbox"
          aria-activedescendant={optionId(highlight)}
          className={styles.listbox}
          style={{ position: 'fixed', top: position.top, left: position.left }}
          tabIndex={-1}
          ref={listRef}
          onKeyDown={handleListKeyDown}
        >
          {releases.map((release, index) => {
            const selected = release.slug === selectedSlug;
            return (
              <li
                key={release.filename}
                id={optionId(index)}
                role="option"
                aria-selected={selected}
                className={`${styles.option}${index === highlight ? ` ${styles.optionHighlighted}` : ''}`}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  activate(index);
                }}
              >
                <span className={styles.mark}>
                  {selected && <Check size={14} aria-hidden="true" />}
                </span>
                <span className={styles.label}>{releaseTitle(release)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
