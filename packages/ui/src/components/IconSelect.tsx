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

interface ListboxPosition {
  top: number;
  left: number;
  minWidth: number;
}

export interface IconSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
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
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: rect.width,
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
        aria-label={ariaLabel}
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
