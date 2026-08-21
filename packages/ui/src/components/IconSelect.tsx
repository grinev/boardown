import { ChevronDown } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import styles from './IconSelect.module.css';

// The listbox is placed with an inline style, which beats any max-width the
// stylesheet could set — so its own maximum lives here too, and there is one
// source of truth for how wide a picker gets.
const MAX_LISTBOX_WIDTH = 320;
const VIEWPORT_MARGIN = 8;

interface ListboxPosition {
  top: number;
  left: number;
  minWidth: number;
  maxWidth: number;
}

export interface IconSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  // A destination the board refuses today. Shown rather than omitted, so the
  // user sees why it is unavailable; `title` carries the explanation.
  disabled?: boolean | undefined;
  title?: string | undefined;
}

interface IconSelectProps {
  value: string;
  options: IconSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string | undefined;
  disabled?: boolean | undefined;
  triggerClassName?: string | undefined;
  listboxClassName?: string | undefined;
  hideChevron?: boolean | undefined;
  hideTriggerIcon?: boolean | undefined;
  autoOpen?: boolean | undefined;
  onClose?: (() => void) | undefined;
}

export function IconSelect({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  triggerClassName,
  listboxClassName,
  hideChevron = false,
  hideTriggerIcon = false,
  autoOpen = false,
  onClose,
}: IconSelectProps) {
  const [open, setOpen] = useState(autoOpen);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(() => {
    const idx = options.findIndex((o) => o.value === value);
    return idx === -1 ? 0 : idx;
  });
  const [position, setPosition] = useState<ListboxPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const optionIdPrefix = useId();

  const selectedOption = options.find((o) => o.value === value);

  const closeWithCallback = () => {
    setOpen(false);
    onClose?.();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Floored at the trigger's own width so a picker anchored near the right
      // edge shrinks to the space left rather than to nothing.
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
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setHighlightedIndex(idx === -1 ? 0 : idx);
      listboxRef.current?.focus();
    }
  }, [open, options, value]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
    onClose?.();
  };

  // Escape inside a native <dialog> is a close request the browser handles itself:
  // preventing the keydown does not stop it, and the listbox only sees the keydown
  // while it holds focus. Catching the dialog's `cancel` while the listbox is open
  // lets Escape dismiss it without closing the dialog around it — the same rule the
  // dialog header's actions menu already follows.
  useEffect(() => {
    if (!open) return;
    const handler = (event: Event) => {
      event.preventDefault();
      closeAndFocusTrigger();
    };
    window.addEventListener('cancel', handler, true);
    return () => window.removeEventListener('cancel', handler, true);
    // closeAndFocusTrigger is stable in effect: it only touches refs and setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectAt = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    closeAndFocusTrigger();
  };

  // Keyboard navigation walks past a disabled option instead of resting on it;
  // with every option disabled it simply stays put.
  const nextEnabledIndex = (from: number, step: number): number => {
    const len = options.length;
    for (let i = 1; i <= len; i += 1) {
      const idx = (((from + step * i) % len) + len) % len;
      if (!options[idx]?.disabled) return idx;
    }
    return from;
  };

  const firstEnabledIndex = (from: number, step: number): number => {
    for (let i = 0; i < options.length; i += 1) {
      const idx = step > 0 ? i : options.length - 1 - i;
      if (!options[idx]?.disabled) return idx;
    }
    return from;
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    // A closed trigger lets Cmd/Ctrl+Enter through to whatever surrounds the
    // picker — a creation dialog reads it as submit. An open one keeps the key
    // whatever the modifier: what a popup does with Enter is the popup's.
    if (!open && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) return;
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
      setHighlightedIndex((i) => firstEnabledIndex(i, 1));
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setHighlightedIndex((i) => firstEnabledIndex(i, -1));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectAt(highlightedIndex);
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      onClose?.();
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
        // Without the value the accessible name is just the field name, so the
        // current selection is invisible to screen readers and to Playwright.
        aria-label={selectedOption ? `${ariaLabel}: ${selectedOption.label}` : ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={styles.value}>
          {!hideTriggerIcon && selectedOption?.icon && (
            <span className={styles.icon} aria-hidden="true">
              {selectedOption.icon}
            </span>
          )}
          <span className={styles.label}>{selectedOption?.label ?? ''}</span>
        </span>
        {!hideChevron && (
          <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
        )}
      </button>
      {open && position && (
        <ul
          id={listboxId}
          role="listbox"
          aria-activedescendant={`${optionIdPrefix}-${highlightedIndex}`}
          className={
            listboxClassName
              ? `${styles.listbox} ${listboxClassName}`
              : styles.listbox
          }
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
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isHighlighted = index === highlightedIndex;
            return (
              <li
                key={option.value}
                id={`${optionIdPrefix}-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled ? true : undefined}
                title={option.title}
                className={
                  `${styles.option}` +
                  (isHighlighted ? ` ${styles.optionHighlighted}` : '') +
                  (option.disabled ? ` ${styles.optionDisabled}` : '')
                }
                onMouseEnter={() => {
                  if (!option.disabled) setHighlightedIndex(index);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectAt(index);
                }}
              >
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
