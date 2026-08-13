import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styles from './CliHint.module.css';

const INSTALL_COMMAND = 'npm i -g @grinev/boardown-cli';
const DOCS_URL = 'https://github.com/grinev/boardown/tree/main/packages/cli';

interface CliHintProps {
  className?: string | undefined;
}

// The body of the Settings "CLI" row: why the CLI is worth installing, then the
// command that installs it. Heading-less on purpose — the shared dialog and the
// Electron sidebar label it in their own styles, which use different palettes.
export function CliHint({ className }: CliHintProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const copy = (): void => {
    // Undefined outside a secure context; the command stays selectable by hand,
    // so a failure here costs the user nothing.
    void navigator.clipboard?.writeText(INSTALL_COMMAND).then(
      () => {
        setCopied(true);
        clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };

  return (
    <div className={className}>
      <p className={styles.description}>
        Install the CLI so AI agents can work with your board.{' '}
        <a className={styles.link} href={DOCS_URL} target="_blank" rel="noopener noreferrer">
          Learn more
        </a>
      </p>
      <div className={styles.commandRow}>
        <code className={styles.command}>{INSTALL_COMMAND}</code>
        <button
          type="button"
          className={styles.copyButton}
          onClick={copy}
          aria-label={copied ? 'Install command copied' : 'Copy install command'}
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
