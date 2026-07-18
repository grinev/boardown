import { Check, FilePlus, FolderPlus, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { docPageTitle, findDocPage } from '@boardown/core';
import { useBoardStore } from '../store';
import { CreateDocFolderDialog } from './CreateDocFolderDialog';
import { CreateDocPageDialog } from './CreateDocPageDialog';
import { DeleteDocDialog } from './DeleteDocDialog';
import { DocTree } from './DocTree';
import { MarkdownContent } from './MarkdownContent';
import styles from './DocsView.module.css';

export function DocsView() {
  const docs = useBoardStore((s) => s.snapshot?.docs ?? null);
  const selectedDocPath = useBoardStore((s) => s.selectedDocPath);
  const selectDoc = useBoardStore((s) => s.selectDoc);
  const openCreateDocPage = useBoardStore((s) => s.openCreateDocPage);
  const openCreateDocFolder = useBoardStore((s) => s.openCreateDocFolder);
  const openDeleteDoc = useBoardStore((s) => s.openDeleteDoc);
  const saveDocPage = useBoardStore((s) => s.saveDocPage);

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');

  const page = docs && selectedDocPath ? findDocPage(docs, selectedDocPath) : null;

  // A draft belongs to the page it was opened on: selecting another page (or
  // losing this one to a deletion) drops edit mode rather than carrying the text
  // across.
  useEffect(() => {
    setEditing(false);
  }, [selectedDocPath]);

  if (!docs) return null;

  const isEmpty = docs.folders.length === 0 && docs.pages.length === 0;

  const toggleCollapsed = (path: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const startEditing = (): void => {
    if (!page) return;
    setDraftTitle(docPageTitle(page));
    setDraftBody(page.body);
    setEditing(true);
  };

  const commit = async (): Promise<void> => {
    if (!page) return;
    setEditing(false);
    const title = draftTitle.trim();
    // An emptied title reverts rather than writing a nameless page.
    const nextTitle = title === '' ? docPageTitle(page) : title;
    if (nextTitle === docPageTitle(page) && draftBody === page.body) return;
    try {
      await saveDocPage(page.path, nextTitle, draftBody);
    } catch {
      // The store surfaced the failure and restored the snapshot.
    }
  };

  return (
    <div className={styles.layout}>
      <aside className={styles.pane} data-testid="docs-tree">
        <div className={styles.paneHeader}>
          <h2 className={styles.paneTitle}>Pages</h2>
          <div className={styles.paneActions}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={openCreateDocFolder}
              aria-label="New folder"
            >
              <FolderPlus size={16} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={openCreateDocPage}
              aria-label="New page"
            >
              <FilePlus size={16} />
            </button>
          </div>
        </div>
        <div className={styles.tree}>
          <DocTree
            folder={docs}
            depth={0}
            selectedPath={selectedDocPath}
            collapsed={collapsed}
            onToggle={toggleCollapsed}
            onSelect={selectDoc}
            onDelete={openDeleteDoc}
          />
        </div>
      </aside>

      <section className={styles.content}>
        {isEmpty ? (
          <div className={styles.placeholder}>
            <p>No pages yet.</p>
            <button type="button" className={styles.primary} onClick={openCreateDocPage}>
              Create the first page
            </button>
          </div>
        ) : !page ? (
          <div className={styles.placeholder}>
            <p className={styles.hint}>Select a page to read it.</p>
          </div>
        ) : (
          <>
            <header className={styles.contentHeader}>
              {editing ? (
                <input
                  className={styles.titleInput}
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  aria-label="Page title"
                />
              ) : (
                <h2 className={styles.title}>{docPageTitle(page)}</h2>
              )}
              <button
                type="button"
                className={styles.iconButton}
                onClick={editing ? () => void commit() : startEditing}
                aria-label={editing ? 'Done' : 'Edit'}
              >
                {editing ? <Check size={16} /> : <Pencil size={16} />}
              </button>
            </header>
            {editing ? (
              <textarea
                className={styles.editor}
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                aria-label="Page content"
                spellCheck={false}
              />
            ) : (
              <MarkdownContent source={page.body} />
            )}
          </>
        )}
      </section>

      <CreateDocPageDialog />
      <CreateDocFolderDialog />
      <DeleteDocDialog />
    </div>
  );
}
