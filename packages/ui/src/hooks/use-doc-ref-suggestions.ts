import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { docRefCandidates, type DocRefCandidate } from '@boardown/core';
import { useBoardStore } from '../store';
import { caretPoint, type CaretPoint } from '../utils/caret-position';
import { findOpenDocRefToken, type OpenDocRefToken } from '../utils/doc-ref-token';

// Same cap as the linked-tasks search: a suggestion list is a shortlist.
const MAX_SUGGESTIONS = 8;

export interface DocRefSuggestions {
  open: boolean;
  items: DocRefCandidate[];
  activeIndex: number;
  point: CaretPoint | null;
  // Where the popup is portalled. A dialog opened with `showModal()` lives in the
  // browser's top layer, which wins hit-testing against anything outside it no
  // matter the z-index — so a popup over a dialog has to be *inside* that dialog
  // to stay clickable. Neither placement is clipped by the dialog's overflow,
  // since the popup is positioned against the window.
  container: HTMLElement | null;
  // Recompute after anything that can move the caret or change the text.
  sync: () => void;
  close: () => void;
  accept: (index: number) => void;
  // Returns true when the popup consumed the key, so the host leaves it alone.
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
}

export const useDocRefSuggestions = (
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (next: string) => void,
): DocRefSuggestions => {
  const docs = useBoardStore((s) => s.snapshot?.docs ?? null);
  const [token, setToken] = useState<OpenDocRefToken | null>(null);
  const [point, setPoint] = useState<CaretPoint | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const pendingCaret = useRef<number | null>(null);

  const candidates = useMemo(() => (docs ? docRefCandidates(docs) : []), [docs]);

  const items = useMemo(() => {
    if (token === null) return [];
    const needle = token.query.trim().toLowerCase();
    const matched =
      needle === ''
        ? candidates
        : candidates.filter(
            (c) =>
              c.title.toLowerCase().includes(needle) ||
              c.token.toLowerCase().includes(needle),
          );
    return matched.slice(0, MAX_SUGGESTIONS);
  }, [token, candidates]);

  useEffect(() => {
    setActiveIndex(0);
  }, [token?.query]);

  // An accepted suggestion rewrites the text, so the caret can only be restored
  // once React has flushed the new value into the textarea.
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null) return;
    pendingCaret.current = null;
    const el = textareaRef.current;
    if (el === null) return;
    el.focus();
    el.setSelectionRange(caret, caret);
  }, [value, textareaRef]);

  const close = useCallback(() => {
    setToken(null);
    setPoint(null);
    setContainer(null);
  }, []);

  const sync = useCallback(() => {
    const el = textareaRef.current;
    if (el === null) return;
    const next = findOpenDocRefToken(el.value, el.selectionStart);
    setToken(next);
    setPoint(next === null ? null : caretPoint(el, el.selectionStart));
    setContainer(next === null ? null : (el.closest('dialog') ?? document.body));
  }, [textareaRef]);

  const accept = useCallback(
    (index: number) => {
      const el = textareaRef.current;
      const item = items[index];
      if (el === null || token === null || item === undefined) return;
      const caret = el.selectionStart;
      setValue(
        `${value.slice(0, token.start)}[[${item.token}]]${value.slice(caret)}`,
      );
      pendingCaret.current = token.start + item.token.length + 4;
      close();
    },
    [textareaRef, items, token, value, setValue, close],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (token === null) return false;
      if (e.key === 'Escape') {
        // Consumed, so the host's cancel does not also fire: dismissing a
        // suggestion list must not throw away the whole edit.
        e.preventDefault();
        e.stopPropagation();
        close();
        return true;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (items.length === 0) return false;
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : items.length - 1;
        setActiveIndex((i) => (i + step) % items.length);
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (items.length > 0) accept(activeIndex);
        else close();
        return true;
      }
      return false;
    },
    [token, items, activeIndex, accept, close],
  );

  return {
    open: token !== null,
    items,
    activeIndex,
    point,
    container,
    sync,
    close,
    accept,
    onKeyDown,
  };
};
