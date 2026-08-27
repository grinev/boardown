import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '@boardown/core';

const log = createLogger('ui.clipboard');

const CONFIRM_MS = 1500;

// Puts text on the clipboard and reports, for a moment, that it landed. Shared
// rather than repeated because everything that can go wrong here goes wrong
// invisibly: a copy that silently fails, a confirmation that never resets, a
// timer left running on a closed dialog.
//
// A failure is never surfaced — the clipboard is missing outside a secure
// context, and there is nothing the user could do about it either way — so the
// log is the only trace either path leaves.
interface Clipboard {
  copied: boolean;
  copy: (text: string) => void;
  // Takes the confirmation down early, for a caller whose button outlives what it
  // last copied — a dialog reused for the next task must not open still showing a
  // checkmark. Stable, so it can be an effect's whole body.
  reset: () => void;
}

export const useCopyToClipboard = (): Clipboard => {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reset = useCallback((): void => {
    clearTimeout(resetTimer.current);
    setCopied(false);
  }, []);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const copy = useCallback((text: string): void => {
    const { clipboard } = navigator;
    if (!clipboard) {
      log.debug('clipboard unavailable, copy skipped');
      return;
    }
    void clipboard.writeText(text).then(
      () => {
        setCopied(true);
        clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => setCopied(false), CONFIRM_MS);
      },
      (error: unknown) => {
        log.error('clipboard write refused', error);
      },
    );
  }, []);

  return { copied, copy, reset };
};
