import { Check, X } from 'lucide-react';
import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useDocRefSuggestions } from '../hooks/use-doc-ref-suggestions';
import { DocRefSuggestions } from './DocRefSuggestions';
import styles from './InlineEditText.module.css';

interface InlineEditTextProps {
  value: string;
  onSave: (next: string) => Promise<void>;
  multiline?: boolean;
  required?: boolean;
  placeholder?: string;
  ariaLabel: string;
  className?: string | undefined;
  // The value belongs to a finished release: show it, never offer to edit it.
  readOnly?: boolean;
  // Custom view-mode rendering of a non-empty value; edit mode always shows raw text.
  renderView?: (value: string) => ReactNode;
  // Checked on every keystroke: a message means the value cannot be saved, so the
  // field reports it while typing and refuses to commit.
  validate?: (value: string) => string | null;
  // A failure that only the save could discover (the write itself). Shown in the
  // same slot, and only while `validate` is happy.
  error?: string | null;
  // Single-line only: offer the `[[` doc-page suggestions. Opt-in, because most
  // single-line fields (title, checklist item) render no links, so a reference
  // typed there would be dead text.
  docRefs?: boolean;
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
  readOnly = false,
  renderView,
  validate,
  error = null,
  docRefs = false,
}: InlineEditTextProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [draft, setDraft] = useState(value);
  // A failed save reports `error` about the text as it stands; the first
  // keystroke after that makes it history.
  const [staleError, setStaleError] = useState(false);
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const committingRef = useRef(false);
  // Always on for a multiline field, since every one of them renders links.
  const suggesting = multiline || docRefs;
  const suggestions = useDocRefSuggestions(fieldRef, draft, setDraft);
  // One ref for both branches, so the suggestion hook binds to whichever element
  // is rendered; a callback ref is what lets the two element types share it.
  const setField = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    fieldRef.current = el;
  };

  useEffect(() => {
    if (mode !== 'edit') return;
    const el = fieldRef.current;
    if (!el) return;
    el.focus();
    if (multiline) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    } else {
      el.select();
    }
  }, [mode, multiline]);

  const enterEdit = () => {
    setDraft(value);
    setStaleError(true);
    setMode('edit');
  };

  // Any keystroke moves the text past what the failed save was about.
  const edit = (next: string) => {
    setDraft(next);
    setStaleError(true);
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
    // Stay in edit mode with the message showing: there is nothing to save.
    if (validate?.(trimmed) != null) return;
    committingRef.current = true;
    setMode('view');
    try {
      await onSave(trimmed);
      committingRef.current = false;
    } catch {
      setMode('edit');
      setStaleError(false);
      committingRef.current = false;
    }
  };

  const cancel = () => {
    finish(value);
  };

  if (readOnly || mode === 'view') {
    const trimmedValue = value.trim();
    const showPlaceholder = trimmedValue === '' && placeholder !== undefined;
    if (readOnly) {
      return (
        <div
          className={cx(
            styles.readOnly,
            showPlaceholder && styles.viewPlaceholder,
            className,
          )}
        >
          {showPlaceholder ? placeholder : (renderView?.(value) ?? value)}
        </div>
      );
    }
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
        {showPlaceholder ? placeholder : (renderView?.(value) ?? value)}
      </div>
    );
  }

  const onKeyDown = (
    e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (suggesting && suggestions.onKeyDown(e)) {
      return;
    }
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
    suggestions.close();
    void commit();
  };

  const preventBlurSteal = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
  };

  // Sits on the same row as the Save/Cancel buttons, in the space they leave, so
  // showing it never moves anything around it.
  const message = validate?.(draft.trim()) ?? (staleError ? null : error);

  return (
    <div className={styles.editWrapper} ref={wrapperRef}>
      {multiline ? (
        <textarea
          ref={setField}
          className={cx(styles.textarea, className)}
          value={draft}
          aria-label={ariaLabel}
          onChange={(e) => {
            edit(e.target.value);
            suggestions.sync();
          }}
          onSelect={suggestions.sync}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          rows={4}
        />
      ) : (
        <input
          ref={setField}
          type="text"
          className={cx(styles.input, className)}
          value={draft}
          aria-label={ariaLabel}
          onChange={(e) => {
            edit(e.target.value);
            if (suggesting) suggestions.sync();
          }}
          onSelect={suggesting ? suggestions.sync : undefined}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
      )}
      {suggesting && <DocRefSuggestions suggestions={suggestions} />}
      <div className={styles.footer}>
        {message !== null && (
          <p className={styles.error} role="alert">
            {message}
          </p>
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
    </div>
  );
}
