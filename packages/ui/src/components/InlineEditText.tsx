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
import { useAutoGrow } from '../hooks/use-auto-grow';
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
  // A hard stop on the field: typing past it does nothing and a longer paste is
  // cut. A value already over it opens in full and can only be shortened.
  maxLength?: number | undefined;
  // A failure that only the save could discover (the write itself). Shown in the
  // same slot, and only while `validate` is happy.
  error?: string | null;
  // Single-line only: offer the `[[` doc-page suggestions. Opt-in, because most
  // single-line fields (title, checklist item) render no links, so a reference
  // typed there would be dead text.
  docRefs?: boolean;
  // Put the Save / Cancel pair on the field's own row instead of a row below it.
  // Opt-in: it only pays off where the second row would cost the layout height,
  // which is the two dialog headers — everywhere else the field is multi-line or
  // sits in a dialog body with room to spare.
  actionsBesideField?: boolean;
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
  maxLength,
  error = null,
  docRefs = false,
  actionsBesideField = false,
}: InlineEditTextProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [draft, setDraft] = useState(value);
  // A failed save reports `error` about the text as it stands; the first
  // keystroke after that makes it history.
  const [staleError, setStaleError] = useState(false);
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const committingRef = useRef(false);
  // A failed save reopens the field with nobody having asked for it, so it is the
  // one way in that may land off screen — and the only one that still wants the
  // browser to scroll it back.
  const reopenedRef = useRef(false);
  // Always on for a multiline field, since every one of them renders links.
  const suggesting = multiline || docRefs;
  const suggestions = useDocRefSuggestions(fieldRef, draft, setDraft);
  useAutoGrow(fieldRef);
  // One ref for both branches, so the suggestion hook binds to whichever element
  // is rendered; a callback ref is what lets the two element types share it.
  const setField = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    fieldRef.current = el;
  };

  useEffect(() => {
    if (mode !== 'edit') return;
    const el = fieldRef.current;
    if (!el) return;
    // The field is normally opened by a click or a keypress on the block it
    // replaces, so it is already on screen — and a multiline one is now as tall
    // as its whole text, which the browser would "bring into view" by scrolling
    // everything above it out of it.
    el.focus({ preventScroll: !reopenedRef.current });
    reopenedRef.current = false;
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
      reopenedRef.current = true;
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

  // In the default layout it sits on the same row as the Save/Cancel buttons, in
  // the space they leave, so showing it never moves anything around it. Beside the
  // field the buttons take that room, and the message gets a row of its own.
  const message = validate?.(draft.trim()) ?? (staleError ? null : error);

  const messageNode = message !== null && (
    <p className={styles.error} role="alert">
      {message}
    </p>
  );

  const actions = (
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
  );

  const field = (
    <>
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
          maxLength={maxLength}
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
          maxLength={maxLength}
        />
      )}
    </>
  );

  if (actionsBesideField) {
    return (
      <div className={styles.editWrapper} ref={wrapperRef}>
        <div className={styles.fieldRow}>
          {field}
          {actions}
        </div>
        {suggesting && <DocRefSuggestions suggestions={suggestions} />}
        {messageNode}
      </div>
    );
  }

  return (
    <div className={styles.editWrapper} ref={wrapperRef}>
      {field}
      {suggesting && <DocRefSuggestions suggestions={suggestions} />}
      <div className={styles.footer}>
        {messageNode}
        {actions}
      </div>
    </div>
  );
}
