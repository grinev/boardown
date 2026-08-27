import { Check, Copy } from 'lucide-react';
import { useCopyToClipboard } from '../hooks/use-copy-to-clipboard';
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
  // A copy can fail outside a secure context; the command stays selectable by
  // hand, so that costs the user nothing.
  const { copied, copy } = useCopyToClipboard();

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
          onClick={() => copy(INSTALL_COMMAND)}
          aria-label={copied ? 'Install command copied' : 'Copy install command'}
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
