import { FileCode2, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { createLogger, projectFileName, type ProjectFileRead } from '@boardown/core';
import { useBoardStore } from '../store';
import { DialogBackButton } from './DialogBackButton';
import { MarkdownContent } from './MarkdownContent';
import { Modal } from './Modal';
import { splitUrls } from '../utils/urls';
import styles from './RepoFilePopupDialog.module.css';

const log = createLogger('ui.repo-file');

// Which of the two panes a file gets, and so also whether the plain pane's URL
// scan is worth running at all.
const isMarkdownFile = (path: string): boolean =>
  projectFileName(path).toLowerCase().endsWith('.md');

const MESSAGES: Record<Exclude<ProjectFileRead['kind'], 'text'>, string> = {
  binary: 'Unsupported file format',
  'too-large': 'File is too large to preview',
  'not-found': 'File not found',
  unreadable: 'Could not read file',
};

export function RepoFilePopupDialog() {
  const path = useBoardStore((s) => s.repoFilePopupPath);
  const projectFiles = useBoardStore((s) => s.projectFiles);
  const close = useBoardStore((s) => s.closeRepoFilePopup);
  const [result, setResult] = useState<ProjectFileRead | null>(null);

  useEffect(() => {
    if (path === null) return;
    let current = true;
    setResult(null);
    const run = async (): Promise<ProjectFileRead> => {
      if (projectFiles === null) return { kind: 'unreadable' };
      try {
        return await projectFiles.readFile(path);
      } catch (err) {
        // The failure is shown in the popup and never reaches errorMessage, so
        // this is the only record of it in the run's log.
        log.error(`read ${path} failed: ${err instanceof Error ? err.message : String(err)}`);
        return { kind: 'unreadable' };
      }
    };
    void run().then((next) => {
      if (current) setResult(next);
    });
    return () => {
      current = false;
    };
  }, [path, projectFiles]);

  // Only URLs, so the file's own task ids and `[[…]]` tokens stay literal — it is
  // repo content, not board text. Memoised because the preview can be a megabyte,
  // and skipped entirely for a markdown file, which renders through the other pane.
  const plainPieces = useMemo(() => {
    if (result?.kind !== 'text' || path === null || isMarkdownFile(path)) return [];
    return splitUrls(result.text);
  }, [result, path]);

  if (path === null) return null;

  const name = projectFileName(path);

  return (
    <Modal open onClose={close} ariaLabel={`File ${path}`}>
      <header className={styles.header}>
        <div className={styles.headerName}>
          <FileCode2 className={styles.headerIcon} aria-hidden="true" />
          <div className={styles.headerText}>
            <div className={styles.titleRow}>
              <div className={styles.titleText}>{name}</div>
              <DialogBackButton />
            </div>
            <div className={styles.pathText}>{path}</div>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close"
            onClick={close}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className={styles.body}>
        {result === null && <p className={styles.message}>Loading…</p>}
        {result !== null && result.kind !== 'text' && (
          <p className={styles.message}>{MESSAGES[result.kind]}</p>
        )}
        {result?.kind === 'text' &&
          (isMarkdownFile(path) ? (
            // No onDocRefClick: a file from the repo is not board text, so its
            // task ids and [[…]] tokens stay literal.
            <MarkdownContent source={result.text} />
          ) : (
            <pre className={styles.plain}>
              {plainPieces.map((piece, i) =>
                piece.kind === 'text' ? (
                  <Fragment key={i}>{piece.text}</Fragment>
                ) : (
                  <a
                    key={i}
                    className={styles.externalLink}
                    href={piece.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {piece.url}
                  </a>
                ),
              )}
            </pre>
          ))}
      </div>
    </Modal>
  );
}
