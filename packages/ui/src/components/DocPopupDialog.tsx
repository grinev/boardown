import { ExternalLink, FileText, X } from 'lucide-react';
import { docPageTitle, findDocPage } from '@boardown/core';
import { docPathLabel } from '../docs-state';
import { useDocPage } from '../hooks/use-docs';
import { useBoardStore } from '../store';
import { DialogBackButton } from './DialogBackButton';
import { MarkdownContent } from './MarkdownContent';
import { Modal } from './Modal';
import styles from './DocPopupDialog.module.css';

export function DocPopupDialog() {
  const docPopupPath = useBoardStore((s) => s.docPopupPath);
  const metadata = useBoardStore((s) =>
    docPopupPath !== null && s.docsTree.kind === 'ready'
      ? findDocPage(s.docsTree.tree, docPopupPath)
      : null,
  );
  const result = useDocPage(docPopupPath);
  const loadDocPage = useBoardStore((s) => s.loadDocPage);
  const closeDocPopup = useBoardStore((s) => s.closeDocPopup);
  const openDocPopup = useBoardStore((s) => s.openDocPopup);
  const openDocPage = useBoardStore((s) => s.openDocPage);
  const docsTab = useBoardStore((s) => s.snapshot?.config.docsTab ?? true);

  if (docPopupPath === null) return null;
  const page = result?.kind === 'ready' ? result.value : null;
  const known = page ?? metadata;
  const title = known === null ? docPathLabel(docPopupPath) : docPageTitle(known);

  return (
    <Modal open onClose={closeDocPopup} ariaLabel={`Document ${title}`}>
      <header className={styles.header}>
        <div className={styles.headerName}>
          <FileText className={styles.headerIcon} aria-hidden="true" />
          <span className={styles.titleText}>{title}</span>
          <DialogBackButton />
        </div>
        <div className={styles.headerActions}>
          {docsTab && page !== null && (
            <button
              type="button"
              className={styles.viewButton}
              onClick={() => openDocPage(page.path)}
            >
              <ExternalLink size={14} aria-hidden="true" />
              View in docs
            </button>
          )}
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close"
            onClick={closeDocPopup}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className={styles.body}>
        {page !== null ? (
          <MarkdownContent source={page.body} onDocRefClick={openDocPopup} />
        ) : result?.kind === 'missing' ? (
          <p>Page not found.</p>
        ) : result?.kind === 'error' ? (
          <>
            <p role="alert">{result.problem.message}</p>
            <button type="button" onClick={() => void loadDocPage(docPopupPath, true)}>Retry</button>
          </>
        ) : (
          <p role="status">Loading page…</p>
        )}
      </div>
    </Modal>
  );
}
