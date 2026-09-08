import { Check, ChevronDown } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import styles from './MultiSelect.module.css';

const MAX_LISTBOX_WIDTH = 320;
const VIEWPORT_MARGIN = 8;
const ALL_VALUE = '*all';

interface ListboxPosition {
  top: number;
  left: number;
  minWidth: number;
  maxWidth: number;
}

export interface MultiSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface MultiSelectProps {
  value: readonly string[];
  options: MultiSelectOption[];
  onChange: (value: string[]) => void;
  ariaLabel?: string | undefined;
  triggerClassName?: string | undefined;
}

const initialHighlight = (value: readonly string[], options: MultiSelectOption[]): number => {
  if (value.length === 0) return 0;
  const idx = options.findIndex((o) => value.includes(o.value));
  return idx === -1 ? 0 : idx + 1;
};

export function MultiSelect({
  value,
  options,
  onChange,
  ariaLabel,
  triggerClassName,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(() => initialHighlight(value, options));
  const [position, setPosition] = useState<ListboxPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const optionIdPrefix = useId();

  const rows: MultiSelectOption[] = [{ value: ALL_VALUE, label: 'All' }, ...options];
  const selectedOption = value.length === 1 ? options.find((o) => o.value === value[0]) : undefined;
  const oneLabel = selectedOption?.label ?? value[0] ?? 'All';
  const triggerLabel =
    value.length === 0 ? 'All' : value.length === 1 ? oneLabel : `${value.length} selected`;
  const triggerIcon = value.length === 1 ? selectedOption?.icon : undefined;
  const listMounted = open && position !== null;

  const closeWithCallback = () => {
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target == null) return;
      if (containerRef.current?.contains(target)) return;
      if (listboxRef.current?.contains(target)) return;
      closeWithCallback();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const available = window.innerWidth - rect.left - VIEWPORT_MARGIN;
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: rect.width,
        maxWidth: Math.max(rect.width, Math.min(MAX_LISTBOX_WIDTH, available)),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!listMounted) return;
    setHighlightedIndex(initialHighlight(value, options));
    listboxRef.current?.focus();
    // Toggling must not jump the highlight; this runs when the list comes up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listMounted]);

  useEffect(() => {
    const list = listboxRef.current;
    const option = list?.children[highlightedIndex];
    if (!list || !(option instanceof HTMLElement)) return;
    const bottom = option.offsetTop + option.offsetHeight;
    if (option.offsetTop < list.scrollTop) {
      list.scrollTop = option.offsetTop;
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [listMounted, highlightedIndex]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const handler = (event: Event) => {
      event.preventDefault();
      closeAndFocusTrigger();
    };
    window.addEventListener('cancel', handler, true);
    return () => window.removeEventListener('cancel', handler, true);
  }, [open]);

  const toggleAt = (index: number) => {
    const row = rows[index];
    if (!row) return;
    if (row.value === ALL_VALUE) {
      onChange([]);
      return;
    }
    if (value.includes(row.value)) {
      onChange(value.filter((v) => v !== row.value));
      return;
    }
    onChange([...value, row.value]);
  };

  const nextEnabledIndex = (from: number, step: number): number => {
    const len = rows.length;
    return (((from + step) % len) + len) % len;
  };

  const firstIndex = (step: number): number => (step > 0 ? 0 : rows.length - 1);

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAndFocusTrigger();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((i) => nextEnabledIndex(i, 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((i) => nextEnabledIndex(i, -1));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setHighlightedIndex(firstIndex(1));
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setHighlightedIndex(firstIndex(-1));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleAt(highlightedIndex);
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
        className={triggerClassName ?? styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel === undefined ? undefined : `${ariaLabel}: ${triggerLabel}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={styles.value}>
          {triggerIcon && (
            <span className={styles.icon} aria-hidden="true">
              {triggerIcon}
            </span>
          )}
          <span className={styles.label}>{triggerLabel}</span>
        </span>
        <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
      </button>
      {open && position && (
        <ul
          id={listboxId}
          role="listbox"
          aria-multiselectable="true"
          aria-activedescendant={`${optionIdPrefix}-${highlightedIndex}`}
          className={styles.listbox}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            minWidth: position.minWidth,
            maxWidth: position.maxWidth,
          }}
          tabIndex={-1}
          ref={listboxRef}
          onKeyDown={handleListKeyDown}
        >
          {rows.map((option, index) => {
            const isAll = option.value === ALL_VALUE;
            const isSelected = isAll ? value.length === 0 : value.includes(option.value);
            const isHighlighted = index === highlightedIndex;
            return (
              <li
                key={option.value}
                id={`${optionIdPrefix}-${index}`}
                role="option"
                aria-selected={isSelected}
                className={
                  `${styles.option}` + (isHighlighted ? ` ${styles.optionHighlighted}` : '')
                }
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  toggleAt(index);
                }}
              >
                <span
                  className={styles.checkbox + (isSelected ? ` ${styles.checkboxChecked}` : '')}
                  aria-hidden="true"
                >
                  {isSelected && <Check size={10} strokeWidth={3} />}
                </span>
                {option.icon && (
                  <span className={styles.icon} aria-hidden="true">
                    {option.icon}
                  </span>
                )}
                <span className={styles.label}>{option.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
