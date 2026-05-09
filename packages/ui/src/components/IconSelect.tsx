import { ChevronDown } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import styles from './IconSelect.module.css';

export interface IconSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface IconSelectProps {
  value: string;
  options: IconSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
}

export function IconSelect({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
}: IconSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(() => {
    const idx = options.findIndex((o) => o.value === value);
    return idx === -1 ? 0 : idx;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const optionIdPrefix = useId();

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
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
  };

  const selectAt = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    closeAndFocusTrigger();
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
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
      setHighlightedIndex((i) => (i + 1) % options.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((i) => (i - 1 + options.length) % options.length);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setHighlightedIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setHighlightedIndex(options.length - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectAt(highlightedIndex);
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
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={styles.value}>
          {selectedOption?.icon && (
            <span className={styles.icon} aria-hidden="true">
              {selectedOption.icon}
            </span>
          )}
          <span className={styles.label}>{selectedOption?.label ?? ''}</span>
        </span>
        <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
      </button>
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-activedescendant={`${optionIdPrefix}-${highlightedIndex}`}
          className={styles.listbox}
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
                className={`${styles.option}${isHighlighted ? ` ${styles.optionHighlighted}` : ''}`}
                onMouseEnter={() => setHighlightedIndex(index)}
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
