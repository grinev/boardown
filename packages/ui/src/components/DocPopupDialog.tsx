import { ExternalLink, FileText, X } from 'lucide-react';
import { docPageTitle, findDocPage } from '@boardown/core';
import { useBoardStore } from '../store';
import { MarkdownContent } from './MarkdownContent';
import { Modal } from './Modal';
import styles from './DocPopupDialog.module.css';

export function DocPopupDialog() {
  const docs = useBoardStore((s) => s.snapshot?.docs ?? null);
  const docPopupPath = useBoardStore((s) => s.docPopupPath);
  const closeDocPopup = useBoardStore((s) => s.closeDocPopup);
  const openDocPopup = useBoardStore((s) => s.openDocPopup);
  const openDocPage = useBoardStore((s) => s.openDocPage);

  const page = docs && docPopupPath ? findDocPage(docs, docPopupPath) : null;
  if (!page) return null;

  const title = docPageTitle(page);

  return (
    <Modal open onClose={closeDocPopup} ariaLabel={`Document ${title}`}>
      <header className={styles.header}>
        <div className={styles.headerName}>
          <FileText className={styles.headerIcon} aria-hidden="true" />
          <span className={styles.titleText}>{title}</span>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.viewButton}
            onClick={() => openDocPage(page.path)}
          >
            <ExternalLink size={14} aria-hidden="true" />
            View in docs
          </button>
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
        <MarkdownContent source={page.body} onDocRefClick={openDocPopup} />
      </div>
    </Modal>
  );
}
