import { Check, X } from 'lucide-react';
import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import styles from './InlineEditText.module.css';

interface InlineEditTextProps {
  value: string;
  onSave: (next: string) => Promise<void>;
  multiline?: boolean;
  required?: boolean;
  placeholder?: string;
  ariaLabel: string;
  className?: string | undefined;
}

const cx = (...parts: Array<string | false | undefined>): string =>
  parts.filter(Boolean).join(' ');

export function InlineEditText({
  value,
  onSave,
  multiline = false,
  required = false,
  placeholder,
  ariaLabel,
  className,
}: InlineEditTextProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const committingRef = useRef(false);

  useEffect(() => {
    if (mode !== 'edit') return;
    if (multiline) {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    } else {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    }
  }, [mode, multiline]);

  const enterEdit = () => {
    setDraft(value);
    setMode('edit');
  };

  const finish = (resetDraft?: string) => {
    committingRef.current = true;
    if (resetDraft !== undefined) setDraft(resetDraft);
    setMode('view');
    queueMicrotask(() => {
      committingRef.current = false;
    });
  };

  const commit = async () => {
    if (committingRef.current) return;
    const trimmed = draft.trim();
    if (required && trimmed === '') {
      finish(value);
      return;
    }
    if (trimmed === value) {
      finish();
      return;
    }
    committingRef.current = true;
    setMode('view');
    try {
      await onSave(trimmed);
      committingRef.current = false;
    } catch {
      setMode('edit');
      committingRef.current = false;
    }
  };

  const cancel = () => {
    finish(value);
  };

  if (mode === 'view') {
    const trimmedValue = value.trim();
    const showPlaceholder = trimmedValue === '' && placeholder !== undefined;
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        className={cx(
          styles.view,
          showPlaceholder && styles.viewPlaceholder,
          className,
        )}
        onClick={enterEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            enterEdit();
          }
        }}
      >
        {showPlaceholder ? placeholder : value}
      </div>
    );
  }

  const onKeyDown = (
    e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
      return;
    }
    if (e.key === 'Enter') {
      if (multiline) {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          void commit();
        }
        return;
      }
      e.preventDefault();
      void commit();
    }
  };

  const onBlur = (
    e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const next = e.relatedTarget;
    if (
      wrapperRef.current &&
      next instanceof Node &&
      wrapperRef.current.contains(next)
    ) {
      return;
    }
    void commit();
  };

  const preventBlurSteal = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
  };

  return (
    <div className={styles.editWrapper} ref={wrapperRef}>
      {multiline ? (
        <textarea
          ref={textareaRef}
          className={cx(styles.textarea, className)}
          value={draft}
          aria-label={ariaLabel}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          rows={4}
        />
      ) : (
        <input
          ref={inputRef}
          type="text"
          className={cx(styles.input, className)}
          value={draft}
          aria-label={ariaLabel}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionButton}
          aria-label="Save"
          onMouseDown={preventBlurSteal}
          onClick={() => {
            void commit();
          }}
        >
          <Check size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.actionButton}
          aria-label="Cancel"
          onMouseDown={preventBlurSteal}
          onClick={cancel}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
