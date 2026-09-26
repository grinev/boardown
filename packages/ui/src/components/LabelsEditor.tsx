import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { LABEL_MAX_LENGTH, addLabels } from '@boardown/core';
import { defaultHighlight, labelSuggestions, splitLabelText } from '../utils/label-editor';
import { LabelChip } from './LabelChip';
import styles from './LabelsEditor.module.css';

interface LabelsEditorProps {
  labels: readonly string[];
  registry: readonly string[];
  onChange: (labels: string[]) => void;
  // Given, every Escape is the caller's, list open or not; absent, the first one
  // closes the list and the next goes on to the dialog as if the field were not
  // there.
  onEscape?: (() => void) | undefined;
  // Typed text that was never added is dropped with it.
  onBlur?: (() => void) | undefined;
  autoFocus?: boolean;
  ariaLabel: string;
  className?: string | undefined;
}

const HAS_WHITESPACE = /\s/;

export function LabelsEditor({
  labels,
  registry,
  onChange,
  onEscape,
  onBlur,
  autoFocus = false,
  ariaLabel,
  className,
}: LabelsEditorProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // `null` until an arrow key moves it: the default follows the typed text.
  const [picked, setPicked] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const optionIdPrefix = useId();

  const suggestions = useMemo(
    () => labelSuggestions(registry, labels, text),
    [registry, labels, text],
  );
  const listShowing = focused && !dismissed && suggestions.length > 0;
  const activeIndex = !listShowing
    ? null
    : picked !== null && picked < suggestions.length
      ? picked
      : defaultHighlight(suggestions, text);

  // Typing is what resets the highlight and brings a dismissed list back — not the
  // suggestions changing, which a refresh does without the user doing anything.
  useEffect(() => {
    setPicked(null);
    setDismissed(false);
  }, [text]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // At the foot of a scrolling form the list would open past its edge.
  useEffect(() => {
    if (listShowing) listRef.current?.scrollIntoView({ block: 'nearest' });
  }, [listShowing, suggestions.length]);

  useEffect(() => {
    const list = listRef.current;
    const option = activeIndex === null ? null : list?.children[activeIndex];
    if (!list || !(option instanceof HTMLElement)) return;
    const bottom = option.offsetTop + option.offsetHeight;
    if (option.offsetTop < list.scrollTop) {
      list.scrollTop = option.offsetTop;
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [activeIndex]);

  const add = (words: readonly string[]) => {
    setText('');
    setPicked(null);
    setDismissed(false);
    if (words.length === 0) return;
    const next = addLabels(labels, words, registry);
    if (next.length !== labels.length) onChange(next);
  };

  const remove = (label: string) => {
    onChange(labels.filter((l) => l !== label));
    inputRef.current?.focus();
  };

  // Escape is caught twice, as in Linked tasks: on the keydown, and on the
  // dialog's `cancel`, which some browsers raise on their own. The ref keeps one
  // keystroke from being spent twice.
  const escapeHandledRef = useRef(false);
  const backOutOneStage = (): boolean => {
    if (onEscape) {
      onEscape();
      return true;
    }
    if (listShowing) {
      setDismissed(true);
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!focused) return;
    const handler = (event: Event) => {
      if (document.activeElement !== inputRef.current) return;
      if (escapeHandledRef.current) {
        escapeHandledRef.current = false;
        event.preventDefault();
        return;
      }
      if (backOutOneStage()) event.preventDefault();
    };
    window.addEventListener('cancel', handler, true);
    return () => window.removeEventListener('cancel', handler, true);
    // backOutOneStage is rebuilt every render and closes over the state below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, listShowing, onEscape]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      escapeHandledRef.current = backOutOneStage();
      if (escapeHandledRef.current) e.preventDefault();
      return;
    }
    escapeHandledRef.current = false;
    // Mid-composition keys belong to the input method, not to the editor.
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      // A plain Enter never submits the form around the field; the Cmd/Ctrl combo
      // is left for the creation dialog's own shortcut.
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      const row = activeIndex === null ? undefined : suggestions[activeIndex];
      if (row) add([row.label]);
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      add(text === '' ? [] : [text]);
      return;
    }
    if (e.key === 'Backspace' && text === '' && labels.length > 0) {
      e.preventDefault();
      onChange(labels.slice(0, -1));
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!listShowing) {
        setDismissed(false);
        return;
      }
      const count = suggestions.length;
      if (e.key === 'ArrowDown') {
        setPicked(activeIndex === null ? 0 : (activeIndex + 1) % count);
      } else {
        setPicked(activeIndex === null ? count - 1 : (activeIndex - 1 + count) % count);
      }
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!HAS_WHITESPACE.test(pasted)) return;
    e.preventDefault();
    const input = e.currentTarget;
    const start = input.selectionStart ?? text.length;
    const end = input.selectionEnd ?? text.length;
    add(splitLabelText(text.slice(0, start) + pasted + text.slice(end)));
  };

  return (
    <div
      className={`${styles.editor} ${className ?? ''}`}
      // A press anywhere in the box that is not a control lands in the input.
      onMouseDown={(e) => {
        if (e.target === inputRef.current) return;
        e.preventDefault();
        inputRef.current?.focus();
      }}
    >
      {labels.map((label) => (
        <LabelChip key={label} label={label} onRemove={() => remove(label)} />
      ))}
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        value={text}
        maxLength={LABEL_MAX_LENGTH}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={listShowing}
        aria-controls={listShowing ? listId : undefined}
        aria-activedescendant={
          activeIndex === null ? undefined : `${optionIdPrefix}-${activeIndex}`
        }
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          const value = e.target.value;
          if (HAS_WHITESPACE.test(value)) add(splitLabelText(value));
          else setText(value);
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText('');
          onBlur?.();
        }}
      />
      {listShowing && (
        <ul
          ref={listRef}
          id={listId}
          className={styles.suggestions}
          role="listbox"
          aria-label="Label suggestions"
        >
          {suggestions.map((row, index) => (
            <li
              key={`${row.isNew ? 'new' : 'known'}:${row.label}`}
              id={`${optionIdPrefix}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={
                `${styles.suggestion}` +
                (index === activeIndex ? ` ${styles.suggestionHighlighted}` : '')
              }
              onMouseEnter={() => setPicked(index)}
              onMouseDown={(e) => {
                // Keeps the click from blurring the field before it adds.
                e.preventDefault();
                e.stopPropagation();
                if (e.button === 0) add([row.label]);
              }}
            >
              <LabelChip label={row.label} />
              {row.isNew && <span className={styles.newHint}>(New label)</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
