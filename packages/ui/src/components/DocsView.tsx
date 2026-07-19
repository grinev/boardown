import { Check, FilePlus, FolderPlus, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { docPageTitle, findDocPage } from '@boardown/core';
import { useDocRefSuggestions } from '../hooks/use-doc-ref-suggestions';
import { useBoardStore } from '../store';
import { CreateDocFolderDialog } from './CreateDocFolderDialog';
import { CreateDocPageDialog } from './CreateDocPageDialog';
import { DeleteDocDialog } from './DeleteDocDialog';
import { DocRefSuggestions } from './DocRefSuggestions';
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
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const suggestions = useDocRefSuggestions(bodyRef, draftBody, setDraftBody);

  const page = docs && selectedDocPath ? findDocPage(docs, selectedDocPath) : null;

  // A draft belongs to the page it was opened on: selecting another page (or
  // losing this one to a deletion) drops edit mode rather than carrying the text
  // across. A selection can also arrive from a doc link somewhere else on the
  // board, so the folders on the way to it are expanded — a selected page the
  // tree does not show would look like nothing happened.
  useEffect(() => {
    setEditing(false);
    if (selectedDocPath === null) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      let ancestor = selectedDocPath;
      let changed = false;
      while (ancestor.includes('/')) {
        ancestor = ancestor.slice(0, ancestor.lastIndexOf('/'));
        if (next.delete(ancestor)) changed = true;
      }
      return changed ? next : prev;
    });
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
              <>
                <textarea
                  ref={bodyRef}
                  className={styles.editor}
                  value={draftBody}
                  onChange={(e) => {
                    setDraftBody(e.target.value);
                    suggestions.sync();
                  }}
                  onSelect={suggestions.sync}
                  onKeyDown={(e) => suggestions.onKeyDown(e)}
                  // Picking a row keeps focus (the popup swallows mousedown), so
                  // a real blur means the caret is gone and the popup is stale.
                  onBlur={suggestions.close}
                  aria-label="Page content"
                  spellCheck={false}
                />
                <DocRefSuggestions suggestions={suggestions} />
              </>
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
